'use strict';

// The pure half of this module touches neither network nor disk, so it is tested by feeding it sets
// and checking the decision, the same way addLocallyKnownSteamApps is.

function idSet(values) {
  const out = new Set();
  for (const value of values || []) {
    const id = String(value == null ? '' : value).trim();
    if (id) out.add(id);
  }
  return out;
}

// installed always wins: a game present on disk is legitimate no matter what the API says. With no
// non-empty owned list, everything is reported owned and nothing is marked stale, this is the
// invariant that keeps a network outage from emptying a library.
function classify({ owned, family, installed, listed } = {}) {
  const ownedSet = idSet(owned);
  const familySet = idSet(family);
  const installedSet = idSet(installed);
  const havePositiveList = ownedSet.size > 0 || familySet.size > 0;

  const result = new Map();
  for (const value of listed || []) {
    const id = String(value == null ? '' : value).trim();
    if (!id) continue;
    if (installedSet.has(id)) result.set(id, 'installed');
    else if (!havePositiveList) result.set(id, 'owned');
    else if (ownedSet.has(id)) result.set(id, 'owned');
    else if (familySet.has(id)) result.set(id, 'family');
    else result.set(id, 'stale');
  }
  return result;
}

const OWNED_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';
const FAMILY_GROUP_URL = 'https://api.steampowered.com/IFamilyGroupsService/GetFamilyGroupForUser/v1/';
const FAMILY_APPS_URL = 'https://api.steampowered.com/IFamilyGroupsService/GetSharedLibraryApps/v1/';
const EMPTY_LIBRARY = () => ({ owned: [], family: [], names: new Map(), owners: new Map(), playtime: new Map() });

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response || !response.ok) throw new Error(`steam-api-http-${response ? response.status : 'none'}`);
  return await response.json();
}

// Two sources, one response. Family is optional: an account with no family group just returns an
// empty list, that is not an error.
async function fetchLibrary({ token, steamid, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const key = String(token || '').trim();
  const user = String(steamid || '').trim();
  // GetOwnedGames rejects a request with no steamid: the token says who is calling, not which
  // library it means.
  if (!key || !user) return EMPTY_LIBRARY();

  const library = EMPTY_LIBRARY();
  try {
    const owned = await getJson(
      fetchImpl,
      `${OWNED_URL}?access_token=${encodeURIComponent(key)}&steamid=${encodeURIComponent(
        user
      )}&include_appinfo=1&include_played_free_games=1`
    );
    for (const game of (owned && owned.response && owned.response.games) || []) {
      const id = String(game.appid);
      library.owned.push(id);
      if (game.name) library.names.set(id, String(game.name));
      // Steam counts in minutes, the local counter in seconds. A never-launched game has nothing to
      // teach the local counter, so it is left out of the Map rather than written as an ambiguous 0.
      const minutes = Number(game.playtime_forever) || 0;
      if (minutes > 0) {
        library.playtime.set(id, { seconds: minutes * 60, lastPlayed: Number(game.rtime_last_played) || 0 });
      }
    }
  } catch (err) {
    // With no owned list, classify() marks nothing stale, so the failure is harmless, but it must
    // still be logged: an empty library and an outage look identical otherwise.
    log(`[steam] owned library unavailable: ${err && err.message ? err.message : err}`);
    return EMPTY_LIBRARY();
  }

  try {
    const group = await getJson(fetchImpl, `${FAMILY_GROUP_URL}?access_token=${encodeURIComponent(key)}`);
    const groupId = String((group && group.response && group.response.family_groupid) || '0');
    if (groupId && groupId !== '0') {
      const shared = await getJson(
        fetchImpl,
        `${FAMILY_APPS_URL}?access_token=${encodeURIComponent(key)}&family_groupid=${encodeURIComponent(groupId)}&include_own=false`
      );
      for (const app of (shared && shared.response && shared.response.apps) || []) {
        const id = String(app.appid);
        library.family.push(id);
        if (app.name) library.names.set(id, String(app.name));
        if (Array.isArray(app.owner_steamids)) library.owners.set(id, app.owner_steamids.map(String));
      }
    }
  } catch (err) {
    // No readable family: the owned games still stand as a valid positive list.
    log(`[steam] family library unavailable: ${err && err.message ? err.message : err}`);
  }

  return library;
}

const LIBRARY_TTL_MS = 6 * 60 * 60 * 1000;

// Cache file shape. Bump this whenever a field is added or changes meaning: a cache from another
// version is ignored rather than served half-broken, since a still-fresh cache from the previous
// version would otherwise leave new fields silently empty until the TTL expired.
const LIBRARY_CACHE_VERSION = 2;

// A library scan should not call the API every time. The cache is a plain timestamped JSON file;
// unreadable or stale, it is just ignored, never repaired.
async function loadLibrary({ cacheFile, token, steamid, fetchImpl = globalThis.fetch, log = () => {}, now = Date.now(), ttlMs = LIBRARY_TTL_MS } = {}) {
  const fsp = require('node:fs/promises');
  try {
    const cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    if (Number(cached.version) === LIBRARY_CACHE_VERSION && Number(cached.savedAt) + ttlMs > now && Array.isArray(cached.owned)) {
      return {
        owned: cached.owned,
        family: Array.isArray(cached.family) ? cached.family : [],
        names: new Map(Object.entries(cached.names || {})),
        owners: new Map(Object.entries(cached.owners || {})),
        playtime: new Map(Object.entries(cached.playtime || {})),
      };
    }
  } catch {
    /* no usable cache */
  }

  const library = await fetchLibrary({ token, steamid, fetchImpl, log });
  // An empty response never overwrites an already-known positive list: yesterday's file beats an
  // outage's empty one.
  if (library.owned.length > 0) {
    try {
      await fsp.writeFile(
        cacheFile,
        JSON.stringify({
          version: LIBRARY_CACHE_VERSION,
          savedAt: now,
          owned: library.owned,
          family: library.family,
          names: Object.fromEntries(library.names),
          owners: Object.fromEntries(library.owners),
          playtime: Object.fromEntries(library.playtime),
        }),
        'utf8'
      );
    } catch {
      /* cache not written: harmless */
    }
  }
  return library;
}

module.exports = { classify, fetchLibrary, loadLibrary, LIBRARY_TTL_MS, LIBRARY_CACHE_VERSION, _internal: { idSet } };
