'use strict';

/*
  KytyPS5 (PS5 emulator) trophy reader. The emulator keeps unlock state only, beside its binary:
  <root>\_Trophies\<titleId>\trophies_<userId>_<serviceLabel>.json ({ unlockedTrophies: [ids],
  unlockedAt: { id: tick } }, ticks being microseconds since 0001-01-01). The trophy list itself is
  read from the game: <game>\sce_sys\trophy2\trophy<NN>.ucp, a big-endian file container holding
  tropconf.json (grades, hidden flags), tropmeta_<locale>.json (texts) and trop<NNNN>.png icons.
  The game folders are the ones the launcher scans, listed in Kyty.ini ([Launcher] game_dirs), and the
  user whose trophies count is the one set for the game there, else [GlobalConfiguration] user_id.

  Dependency-free and synchronous on purpose: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const { hostPath, hostsFor, pathKey } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const { withArchive } = require(path.join(__dirname, '..', 'util', 'zarchive.js'));

const SOURCE = 'KytyPS5 Emulator';
const EMULATOR_BINARY = 'kyty_emulator.exe';
const TROPHY_DIR = '_Trophies';
const SETTINGS_FILE = 'Kyty.ini';
const PACKAGE_DIR = path.join('sce_sys', 'trophy2');
const UNLOCKS_FILE = /^trophies_(\d+)_(\d+)\.json$/i;
const PACKAGE_FILE = /^trophy(\d+)\.ucp$/i;
// A ZArchive game dump, which the launcher runs without extracting it.
const ARCHIVE_FILE = /\.zar$/i;
// Kyty refuses any other character in a title id, so anything else is not one of its folders.
const TITLE_ID = /^[A-Za-z0-9_-]{1,32}$/;
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

const UCP_MAGIC = 0xb228c60a;
const UCP_HEADER_SIZE = 0x40;
const UCP_ENTRY_SIZE = 0x40;
const UCP_NAME_SIZE = 0x20;
const UCP_MAX_ENTRIES = 4096;
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;
const MAX_UNLOCKS_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
// Kyty.ini is a few KB; anything far larger is not the launcher's and is not read.
const MAX_SETTINGS_BYTES = 256 * 1024;
const RTC_TICK_UNIX_EPOCH = 62135596800000000n;
const RTC_TICK_MAX = 315537897599999999n;
const MAX_USER_ID = 0x7fffffff;
const GRADES = ['P', 'G', 'S', 'B'];

// Game discovery walks folders the user configured in the launcher; both bounds keep it cheap.
const MAX_GAME_DEPTH = 4;
const MAX_GAME_DIRECTORIES = 3000;
const NEARBY_GAME_DEPTH = 2;

// AW language -> Sony locale of tropmeta_<locale>.json and param.json's localizedParameters.
const LOCALE = {
  japanese: 'ja-JP', english: 'en-US', french: 'fr-FR', spanish: 'es-ES', german: 'de-DE', italian: 'it-IT',
  dutch: 'nl-NL', portuguese: 'pt-PT', russian: 'ru-RU', koreana: 'ko-KR', tchinese: 'zh-Hant', schinese: 'zh-Hans',
  finnish: 'fi-FI', swedish: 'sv-SE', danish: 'da-DK', norwegian: 'no-NO', polish: 'pl-PL', brazilian: 'pt-BR',
  turkish: 'tr-TR', latam: 'es-419', czech: 'cs-CZ', hungarian: 'hu-HU', greek: 'el-GR', thai: 'th-TH',
  vietnamese: 'vi-VN', indonesian: 'id-ID', ukrainian: 'uk-UA', slovak: 'sk-SK',
};
const ENGLISH_LOCALES = ['en-US', 'en-GB'];

// Where icons extracted from a trophy package are kept. Overridable: the Watchdog locates userData its own way.
let _iconRoot = '';

function iconRoot() {
  if (!_iconRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _iconRoot = path.join(userDataDir(), 'icon_cache', 'kytyps5');
  }
  return _iconRoot;
}

module.exports.setIconRoot = (dir) => {
  _iconRoot = dir ? path.resolve(String(dir)) : '';
};

let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function readDirectory(target) {
  try {
    return fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readJsonFile(file, maxBytes) {
  try {
    if (fs.statSync(file).size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const EXE_SCAN_BLOCK = 1024 * 1024;
const exeEvidence = new Map();

/*
  Before the first unlock there is no _Trophies folder, so the binary says whether this build keeps
  trophies at all: other forks never write them. One scan per version of the file.
*/
function isTrophyEmulator(exe) {
  let stat;
  try {
    stat = fs.statSync(exe);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  const key = `${exe}|${stat.size}|${stat.mtimeMs}`;
  if (exeEvidence.has(key)) return exeEvidence.get(key);
  const marker = Buffer.from(TROPHY_DIR);
  let found = false;
  let fd;
  try {
    fd = fs.openSync(exe, 'r');
    const block = Buffer.alloc(EXE_SCAN_BLOCK);
    let tail = Buffer.alloc(0);
    for (let read = fs.readSync(fd, block, 0, block.length, null); read > 0 && !found; read = fs.readSync(fd, block, 0, block.length, null)) {
      const chunk = Buffer.concat([tail, block.subarray(0, read)]);
      found = chunk.includes(marker);
      tail = chunk.subarray(Math.max(0, chunk.length - marker.length));
    }
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  exeEvidence.set(key, found);
  return found;
}

/*
  The emulator folder for one watched folder: the folder holding _Trophies. People add whichever
  level they were looking at, the emulator folder, _Trophies itself or one game's folder inside it,
  so the climb stops at those two levels and never wanders further up.
*/
function emulatorRoot(dir) {
  const base = path.resolve(String(dir || ''));
  if (isDirectory(path.join(base, TROPHY_DIR)) || isTrophyEmulator(path.join(base, EMULATOR_BINARY))) return base;
  if (path.basename(base).toLowerCase() === TROPHY_DIR.toLowerCase()) return path.dirname(base);
  const parent = path.dirname(base);
  if (path.basename(parent).toLowerCase() === TROPHY_DIR.toLowerCase() && TITLE_ID.test(path.basename(base))) return path.dirname(parent);
  return '';
}

/*
  The trophy folder of every title the emulator has saved unlocks for. The emulator creates it only
  to write one, so it counts even once a reset has emptied it: the game stays listed at 0%.
*/
function titleFolders(root) {
  const trophies = path.join(root, TROPHY_DIR);
  return readDirectory(trophies)
    .filter((entry) => entry.isDirectory() && TITLE_ID.test(entry.name))
    .map((entry) => ({ titleId: entry.name.toUpperCase(), dir: path.join(trophies, entry.name) }));
}

// QSettings writes a string list as comma-separated values, quoting any value that needs it.
function parseSettingsList(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value || value.startsWith('@')) return [];
  const items = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && i + 1 < value.length) {
      const hex = value.slice(i + 2).match(/^[0-9a-fA-F]{1,4}/);
      if (value[i + 1] === 'x' && hex) {
        current += String.fromCharCode(parseInt(hex[0], 16));
        i += 1 + hex[0].length;
      } else {
        current += value[++i];
      }
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current.trim());
  return items.filter(Boolean);
}

