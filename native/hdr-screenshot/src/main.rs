use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use aw_next_hdr_screenshot::AnyError;
use aw_next_hdr_screenshot::display::*;
use aw_next_hdr_screenshot::tone::*;
use half::f16;
use png::{BitDepth, ColorType, DeflateCompression, Encoder, SrgbRenderingIntent};
use windows::Win32::Devices::Display::DISPLAYCONFIG_PATH_INFO;
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, HMONITOR, MONITORINFOEXW};
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};

// A screenshot is opaque, so the alpha channel only ever holds 255. Dropping it takes a
// quarter off both the canvas and the encoded file.
struct Canvas {
    width: u32,
    height: u32,
    rgb: Vec<u8>,
}

impl Canvas {
    fn new(width: u32, height: u32) -> Result<Self, AnyError> {
        let byte_len = usize::try_from(width)?
            .checked_mul(usize::try_from(height)?)
            .and_then(|pixels| pixels.checked_mul(3))
            .ok_or("The primary display is too large to capture")?;
        Ok(Self {
            width,
            height,
            rgb: vec![0; byte_len],
        })
    }
}

// HDR desktops are captured in FP16 and tone-mapped; SDR ones are copied as the 8-bit frame they are.
#[derive(Clone, Copy, PartialEq)]
enum CaptureMode {
    Hdr,
    Sdr,
}

#[derive(Clone)]
struct CaptureFlags {
    canvas: Arc<Mutex<Canvas>>,
    white_scale: f32,
    mode: CaptureMode,
}

struct SnapshotCapture {
    flags: CaptureFlags,
    complete: bool,
}

impl GraphicsCaptureApiHandler for SnapshotCapture {
    type Flags = CaptureFlags;
    type Error = AnyError;

    fn new(context: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            flags: context.flags,
            complete: false,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.complete {
            capture_control.stop();
            return Ok(());
        }

        let width = frame.width();
        let height = frame.height();
        let frame_buffer = frame.buffer()?;
        let expected_format = match self.flags.mode {
            CaptureMode::Hdr => ColorFormat::Rgba16F,
            CaptureMode::Sdr => ColorFormat::Rgba8,
        };
        if frame_buffer.color_format() != expected_format {
            return Err("Windows Graphics Capture returned another pixel format".into());
        }

        let mut unpadded = Vec::new();
        let raw = frame_buffer.as_nopadding_buffer(&mut unpadded);
        let mut canvas = self
            .flags
            .canvas
            .lock()
            .map_err(|_| "Screenshot canvas lock was poisoned")?;
        if self.flags.mode == CaptureMode::Sdr {
            copy_rgba8_frame(raw, width, height, &mut canvas)?;
        } else {
            let white_scale = self.flags.white_scale;
            let scene_peak = estimate_scene_peak(raw, width, height, white_scale);
            tone_map_frame(raw, width, height, scene_peak, white_scale, &mut canvas)?;
        }

        self.complete = true;
        capture_control.stop();
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        if self.complete {
            Ok(())
        } else {
            Err("Capture source closed before the first frame arrived".into())
        }
    }
}

// Windows reports the HDR toggle through DisplayConfig, not through DXGI. IDXGIOutput6::GetDesc1
// keeps returning the SDR color space while the desktop composes in HDR, so the toggle has to be
// read from the display path that drives the primary monitor.
fn primary_device_name(primary: Monitor) -> Result<Vec<u16>, AnyError> {
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
    let handle = HMONITOR(primary.as_raw_hmonitor());
    unsafe { GetMonitorInfoW(handle, &mut info.monitorInfo).ok()? };
    Ok(info.szDevice.to_vec())
}

fn primary_path(primary: Monitor) -> Result<DISPLAYCONFIG_PATH_INFO, AnyError> {
    let primary_name = primary_device_name(primary)?;

    for path in active_display_paths()? {
        match path_source_name(&path) {
            Some(name) if name == primary_name => return Ok(path),
            _ => continue,
        }
    }

    Err("The primary display was not found through DisplayConfig".into())
}

fn primary_hdr_active(primary: Monitor) -> Result<bool, AnyError> {
    path_hdr_enabled(&primary_path(primary)?)
}

