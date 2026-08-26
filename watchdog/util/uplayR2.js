'use strict';

/*
  Watchdog-side helpers for Goldberg Uplay R2 saves: the emulator saves under the Ubisoft product id
  with bare objective keys, so the app records the uplayId/steamappid pair on the shared gameIndex.json
  entry and this module matches unlocks against the loaded schema. Dependency-free (fs/path only).
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');

function gameIndexFiles() {
  const root = userDataDir();
  return [
    path.join(root, 'steam_cache', 'schema', 'gameIndex.json'),
    path.join(root, 'cfg', 'gameIndex.json'),
  ];
}

function objectiveMapFile() {
  const root = userDataDir();
  return root ? path.join(root, 'cfg', 'uplay-objectives.json') : '';
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
function steamAppIdForUplayId(uplayId, { files = gameIndexFiles() } = {}) {
  const key = String(uplayId || '');
  if (!key) return '';
  for (const file of files) {
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) continue;
      const found = list.find((game) => game && String(game.uplayId || '') === key);
      if (found && found.appid) return String(found.appid);
    } catch {
      /* game index files are optional */
    }
  }
  return '';
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
  for (const file of files) {
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) continue;
      if (list.some((game) => game && String(game.appid || '') === key && String(game.uplayId || ''))) return true;
    } catch {
      /* game index files are optional */
    }
  }
  return false;
}

/*
  Rewrites Uplay R2 objective ids onto the schema's Steam api-names, in place. The api-name for a
  supported game ends in the objective id, so the trailing digits identify it.

  The loader rebuilds its key as AchKeyPrefix + the objective id as a plain decimal, so a game whose
  Steam names are zero-padded ("001") is written as "1" and a literal digit match never finds it -
  that silence is what left those games without a single notification. Comparing ids numerically
  fixes it, but only when the whole list follows one prefix and no two names share an id: otherwise
  "ACH_FS_01" and "ACH_FSDLC_1" would be interchangeable, so those lists keep the literal match. Same
  rule as derivePrefixedIds in app/parser/uplayR2.js, kept in step by test/integration.
*/
function remapObjectiveIds(achievements, schemaList, { objectiveIds = null } = {}) {
  const list = Array.isArray(schemaList) ? schemaList : [];
  const entries = Array.isArray(achievements) ? achievements : [];
  if (list.length === 0 || entries.length === 0) return 0;

  const known = new Set(list.map((a) => String((a && a.name) || '').toUpperCase()));
  // An explicit table from the app supersedes anything derived from the api-names, and is the only
  // source when they carry no id at all.
  const explicit = new Map();
  if (objectiveIds) {
    const inSchema = new Map(list.map((a) => [String((a && a.name) || '').toUpperCase(), String((a && a.name) || '')]));
    for (const [id, name] of Object.entries(objectiveIds)) {
      const resolved = inSchema.get(String(name || '').toUpperCase());
      if (resolved) explicit.set(String(Number(id)), resolved);
    }
  }
  const byDigits = new Map();
  const byObjectiveId = new Map();
  let prefix = null;
  let canonical = true;
  for (const a of list) {
    const name = String((a && a.name) || '');
    const parts = name.match(/^(.*?)(\d+)$/);
    if (!parts) {
      canonical = false;
      continue;
    }
    if (!byDigits.has(parts[2])) byDigits.set(parts[2], name);
    if (prefix === null) prefix = parts[1];
    else if (prefix !== parts[1]) canonical = false;
    const id = String(Number(parts[2]));
    if (byObjectiveId.has(id)) {
      byObjectiveId.set(id, null);
      canonical = false;
    } else {
      byObjectiveId.set(id, name);
    }
  }
  const lowerPrefix = String(prefix || '').toLowerCase();

  let remapped = 0;
  for (const entry of entries) {
    const name = String((entry && entry.name) || '');
    if (!name || known.has(name.toUpperCase())) continue;
    let resolved = /^\d+$/.test(name) ? explicit.get(String(Number(name))) : undefined;
    if (!resolved) resolved = /^\d+$/.test(name) ? byDigits.get(name) : undefined;
    if (!resolved && canonical) {
      let digits = null;
      if (/^\d+$/.test(name)) digits = name;
      else if (lowerPrefix && name.toLowerCase().startsWith(lowerPrefix)) {
        const rest = name.slice(lowerPrefix.length);
        if (/^\d+$/.test(rest)) digits = rest;
      }
      if (digits !== null) resolved = byObjectiveId.get(String(Number(digits))) || undefined;
    }
    if (!resolved) continue;
    entry.name = resolved;
    remapped++;
  }
  return remapped;
}

module.exports = { gameIndexFiles, objectiveMapFile, objectiveMapFor, steamAppIdForUplayId, isUplayR2SteamAppId, remapObjectiveIds };
