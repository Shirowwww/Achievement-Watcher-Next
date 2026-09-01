'use strict';

// Watchdog-side reader/fetcher for achievement rarity (global unlock %). Shares the exact same sidecar
// cache file as the renderer's app/util/rarity.js (steam_cache/rarity/<appid>.json), so whichever
// process fetches first warms the cache for the other instead of both hitting the network. Used to
// mark an unlock toast as "rare" when fewer than 10% of players have the achievement.

const fs = require('fs');
const path = require('path');
const request = require('./lazyRequire.js').lazyRequire('request-zero');

const CACHE_DIR = path.join(require('./userData.js').userDataDir(), 'steam_cache', 'rarity');
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // matches app/util/rarity.js
const SOURCE = 'steam-global-achievement-percentages';

function cacheFile(appid) {
  return path.join(CACHE_DIR, `${appid}.json`);
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function readPayload(appid) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(appid), 'utf8'));
  } catch {
    return null;
  }
}

function payloadToMap(payload) {
  const map = new Map();
  const rows = payload && Array.isArray(payload.achievements) ? payload.achievements : [];
  for (const row of rows) {
    const name = row && row.name != null ? String(row.name).trim() : '';
    const percent = clampPercent(row && row.percent);
    if (name && percent !== null) map.set(name, percent);
  }
  return map;
}

// Synchronous, no freshness gate - instant lookup for the toast hot path.
function readRarityMap(appid) {
  return payloadToMap(readPayload(appid));
}

function writeCache(appid, entries) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const payload = {
      appid: String(appid),
      source: SOURCE,
      updatedAt: new Date().toISOString(),
      achievements: Array.isArray(entries) ? entries : [],
    };
    fs.writeFileSync(cacheFile(appid), JSON.stringify(payload), 'utf8');
  } catch {
    /* best-effort: a cache write failure must never break a toast */
  }
}

function steamGlobalUrl(appid, explicitFormat) {
  const base = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${encodeURIComponent(
    appid
  )}`;
  return explicitFormat ? `${base}&format=json` : base;
}

function steamGlobalRows(data) {
  const rows =
    data && data.achievementpercentages && Array.isArray(data.achievementpercentages.achievements)
      ? data.achievementpercentages.achievements
      : [];
  const out = [];
  for (const row of rows) {
    const name = row && row.name != null ? String(row.name).trim() : '';
    const percent = clampPercent(row && row.percent);
    if (name && percent !== null) out.push({ name, percent });
  }
  return out;
}

// Same Valve quirk the renderer copy documents (app/util/rarity.js): `format=json` intermittently
// returns an empty achievement list where the parameterless request returns the data. An empty first
// answer is retried once without the parameter before it is believed.
async function fetchSteamGlobal(appid) {
  const first = steamGlobalRows(await request.getJson(steamGlobalUrl(appid, true), { timeout: 8000 }));
  if (first.length > 0) return first;
  return steamGlobalRows(await request.getJson(steamGlobalUrl(appid, false), { timeout: 8000 }));
}

// Return a Map<achievementName, percent>. Hits the network only when the sidecar is missing or older
// than ttlMs; on any failure falls back to whatever is cached (possibly empty). Never throws - rarity
// is a non-essential enrichment of the toast.
/*
  Sources whose ids are not Steam appids. Asking Valve about one is a wasted request at best, and at
  worst it answers about an unrelated Steam game with the same number - which then lands in the
  sidecar the app reads too. The app-side copy of this module has always had this gate; this one did
  not, and it is called for every unlock of every platform.
*/
const CACHE_ONLY_SOURCES = new Set([
  'epic-official',
  'epic',
  'gog-official',
  'gog',
  'GOG Galaxy',
  'Ubisoft Connect',
  'ubisoft',
  'uplay',
  'uPlay',
  'Lumaplay',
  'ea',
  'Xbox PC',
]);

function isSteamRarityId(appid, source) {
  if (source && CACHE_ONLY_SOURCES.has(String(source))) return false;
  // A namespaced id (uplay-123, socialclub-x, local-abc) is never a Steam appid either.
  return /^[0-9]+$/.test(String(appid == null ? '' : appid).trim());
}

async function getRarityMap(appid, { ttlMs = DEFAULT_TTL_MS, source = '' } = {}) {
  const payload = readPayload(appid);
  const age = payload && payload.updatedAt ? Date.now() - Date.parse(payload.updatedAt) : Infinity;
  const fresh = payload && age < ttlMs && Array.isArray(payload.achievements) && payload.achievements.length > 0;
  if (fresh) return payloadToMap(payload);
  if (!isSteamRarityId(appid, source)) return payloadToMap(payload);

  try {
    const entries = await fetchSteamGlobal(appid);
    if (entries.length > 0) {
      writeCache(appid, entries);
      return payloadToMap({ achievements: entries });
    }
  } catch {
    /* fall through to stale cache */
  }
  return payloadToMap(payload);
}

module.exports = { readRarityMap, getRarityMap, cacheFile, isSteamRarityId, CACHE_ONLY_SOURCES };
