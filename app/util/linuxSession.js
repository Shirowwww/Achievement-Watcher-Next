'use strict';

const { spawn } = require('child_process');

/*
  Which display server AW talks to on Linux. Under a Wayland session Electron runs as a native Wayland
  client, where a window can neither stay on top nor pick its own position, so the overlay and the
  notification popups would land behind the game, wherever the compositor puts them. Wine games are
  X11 clients of XWayland: running AW through XWayland too lets it stack its popups above them and
  grab its shortcut while they have focus. Chromium picks the platform before main.js runs, so the
  only way to change it is to start again with the switch on the command line.
*/

const X11_SWITCH = '--ozone-platform=x11';

// An explicit choice on the command line wins, so `--ozone-platform=wayland` keeps native Wayland.
function hasPlatformChoice(args) {
  return args.some((arg) => arg.startsWith('--ozone-platform'));
}

// Returns the command to restart through XWayland, or null when this process should carry on.
// An AppImage is restarted through its own file: the mount the binary runs from goes away with it.
function xwaylandRelaunch({ platform = process.platform, env = process.env, argv = process.argv, execPath = process.execPath } = {}) {
  // Electron goes native Wayland on exactly this variable; any other session is already X11.
  if (platform !== 'linux' || env.XDG_SESSION_TYPE !== 'wayland') return null;
  // No XWayland in this session: native Wayland is the only display there is.
  if (!env.DISPLAY) return null;
  const args = argv.slice(1);
  if (hasPlatformChoice(args)) return null;
  return { execPath: env.APPIMAGE || execPath, args: [...args, X11_SWITCH] };
}

// Starts the XWayland copy and reports whether this process should exit now, before it does any work.
function restartThroughXWayland(options) {
  const command = xwaylandRelaunch(options);
  if (!command) return false;
  spawn(command.execPath, command.args, { detached: true, stdio: 'inherit' }).unref();
  return true;
}

module.exports = { xwaylandRelaunch, restartThroughXWayland, X11_SWITCH };
