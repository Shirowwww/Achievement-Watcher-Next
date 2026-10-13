'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { launchCommand } = require('./linuxAutostart.js');

/*
  The application entry of AW on a Linux desktop: a .desktop file in ~/.local/share/applications
  plus its icon in the hicolor theme. It is what puts AW in the application menu, gives the
  notification server a name and an icon to show, and makes AW the handler of the
  achievement-watcher:// links (Electron's setAsDefaultProtocolClient needs such a file on Linux
  and does not write one). An AppImage moves, so the entry is rewritten on each start.
*/

const DESKTOP_FILE = 'io.github.shirowwww.achievement.watcher.desktop';
const ICON_NAME = 'achievement-watcher-next';

function dataHome({ env = process.env, home = os.homedir() } = {}) {
  return env.XDG_DATA_HOME || path.join(home, '.local', 'share');
}

function applicationFile(ctx) {
  return path.join(dataHome(ctx), 'applications', DESKTOP_FILE);
}

function iconFile(ctx) {
  return path.join(dataHome(ctx), 'icons', 'hicolor', '256x256', 'apps', `${ICON_NAME}.png`);
}

function applicationEntry({ command, protocol }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Achievement Watcher Next',
    'Comment=Achievement notifications and playtime tracking',
    `Exec=${command} %u`,
    `Icon=${ICON_NAME}`,
    'Terminal=false',
    'Categories=Game;Utility;',
    // The window class Electron derives from package.json's name: it ties AW's windows to this entry,
    // so the dock and the task switcher show its icon instead of a generic one.
    'StartupWMClass=achievement-watcher',
    `MimeType=x-scheme-handler/${protocol};`,
    'X-GNOME-UsesNotifications=true',
    '',
  ].join('\n');
}

function writeIfChanged(file, content) {
  try {
    if (Buffer.compare(fs.readFileSync(file), Buffer.from(content)) === 0) return false;
  } catch {
    /* not written yet */
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 10000 }, (error, stdout, stderr) => resolve({ ok: !error, output: String(stderr || stdout || (error && error.message) || '').trim() }));
  });
}

/*
  Writes the entry and the icon, then asks xdg-mime to route the scheme to it. Resolves to what
  happened, for the log; a desktop without xdg-utils still gets the menu entry.
*/
async function install({ protocol, iconSource, args = [], execPath = process.execPath, ctx = {}, exec = run } = {}) {
  const file = applicationFile(ctx);
  const changed = writeIfChanged(file, applicationEntry({ command: launchCommand({ env: ctx.env || process.env, execPath, args }), protocol }));
  if (iconSource) {
    try {
      writeIfChanged(iconFile(ctx), fs.readFileSync(iconSource));
    } catch {
      /* the menu shows a generic icon instead */
    }
  }
  if (changed) await exec('update-desktop-database', [path.dirname(file)]);
  const mime = await exec('xdg-mime', ['default', DESKTOP_FILE, `x-scheme-handler/${protocol}`]);
  return { file, changed, handler: mime.ok, detail: mime.output };
}

module.exports = { DESKTOP_FILE, applicationFile, iconFile, applicationEntry, install };
