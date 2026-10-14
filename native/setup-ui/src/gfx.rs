//! Direct2D drawing in device-independent pixels: shapes, gradients, text, icons and the brand mark.

use std::cell::RefCell;
use std::collections::HashMap;
use std::mem::ManuallyDrop;

use windows::Win32::Foundation::{D2DERR_RECREATE_TARGET, HWND};
use windows::Win32::Graphics::Direct2D::Common::{
    D2D_RECT_F, D2D_SIZE_U, D2D1_ALPHA_MODE_IGNORE, D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_GRADIENT_STOP, D2D1_PIXEL_FORMAT,
};
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::*;
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_UNKNOWN};
use windows::Win32::Graphics::Imaging::*;
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance};
use windows::core::{Interface, PCWSTR, Result};
use windows_numerics::{Matrix3x2, Vector2};

use crate::fonts::{Family, Fonts};
use crate::strings;
use crate::theme::Color;

/// The bare brand mark (no outline), black on transparent: it is drawn as an opacity mask, so any
/// colour can fill it.
const MARK_PNG: &[u8] = include_bytes!("../../../app/build/brandMark.png");

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }

    pub fn right(&self) -> f32 {
        self.x + self.w
    }

    pub fn bottom(&self) -> f32 {
        self.y + self.h
    }

    pub fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }

    pub fn inset(&self, dx: f32, dy: f32) -> Self {
        Self::new(self.x + dx, self.y + dy, self.w - 2.0 * dx, self.h - 2.0 * dy)
    }

    pub fn offset(&self, dx: f32, dy: f32) -> Self {
        Self::new(self.x + dx, self.y + dy, self.w, self.h)
    }

    pub fn center(&self) -> (f32, f32) {
        (self.x + self.w / 2.0, self.y + self.h / 2.0)
    }

    fn d2d(&self) -> D2D_RECT_F {
        D2D_RECT_F { left: self.x, top: self.y, right: self.right(), bottom: self.bottom() }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Start,
    Center,
    End,
}

/// How a piece of text is set. `tracking` is extra space after each character, in DIPs.
#[derive(Clone, Copy)]
pub struct Style {
    pub family: Family,
    pub bold: bool,
    pub size: f32,
    pub align: Align,
    pub wrap: bool,
    pub line_height: f32,
    pub tracking: f32,
}

impl Style {
    pub const fn text(size: f32) -> Self {
        Self { family: Family::Text, bold: false, size, align: Align::Start, wrap: false, line_height: 0.0, tracking: 0.0 }
    }

    pub const fn bold(self) -> Self {
        Self { bold: true, ..self }
    }

    pub const fn display(size: f32) -> Self {
        Self { family: Family::Display, bold: true, ..Self::text(size) }
    }

    pub const fn icon(size: f32) -> Self {
        Self { family: Family::Icons, bold: true, align: Align::Center, ..Self::text(size) }
    }

    pub const fn align(self, align: Align) -> Self {
        Self { align, ..self }
    }

    pub const fn wrapped(self, line_height: f32) -> Self {
        Self { wrap: true, line_height, ..self }
    }

}

type FormatKey = (Family, bool, u32);

pub struct Gfx {
    d2d: ID2D1Factory,
    fonts: Fonts,
    wic: Option<IWICImagingFactory>,
    target: Option<ID2D1HwndRenderTarget>,
    brush: Option<ID2D1SolidColorBrush>,
    formats: RefCell<HashMap<FormatKey, IDWriteTextFormat>>,
    marks: HashMap<u32, ID2D1Bitmap>,
    hwnd: HWND,
    pub scale: f32,
}

