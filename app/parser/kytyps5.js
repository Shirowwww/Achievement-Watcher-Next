'use strict';

/*
  KytyPS5 (PS5 emulator) trophy reader. The emulator keeps unlock state only, beside its binary:
  <root>\_Trophies\<titleId>\trophies_<userId>_<serviceLabel>.json ({ unlockedTrophies: [ids],
  unlockedAt: { id: tick } }, ticks being microseconds since 0001-01-01). The trophy list itself is
  read from the game: <game>\sce_sys\trophy2\trophy<NN>.ucp, a big-endian file container holding
  tropconf.json (grades, hidden flags), tropmeta_<locale>.json (texts) and trop<NNNN>.png icons.
  The game folders are the ones the launcher scans, listed in Kyty.ini ([Launcher] game_dirs).

  Dependency-free and synchronous on purpose: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const { hostPath, hostsFor } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const SOURCE = 'KytyPS5 Emulator';
const EMULATOR_BINARY = 'kyty_emulator.exe';
const TROPHY_DIR = '_Trophies';
const SETTINGS_FILE = 'Kyty.ini';
const PACKAGE_DIR = path.join('sce_sys', 'trophy2');
const UNLOCKS_FILE = /^trophies_(\d+)_(\d+)\.json$/i;
const PACKAGE_FILE = /^trophy(\d+)\.ucp$/i;
// Kyty refuses any other character in a title id, so anything else is not one of its folders.
const TITLE_ID = /^[A-Za-z0-9_-]{1,32}$/;

const UCP_MAGIC = 0xb228c60a;
const UCP_HEADER_SIZE = 0x40;
const UCP_ENTRY_SIZE = 0x40;
const UCP_NAME_SIZE = 0x20;
const UCP_MAX_ENTRIES = 4096;
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;
const MAX_UNLOCKS_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const RTC_TICK_UNIX_EPOCH = 62135596800000000n;
const RTC_TICK_MAX = 315537897599999999n;
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

/*
  The emulator folder for one watched folder: the folder holding _Trophies. People add whichever
  level they were looking at, the emulator folder, _Trophies itself or one game's folder inside it,
  so the climb stops at those two levels and never wanders further up.
*/
function emulatorRoot(dir) {
  const base = path.resolve(String(dir || ''));
  if (isDirectory(path.join(base, TROPHY_DIR))) return base;
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

// [Launcher] game_dirs (game_dir in older launchers) from the text of Kyty.ini.
function gameDirsFromSettings(text) {
  let section = '';
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]*)\]\s*$/);
    if (header) {
      section = header[1].trim().toLowerCase();
      continue;
    }
    const entry = line.match(/^\s*(game_dirs?)[ \t]*=[ \t]*(.*)$/i);
    if (section === 'launcher' && entry) values[entry[1].toLowerCase()] = entry[2];
  }
  const dirs = parseSettingsList(values.game_dirs);
  return dirs.length > 0 ? dirs : parseSettingsList(values.game_dir);
}

// A portable launcher keeps Kyty.ini beside itself, an installed one under ProgramData of its host.
function settingsFiles(root) {
  const files = [path.join(root, SETTINGS_FILE)];
  for (const host of hostsFor(root)) {
    const programData = hostPath(host, 'PROGRAMDATA', 'Kyty', SETTINGS_FILE);
    if (programData) files.push(programData);
  }
  return files;
}

function configuredGameDirs(root) {
  for (const file of settingsFiles(root)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    return gameDirsFromSettings(text).map((dir) => path.resolve(root, dir));
  }
  return [];
}

function readParam(gameDir) {
  return readJsonFile(path.join(gameDir, 'sce_sys', 'param.json'), MAX_JSON_BYTES);
}

// The launcher's own walk: a folder holding eboot.bin is a game and is not searched further.
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
      const titleId = param && typeof param.titleId === 'string' ? param.titleId.trim().toUpperCase() : '';
      if (titleId && !games.has(titleId)) games.set(titleId, { gameDir: dir, param });
      continue;
    }
    if (depth >= maxDepth) continue;
    for (const entry of readDirectory(dir)) {
      if (entry.isDirectory() && !entry.name.startsWith('$')) pending.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
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
function listFiles(gameDir) {
  const files = ['param.json', 'icon0.png', 'pic0.png'].map((name) => path.join('sce_sys', name));
  return files.concat(trophyPackages(gameDir).map((entry) => path.relative(gameDir, entry.file)));
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

/*
  Every title of one emulator folder whose trophy list can be read: from its game when the game is
  found, otherwise from the copy kept the last time it was. A title never seen with its game is left
  out: its unlock file alone names no trophy, and a list of bare numbers would be worse than nothing.
*/
function discover(dir) {
  const root = emulatorRoot(dir);
  if (!root) return [];
  const titles = titleFolders(root);
  if (titles.length === 0) return [];
  const games = findGames(configuredGameDirs(root));
  // Games unpacked beside the emulator, for a launcher that was never given a game folder.
  if (titles.some((title) => !games.has(title.titleId))) {
    for (const [titleId, game] of findGames([root], NEARBY_GAME_DEPTH)) if (!games.has(titleId)) games.set(titleId, game);
  }
  const found = [];
  for (const title of titles) {
    const game = games.get(title.titleId);
    // The same shape as a library record's data, so either can be handed to the readers below.
    const record = { titleId: title.titleId, root, path: title.dir };
    if (game && trophyPackages(game.gameDir).length > 0) {
      saveList(title.titleId, game.gameDir);
      found.push({ ...record, gameDir: game.gameDir, listDir: game.gameDir, installed: true });
    } else if (trophyPackages(savedListDir(title.titleId)).length > 0) {
      found.push({ ...record, gameDir: '', listDir: savedListDir(title.titleId), installed: false });
    } else {
      debug.log(`[kytyps5] ${title.titleId}: no game with a trophy package in the launcher's game folders`);
    }
  }
  return found;
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
    .map((entry) => ({ file: path.join(trophyDir, entry.name), label: parseInt(entry.name.match(UNLOCKS_FILE)[2], 10) }));
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
  Unlock state, merged across every user the emulator saved for: one library entry shows what has
  been earned on this machine, like the other emulators do.
*/
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const merged = new Map();
  for (const { file, label } of unlockFiles(String(info.path || ''))) {
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
module.exports._internal = { parseSettingsList, gameDirsFromSettings, readUcp, readPackage, tickToUnixSeconds, parseUnlocks, findGames, trophyKey };
