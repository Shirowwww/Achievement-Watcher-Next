'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { X11_SWITCH } = require('./linuxSession.js');

/*
  "Start with the session" on Linux. Electron's login item settings only exist on Windows and
  macOS; desktops follow the XDG autostart spec instead: a .desktop file in ~/.config/autostart.
  An AppImage is started through its own file ($APPIMAGE), never through the mount point that
  disappears when it exits.

  Steam's Game Mode (gamescope-session on a Steam Deck, SteamOS and the like) runs no XDG autostart,
  so where such a session is installed a systemd user unit replaces the entry: the user manager starts
  it at every login, desktop or Game Mode, and restarts it until Steam has a display to lend.
*/

const FILE_NAME = 'io.github.shirowwww.achievement.watcher.desktop';
const UNIT_NAME = 'io.github.shirowwww.achievement.watcher.service';
const SESSION_DIRS = ['/usr/share/wayland-sessions', '/usr/share/xsessions'];

function configHome({ env = process.env, home = os.homedir() } = {}) {
  return env.XDG_CONFIG_HOME || path.join(home, '.config');
}

function autostartFile(ctx) {
  return path.join(configHome(ctx), 'autostart', FILE_NAME);
}

// SteamOS ships gamescope-wayland.desktop, the gamescope-session packages gamescope-session-*.desktop.
function hasGameModeSession({ sessionDirs = SESSION_DIRS } = {}) {
  return sessionDirs.some((dir) => {
    try {
      return fs.readdirSync(dir).some((name) => /^gamescope.*\.desktop$/i.test(name));
    } catch {
      return false;
    }
  });
}

// The unit and the link that enables it, as `systemctl --user enable` makes them; null without a
// Game Mode session to start in.
function gameModeUnit({ sessionDirs, ...ctx } = {}) {
  if (!hasGameModeSession({ sessionDirs })) return null;
  const dir = path.join(configHome(ctx), 'systemd', 'user');
  return { file: path.join(dir, UNIT_NAME), link: path.join(dir, 'default.target.wants', UNIT_NAME) };
}

// Desktop Entry Exec quoting: an argument with a reserved character goes in double quotes, with
// `"`, `` ` ``, `$` and `\` escaped inside them.
function quoteExecArg(arg) {
  const value = String(arg);
  if (!/[\s"'\\><~|&;$*?#()`]/.test(value)) return value;
  return `"${value.replace(/(["`$\\])/g, '\\$1')}"`;
}

// systemd's ExecStart quoting: `\` and `"` escaped inside double quotes, and `$` and `%` doubled
// everywhere, since systemd expands variables and specifiers even there.
function quoteUnitArg(arg) {
  const value = String(arg).replace(/([$%])/g, '$1$1');
  if (!/[\s"'\\;]/.test(value)) return value;
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

function launchCommand({ env = process.env, execPath = process.execPath, args = [], quote = quoteExecArg } = {}) {
  return [env.APPIMAGE || execPath, ...args].map(quote).join(' ');
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

function serviceUnit(command) {
  return [
    '[Unit]',
    'Description=Achievement Watcher Next',
    '',
    '[Service]',
    `ExecStart=${command}`,
    // AW exits with a failure until Steam's display is there to take (util/linuxSession.js).
    'Restart=on-failure',
    'RestartSec=10',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

function writeUnit(unit, command) {
  fs.mkdirSync(path.dirname(unit.link), { recursive: true });
  fs.writeFileSync(unit.file, serviceUnit(command));
  fs.rmSync(unit.link, { force: true });
  fs.symlinkSync(path.relative(path.dirname(unit.link), unit.file), unit.link);
}

/*
  The unit starts AW on X11 straight away. Restarting itself through XWayland, as it does from a
  Wayland desktop, would end the process systemd watches, and systemd stops the unit with it.
*/
function setEnabled(
  enabled,
  {
    args = [],
    file = autostartFile(),
    command = launchCommand({ args }),
    unit = gameModeUnit(),
    unitCommand = launchCommand({ args: [...args, X11_SWITCH], quote: quoteUnitArg }),
  } = {}
) {
  if (unit) {
    fs.rmSync(file, { force: true });
    if (enabled) writeUnit(unit, unitCommand);
    else for (const target of [unit.link, unit.file]) fs.rmSync(target, { force: true });
    return true;
  }
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, desktopEntry(command));
  return true;
}

// Enabled when our unit is linked, or our entry exists and was not switched off by the desktop's own settings.
function isEnabled({ file = autostartFile(), unit = gameModeUnit() } = {}) {
  if (unit) return fs.existsSync(unit.link);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  return !/^Hidden\s*=\s*true\s*$/im.test(text) && !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text);
}

module.exports = { autostartFile, gameModeUnit, quoteExecArg, quoteUnitArg, launchCommand, desktopEntry, serviceUnit, setEnabled, isEnabled };
