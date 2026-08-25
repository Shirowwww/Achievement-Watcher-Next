'use strict';

/*
  The single description of "what the updater is doing right now", shared by the main process, the
  title bar and the Settings page.

  It exists because the answer used to live in four half-states scattered across electron/init.js
  (updateDownloading, updateAcceptedByUser, pendingInstallPrompt, a raw percent) and only ever
  reached the screen as a percentage in Settings. A window opened mid-download showed nothing, and
  the app quitting to install showed nothing at all - which is exactly the moment a user needs to be
  told something, since the window disappears for several seconds.

  Pure data and pure transitions, so every state the UI can be in is reachable in a test without
  Electron, a network or a release.
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
    // Only a download in flight can be stopped; everything else is either instant or past the
    // point of no return, and offering a dead Cancel button is worse than offering none.
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

/*
  The next state for one updater event. Unknown events return the state unchanged rather than
  throwing: this runs on the updater's own event listeners, where a throw would take the download
  down with it.
*/
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

/*
  Whether a state change is worth sending to the renderers. download-progress fires per network
  chunk - dozens of times a second on a fast line - and every send wakes a renderer that is usually
  hidden in the tray. Whole percentage points are the finest granularity a progress bar can show,
  so anything finer is pure cost.
*/
function shouldPublish(previous, next) {
  if (!previous) return true;
  if (previous.phase !== next.phase) return true;
  if (previous.version !== next.version) return true;
  if (previous.error !== next.error) return true;
  if (previous.cancellable !== next.cancellable) return true;
  return Math.round(previous.percent) !== Math.round(next.percent);
}

module.exports = { PHASES, initialState, reduce, shouldPublish };
