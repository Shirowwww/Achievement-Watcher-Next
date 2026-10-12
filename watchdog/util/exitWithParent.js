'use strict';

/*
  The app starts the monitor over an ipc channel, and the channel closes when the app goes away,
  crash included. A monitor that outlived it kept port 8082 and the instance lock, so the next
  launch had to find it with netstat. Without a channel (a standalone dev run) nothing changes.
*/
function exitWithParent(proc = process, { onExit = () => {}, exit = () => proc.exit() } = {}) {
  if (typeof proc.send !== 'function') return false;
  proc.once('disconnect', () => {
    try {
      onExit();
    } catch {}
    exit();
  });
  return true;
}

module.exports = { exitWithParent };
