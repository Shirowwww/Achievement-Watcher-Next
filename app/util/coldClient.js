'use strict';

/*
  A ColdClient loader's own setup (gbe_fork's steamclient_experimental), read and checked. Read-only:
  ColdClient stays a source AW Next reads, it never sets one up.

  What gbe_fork's ColdClientLoader.ini documents and a real run confirmed: Exe= is absolute or
  relative to the loader; an empty AppId= falls back to a steam_appid.txt; the loader injects only
  into a program of its own architecture; it starts the exe as its child, passes its own arguments
  on, and with [Persistence] Mode=0 exits together with the game.
*/

const fs = require('fs');
const path = require('path');
const pe = require('./pe.js');
const emuIni = require('./emuIni.js');
const { hostsFor, pathKey } = require('./winHosts.js');

const INI_FILE = 'coldclientloader.ini';
const MAX_INI_BYTES = 256 * 1024;
const LOADERS = {
  x64: ['steamclient_loader_x64.exe'],
  x86: ['steamclient_loader_x86.exe', 'steamclient_loader_x32.exe', 'steamclient_loader.exe'],
};
const CLIENT_KEYS = { x64: 'steamclient64dll', x86: 'steamclientdll' };
const DEFAULT_CLIENTS = { x64: 'steamclient64.dll', x86: 'steamclient.dll' };

// Names as they are on disk, found case-insensitively: on Linux they are whatever the release shipped.
function entryNamed(dir, wanted) {
  try {
    return fs.readdirSync(dir).find((name) => wanted.includes(name.toLowerCase())) || '';
  } catch {
    return '';
  }
}

function isFile(file) {
  try {
    return !!file && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// Wine finds `Game.EXE` for a `game.exe` on disk; a case-sensitive filesystem needs each part matched.
function onDiskSpelling(file) {
  if (process.platform === 'win32' || fs.existsSync(file)) return file;
  const { root } = path.parse(file);
  let current = root;
  for (const part of file.slice(root.length).split(path.sep).filter(Boolean)) {
    const found = entryNamed(current, [part.toLowerCase()]);
    if (!found) return file;
    current = path.join(current, found);
  }
  return current;
}

// A path from the ini: absolute (a Windows one goes through the game's host on Linux) or relative to the loader.
function resolveFromLoader(loaderDir, value) {
  const text = String(value || '').trim().replace(/^"(.*)"$/, '$1');
  if (!text) return '';
  if (/^[a-z]:[\\/]/i.test(text) && process.platform !== 'win32') {
    for (const host of hostsFor(loaderDir)) {
      const local = host.localPath ? host.localPath(text) : '';
      if (local) return onDiskSpelling(local);
    }
    return '';
  }
  return onDiskSpelling(path.resolve(loaderDir, text.replace(/[\\/]+/g, path.sep)));
}

function readAppIdFile(dir) {
  const name = dir ? entryNamed(dir, ['steam_appid.txt']) : '';
  if (!name) return '';
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8').trim();
  } catch {
    return '';
  }
}

// The appid the loader hands the game: AppId=, else the first steam_appid.txt in its documented order.
function effectiveAppId(values, loaderDir, exe, runDir) {
  const fromIni = String(values.appid || '').trim();
  if (fromIni) return fromIni;
  const dirs = [loaderDir, exe ? path.dirname(exe) : '', runDir].filter(Boolean);
  for (const dir of [...dirs.map((d) => path.join(d, 'steam_settings')), ...dirs]) {
    const found = readAppIdFile(dir);
    if (found) return found;
  }
  return '';
}

function readConfig(loaderDir) {
  const name = entryNamed(loaderDir, [INI_FILE]);
  if (!name) return null;
  const file = path.join(loaderDir, name);
  let text;
  try {
    if (fs.statSync(file).size > MAX_INI_BYTES) return null;
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const doc = emuIni.parseIni(text);
  const values = emuIni.readIniSectionValues(doc, 'SteamClient');
  const persistence = emuIni.readIniSectionValues(doc, 'Persistence');
  const exe = resolveFromLoader(loaderDir, values.exe);
  let runDir = exe ? path.dirname(exe) : '';
  if (values.exerundir) runDir = resolveFromLoader(loaderDir, values.exerundir);
  return {
    file,
    exe,
    appIdFromIni: String(values.appid || '').trim(),
    appId: effectiveAppId(values, loaderDir, exe, runDir),
    clients: {
      x64: resolveFromLoader(loaderDir, values[CLIENT_KEYS.x64] || DEFAULT_CLIENTS.x64),
      x86: resolveFromLoader(loaderDir, values[CLIENT_KEYS.x86] || DEFAULT_CLIENTS.x86),
    },
    mode: Number(persistence.mode) || 0,
  };
}

function isInside(file, dir) {
  const relative = path.relative(pathKey(dir), pathKey(file));
  return !!relative && relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative);
}

/*
  `problem` names the first thing that stops this loader from serving the game, '' when none:
  'exe-missing' (Exe= empty or gone), 'exe-outside' (an exe outside the game folder), 'arch-mismatch'
  (no loader or steamclient of the exe's architecture), 'appid-mismatch' (another game's id).
*/
function diagnose({ loaderDir, gameDir = '', appid = '' } = {}) {
  if (!loaderDir) return null;
  const config = readConfig(loaderDir);
  if (!config) return null;
  const exeArch = isFile(config.exe) ? pe.exeArch(config.exe) : null;
  const loaderName = exeArch ? entryNamed(loaderDir, LOADERS[exeArch]) : '';
  const loader = loaderName ? path.join(loaderDir, loaderName) : '';
  const report = { configFile: config.file, exe: config.exe, exeArch: exeArch || '', appId: config.appId, loader, mode: config.mode, problem: '' };
  if (!isFile(config.exe)) report.problem = 'exe-missing';
  else if (gameDir && !isInside(config.exe, gameDir)) report.problem = 'exe-outside';
  else if (exeArch && (!loader || !isFile(config.clients[exeArch]))) report.problem = 'arch-mismatch';
  else if (appid && config.appId && /^\d+$/.test(String(appid)) && config.appId !== String(appid)) report.problem = 'appid-mismatch';
  // Mode 1 keeps the loader running until its own dialog is closed, and Mode 2 never starts the
  // game: either one would count that time as play, or start nothing.
  report.launchable = !report.problem && !!loader && config.mode === 0;
  return report;
}

// Whether the loader starts this very exe, so launching through it plays the configured game.
function startsExe(report, exe) {
  return !!(report && report.launchable && exe && pathKey(report.exe) === pathKey(exe));
}

// What to start instead of `exe`, checked again at launch: null sends the caller back to a direct launch.
function launchCommand({ loader, exe, appid = '' } = {}) {
  if (!loader || !isFile(loader)) return null;
  const report = diagnose({ loaderDir: path.dirname(loader), appid });
  if (!startsExe(report, exe) || pathKey(report.loader) !== pathKey(loader)) return null;
  return { file: report.loader, cwd: path.dirname(report.loader) };
}

module.exports = { readConfig, diagnose, startsExe, launchCommand, LOADERS };