impl Gfx {
    pub fn new(hwnd: HWND, scale: f32) -> Result<Self> {
        let d2d: ID2D1Factory = unsafe { D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)? };
        let wic = unsafe { CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).ok() };
        Ok(Self {
            d2d,
            fonts: crate::fonts::load()?,
            wic,
            target: None,
            brush: None,
            formats: RefCell::new(HashMap::new()),
            marks: HashMap::new(),
            hwnd,
            scale,
        })
    }

    pub fn set_scale(&mut self, scale: f32) {
        self.scale = scale;
        self.marks.clear();
        if let Some(target) = &self.target {
            unsafe { target.SetDpi(96.0 * scale, 96.0 * scale) };
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        if let Some(target) = &self.target {
            let size = D2D_SIZE_U { width, height };
            if unsafe { target.Resize(&size) }.is_err() {
                self.discard();
            }
        }
    }

    fn discard(&mut self) {
        self.target = None;
        self.brush = None;
        self.marks.clear();
    }

    fn ensure_target(&mut self, width: u32, height: u32) -> Result<()> {
        if self.target.is_some() {
            return Ok(());
        }
        let props = D2D1_RENDER_TARGET_PROPERTIES {
            r#type: D2D1_RENDER_TARGET_TYPE_DEFAULT,
            pixelFormat: D2D1_PIXEL_FORMAT { format: DXGI_FORMAT_B8G8R8A8_UNORM, alphaMode: D2D1_ALPHA_MODE_IGNORE },
            dpiX: 96.0 * self.scale,
            dpiY: 96.0 * self.scale,
            ..Default::default()
        };
        let hwnd_props = D2D1_HWND_RENDER_TARGET_PROPERTIES {
            hwnd: self.hwnd,
            pixelSize: D2D_SIZE_U { width, height },
            // Frames are paced by the compositor clock (clock.rs), so presenting must not wait again.
            presentOptions: D2D1_PRESENT_OPTIONS_IMMEDIATELY,
        };
        let target = unsafe { self.d2d.CreateHwndRenderTarget(&props, &hwnd_props)? };
        unsafe { target.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE) };
        let brush = unsafe { target.CreateSolidColorBrush(&Color::hex(0).d2d(), None)? };
        self.target = Some(target);
        self.brush = Some(brush);
        Ok(())
    }

    /// Runs one frame. A lost device is dropped and rebuilt on the next frame.
    pub fn frame(&mut self, width: u32, height: u32, draw: impl FnOnce(&mut Gfx)) -> Result<()> {
        self.ensure_target(width, height)?;
        let target = self.target.clone().expect("render target");
        unsafe { target.BeginDraw() };
        draw(self);
        let result = unsafe { target.EndDraw(None, None) };
        if let Err(error) = &result {
            if error.code() == D2DERR_RECREATE_TARGET {
                self.discard();
                return Ok(());
            }
        }
        result
    }

    fn rt(&self) -> &ID2D1HwndRenderTarget {
        self.target.as_ref().expect("drawing outside a frame")
    }

    fn solid(&self, color: Color) -> &ID2D1SolidColorBrush {
        let brush = self.brush.as_ref().expect("drawing outside a frame");
        unsafe { brush.SetColor(&color.d2d()) };
        brush
    }

    /// Rounds a coordinate to the device pixel grid, so hairlines and bitmaps stay sharp.
    pub fn snap(&self, value: f32) -> f32 {
        (value * self.scale).round() / self.scale
    }

    pub fn clear(&self, color: Color) {
        unsafe { self.rt().Clear(Some(&color.d2d())) };
    }

    pub fn fill_rect(&self, rect: Rect, color: Color) {
        unsafe { self.rt().FillRectangle(&rect.d2d(), self.solid(color)) };
    }

    pub fn fill_round(&self, rect: Rect, radius: f32, color: Color) {
        let rounded = D2D1_ROUNDED_RECT { rect: rect.d2d(), radiusX: radius, radiusY: radius };
        unsafe { self.rt().FillRoundedRectangle(&rounded, self.solid(color)) };
    }

    pub fn stroke_round(&self, rect: Rect, radius: f32, color: Color, width: f32) {
        let half = width / 2.0;
        let rounded = D2D1_ROUNDED_RECT { rect: rect.inset(half, half).d2d(), radiusX: radius, radiusY: radius };
        unsafe { self.rt().DrawRoundedRectangle(&rounded, self.solid(color), width, None) };
    }

    pub fn fill_circle(&self, cx: f32, cy: f32, radius: f32, color: Color) {
        let ellipse = D2D1_ELLIPSE { point: Vector2 { X: cx, Y: cy }, radiusX: radius, radiusY: radius };
        unsafe { self.rt().FillEllipse(&ellipse, self.solid(color)) };
    }

    fn stops(&self, stops: &[(f32, Color)]) -> Result<ID2D1GradientStopCollection> {
        let stops: Vec<D2D1_GRADIENT_STOP> =
            stops.iter().map(|(position, color)| D2D1_GRADIENT_STOP { position: *position, color: color.d2d() }).collect();
        unsafe { self.rt().CreateGradientStopCollection(&stops, D2D1_GAMMA_2_2, D2D1_EXTEND_MODE_CLAMP) }
    }

    /// An elliptical radial gradient filling `bounds`.
    pub fn fill_radial(&self, bounds: Rect, cx: f32, cy: f32, rx: f32, ry: f32, stops: &[(f32, Color)]) {
        let Ok(collection) = self.stops(stops) else { return };
        let props = D2D1_RADIAL_GRADIENT_BRUSH_PROPERTIES {
            center: Vector2 { X: cx, Y: cy },
            gradientOriginOffset: Vector2::default(),
            radiusX: rx,
            radiusY: ry,
        };
        if let Ok(brush) = unsafe { self.rt().CreateRadialGradientBrush(&props, None, &collection) } {
            unsafe { self.rt().FillRectangle(&bounds.d2d(), &brush) };
        }
    }

    pub fn linear(&self, from: (f32, f32), to: (f32, f32), stops: &[(f32, Color)]) -> Option<ID2D1LinearGradientBrush> {
        let collection = self.stops(stops).ok()?;
        let props = D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES {
            startPoint: Vector2 { X: from.0, Y: from.1 },
            endPoint: Vector2 { X: to.0, Y: to.1 },
        };
        unsafe { self.rt().CreateLinearGradientBrush(&props, None, &collection).ok() }
    }

    pub fn fill_round_with(&self, rect: Rect, radius: f32, brush: &ID2D1Brush) {
        let rounded = D2D1_ROUNDED_RECT { rect: rect.d2d(), radiusX: radius, radiusY: radius };
        unsafe { self.rt().FillRoundedRectangle(&rounded, brush) };
    }

    pub fn push_clip(&self, rect: Rect) {
        unsafe { self.rt().PushAxisAlignedClip(&rect.d2d(), D2D1_ANTIALIAS_MODE_ALIASED) };
    }

    pub fn pop_clip(&self) {
        unsafe { self.rt().PopAxisAlignedClip() };
    }

    /// Everything drawn until `pop_layer` is composited at `opacity`.
    pub fn push_opacity(&self, opacity: f32) -> bool {
        let Ok(layer) = (unsafe { self.rt().CreateLayer(None) }) else { return false };
        let params = D2D1_LAYER_PARAMETERS {
            contentBounds: D2D_RECT_F { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 },
            geometricMask: ManuallyDrop::new(None),
            maskAntialiasMode: D2D1_ANTIALIAS_MODE_PER_PRIMITIVE,
            maskTransform: Matrix3x2::identity(),
            opacity: opacity.clamp(0.0, 1.0),
            opacityBrush: ManuallyDrop::new(None),
            layerOptions: D2D1_LAYER_OPTIONS_NONE,
        };
        unsafe { self.rt().PushLayer(&params, &layer) };
        true
    }

    pub fn pop_layer(&self) {
        unsafe { self.rt().PopLayer() };
    }

    pub fn translate(&self, dx: f32, dy: f32) {
        unsafe { self.rt().SetTransform(&Matrix3x2::translation(dx, dy)) };
    }

    pub fn reset_transform(&self) {
        unsafe { self.rt().SetTransform(&Matrix3x2::identity()) };
    }

    // ---- text ---------------------------------------------------------------------------------

    fn format(&self, style: &Style) -> Option<IDWriteTextFormat> {
        let key = (style.family, style.bold, (style.size * 100.0) as u32);
        if let Some(format) = self.formats.borrow().get(&key) {
            return Some(format.clone());
        }
        let embedded = self.fonts.collection.is_some();
        let family: Vec<u16> = style.family.name(embedded).encode_utf16().chain(Some(0)).collect();
        let locale: Vec<u16> = strings::locale().encode_utf16().chain(Some(0)).collect();
        let weight = match (style.family, style.bold) {
            (Family::Icons, _) => DWRITE_FONT_WEIGHT_BLACK,
            (_, true) => DWRITE_FONT_WEIGHT_BOLD,
            _ => DWRITE_FONT_WEIGHT_NORMAL,
        };
        let format = unsafe {
            self.fonts.factory.CreateTextFormat(
                PCWSTR(family.as_ptr()),
                self.fonts.collection.as_ref(),
                weight,
                DWRITE_FONT_STYLE_NORMAL,
                DWRITE_FONT_STRETCH_NORMAL,
                style.size,
                PCWSTR(locale.as_ptr()),
            )
        }
        .ok()?;
        self.formats.borrow_mut().insert(key, format.clone());
        Some(format)
    }

    pub fn layout(&self, text: &str, style: &Style, width: f32, height: f32) -> Option<IDWriteTextLayout> {
        let format = self.format(style)?;
        let wide: Vec<u16> = text.encode_utf16().collect();
        let layout = unsafe { self.fonts.factory.CreateTextLayout(&wide, &format, width.max(1.0), height.max(1.0)) }.ok()?;
        unsafe {
            let _ = layout.SetTextAlignment(match style.align {
                Align::Start => DWRITE_TEXT_ALIGNMENT_LEADING,
                Align::Center => DWRITE_TEXT_ALIGNMENT_CENTER,
                Align::End => DWRITE_TEXT_ALIGNMENT_TRAILING,
            });
            if style.wrap {
                let _ = layout.SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
                if style.line_height > 0.0 {
                    let _ = layout.SetLineSpacing(DWRITE_LINE_SPACING_METHOD_UNIFORM, style.line_height, style.line_height * 0.78);
                }
            } else {
                let _ = layout.SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
                self.ellipsize(&layout);
            }
            if style.tracking != 0.0 {
                if let Ok(layout1) = layout.cast::<IDWriteTextLayout1>() {
                    let range = DWRITE_TEXT_RANGE { startPosition: 0, length: wide.len() as u32 };
                    let _ = layout1.SetCharacterSpacing(0.0, style.tracking, 0.0, range);
                }
            }
        }
        Some(layout)
    }

    fn ellipsize(&self, layout: &IDWriteTextLayout) {
        unsafe {
            let Ok(sign) = self.fonts.factory.CreateEllipsisTrimmingSign(layout) else { return };
            let trimming = DWRITE_TRIMMING { granularity: DWRITE_TRIMMING_GRANULARITY_CHARACTER, delimiter: 0, delimiterCount: 0 };
            let _ = layout.SetTrimming(&trimming, &sign);
        }
    }

    pub fn metrics(layout: &IDWriteTextLayout) -> DWRITE_TEXT_METRICS {
        let mut metrics = DWRITE_TEXT_METRICS::default();
        unsafe {
            let _ = layout.GetMetrics(&mut metrics);
        }
        metrics
    }

    pub fn draw_layout(&self, layout: &IDWriteTextLayout, x: f32, y: f32, color: Color) {
        unsafe {
            self.rt().DrawTextLayout(Vector2 { X: x, Y: y }, layout, self.solid(color), D2D1_DRAW_TEXT_OPTIONS_NONE);
        }
    }

    /// Draws `text` in `rect`, vertically centred for single-line text. Returns the drawn width.
    pub fn text(&self, text: &str, style: &Style, rect: Rect, color: Color) -> f32 {
        let Some(layout) = self.layout(text, style, rect.w, rect.h) else { return 0.0 };
        let metrics = Self::metrics(&layout);
        let y = if style.wrap { rect.y } else { rect.y + (rect.h - metrics.height) / 2.0 };
        self.draw_layout(&layout, rect.x, y, color);
        metrics.width
    }

    pub fn measure(&self, text: &str, style: &Style, width: f32) -> (f32, f32) {
        let Some(layout) = self.layout(text, &Style { wrap: style.wrap, ..*style }, width, 10_000.0) else { return (0.0, 0.0) };
        let metrics = Self::metrics(&layout);
        (metrics.widthIncludingTrailingWhitespace, metrics.height)
    }

    /// One line with an underlined link inside it, centred in `rect`. Returns the link's bounds.
    pub fn text_with_link(&self, text: &str, link: &str, style: &Style, rect: Rect, color: Color, link_color: Color) -> Option<Rect> {
        let layout = self.layout(text, style, rect.w, rect.h)?;
        let start = text.find(link).map(|byte| text[..byte].encode_utf16().count())? as u32;
        let range = DWRITE_TEXT_RANGE { startPosition: start, length: link.encode_utf16().count() as u32 };
        let metrics = Self::metrics(&layout);
        let y = rect.y + (rect.h - metrics.height) / 2.0;
        unsafe {
            let link_brush = self.rt().CreateSolidColorBrush(&link_color.d2d(), None).ok()?;
            let _ = layout.SetUnderline(true, range);
            let _ = layout.SetDrawingEffect(&link_brush, range);
            self.draw_layout(&layout, rect.x, y, color);
            let mut hit = [DWRITE_HIT_TEST_METRICS::default(); 2];
            let mut count = 0u32;
            layout.HitTestTextRange(range.startPosition, range.length, rect.x, y, Some(&mut hit), &mut count).ok()?;
            let first = hit.first().filter(|_| count > 0)?;
            Some(Rect::new(first.left, first.top - 2.0, first.width, first.height + 4.0))
        }
    }

    /// A diagonal band of light crossing the mark once; `t` runs from 0 to 1.
    pub fn mark_shine(&mut self, x: f32, y: f32, size: f32, t: f32, strength: f32) {
        if !(0.0..1.0).contains(&t) {
            return;
        }
        let travel = -0.5 + 2.0 * t;
        let from = (x + size * (travel - 0.3), y);
        let to = (x + size * (travel + 0.3), y + size * 0.6);
        let light = crate::theme::WHITE;
        let stops = [(0.0, light.alpha(0.0)), (0.5, light.alpha(strength)), (1.0, light.alpha(0.0))];
        if let Some(brush) = self.linear(from, to, &stops) {
            self.mark_with(x, y, size, &brush.into());
        }
    }

    pub fn icon(&self, glyph: char, size: f32, rect: Rect, color: Color) {
        self.text(&glyph.to_string(), &Style::icon(size), rect, color);
    }

    // ---- the brand mark ----------------------------------------------------------------------

    fn mark_bitmap(&mut self, pixels: u32) -> Option<ID2D1Bitmap> {
        if let Some(bitmap) = self.marks.get(&pixels) {
            return Some(bitmap.clone());
        }
        let wic = self.wic.as_ref()?;
        let bitmap = unsafe {
            let stream = wic.CreateStream().ok()?;
            stream.InitializeFromMemory(MARK_PNG).ok()?;
            let decoder = wic.CreateDecoderFromStream(&stream, std::ptr::null(), WICDecodeMetadataCacheOnDemand).ok()?;
            let frame = decoder.GetFrame(0).ok()?;
            let scaler = wic.CreateBitmapScaler().ok()?;
            scaler.Initialize(&frame, pixels, pixels, WICBitmapInterpolationModeHighQualityCubic).ok()?;
            let converter = wic.CreateFormatConverter().ok()?;
            converter
                .Initialize(&scaler, &GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, None, 0.0, WICBitmapPaletteTypeMedianCut)
                .ok()?;
            let props = D2D1_BITMAP_PROPERTIES {
                pixelFormat: D2D1_PIXEL_FORMAT { format: DXGI_FORMAT_UNKNOWN, alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED },
                dpiX: 96.0,
                dpiY: 96.0,
            };
            self.rt().CreateBitmapFromWicBitmap(&converter, Some(&props)).ok()?
        };
        self.marks.insert(pixels, bitmap.clone());
        Some(bitmap)
    }

    /// The trophy mark tinted with `brush`, sized `size` DIPs, top-left at (x, y).
    pub fn mark_with(&mut self, x: f32, y: f32, size: f32, brush: &ID2D1Brush) {
        let pixels = (size * self.scale).round().max(1.0) as u32;
        let Some(bitmap) = self.mark_bitmap(pixels) else { return };
        let (x, y) = (self.snap(x), self.snap(y));
        let dest = Rect::new(x, y, pixels as f32 / self.scale, pixels as f32 / self.scale).d2d();
        unsafe {
            let rt = self.rt();
            rt.SetAntialiasMode(D2D1_ANTIALIAS_MODE_ALIASED);
            rt.FillOpacityMask(&bitmap, brush, D2D1_OPACITY_MASK_CONTENT_GRAPHICS, Some(&dest), None);
            rt.SetAntialiasMode(D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
        }
    }

    pub fn mark(&mut self, x: f32, y: f32, size: f32, color: Color) {
        let brush: ID2D1Brush = self.solid(color).clone().into();
        self.mark_with(x, y, size, &brush);
    }
}
