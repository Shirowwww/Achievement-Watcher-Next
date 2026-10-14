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

/*
  One stat often drives several achievements ("Play for 5, 10, 20 minutes"), and a single change
  then moves them all by the same step. Updates sharing that step count as one stat: only the one
  closest to completion pops up. Order is kept, so a lone update is untouched.
*/
function onePopupPerStat(updates) {
  const closest = new Map();
  for (const update of updates) {
    const stat = `${update.previous}>${update.current}`;
    const kept = closest.get(stat);
    if (!kept || update.current / update.max > kept.current / kept.max) closest.set(stat, update);
  }
  const shown = new Set(closest.values());
  return updates.filter((update) => shown.has(update));
}

module.exports = { PROGRESS_STEPS, normalizeProgressStep, reachesProgressMilestone, onePopupPerStat };
