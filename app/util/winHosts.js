'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
// Joined onto __dirname: the Watchdog loads this file from app.asar.unpacked (see asarUnpack).
const { discoverPrefixes } = require(path.join(__dirname, 'winePrefixes.js'));
const wineRegistry = require(path.join(__dirname, 'wineRegistry.js'));

/*
  The places where Windows-style save folders live. On Windows that is this machine and nothing
  else, read exactly as before. On Linux every Wine/Proton prefix is one, plus the native host whose
  XDG data folder is where Linux builds of the same emulators write (gbe_fork, Goldberg).

  A host exposes the folders the save-root tables are built from (`env`) and its Documents folder.
  `env` values are absolute local paths, or null when the host has no such folder.
*/

const SHELL_FOLDERS_KEY = 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders';

function windowsHost({ env, documents }) {
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
      USERPROFILE: env.USERPROFILE || null,
    },
    documents: () => (typeof documents === 'function' ? documents() : null),
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
    env: { APPDATA: data, LOCALAPPDATA: data, PUBLIC: null, PROGRAMDATA: null, USERPROFILE: home },
    documents: () => xdgDocuments({ env, home }),
  };
}

// C:\users\x -> <prefix>/drive_c/users/x, following the prefix's own drive letters.
function winToUnix(prefix, winPath) {
  const match = /^([a-zA-Z]):[\\/]?(.*)$/.exec(String(winPath || ''));
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

function expandWindowsVars(value, vars) {
  return String(value).replace(/%([^%]+)%/g, (whole, name) => {
    const key = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? vars[key] : whole;
  });
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
  const usersDir = path.join(prefix.path, 'drive_c', 'users');
  const profile = path.join(usersDir, user);
  const winProfile = `C:\\users\\${user}`;
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
      PROGRAMDATA: path.join(prefix.path, 'drive_c', 'ProgramData'),
      USERPROFILE: profile,
    },
    toUnix: (winPath) => winToUnix(prefix.path, winPath),
    readRegistry: (key, name) => {
      const value = wineRegistry.readValue(path.join(prefix.path, 'user.reg'), key, name);
      return value ? value.value : null;
    },
  };
  host.documents = () => {
    const raw = host.readRegistry(SHELL_FOLDERS_KEY, 'Personal');
    const resolved = raw ? winToUnix(prefix.path, expandWindowsVars(raw, { USERPROFILE: winProfile })) : null;
    return resolved || path.join(profile, 'Documents');
  };
  return host;
}

/*
  `nativeDocuments` resolves the Windows Documents folder the way each caller always has (the app
  through registry-js, the Watchdog through regodit), so Windows behaviour does not move.
*/
function listHosts({ platform = process.platform, env = process.env, home = os.homedir(), nativeDocuments, extraPrefixes = [] } = {}) {
  if (platform === 'win32') return [windowsHost({ env, documents: nativeDocuments })];
  const hosts = [linuxHost({ env, home })];
  // Windows-style variables set on purpose (a sandboxed run, a test) still name one more host.
  if (env.APPDATA || env.LOCALAPPDATA || env.PUBLIC || env.Public || env.PROGRAMDATA) {
    hosts.push({ ...windowsHost({ env, documents: nativeDocuments }), id: 'env', kind: 'env', label: 'environment' });
  }
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

module.exports = { listHosts, pathKey, hostPath, winToUnix, SHELL_FOLDERS_KEY };
