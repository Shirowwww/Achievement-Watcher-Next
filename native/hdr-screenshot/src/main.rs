use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use half::f16;
use png::{BitDepth, ColorType, Encoder, SrgbRenderingIntent};
use windows::Win32::Devices::Display::{
    DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
    DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
    DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_DEVICE_INFO_TYPE,
    DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
    DISPLAYCONFIG_SDR_WHITE_LEVEL, DISPLAYCONFIG_SOURCE_DEVICE_NAME, DisplayConfigGetDeviceInfo,
    GetDisplayConfigBufferSizes, QDC_ONLY_ACTIVE_PATHS, QueryDisplayConfig,
};
use windows::Win32::Foundation::{ERROR_SUCCESS, WIN32_ERROR};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, HMONITOR, MONITORINFOEXW};
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};

type AnyError = Box<dyn Error + Send + Sync>;
const HDR_INACTIVE_EXIT_CODE: i32 = 2;

#[derive(Debug)]
struct HdrInactive;

impl Display for HdrInactive {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("hdr-inactive")
    }
}

impl Error for HdrInactive {}

struct Canvas {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

impl Canvas {
    fn new(width: u32, height: u32) -> Result<Self, AnyError> {
        let byte_len = usize::try_from(width)?
            .checked_mul(usize::try_from(height)?)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or("The primary display is too large to capture")?;
        Ok(Self {
            width,
            height,
            rgba: vec![0; byte_len],
        })
    }
}

#[derive(Clone)]
struct CaptureFlags {
    canvas: Arc<Mutex<Canvas>>,
    white_scale: f32,
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
        if frame_buffer.color_format() != ColorFormat::Rgba16F {
            return Err("Windows Graphics Capture did not return an FP16 frame".into());
        }

        let mut unpadded = Vec::new();
        let raw = frame_buffer.as_nopadding_buffer(&mut unpadded);
        let white_scale = self.flags.white_scale;
        let scene_peak = estimate_scene_peak(raw, white_scale);
        let mut canvas = self
            .flags
            .canvas
            .lock()
            .map_err(|_| "HDR screenshot canvas lock was poisoned")?;
        tone_map_frame(raw, width, height, scene_peak, white_scale, &mut canvas)?;

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

fn active_display_paths() -> Result<Vec<DISPLAYCONFIG_PATH_INFO>, AnyError> {
    let mut path_count = 0_u32;
    let mut mode_count = 0_u32;
    let status = unsafe {
        GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
    };
    if status != ERROR_SUCCESS {
        return Err(format!("GetDisplayConfigBufferSizes failed: {}", status.0).into());
    }

    let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
    let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
    let status = unsafe {
        QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut path_count,
            paths.as_mut_ptr(),
            &mut mode_count,
            modes.as_mut_ptr(),
            None,
        )
    };
    if status != ERROR_SUCCESS {
        return Err(format!("QueryDisplayConfig failed: {}", status.0).into());
    }

    paths.truncate(path_count as usize);
    Ok(paths)
}

fn path_source_name(path: &DISPLAYCONFIG_PATH_INFO) -> Option<Vec<u16>> {
    let mut request = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
    request.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
    request.header.size = size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
    request.header.adapterId = path.sourceInfo.adapterId;
    request.header.id = path.sourceInfo.id;
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    if status != ERROR_SUCCESS {
        return None;
    }
    Some(request.viewGdiDeviceName.to_vec())
}

// DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2, which the windows crate does not expose yet. Windows 11
// 24H2 added it because the older query cannot tell HDR apart from automatic colour management:
// a display running in wide colour gamut reports advancedColorEnabled just like an HDR one does.
const DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO_2: DISPLAYCONFIG_DEVICE_INFO_TYPE =
    DISPLAYCONFIG_DEVICE_INFO_TYPE(15);
const DISPLAYCONFIG_ADVANCED_COLOR_MODE_HDR: u32 = 2;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct AdvancedColorInfo2 {
    header: DISPLAYCONFIG_DEVICE_INFO_HEADER,
    value: u32,
    color_encoding: u32,
    bits_per_color_channel: u32,
    active_color_mode: u32,
}

fn path_active_color_mode(path: &DISPLAYCONFIG_PATH_INFO) -> Option<u32> {
    let mut request = AdvancedColorInfo2 {
        header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
            r#type: DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO_2,
            size: size_of::<AdvancedColorInfo2>() as u32,
            adapterId: path.targetInfo.adapterId,
            id: path.targetInfo.id,
        },
        ..Default::default()
    };
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    (status == ERROR_SUCCESS).then_some(request.active_color_mode)
}

