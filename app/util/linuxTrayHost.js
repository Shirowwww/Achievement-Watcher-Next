'use strict';

const { execFile } = require('child_process');

/*
  Linux tray icons are StatusNotifierItems, shown only when a host owns org.kde.StatusNotifierWatcher
  on the session bus: KDE Plasma always does, GNOME only with the AppIndicator extension (Ubuntu
  ships it, Fedora does not). Without one the icon is simply not drawn, so the window must not
  hide to a tray nobody can see.
*/

const WATCHER = 'org.kde.StatusNotifierWatcher';

function hasStatusNotifierHost({ run = execFile } = {}) {
  return new Promise((resolve) => {
    run(
      'dbus-send',
      ['--session', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.NameHasOwner', `string:${WATCHER}`],
      { timeout: 3000 },
      (error, stdout) => resolve(!error && /boolean true/.test(String(stdout || '')))
    );
  });
}

/*
  At login AW can start before the desktop's tray host (GNOME loads its AppIndicator extension after
  the autostart entries), and an item created then is never shown: it registers with nobody. Resolves
  true once a host appears, false after `timeoutMs`.
*/
async function waitForStatusNotifierHost({ timeoutMs = 120000, intervalMs = 2000, check = hasStatusNotifierHost, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let waited = 0; waited < timeoutMs; waited += intervalMs) {
    if (await check()) return true;
    await sleep(intervalMs);
  }
  return check();
}

module.exports = { WATCHER, hasStatusNotifierHost, waitForStatusNotifierHost };
