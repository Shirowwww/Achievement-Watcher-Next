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

module.exports = { unescapeSteamVdf, parseSteamLibraryFoldersVdf, parseSteamAppManifestAcf, steamClientDir, libraryAppsDirs, installDirOf };
