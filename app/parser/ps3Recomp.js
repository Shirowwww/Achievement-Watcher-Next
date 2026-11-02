'use strict';

/*
  PC ports of PS3 games built with PS3Recomp (sp00nznet/ps3recomp). A port is recognised from what
  it declares as data (installer/launch.txt, ps3recomp.toml, the runtime's sceNpTrophy.c), never by
  running anything. Its trophy list is the original game's TROPDIR/<NPWR>/TROPHY.TRP; its unlocks
  are the runtime's <PS3_GAMEDATA_ROOT or gamedata>/trophies/<NPWRnnnnn>.json. Dependency-free past
  the PS4 recomp readers, so the Watchdog loads it through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const { hostsFor } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const { isElf } = require(path.join(__dirname, '..', 'util', 'elf.js'));
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));
const schema = require(path.join(__dirname, 'ps4RecompSchema.js'));

const SOURCE = 'PS3 Recomp';
const TYPE = 'ps3recomp';
const SET_ID = /^NPWR\d{5}_\d{2}$/;
const TITLE_ID = /^[A-Z]{4}\d{5}$/;
const PROGRESS_NAME = /^NPWR\d{5}\.json$/i;
const GAME_FILE = /\.(?:elf|bin|self)$/i;
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;
const LAUNCH_FILE = path.join('installer', 'launch.txt');
const RUNTIME_SOURCE = path.join('ps3recomp', 'libs', 'network', 'sceNpTrophy.c');
// ps3recomp.toml names the toolkit; config.toml is too common a name to prove a port on its own.
const PROJECT_FILES = [
  { name: 'ps3recomp.toml', proves: true },
  { name: 'config.toml', proves: false },
];
const FALLBACK_DISCS = [[], ['game'], ['vfs'], ['gamedata', 'dev_bdvd']];
const SKIP_DIRECTORIES = /^(?:\.git|node_modules|ps3recomp|gamedata|PS3_GAME|shadercache|build|installer|\$recycle\.bin|windows)$/i;

const MAX_TEXT_BYTES = 64 * 1024;
const MAX_PROGRESS_BYTES = 1024 * 1024;
const MAX_GAME_ROOT_LEVELS = 4;
const MAX_SETS = 16;
const MAX_ROWS = 4096;
const MAX_TROPHY_ID = 9999;
const MAX_UNIX_S = 4102444800;
const MAX_INSTALL_DEPTH = 3;
const MAX_INSTALL_DIRECTORIES = 400;
const MAX_CACHED_LISTS = 64;

let debug = { log() {}, warn() {}, error() {} };
// The scan's shared directory listing (achievements.js); the Watchdog reads the folders directly.
let listDirectory = null;

module.exports.initDebug = ({ isDev, userDataPath, listDirectory: reader }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
  listDirectory = typeof reader === 'function' ? reader : null;
};

// Resolved on first use and overridable: the Watchdog locates userData its own way.
let _dataRoot = '';
function dataRoot() {
  if (!_dataRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _dataRoot = userDataDir();
  }
  return _dataRoot;
}
module.exports.setDataRoot = (dir) => {
  _dataRoot = dir ? path.resolve(String(dir)) : '';
};
const safeName = (value) => String(value || '').replace(/[^\w.-]/g, '_');
const iconDirFor = (appid) => path.join(dataRoot(), 'icon_cache', TYPE, safeName(appid));
const pathKey = (dir) => (process.platform === 'win32' ? path.resolve(dir).toLowerCase() : path.resolve(dir));

function isRegularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isRealDirectory(dir) {
  try {
    const stat = fs.lstatSync(dir);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function readDirectory(dir) {
  if (listDirectory) return listDirectory(dir) || [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readText(file) {
  const buffer = formats.readBounded(file, MAX_TEXT_BYTES);
  return buffer ? buffer.toString('utf8').replace(/^﻿/, '') : '';
}

// A path as the port would open it: relative to `base`, a Windows path mapped into its Wine prefix.
function localPath(base, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const host = WINDOWS_ABSOLUTE.test(text) && process.platform !== 'win32' ? hostsFor(base)[0] : null;
  return path.resolve(base, (host && host.localPath(text)) || text);
}

// A port built from its repository names the toolkit in CMakeLists.txt (PS3RECOMP_DIR), and once
// it has run, the runtime's own unlock file sits in gamedata/trophies of the folder it ran from.
const TOOLKIT_BUILD = /\bPS3RECOMP_DIR\b|\bps3recomp_runtime\b/i;
const namesToolkit = (root) => TOOLKIT_BUILD.test(readText(path.join(root, 'CMakeLists.txt')));
const ranHere = (root) => readDirectory(path.join(root, 'gamedata', 'trophies')).some((entry) => entry.isFile() && PROGRESS_NAME.test(entry.name));
const isBuiltPort = (root) => namesToolkit(root) || ranHere(root);

function hasEvidence(root) {
  return isRegularFile(path.join(root, LAUNCH_FILE)) || isRegularFile(path.join(root, RUNTIME_SOURCE)) || isRegularFile(path.join(root, 'ps3recomp.toml')) || isBuiltPort(root);
}

// The binary a repository build leaves in build/ or build/Release/, when there is exactly one.
function builtBinary(root) {
  const found = [];
  for (const dir of [path.join(root, 'build'), path.join(root, 'build', 'Release')]) {
    for (const entry of readDirectory(dir)) {
      if (!entry.isFile()) continue;
      const file = path.join(dir, entry.name);
      if (/\.exe$/i.test(entry.name) || (process.platform !== 'win32' && !path.extname(entry.name) && isElf(file))) found.push(file);
    }
  }
  return found.length === 1 ? found[0] : '';
}

// installer/launch.txt as data: exe=, cwd=, arg= and env=NAME=value lines, '#' comments.
function launchContract(root) {
  const text = readText(path.join(root, LAUNCH_FILE));
  if (!text) return null;
  const contract = { exe: '', cwd: root, args: [], env: {} };
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (!line || line.startsWith('#') || at <= 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (key === 'exe') contract.exe = localPath(root, value);
    else if (key === 'cwd') contract.cwd = localPath(root, value);
    else if (key === 'arg') contract.args.push(value);
    else if (key === 'env') {
      const split = value.indexOf('=');
      if (split > 0 && /^[A-Za-z_]\w*$/.test(value.slice(0, split))) contract.env[value.slice(0, split)] = value.slice(split + 1);
    }
  }
  if (contract.exe && !isRegularFile(contract.exe)) contract.exe = '';
  return contract;
}

/*
  input.sfo_path / input.elf_path of a toolkit project file, read line by line.
  shortcut: only one-line basic or literal strings, `\x` unescaped to `x`; move to a TOML parser if
  a real project writes multi-line or inline-table inputs.
*/
function projectInputs(root, file) {
  const inputs = [];
  let section = '';
  for (const line of readText(path.join(root, file)).split(/\r?\n/)) {
    const header = /^\s*\[([^\]]*)\]/.exec(line);
    if (header) section = header[1].trim();
    const entry = section === 'input' ? /^\s*(?:sfo_path|elf_path)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(line) : null;
    if (entry) inputs.push(entry[1] !== undefined ? entry[1].replace(/\\(.)/g, '$1') : entry[2]);
  }
  return inputs;
}

