'use strict';

/*
  The title a game is shown under: a name the user gave it, then (opt-in) Steam's own title in the
  user's language, then the name the scan resolved. Display only: cover lookups, title matching and
  every cache keep game.name. Shared with the Watchdog, so it requires no other app module.
*/

const fs = require('fs');
const path = require('path');

const CUSTOM_FILE = path.join('cfg', 'gameTitles.json');
const LOCALIZED_FILE = path.join('steam_cache', 'localizedTitles.json');
const SCHEMA_LANGUAGE_FILE = path.join('cfg', 'schemaLanguage.json');
const MAX_TITLE_LENGTH = 200;
// Steam rarely renames a game; a month keeps a newly added translation from waiting forever.
const LOCALIZED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let userDataPath = null;
let config = { localized: false, lang: 'english' };

function setUserDataPath(p) {
  if (p) userDataPath = p;
}

// The Watchdog has no renderer to ask, so it is told the option once its options.ini is read.
function configure({ localized, lang } = {}) {
  config = { localized: localized === true, lang: String(lang || 'english') };
}

function file(rel) {
  return userDataPath ? path.join(userDataPath, rel) : '';
}

// Every tile asks, so each file is parsed once per change on disk and stat'ed at most every two
// seconds; this module's own writes drop the cached copy at once.
const STAT_INTERVAL_MS = 2000;
const readCache = new Map();
function readMap(rel, { strict = false } = {}) {
  const target = file(rel);
  if (!target) return {};
  const cached = readCache.get(target);
  const now = Date.now();
  if (!strict && cached && now - cached.checkedAt < STAT_INTERVAL_MS) return cached.map;
  let stat;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    if (strict && err.code !== 'ENOENT') throw err;
    readCache.set(target, { mtimeMs: 0, size: -1, map: {}, checkedAt: now });
    return {};
  }
  if (!strict && cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    cached.checkedAt = now;
    return cached.map;
  }
  let map = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed;
  } catch (err) {
    // A locked store must not be replaced by a map holding a single entry.
    if (strict && err.code) throw err;
  }
  readCache.set(target, { mtimeMs: stat.mtimeMs, size: stat.size, map, checkedAt: now });
  return map;
}

function writeMap(rel, map) {
  const target = file(rel);
  if (!target) throw new Error('gameTitle: no user data path');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(map), 'utf8');
  readCache.delete(target);
}

/*
  Which id space the appid belongs to. Crack and emulator labels all key on the Steam appid, so a
  rename survives a switch from one crack to another; only native ids that can share a number with
  a Steam appid get a family of their own.
*/
function titleFamily(game) {
  const source = String((game && game.source) || '').trim().toLowerCase();
  const system = String((game && game.system) || '').trim().toLowerCase();
  if (source === 'gog galaxy' || source === 'gog') return 'gog';
  if (source === 'ea') return 'ea';
  if (source === 'retroachievements') return 'retroachievements';
  if (source.startsWith('xbox') && source !== 'xbox 360 recomp') return 'xbox';
  if (system && system !== 'uplay') return system;
  return 'steam';
}

function titleKey(game) {
  const appid = String((game && game.appid) || '').trim();
  return appid ? `${titleFamily(game)}:${appid}` : '';
}

function cleanTitle(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
}

/*
  A notification may arrive without its source (the console watchers send only the id). The
  family the source would have given is then unknown, so any single rename of that id answers.
*/
function customTitle(game) {
  const map = readMap(CUSTOM_FILE);
  const key = titleKey(game);
  if (!key) return '';
  const exact = cleanTitle(map[key]);
  if (exact || (game && game.source)) return exact;
  const suffix = `:${String(game.appid).trim()}`;
  const matches = Object.keys(map).filter((k) => k.endsWith(suffix));
  return matches.length === 1 ? cleanTitle(map[matches[0]]) : '';
}

// An empty name clears the rename.
function setCustomTitle(game, name) {
  const key = titleKey(game);
  if (!key) throw new Error('gameTitle: a game needs an appid');
  const map = { ...readMap(CUSTOM_FILE, { strict: true }) };
  const title = cleanTitle(name);
  if (title) map[key] = title;
  else delete map[key];
  writeMap(CUSTOM_FILE, map);
  return title;
}

// The game's own Steam language when one is set for its achievements, the global one otherwise.
function languageFor(game, fallback) {
  const own = readMap(SCHEMA_LANGUAGE_FILE)[String((game && game.appid) || '')];
  return typeof own === 'string' && own ? own : String(fallback || 'english');
}

// A game from another store that is mapped to its Steam release takes Steam's translation too; a
// bare native id (a GOG product id) is never sent to Steam.
function localizedSteamAppid(game) {
  const own = String((game && game.steamappid) || '').trim();
  if (/^\d+$/.test(own)) return own;
  const appid = String((game && game.appid) || '').trim();
  return titleFamily(game) === 'steam' && /^\d+$/.test(appid) ? appid : '';
}

function localizedTitle(game, lang) {
  if (!lang || lang === 'english') return '';
  const id = localizedSteamAppid(game);
  if (!id) return '';
  const entry = readMap(LOCALIZED_FILE)[id];
  return cleanTitle(entry && entry.names && entry.names[lang]);
}

// opts: { localized, lang } - the Settings option and the global Steam language. Defaults to what
// configure() was told, which is how the Watchdog calls it.
function displayTitle(game, opts = {}) {
  const localized = opts.localized === undefined ? config.localized : opts.localized === true;
  const custom = customTitle(game);
  if (custom) return custom;
  if (localized) {
    const translated = localizedTitle(game, languageFor(game, opts.lang || config.lang));
    if (translated) return translated;
  }
  return String((game && game.name) || (game && game.appid) || '');
}

// Steam appids whose translated titles were never asked for, or not for a month.
function staleLocalizedAppids(games, now = Date.now()) {
  const cache = readMap(LOCALIZED_FILE);
  const out = new Set();
  for (const game of Array.isArray(games) ? games : []) {
    const id = localizedSteamAppid(game);
    if (!id) continue;
    const entry = cache[id];
    if (!entry || !Number.isFinite(entry.at) || now - entry.at > LOCALIZED_TTL_MS) out.add(id);
  }
  return [...out];
}

// names: { <appid>: { <steam language>: title } }. An appid with no translation is stored empty, so
// it is not asked about again until the entry expires.
function storeLocalizedTitles(names, now = Date.now()) {
  const map = { ...readMap(LOCALIZED_FILE) };
  for (const [appid, byLang] of Object.entries(names || {})) {
    if (!/^\d+$/.test(appid)) continue;
    const clean = {};
    for (const [lang, title] of Object.entries(byLang || {})) {
      const value = cleanTitle(title);
      if (/^[a-z]+$/.test(lang) && value) clean[lang] = value;
    }
    map[appid] = { at: now, names: clean };
  }
  writeMap(LOCALIZED_FILE, map);
}

module.exports = {
  setUserDataPath,
  configure,
  titleFamily,
  titleKey,
  cleanTitle,
  customTitle,
  setCustomTitle,
  localizedTitle,
  displayTitle,
  staleLocalizedAppids,
  storeLocalizedTitles,
  MAX_TITLE_LENGTH,
};
