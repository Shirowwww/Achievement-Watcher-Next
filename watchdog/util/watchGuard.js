'use strict';

/*
  node-watch reports a failing watch as an 'error' event, and an 'error' event nobody listens to is
  an uncaught exception: the whole Watchdog exits and its supervisor restarts it into the same wall.
  A recursive watch of Documents hit exactly that on Windows' legacy "My Music" junction (EPERM). A
  watch that fails is closed and logged; every other source keeps working.
*/
function guardWatcher(watcher, label, debug) {
  if (!watcher || typeof watcher.on !== 'function') return watcher;
  watcher.on('error', (err) => {
    if (debug && typeof debug.warn === 'function') debug.warn(`[watch] stopped following ${label}: ${err && err.message ? err.message : err}`);
    try {
      watcher.close();
    } catch {
      /* already closed */
    }
  });
  return watcher;
}

module.exports = { guardWatcher };
