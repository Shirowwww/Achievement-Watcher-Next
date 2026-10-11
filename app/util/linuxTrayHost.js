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

module.exports = { WATCHER, hasStatusNotifierHost };