fn read_half(raw: &[u8], offset: usize) -> f32 {
    let bits = u16::from_le_bytes([raw[offset], raw[offset + 1]]);
    let value = f16::from_bits(bits).to_f32();
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

fn pixel_peak_bits(pixel: &[u8]) -> u16 {
    let mut best = 0_u16;
    for channel in 0..3 {
        let bits = u16::from_le_bytes([pixel[channel * 2], pixel[channel * 2 + 1]]);
        if bits < HALF_INFINITY && bits > best {
            best = bits;
        }
    }
    best
}

// Percentile of the second-brightest pixel in each 2x2 block, not the raw max: a lone firefly loses
// to its neighbours and cannot darken the whole capture, while a real bright surface still counts.
const PEAK_PERCENTILE: f64 = 0.9999;

fn second_largest(a: u16, b: u16, c: u16, d: u16) -> u16 {
    let (hi1, lo1) = if a >= b { (a, b) } else { (b, a) };
    let (hi2, lo2) = if c >= d { (c, d) } else { (d, c) };
    if hi1 >= hi2 {
        hi2.max(lo1)
    } else {
        hi1.max(lo2)
    }
}

fn estimate_scene_peak(raw: &[u8], width: u32, height: u32, white_scale: f32) -> f32 {
    let mut histogram = vec![0_u32; HALF_INFINITY as usize];
    let mut samples = 0_u64;
    let stride = width as usize * 8;
    let (columns, rows) = (width as usize, height as usize);

    if columns >= 2 && rows >= 2 {
        for y in (0..rows - 1).step_by(2) {
            let (top, bottom) = (y * stride, (y + 1) * stride);
            for x in (0..columns - 1).step_by(2) {
                let (left, right) = (x * 8, (x + 1) * 8);
                let bits = second_largest(
                    pixel_peak_bits(&raw[top + left..]),
                    pixel_peak_bits(&raw[top + right..]),
                    pixel_peak_bits(&raw[bottom + left..]),
                    pixel_peak_bits(&raw[bottom + right..]),
                );
                if bits != 0 {
                    histogram[bits as usize] += 1;
                    samples += 1;
                }
            }
        }
    }

    if samples == 0 {
        return 1.0;
    }

    let target = ((samples as f64) * PEAK_PERCENTILE).ceil() as u64;
    let mut seen = 0_u64;
    for (bits, count) in histogram.into_iter().enumerate() {
        seen += u64::from(count);
        if seen >= target {
            let value = f16::from_bits(bits as u16).to_f32() / white_scale;
            return value.max(1.0).min(rel_from_pq(1.0));
        }
    }
    1.0
}

// 8x8 ordered dither. Compressing several stops of highlight into the top few sRGB codes leaves
// wide flat steps, which read as banding on a sky or a glow; a sub-code offset breaks them up
// without shifting the average.
const BAYER_8X8: [[u8; 8]; 8] = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
];

fn dither_offset(x: u32, y: u32) -> f32 {
    let cell = BAYER_8X8[(y % 8) as usize][(x % 8) as usize] as f32;
    (cell + 0.5) / 64.0 - 0.5
}

fn linear_to_srgb_dithered(value: f32, dither: f32) -> u8 {
    let value = value.clamp(0.0, 1.0);
    let encoded = if value <= 0.003_130_8 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0 + dither).round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
fn linear_to_srgb(value: f32) -> u8 {
    linear_to_srgb_dithered(value, 0.0)
}

fn tone_map_frame(
    raw: &[u8],
    width: u32,
    height: u32,
    scene_peak: f32,
    white_scale: f32,
    canvas: &mut Canvas,
) -> Result<(), AnyError> {
    let expected = usize::try_from(width)?
        .checked_mul(usize::try_from(height)?)
        .and_then(|pixels| pixels.checked_mul(8))
        .ok_or("Captured FP16 frame is too large")?;
    if raw.len() < expected {
        return Err("Captured FP16 frame buffer is incomplete".into());
    }

    let copy_width = width.min(canvas.width);
    let copy_height = height.min(canvas.height);
    let tables = PixelTables::new(scene_peak, white_scale);

    for y in 0..copy_height {
        for x in 0..copy_width {
            let source = ((y * width + x) * 8) as usize;
            let destination = ((y * canvas.width + x) * 3) as usize;
            let bits = pixel_peak_bits(&raw[source..]) as usize;
            let scale = tables.scale[bits];
            let mapped = desaturate_highlight(
                [
                    read_half(raw, source) * scale,
                    read_half(raw, source + 2) * scale,
                    read_half(raw, source + 4) * scale,
                ],
                tables.blend[bits],
            );
            let dither = dither_offset(x, y);

            canvas.rgb[destination] = linear_to_srgb_dithered(mapped[0], dither);
            canvas.rgb[destination + 1] = linear_to_srgb_dithered(mapped[1], dither);
            canvas.rgb[destination + 2] = linear_to_srgb_dithered(mapped[2], dither);
        }
    }
    Ok(())
}

