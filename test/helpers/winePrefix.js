'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/*
  A throwaway home holding one Wine prefix (~/.wine, user "player"), made the current home for the
  test so every source finds it exactly as it finds a real one, through util/winHosts.js. Linux only:
  on Windows the hosts are this machine and nothing else.
*/

const LINUX_ONLY = { skip: process.platform === 'win32' && 'Linux-only' };

// Variables that would add hosts of their own or move the XDG folders.
const ISOLATED_ENV = ['HOME', 'WINEPREFIX', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'APPDATA', 'LOCALAPPDATA', 'PUBLIC', 'Public', 'PROGRAMDATA'];

const USER = 'player';

function hiveText(lines) {
  return ['WINE REGISTRY Version 2', '', ...lines, ''].join('\n');
}

async function withWinePrefix(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wine-home-'));
  const prefix = path.join(home, '.wine');
  const driveC = path.join(prefix, 'drive_c');
  const profile = path.join(driveC, 'users', USER);
  for (const dir of [profile, path.join(driveC, 'users', 'Public'), path.join(driveC, 'ProgramData')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(prefix, 'user.reg'), hiveText([]));
  fs.writeFileSync(path.join(prefix, 'system.reg'), hiveText([]));

  const saved = Object.fromEntries(ISOLATED_ENV.map((name) => [name, process.env[name]]));
  for (const name of ISOLATED_ENV) delete process.env[name];
  process.env.HOME = home;

  const ctx = {
    home,
    prefix,
    driveC,
    profile,
    appData: path.join(profile, 'AppData', 'Roaming'),
    localAppData: path.join(profile, 'AppData', 'Local'),
    programData: path.join(driveC, 'ProgramData'),
    documents: path.join(profile, 'Documents'),
    // Lines after the header of user.reg (HKCU) or system.reg (HKLM), as wineserver writes them.
    writeHive: (hive, lines) => fs.writeFileSync(path.join(prefix, hive === 'HKLM' ? 'system.reg' : 'user.reg'), hiveText(lines)),
    write: (file, content) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      return file;
    },
  };
  try {
    return await fn(ctx);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
}

module.exports = { withWinePrefix, LINUX_ONLY, WINE_USER: USER };
