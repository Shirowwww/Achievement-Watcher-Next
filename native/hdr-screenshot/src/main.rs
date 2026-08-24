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
        let scene_peak = estimate_scene_peak(raw, width, height, white_scale);
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

// The f16 bit patterns of the finite non-negative values sort exactly like the values do, so the
// brightest channel of a pixel can be picked without decoding anything. A sign bit (colour outside
// the sRGB gamut, which scRGB stores as a negative channel) or an all-ones exponent (infinity, NaN)
// puts a pattern above HALF_INFINITY, and those never count as the peak.
const HALF_INFINITY: u16 = 0x7c00;

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

// PQ (SMPTE ST 2084). The roll-off is computed in this perceptually uniform domain rather than in
// linear light, so it spends its handful of remaining output codes where the eye can still tell two
// highlights apart.
const PQ_M1: f32 = 2610.0 / 16384.0;
const PQ_M2: f32 = 2523.0 / 32.0;
const PQ_C1: f32 = 3424.0 / 4096.0;
const PQ_C2: f32 = 2413.0 / 128.0;
const PQ_C3: f32 = 2392.0 / 128.0;

// BT.2408 reference white. The capture is already divided by the desktop's own SDR white level, so
// 1.0 means diffuse white wherever the "SDR content brightness" slider sits; anchoring that at a
// fixed 203 cd/m2 keeps the curve a function of the peak-to-white ratio alone, and therefore keeps
// two captures of the same scene identical whatever the user later does to the slider.
const REF_WHITE_NITS: f32 = 203.0;

fn pq_from_rel(value: f32) -> f32 {
    let y = (value * (REF_WHITE_NITS / 10000.0)).clamp(0.0, 1.0);
    let ym = y.powf(PQ_M1);
    ((PQ_C1 + PQ_C2 * ym) / (1.0 + PQ_C3 * ym)).powf(PQ_M2)
}

fn rel_from_pq(value: f32) -> f32 {
    let e = value.clamp(0.0, 1.0).powf(1.0 / PQ_M2);
    let numerator = (e - PQ_C1).max(0.0);
    let denominator = PQ_C2 - PQ_C3 * e;
    if denominator <= 0.0 {
        return 0.0;
    }
    (numerator / denominator).powf(1.0 / PQ_M1) * (10000.0 / REF_WHITE_NITS)
}

// A percentile rather than the raw maximum, and taken over the second brightest pixel of every 2x2
// block rather than over every pixel: a lone specular sample loses to its own neighbours, so a
// handful of fireflies can no longer decide how dark the rest of the screenshot comes out, while a
// real window or sunlit wall keeps its value. The histogram is indexed by the f16 pattern itself,
// which makes the percentile exact and keeps the scan free of any decoding.
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

// Knee-anchored roll-off. Below the knee the capture passes through untouched, so ordinary SDR
// content, the desktop and every piece of game UI come out of an HDR capture exactly as they would
// out of an SDR one. Above it an extended Reinhard shoulder reaches the scene peak with a slope
// that is small but never zero, which is what keeps the brightest highlights separated instead of
// collapsing them into one flat white.
//
// SHOULDER is the width of that shoulder in normalised PQ, and it is the whole trade: the drop at
// diffuse white is close to SHOULDER/2, while everything above white has to fit inside it. At 0.035
// diffuse white lands within about 18 of 255 codes of where an SDR capture would put it - below the
// threshold of noticing on a screenshot - and the highlights still resolve into a dozen or more
// distinct levels.
const SHOULDER: f32 = 0.035;

#[derive(Clone, Copy)]
struct ToneCurve {
    pq_peak: f32,
    knee: f32,
    width: f32,
    reach: f32,
    passthrough: bool,
}

impl ToneCurve {
    fn new(scene_peak: f32) -> Self {
        let pq_peak = pq_from_rel(scene_peak);
        let white = pq_from_rel(1.0);
        if scene_peak <= 1.0 + 1e-4 || pq_peak <= white {
            return Self {
                pq_peak,
                knee: 1.0,
                width: 0.0,
                reach: 1.0,
                passthrough: true,
            };
        }
        let max_lum = white / pq_peak;
        // Never spend more of the SDR range on the shoulder than there is headroom above white to
        // absorb: as the scene peak approaches diffuse white the curve becomes the identity.
        let width = SHOULDER.min(1.0 - max_lum).min(0.98 * max_lum);
        Self {
            pq_peak,
            knee: max_lum - width,
            width,
            reach: (1.0 - (max_lum - width)) / width,
            passthrough: false,
        }
    }