fn path_advanced_color_enabled(path: &DISPLAYCONFIG_PATH_INFO) -> Result<bool, AnyError> {
    let mut request = DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO::default();
    request.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
    request.header.size = size_of::<DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO>() as u32;
    request.header.adapterId = path.targetInfo.adapterId;
    request.header.id = path.targetInfo.id;
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    if status != ERROR_SUCCESS {
        return Err(format!("DisplayConfigGetDeviceInfo failed: {}", status.0).into());
    }
    // Bit 1 is advancedColorEnabled.
    Ok(unsafe { request.Anonymous.value } & 0b10 != 0)
}

fn path_hdr_enabled(path: &DISPLAYCONFIG_PATH_INFO) -> Result<bool, AnyError> {
    match path_active_color_mode(path) {
        Some(mode) => Ok(mode == DISPLAYCONFIG_ADVANCED_COLOR_MODE_HDR),
        // Before 24H2 there is no wide colour gamut mode, so the old query means HDR.
        None => path_advanced_color_enabled(path),
    }
}

// While HDR is on, the desktop composes in scRGB where 1.0 is 80 nits, but Windows paints SDR
// content at the brightness of the "SDR content brightness" slider. Without dividing by that
// factor the whole desktop reads as a highlight and the tone mapper crushes it.
fn path_sdr_white_scale(path: &DISPLAYCONFIG_PATH_INFO) -> f32 {
    let mut request = DISPLAYCONFIG_SDR_WHITE_LEVEL::default();
    request.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
    request.header.size = size_of::<DISPLAYCONFIG_SDR_WHITE_LEVEL>() as u32;
    request.header.adapterId = path.targetInfo.adapterId;
    request.header.id = path.targetInfo.id;
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    if status != ERROR_SUCCESS || request.SDRWhiteLevel == 0 {
        return 1.0;
    }
    // The level is reported in thousandths of the 80 nit scRGB reference white.
    (request.SDRWhiteLevel as f32 / 1000.0).max(1.0)
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

fn estimate_scene_peak(raw: &[u8], white_scale: f32) -> f32 {
    const BINS: usize = 4096;
    const MAX_SIGNAL: f32 = 16.0;
    let mut histogram = [0_u32; BINS];
    let mut samples = 0_u64;

    for pixel in raw.chunks_exact(8).step_by(4) {
        let peak = (read_half(pixel, 0)
            .max(read_half(pixel, 2))
            .max(read_half(pixel, 4))
            / white_scale)
            .min(MAX_SIGNAL);
        let bin = ((peak / MAX_SIGNAL) * (BINS - 1) as f32).round() as usize;
        histogram[bin] = histogram[bin].saturating_add(1);
        samples += 1;
    }

    if samples == 0 {
        return 1.0;
    }

    let target = ((samples as f64) * 0.999).ceil() as u64;
    let mut seen = 0_u64;
    for (index, count) in histogram.into_iter().enumerate() {
        seen += u64::from(count);
        if seen >= target {
            return (((index as f32) / (BINS - 1) as f32) * MAX_SIGNAL).max(1.0);
        }
    }
    1.0
}

const KNEE: f32 = 0.85;

fn tone_map_signal(value: f32, scene_peak: f32) -> f32 {
    let value = value.max(0.0);
    if scene_peak <= 1.05 {
        return value.min(1.0);
    }

    if value <= KNEE {
        return value;
    }

    let peak = scene_peak.max(KNEE + 0.001);
    let numerator = (1.0 + 20.0 * (value.min(peak) - KNEE)).ln();
    let denominator = (1.0 + 20.0 * (peak - KNEE)).ln();
    (KNEE + (1.0 - KNEE) * numerator / denominator).clamp(0.0, 1.0)
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

// A light source far above diffuse white reads as white to the eye, not as a saturated colour.
// Keeping the hue untouched turns bright coloured highlights into flat poster-like patches, so
// they are blended towards their own luminance as they approach the scene peak.
fn desaturate_highlight(rgb: [f32; 3], pixel_peak: f32, scene_peak: f32) -> [f32; 3] {
    const DESATURATION: f32 = 0.6;
    // Only what sits above diffuse white is a highlight; SDR content keeps its colour exactly.
    if scene_peak <= 1.05 || pixel_peak <= 1.0 {
        return rgb;
    }
    let blend = ((pixel_peak - 1.0) / (scene_peak - 1.0))
        .clamp(0.0, 1.0)
        .powi(2)
        * DESATURATION;
    // Blend towards the pixel's own brightest channel, so a highlight washes out to white instead
    // of losing intensity the way a blend towards luminance would.
    let white = rgb[0].max(rgb[1]).max(rgb[2]);
    [
        rgb[0] + (white - rgb[0]) * blend,
        rgb[1] + (white - rgb[1]) * blend,
        rgb[2] + (white - rgb[2]) * blend,
    ]
}

// Base/detail split (Durand/Reinhard style): only the tile-averaged brightness is compressed by
// the global curve, so local shading near an unrelated bright peak keeps its own contrast.
const LOCAL_TILE: usize = 64;
const LOCAL_BLUR_RADIUS: usize = 1;
const LOCAL_BLUR_PASSES: usize = 2;
const LOG_EPS: f32 = 1e-4;

fn build_local_base(
    raw: &[u8],
    width: u32,
    copy_width: u32,
    copy_height: u32,
    white_scale: f32,
) -> (Vec<f32>, usize, usize) {
    let grid_w = ((copy_width as usize) + LOCAL_TILE - 1) / LOCAL_TILE;
    let grid_h = ((copy_height as usize) + LOCAL_TILE - 1) / LOCAL_TILE;
    let mut sum = vec![0f32; grid_w * grid_h];
    let mut count = vec![0f32; grid_w * grid_h];

    for y in 0..copy_height {
        for x in 0..copy_width {
            let source = ((y * width + x) * 8) as usize;
            let peak = read_half(raw, source)
                .max(read_half(raw, source + 2))
                .max(read_half(raw, source + 4))
                / white_scale;
            let log_peak = (peak + LOG_EPS).ln();
            let tile = (y as usize / LOCAL_TILE) * grid_w + (x as usize / LOCAL_TILE);
            sum[tile] += log_peak;
            count[tile] += 1.0;
        }
    }

    let mut grid: Vec<f32> = sum
        .iter()
        .zip(count.iter())
        .map(|(&s, &c)| if c > 0.0 { s / c } else { 0.0 })
        .collect();
    for _ in 0..LOCAL_BLUR_PASSES {
        grid = blur_grid(&grid, grid_w, grid_h, LOCAL_BLUR_RADIUS);
    }
    (grid, grid_w, grid_h)
}

fn blur_grid(grid: &[f32], grid_w: usize, grid_h: usize, radius: usize) -> Vec<f32> {
    if grid_w == 0 || grid_h == 0 {
        return grid.to_vec();
    }
    let mut out = vec![0f32; grid.len()];
    for gy in 0..grid_h {
        let y0 = gy.saturating_sub(radius);
        let y1 = (gy + radius).min(grid_h - 1);
        for gx in 0..grid_w {
            let x0 = gx.saturating_sub(radius);
            let x1 = (gx + radius).min(grid_w - 1);
            let mut sum = 0f32;
            let mut n = 0f32;
            for yy in y0..=y1 {
                for xx in x0..=x1 {
                    sum += grid[yy * grid_w + xx];
                    n += 1.0;
                }
            }
            out[gy * grid_w + gx] = sum / n;
        }
    }
    out
}

// Bilinear sample of the tile grid at a pixel position, so the base layer changes smoothly across
// tile boundaries instead of stair-stepping.
fn sample_local_base(grid: &[f32], grid_w: usize, grid_h: usize, x: u32, y: u32) -> f32 {
    let tile = LOCAL_TILE as f32;
    let gx = (x as f32 + 0.5) / tile - 0.5;
    let gy = (y as f32 + 0.5) / tile - 0.5;
    let gx0f = gx.floor();
    let gy0f = gy.floor();
    let fx = gx - gx0f;
    let fy = gy - gy0f;
    let clamp_x = |v: f32| (v as i64).clamp(0, grid_w as i64 - 1) as usize;
    let clamp_y = |v: f32| (v as i64).clamp(0, grid_h as i64 - 1) as usize;
    let x0 = clamp_x(gx0f);
    let x1 = clamp_x(gx0f + 1.0);
    let y0 = clamp_y(gy0f);
    let y1 = clamp_y(gy0f + 1.0);
    let v00 = grid[y0 * grid_w + x0];
    let v10 = grid[y0 * grid_w + x1];
    let v01 = grid[y1 * grid_w + x0];
    let v11 = grid[y1 * grid_w + x1];
    let top = v00 + (v10 - v00) * fx;
    let bottom = v01 + (v11 - v01) * fx;
    top + (bottom - top) * fy
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
    let (base_grid, grid_w, grid_h) =
        build_local_base(raw, width, copy_width, copy_height, white_scale);

    for y in 0..copy_height {
        for x in 0..copy_width {
            let source = ((y * width + x) * 8) as usize;
            let destination = ((y * canvas.width + x) * 4) as usize;
            let rgb = [
                read_half(raw, source) / white_scale,
                read_half(raw, source + 2) / white_scale,
                read_half(raw, source + 4) / white_scale,
            ];
            let pixel_peak = rgb[0].max(rgb[1]).max(rgb[2]);
            let log_peak = (pixel_peak + LOG_EPS).ln();
            let base_log = sample_local_base(&base_grid, grid_w, grid_h, x, y);
            let detail = log_peak - base_log;
            let base_val = (base_log.exp() - LOG_EPS).max(0.0);
            let mapped_base = tone_map_signal(base_val, scene_peak);
            let mapped_peak = ((mapped_base + LOG_EPS).ln() + detail).exp() - LOG_EPS;
            let mapped_peak = mapped_peak.max(0.0);
            let scale = if pixel_peak > 0.0 {
                mapped_peak / pixel_peak
            } else {
                0.0
            };
            let mapped = desaturate_highlight(
                [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale],
                pixel_peak,
                scene_peak,
            );
            let dither = dither_offset(x, y);

            canvas.rgba[destination] = linear_to_srgb_dithered(mapped[0], dither);
            canvas.rgba[destination + 1] = linear_to_srgb_dithered(mapped[1], dither);
            canvas.rgba[destination + 2] = linear_to_srgb_dithered(mapped[2], dither);
            canvas.rgba[destination + 3] = 255;
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
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_source_srgb(SrgbRenderingIntent::Perceptual);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&canvas.rgba)?;
    writer.finish()?;
    std::fs::rename(temp, output)?;
    Ok(())
}

fn capture(output: &Path, primary: Monitor, white_scale: f32) -> Result<(), AnyError> {
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
        ColorFormat::Rgba16F,
        CaptureFlags {
            canvas: Arc::clone(&canvas),
            white_scale,
        },
    );
    SnapshotCapture::start(settings)?;

    let canvas = canvas
        .lock()
        .map_err(|_| "HDR screenshot canvas lock was poisoned")?;
    write_png(output, &canvas)
}

fn run() -> Result<(), AnyError> {
    let mut args = std::env::args_os().skip(1);
    let first = args
        .next()
        .ok_or("Usage: aw-next-hdr-screenshot.exe [--status | --force] <output.png>")?;
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

    let (force, output) = if first == "--force" {
        let output = args
            .next()
            .map(PathBuf::from)
            .ok_or("--force requires an output path")?;
        (true, output)
    } else {
        (false, PathBuf::from(first))
    };

    let path = primary_path(primary)?;
    if !force && !path_hdr_enabled(&path)? {
        return Err(Box::new(HdrInactive));
    }
    capture(&output, primary, path_sdr_white_scale(&path))
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        let exit_code = if error.downcast_ref::<HdrInactive>().is_some() {
            HDR_INACTIVE_EXIT_CODE
        } else {
            1
        };
        std::process::exit(exit_code);
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

    #[test]
    fn sdr_values_are_not_tone_mapped() {
        assert!((tone_map_signal(0.5, 1.0) - 0.5).abs() < f32::EPSILON);
        assert!((tone_map_signal(1.0, 1.0) - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn hdr_highlights_roll_into_sdr_without_clipping_early() {
        let low = tone_map_signal(1.0, 8.0);
        let high = tone_map_signal(4.0, 8.0);
        assert!(low > 0.80 && low < high);
        assert!(high < 1.0);
        assert_eq!(tone_map_signal(8.0, 8.0), 1.0);
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
        let desaturated = desaturate_highlight([1.0, 0.0, 0.0], 8.0, 8.0);
        assert!(desaturated[1] > 0.0 && desaturated[2] > 0.0);
        assert!(desaturated[0] > desaturated[1]);
        assert_eq!(desaturated[1], desaturated[2]);
        // The highlight washes out without dimming.
        assert_eq!(desaturated[0], 1.0);

        // Diffuse white and below is not a highlight, and an SDR scene is never touched.
        assert_eq!(
            desaturate_highlight([1.0, 0.0, 0.0], 1.0, 8.0),
            [1.0, 0.0, 0.0]
        );
        assert_eq!(
            desaturate_highlight([1.0, 0.0, 0.0], 1.0, 1.0),
            [1.0, 0.0, 0.0]
        );
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
            canvas.rgba[0] < 255,
            "a highlight below the scene peak must not clip"
        );
        assert!(canvas.rgba[0] > canvas.rgba[1]);
        assert!(canvas.rgba[1] > canvas.rgba[2]);
        assert_eq!(canvas.rgba[3], 255);
    }

    #[test]
    fn sdr_white_level_keeps_desktop_white_at_full_scale() {
        // 200 nits of SDR white: the desktop sits at 2.5 in scRGB and must still come out white.
        let white_scale = 2.5;
        let raw = fp16_pixel(2.5, 2.5, 2.5);
        // Within one histogram bin of 1.0, so the tone mapper leaves the frame alone.
        assert!((estimate_scene_peak(&raw, white_scale) - 1.0).abs() < 0.01);

        let mut canvas = Canvas::new(1, 1).unwrap();
        tone_map_frame(&raw, 1, 1, 1.0, white_scale, &mut canvas).unwrap();
        assert_eq!(canvas.rgba[0], 255);
        assert_eq!(canvas.rgba[1], 255);
        assert_eq!(canvas.rgba[2], 255);
    }

    #[test]
    fn synthetic_sdr_frame_uses_normal_srgb_encoding() {
        let raw = fp16_pixel(0.25, 0.5, 1.0);
        let mut canvas = Canvas::new(1, 1).unwrap();
        tone_map_frame(&raw, 1, 1, 1.0, 1.0, &mut canvas).unwrap();

        // One code of slack: the ordered dither moves each sample by up to half a code.
        assert!((canvas.rgba[0] as i32 - 137).abs() <= 2);
        assert!((canvas.rgba[1] as i32 - 188).abs() <= 2);
        assert_eq!(canvas.rgba[2], 255);
    }
}