// Every "section/key" of Kyty.ini as a lower-cased map; array items read like "GameConfigurations/1\game_path".
function settingsValues(text) {
  const values = new Map();
  let section = '';
  for (const line of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]*)\]\s*$/);
    if (header) {
      section = header[1].trim().toLowerCase();
      continue;
    }
    // Split at the first '=' by index: a regex with a lazy key rescans a long line quadratically.
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq).trim() : '';
    if (key && !/^[;#]/.test(key)) values.set(`${section}/${key.toLowerCase()}`, line.slice(eq + 1).replace(/^[ \t]+/, ''));
  }
  return values;
}

// [Launcher] game_dirs (game_dir in older launchers) from the text of Kyty.ini.
function gameDirsFromValues(values) {
  const dirs = parseSettingsList(values.get('launcher/game_dirs'));
  return dirs.length > 0 ? dirs : parseSettingsList(values.get('launcher/game_dir'));
}

const gameDirsFromSettings = (text) => gameDirsFromValues(settingsValues(text));

// A portable launcher keeps Kyty.ini beside itself, an installed one under ProgramData of its host.
function settingsFiles(root) {
  const files = [path.join(root, SETTINGS_FILE)];
  for (const host of hostsFor(root)) {
    const programData = hostPath(host, 'PROGRAMDATA', 'Kyty', SETTINGS_FILE);
    if (programData) files.push(programData);
  }
  return files;
}

