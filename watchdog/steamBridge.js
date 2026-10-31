'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { fileStamp, sameStamp } = require('./util/fileStamp.js');

/*
  The Steam bridge. A plugin inside Steam (Millennium on the desktop, Decky in Game Mode) names one
  non-Steam shortcut - its exe, launch options, Steam AppID or title - and gets that game's
  achievements back to paint them on the shortcut's page. The list is the app's library snapshot;
  unlocks announced on the feed since that scan are laid over it.

  There is no "list everything" request on purpose: a caller has to know the game already, and the
  answer carries no path, source or account name. A wrong game on a shortcut is the failure that
  matters, so every rule that matches more than one game answers "not found".
*/

const COMMAND = 'bridge-game';
const VERSION = 1;
const MAX_TEXT = 1024;
const MAX_ARGS = 4096;
const MAX_NAME = 256;
const MAX_ID = 64;
const MAX_ICONS = 4096;
const MAX_LIVE_GAMES = 256;
const ICON_ROUTE = /^\/bridge\/icon\/([0-9a-f]{24})$/;
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

function text(value, max) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/^["']+|["']+$/g, '').trim();
  return trimmed && trimmed.length <= max ? trimmed : '';
}

// Windows file names ignore case, Linux ones do not (as winHosts.pathKey in the app).
const FOLD_PATH_CASE = process.platform === 'win32';

function pathCase(value) {
  return FOLD_PATH_CASE ? value.toLowerCase() : value;
}

// Paths as Steam, the library and exeList.db spell them, made comparable.
function normalizePath(value) {
  return pathCase(
    String(value || '')
      .trim()
      .replace(/[\\/]+/g, '/')
      .replace(/\/+$/, '')
  );
}

function parentDir(normalized) {
  const cut = normalized.lastIndexOf('/');
  return cut < 0 ? '' : normalized.slice(0, cut);
}

function baseName(normalized) {
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function steamAppIdOf(value) {
  const raw = typeof value === 'number' && Number.isInteger(value) ? String(value) : text(value, 10);
  return /^[1-9][0-9]{0,9}$/.test(raw) ? raw : '';
}

function cleanRequest(request) {
  const source = request && typeof request === 'object' ? request : {};
  const wanted = {
    exe: normalizePath(text(source.exe, MAX_TEXT)),
    args: normalizePath(text(source.launchOptions, MAX_ARGS)),
    steamAppId: steamAppIdOf(source.steamAppId),
    title: normalizeTitle(text(source.name, MAX_NAME)),
  };
  return wanted.exe || wanted.args || wanted.steamAppId || wanted.title ? wanted : null;
}

function echoId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return typeof value === 'string' && value.length <= MAX_ID ? value : null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// A file read again only when its stamp moved: a plugin asks on every page it shows.
function cachedJson(file) {
  let stamp = null;
  let value = null;
  return () => {
    const now = fileStamp(file);
    if (!sameStamp(now, stamp)) {
      stamp = now;
      value = now ? readJson(file) : null;
    }
    return value;
  };
}

function byAppid(rows, field) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && row.appid != null && row[field]) map.set(String(row.appid), row);
  }
  return map;
}

// Every place this machine says a game's executable lives, and every name it goes by.
function describeGames(snapshot, index, exeList) {
  const indexRows = byAppid(index, 'appid');
  const exeRows = byAppid(exeList, 'exe');
  return snapshot.games
    .filter((game) => game && game.appid != null && game.achievement && Array.isArray(game.achievement.list))
    .map((game) => {
      const id = String(game.appid);
      const row = indexRows.get(id) || {};
      const exes = [game.exeConfident ? game.exe : '', (exeRows.get(id) || {}).exe, row.exePath].map(normalizePath).filter(Boolean);
      const binaries = new Set(exes.map(baseName));
      if (row.binary) binaries.add(normalizePath(row.binary));
      const gameDir = normalizePath(game.gameDir);
      const folders = [gameDir, normalizePath(game.romPath)].filter(Boolean);
      return { game, id, exes, binaries, gameDir, folders, title: normalizeTitle(game.displayName || game.name) };
    });
}

