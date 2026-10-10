'use strict';

const os = require('os');
const path = require('path');

/*
  Where the Linux builds of the emulators keep their files. A native build (package, AppImage) uses
  its XDG folder; the Flatpak build the same folder inside its sandbox, ~/.var/app/<id>/<data|config>.
  On Windows these emulators live in folders the hosts of winHosts.js already cover, so there is
  nothing to add.
*/
const EMULATORS = {
  rpcs3: { xdg: 'config', name: 'rpcs3', flatpak: 'net.rpcs3.RPCS3' },
  shadps4: { xdg: 'data', name: 'shadPS4', flatpak: 'net.shadps4.shadPS4' },
  xenia: { xdg: 'data', name: 'Xenia' },
  retroarch: { xdg: 'config', name: 'retroarch', flatpak: 'org.libretro.RetroArch' },
};

const XDG_DEFAULTS = {
  config: { variable: 'XDG_CONFIG_HOME', segments: ['.config'] },
  data: { variable: 'XDG_DATA_HOME', segments: ['.local', 'share'] },
};

function xdgAppDirs(emulator, { platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const app = EMULATORS[emulator];
  if (!app || platform === 'win32') return [];
  const xdg = XDG_DEFAULTS[app.xdg];
  const dirs = [path.join(env[xdg.variable] || path.join(home, ...xdg.segments), app.name)];
  if (app.flatpak) dirs.push(path.join(home, '.var', 'app', app.flatpak, app.xdg, app.name));
  return dirs;
}

module.exports = { xdgAppDirs };
