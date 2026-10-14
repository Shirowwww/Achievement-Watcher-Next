'use strict';

const { spawn } = require('child_process');

/*
  Starts an AppImage once this process has exited, without passing it any open file descriptor.
  The AppImage runtime keeps its mount until every copy of a pipe it handed to the app is closed, so
  a new version started as an ordinary child would keep the old version mounted for its whole life.
  Waiting for the exit also leaves the single-instance lock free for the new copy.
*/
const SCRIPT = [
  'for fd in /proc/$$/fd/*; do n=${fd##*/}; [ "$n" -gt 2 ] && eval "exec $n>&-"; done 2>/dev/null',
  'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done',
  'shift',
  'exec "$0" "$@"',
].join('\n');

// `args` are the command-line switches the new version starts with, such as --password-store.
function launchAfterExit(appImage, { pid = process.pid, args = [], spawnFn = spawn } = {}) {
  const child = spawnFn('/bin/bash', ['-c', SCRIPT, appImage, String(pid), ...args], { detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

module.exports = { launchAfterExit };
