'use strict';

/*
  Opens an AW window (a notification popup or the overlay) for the Watchdog: through the main
  process when it is connected, else as a detached app process (a standalone or dev run).
*/

const path = require('path');
const { spawn } = require('child_process');
const debug = require('../util/log.js');
const { spawnDetached } = require('../util/spawnDetached.js');

const appRoot = path.join(__dirname, '..', '..');
const isDev = process.env.NODE_ENV === 'development';

function SpawnOverlayNotification(args) {
  // Use the main process when IPC is available; standalone runs use a detached child.
  if (typeof process.send === 'function' && process.connected) {
    try {
      process.send({ argv: args });
      return;
    } catch (err) {
      debug.error(`[overlay] IPC send failed, falling back to spawn: ${err}`);
    }
  }
  debug.log('Spawning achievement notification...');
  if (isDev) {
    const electronPath = require(path.join(appRoot, '../app/node_modules/electron'));
    spawnDetached(
      spawn,
      electronPath,
      ['.', ...args],
      {
        cwd: path.join(appRoot, '../app'),
        detached: true,
        stdio: 'ignore',
      },
      (err) => debug.error(`[overlay] Failed to start Electron: ${err && err.message ? err.message : err}`)
    );
  } else {
    const execPath = path.join(appRoot, process.platform === 'win32' ? 'Achievement Watcher.exe' : 'achievement-watcher');
    spawnDetached(
      spawn,
      execPath,
      args,
      {
        detached: true,
        stdio: ['ignore', process.stdout, process.stderr],
      },
      (err) => debug.error(`[overlay] Failed to start "${execPath}": ${err && err.message ? err.message : err}`)
    );
    debug.log(execPath);
  }
}

module.exports = { SpawnOverlayNotification };
