'use strict';

// XLiveLessNess replaces xlive.dll for GFWL games; nothing here is Steam-shaped, so the whole game
// is read from the install itself: <game>\xlive.dll (runtime), <game>\<game>.exe.cfg (XML, carries
// <titleid>), <game>\<game>.exe (SPAFILE resource: achievement list + icons), and
// <root>\XLiveLessNess\profile\title\<TITLEID>\<profile>\achievements.dat (unlock records, 16
// little-endian bytes each: id u32, FILETIME u32x2, flags u32 - unlike the big-endian SPAFILE, see xllnSpa.js).
// Only unlocked entries are appended, never rewritten, so a truncated file must be refused outright
// or a half-written read would relock and replay every achievement as new.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const spa = require(path.join(__dirname, 'xllnSpa.js'));
const { hostPath, hostsFor } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const RUNTIME_DLL = 'xlive.dll';
const STORAGE_DIR = 'XLiveLessNess';
const STATE_FILE = 'achievements.dat';
const RECORD_SIZE = 16;
const MAX_STATE_BYTES = 1024 * 1024;
const FILETIME_UNIX_EPOCH_MS = 11644473600000n;
const TITLE_ID_RE = /^[0-9A-F]{8}$/;

// Discovery walks a folder the user pointed at, which can be a whole games library. Both bounds are
// what keeps that from turning into a full-drive walk.
const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 3000;
const SKIP_DIRECTORIES = new Set([
  '$recycle.bin',
  'system volume information',
  'windows',
  'node_modules',
  '.git',
  'appdata',
  'programdata',
  STORAGE_DIR.toLowerCase(),
]);

// Where achievement icons extracted from the executable are kept. Resolved on first use and
// overridable, since the Watchdog loads this module from its own process, locating userData its own way.
let _iconRoot = '';

function iconRoot() {
  if (!_iconRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _iconRoot = path.join(userDataDir(), 'icon_cache', 'xlln');
  }
  return _iconRoot;
}

module.exports.setIconRoot = (dir) => {
  _iconRoot = dir ? path.resolve(String(dir)) : '';
};

let debug = { log() {}, warn() {}, error() {} };
// The app hands its scan-wide listing memo here (util/dirCache.js); the Watchdog, which loads this
// file on its own, keeps reading the folders directly.
let listDirectory = null;

