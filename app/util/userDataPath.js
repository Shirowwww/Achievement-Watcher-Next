'use strict';

const path = require('path');

// AW Next keeps its own data folder, distinct from both predecessors, so neither of their
// uninstallers can remove it. Electron sets the path; tests and standalone scripts resolve the
// same folder under %APPDATA%. The chain is Achievement Watcher (1.6.8) -> Achievement Watcher
// 3.0 -> Achievement Watcher Next, and migrateUserData.js imports forward one hop at a time,
// without ever deleting a source.
const APP_DATA_DIR_NAME = 'Achievement Watcher Next';
const AW3_DATA_DIR_NAME = 'Achievement Watcher 3.0';
const LEGACY_DATA_DIR_NAME = 'Achievement Watcher';

let cached = null;
let known = null;

/*
  The folder the app was handed or Electron reports, never a guess: null in a test or a plain node
  run, so a caller that writes there cannot land in a real profile by accident. Cached, because in a
  renderer each app.getPath() is a synchronous round trip to the main process.
*/
function knownUserDataDir() {
  if (known) return known;
  // The Watchdog and the scan host are spawned with the authoritative path.
  if (process.env.AW_USER_DATA) {
    known = process.env.AW_USER_DATA;
    return known;
  }
  try {
    const { app } = process.type === 'browser' ? require('electron') : require('@electron/remote');
    const p = app && typeof app.getPath === 'function' ? app.getPath('userData') : '';
    if (p) known = p;
  } catch {
    /* not running inside Electron (unit tests / plain node) */
  }
  return known;
}

function userDataDir() {
  if (cached) return cached;
  cached = knownUserDataDir() || path.join(appDataRoot(), APP_DATA_DIR_NAME);
  return cached;
}

// Electron's own appData: %APPDATA% on Windows, the XDG config folder elsewhere.
function appDataRoot() {
  if (process.platform === 'win32') return process.env['APPDATA'] || '';
  return process.env.XDG_CONFIG_HOME || path.join(require('os').homedir(), '.config');
}

function legacyUserDataDir() {
  return path.join(appDataRoot(), LEGACY_DATA_DIR_NAME);
}

function aw3UserDataDir() {
  return path.join(appDataRoot(), AW3_DATA_DIR_NAME);
}

function resetCache() {
  cached = null;
  known = null;
}

module.exports = {
  APP_DATA_DIR_NAME,
  AW3_DATA_DIR_NAME,
  LEGACY_DATA_DIR_NAME,
  userDataDir,
  knownUserDataDir,
  aw3UserDataDir,
  legacyUserDataDir,
  resetCache,
};