function mentions(haystack, needle) {
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    const next = haystack[at + needle.length];
    if (next === undefined || next === '/' || next === '"' || next === "'" || /\s/.test(next)) return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}

function inside(file, folder) {
  return !!folder && file.startsWith(folder + '/');
}

// A launcher at the root of the game folder, Unreal's Game.exe above Game-Win64-Shipping.exe, or the
// same name above the exe the library knows when that folder or name is the game's own. A library
// folder above several games (C:\Jeux\game.exe), or a name that only starts the same (Dark.exe,
// Darkness.exe), is not that game.
function sameInstall(entry, exe) {
  const dir = parentDir(exe);
  if (entry.gameDir && dir === entry.gameDir) return true;
  const name = baseName(exe);
  const stem = name.replace(/\.exe$/, '');
  const ownFolder = normalizeTitle(baseName(dir)) === entry.title || normalizeTitle(stem) === entry.title;
  return entry.exes.some((known) => inside(known, dir) && (baseName(known).startsWith(stem + '-') || (ownFolder && baseName(known) === name)));
}

// The basename alone is trusted only when no path this machine knows says it is another copy.
function sameExeName(entry, exe) {
  if (!entry.binaries.has(baseName(exe))) return false;
  const dir = parentDir(exe);
  return entry.exes.length === 0 || entry.exes.some((known) => parentDir(known) === dir);
}

// Strongest evidence first; a rule that names several games ends the search with nothing.
function findGame(entries, wanted) {
  const { exe, args, steamAppId, title } = wanted;
  const rules = [
    exe && ((entry) => entry.exes.includes(exe)),
    args && ((entry) => entry.folders.some((folder) => mentions(args, folder))),
    steamAppId && ((entry) => entry.id === steamAppId || String(entry.game.steamappid || '') === steamAppId),
    exe && ((entry) => sameInstall(entry, exe)),
    exe && ((entry) => sameExeName(entry, exe)),
    title && ((entry) => entry.title === title),
  ].filter(Boolean);
  for (const rule of rules) {
    const matches = entries.filter(rule);
    const ids = new Set(matches.map((entry) => entry.id));
    if (ids.size === 1) return matches[0];
    if (ids.size > 1) return null;
  }
  return null;
}

function toSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n > 1e12 ? n / 1000 : n);
}

function cleanProgress(current, max) {
  const value = Number(current);
  const limit = Number(max);
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 1) return null;
  return value > 0 && value < limit ? { current: value, max: limit } : null;
}

function isImagePath(file) {
  return Object.prototype.hasOwnProperty.call(IMAGE_TYPES, path.extname(file).toLowerCase());
}

function localPath(value) {
  let candidate = value;
  if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return '';
    }
  }
  return path.isAbsolute(candidate) ? path.normalize(candidate) : '';
}

// Tokens are keyed per run, so a web page cannot work one out from a path it guesses and probe it.
function createIconRegistry(iconBase) {
  const files = new Map();
  const key = crypto.randomBytes(32);
  function urlFor(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw || raw.length > MAX_TEXT * 2) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const file = localPath(raw);
    if (!file || !isImagePath(file)) return '';
    const token = crypto.createHmac('sha256', key).update(pathCase(file)).digest('hex').slice(0, 24);
    files.delete(token);
    files.set(token, file);
    while (files.size > MAX_ICONS) files.delete(files.keys().next().value);
    return `${iconBase()}/bridge/icon/${token}`;
  }
  return { urlFor, fileFor: (token) => files.get(token) || '' };
}

function publicAchievement(item, live, icons) {
  const icon = icons.urlFor(item.icon);
  const unlocked = item.Achieved === true || item.Achieved === 1 || item.Achieved === 'true' || !!(live && live.unlockedAt);
  const out = {
    id: String(item.name),
    name: typeof item.displayName === 'string' && item.displayName ? item.displayName : String(item.name),
    description: typeof item.description === 'string' ? item.description : '',
    icon,
    iconLocked: icons.urlFor(item.icongray) || icon,
    hidden: item.hidden === true || Number(item.hidden) === 1,
    unlocked,
    unlockedAt: unlocked ? (live && live.unlockedAt) || toSeconds(item.UnlockTime) : 0,
  };
  const rawRarity = item.rarityPercent != null ? item.rarityPercent : item.rarityPct;
  const rarity = rawRarity == null ? NaN : Number(rawRarity);
  if (Number.isFinite(rarity) && rarity >= 0 && rarity <= 100) out.rarity = rarity;
  const progress = unlocked ? null : (live && live.progress) || cleanProgress(item.CurProgress, item.MaxProgress);
  if (progress) out.progress = progress;
  return out;
}

