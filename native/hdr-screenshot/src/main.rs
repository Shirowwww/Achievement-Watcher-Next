use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use half::f16;
use png::{BitDepth, ColorType, Encoder, SrgbRenderingIntent};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020, DXGI_COLOR_SPACE_RGB_STUDIO_G2084_NONE_P2020,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, DXGI_ERROR_NOT_FOUND, IDXGIFactory1, IDXGIOutput6,
};
use windows::core::Interface;
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
        let scene_peak = estimate_scene_peak(raw);
        let mut canvas = self
            .flags
            .canvas
            .lock()
            .map_err(|_| "HDR screenshot canvas lock was poisoned")?;
        tone_map_frame(raw, width, height, scene_peak, &mut canvas)?;

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

fn primary_hdr_active(primary: Monitor) -> Result<bool, AnyError> {
    let primary_handle = primary.as_raw_hmonitor();
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1()? };

    for adapter_index in 0.. {
        let adapter = match unsafe { factory.EnumAdapters1(adapter_index) } {
            Ok(adapter) => adapter,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => return Err(error.into()),
        };

        for output_index in 0.. {
            let output = match unsafe { adapter.EnumOutputs(output_index) } {
                Ok(output) => output,
                Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
                Err(error) => return Err(error.into()),
            };
            let basic = unsafe { output.GetDesc()? };
            if basic.Monitor.0 != primary_handle {
                continue;
            }

            let output6: IDXGIOutput6 = output.cast()?;
            let color_space = unsafe { output6.GetDesc1()? }.ColorSpace;
            return Ok(color_space == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020
                || color_space == DXGI_COLOR_SPACE_RGB_STUDIO_G2084_NONE_P2020);
        }
    }

    Err("The primary display was not found through DXGI".into())
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

fn estimate_scene_peak(raw: &[u8]) -> f32 {
    const BINS: usize = 4096;
    const MAX_SIGNAL: f32 = 16.0;
    let mut histogram = [0_u32; BINS];
    let mut samples = 0_u64;

    for pixel in raw.chunks_exact(8).step_by(4) {
        let peak = read_half(pixel, 0)
            .max(read_half(pixel, 2))
            .max(read_half(pixel, 4))
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

fn tone_map_signal(value: f32, scene_peak: f32) -> f32 {
    let value = value.max(0.0);
    if scene_peak <= 1.05 {
        return value.min(1.0);
    }

    const KNEE: f32 = 0.80;
    if value <= KNEE {
        return value;
    }

    let peak = scene_peak.max(KNEE + 0.001);
    let numerator = (1.0 + 20.0 * (value.min(peak) - KNEE)).ln();
    let denominator = (1.0 + 20.0 * (peak - KNEE)).ln();
    (KNEE + (1.0 - KNEE) * numerator / denominator).clamp(0.0, 1.0)
}

fn linear_to_srgb(value: f32) -> u8 {
    let value = value.clamp(0.0, 1.0);
    let encoded = if value <= 0.003_130_8 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0).round().clamp(0.0, 255.0) as u8
}

fn tone_map_frame(
    raw: &[u8],
    width: u32,
    height: u32,
    scene_peak: f32,
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
    for y in 0..copy_height {
        for x in 0..copy_width {
            let source = ((y * width + x) * 8) as usize;
            let destination = ((y * canvas.width + x) * 4) as usize;
            let rgb = [
                read_half(raw, source),
                read_half(raw, source + 2),
                read_half(raw, source + 4),
            ];
            let pixel_peak = rgb[0].max(rgb[1]).max(rgb[2]);
            let scale = if pixel_peak > 0.0 {
                tone_map_signal(pixel_peak, scene_peak) / pixel_peak
            } else {
                0.0
            };

            canvas.rgba[destination] = linear_to_srgb(rgb[0] * scale);
            canvas.rgba[destination + 1] = linear_to_srgb(rgb[1] * scale);
            canvas.rgba[destination + 2] = linear_to_srgb(rgb[2] * scale);
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

fn capture(output: &Path, primary: Monitor) -> Result<(), AnyError> {
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

    if !force && !primary_hdr_active(primary)? {
        return Err(Box::new(HdrInactive));
    }
    capture(&output, primary)
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
    fn srgb_encoding_has_expected_endpoints() {
        assert_eq!(linear_to_srgb(0.0), 0);
        assert_eq!(linear_to_srgb(1.0), 255);
        assert!((linear_to_srgb(0.5) as i32 - 188).abs() <= 1);
    }

    #[test]
    fn synthetic_hdr_frame_keeps_highlight_detail_and_colour_order() {
        let raw = fp16_pixel(4.0, 2.0, 1.0);
        let mut canvas = Canvas::new(1, 1).unwrap();
        tone_map_frame(&raw, 1, 1, 8.0, &mut canvas).unwrap();

        assert!(
            canvas.rgba[0] < 255,
            "a highlight below the scene peak must not clip"
        );
        assert!(canvas.rgba[0] > canvas.rgba[1]);
        assert!(canvas.rgba[1] > canvas.rgba[2]);
        assert_eq!(canvas.rgba[3], 255);
    }

    #[test]
    fn synthetic_sdr_frame_uses_normal_srgb_encoding() {
        let raw = fp16_pixel(0.25, 0.5, 1.0);
        let mut canvas = Canvas::new(1, 1).unwrap();
        tone_map_frame(&raw, 1, 1, 1.0, &mut canvas).unwrap();

        assert!((canvas.rgba[0] as i32 - 137).abs() <= 1);
        assert!((canvas.rgba[1] as i32 - 188).abs() <= 1);
        assert_eq!(canvas.rgba[2], 255);
    }
}
