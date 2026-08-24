'use strict';

/*
  Library roots derived from launcher configuration that is ALREADY on disk, never from a disk scan.

  saveRoots.discoverLibraryRoots() finds folders by NAME ("Games", "Jeux", "Repacks", ...). That
  misses the folder a user actually keeps their games in whenever they named it after a storefront
  they installed through - "D:\Epic Games", "E:\Ubisoft\Ubisoft Game Launcher\games", "D:\XboxGames".
  Those folders are named in a manifest or a registry key the launcher wrote itself, so they can be
  read directly: one JSON/registry read each, no globbing, no drive walking.

  What is contributed is the PARENT of an install directory, not the install itself: the parent is
  the folder that holds many game folders, which is what a library root is (see libraryDirs.js).
  Official installs inside it are recognised and skipped by launcherDetect.js, so the value here is
  the non-official siblings sitting in the same folder - the repack or Goldberg build a user dropped
  next to their storefront games, which nothing else was looking at.
*/

const fs = require('fs');
const path = require('path');
const saveRoots = require(path.join(__dirname, 'saveRoots.js'));

// A parent directory that is a system/profile container rather than a game library. Contributing
// one of these would turn %ProgramFiles% or %LOCALAPPDATA% into a scan root, which is both enormous
// and full of things that are not games.
function reservedRoots() {
  const roots = [];
  for (const name of [
    'SystemRoot',
    'windir',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'ProgramData',
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'PUBLIC',
    'TEMP',
    'TMP',
  ]) {
    const value = process.env[name];
    if (value) roots.push(path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase());
  }
  return roots;
}

function normalizeDir(value) {
  const raw = String(value == null ? '' : value).trim().replace(/^"+|"+$/g, '');
  if (!raw) return '';
  let normalized;
  try {
    normalized = path.win32.normalize(raw);
  } catch {
    return '';
  }
  const root = path.win32.parse(normalized).root;
  if (normalized !== root) normalized = normalized.replace(/[\\/]+$/, '');
  return normalized;
}

function isDriveRoot(dir) {
  const normalized = normalizeDir(dir);
  if (!normalized) return true;
  return normalized === path.win32.parse(normalized).root;
}

/*
  The library root a game install directory belongs to, or '' when its parent is not one. Every
  rejection here is a folder that would make the scan bigger without making it find more: the drive
  root, a Windows/profile container, a Steam library (handled by the Steam source), or a parent that
  holds a single game and therefore adds no siblings to look at.
*/
function libraryRootFromInstallDir(installDir, options = {}) {
  const { minSiblings = 2, statSync = fs.statSync, readdirSync = fs.readdirSync, reserved = reservedRoots() } = options;
  const dir = normalizeDir(installDir);
  if (!dir || isDriveRoot(dir)) return '';
  const parent = normalizeDir(path.win32.dirname(dir));
  if (!parent || isDriveRoot(parent)) return '';
  if (reserved.includes(parent.toLowerCase())) return '';
  // Modern-app packages live under a protected folder no scan can read.
  if (/(?:^|[\\/])windowsapps(?:[\\/]|$)/i.test(parent)) return '';
  if (saveRoots.isSteamLikePath(parent)) return '';

  let entries;
  try {
    if (!statSync(parent).isDirectory()) return '';
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    return '';
  }
  const subdirectories = entries.filter((entry) => entry.isDirectory()).length;
  return subdirectories >= minSiblings ? parent : '';
}

// Epic Games Launcher: one .item manifest per installed game, each naming its InstallLocation.
function epicInstallLocations(manifestsDir) {
  const dir =
    manifestsDir || path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const locations = [];
  let files;
  try {
    files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.item'));
  } catch {
    return locations;
  }
  for (const file of files) {
    try {
      const item = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const location = item.InstallLocation || item.installLocation;
      if (location) locations.push(String(location));
    } catch {
      /* one unreadable manifest must not lose the others */
    }
  }
  return locations;
}

// The launcher also keeps a single roll-up file, which survives when a per-game manifest does not.
function epicLauncherInstalledLocations(datFile) {
  const file =
    datFile || path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
  try {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(payload.InstallationList) ? payload.InstallationList : [];
    return list.map((entry) => String((entry && (entry.InstallLocation || entry.installLocation)) || '')).filter(Boolean);
  } catch {
    return [];
  }
}