function readSettingsText(root) {
  for (const file of settingsFiles(root)) {
    try {
      if (fs.statSync(file).size > MAX_SETTINGS_BYTES) continue;
      return fs.readFileSync(file, 'utf8');
    } catch {
      /* the next place */
    }
  }
  return null;
}

// A launcher run by Wine writes C:/... paths, which only its prefix can turn into local ones.
function resolveConfigured(root, dir) {
  const host = hostsFor(root)[0];
  return path.resolve(root, (WINDOWS_ABSOLUTE.test(dir) && host && host.localPath(dir)) || dir);
}

// The per-game launcher settings, { index -> { path, user } }; game_path wins over basedir.
function gameConfigurations(values) {
  const entries = new Map();
  for (const [key, value] of values) {
    const match = key.match(/^gameconfigurations[\\/](\d{1,5})[\\/](game_path|basedir|user_id)$/);
    if (!match) continue;
    const entry = entries.get(match[1]) || {};
    if (match[2] === 'user_id') entry.user = value;
    else if (match[2] === 'game_path' || !entry.path) entry.path = value;
    entries.set(match[1], entry);
  }
  return entries;
}

function configuredPath(root, raw) {
  const dir = raw && parseSettingsList(raw)[0];
  return dir ? resolveConfigured(root, dir) : '';
}

// Where the launcher looks for games: its game folders, then the games it holds a setting for.
function configuredGameDirs(root) {
  const text = readSettingsText(root);
  if (text === null) return [];
  const values = settingsValues(text);
  const dirs = gameDirsFromValues(values).map((dir) => resolveConfigured(root, dir));
  for (const entry of gameConfigurations(values).values()) {
    const dir = configuredPath(root, entry.path);
    if (dir) dirs.push(dir);
  }
  return dirs;
}

function validUserId(value) {
  const text = String(value == null ? '' : value).trim();
  return /^\d{1,10}$/.test(text) && Number(text) <= MAX_USER_ID ? String(Number(text)) : '';
}

/*
  { userId, games } from the text of Kyty.ini: the global user and the one set per game folder, or
  null when a user id is there but unreadable (a file caught half written). A launcher that never
  saved a user gives an empty answer, which is information of its own: none.
*/
function userSettingsFromText(root, text) {
  const values = settingsValues(text);
  let userId = '';
  if (values.has('globalconfiguration/user_id')) {
    userId = validUserId(values.get('globalconfiguration/user_id'));
    if (!userId) return null;
  }
  const games = new Map();
  for (const entry of gameConfigurations(values).values()) {
    if (entry.user === undefined) continue;
    const user = validUserId(entry.user);
    if (!user) return null;
    const dir = configuredPath(root, entry.path);
    if (dir) games.set(pathKey(dir), user);
  }
  return { userId, games };
}

const lastUserSettings = new Map();