    fn map(&self, value: f32) -> f32 {
        let value = value.max(0.0);
        if self.passthrough {
            return value.min(1.0);
        }
        let normalised = (pq_from_rel(value) / self.pq_peak).clamp(0.0, 1.0);
        if normalised < self.knee {
            return value;
        }
        // Reinhard with a white point, in shoulder units: T(0) = 0, T'(0) = 1 and T(L) = 1, so the
        // curve leaves the knee at slope 1 and lands exactly on the scene peak.
        let t = (normalised - self.knee) / self.width;
        let shaped = t * (1.0 + t / (self.reach * self.reach)) / (1.0 + t);
        let mapped = (self.knee + self.width * shaped).clamp(0.0, 1.0);
        rel_from_pq(mapped * self.pq_peak).min(1.0)
    }
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

// A light source far above diffuse white reads as white to the eye, not as a saturated colour, and
// scaling every channel by the same factor cannot brighten a channel that is already at its
// maximum: without this a red lamp at twice diffuse white and the same lamp at twelve times come
// out as the very same flat red. Blending towards the pixel's own brightest channel washes it out
// with rising intensity instead of dimming it, and nothing at or below diffuse white is touched.
const WASH: f32 = 0.6;

fn highlight_wash(pixel_peak: f32, scene_peak: f32) -> f32 {
    if scene_peak <= 1.05 || pixel_peak <= 1.0 {
        return 0.0;
    }
    let position = ((pixel_peak - 1.0) / (scene_peak - 1.0)).clamp(0.0, 1.0);
    position * position * WASH
}

fn desaturate_highlight(rgb: [f32; 3], blend: f32) -> [f32; 3] {
    if blend <= 0.0 {
        return rgb;
    }
    let white = rgb[0].max(rgb[1]).max(rgb[2]);
    [
        rgb[0] + (white - rgb[0]) * blend,
        rgb[1] + (white - rgb[1]) * blend,
        rgb[2] + (white - rgb[2]) * blend,
    ]
}

// The whole per-pixel decision depends only on the brightest channel, and that channel is one of
// the 31744 finite non-negative f16 patterns, so both the compression and the highlight wash are
// resolved once into a table and cost a single lookup per pixel afterwards. No interpolation and no
// approximation: the table holds the exact value the curve would return.
struct PixelTables {
    scale: Vec<f32>,
    blend: Vec<f32>,
}

impl PixelTables {
    fn new(scene_peak: f32, white_scale: f32) -> Self {
        let curve = ToneCurve::new(scene_peak);
        let mut scale = vec![0.0_f32; HALF_INFINITY as usize];
        let mut blend = vec![0.0_f32; HALF_INFINITY as usize];
        for bits in 0..HALF_INFINITY {
            let raw = f16::from_bits(bits).to_f32();
            let peak = raw / white_scale;
            let index = bits as usize;
            // The SDR white division is folded into the table, so a channel goes straight from its
            // captured value to its tone-mapped one with a single multiply.
            scale[index] = if raw > 0.0 {
                curve.map(peak) / raw
            } else {
                0.0
            };
            blend[index] = highlight_wash(peak, scene_peak);
        }
        Self { scale, blend }
    }
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
            let destination = ((y * canvas.width + x) * 4) as usize;
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
                // The curve only ever compresses, so no interval of the input may come out
                // stretched - which is also what a step at the knee would look like. Above
                // diffuse white the input has no code of its own to compare against, so the
                // requirement there is simply that no step is visible.
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
        // A 4x4 frame of diffuse white with one very bright isolated pixel.
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
        // The highlight washes out without dimming.
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
        let raw = frame(&vec![[2.5_f32, 2.5, 2.5]; 16]);
        assert!((estimate_scene_peak(&raw, 4, 4, white_scale) - 1.0).abs() < 0.01);

        let mut canvas = Canvas::new(4, 4).unwrap();
        tone_map_frame(&raw, 4, 4, 1.0, white_scale, &mut canvas).unwrap();
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