const isGameRoot = (dir) => isRegularFile(path.join(dir, 'PARAM.SFO')) && isRealDirectory(path.join(dir, 'TROPDIR'));

// The game folder holding PARAM.SFO and TROPDIR at or a few levels above a declared game file.
function gameRootFor(file) {
  let dir = path.dirname(file);
  for (let level = 0; level < MAX_GAME_ROOT_LEVELS; level++, dir = path.dirname(dir)) {
    if (isGameRoot(dir)) return dir;
    if (isGameRoot(path.join(dir, 'PS3_GAME'))) return path.join(dir, 'PS3_GAME');
  }
  return '';
}

// The one game a port declares, or '' when it declares none or more than one: nothing is guessed.
function declaredGame(root, launch) {
  const candidates = new Map();
  const add = (dir) => dir && candidates.set(pathKey(dir), dir);
  for (const arg of launch ? launch.args : []) if (GAME_FILE.test(arg)) add(gameRootFor(localPath(launch.cwd, arg)));
  let proved = !!launch || isRegularFile(path.join(root, RUNTIME_SOURCE)) || isBuiltPort(root);
  for (const project of PROJECT_FILES) {
    const inputs = projectInputs(root, project.name);
    if (inputs.length > 0 && project.proves) proved = true;
    for (const input of inputs) add(gameRootFor(localPath(root, input)));
  }
  if (!proved) return '';
  if (candidates.size === 0) for (const parts of FALLBACK_DISCS) if (isGameRoot(path.join(root, ...parts, 'PS3_GAME'))) add(path.join(root, ...parts, 'PS3_GAME'));
  return candidates.size === 1 ? [...candidates.values()][0] : '';
}