function defaultRegistry() {
  return require(path.join(__dirname, '..', 'util', 'reg.js'));
}

// Every install folder GOG Galaxy recorded under its own registry branch.
function gogInstallLocations(registry = defaultRegistry()) {
  const locations = [];
  for (const root of ['Software/WOW6432Node/GOG.com/Games', 'Software/GOG.com/Games']) {
    let ids = [];
    try {
      ids = registry.listRegistryAllSubkeys('HKLM', root) || [];
    } catch {
      continue;
    }
    for (const id of ids) {
      try {
        const value = registry.readRegistryString('HKLM', `${root}/${id}`, 'path');
        if (value) locations.push(value);
      } catch {
        /* skip one unreadable product */
      }
    }
  }
  return locations;
}

// Ubisoft Connect keeps the same kind of index (already read for the official source).
function ubisoftInstallLocations(registry = defaultRegistry()) {
  const locations = [];
  for (const root of ['Software/WOW6432Node/Ubisoft/Launcher/Installs', 'Software/Ubisoft/Launcher/Installs']) {
    let ids = [];
    try {
      ids = registry.listRegistryAllSubkeys('HKLM', root) || [];
    } catch {
      continue;
    }
    for (const id of ids) {
      try {
        const value = registry.readRegistryString('HKLM', `${root}/${id}`, 'InstallDir');
        if (value) locations.push(value);
      } catch {
        /* skip one unreadable product */
      }
    }
  }
  return locations;
}

/*
  <drive>:\.GamingRoot is the pointer Windows writes when the user picks a drive for Microsoft Store
  / Xbox games: a 4-byte "RGBX" magic followed by a NUL-terminated UTF-16LE path relative to that
  drive. Unlike the other launchers this names the LIBRARY folder itself, not one game, so it is
  contributed directly rather than through libraryRootFromInstallDir().
*/
function parseGamingRoot(buffer, drive) {
  if (!buffer || buffer.length < 6) return '';
  if (buffer.toString('latin1', 0, 4) !== 'RGBX') return '';
  const text = buffer.toString('utf16le', 4).replace(/\u0000[\s\S]*$/, '').trim();
  if (!text) return '';
  const relative = text.replace(/^[\\/]+/, '');
  if (!relative) return '';
  return normalizeDir(path.win32.join(`${drive}\\`, relative));
}

function xboxGamingRoots(drives = []) {
  const roots = [];
  for (const drive of drives) {
    const letter = String(drive || '').replace(/[\\/]+$/, '');
    if (!/^[A-Za-z]:$/.test(letter)) continue;
    let buffer;
    try {
      buffer = fs.readFileSync(path.win32.join(`${letter}\\`, '.GamingRoot'));
    } catch {
      continue;
    }
    const root = parseGamingRoot(buffer, letter);
    if (root) roots.push(root);
  }
  return roots;
}

/*
  Every launcher-derived library root, deduplicated, each tagged with the launcher that named it so
  a Smart Find suggestion can say where it came from. Existence is checked once, at the end.
*/
function discoverLauncherLibraryRoots(options = {}) {
  const { drives = [], installDirOptions = {} } = options;
  const found = [];
  const seen = new Set();
  const add = (dir, detector) => {
    const normalized = normalizeDir(dir);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    try {
      if (!fs.statSync(normalized).isDirectory()) return;
    } catch {
      return;
    }
    found.push({ path: normalized, detector });
  };

  const reserved = reservedRoots();
  const fromInstalls = (locations, detector) => {
    for (const location of locations) {
      const root = libraryRootFromInstallDir(location, { reserved, ...installDirOptions });
      if (root) add(root, detector);
    }
  };

  fromInstalls(
    [...epicInstallLocations(options.epicManifestsDir), ...epicLauncherInstalledLocations(options.epicLauncherInstalledDat)],
    'Epic Games library'
  );
  fromInstalls(gogInstallLocations(options.registry), 'GOG Galaxy library');
  fromInstalls(ubisoftInstallLocations(options.registry), 'Ubisoft Connect library');
  for (const root of xboxGamingRoots(drives)) add(root, 'Xbox games folder');

  return found;
}

module.exports = {
  discoverLauncherLibraryRoots,
  epicInstallLocations,
  epicLauncherInstalledLocations,
  gogInstallLocations,
  libraryRootFromInstallDir,
  parseGamingRoot,
  ubisoftInstallLocations,
  xboxGamingRoots,
};
