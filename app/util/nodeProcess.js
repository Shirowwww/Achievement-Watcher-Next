'use strict';

const path = require('path');

/*
  The app's own executable run as Node (ELECTRON_RUN_AS_NODE), the way the Watchdog is started: no
  second runtime to ship, and the native modules keep the ABI they were built for. Shared by the
  XEX reader and the scan host, which are started from a renderer, where worker threads cannot run.
*/
function forkNode(file, { heapMb = 0, env = {}, stdio = ['ignore', 'ignore', 'ignore', 'ipc'] } = {}) {
  const { fork } = require('child_process');
  return fork(file, [], {
    execPath: process.execPath,
    execArgv: heapMb > 0 ? [`--max-old-space-size=${heapMb}`] : [],
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    serialization: 'advanced',
    stdio,
    windowsHide: true,
  });
}

// A forked process cannot start from a file inside the asar, so its entry point ships unpacked
// (electron-builder.yml asarUnpack). What it requires can stay in the asar.
function unpackedPath(file) {
  return file.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

module.exports = { forkNode, unpackedPath };
