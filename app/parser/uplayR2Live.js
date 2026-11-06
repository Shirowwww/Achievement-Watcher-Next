'use strict';

/*
  What both uplayR2.js (the library) and the Watchdog (live notifications) need about a Uplay R2
  save, split out so the Watchdog does not load the 2,000-line setup and repair code: how an
  emulator key (a bare objective id, or prefix + id) is matched to a Steam api-name, and the
  Ubisoft product id <-> Steam AppID pairs the app recorded. The emulator saves under the Ubisoft
  product id with bare objective keys, so the app records the uplayId/steamappid pair on the shared
  gameIndex.json entry. Needs only fs, path, the data folder and the shipped pairing table.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('../util/userDataPath.js');
const { createIndexedGameLookup } = require('../util/indexedGameLookup.js');
const uplaySteamTable = require('./uplaySteamTable.js');

const OBJECTIVE_MAP_FILE = 'uplay-objectives.json';

// Given the Steam schema's achievement list ([{name, ...}]), verify every api-name ends in
// "<one shared prefix><digits>" - the convention the Ubisoft objective id is embedded in for many
// Ubisoft-published Steam ports. Returns { prefix, count, ids } when the whole list agrees, else null
// (this game isn't auto-supported; diagnose() surfaces that instead of writing a broken schema).
function derivePrefixedIds(achievementList) {
  const list = Array.isArray(achievementList) ? achievementList : [];
  if (list.length === 0) return null;

  let prefix = null;
  const ids = [];
  for (const a of list) {
    const nm = a && a.name != null ? String(a.name) : '';
    const m = nm.match(/^(.*?)(\d+)$/);
    if (!m) return null;
    if (prefix === null) prefix = m[1];
    else if (prefix !== m[1]) return null;
    ids.push(Number(m[2]));
  }
  // Padding is dropped when the loader rebuilds the key, so two api-names that differ only by leading
  // zeros would collapse onto one objective id. Refuse the game instead of writing a schema that
  // silently loses an achievement.
  if (new Set(ids).size !== ids.length) return null;
  return { prefix: prefix || '', count: list.length, ids };
}

/*
  Returns resolve(key): the schema api-name an emulator save key stands for, or undefined. Tried as-is,
  then prefixed, then by objective id. `canonical` (single prefix + unique ids) allows a numeric id
  comparison, matching a save written as "<prefix>1" against an api-name spelled "<prefix>001";
  otherwise the literal digit match is kept, since the same numeric id can belong to two different
  api-names. `objectiveIds` is a Map(apiName -> id) from Ubisoft's own archive.
*/
function objectiveResolver({ prefix = '', apiNames = [], canonical = false, objectiveIds = null } = {}) {
  const byName = new Map();
  const byDigits = new Map();
  const byObjectiveId = new Map();
  const rememberObjectiveId = (id, value) => {
    // Defensive: the numeric path is the caller's promise, this is the check. A collision disables it
    // entirely rather than resolving an entry onto the wrong achievement.
    if (byObjectiveId.has(id)) byObjectiveId.set(id, null);
    else byObjectiveId.set(id, value);
  };
  for (const name of apiNames) {
    const value = String(name == null ? '' : name);
    if (!value) continue;
    byName.set(value.toUpperCase(), value);
    const digits = value.match(/(\d+)$/);
    if (!digits) continue;
    if (!byDigits.has(digits[1])) byDigits.set(digits[1], value);
    if (!objectiveIds) rememberObjectiveId(String(Number(digits[1])), value);
  }
  // An explicit table (Ubisoft's own archive) supersedes whatever the api-names end in.
  if (objectiveIds) for (const [name, id] of objectiveIds) rememberObjectiveId(String(Number(id)), String(name));

  const lowerPrefix = String(prefix || '').toLowerCase();
  const useObjectiveIds = canonical || !!objectiveIds;
  const resolveObjectiveId = (key) => {
    if (!useObjectiveIds) return undefined;
    let digits = null;
    if (/^\d+$/.test(key)) digits = key;
    else if (lowerPrefix && key.toLowerCase().startsWith(lowerPrefix)) {
      const rest = key.slice(lowerPrefix.length);
      if (/^\d+$/.test(rest)) digits = rest;
    }
    return digits === null ? undefined : byObjectiveId.get(String(Number(digits))) || undefined;
  };

  return (rawKey) => {
    const key = String(rawKey);
    let resolved = [key, `${prefix}${key}`].map((c) => byName.get(c.toUpperCase())).find(Boolean);
    if (!resolved) resolved = resolveObjectiveId(key);
    if (!resolved && /^\d+$/.test(key)) resolved = byDigits.get(key);
    return resolved;
  };
}