// The last settings that read cleanly stand in while the file is missing or unreadable.
function userSettings(root) {
  const key = pathKey(root);
  const text = readSettingsText(root);
  const parsed = text === null ? null : userSettingsFromText(root, text);
  if (parsed) {
    lastUserSettings.set(key, parsed);
    return parsed;
  }
  if (text !== null) debug.warn(`[kytyps5] ${SETTINGS_FILE} of '${root}' has an unreadable user id - the last good setting stays`);
  return lastUserSettings.get(key) || null;
}

/*
  The user whose trophies count for a game: the one set for its folder in the launcher, otherwise
  the emulator's global user. '' when the settings name none, and then every user counts.
*/
function activeUserId(info) {
  const root = String((info && info.root) || '');
  if (!root) return '';
  const settings = userSettings(root);
  if (!settings) return '';
  const own = info.gameDir ? settings.games.get(pathKey(info.gameDir)) : '';
  return own || settings.userId;
}

function readParam(gameDir) {
  return readJsonFile(path.join(gameDir, 'sce_sys', 'param.json'), MAX_JSON_BYTES);
}

function parseJson(buffer) {
  try {
    return buffer ? JSON.parse(buffer.toString('utf8')) : null;
  } catch {
    return null;
  }
}

function titleIdOf(param) {
  return param && typeof param.titleId === 'string' ? param.titleId.trim().toUpperCase() : '';
}

// An archive is opened again only once it changes: every scan walks the game folders.
const archiveParams = new Map();

