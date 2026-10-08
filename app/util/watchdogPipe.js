'use strict';

const os = require('os');
const path = require('path');

// The Watchdog's presence pipe: a named pipe on Windows, a Unix socket in the session runtime folder
// elsewhere (a `\\.\pipe\` name there would become a stray file in the working directory).
function watchdogPipePath({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32') return '\\\\.\\pipe\\AchievementWatchdogPipe';
  return path.join(env.XDG_RUNTIME_DIR || os.tmpdir(), 'achievement-watchdog.sock');
}

module.exports = { watchdogPipePath };
