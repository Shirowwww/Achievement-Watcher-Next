'use strict';

const os = require('os');
const path = require('path');

// Where the app reaches the Watchdog. The websocket port is bound by watchdog/websocket.js; it is
// kept here because the app cannot load that file and the Watchdog can load this one.
const WATCHDOG_PORT = 8082;
const WATCHDOG_PIPE_NAME = '\\\\.\\pipe\\AchievementWatchdogPipe';

// The Watchdog's presence pipe: a named pipe on Windows, a Unix socket in the session runtime folder
// elsewhere (a `\\.\pipe\` name there would become a stray file in the working directory).
function watchdogPipePath({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32') return WATCHDOG_PIPE_NAME;
  return path.join(env.XDG_RUNTIME_DIR || os.tmpdir(), 'achievement-watchdog.sock');
}

module.exports = { watchdogPipePath, WATCHDOG_PORT, WATCHDOG_PIPE_NAME };