function statKey(file) {
  try {
    const stat = fs.statSync(file);
    return `${file}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    return '';
  }
}

// The param.json of a .zar game dump whose root holds eboot.bin, or null.
function archiveParam(file) {
  const key = statKey(file);
  if (!key) return null;
  if (archiveParams.has(key)) return archiveParams.get(key);
  const param = withArchive(file, (archive) => (archive.isFile('eboot.bin') ? parseJson(archive.read(path.join('sce_sys', 'param.json'), MAX_JSON_BYTES)) : null));
  // An archive touched while it was read is read again next scan, never remembered as it was.
  if (statKey(file) === key) archiveParams.set(key, param);
  return param;
}

function addArchiveGame(games, file) {
  const param = archiveParam(file);
  const titleId = titleIdOf(param);
  if (titleId && !games.has(titleId)) games.set(titleId, { gameDir: file, param, archive: true });
}

// The launcher's own walk: a folder holding eboot.bin, or a .zar holding one, is a game and is not searched further.
function findGames(gameDirs, maxDepth = MAX_GAME_DEPTH) {
  const games = new Map();
  const pending = gameDirs.map((dir) => ({ dir, depth: 0 }));
  let visited = 0;
  // An index, not shift(): the queue can hold thousands of folders.
  while (visited < pending.length && visited < MAX_GAME_DIRECTORIES) {
    const { dir, depth } = pending[visited];
    visited++;
    if (isFile(path.join(dir, 'eboot.bin'))) {
      const param = readParam(dir);
      const titleId = titleIdOf(param);
      if (titleId && !games.has(titleId)) games.set(titleId, { gameDir: dir, param });
      continue;
    }
    // A game setting can name the archive itself.
    if (ARCHIVE_FILE.test(dir) && isFile(dir)) {
      addArchiveGame(games, dir);
      continue;
    }
    if (depth >= maxDepth) continue;
    for (const entry of readDirectory(dir)) {
      if (entry.isDirectory() && !entry.name.startsWith('$')) pending.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
      if (entry.isFile() && ARCHIVE_FILE.test(entry.name)) addArchiveGame(games, path.join(dir, entry.name));
    }
  }
  return games;
}

function trophyPackages(gameDir) {
  const dir = path.join(gameDir, PACKAGE_DIR);
  return readDirectory(dir)
    .filter((entry) => entry.isFile() && PACKAGE_FILE.test(entry.name))
    .map((entry) => ({ label: parseInt(entry.name.match(PACKAGE_FILE)[1], 10), file: path.join(dir, entry.name) }))
    .sort((a, b) => a.label - b.label);
}

// The files of a game the trophy list and its art are read from, relative to the game folder.
const ART_FILES = ['param.json', 'icon0.png', 'pic0.png'].map((name) => path.join('sce_sys', name));

function listFiles(gameDir) {
  return ART_FILES.concat(trophyPackages(gameDir).map((entry) => path.relative(gameDir, entry.file)));
}

// Where a copy of those files is kept, in the game's own layout, for when the game is gone.
function savedListDir(titleId) {
  return path.join(iconDirFor(titleId), 'game');
}

/*
  Copies what the list needs out of an installed game, so the game stays listed, as not installed,
  once it is deleted or moved. Only a file that changed is copied again.
*/
function saveList(titleId, gameDir) {
  const target = savedListDir(titleId);
  for (const relative of listFiles(gameDir)) {
    const from = path.join(gameDir, relative);
    const to = path.join(target, relative);
    try {
      const source = fs.statSync(from);
      if (source.size > MAX_PACKAGE_BYTES) continue;
      let copy = null;
      try {
        copy = fs.statSync(to);
      } catch {
        /* not saved yet */
      }
      if (copy && copy.size === source.size && Math.abs(copy.mtimeMs - source.mtimeMs) < 1000) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      fs.utimesSync(to, source.atime, source.mtime);
    } catch {
      /* a missing picture or a locked file costs only that file */
    }
  }
}

const savedArchives = new Set();

/*
  The same copy for a .zar game dump, which is the only way to read its list: the files come out of
  the archive. Once per archive version and process. True when the archive held a trophy package.
*/
function saveArchiveList(titleId, file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  const key = `${titleId}|${file}|${stat.size}|${stat.mtimeMs}`;
  if (savedArchives.has(key)) return true;
  const target = savedListDir(titleId);
  const saved = withArchive(file, (archive) => {
    const packages = archive
      .entries(PACKAGE_DIR)
      .filter((entry) => entry.isFile && PACKAGE_FILE.test(entry.name))
      .map((entry) => path.join(PACKAGE_DIR, entry.name));
    if (packages.length === 0) return false;
    for (const relative of ART_FILES.concat(packages)) {
      const data = archive.read(relative, MAX_PACKAGE_BYTES);
      if (!data) continue;
      const to = path.join(target, relative);
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, data);
      } catch {
        /* a locked copy costs only that file */
      }
    }
    return true;
  }) === true;
  if (saved) savedArchives.add(key);
  return saved;
}

// One listed title, read from its game when the game is found, else from the copy kept of it.
function titleRecord(record, game) {
  const { titleId } = record;
  // An archived game is read from the copy taken out of it.
  const archived = !!(game && game.archive) && saveArchiveList(titleId, game.gameDir);
  if (game && !game.archive && trophyPackages(game.gameDir).length > 0) {
    saveList(titleId, game.gameDir);
    return { ...record, gameDir: game.gameDir, listDir: game.gameDir, installed: true };
  }
  if (trophyPackages(savedListDir(titleId)).length > 0) {
    return { ...record, gameDir: archived ? game.gameDir : '', listDir: savedListDir(titleId), installed: archived };
  }
  debug.log(`[kytyps5] ${titleId}: no game with a trophy package in the launcher's game folders`);
  return null;
}

/*
  Every title of one emulator folder whose trophy list can be read: from its game when the game is
  found, otherwise from the copy kept the last time it was. A game the launcher knows is listed
  before its first unlock, when _Trophies does not exist yet. A title with unlocks but never seen
  with its game is left out: its unlock file alone names no trophy, and bare numbers are worse.
*/
function discover(dir) {
  const root = emulatorRoot(dir);
  if (!root) return [];
  const games = findGames(configuredGameDirs(root));
  // Games unpacked beside the emulator, for a launcher that was never given a game folder.
  for (const [titleId, game] of findGames([root], NEARBY_GAME_DEPTH)) if (!games.has(titleId)) games.set(titleId, game);
  const records = new Map();
  for (const title of titleFolders(root)) records.set(title.titleId, { titleId: title.titleId, root, path: title.dir });
  for (const titleId of games.keys()) {
    // The same shape as a library record's data, so either can be handed to the readers below.
    if (!records.has(titleId) && TITLE_ID.test(titleId)) records.set(titleId, { titleId, root, path: path.join(root, TROPHY_DIR, titleId) });
  }
  return [...records.values()].map((record) => titleRecord(record, games.get(record.titleId))).filter(Boolean);
}

function scan(dir) {
  return discover(dir).map((title) => ({
    appid: title.titleId,
    source: SOURCE,
    data: { type: 'kytyps5', ...title, trustedInstalled: title.installed },
  }));
}

// Splits a trophy package into its named files, refusing any entry that points outside it.
function readUcp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < UCP_HEADER_SIZE || buffer.length > MAX_PACKAGE_BYTES) return null;
  if (buffer.readUInt32BE(0) !== UCP_MAGIC || buffer.readUInt32BE(4) !== 1) return null;
  const size = Number(buffer.readBigUInt64BE(8));
  const count = buffer.readUInt32BE(0x10);
  const toc = buffer.readUInt32BE(0x14);
  if (size < UCP_HEADER_SIZE || size > buffer.length || count > UCP_MAX_ENTRIES || toc > size) return null;
  if (0x20 + count * UCP_ENTRY_SIZE > size - toc) return null;
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const entry = toc + 0x20 + i * UCP_ENTRY_SIZE;
    const rawName = buffer.subarray(entry, entry + UCP_NAME_SIZE);
    const end = rawName.indexOf(0);
    const name = rawName.subarray(0, end < 0 ? UCP_NAME_SIZE : end).toString('latin1');
    const offset = Number(buffer.readBigUInt64BE(entry + 0x20));
    const length = Number(buffer.readBigUInt64BE(entry + 0x28));
    if (offset > size || length > size - offset) return null;
    files.set(name, buffer.subarray(offset, offset + length));
  }
  return files;
}

