//! Time-based easing. Every animation reads the clock rather than counting frames, so a slow frame
//! never slows the motion down, and the "Show animations" Windows setting turns all of it off.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use windows::Win32::UI::WindowsAndMessaging::{SPI_GETCLIENTAREAANIMATION, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, SystemParametersInfoW};
use windows::core::BOOL;

static REDUCED: AtomicBool = AtomicBool::new(false);

pub fn read_motion_preference() {
    let mut enabled = BOOL(1);
    let read = unsafe {
        SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, Some(&mut enabled as *mut BOOL as *mut _), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0))
    };
    REDUCED.store(read.is_ok() && !enabled.as_bool(), Ordering::Relaxed);
}

pub fn reduced() -> bool {
    REDUCED.load(Ordering::Relaxed)
}

pub fn ease_out(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    1.0 - (1.0 - t).powi(3)
}

pub fn ease_in_out(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 { 4.0 * t * t * t } else { 1.0 - (-2.0 * t + 2.0).powi(3) / 2.0 }
}

/// A slight overshoot, for the one thing that pops in (the done badge).
pub fn ease_out_back(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    let c1 = 1.4;
    let c3 = c1 + 1.0;
    1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
}

/// A value moving from one target to the next over a fixed duration.
#[derive(Clone, Copy)]
pub struct Tween {
    from: f32,
    to: f32,
    start: Instant,
    duration: f32,
}

impl Tween {
    pub fn new(value: f32) -> Self {
        Self { from: value, to: value, start: Instant::now(), duration: 0.0 }
    }

    pub fn set(&mut self, target: f32, seconds: f32) {
        if (target - self.to).abs() < f32::EPSILON {
            return;
        }
        self.from = self.value();
        self.to = target;
        self.start = Instant::now();
        self.duration = if reduced() { 0.0 } else { seconds };
    }

    pub fn snap(&mut self, value: f32) {
        *self = Self::new(value);
    }

    pub fn value(&self) -> f32 {
        if self.duration <= 0.0 {
            return self.to;
        }
        let t = self.start.elapsed().as_secs_f32() / self.duration;
        self.from + (self.to - self.from) * ease_out(t)
    }

    pub fn running(&self) -> bool {
        self.duration > 0.0 && self.start.elapsed().as_secs_f32() < self.duration
    }
}

/// Seconds since `since`, for one-shot effects that run on their own clock.
pub fn elapsed(since: Instant) -> f32 {
    since.elapsed().as_secs_f32()
}
