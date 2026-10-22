'use strict';

/*
  Installs holding several PS4 games. The PROTOTYPE bundle is one run.py port whose two games are
  told apart by their trophy lists' titles. A PORTHEON package declares its UFC ports in the C source
  of its launcher (src/*.c): each port's folder, data folder and settings file, read as text, never
  run; GNSB's standalone UFC 3 keeps the same data folder. Synchronous and dependency-free: the
  Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const { hostPath, hostsFor } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));
const config = require(path.join(__dirname, 'ps4RecompConfig.js'));

// The bundle's launcher keeps its choice in <APPDATA>/prototype-port/launcher.json ("game": p1 | p2).
const PROTOTYPE = {
  port: 'prototype',
  launcher: '',
  settings: 'prototype-port',
  settingsName: 'launcher.json',
  env: 'THEORDER',
  marker: '',
  logsInRoot: true,
  initialGameKey: 'game',
  games: [
    { game: 'p1', title: 'PROTOTYPE', match: /^\s*prototype\s*[™®]?\s*$/i },
    { game: 'p2', title: 'PROTOTYPE 2', match: /^\s*prototype\s*2\s*[™®]?\s*$/i },
  ],
};

function identifyCollection(script) {
  const text = String(script || '');
  return /prototype2_ps4f\.elf/.test(text) && /THEORDER_EBOOT/.test(text) && /boot-linked\.bin/.test(text) ? PROTOTYPE : null;
}

/*
  The collection's games on the dump's trophy sets ([{ slot, title }]): each by its list's title,
  then any left by slot order. A set no game claims is left out, never guessed into another game.
*/
function assignByTitle(games, sets) {
  const free = sets.slice().sort((a, b) => a.slot - b.slot);
  const claimed = new Map();
  for (const entry of games) {
    const index = free.findIndex((set) => entry.match.test(String(set.title || '')));
    if (index >= 0) claimed.set(entry.game, free.splice(index, 1)[0].slot);
  }
  for (const entry of games) if (!claimed.has(entry.game) && free.length > 0) claimed.set(entry.game, free.shift().slot);
  return games.filter((entry) => claimed.has(entry.game)).map((entry) => ({ game: entry.game, title: entry.title, slot: claimed.get(entry.game) }));
}

// Only a folder laid out as a package is read: its sources are large.
const PACKAGE_GAMES = 'games';
const MAX_SOURCES = 32;
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_GAMES = 64;
const NAME = '[A-Za-z0-9_.-]{1,64}';

// A source's declaration, kept per file while it is unchanged: the package is checked on every scan.
const declarations = new Map();

function declarationOf(file) {
  let stamp = '';
  try {
    const stat = fs.statSync(file);
    stamp = `${file}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    return null;
  }
  if (!declarations.has(stamp)) {
    const body = formats.readBounded(file, MAX_SOURCE_BYTES);
    declarations.set(stamp, body ? declaration(body.toString('utf8')) : null);
  }
  return declarations.get(stamp);
}

function sourceFiles(packageRoot) {
  const src = path.join(packageRoot, 'src');
  try {
    return fs.readdirSync(src).filter((name) => /\.c$/i.test(name)).sort().slice(0, MAX_SOURCES).map((name) => path.join(src, name));
  } catch {
    return [];
  }
}

// The PS4 rows of `static const Game G[] = {...}`: {L"UFC3", L"UFC 3", L"UFC3.exe", L"UFC3Native", FALSE}.
function gameRows(source) {
  const table = /static\s+const\s+Game\s+\w+\s*\[[^\]]*\]\s*=\s*\{([\s\S]{0,65536}?)\n\};/.exec(source);
  if (!table) return [];
  const row = new RegExp(`\\{L"(${NAME})",\\s*L"[^"\\r\\n]*",\\s*L"([A-Za-z0-9_. -]{1,64}\\.exe)",\\s*L"(${NAME})",\\s*FALSE\\s*\\}`, 'g');
  return [...table[1].matchAll(row)].filter((match) => ![match[1], match[3]].some((value) => /^\.+$/.test(value))).slice(0, MAX_GAMES).map((match) => ({ id: match[1], exe: match[2], data: match[3] }));
}

// Where the launcher puts each port (PortDir), its data folder and settings file (SfPath) and its own ini.
function declaration(source) {
  const games = gameRows(source);
  const portDir = /static\s+void\s+PortDir\([^)]*\)\s*\{([^}]{1,2000})\}/.exec(source);
  const sfPath = /static\s+void\s+SfPath\([^)]*\)\s*\{([^}]{1,2000})\}/.exec(source);
  const folder = portDir && new RegExp(`Join\\(\\w+,\\s*\\w+,\\s*L"(${NAME})"\\)`).exec(portDir[1]);
  const variable = sfPath && /GetEnvironmentVariableW\(L"(LOCALAPPDATA|APPDATA)"/.exec(sfPath[1]);
  const ini = sfPath && /L"([A-Za-z0-9_.-]{1,64}\.ini)"/.exec(sfPath[1]);
  if (games.length === 0 || !folder || !variable || !ini) return null;
  const key = /L"([A-Za-z0-9_-]{0,32}%s[A-Za-z0-9_-]{0,32})"/.exec(portDir[1]);
  const own = new RegExp(`GetEnvironmentVariableW\\(L"(LOCALAPPDATA|APPDATA)",\\s*(\\w+),\\s*MAX_PATH\\);\\s*Join\\((\\w+),\\s*\\2,\\s*L"(${NAME})"\\);\\s*CreateDirectoryW\\(\\3,\\s*NULL\\);\\s*Join\\(\\w+,\\s*\\3,\\s*L"(${NAME}\\.ini)"\\)`).exec(source);
  return {
    games,
    folder: folder[1],
    variable: variable[1],
    settingsName: ini[1],
    keyTemplate: key ? key[1] : '',
    launcherIni: own ? { variable: own[1], folder: own[4], name: own[5] } : null,
  };
}

