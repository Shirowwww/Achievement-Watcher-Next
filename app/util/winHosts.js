'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
// Joined onto __dirname: the Watchdog loads this file from app.asar.unpacked (see asarUnpack).
const { discoverPrefixes } = require(path.join(__dirname, 'winePrefixes.js'));
const wineRegistry = require(path.join(__dirname, 'wineRegistry.js'));

/*
  The places where Windows-style user folders live. On Windows that is this machine and nothing
  else, read exactly as before. On Linux every Wine/Proton prefix is one, plus the native host whose
  XDG data folder is where Linux builds of the same emulators write (gbe_fork, Goldberg).

  A host exposes:
  - `env`: the folders the save-root tables are built from, absolute local paths or null when the
    host has no such folder;
  - `documents()`: its Documents folder;
  - `regValue(hive, key, name)`, `regSubkeys(hive, key)`, `regValueNames(hive, key)`: its registry
    (a prefix's user.reg and system.reg), strings and numbers as Windows stores them;
  - `localPath(winPath)`: a Windows path read from that registry or a config file, as a local path;
  - `windowsPath(localPath)`: the reverse, for a path written where a Windows program reads it, or
    null on the native Linux host.
*/

const SHELL_FOLDERS_KEY = 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders';

const HIVE_FILES = { hkcu: 'user.reg', hkey_current_user: 'user.reg', hklm: 'system.reg', hkey_local_machine: 'system.reg' };