module.exports.initDebug = ({ isDev, userDataPath, listDirectory: reader }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
  listDirectory = typeof reader === 'function' ? reader : null;
};

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function readDirectory(target) {
  if (listDirectory) return listDirectory(target) || [];
  try {
    return fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

/*
  The .exe.cfg is XML, written by whoever packaged the game: UTF-8, UTF-16 with or without a byte
  order mark. Decode it before looking for the one value that matters.
*/
function decodeConfig(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    if (swapped.length % 2 !== 0) throw new Error('truncated UTF-16 title config');
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  // No mark: NUL bytes in an XML document mean it is UTF-16 little-endian.
  if (buffer.includes(0x00)) return buffer.toString('utf16le');
  return buffer.toString('utf8');
}

function parseTitleConfig(text) {
  const title = /<titleid\b[^>]*>\s*([0-9a-fA-F]{1,8})\s*<\/titleid>/i.exec(String(text || ''));
  if (!title) return null;
  const titleId = title[1].toUpperCase().padStart(8, '0');
  if (!TITLE_ID_RE.test(titleId)) return null;
  const version = /<titleversion\b[^>]*>\s*([^<]+?)\s*<\/titleversion>/i.exec(String(text || ''));
  return { titleId, titleVersion: version ? version[1].trim() : '' };
}

function readTitleConfig(file) {
  try {
    return parseTitleConfig(decodeConfig(fs.readFileSync(file)));
  } catch {
    return null;
  }
}

// Reading a game executable costs tens of megabytes, and discovery visits the same one on every
// scan. Keyed by the file's own size and timestamp, so a patched game is read again.
const spaCache = new Map();
const SPA_CACHE_MAX = 32;

function loadSpa(exePath, { extract = spa.extractSpa, label = 'SPAFILE' } = {}) {
  let key;
  try {
    const stat = fs.statSync(exePath);
    key = `${path.resolve(exePath).toLowerCase()}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
  if (spaCache.has(key)) {
    const hit = spaCache.get(key);
    spaCache.delete(key);
    spaCache.set(key, hit); // least-recently-used ordering
    return hit;
  }

  let parsed = null;
  try {
    parsed = spa.parseSpa(extract(exePath), { onSkip: (message) => debug.log(`[xlln] '${exePath}': ${message}`) });
  } catch (err) {
    debug.log(`[xlln] '${exePath}' carries no readable ${label} => ${err.message || err}`);
    parsed = null;
  }
  spaCache.set(key, parsed);
  while (spaCache.size > SPA_CACHE_MAX) spaCache.delete(spaCache.keys().next().value);
  return parsed;
}

function formatTitleId(value) {
  if (!Number.isInteger(value) || value < 0) return '';
  return value.toString(16).toUpperCase().padStart(8, '0');
}

// One folder, inspected: it is an XLiveLessNess install when the runtime sits beside an executable
// whose .cfg names a title, and that executable really carries the achievement list the id claims.
function inspect(directory) {
  const entries = readDirectory(directory);
  const byLowerName = new Map(entries.filter((entry) => entry.isFile()).map((entry) => [entry.name.toLowerCase(), entry.name]));
  if (!byLowerName.has(RUNTIME_DLL)) return null;

  for (const [lower, name] of byLowerName) {
    if (!lower.endsWith('.exe.cfg')) continue;
    const exeName = byLowerName.get(lower.slice(0, -4));
    if (!exeName) continue;

    const configPath = path.join(directory, name);
    const config = readTitleConfig(configPath);
    if (!config) continue;

    const exePath = path.join(directory, exeName);
    const parsed = loadSpa(exePath);
    if (!parsed || parsed.achievements.length === 0) continue;

    const spaTitleId = formatTitleId(parsed.titleId);
    if (spaTitleId && spaTitleId !== config.titleId) {
      debug.log(`[xlln] '${exePath}' declares title ${spaTitleId} but '${name}' says ${config.titleId} - ignored`);
      continue;
    }

    return {
      titleId: config.titleId,
      titleVersion: config.titleVersion,
      gameDir: path.resolve(directory),
      exe: exePath,
      config: configPath,
      name: spa.titleName(parsed) || path.basename(exeName, path.extname(exeName)),
      total: parsed.achievements.length,
    };
  }
  return null;
}

// Walk `dir` and the folders below it, breadth first, within the bounds above.
function discover(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  if (!root || !isDirectory(root)) return [];

  const found = [];
  const seenTitles = new Set();
  const queue = [{ directory: root, depth: 0 }];
  const visited = new Set();

  for (let index = 0; index < queue.length && visited.size < MAX_DIRECTORIES; index += 1) {
    const current = queue[index];
    const key = current.directory.toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);

    const game = inspect(current.directory);
    if (game && !seenTitles.has(game.titleId)) {
      seenTitles.add(game.titleId);
      found.push(game);
      continue; // the game folder is the leaf: nothing below it is another install
    }

    if (current.depth >= MAX_DEPTH) continue;
    for (const entry of readDirectory(current.directory)) {
      if (!entry.isDirectory()) continue;
      const name = entry.name.toLowerCase();
      if (name.startsWith('.') || SKIP_DIRECTORIES.has(name)) continue;
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return found;
}

/*
  Where the runtime keeps its profiles. It writes beside the game by default; a shared install is
  told to use the per-user folder instead, and both are read because either can be the live one.
*/
function storageRoots(gameDir) {
  const roots = [];
  const add = (candidate) => {
    if (!candidate) return;
    const resolved = path.resolve(candidate);
    if (!roots.some((entry) => entry.toLowerCase() === resolved.toLowerCase())) roots.push(resolved);
  };
  if (gameDir) {
    add(path.join(gameDir, STORAGE_DIR));
    add(path.join(path.dirname(gameDir), STORAGE_DIR));
  }
  // The per-user folder of the host the game runs in (its Wine prefix on Linux).
  for (const host of hostsFor(gameDir)) add(hostPath(host, 'LOCALAPPDATA', STORAGE_DIR));
  return roots;
}

// Every profile's state file for one title, newest first.
function stateFiles({ gameDir, titleId } = {}) {
  const id = String(titleId || '').trim().toUpperCase();
  if (!TITLE_ID_RE.test(id)) return [];

  const files = [];
  const seen = new Set();
  for (const root of storageRoots(gameDir)) {
    const titleRoot = path.join(root, 'profile', 'title', id);
    for (const entry of readDirectory(titleRoot)) {
      if (!entry.isDirectory()) continue;
      const file = path.join(titleRoot, entry.name, STATE_FILE);
      const key = file.toLowerCase();
      if (seen.has(key)) continue;
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) continue;
        seen.add(key);
        files.push({ file, profile: entry.name, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        /* a profile folder without a state file has simply unlocked nothing */
      }
    }
  }
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.file.localeCompare(right.file));
}

function filetimeToUnixSeconds(low, high) {
  const ticks = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
  if (ticks === 0n) return 0;
  const ms = ticks / 10000n - FILETIME_UNIX_EPOCH_MS;
  if (ms <= 0n || ms > BigInt(Number.MAX_SAFE_INTEGER)) return 0;
  return Math.floor(Number(ms) / 1000);
}

// Decode one state file into { id -> earned_time }. Returns null - never a partial answer - when the
// file is not a whole number of records: a half-written read would relock and replay the tail.
function parseState(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length > MAX_STATE_BYTES) return null;
  if (buffer.length % RECORD_SIZE !== 0) return null;

  const unlocked = new Map();
  for (let at = 0; at < buffer.length; at += RECORD_SIZE) {
    const id = buffer.readUInt32LE(at);
    const time = filetimeToUnixSeconds(buffer.readUInt32LE(at + 4), buffer.readUInt32LE(at + 8));
    // The same achievement can appear twice across a rewrite. Keep the earliest real timestamp: it
    // is the one the player actually earned it at.
    const previous = unlocked.get(id);
    if (previous === undefined || previous === 0 || (time > 0 && time < previous)) unlocked.set(id, time);
  }
  return unlocked;
}

// The library id of a title. The watcher notifies under the same id, so the game's own
// notification settings and its Game Health delivery record apply to its unlocks.
function toAppid(titleId) {
  return `xlln-${titleId}`;
}

function scan(dir) {
  const games = [];
  for (const game of discover(dir)) {
    debug.log(`[xlln] ${game.name} (title ${game.titleId}, ${game.total} achievements) in '${game.gameDir}'`);
    games.push({
      appid: toAppid(game.titleId),
      source: 'XLiveLessNess',
      data: {
        type: 'xlln',
        titleId: game.titleId,
        gameDir: game.gameDir,
        exe: game.exe,
        path: game.gameDir,
      },
    });
  }
  return games;
}

function iconDirFor(titleId) {
  return path.join(iconRoot(), String(titleId || '').toUpperCase());
}

/*
  DLC achievements: the runtime keeps one spa.bin per content pack under
  <storage>\dlc\<TITLE>\<pack>\Content. Every bound below keeps a crafted pack folder from turning
  into a long read, and nothing reached through a link is read at all.
*/
const DLC_DIR = 'dlc';
const DLC_SPA_FILE = 'spa.bin';
const DLC_MAX_PACKS_PER_TITLE = 512;
const DLC_LIMITS = Object.freeze({ maxFiles: 128, maxFileBytes: 64 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
const DLC_CATEGORY = 'DLC';

// The entry's stat when it is not a link and passes `accept`, else null.
function plainStat(target, accept) {
  try {
    const stat = fs.lstatSync(target);
    return accept(stat) && !stat.isSymbolicLink() ? stat : null;
  } catch {
    return null;
  }
}

const isPlainDirectory = (target) => plainStat(target, (stat) => stat.isDirectory()) !== null;

// `name` in `dir` as the disk spells it: the game finds it under Wine whatever its case, Linux does not.
function plainChild(dir, name, wantDirectory) {
  const lower = name.toLowerCase();
  const hit = readDirectory(dir).find((entry) => entry.name.toLowerCase() === lower && (wantDirectory ? entry.isDirectory() : entry.isFile()));
  return hit ? path.join(dir, hit.name) : '';
}

// The spa.bin of every content pack of a title that can be read: [{ file, size, mtimeMs }].
function listDlcSpaFiles(gameDir, titleId, limits = DLC_LIMITS) {
  const id = String(titleId || '').trim().toUpperCase();
  if (!TITLE_ID_RE.test(id)) return [];
  const files = [];
  const seen = new Set();
  let total = 0;
  for (const root of storageRoots(gameDir)) {
    const dlcRoot = plainChild(root, DLC_DIR, true);
    const titleRoot = dlcRoot && plainChild(dlcRoot, id, true);
    if (!titleRoot || !isPlainDirectory(dlcRoot) || !isPlainDirectory(titleRoot)) continue;
    const packs = readDirectory(titleRoot).filter((entry) => entry.isDirectory());
    packs.sort((left, right) => left.name.localeCompare(right.name));
    for (const pack of packs.slice(0, DLC_MAX_PACKS_PER_TITLE)) {
      const content = plainChild(path.join(titleRoot, pack.name), 'Content', true);
      const file = content && plainChild(content, DLC_SPA_FILE, false);
      const stat = file && isPlainDirectory(content) ? plainStat(file, (entry) => entry.isFile()) : null;
      if (!stat || seen.has(file.toLowerCase())) continue;
      if (stat.size > limits.maxFileBytes || total + stat.size > limits.maxTotalBytes) {
        debug.log(`[xlln] DLC pack '${file}' (${stat.size} bytes) is over the size bounds - left unread`);
        continue;
      }
      if (files.length >= limits.maxFiles) return files;
      seen.add(file.toLowerCase());
      total += stat.size;
      files.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return files;
}

// The packs that really belong to this title and describe achievements, parsed: [{ parsed, key }].
function loadDlcPacks(gameDir, titleId) {
  const packs = [];
  for (const { file } of listDlcSpaFiles(gameDir, titleId)) {
    const parsed = loadSpa(file, { extract: (target) => fs.readFileSync(target), label: 'DLC pack' });
    if (!parsed || parsed.achievements.length === 0) continue;
    const packTitle = parsed.titleId === null ? '' : formatTitleId(parsed.titleId);
    if (packTitle && packTitle !== String(titleId).toUpperCase()) {
      debug.log(`[xlln] DLC pack '${file}' declares title ${packTitle}, not ${titleId} - ignored`);
      continue;
    }
    packs.push({ parsed, key: crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 8) });
  }
  return packs;
}

function textReader(parsed, lang) {
  const languageId = spa.pickLanguage(parsed, lang);
  const strings = languageId == null ? new Map() : parsed.stringsByLanguage.get(languageId) || new Map();
  const englishId = spa.pickLanguage(parsed, 'english');
  const english = englishId == null ? strings : parsed.stringsByLanguage.get(englishId) || strings;
  return (id) => String(strings.get(id) || english.get(id) || '').trim();
}

// The icon as a file:// URL, written once into the cache; '' when it cannot be.
function iconUrlFor(iconDir, fileName, image) {
  if (!iconDir || !image || image.length === 0) return '';
  const iconPath = path.join(iconDir, fileName);
  try {
    if (!fs.existsSync(iconPath)) fs.writeFileSync(iconPath, image);
    return 'file:///' + iconPath.replace(/\\/g, '/');
  } catch {
    return ''; // leave it empty rather than fail the whole game
  }
}

// One SPA's achievements as schema rows, leaving out the ids in `known`. A pack's icons carry its
// own prefix: its image ids are numbered independently of the base game's.
function schemaRows(parsed, lang, { iconDir, iconPrefix = '', known = new Set(), extra = {} }) {
  const text = textReader(parsed, lang);
  const rows = [];
  for (const achievement of parsed.achievements) {
    if (known.has(String(achievement.id))) continue;
    const icon = iconUrlFor(iconDir, `${iconPrefix}${achievement.imageId}.png`, parsed.images.get(achievement.imageId));
    rows.push({
      name: String(achievement.id),
      displayName: text(achievement.titleStringId) || String(achievement.id),
      description: text(achievement.unlockedDescriptionId) || text(achievement.lockedDescriptionId),
      // Bit 3 shows an achievement before it is earned; without it the achievement is secret. Bit 0
      // is part of the achievement type, which read as "secret" hid every plain one.
      hidden: (achievement.flags & 0x8) === 0 ? 1 : 0,
      gamerscore: achievement.gamerscore,
      icon,
      icongray: icon,
      ...extra,
    });
  }
  return rows;
}

/*
  Schema for one title, with the icons written out of the executable so the UI can show them through
  file:// like it does for the console emulators. DLC packs are read on every call (their listing is
  cheap and the parse is cached), so a pack installed later shows up without a rescan.
*/
async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const parsed = loadSpa(info.exe);
  if (!parsed) throw new Error(`XLiveLessNess: '${info.exe}' carries no readable achievement data`);

  const iconDir = iconDirFor(info.titleId);
  let writableIconDir = iconDir;
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    writableIconDir = ''; // the achievements still list, just without their art
  }

  const list = schemaRows(parsed, lang, { iconDir: writableIconDir });
  for (const pack of loadDlcPacks(info.gameDir, info.titleId)) {
    const known = new Set(list.map((entry) => entry.name));
    list.push(...schemaRows(pack.parsed, lang, { iconDir: writableIconDir, iconPrefix: `dlc-${pack.key}-`, known, extra: { dlc: true, category: DLC_CATEGORY } }));
  }

  return {
    name: spa.titleName(parsed, lang) || String(info.titleId || ''),
    appid: toAppid(info.titleId),
    system: 'xbox',
    // An achievement picture only stands in for the header until SteamGridDB's art replaces it.
    img: { header: list.find((entry) => entry.icon)?.icon, headerStandIn: true },
    achievement: { total: list.length, list },
  };
}

// Unlock state, merged across every profile the title has: a game played under more than one
// profile is still one library entry, showing what has been earned on this machine.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const merged = new Map();

  for (const entry of stateFiles(info)) {
    let unlocked;
    try {
      unlocked = parseState(fs.readFileSync(entry.file));
    } catch {
      unlocked = null;
    }
    if (!unlocked) {
      debug.log(`[xlln] '${entry.file}' is ${entry.size} bytes, not a whole number of ${RECORD_SIZE}-byte records - left unread`);
      continue;
    }
    for (const [id, time] of unlocked) {
      const previous = merged.get(id);
      if (previous === undefined || previous === 0 || (time > 0 && time < previous)) merged.set(id, time);
    }
  }

  return [...merged].map(([id, earned_time]) => ({ id: String(id), achieved: true, earned_time }));
}

module.exports.iconDirFor = iconDirFor;
module.exports.toAppid = toAppid;
module.exports.scan = scan;
module.exports.getGameData = getGameData;
module.exports.getAchievements = getAchievements;
module.exports.discover = discover;
module.exports.inspect = inspect;
module.exports.storageRoots = storageRoots;
module.exports.stateFiles = stateFiles;
module.exports.listDlcSpaFiles = listDlcSpaFiles;
module.exports.DLC_LIMITS = DLC_LIMITS;
module.exports.parseState = parseState;
module.exports.parseTitleConfig = parseTitleConfig;
module.exports.decodeConfig = decodeConfig;
module.exports.filetimeToUnixSeconds = filetimeToUnixSeconds;
module.exports.STATE_FILE = STATE_FILE;
module.exports.RUNTIME_DLL = RUNTIME_DLL;
module.exports.STORAGE_DIR = STORAGE_DIR;
