'use strict';

/*
  XLiveLessNess: the open replacement for xlive.dll that lets a Games for Windows LIVE game run
  without the retired GFWL service - and keeps unlocking its achievements offline.

  Nothing about this layout is Steam-shaped, so the whole game is read from the install itself:

    <game>\xlive.dll                    the replacement runtime
    <game>\<game>.exe.cfg               XML written beside the executable, carrying <titleid>
    <game>\<game>.exe                   holds the SPAFILE resource: the achievement list and icons
    <root>\XLiveLessNess\profile\title\<TITLEID>\<profile>\achievements.dat
                                        the unlock records, one 16-byte row each

  A row is: achievement id (u32), the FILETIME it was unlocked (two u32 halves) and its flags (u32),
  all little-endian - the state file is written by the PC runtime, unlike the SPAFILE it describes,
  which is big-endian Xbox 360 data (see xllnSpa.js).

  Only unlocked achievements are ever written, and the file is appended to rather than rewritten, so
  an absent row means locked and nothing else. That also means a truncated or half-written file must
  be refused outright: read as-is it would silently relock achievements and, on the next pass, replay
  every one of them as a fresh unlock.
*/

const fs = require('fs');
const path = require('path');
const spa = require(path.join(__dirname, 'xllnSpa.js'));

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

/*
  Where the achievement icons extracted from the executable are kept. Resolved on first use, and
  overridable, because the Watchdog loads this same module from its own process and locates the user
  data folder its own way - both sides then write into one shared cache.
*/
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

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
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
const SPA_CACHE_MAX = 8;

function loadSpa(exePath) {
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
    parsed = spa.parseSpa(spa.extractSpa(exePath));
  } catch (err) {
    debug.log(`[xlln] '${exePath}' carries no readable SPAFILE => ${err.message || err}`);
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

/*
  One folder, inspected: it is an XLiveLessNess install when the replacement runtime sits beside an
  executable whose own .cfg names a title, and that executable really carries the achievement list
  the title id claims. The last check is what keeps a config copied from another game from
  attributing its achievements here.
*/
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
  if (process.env.LOCALAPPDATA) add(path.join(process.env.LOCALAPPDATA, STORAGE_DIR));
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

/*
  Decode one state file into { id -> earned_time }. Returns null - never a partial answer - when the
  file is not a whole number of records: a half-written file read as-is would drop the unlocks its
  truncated tail holds, and they would then arrive again as new ones.
*/
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

function scan(dir) {
  const games = [];
  for (const game of discover(dir)) {
    debug.log(`[xlln] ${game.name} (title ${game.titleId}, ${game.total} achievements) in '${game.gameDir}'`);
    games.push({
      appid: `xlln-${game.titleId}`,
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
  Schema for one title, with the icons written out of the executable so the UI can show them through
  file:// like it does for the console emulators.
*/
async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const parsed = loadSpa(info.exe);
  if (!parsed) throw new Error(`XLiveLessNess: '${info.exe}' carries no readable achievement data`);

  const languageId = spa.pickLanguage(parsed, lang);
  const strings = languageId == null ? new Map() : parsed.stringsByLanguage.get(languageId) || new Map();
  const englishId = spa.pickLanguage(parsed, 'english');
  const english = englishId == null ? strings : parsed.stringsByLanguage.get(englishId) || strings;
  const text = (id) => String(strings.get(id) || english.get(id) || '').trim();

  const iconDir = iconDirFor(info.titleId);
  let iconsWritten = false;
  try {
    fs.mkdirSync(iconDir, { recursive: true });
    iconsWritten = true;
  } catch {
    /* the achievements still list, just without their art */
  }

  const list = [];
  for (const achievement of parsed.achievements) {
    let icon = '';
    const image = parsed.images.get(achievement.imageId);
    if (iconsWritten && image && image.length > 0) {
      const iconPath = path.join(iconDir, `${achievement.imageId}.png`);
      try {
        if (!fs.existsSync(iconPath)) fs.writeFileSync(iconPath, image);
        icon = 'file:///' + iconPath.replace(/\\/g, '/');
      } catch {
        /* leave it empty rather than fail the whole game */
      }
    }

    const unlockedDescription = text(achievement.unlockedDescriptionId);
    const lockedDescription = text(achievement.lockedDescriptionId);
    list.push({
      name: String(achievement.id),
      displayName: text(achievement.titleStringId) || String(achievement.id),
      description: unlockedDescription || lockedDescription,
      // Bit 0 marks an achievement whose text is withheld until it is earned.
      hidden: (achievement.flags & 0x1) !== 0 ? 1 : 0,
      gamerscore: achievement.gamerscore,
      icon,
      icongray: icon,
    });
  }

  return {
    name: spa.titleName(parsed, lang) || String(info.titleId || ''),
    appid: `xlln-${info.titleId}`,
    system: 'xbox',
    img: { header: list.find((entry) => entry.icon)?.icon },
    achievement: { total: list.length, list },
  };
}

/*
  Unlock state, merged across every profile the title has. Profiles are per-player, but a game that
  was played under more than one of them is still the same library entry here, and the library shows
  what has been earned on this machine.
*/
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
module.exports.scan = scan;
module.exports.getGameData = getGameData;
module.exports.getAchievements = getAchievements;
module.exports.discover = discover;
module.exports.inspect = inspect;
module.exports.storageRoots = storageRoots;
module.exports.stateFiles = stateFiles;
module.exports.parseState = parseState;
module.exports.parseTitleConfig = parseTitleConfig;
module.exports.decodeConfig = decodeConfig;
module.exports.filetimeToUnixSeconds = filetimeToUnixSeconds;
module.exports.STATE_FILE = STATE_FILE;
module.exports.RUNTIME_DLL = RUNTIME_DLL;
module.exports.STORAGE_DIR = STORAGE_DIR;