// The runtime saves <commId>.json without the set's _NN suffix, so two sets sharing a prefix share one file.
function trophySets(gameRoot) {
  const sets = readDirectory(path.join(gameRoot, 'TROPDIR'))
    .filter((entry) => entry.isDirectory() && SET_ID.test(entry.name))
    .slice(0, MAX_SETS)
    .map((entry) => ({ npcommid: entry.name, file: path.join(gameRoot, 'TROPDIR', entry.name, 'TROPHY.TRP') }))
    .filter((set) => isRegularFile(set.file));
  const shared = new Map();
  for (const set of sets) shared.set(set.npcommid.slice(0, 9), (shared.get(set.npcommid.slice(0, 9)) || 0) + 1);
  return sets.filter((set) => shared.get(set.npcommid.slice(0, 9)) === 1);
}

// Where the runtime writes: $PS3_GAMEDATA_ROOT/trophies, else gamedata/trophies, from its working folder.
function trophiesDir(root, launch) {
  const cwd = launch ? launch.cwd : root;
  const declared = (launch && launch.env.PS3_GAMEDATA_ROOT) || (process.platform === 'win32' ? process.env.PS3_GAMEDATA_ROOT : '');
  return path.join(localPath(cwd, declared || 'gamedata'), 'trophies');
}

// The games of the port at `root` (one per trophy set), [] when `root` is not one.
function detect(root) {
  if (!hasEvidence(root)) return [];
  const launch = launchContract(root);
  const gameRoot = declaredGame(root, launch);
  if (!gameRoot) {
    debug.log(`[ps3recomp] '${root}': no single game with PARAM.SFO and TROPDIR is declared`);
    return [];
  }
  const sfo = formats.readSfo(formats.readBounded(path.join(gameRoot, 'PARAM.SFO'), formats.MAX_SMALL_BYTES));
  const titleId = TITLE_ID.test(sfo.TITLE_ID || '') ? sfo.TITLE_ID : '';
  const dir = trophiesDir(root, launch);
  return trophySets(gameRoot).map((set) => ({
    appid: `ps3recomp-${set.npcommid}`,
    installRoot: root,
    gameRoot,
    titleId,
    title: sfo.TITLE || titleId,
    npcommid: set.npcommid,
    trophyFile: set.file,
    exe: (launch && launch.exe) || builtBinary(root),
    trophiesDir: dir,
    progressFile: path.join(dir, `${set.npcommid.slice(0, 9)}.json`),
  }));
}

// Every port at or below `dir`, a bounded breadth-first walk that never enters a port it found.
function discover(dir) {
  const games = [];
  const queue = [{ dir: path.resolve(String(dir || '')), depth: 0 }];
  let visited = 0;
  while (queue.length && visited++ < MAX_INSTALL_DIRECTORIES) {
    const current = queue.shift();
    try {
      const found = detect(current.dir);
      if (found.length > 0 || hasEvidence(current.dir)) {
        games.push(...found);
        continue;
      }
      if (current.depth >= MAX_INSTALL_DEPTH) continue;
      for (const entry of readDirectory(current.dir)) {
        if (entry.isDirectory() && !SKIP_DIRECTORIES.test(entry.name)) queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      }
    } catch (err) {
      debug.warn(`[ps3recomp] '${current.dir}' could not be read: ${err && err.message ? err.message : err}`);
    }
  }
  return games;
}

function scan(dir) {
  return discover(dir).map((target) => ({
    appid: target.appid,
    source: SOURCE,
    data: { type: TYPE, ...target, gameDir: target.installRoot, path: target.trophiesDir, trustedInstalled: true },
  }));
}

function readContainer(file) {
  const files = formats.readTrp(formats.readBounded(String(file || ''), formats.MAX_TRP_BYTES), formats.PS3_TRP_HEADER_SIZE);
  const container = files ? formats.readContainer(files, '', '') : null;
  return container && container.documents.size > 0 ? container : null;
}

