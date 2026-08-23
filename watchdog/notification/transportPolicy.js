'use strict';

// Single owner of "which transport delivers this notification". Every source used to carry its own
// copy of the same three booleans and they had already drifted - they now pass the mode plus what
// this process can observe, and this module decides once. Automatic never guesses optimistically:
// an unreadable signal still leaves the overlay selected, not toast.

const MODES = ['auto', 'overlay', 'toast', 'both'];
const DEFAULT_MODE = 'auto';

// How long a definite overlay render failure keeps Automatic on toasts. Long enough that a broken
// preset or a wedged renderer does not cost the user a whole play session of notifications, short
// enough that a fixed setup recovers by itself without a restart.
const OVERLAY_COOLDOWN_MS = 10 * 60 * 1000;

// Reasons are stored and shown to the user through Game Health, so they are stable identifiers.
const REASON = {
  FORCED_TOAST: 'forced-toast',
  FORCED_OVERLAY: 'forced-overlay',
  FORCED_BOTH: 'forced-both',
  OVERLAY: 'overlay',
  OVERLAY_UNAVAILABLE: 'overlay-unavailable',
  OVERLAY_FAILING: 'overlay-failing',
  FULLSCREEN_HIDDEN: 'fullscreen-hidden',
  REMEMBERED_TOAST: 'remembered-toast',
};

let overlayFailedAt = 0;

function normalizeMode(mode) {
  const value = String(mode || '').toLowerCase();
  return MODES.includes(value) ? value : DEFAULT_MODE;
}

// A render failure is a property of the renderer, not of one game, so the cooldown is global.
function recordOverlayFailure(now = Date.now()) {
  overlayFailedAt = now;
}

function recordOverlaySuccess() {
  overlayFailedAt = 0;
}

function isOverlayCoolingDown(now = Date.now()) {
  return overlayFailedAt > 0 && now - overlayFailedAt < OVERLAY_COOLDOWN_MS;
}

// `websocket` is the user's broadcast setting, independent of the display transport - external
// clients keep receiving unlocks whichever popup the user sees. Returns { overlay, toast, websocket,
// fallbackToToast, reason }; `fallbackToToast` authorizes ONE toast, and only when the overlay
// reports a definite failure, so a fallback can never race the primary transport into a duplicate.
function planDelivery({ mode, websocket = false, signals = {}, now = Date.now() } = {}) {
  const chosen = normalizeMode(mode);
  const broadcast = websocket === true || chosen !== 'toast';
  const plan = { overlay: false, toast: false, websocket: broadcast, fallbackToToast: false, reason: REASON.OVERLAY };

  if (chosen === 'toast') return { ...plan, toast: true, reason: REASON.FORCED_TOAST };

  // The user asked for both, so the toast is already firing: nothing to fall back to.
  if (chosen === 'both') return { ...plan, toast: true, overlay: true, reason: REASON.FORCED_BOTH };

  if (chosen === 'overlay') {
    // "Prefer the overlay": a predicted-invisible popup is still what the user asked for and is left
    // alone, but a renderer that reports it cannot produce a popup at all would mean no notification
    // whatsoever, so that one definite failure is allowed to reach a toast instead.
    return { ...plan, overlay: true, fallbackToToast: true, reason: REASON.FORCED_OVERLAY };
  }

  // Automatic. Without the IPC channel the app cannot report what became of a popup, and Automatic
  // is defined by acting on observed outcomes - so it uses the transport it can account for.
  if (signals.overlayHost !== 'ipc') return { ...plan, toast: true, reason: REASON.OVERLAY_UNAVAILABLE };
  if (isOverlayCoolingDown(now)) return { ...plan, toast: true, reason: REASON.OVERLAY_FAILING };
  if (signals.overlayHidden === true) return { ...plan, toast: true, reason: REASON.FULLSCREEN_HIDDEN };
  // Only with no live answer does what happened last time in this game count for anything.
  if (signals.overlayHidden == null && signals.remembered === 'toast') {
    return { ...plan, toast: true, reason: REASON.REMEMBERED_TOAST };
  }
  return { ...plan, overlay: true, fallbackToToast: true, reason: REASON.OVERLAY };
}

// Tests drive the cooldown across several plans in a row.
function _reset() {
  overlayFailedAt = 0;
}

module.exports = {
  planDelivery,
  normalizeMode,
  recordOverlayFailure,
  recordOverlaySuccess,
  isOverlayCoolingDown,
  MODES,
  DEFAULT_MODE,
  REASON,
  OVERLAY_COOLDOWN_MS,
  _reset,
};