function publicGame(entry, live, savedAt, icons) {
  const fresh = new Map();
  for (const [name, note] of live || []) if (note.notedAt > savedAt) fresh.set(name, note);
  const achievements = entry.game.achievement.list.filter((item) => item && item.name != null).map((item) => publicAchievement(item, fresh.get(String(item.name)), icons));
  return {
    id: entry.id,
    name: entry.game.displayName || entry.game.name || entry.id,
    total: achievements.length,
    unlocked: achievements.filter((item) => item.unlocked).length,
    achievements,
  };
}

function authorized(req, auth) {
  if (!auth) return true;
  const header = String((req.headers && req.headers.authorization) || '');
  const login = Buffer.from(header.split(' ')[1] || '', 'base64').toString();
  return login === auth;
}

function sendIcon(req, res, file) {
  res.writeHead(200, { 'content-type': IMAGE_TYPES[path.extname(file).toLowerCase()], 'cache-control': 'max-age=3600', 'x-content-type-options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

function createBridge({ userData, iconBase, auth = null } = {}) {
  const snapshot = cachedJson(path.join(userData, 'cache', 'library_snapshot', 'library.json'));
  const index = cachedJson(path.join(userData, 'cfg', 'gameIndex.json'));
  const exeList = cachedJson(path.join(userData, 'cfg', 'exeList.db'));
  const icons = createIconRegistry(iconBase);
  const live = new Map();

  function answer(request) {
    const reply = { cmd: COMMAND, id: echoId(request && request.id), bridge: VERSION };
    const wanted = cleanRequest(request);
    if (!wanted) return { ...reply, found: false, error: 'nothing-to-match' };
    const library = snapshot();
    if (!library || !Array.isArray(library.games)) return { ...reply, found: false };
    const entry = findGame(describeGames(library, index(), exeList()), wanted);
    if (!entry) return { ...reply, found: false };
    return { ...reply, found: true, game: publicGame(entry, live.get(entry.id), Number(library.savedAt) || 0, icons) };
  }

  // Unlocks and progress the feed announced; Settings' test buttons (test: true) are rehearsals.
  function noteNotification(message) {
    if (!message || message.test === true || message.appID == null || typeof message.achievement !== 'string') return;
    const type = message.notificationType || (message.progress ? 'progress' : 'achievement');
    const progress = message.progress ? cleanProgress(message.progress.current, message.progress.max) : null;
    if (type !== 'achievement' && !(type === 'progress' && progress)) return;
    const id = String(message.appID);
    const notes = live.get(id) || new Map();
    live.delete(id);
    live.set(id, notes);
    while (live.size > MAX_LIVE_GAMES) live.delete(live.keys().next().value);
    const note = { ...notes.get(message.achievement), notedAt: Date.now() };
    if (type === 'achievement') note.unlockedAt = toSeconds(message.time) || Math.floor(Date.now() / 1000);
    else note.progress = progress;
    notes.set(message.achievement, note);
  }

  function handleHttp(req, res) {
    const url = String(req.url || '');
    if (!url.startsWith('/bridge/')) return false;
    const match = ICON_ROUTE.exec(url.split('?')[0]);
    const file = match ? icons.fileFor(match[1]) : '';
    if (match && req.method !== 'GET' && req.method !== 'HEAD') res.writeHead(405).end();
    else if (!authorized(req, auth)) res.writeHead(401).end();
    else if (!file || !isImagePath(file) || !fs.existsSync(file)) res.writeHead(404).end();
    else sendIcon(req, res, file);
    return true;
  }

  return { answer, noteNotification, handleHttp };
}

module.exports = { createBridge, COMMAND, VERSION, findGame, cleanRequest };
