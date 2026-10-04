'use strict';

const debug = require('./util/log.js');

const QUERY_USER_NOTIFICATION_STATE = {
  1: 'QUNS_NOT_PRESENT',
  2: 'QUNS_BUSY',
  3: 'QUNS_RUNNING_D3D_FULL_SCREEN',
  4: 'QUNS_PRESENTATION_MODE',
  5: 'QUNS_ACCEPTS_NOTIFICATIONS',
  6: 'QUNS_QUIET_TIME',
  7: 'QUNS_APP',
};

// Windows states that indicate a foreground/full-screen app.
const FULLSCREEN_STATES = ['QUNS_BUSY', 'QUNS_RUNNING_D3D_FULL_SCREEN', 'QUNS_PRESENTATION_MODE', 'QUNS_APP'];

// States where Windows sends toasts to the notification centre instead of showing a popup.
const POPUP_SUPPRESSED_STATES = [...FULLSCREEN_STATES, 'QUNS_QUIET_TIME'];

/*
  shell32 called through koffi, the Watchdog's FFI. The PowerShell Add-Type it replaces compiled C#
  with csc.exe on every notification, a pattern antivirus behaviour engines flag. A failed HRESULT
  is still an error, never a state.
*/
function nativeReader() {
  const koffi = require('koffi');
  const query = koffi.load('shell32.dll').func('int __stdcall SHQueryUserNotificationState(_Out_ int* pquns)');
  return () => {
    const out = [0];
    const hr = query(out);
    if (hr !== 0) throw new Error(`SHQueryUserNotificationState failed with hr=${hr}`);
    return out[0];
  };
}

let readRawState = null;

// Share the answer briefly across a batch of notifications.
const STATE_TTL_MS = 1000;
let cached = { at: 0, state: null, valid: false };

// Share the in-flight query too; a batch can arrive before the first result.
let inFlight = null;

// Avoid repeating the same failure warning every second.
let lastReportedFailure = null;

function reportFailure(reason) {
  if (lastReportedFailure === reason) return;
  lastReportedFailure = reason;
  debug.warn(`Could not read the user notification state (${reason}) - full-screen/quiet-hours detection is unavailable`);
}

function queryUserNotificationState() {
  if (cached.valid && Date.now() - cached.at < STATE_TTL_MS) return Promise.resolve(cached.state);
  if (inFlight) return inFlight;
  inFlight = readNotificationState();
  // Always release the shared promise slot.
  inFlight.catch(() => {}).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function readNotificationState() {
  let state = null;
  try {
    if (process.platform !== 'win32') throw new Error('not a Windows host');
    if (!readRawState) readRawState = nativeReader();
    const raw = await readRawState();
    state = QUERY_USER_NOTIFICATION_STATE[raw] || null;
    // Unknown output means the query failed.
    if (!state) throw new Error(`unrecognized state ${JSON.stringify(raw)}`);
    lastReportedFailure = null;
  } catch (err) {
    state = null;
    reportFailure(err.message || String(err));
  }

  // Cache failures too, and start the TTL once the answer is in.
  cached = { at: Date.now(), state, valid: true };
  return state;
}

async function isFullscreenAppRunning() {
  return FULLSCREEN_STATES.includes(await queryUserNotificationState());
}

// Unknown states never suppress a working notification.
async function arePopupsSuppressed() {
  return POPUP_SUPPRESSED_STATES.includes(await queryUserNotificationState());
}

// Only exclusive full-screen D3D hides an always-on-top window (it owns the swap chain); a
// borderless/windowed game still shows the overlay, so this deliberately skips FULLSCREEN_STATES.
// Returns null (not false) when the state can't be read, so callers don't treat "unknown" as "fine".
async function isOverlayLikelyHidden() {
  const state = await queryUserNotificationState();
  if (!state) return null;
  return state === 'QUNS_RUNNING_D3D_FULL_SCREEN';
}

// Tests swap the native call for a scripted one.
function _setReader(reader) {
  readRawState = reader;
}

// Tests drive this through several states in a row; the 1s cache would otherwise leak between them.
function _resetCache() {
  cached = { at: 0, state: null, valid: false };
  inFlight = null;
  lastReportedFailure = null;
}

module.exports = {
  isFullscreenAppRunning,
  arePopupsSuppressed,
  isOverlayLikelyHidden,
  queryUserNotificationState,
  FULLSCREEN_STATES,
  POPUP_SUPPRESSED_STATES,
  QUERY_USER_NOTIFICATION_STATE,
  _resetCache,
  _setReader,
};
