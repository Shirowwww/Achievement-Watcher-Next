'use strict';

const path = require('path');

// Mirrors app/util/userDataPath.js for the standalone Watchdog process. The Electron main process
// passes its user-data root through AW_USER_DATA when spawning the monitor; standalone runs (dev,
// tests) fall back to the same AW Next directory so the monitor never touches either predecessor's
// folder. The main process owns the migration; the monitor only ever reads the result.
const APP_DATA_DIR_NAME = 'Achievement Watcher Next';

let cached = null;

// Electron's own appData: %APPDATA% on Windows, the XDG config folder elsewhere.
function appDataRoot() {
  if (process.platform === 'win32') return process.env['APPDATA'] || '';
  return process.env.XDG_CONFIG_HOME || path.join(require('os').homedir(), '.config');
}

function userDataDir() {
  if (cached) return cached;
  if (process.env.AW_USER_DATA) {
    cached = process.env.AW_USER_DATA;
  } else {
    cached = path.join(appDataRoot(), APP_DATA_DIR_NAME);
  }
  return cached;
}

function resetCache() {
  cached = null;
}

module.exports = { APP_DATA_DIR_NAME, userDataDir, resetCache };