// A missing key is the normal case for every caller, so registry errors read as "not there".
function quietly(read, fallback) {
  try {
    const value = read();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

/*
  `registry` is the caller's own reader ({ value, subkeys, valueNames }): the app has registry-js,
  the Watchdog regodit, so this module never loads either.
*/
function windowsHost({ env, documents, registry }) {
  return {
    id: 'native',
    kind: 'native',
    label: 'Windows',
    root: null,
    env: {
      APPDATA: env.APPDATA || null,
      LOCALAPPDATA: env.LOCALAPPDATA || null,
      PUBLIC: env.Public || env.PUBLIC || null,
      PROGRAMDATA: env.PROGRAMDATA || env.ProgramData || null,
      PROGRAMFILES: env.ProgramFiles || env.PROGRAMFILES || null,
      PROGRAMFILES_X86: env['ProgramFiles(x86)'] || env['PROGRAMFILES(X86)'] || null,
      USERPROFILE: env.USERPROFILE || null,
    },
    documents: () => (typeof documents === 'function' ? documents() : null),
    regValue: (hive, key, name) => (registry ? quietly(() => registry.value(hive, key, name), null) : null),
    regSubkeys: (hive, key) => (registry ? quietly(() => registry.subkeys(hive, key), []) || [] : []),
    regValueNames: (hive, key) => (registry && registry.valueNames ? quietly(() => registry.valueNames(hive, key), []) || [] : []),
    localPath: (winPath) => (winPath ? String(winPath) : null),
    windowsPath: (local) => (local ? String(local) : null),
  };
}

// `XDG_DOCUMENTS_DIR="$HOME/Documents"` from user-dirs.dirs, the file xdg-user-dirs maintains.
function xdgDocuments({ env, home }) {
  const config = env.XDG_CONFIG_HOME || path.join(home, '.config');
  try {
    const text = fs.readFileSync(path.join(config, 'user-dirs.dirs'), 'utf8');
    const match = /^XDG_DOCUMENTS_DIR="(.*)"$/m.exec(text);
    if (match) return match[1].replace(/^\$HOME/, home);
  } catch {
    /* no user-dirs file: fall back to the conventional folder */
  }
  return path.join(home, 'Documents');
}

function linuxHost({ env, home }) {
  const data = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return {
    id: 'linux',
    kind: 'linux',
    label: 'Linux',
    root: null,
    env: { APPDATA: data, LOCALAPPDATA: data, PUBLIC: null, PROGRAMDATA: null, PROGRAMFILES: null, PROGRAMFILES_X86: null, USERPROFILE: home },
    documents: () => xdgDocuments({ env, home }),
    regValue: () => null,
    regSubkeys: () => [],
    regValueNames: () => [],
    localPath: (p) => (p && path.isAbsolute(String(p)) ? String(p) : null),
    windowsPath: () => null,
  };
}

// C:\users\x -> <prefix>/drive_c/users/x, following the prefix's own drive letters. Proton starts
// some helpers under an extended-length path (\\?\X:\...), which names the same file.
function winToUnix(prefix, winPath) {
  const match = /^(?:\\\\\?\\)?([a-zA-Z]):[\\/]?(.*)$/.exec(String(winPath || ''));
  if (!match) return null;
  const letter = match[1].toLowerCase();
  let base;
  try {
    base = fs.realpathSync(path.join(prefix, 'dosdevices', `${letter}:`));
  } catch {
    if (letter === 'c') base = path.join(prefix, 'drive_c');
    else if (letter === 'z') base = '/';
    else return null;
  }
  return path.join(base, ...match[2].split(/[\\/]+/).filter(Boolean));
}

// <prefix>/drive_c/users/x -> C:\users\x; anything else through Z:, Wine's default view of /.
function unixToWin(prefix, localPath) {
  if (!localPath || !path.isAbsolute(String(localPath))) return null;
  const driveC = path.join(prefix, 'drive_c');
  const relative = path.relative(driveC, String(localPath));
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) return `C:\\${relative.split(path.sep).join('\\')}`;
  return `Z:${String(localPath).split(path.sep).join('\\')}`;
}

function expandWindowsVars(value, vars) {
  return String(value).replace(/%([^%]+)%/g, (whole, name) => {
    const key = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? vars[key] : whole;
  });
}

// What %VAR% means inside a prefix, for the expandable strings its registry holds.
function prefixWindowsVars(user) {
  const profile = `C:\\users\\${user}`;
  return {
    USERPROFILE: profile,
    APPDATA: `${profile}\\AppData\\Roaming`,
    LOCALAPPDATA: `${profile}\\AppData\\Local`,
    PUBLIC: 'C:\\users\\Public',
    ProgramData: 'C:\\ProgramData',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    SystemDrive: 'C:',
    SystemRoot: 'C:\\windows',
    windir: 'C:\\windows',
    USERNAME: user,
  };
}

// Proton runs as `steamuser`, plain Wine as the Linux login: take the profile folders that exist.
function prefixUsers(prefix) {
  try {
    return fs
      .readdirSync(path.join(prefix, 'drive_c', 'users'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() !== 'public')
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function prefixHost(prefix, user) {
  const driveC = path.join(prefix.path, 'drive_c');
  const usersDir = path.join(driveC, 'users');
  const profile = path.join(usersDir, user);
  const vars = prefixWindowsVars(user);
  const hiveFile = (hive) => {
    const name = HIVE_FILES[String(hive || '').toLowerCase()];
    return name ? path.join(prefix.path, name) : null;
  };
  const host = {
    id: `${prefix.kind}:${prefix.path}:${user}`,
    kind: prefix.kind,
    label: prefix.appid ? `${prefix.kind} ${prefix.appid}` : `${prefix.kind} ${path.basename(prefix.path)}`,
    root: prefix.path,
    appid: prefix.appid || null,
    env: {
      APPDATA: path.join(profile, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
      PUBLIC: path.join(usersDir, 'Public'),
      PROGRAMDATA: path.join(driveC, 'ProgramData'),
      PROGRAMFILES: path.join(driveC, 'Program Files'),
      PROGRAMFILES_X86: path.join(driveC, 'Program Files (x86)'),
      USERPROFILE: profile,
    },
    regValue: (hive, key, name) => {
      const file = hiveFile(hive);
      const entry = file ? quietly(() => wineRegistry.readValue(file, key, name), null) : null;
      if (!entry) return null;
      return entry.type === 'REG_EXPAND_SZ' ? expandWindowsVars(entry.value, vars) : entry.value;
    },
    regSubkeys: (hive, key) => {
      const file = hiveFile(hive);
      return file ? quietly(() => wineRegistry.listSubkeys(file, key), []) : [];
    },
    regValueNames: (hive, key) => {
      const file = hiveFile(hive);
      return file ? quietly(() => wineRegistry.listValueNames(file, key), []) : [];
    },
    localPath: (winPath) => winToUnix(prefix.path, winPath),
    windowsPath: (local) => unixToWin(prefix.path, local),
  };
  host.documents = () => host.localPath(host.regValue('HKCU', SHELL_FOLDERS_KEY, 'Personal')) || path.join(profile, 'Documents');
  return host;
}

/*
  `nativeDocuments` resolves the Windows Documents folder the way each caller always has (the app
  through registry-js, the Watchdog through regodit), so Windows behaviour does not move.
*/
function listHosts({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  nativeDocuments,
  nativeRegistry,
  extraPrefixes = [],
} = {}) {
  const machine = windowsHost({ env, documents: nativeDocuments, registry: nativeRegistry });
  if (platform === 'win32') return [machine];
  const hosts = [];
  // Windows-style variables set on purpose (a sandboxed run, a test) name one more host, listed first
  // since it was asked for.
  if (env.APPDATA || env.LOCALAPPDATA || env.PUBLIC || env.Public || env.PROGRAMDATA) {
    hosts.push({ ...machine, id: 'env', kind: 'env', label: 'environment', regValue: () => null, regSubkeys: () => [], regValueNames: () => [] });
  }
  hosts.push(linuxHost({ env, home }));
  for (const prefix of discoverPrefixes({ env, home, extra: extraPrefixes })) {
    for (const user of prefixUsers(prefix.path)) hosts.push(prefixHost(prefix, user));
  }
  return hosts;
}

// NTFS ignores case and Linux filesystems do not: compare paths the way the platform does.
function pathKey(p, platform = process.platform) {
  const resolved = path.resolve(String(p || ''));
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function hostPath(host, envName, ...segments) {
  const base = host && host.env && host.env[envName];
  return base ? path.join(base, ...segments) : null;
}

// The same folder on every host: hostPaths('APPDATA', 'GSE Saves') is one path on Windows.
function hostPaths(envName, ...segments) {
  return listHosts()
    .map((host) => hostPath(host, envName, ...segments))
    .filter(Boolean);
}

// A launcher installed once, in whichever host holds it: the first path that exists, else the first.
function firstExisting(paths) {
  return paths.find((p) => fs.existsSync(p)) || paths[0] || '';
}

function realKey(p) {
  try {
    return pathKey(fs.realpathSync(p));
  } catch {
    return pathKey(p);
  }
}

// The hosts a file or game folder belongs to: the prefix it sits in, else every host (a game kept
// outside its prefix, as Steam does for Proton, can write to any of them).
function hostsFor(p, hosts = listHosts()) {
  if (!p) return hosts;
  const key = realKey(p);
  const owners = hosts.filter((host) => host.root && (key === realKey(host.root) || key.startsWith(realKey(host.root) + path.sep)));
  return owners.length > 0 ? owners : hosts;
}

// The one host to write a game's files in: among hostsFor(p), the first where `found(host)` says
// they already are, else the first.
function hostFor(p, found = () => false, hosts = listHosts()) {
  const candidates = hostsFor(p, hosts);
  return candidates.find(found) || candidates[0] || null;
}

module.exports = { listHosts, pathKey, hostPath, hostPaths, hostsFor, hostFor, firstExisting, winToUnix, SHELL_FOLDERS_KEY };