// An SDR frame is already what the screen shows: keep red, green and blue, drop the alpha.
fn copy_rgba8_frame(raw: &[u8], width: u32, height: u32, canvas: &mut Canvas) -> Result<(), AnyError> {
    let expected = usize::try_from(width)?
        .checked_mul(usize::try_from(height)?)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or("Captured frame is too large")?;
    if raw.len() < expected {
        return Err("Captured frame buffer is incomplete".into());
    }

    let copy_width = width.min(canvas.width);
    let copy_height = height.min(canvas.height);
    for y in 0..copy_height {
        for x in 0..copy_width {
            let source = ((y * width + x) * 4) as usize;
            let destination = ((y * canvas.width + x) * 3) as usize;
            canvas.rgb[destination..destination + 3].copy_from_slice(&raw[source..source + 3]);
        }
    }
    Ok(())
}

fn write_png(output: &Path, canvas: &Canvas) -> Result<(), AnyError> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temp = output.with_extension(format!(
        "{}.tmp",
        output
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("png")
    ));

    let file = File::create(&temp)?;
    let mut encoder = Encoder::new(BufWriter::new(file), canvas.width, canvas.height);
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_source_srgb(SrgbRenderingIntent::Perceptual);
    // Level 3 spends a fifth of the default level's ~750ms on a 1440p screenshot for a file still
    // smaller than the RGBA one this replaces; level 6 costs 4x more for another 4 percent.
    encoder.set_deflate_compression(DeflateCompression::Level(3));
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&canvas.rgb)?;
    writer.finish()?;
    std::fs::rename(temp, output)?;
    Ok(())
}

fn capture(output: &Path, primary: Monitor, mode: CaptureMode, white_scale: f32) -> Result<(), AnyError> {
    let canvas = Arc::new(Mutex::new(Canvas::new(
        primary.width()?,
        primary.height()?,
    )?));
    let settings = Settings::new(
        primary,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        match mode {
            CaptureMode::Hdr => ColorFormat::Rgba16F,
            CaptureMode::Sdr => ColorFormat::Rgba8,
        },
        CaptureFlags {
            canvas: Arc::clone(&canvas),
            white_scale,
            mode,
        },
    );
    SnapshotCapture::start(settings)?;

    let canvas = canvas
        .lock()
        .map_err(|_| "Screenshot canvas lock was poisoned")?;
    write_png(output, &canvas)
}

