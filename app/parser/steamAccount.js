'use strict';

const path = require('path');

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
const COMMUNITY_PROFILE_URL = 'https://steamcommunity.com/profiles/';
const EMPTY_LIBRARY = () => ({ owned: [], family: [], names: new Map(), owners: new Map(), playtime: new Map() });

const REQUEST_TIMEOUT_MS = 15 * 1000;

async function getJson(fetchImpl, url) {
  // A hung socket is not a failure the circuit breaker counts, so a scan worker would wait forever.
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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

/*
  What the account unlocked in one game, straight from Steam.

  The local reader can only answer for a game whose stats file this PC holds, which is a game that
  ran here. Every other game the account owns is at 0% however much of it was played elsewhere. The
  token authenticates the owner, so this also answers for a private profile, where the community
  XML page the older path scrapes returns nothing at all.

  Returns the same shape the local reader produces. An empty list is a real answer - "nothing
  unlocked" - and a call that could not be made throws, so the caller's breaker sees the real
  transport error instead of caching a silence as "this account unlocked nothing".
*/
/*
  The account's unlocks for one game, from the public community page (issue #98). The Web API's
  GetPlayerAchievements wants a Web API key and refuses the session token with a 400 for every game,
  which used to be cached as "no stats" across the whole library. The page needs a public profile;
  a private one is a failure, never an empty list, so nothing wrong is cached.
*/
const PRIVATE_PROFILE_RETRY_MS = 6 * 60 * 60 * 1000;
const privateProfiles = new Map();
const unreadableGames = new Map();

const xmlText = (block, tag) => {
  const match = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, 'i').exec(block);
  return match ? match[1].trim() : '';
};

function parseCommunityAchievements(xml, app) {
  const text = String(xml || '');
  const error = xmlText(text, 'error');
  if (error) {
    if (/private/i.test(error)) throw new Error('steam-profile-private');
    // "Requested app has no stats" and its variants are an answer about the game.
    if (/no stats|not have stats|stats.*not.*found/i.test(error)) return [];
    throw new Error(`steam-community-error: ${error.slice(0, 120)}`);
  }
  if (!/<playerstats>/i.test(text)) throw new Error('steam-community-unreadable');
  if (/<privacyState>\s*(private|friendsonly)\s*</i.test(text)) throw new Error('steam-profile-private');
  const unlocks = [];
  for (const match of text.matchAll(/<achievement\b([^>]*)>([\s\S]*?)<\/achievement>/gi)) {
    const apiname = xmlText(match[2], 'apiname');
    if (!apiname) continue;
    const achieved = /closed\s*=\s*"1"/i.test(match[1]) ? 1 : 0;
    unlocks.push({ apiname, achieved, unlocktime: achieved ? Number(xmlText(match[2], 'unlockTimestamp')) || 0 : 0 });
  }
  if (unlocks.length === 0 && !/<achievements>/i.test(text)) throw new Error(`steam-community-unreadable (${app})`);
  return unlocks;
}

async function fetchPlayerAchievements({ steamid, appid, fetchImpl, log = () => {}, now = Date.now() } = {}) {
  const user = String(steamid || '').trim();
  const app = String(appid || '').trim();
  if (!user || !app) throw new Error('steam-player-achievements-needs-a-connected-account');
  // One answer per profile: a private one would otherwise cost a request for every game, every scan.
  if (now - (privateProfiles.get(user) || 0) < PRIVATE_PROFILE_RETRY_MS) throw new Error('steam-profile-private');
  // Some games answer with an HTML error page: not cached as "nothing unlocked", not re-asked every scan.
  if (now - (unreadableGames.get(`${user}:${app}`) || 0) < PRIVATE_PROFILE_RETRY_MS) throw new Error('steam-community-unreadable');

  const request = fetchImpl || require(path.join(__dirname, '..', 'util', 'xboxLiveIcons.js')).nodeFetch;
  const url = `${COMMUNITY_PROFILE_URL}${encodeURIComponent(user)}/stats/${encodeURIComponent(app)}/achievements/?xml=1&l=english`;
  const response = await request(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response || !response.ok) throw new Error(`steam-api-http-${response ? response.status : 'none'}`);
  try {
    return parseCommunityAchievements(await response.text(), app);
  } catch (err) {
    if (err && err.message === 'steam-profile-private') {
      privateProfiles.set(user, now);
      log('[steam] the connected Steam profile hides its game details, so games not played here cannot be read from it');
    } else if (err && /unreadable/.test(err.message)) {
      unreadableGames.set(`${user}:${app}`, now);
    }
    throw err;
  }
}

module.exports = {
  classify,
  fetchLibrary,
  loadLibrary,
  fetchPlayerAchievements,
  LIBRARY_TTL_MS,
  LIBRARY_CACHE_VERSION,
  _internal: { idSet },
};
