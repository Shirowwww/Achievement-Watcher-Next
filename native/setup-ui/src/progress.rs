//! One progress bar for a run made of steps of very different length. The run announces its plan
//! (the steps it will go through); each step owns a slice of the bar in proportion to how long it
//! usually takes. A step that reports its own fraction (the archive extraction) fills its slice
//! exactly; one that cannot (removing the old version) creeps toward the end of its slice, so the
//! bar never looks frozen and never claims to be done early.

use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Preparing,
    Closing,
    Removing,
    Extracting,
    Placing,
    Finishing,
    Files,
    Data,
    Cleanup,
    Done,
}

impl Phase {
    pub fn parse(name: &str) -> Option<Self> {
        Some(match name {
            "preparing" => Self::Preparing,
            "closing" => Self::Closing,
            "removing" => Self::Removing,
            "extracting" => Self::Extracting,
            "placing" => Self::Placing,
            "finishing" => Self::Finishing,
            "files" => Self::Files,
            "data" => Self::Data,
            "cleanup" => Self::Cleanup,
            "done" => Self::Done,
            _ => return None,
        })
    }

    /// Typical seconds on an SSD: the slice of the bar a step gets, and how fast a step without
    /// its own fraction creeps.
    fn seconds(self) -> f32 {
        match self {
            Self::Preparing => 0.3,
            Self::Closing => 0.6,
            Self::Removing => 2.0,
            Self::Extracting => 6.0,
            Self::Placing => 0.8,
            Self::Finishing => 1.0,
            Self::Files => 2.5,
            Self::Data => 2.0,
            Self::Cleanup => 0.4,
            Self::Done => 0.0,
        }
    }
}

pub const INSTALL_PLAN: &[Phase] = &[Phase::Closing, Phase::Removing, Phase::Extracting, Phase::Placing, Phase::Finishing];
pub const UNINSTALL_PLAN: &[Phase] = &[Phase::Closing, Phase::Files, Phase::Cleanup];
pub const UNINSTALL_DATA_PLAN: &[Phase] = &[Phase::Closing, Phase::Data, Phase::Files, Phase::Cleanup];

pub struct Progress {
    plan: &'static [Phase],
    phase: Phase,
    started: Instant,
    fraction: Option<f32>,
    shown: f32,
    last_tick: Instant,
}

/// How far toward the end of its slice a creeping step may go.
const CREEP_CEILING: f32 = 0.9;
/// Seconds for the shown bar to close most of the gap to the real value.
const SMOOTHING: f32 = 0.14;

impl Progress {
    pub fn new(plan: &'static [Phase]) -> Self {
        Self { plan, phase: Phase::Preparing, started: Instant::now(), fraction: None, shown: 0.0, last_tick: Instant::now() }
    }

    pub fn set_plan(&mut self, plan: &'static [Phase]) {
        self.plan = plan;
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn set_phase(&mut self, phase: Phase) {
        if phase != self.phase {
            self.phase = phase;
            self.started = Instant::now();
            self.fraction = None;
        }
    }

    pub fn set_fraction(&mut self, done: f64, total: f64) {
        if total > 0.0 {
            self.fraction = Some((done / total).clamp(0.0, 1.0) as f32);
        }
    }

    /// Start and end of the current step's slice. A step outside the plan takes no room.
    fn span(&self) -> (f32, f32) {
        if self.phase == Phase::Done {
            return (1.0, 1.0);
        }
        let total: f32 = self.plan.iter().map(|phase| phase.seconds()).sum::<f32>().max(f32::EPSILON);
        let mut start = 0.0;
        for phase in self.plan {
            let width = phase.seconds() / total;
            if *phase == self.phase {
                return (start, start + width);
            }
            start += width;
        }
        let before = self.shown;
        (before, before)
    }

    fn target(&self) -> f32 {
        let (start, end) = self.span();
        let within = match self.fraction {
            Some(fraction) => fraction,
            None => CREEP_CEILING * (1.0 - (-self.started.elapsed().as_secs_f32() / self.phase.seconds().max(0.1)).exp()),
        };
        start + (end - start) * within
    }

    /// Advances the shown value toward the target; it never moves backward. Returns it (0..1).
    pub fn tick(&mut self) -> f32 {
        let now = Instant::now();
        let dt = now.duration_since(self.last_tick).as_secs_f32().min(0.1);
        self.last_tick = now;
        let target = self.target();
        if crate::anim::reduced() {
            self.shown = self.shown.max(target);
        } else {
            let step = 1.0 - (-dt / SMOOTHING).exp();
            self.shown = (self.shown + (target - self.shown) * step).max(self.shown);
        }
        // The smoothing only approaches its target; a finished run must read exactly 100%.
        if self.phase == Phase::Done && self.shown > 0.995 {
            self.shown = 1.0;
        }
        self.shown
    }

    pub fn shown(&self) -> f32 {
        self.shown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slices_follow_the_plan_and_cover_the_whole_bar() {
        let mut progress = Progress::new(INSTALL_PLAN);
        progress.set_phase(Phase::Closing);
        assert_eq!(progress.span().0, 0.0);
        progress.set_phase(Phase::Finishing);
        assert!((progress.span().1 - 1.0).abs() < 1e-5);
    }

    #[test]
    fn a_reported_fraction_places_the_bar_inside_its_slice() {
        let mut progress = Progress::new(INSTALL_PLAN);
        progress.set_phase(Phase::Extracting);
        progress.set_fraction(1.0, 2.0);
        let (start, end) = progress.span();
        assert!((progress.target() - (start + end) / 2.0).abs() < 1e-5);
    }

    #[test]
    fn a_creeping_step_never_reaches_the_end_of_its_slice() {
        let mut progress = Progress::new(UNINSTALL_PLAN);
        progress.set_phase(Phase::Files);
        let (_, end) = progress.span();
        assert!(progress.target() < end);
    }
}