function packageJson(files, name) {
  const data = files.get(name);
  if (!data) return null;
  try {
    return JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }
}

function readId(value) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  return /^\d{1,9}$/.test(text) ? parseInt(text, 10) : -1;
}

function metaFor(files, conf, locale) {
  const tried = [locale, ...ENGLISH_LOCALES, conf && conf.defaultLanguage].filter(Boolean);
  for (const candidate of tried) {
    const meta = packageJson(files, `tropmeta_${candidate}.json`);
    if (meta && meta.metadata && typeof meta.metadata === 'object') return { locale: candidate, texts: meta.metadata };
  }
  return null;
}

function textsById(texts) {
  const byId = new Map();
  for (const entry of Array.isArray(texts && texts.trophyMetadata) ? texts.trophyMetadata : []) {
    if (entry && typeof entry === 'object') byId.set(readId(entry.id), entry);
  }
  return byId;
}

// One trophy package as { title, trophies: [{ id, grade, hidden, name, detail, englishName, englishDetail, icon }] }.
function readPackage(file, locale) {
  let buffer;
  try {
    if (fs.statSync(file).size > MAX_PACKAGE_BYTES) return null;
    buffer = fs.readFileSync(file);
  } catch {
    return null;
  }
  const files = readUcp(buffer);
  const conf = files && packageJson(files, 'tropconf.json');
  if (!conf || !Array.isArray(conf.trophies)) return null;
  const meta = metaFor(files, conf, locale);
  if (!meta) return null;
  const english = ENGLISH_LOCALES.includes(meta.locale) ? meta : metaFor(files, conf, ENGLISH_LOCALES[0]);
  const local = textsById(meta.texts);
  const fallback = textsById(english && english.texts);
  const trophies = [];
  for (const definition of conf.trophies) {
    const id = readId(definition && definition.id);
    const grade = String((definition && definition.grade) || '');
    if (id < 0 || !GRADES.includes(grade)) continue;
    const text = local.get(id) || fallback.get(id) || {};
    const englishText = fallback.get(id) || {};
    trophies.push({
      id,
      grade,
      hidden: definition.hidden === true,
      name: typeof text.name === 'string' ? text.name : '',
      detail: typeof text.detail === 'string' ? text.detail : '',
      englishName: typeof englishText.name === 'string' ? englishText.name : '',
      englishDetail: typeof englishText.detail === 'string' ? englishText.detail : '',
      icon: files.get(`trop${String(id).padStart(4, '0')}.png`) || null,
    });
  }
  const title = meta.texts.titleMetadata && typeof meta.texts.titleMetadata.name === 'string' ? meta.texts.titleMetadata.name : '';
  return { title, trophies };
}

