// The SDR tone curve shared by HDR screenshots and HDR clips, so both look the same.
use half::f16;

// Finite non-negative f16 bit patterns sort like their values, so the brightest channel can be
// picked without decoding. Negative (out-of-gamut) or infinity/NaN patterns sit above HALF_INFINITY
// and never count as the peak.
pub const HALF_INFINITY: u16 = 0x7c00;

// PQ (SMPTE ST 2084): the roll-off is computed in this perceptually uniform domain, not linear
// light, so its remaining output codes go where the eye can still tell two highlights apart.
const PQ_M1: f32 = 2610.0 / 16384.0;
const PQ_M2: f32 = 2523.0 / 32.0;
const PQ_C1: f32 = 3424.0 / 4096.0;
const PQ_C2: f32 = 2413.0 / 128.0;
const PQ_C3: f32 = 2392.0 / 128.0;

// BT.2408 reference white. The capture is already divided by the SDR white level, so anchoring
// diffuse white at a fixed 203 cd/m2 makes the curve depend only on the peak-to-white ratio, not on
// the user's "SDR content brightness" slider.
const REF_WHITE_NITS: f32 = 203.0;

pub fn pq_from_rel(value: f32) -> f32 {
    let y = (value * (REF_WHITE_NITS / 10000.0)).clamp(0.0, 1.0);
    let ym = y.powf(PQ_M1);
    ((PQ_C1 + PQ_C2 * ym) / (1.0 + PQ_C3 * ym)).powf(PQ_M2)
}

pub fn rel_from_pq(value: f32) -> f32 {
    let e = value.clamp(0.0, 1.0).powf(1.0 / PQ_M2);
    let numerator = (e - PQ_C1).max(0.0);
    let denominator = PQ_C2 - PQ_C3 * e;
    if denominator <= 0.0 {
        return 0.0;
    }
    (numerator / denominator).powf(1.0 / PQ_M1) * (10000.0 / REF_WHITE_NITS)
}

// Knee-anchored roll-off: content below the knee passes through untouched (SDR content and UI
// look the same as an SDR capture), and an extended Reinhard shoulder above it reaches the scene
// peak without collapsing highlights to flat white. SHOULDER=0.035 keeps the drop at diffuse white
// under a noticeable threshold while still resolving a dozen or so highlight levels.
pub const SHOULDER: f32 = 0.035;

#[derive(Clone, Copy)]
pub struct ToneCurve {
    pub pq_peak: f32,
    pub knee: f32,
    pub width: f32,
    pub reach: f32,
    pub passthrough: bool,
}

impl ToneCurve {
    pub fn new(scene_peak: f32) -> Self {
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

    pub fn map(&self, value: f32) -> f32 {
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

// A light source far above diffuse white reads as white, not as a saturated colour, and scaling
// every channel equally cannot brighten one already at its maximum. Blending each channel towards
// the pixel's brightest one washes highlights out with rising intensity instead of dimming them.
pub const WASH: f32 = 0.6;

pub fn highlight_wash(pixel_peak: f32, scene_peak: f32) -> f32 {
    if scene_peak <= 1.05 || pixel_peak <= 1.0 {
        return 0.0;
    }
    let position = ((pixel_peak - 1.0) / (scene_peak - 1.0)).clamp(0.0, 1.0);
    position * position * WASH
}

pub fn desaturate_highlight(rgb: [f32; 3], blend: f32) -> [f32; 3] {
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

// The per-pixel decision depends only on the brightest channel, one of 31744 finite non-negative f16
// patterns, so compression and highlight wash are precomputed into an exact lookup table.
pub struct PixelTables {
    pub scale: Vec<f32>,
    pub blend: Vec<f32>,
}

impl PixelTables {
    pub fn new(scene_peak: f32, white_scale: f32) -> Self {
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
