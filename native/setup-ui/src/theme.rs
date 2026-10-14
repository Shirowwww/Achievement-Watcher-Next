//! Colours and sizes, taken from the app's own tokens (app/resources/css/app.css, :root).

use windows::Win32::Graphics::Direct2D::Common::D2D1_COLOR_F;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const fn hex(rgb: u32) -> Self {
        Self::hexa(rgb, 1.0)
    }

    pub const fn hexa(rgb: u32, a: f32) -> Self {
        Self {
            r: ((rgb >> 16) & 0xFF) as f32 / 255.0,
            g: ((rgb >> 8) & 0xFF) as f32 / 255.0,
            b: (rgb & 0xFF) as f32 / 255.0,
            a,
        }
    }

    pub fn alpha(self, a: f32) -> Self {
        Self { a: self.a * a, ..self }
    }

    pub fn mix(self, other: Self, t: f32) -> Self {
        let t = t.clamp(0.0, 1.0);
        Self {
            r: self.r + (other.r - self.r) * t,
            g: self.g + (other.g - self.g) * t,
            b: self.b + (other.b - self.b) * t,
            a: self.a + (other.a - self.a) * t,
        }
    }

    pub fn d2d(self) -> D2D1_COLOR_F {
        D2D1_COLOR_F { r: self.r, g: self.g, b: self.b, a: self.a }
    }
}

pub const BG: Color = Color::hex(0x142236);
pub const GLOW: Color = Color::hex(0x26384C);
pub const PANEL: Color = Color::hex(0x192A40);
pub const SURFACE: Color = Color::hex(0x263B55);
pub const ELEVATED: Color = Color::hex(0x2D4561);
pub const SUNKEN: Color = Color::hex(0x101D2D);
pub const BORDER: Color = Color::hex(0x3E5065);
pub const TEXT: Color = Color::hex(0xE7EDF6);
pub const MUTED: Color = Color::hex(0x94A5BA);
pub const ACCENT: Color = Color::hex(0x6C91FF);
/// The accent lifted for small accent text on the header glow, where #6c91ff falls under 4.5:1.
pub const ACCENT_TEXT: Color = Color::hex(0x8DAAFF);
pub const ON_ACCENT: Color = Color::hex(0x0B1424);
pub const SUCCESS: Color = Color::hex(0x5FD49A);
pub const WARNING: Color = Color::hex(0xE5B263);
pub const WARNING_TEXT: Color = Color::hex(0xF0CF96);
pub const DANGER: Color = Color::hex(0xE07A5F);
pub const DANGER_TEXT: Color = Color::hex(0xF2B3A2);
pub const ON_DANGER: Color = Color::hex(0x1D0D08);
pub const PLATINUM: Color = Color::hex(0x7FD3F7);
pub const MARK: Color = Color::hex(0xF4F7FC);
pub const CONTROL_EDGE: Color = Color::hex(0x6D7F96);
pub const FOCUS: Color = Color::hex(0xB9CBFF);
pub const CLOSE_HOVER: Color = Color::hex(0xC42B1C);
pub const WHITE: Color = Color::hex(0xFFFFFF);

/// Window sizes in device-independent pixels.
pub const MAIN_SIZE: (f32, f32) = (640.0, 420.0);
pub const COMPACT_SIZE: (f32, f32) = (460.0, 148.0);
pub const CAPTION_HEIGHT: f32 = 40.0;
pub const BAR_HEIGHT: f32 = 68.0;
pub const CAPTION_BUTTON_WIDTH: f32 = 46.0;