fn run() -> Result<(), AnyError> {
    let mut args = std::env::args_os().skip(1);
    let first = args
        .next()
        .ok_or("Usage: aw-next-hdr-screenshot.exe [--status | --force | --sdr] <output.png>")?;
    let primary = Monitor::primary()?;

    if first == "--status" {
        println!(
            "{}",
            if primary_hdr_active(primary)? {
                "hdr-active"
            } else {
                "sdr"
            }
        );
        return Ok(());
    }

    // --force tone-maps even an SDR desktop, --sdr copies even an HDR one; by default the
    // display's own mode decides.
    let forced = if first == "--force" {
        Some(CaptureMode::Hdr)
    } else if first == "--sdr" {
        Some(CaptureMode::Sdr)
    } else {
        None
    };
    let output = if forced.is_some() {
        args.next()
            .map(PathBuf::from)
            .ok_or("an output path is required")?
    } else {
        PathBuf::from(first)
    };

    let path = primary_path(primary)?;
    let mode = match forced {
        Some(mode) => mode,
        None if path_hdr_enabled(&path)? => CaptureMode::Hdr,
        None => CaptureMode::Sdr,
    };
    capture(&output, primary, mode, path_sdr_white_scale(&path))
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fp16_pixel(red: f32, green: f32, blue: f32) -> Vec<u8> {
        [red, green, blue, 1.0]
            .into_iter()
            .flat_map(|value| f16::from_f32(value).to_bits().to_le_bytes())
            .collect()
    }

    fn encoded_code(value: f32) -> f32 {
        let value = value.clamp(0.0, 1.0);
        let encoded = if value <= 0.003_130_8 {
            value * 12.92
        } else {
            1.055 * value.powf(1.0 / 2.4) - 0.055
        };
        encoded * 255.0
    }

    fn frame(pixels: &[[f32; 3]]) -> Vec<u8> {
        pixels
            .iter()
            .flat_map(|rgb| fp16_pixel(rgb[0], rgb[1], rgb[2]))
            .collect()
    }

    #[test]
    fn an_sdr_frame_is_copied_without_its_alpha() {
        let raw = [10, 20, 30, 255, 40, 50, 60, 0, 70, 80, 90, 128, 100, 110, 120, 255];
        let mut canvas = Canvas::new(2, 2).unwrap();
        copy_rgba8_frame(&raw, 2, 2, &mut canvas).unwrap();
        assert_eq!(canvas.rgb, vec![10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
        assert!(copy_rgba8_frame(&raw[..8], 2, 2, &mut canvas).is_err(), "a short buffer is refused");
    }

    #[test]
    fn pq_round_trips_over_the_whole_encodable_range() {
        for step in 0..=200 {
            let value = (step as f32 / 200.0) * rel_from_pq(1.0);
            let back = rel_from_pq(pq_from_rel(value));
            assert!(
                (back - value).abs() <= 1e-3 * value.max(1.0),
                "{value} round tripped to {back}"
            );
        }
        assert!((pq_from_rel(1.0) - 0.580_690).abs() < 1e-5);
        // PQ does not evaluate to exactly zero at zero, but to well under a 12 bit code of it.
        assert!(pq_from_rel(0.0) < 1e-5);
        assert_eq!(rel_from_pq(pq_from_rel(0.0)), 0.0);
    }

    #[test]
    fn an_sdr_scene_passes_through_untouched() {
        let curve = ToneCurve::new(1.0);
        for step in 0..=100 {
            let value = step as f32 / 100.0;
            assert!((curve.map(value) - value).abs() < 1e-6);
        }
        assert_eq!(curve.map(4.0), 1.0);
    }

    #[test]
    fn the_curve_is_monotone_continuous_and_lands_on_the_peak() {
        for peak in [1.05_f32, 1.5, 2.0, 4.0, 8.0, 16.0, 49.0] {
            let curve = ToneCurve::new(peak);
            // Measured where it matters, in output codes: the knee must not show as a step and
            // the curve must never expand what it is supposed to compress.
            let mut previous = 0.0_f32;
            let mut previous_code = 0.0_f32;
            let mut previous_source = 0.0_f32;
            for step in 0..=20000 {
                let value = (step as f32 / 20000.0) * peak;
                let mapped = curve.map(value);
                let (code, source) = (encoded_code(mapped), encoded_code(value.min(1.0)));
                // Monotone to within the noise of the PQ round trip, which stays two orders of
                // magnitude below one output code.
                assert!(
                    mapped >= previous - 1e-4 && code >= previous_code - 0.05,
                    "peak {peak}: {value} mapped below its predecessor"
                );
                // The curve only compresses, so no input interval may come out stretched (also what
                // a knee step would look like); above diffuse white there is no source code to
                // compare against.
                let allowed = if value <= 1.0 {
                    source - previous_source + 0.05
                } else {
                    1.0
                };
                assert!(
                    code - previous_code <= allowed,
                    "peak {peak}: a step at {value}"
                );
                assert!(mapped <= value + 1e-4, "peak {peak}: {value} was expanded");
                previous = mapped;
                previous_code = code;
                previous_source = source;
            }
            assert!(
                (curve.map(peak) - 1.0).abs() < 2e-3,
                "peak {peak} did not land on white"
            );
            assert_eq!(curve.map(peak * 4.0), 1.0);
        }
    }

    #[test]
    fn ordinary_sdr_content_survives_an_hdr_capture() {
        // Every SDR code, through the curve of a scene four times brighter than diffuse white.
        let curve = ToneCurve::new(4.0);
        let mut worst = 0;
        for code in 0..=255_u8 {
            let value = code as f32 / 255.0;
            let linear = if value <= 0.04045 {
                value / 12.92
            } else {
                ((value + 0.055) / 1.055).powf(2.4)
            };
            let back = linear_to_srgb_dithered(curve.map(linear), 0.0);
            worst = worst.max((back as i32 - code as i32).abs());
        }
        assert!(worst <= 16, "SDR content drifted by {worst} codes");
    }

    #[test]
    fn the_knee_keeps_midtones_exact() {
        let curve = ToneCurve::new(16.0);
        for value in [0.05_f32, 0.18, 0.35, 0.5] {
            assert!(
                (curve.map(value) - value).abs() < 1e-6,
                "{value} was altered"
            );
        }
        assert!(
            curve.map(1.0) < 1.0,
            "diffuse white must leave room above it"
        );
        assert!(curve.map(1.0) > 0.8, "diffuse white must stay bright");
    }

    #[test]
    fn highlights_stay_separated_instead_of_collapsing_to_white() {
        let curve = ToneCurve::new(16.0);
        let steps: Vec<f32> = [1.5_f32, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0]
            .into_iter()
            .map(|value| curve.map(value))
            .collect();
        for pair in steps.windows(2) {
            assert!(pair[1] > pair[0], "two highlight levels collapsed together");
        }
        assert!(*steps.last().unwrap() < 1.0);
    }

    #[test]
    fn a_lone_firefly_does_not_decide_the_scene_peak() {
        let mut pixels = vec![[1.0_f32, 1.0, 1.0]; 16];
        pixels[5] = [60.0, 60.0, 60.0];
        assert!((estimate_scene_peak(&frame(&pixels), 4, 4, 1.0) - 1.0).abs() < 1e-3);

        // The same brightness spread over a 2x2 block is real content, and is kept.
        let mut pixels = vec![[1.0_f32, 1.0, 1.0]; 16];
        for index in [0, 1, 4, 5] {
            pixels[index] = [60.0, 60.0, 60.0];
        }
        assert!(estimate_scene_peak(&frame(&pixels), 4, 4, 1.0) > 40.0);
    }

    #[test]
    fn scene_peak_survives_degenerate_frames() {
        assert_eq!(estimate_scene_peak(&[], 0, 0, 1.0), 1.0);
        assert_eq!(
            estimate_scene_peak(&fp16_pixel(4.0, 4.0, 4.0), 1, 1, 1.0),
            1.0
        );
        let black = frame(&vec![[0.0_f32, 0.0, 0.0]; 16]);
        assert_eq!(estimate_scene_peak(&black, 4, 4, 1.0), 1.0);
        // Never beyond what PQ can encode, whatever the capture contains.
        let huge = frame(&vec![[60000.0_f32, 60000.0, 60000.0]; 16]);
        assert!(estimate_scene_peak(&huge, 4, 4, 1.0) <= rel_from_pq(1.0) + 1e-3);
    }

    #[test]
    fn infinities_negatives_and_nan_are_ignored() {
        let mut raw = fp16_pixel(0.5, 0.5, 0.5);
        let half = f16::from_f32(0.5).to_bits();
        raw[0..2].copy_from_slice(&f16::INFINITY.to_bits().to_le_bytes());
        assert_eq!(pixel_peak_bits(&raw), half);
        raw[0..2].copy_from_slice(&f16::NAN.to_bits().to_le_bytes());
        assert_eq!(pixel_peak_bits(&raw), half);
        // A negative channel carries colour outside the sRGB gamut; it is never the peak.
        raw[0..2].copy_from_slice(&f16::from_f32(-2.0).to_bits().to_le_bytes());
        assert_eq!(pixel_peak_bits(&raw), half);
        assert_eq!(read_half(&raw, 0), 0.0);
    }

    #[test]
    fn ordered_dither_averages_out_and_stays_sub_code() {
        let offsets: Vec<f32> = (0..8)
            .flat_map(|y| (0..8).map(move |x| dither_offset(x, y)))
            .collect();
        assert!(offsets.iter().all(|offset| offset.abs() <= 0.5));
        let mean = offsets.iter().sum::<f32>() / offsets.len() as f32;
        assert!(mean.abs() < 0.01, "the dither must not shift the average");
    }

    #[test]
    fn bright_coloured_highlights_move_towards_white() {
        // A saturated red at the scene peak: it must gain the other channels, without inverting.
        let desaturated = desaturate_highlight([1.0, 0.0, 0.0], highlight_wash(8.0, 8.0));
        assert!(desaturated[1] > 0.0 && desaturated[2] > 0.0);
        assert!(desaturated[0] > desaturated[1]);
        assert_eq!(desaturated[1], desaturated[2]);
        assert_eq!(desaturated[0], 1.0);
        // The wash rises with intensity, so two levels of one colour stay distinguishable.
        assert!(highlight_wash(4.0, 8.0) > highlight_wash(2.0, 8.0));

        // Diffuse white and below is not a highlight, and an SDR scene is never touched.
        assert_eq!(highlight_wash(1.0, 8.0), 0.0);
        assert_eq!(highlight_wash(4.0, 1.0), 0.0);
    }

    #[test]
    fn srgb_encoding_has_expected_endpoints() {
        assert_eq!(linear_to_srgb(0.0), 0);
        assert_eq!(linear_to_srgb(1.0), 255);
        assert!((linear_to_srgb(0.5) as i32 - 188).abs() <= 1);
    }

    #[test]
    fn synthetic_hdr_frame_keeps_highlight_detail_and_colour_order() {
        let raw = fp16_pixel(4.0, 2.0, 1.0);
        let mut canvas = Canvas::new(1, 1).unwrap();
        tone_map_frame(&raw, 1, 1, 8.0, 1.0, &mut canvas).unwrap();

        assert!(
            canvas.rgb[0] < 255,
            "a highlight below the scene peak must not clip"
        );
        assert!(canvas.rgb[0] > canvas.rgb[1]);
        assert!(canvas.rgb[1] > canvas.rgb[2]);
    }

    #[test]
    fn sdr_white_level_keeps_desktop_white_at_full_scale() {
        // 200 nits of SDR white: the desktop sits at 2.5 in scRGB and must still come out white.
        let white_scale = 2.5;
        let raw = frame(&vec![[2.5_f32, 2.5, 2.5]; 16]);
        assert!((estimate_scene_peak(&raw, 4, 4, white_scale) - 1.0).abs() < 0.01);

        let mut canvas = Canvas::new(4, 4).unwrap();
        tone_map_frame(&raw, 4, 4, 1.0, white_scale, &mut canvas).unwrap();
        assert_eq!(canvas.rgb[0], 255);
        assert_eq!(canvas.rgb[1], 255);
        assert_eq!(canvas.rgb[2], 255);
    }

    #[test]
    fn synthetic_sdr_frame_uses_normal_srgb_encoding() {
        let raw = fp16_pixel(0.25, 0.5, 1.0);
        let mut canvas = Canvas::new(1, 1).unwrap();
        tone_map_frame(&raw, 1, 1, 1.0, 1.0, &mut canvas).unwrap();

        // One code of slack: the ordered dither moves each sample by up to half a code.
        assert!((canvas.rgb[0] as i32 - 137).abs() <= 2);
        assert!((canvas.rgb[1] as i32 - 188).abs() <= 2);
        assert_eq!(canvas.rgb[2], 255);
    }

    #[test]
    fn the_lookup_table_agrees_with_the_curve_it_replaces() {
        let scene_peak = 12.0;
        let white_scale = 1.75;
        let tables = PixelTables::new(scene_peak, white_scale);
        let curve = ToneCurve::new(scene_peak);
        for bits in (0..HALF_INFINITY).step_by(37) {
            let raw = f16::from_bits(bits).to_f32();
            if raw <= 0.0 {
                continue;
            }
            let expected = curve.map(raw / white_scale);
            let got = raw * tables.scale[bits as usize];
            assert!((got - expected).abs() < 1e-5, "table drifted at {raw}");
        }
    }
}
