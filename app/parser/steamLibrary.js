'use strict';

/*
  Where Steam installed a game, read from Steam's own files: libraryfolders.vdf names every library,
  appmanifest_<appid>.acf names the install folder. Nothing here but util/reg.js (unpacked), so the
  Watchdog loads this through sharedAppModulePath as well as the app.
*/

const fs = require('fs');
const path = require('path');

function unescapeSteamVdf(value) {
  return String(value || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseSteamLibraryFoldersVdf(text) {
  const roots = [];
  const re = /^\s*"path"\s+"([^"]+)"/gm;
  let m = null;
  while ((m = re.exec(String(text || '')))) roots.push(unescapeSteamVdf(m[1]));
  return roots;
}

function parseSteamAppManifestAcf(text) {
  const out = { appid: '', name: '', installDir: '' };
  const re = /^\s*"(appid|name|installdir)"\s+"([^"]*)"/gm;
  let m = null;
  while ((m = re.exec(String(text || '')))) {
    if (m[1] === 'appid') out.appid = unescapeSteamVdf(m[2]);
    else if (m[1] === 'name') out.name = unescapeSteamVdf(m[2]);
    else if (m[1] === 'installdir') out.installDir = unescapeSteamVdf(m[2]);
  }
  return out;
}

// Some emulators point HKCU SteamPath at a game folder, so a value counts only where steam.exe is.
function steamClientDir(readString = require(path.join(__dirname, '..', 'util', 'reg.js')).readRegistryString) {
  for (const [hive, key, name] of [
    ['HKCU', 'Software/Valve/Steam', 'SteamPath'],
    ['HKLM', 'Software/WOW6432Node/Valve/Steam', 'InstallPath'],
  ]) {
    try {
      const dir = readString(hive, key, name);
      if (dir && fs.existsSync(path.join(dir, 'steam.exe'))) return path.resolve(dir);
    } catch {
      /* the next key may still answer */
    }
  }
  return '';
}

// Every steamapps folder, the client's own first.
function libraryAppsDirs(clientDir) {
  if (!clientDir) return [];
  const main = path.join(clientDir, 'steamapps');
  const dirs = [main];
  try {
    for (const root of parseSteamLibraryFoldersVdf(fs.readFileSync(path.join(main, 'libraryfolders.vdf'), 'utf8'))) {
      const apps = path.join(root, 'steamapps');
      if (!dirs.some((dir) => dir.toLowerCase() === apps.toLowerCase())) dirs.push(apps);
    }
  } catch {
    /* no library list: the main folder still answers */
  }
  return dirs;
}

// The folder Steam installed `appid` in, or '' when it is not installed here.
function installDirOf(appid, { clientDir = steamClientDir() } = {}) {
  for (const apps of libraryAppsDirs(clientDir)) {
    try {
      const manifest = parseSteamAppManifestAcf(fs.readFileSync(path.join(apps, `appmanifest_${appid}.acf`), 'utf8'));
      const dir = manifest.installDir ? path.join(apps, 'common', manifest.installDir) : '';
      if (dir && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* not in this library */
    }
  }
  return '';
}

// Steam's binary KeyValues (shortcuts.vdf): 0x00 opens a map, 0x01 a string, 0x02 an int32,
// 0x07 a uint64, 0x08 closes the map.
function parseBinaryVdf(buffer) {
  let at = 0;
  const readString = () => {
    const end = buffer.indexOf(0, at);
    if (end < 0) throw new Error('unterminated string');
    const text = buffer.toString('utf8', at, end);
    at = end + 1;
    return text;
  };
  const readMap = () => {
    const map = {};
    while (at < buffer.length) {
      const type = buffer[at++];
      if (type === 0x08) return map;
      const key = readString();
      if (type === 0x00) map[key] = readMap();
      else if (type === 0x01) map[key] = readString();
      else if (type === 0x02) {
        map[key] = buffer.readInt32LE(at);
        at += 4;
      } else if (type === 0x07) at += 8;
      else throw new Error(`unknown value type ${type}`);
    }
    return map;
  };
  return readMap();
}

const field = (map, name) => {
  const key = Object.keys(map || {}).find((candidate) => candidate.toLowerCase() === name);
  return key ? map[key] : undefined;
};

// Every executable a non-Steam shortcut starts, for every Steam account on this PC.
function shortcutExecutables({ clientDir = steamClientDir() } = {}) {
  const exes = [];
  let accounts = [];
  try {
    accounts = fs.readdirSync(path.join(clientDir, 'userdata'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return exes;
  }
  for (const account of accounts) {
    try {
      const parsed = parseBinaryVdf(fs.readFileSync(path.join(clientDir, 'userdata', account.name, 'config', 'shortcuts.vdf')));
      for (const shortcut of Object.values(field(parsed, 'shortcuts') || {})) {
        const exe = String(field(shortcut, 'exe') || '').trim().replace(/^"|"$/g, '');
        if (exe && !exes.some((known) => known.toLowerCase() === exe.toLowerCase())) exes.push(exe);
      }
    } catch {
      /* no shortcuts for this account, or a file Steam is rewriting */
    }
  }
  return exes;
}

module.exports = {
  unescapeSteamVdf,
  parseSteamLibraryFoldersVdf,
  parseSteamAppManifestAcf,
  steamClientDir,
  libraryAppsDirs,
  installDirOf,
  parseBinaryVdf,
  shortcutExecutables,
};