// The first package keeps its plain trophy ids; a second one (a separate trophy set) is prefixed.
function trophyKey(label, id) {
  return label === 0 ? String(id) : `${label}-${id}`;
}

function iconDirFor(titleId) {
  return path.join(iconRoot(), String(titleId || '').toUpperCase());
}

function writeIcon(dir, label, id, image) {
  if (!image || image.length === 0) return '';
  const file = path.join(dir, `${trophyKey(label, id)}.png`);
  try {
    if (!isFile(file) || fs.statSync(file).size !== image.length) fs.writeFileSync(file, image);
    return toFileUrl(file);
  } catch {
    return '';
  }
}

function localizedTitle(param, locale) {
  const localized = param && param.localizedParameters && typeof param.localizedParameters === 'object' ? param.localizedParameters : {};
  for (const key of [locale, localized.defaultLanguage, ...ENGLISH_LOCALES]) {
    const entry = key && localized[key];
    if (entry && typeof entry.titleName === 'string' && entry.titleName.trim()) return entry.titleName.trim();
  }
  return '';
}

function toFileUrl(file) {
  return 'file:///' + file.replace(/\\/g, '/');
}

function fileUrl(file) {
  return isFile(file) ? toFileUrl(file) : '';
}

// The game's own key art and icon, which PS5 games ship in sce_sys.
function gameArt(gameDir) {
  const background = fileUrl(path.join(gameDir, 'sce_sys', 'pic0.png'));
  const icon = fileUrl(path.join(gameDir, 'sce_sys', 'icon0.png'));
  return {
    header: background || icon,
    // The square icon only stands in until SteamGridDB's landscape art replaces it.
    headerStandIn: !background,
    background,
    // Raw key art, not a pre-darkened Steam page background.
    overlay: !!background,
    icon,
  };
}

function trophyEntry(trophy, label, icon) {
  return {
    name: trophyKey(label, trophy.id),
    displayName: trophy.name || trophy.englishName || String(trophy.id),
    description: trophy.detail || trophy.englishDetail,
    rarityName: trophy.englishName || undefined,
    rarityDescription: trophy.englishDetail || undefined,
    hidden: trophy.hidden ? 1 : 0,
    type: trophy.grade,
    icon,
    icongray: icon,
  };
}

