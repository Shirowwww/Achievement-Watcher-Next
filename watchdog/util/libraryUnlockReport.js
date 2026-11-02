'use strict';

/*
  Wraps a live watcher's notify so the unlock also reaches the open library: the toast never passes
  through the app, and the library only re-reads saves on a scan. The report goes first, so a
  notification that fails still leaves the tile right. The 100% popup names no achievement and is
  skipped; a list's own platinum trophy does name one and is reported.
*/
function withLibraryReport(notify, report) {
  return async (payload, opts) => {
    const appid = String((payload && payload.appid) || '');
    const name = String((payload && payload.achievementName) || '');
    if (appid && name) report({ appid }, name, Number(payload.time) || 0);
    return notify(payload, opts);
  };
}

module.exports = { withLibraryReport };