// The trophy ids of a list, kept per file while it is unchanged: every unlock read needs them.
const listIds = new Map();
function trophyIds(file) {
  let stamp = '';
  try {
    const stat = fs.statSync(file);
    stamp = `${file}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    return null;
  }
  if (!listIds.has(stamp)) {
    const container = readContainer(file);
    const document = container && (container.documents.get('') || container.documents.values().next().value);
    if (listIds.size >= MAX_CACHED_LISTS) listIds.delete(listIds.keys().next().value);
    listIds.set(stamp, document ? new Set(document.trophies.map((trophy) => trophy.id)) : null);
  }
  return listIds.get(stamp);
}

// The rows of a runtime file the list describes: a row out of range or seen before is skipped.
function unlockRows(rows, ids) {
  const unlocked = new Map();
  for (const row of rows.slice(0, MAX_ROWS)) {
    const id = row && row.id;
    const time = row && row.timestamp;
    if (!Number.isSafeInteger(id) || id < 0 || id > MAX_TROPHY_ID || !Number.isSafeInteger(time) || time < 0 || time > MAX_UNIX_S) continue;
    if (ids.has(String(id)) && !unlocked.has(String(id))) unlocked.set(String(id), time);
  }
  return unlocked;
}

/*
  { unlocked: Map(id -> unix seconds, 0 when unknown), unstable }. The runtime rewrites the whole
  file in place (fopen "w"), so an empty or cut file is one being written: `unstable`, read again,
  never taken as everything relocked.
*/
function readUnlocks(data) {
  const info = data && typeof data === 'object' ? data : {};
  const none = { unlocked: new Map(), unstable: false };
  if (!info.progressFile || !PROGRESS_NAME.test(path.basename(String(info.progressFile)))) return none;
  const ids = trophyIds(info.trophyFile);
  if (!ids || !fs.existsSync(info.progressFile)) return none;
  const raw = formats.readBounded(info.progressFile, MAX_PROGRESS_BYTES);
  if (!raw) {
    debug.warn(`[ps3recomp] '${info.progressFile}' is not a regular file under ${MAX_PROGRESS_BYTES} bytes, ignored`);
    return none;
  }
  const text = raw.toString('utf8').replace(/^﻿/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { unlocked: new Map(), unstable: true };
  }
  if (!parsed || !Array.isArray(parsed.trophies)) return none;
  return { unlocked: unlockRows(parsed.trophies, ids), unstable: false };
}

// The file as sceNpTrophy.c writes it: its trophy_load() reads one "id" per line, never real JSON.
const unlocksText = (rows) => `{\n  "trophies": [${rows.map((row) => `\n    { "id": ${row.id}, "timestamp": ${row.timestamp} }`).join(',')}\n  ]\n}\n`;

// { text, changed } for an unlock file without trophy `id`; a file that does not parse throws.
function relockUnlocks(text, id) {
  const parsed = JSON.parse(String(text || '').replace(/^﻿/, ''));
  if (!parsed || !Array.isArray(parsed.trophies)) throw new Error('not a ps3recomp unlock file: no "trophies" list');
  const kept = parsed.trophies.filter((row) => !(row && row.id === id));
  if (kept.length === parsed.trophies.length) return { text, changed: false };
  return { text: unlocksText(kept.map((row) => ({ id: row.id, timestamp: Number(row.timestamp) || 0 }))), changed: true };
}

function getAchievements(data) {
  let read = readUnlocks(data);
  if (read.unstable) read = readUnlocks(data);
  return [...read.unlocked].map(([id, earned_time]) => ({ id, achieved: true, earned_time }));
}

// The disc's own art (PIC1/PIC0, ICON0), the trophy set's icon when the disc has none.
function gameArt(gameRoot, container, iconDir) {
  const art = (name) => (gameRoot && isRegularFile(path.join(gameRoot, name)) ? schema.toFileUrl(path.join(gameRoot, name)) : '');
  const background = art('PIC1.PNG') || art('PIC0.PNG');
  const icon = art('ICON0.PNG') || schema.writeIcon(path.join(iconDir, 'icon0.png'), container.icon0);
  return { header: background || icon, headerStandIn: !background, background, overlay: !!background, icon };
}

async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const container = readContainer(info.trophyFile);
  if (!container) throw new Error(`PS3 Recomp: no readable trophy list for ${info.appid} in '${info.trophyFile}'`);
  return schema.gameDataOf(info, container, lang, iconDirFor, (iconDir) => gameArt(String(info.gameRoot || ''), container, iconDir));
}

module.exports.SOURCE = SOURCE;
module.exports.TYPE = TYPE;
module.exports.detect = detect;
module.exports.discover = discover;
module.exports.scan = scan;
module.exports.readUnlocks = readUnlocks;
module.exports.getAchievements = getAchievements;
module.exports.relockUnlocks = relockUnlocks;
module.exports.getGameData = getGameData;
module.exports.iconDirFor = iconDirFor;
module.exports.isProgressName = (name) => PROGRESS_NAME.test(path.basename(String(name || '')));
// A port is listed by this source; one without its game yet is not a game for the unconfigured scan.
module.exports.isPortFolder = (dir) => hasEvidence(String(dir || ''));
module.exports._internal = { launchContract, projectInputs, gameRootFor, trophySets };
