'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/*
  "Start with the session" on Linux. Electron's login item settings only exist on Windows and
  macOS; desktops follow the XDG autostart spec instead: a .desktop file in ~/.config/autostart.
  An AppImage is started through its own file ($APPIMAGE), never through the mount point that
  disappears when it exits.
*/

const FILE_NAME = 'io.github.shirowwww.achievement.watcher.desktop';

function autostartFile({ env = process.env, home = os.homedir() } = {}) {
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'autostart', FILE_NAME);
}

// Desktop Entry Exec quoting: an argument with a reserved character goes in double quotes, with
// `"`, `` ` ``, `$` and `\` escaped inside them.
function quoteExecArg(arg) {
  const value = String(arg);
  if (!/[\s"'\\><~|&;$*?#()`]/.test(value)) return value;
  return `"${value.replace(/(["`$\\])/g, '\\$1')}"`;
}

function launchCommand({ env = process.env, execPath = process.execPath, args = [] } = {}) {
  return [env.APPIMAGE || execPath, ...args].map(quoteExecArg).join(' ');
}

function desktopEntry(command) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Achievement Watcher Next',
    'Comment=Achievement notifications and playtime tracking',
    `Exec=${command}`,
    'Icon=achievement-watcher-next',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function setEnabled(enabled, { file = autostartFile(), command = launchCommand() } = {}) {
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, desktopEntry(command));
  return true;
}

// Enabled when our entry exists and was not switched off by the desktop's own settings.
function isEnabled({ file = autostartFile() } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  return !/^Hidden\s*=\s*true\s*$/im.test(text) && !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text);
}

module.exports = { autostartFile, quoteExecArg, launchCommand, desktopEntry, setEnabled, isEnabled };
