'use strict';

/*
  Single shared update state: it replaces four half-states that used to be scattered across
  electron/init.js, which left mid-download and quit-to-install windows showing nothing.
  Pure data and transitions, so every UI state is testable without Electron, a network or a release.
*/

// One phase at a time, in the order a successful update passes through them.
const PHASES = ['idle', 'checking', 'available', 'downloading', 'ready', 'held', 'installing', 'error'];

function initialState() {
  return {
    phase: 'idle',
    version: '',
    percent: -1,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    error: '',
    // Only an in-flight download can be cancelled; a dead Cancel button is worse than none.
    cancellable: false,
  };
}

function clampPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function version(state, event) {
  return String((event && event.version) || state.version || '');
}

// Unknown events return the state unchanged rather than throwing: this runs on the updater's own
// event listeners, where a throw would take the download down with it.
function reduce(state, event) {
  const current = state && typeof state === 'object' ? state : initialState();
  const type = event && event.type;

  switch (type) {
    case 'reset':
      return initialState();
    case 'checking':
      // A check that runs while something is already happening must not erase it.
      if (current.phase === 'downloading' || current.phase === 'ready' || current.phase === 'held' || current.phase === 'installing') return current;
      return { ...initialState(), phase: 'checking' };
    case 'available':
      return { ...initialState(), phase: 'available', version: version(current, event) };
    case 'not-available':
      return initialState();
    case 'download-started':
      return { ...initialState(), phase: 'downloading', version: version(current, event), percent: 0, cancellable: true };
    case 'progress':
      // Progress for a download that was cancelled or already finished is a late event, not a state.
      if (current.phase !== 'downloading') return current;
      return {
        ...current,
        percent: clampPercent(event.percent),
        bytesPerSecond: nonNegative(event.bytesPerSecond),
        transferred: nonNegative(event.transferred),
        total: nonNegative(event.total),
      };
    case 'downloaded':
      return { ...initialState(), phase: 'ready', version: version(current, event), percent: 100 };
    case 'held':
      return { ...initialState(), phase: 'held', version: version(current, event), percent: 100 };
    case 'installing':
      return { ...initialState(), phase: 'installing', version: version(current, event), percent: 100 };
    case 'cancelled':
      return initialState();
    case 'error':
      return { ...initialState(), phase: 'error', version: current.version, error: String((event && event.message) || '') };
    default:
      return current;
  }
}

// download-progress fires dozens of times a second and wakes a hidden tray renderer on every send;
// whole percentage points are the finest a progress bar shows, so anything finer is pure cost.
function shouldPublish(previous, next) {
  if (!previous) return true;
  if (previous.phase !== next.phase) return true;
  if (previous.version !== next.version) return true;
  if (previous.error !== next.error) return true;
  if (previous.cancellable !== next.cancellable) return true;
  return Math.round(previous.percent) !== Math.round(next.percent);
}

module.exports = { PHASES, initialState, reduce, shouldPublish };
