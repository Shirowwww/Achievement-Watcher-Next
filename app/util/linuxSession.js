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

function readNetUnix() {
  try {
    return require('fs').readFileSync('/proc/net/unix', 'utf8');
  } catch {
    return null;
  }
}

/*
  A DISPLAY inherited from an ended session (systemd keeps it) can name a gone XWayland whose socket
  file is still on disk, so only a bound socket in /proc/net/unix (file or abstract) proves a server.
  A remote display, or an unreadable /proc/net/unix, cannot be checked and is trusted.
*/
function xServerListening(display, { netUnix = readNetUnix } = {}) {
  const local = /^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(String(display || ''));
  if (!local) return true;
  const sockets = netUnix();
  if (sockets === null) return true;
  const socket = `/tmp/.X11-unix/X${local[1]}`;
  return sockets.split('\n').some((line) => line.endsWith(` ${socket}`) || line.endsWith(` @${socket}`));
}

/*
  Returns the command to restart through XWayland, or null when this process should carry on.
  Inside an AppImage this is the mounted binary too: the copy inherits the pipe the AppImage runtime
  watches, so the same mount stays up for it, where starting the .AppImage file again would mount a
  second copy and leave the first one behind.
*/
function xwaylandRelaunch({
  platform = process.platform,
  env = process.env,
  argv = process.argv,
  execPath = process.execPath,
  xServerUp = xServerListening,
} = {}) {
  // Electron goes native Wayland on exactly this variable; any other session is already X11.
  if (platform !== 'linux' || env.XDG_SESSION_TYPE !== 'wayland') return null;
  // No XWayland in this session (Hyprland unsets DISPLAY when it is off): native Wayland is the only display.
  if (!env.DISPLAY || !xServerUp(env.DISPLAY)) return null;
  const args = argv.slice(1);
  // A shortcut's `--toggle-overlay` only hands its press to the running copy: no window, no restart.
  if (hasPlatformChoice(args) || args.includes('--toggle-overlay')) return null;
  return { execPath, args: [...args, X11_SWITCH] };
}

// Starts the XWayland copy and reports whether this process should exit now, before it does any work.
function restartThroughXWayland(options) {
  const command = xwaylandRelaunch(options);
  if (!command) return false;
  spawn(command.execPath, command.args, { detached: true, stdio: 'inherit' }).unref();
  return true;
}

function readEnviron(pid) {
  try {
    return require('fs').readFileSync(`/proc/${pid}/environ`, 'utf8');
  } catch {
    return '';
  }
}

function environValue(environ, name) {
  const entry = environ.split('\0').find((line) => line.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

/*
  Started by its systemd unit in Steam's Game Mode, AW has no display: gamescope-session does not hand
  its own to the user manager. It takes the X display the running Steam client was given, which is
  gamescope's. Chromium connects only once this file has run, so setting DISPLAY here is enough.
  Returns false when AW has no display to run on, which the unit restarts until Steam is up.
*/
function adoptSteamDisplay({
  platform = process.platform,
  env = process.env,
  steamPid = () => require('./steamLinux.js').steamClientPid(),
  environOf = readEnviron,
  exists = (file) => require('fs').existsSync(file),
} = {}) {
  if (platform !== 'linux' || env.DISPLAY || env.WAYLAND_DISPLAY) return true;
  const pid = steamPid();
  const environ = pid ? environOf(pid) : '';
  const display = environValue(environ, 'DISPLAY');
  if (!display) return false;
  env.DISPLAY = display;
  const xauthority = environValue(environ, 'XAUTHORITY');
  // A Flatpak client's XAUTHORITY is a path inside its sandbox.
  if (xauthority && exists(xauthority)) env.XAUTHORITY = xauthority;
  return true;
}

module.exports = { xwaylandRelaunch, xServerListening, restartThroughXWayland, adoptSteamDisplay, X11_SWITCH };