function isDirectory(dir) {
  try {
    return fs.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// port_<id> overrides in the launcher's own ini, from the first host that has it.
function overrides(packageRoot, found) {
  if (!found.launcherIni || !found.keyTemplate) return {};
  for (const host of hostsFor(packageRoot)) {
    const file = hostPath(host, found.launcherIni.variable, found.launcherIni.folder, found.launcherIni.name);
    const values = file ? config.readConfig(file) : {};
    if (Object.keys(values).length > 0) return values;
  }
  return {};
}

// The data folder of one port: in the host that already has its settings, else the first.
function dataDirOf(packageRoot, found, data) {
  const dirs = hostsFor(packageRoot).map((host) => hostPath(host, found.variable, data)).filter(Boolean);
  return dirs.find((dir) => fs.existsSync(path.join(dir, found.settingsName))) || dirs[0] || '';
}

// [{ root, port }] for each port a package at `packageRoot` declares.
function packageInstalls(packageRoot) {
  if (!isDirectory(path.join(packageRoot, 'src')) || !isDirectory(path.join(packageRoot, PACKAGE_GAMES))) return [];
  for (const file of sourceFiles(packageRoot)) {
    const found = declarationOf(file);
    if (!found) continue;
    const moved = overrides(packageRoot, found);
    return found.games.map((game) => {
      const override = String(moved[found.keyTemplate.replace('%s', game.id)] || '').trim();
      const root = override && path.isAbsolute(override) && isDirectory(override) ? override : path.join(packageRoot, found.folder, game.id);
      const dataDir = dataDirOf(packageRoot, found, game.data);
      return { root, port: { port: 'portheon', launcher: game.exe, settings: '', env: 'BB', marker: '', packaged: { id: game.id, dataDir, settingsFile: dataDir && path.join(dataDir, found.settingsName) } } };
    });
  }
  return [];
}

/*
  GNSB's standalone SacredFire port (UFC 3): <Name>.exe beside bin/sacredfire-game.exe keeps its data
  in <LOCALAPPDATA>/<Name>Native, as PORTHEON's rows spell it; the Linux build's start script names
  its folder under XDG_DATA_HOME, which the native host maps LOCALAPPDATA to.
*/
const SACREDFIRE_SETTINGS = ['sacredfire.ini', 'launcher.json'];
const SCRIPT_DATA = /XDG_DATA_HOME:-\$HOME\/\.local\/share\}\/([A-Za-z0-9_.-]{1,64})\}/;

function isFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function rootFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && pattern.test(entry.name)).map((entry) => entry.name);
  } catch {
    return [];
  }
}

// { exe, data }: the launcher and the data folder name of a standalone SacredFire port, or null.
function sacredfireLayout(dir) {
  const exes = rootFiles(dir, /\.exe$/i);
  if (isFile(path.join(dir, 'bin', 'sacredfire-game.exe')) && exes.length === 1) return { exe: exes[0], data: `${exes[0].replace(/\.exe$/i, '')}Native` };
  if (!isFile(path.join(dir, 'bin', 'sacredfire'))) return null;
  for (const name of rootFiles(dir, /\.sh$/i)) {
    const body = formats.readBounded(path.join(dir, name), MAX_SOURCE_BYTES);
    const named = body && SCRIPT_DATA.exec(body.toString('utf8'));
    if (named && !/^\.+$/.test(named[1])) return { exe: '', data: named[1] };
  }
  return null;
}

// Its data folder: beside the launcher (BB_DATA_DIR=.) when its settings are there, else per host.
function standaloneInstalls(dir) {
  const layout = sacredfireLayout(dir);
  if (!layout) return [];
  const candidates = [dir, ...hostsFor(dir).map((host) => hostPath(host, 'LOCALAPPDATA', layout.data)).filter(Boolean)];
  const settingsIn = (data) => SACREDFIRE_SETTINGS.map((name) => path.join(data, name)).find(isFile) || '';
  const dataDir = candidates.find((data) => settingsIn(data)) || candidates[1] || '';
  if (!dataDir) return [];
  const packaged = { id: layout.data, dataDir, settingsFile: settingsIn(dataDir) };
  return [{ root: dir, port: { port: 'sacredfire', launcher: layout.exe, settings: '', env: 'BB', marker: '', packaged } }];
}

// The package `dir` is, the one port `dir` is inside a package's games folder, or a standalone port.
function findPackage(dir) {
  const own = packageInstalls(dir);
  if (own.length > 0) return own.filter((install) => isDirectory(install.root));
  if (path.basename(path.dirname(dir)).toLowerCase() === PACKAGE_GAMES) {
    const resolved = path.resolve(dir).toLowerCase();
    const inPackage = packageInstalls(path.dirname(path.dirname(dir))).filter((install) => path.resolve(install.root).toLowerCase() === resolved);
    if (inPackage.length > 0) return inPackage;
  }
  return standaloneInstalls(dir);
}

module.exports = { identifyCollection, assignByTitle, findPackage };