/*
  The Watchdog's form of the same matching: rewrites objective ids onto the schema's api-names in
  place, on its parsed save (an array of { name, ... }). An entry already named like an api-name is
  left as it is. `objectiveIds` is the {id: apiName} table the app writes when it repairs a game
  keyed from Ubisoft's archive (objectiveMapFor); without it the ids are derived from the api-names.
  Returns the number of entries renamed.
*/
function remapObjectiveIds(achievements, schemaList, { objectiveIds = null } = {}) {
  const list = Array.isArray(schemaList) ? schemaList : [];
  const entries = Array.isArray(achievements) ? achievements : [];
  if (list.length === 0 || entries.length === 0) return 0;

  const apiNames = list.map((a) => String((a && a.name) || ''));
  const known = new Set(apiNames.map((name) => name.toUpperCase()));
  let table = null;
  if (objectiveIds) {
    const inSchema = new Map(apiNames.map((name) => [name.toUpperCase(), name]));
    table = new Map();
    for (const [id, name] of Object.entries(objectiveIds)) {
      const resolved = inSchema.get(String(name || '').toUpperCase());
      if (resolved) table.set(resolved, String(Number(id)));
    }
  }
  const convention = derivePrefixedIds(list);
  const resolve = objectiveResolver({
    prefix: convention ? convention.prefix : '',
    apiNames,
    canonical: !!convention,
    objectiveIds: table && table.size > 0 ? table : null,
  });

  let remapped = 0;
  for (const entry of entries) {
    const name = String((entry && entry.name) || '');
    if (!name || known.has(name.toUpperCase())) continue;
    const resolved = resolve(name);
    if (!resolved) continue;
    entry.name = resolved;
    remapped++;
  }
  return remapped;
}

// Other Ubisoft product ids the same Steam release is known to use - a base game and its Complete/
// GOTY edition each get their own id, and the loader reports whichever one the player actually owns.
function siblingUplayIdsFor(steamAppid) {
  try {
    const ids = uplaySteamTable.siblingsFor(steamAppid);
    return Array.isArray(ids) ? ids.map((id) => String(id)) : [];
  } catch {
    return [];
  }
}

function gameIndexFiles() {
  const root = userDataDir();
  return [path.join(root, 'steam_cache', 'schema', 'gameIndex.json'), path.join(root, 'cfg', 'gameIndex.json')];
}

function objectiveMapFile() {
  const root = userDataDir();
  return root ? path.join(root, 'cfg', OBJECTIVE_MAP_FILE) : '';
}

/*
  The objective id -> api-name table the app writes when it repairs a game. It is only needed when
  the api-names carry no id to derive from (a game keyed from Ubisoft's own achievement archive):
  without it those unlocks are dropped as "not found in schema" and never raise a notification.
  Returns {} when the app has not repaired this game.
*/
function objectiveMapFor(appid, { file = objectiveMapFile() } = {}) {
  const key = String(appid || '');
  if (!key || !file) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entry = parsed && parsed.games && parsed.games[key];
    return entry && entry.ids && typeof entry.ids === 'object' ? entry.ids : {};
  } catch {
    return {}; // absent or unreadable: fall back to deriving from the api-names
  }
}

// Resolves a Ubisoft product id to the Steam AppID the app mapped it to. Returns '' when the app
// hasn't scanned this game yet - the caller must treat that as "skip", never "use the Ubisoft id":
// feeding a product id into the Steam pipeline is what used to stall the library scan for 30s a game.
function steamAppIdForUplayId(uplayId, { files = gameIndexFiles(), siblingLookup = siblingUplayIdsFor } = {}) {
  const key = String(uplayId || '');
  if (!key) return '';
  let siblingMatch = '';
  for (const file of files) {
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) continue;
      const found = list.find((game) => game && String(game.uplayId || '') === key);
      if (found && found.appid) return String(found.appid);
      // The id the loader reports can be a sibling edition of a game the app mapped under a
      // different one (base vs Complete/GOTY); the same Steam release still answers for it.
      if (!siblingMatch) {
        const sibling = list.find((game) => game && game.appid != null && siblingLookup(game.appid).includes(key));
        if (sibling) siblingMatch = String(sibling.appid);
      }
    } catch {
      /* game index files are optional */
    }
  }
  return siblingMatch;
}

// One cache per file list, so a caller passing its own files (tests) never shares the default one.
const uplayIndexes = new Map();
function uplayIndex(files) {
  const cacheKey = files.join('|');
  let lookup = uplayIndexes.get(cacheKey);
  if (!lookup) {
    lookup = createIndexedGameLookup({ getFiles: () => files });
    uplayIndexes.set(cacheKey, lookup);
  }
  return lookup;
}

/*
  Is this Steam AppID a Ubisoft product the app has mapped? A repaired Uplay R2 setup redirects its
  save into GSE Saves, a root watched WITHOUT the uplayR2 flag because Steam emulators share it, so
  this is what tells the two apart. A Steam emulator save that merely happens to use numeric keys must
  never have them reinterpreted as Ubisoft objective ids.
*/
function isUplayR2SteamAppId(appid, { files = gameIndexFiles() } = {}) {
  const key = String(appid || '');
  if (!key) return false;
  // Called on EVERY unlock of EVERY platform, so it reads through the mtime-stamped cache the other
  // index readers use rather than re-parsing the whole library index each time.
  const found = uplayIndex(files)(key);
  return !!(found && String(found.uplayId || ''));
}

module.exports = {
  OBJECTIVE_MAP_FILE,
  derivePrefixedIds,
  objectiveResolver,
  remapObjectiveIds,
  siblingUplayIdsFor,
  gameIndexFiles,
  objectiveMapFile,
  objectiveMapFor,
  steamAppIdForUplayId,
  isUplayR2SteamAppId,
};
