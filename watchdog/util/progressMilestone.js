'use strict';

// Percent steps offered in Settings; 0 shows every progress update. Kept in sync with app/settings.js.
const PROGRESS_STEPS = [0, 10, 25, 50];

// Absorbs float noise such as 7/70*100 landing a hair under 10.
const EPSILON = 1e-9;

function normalizeProgressStep(value) {
  const step = Number(value);
  return PROGRESS_STEPS.includes(step) ? step : 0;
}

function milestoneIndex(value, max, step) {
  const clamped = Math.min(Math.max(Number(value) || 0, 0), max);
  return Math.floor((clamped * 100) / (max * step) + EPSILON);
}

// True when moving from `previous` to `current` crosses a new multiple of `step` percent of `max`.
function reachesProgressMilestone(previous, current, max, step) {
  const percentStep = normalizeProgressStep(step);
  const goal = Number(max);
  if (!percentStep || !Number.isFinite(goal) || goal <= 0) return true;
  return milestoneIndex(current, goal, percentStep) > milestoneIndex(previous, goal, percentStep);
}

module.exports = { PROGRESS_STEPS, normalizeProgressStep, reachesProgressMilestone };