async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const locale = LOCALE[String(lang || '').toLowerCase()] || ENGLISH_LOCALES[0];
  // The game itself when installed, the copy kept of it otherwise.
  const listDir = String(info.listDir || info.gameDir || '');
  const packages = trophyPackages(listDir);
  if (packages.length === 0) throw new Error(`KytyPS5: no trophy package under '${listDir}'`);

  const iconDir = iconDirFor(info.titleId);
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    /* the trophies still list, just without their art */
  }

  const art = gameArt(listDir);
  const list = [];
  let packageTitle = '';
  for (const { label, file } of packages) {
    const parsed = readPackage(file, locale);
    if (!parsed) {
      debug.warn(`[kytyps5] '${file}' is not a readable trophy package`);
      continue;
    }
    packageTitle = packageTitle || parsed.title;
    // A trophy the package carries no picture for shows the game's icon, never a broken image.
    for (const trophy of parsed.trophies) list.push(trophyEntry(trophy, label, writeIcon(iconDir, label, trophy.id, trophy.icon) || art.icon));
  }
  if (list.length === 0) throw new Error(`KytyPS5: the trophy packages of ${info.titleId} list no trophy`);

  return {
    name: localizedTitle(readParam(listDir), locale) || packageTitle || String(info.titleId || ''),
    appid: String(info.titleId || ''),
    system: 'playstation',
    img: art,
    achievement: { total: list.length, list },
  };
}

/*
  A tick is past 2^53, so JSON.parse rounds it to a multiple of 8 microseconds: harmless at the
  one-second precision kept here. A string is read exactly.
*/
function tickToUnixSeconds(value) {
  let tick;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0;
    tick = BigInt(Math.round(value));
  } else {
    const text = String(value == null ? '' : value);
    if (!/^\d{1,18}$/.test(text)) return 0;
    tick = BigInt(text);
  }
  if (tick <= RTC_TICK_UNIX_EPOCH || tick > RTC_TICK_MAX) return 0;
  return Number((tick - RTC_TICK_UNIX_EPOCH) / 1000000n);
}

function unlockFiles(trophyDir) {
  return readDirectory(trophyDir)
    .filter((entry) => entry.isFile() && UNLOCKS_FILE.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(UNLOCKS_FILE);
      return { file: path.join(trophyDir, entry.name), user: String(Number(match[1])), label: parseInt(match[2], 10) };
    });
}

// { id -> unix seconds } for one unlock file, or null when it is not one the emulator wrote.
function parseUnlocks(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.unlockedTrophies)) return null;
  const times = json.unlockedAt && typeof json.unlockedAt === 'object' ? json.unlockedAt : {};
  const unlocked = new Map();
  for (const value of json.unlockedTrophies) {
    const id = readId(value);
    if (id >= 0) unlocked.set(id, tickToUnixSeconds(times[String(id)]));
  }
  return unlocked;
}

/*
  Unlock state of the active user (the one the launcher runs the game as). When the settings name
  none, every user's file is merged instead, so a launcher we cannot read never hides a game.
*/
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const merged = new Map();
  const active = activeUserId(info);
  for (const { file, label, user } of unlockFiles(String(info.path || ''))) {
    if (active && user !== active) continue;
    const unlocked = parseUnlocks(readJsonFile(file, MAX_UNLOCKS_BYTES));
    if (!unlocked) {
      debug.log(`[kytyps5] '${file}' is not a trophy unlock file - left unread`);
      continue;
    }
    for (const [id, time] of unlocked) {
      const key = trophyKey(label, id);
      const previous = merged.get(key);
      if (previous === undefined || previous === 0 || (time > 0 && time < previous)) merged.set(key, time);
    }
  }
  return [...merged].map(([id, earned_time]) => ({ id, achieved: true, earned_time }));
}

module.exports.SOURCE = SOURCE;
module.exports.EMULATOR_BINARY = EMULATOR_BINARY;
module.exports.TROPHY_DIR = TROPHY_DIR;
module.exports.UNLOCKS_FILE = UNLOCKS_FILE;
module.exports.emulatorRoot = emulatorRoot;
module.exports.discover = discover;
module.exports.scan = scan;
module.exports.getGameData = getGameData;
module.exports.getAchievements = getAchievements;
module.exports.iconDirFor = iconDirFor;
module.exports.activeUserId = activeUserId;
module.exports._internal = { parseSettingsList, gameDirsFromSettings, settingsValues, userSettingsFromText, readUcp, readPackage, tickToUnixSeconds, parseUnlocks, findGames, trophyKey };
