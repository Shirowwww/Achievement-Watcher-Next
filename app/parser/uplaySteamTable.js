'use strict';

/*
  The shipped Ubisoft product -> Steam pairing table (app/assets/uplay-steam.json), read once and
  then re-read whenever the file itself changes.

  Both readers used to keep their own copy for the lifetime of the process, which is wrong twice
  over: a table replaced under a running app (an update applied in place, a hand-fixed row, a test
  that swaps the asset) kept answering from the old snapshot, and a product added to it stayed
  unresolvable until the next restart - the config generation would refuse a game whose pairing was
  already sitting on disk. Keying the cache on the file's size and mtime costs one stat per lookup
  and removes both.
*/

const fs = require('fs');
const path = require('path');

const TABLE_FILE = path.join(__dirname, '..', 'assets', 'uplay-steam.json');

let cache = null; // { key, rows, byId }

function fileKey() {
  try {
    const stat = fs.statSync(TABLE_FILE);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return 'absent';
  }
}

function read() {
  const key = fileKey();
  if (cache && cache.key === key) return cache;

  let rows = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(TABLE_FILE, 'utf8'));
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    rows = []; // a missing or unreadable table is an empty one: every caller has other sources
  }

  const byId = new Map();
  // A Steam appid can be sold under more than one Ubisoft product id (a base game and its later
  // "Complete Edition" release, for example), each with its own save folder. Grouped here so a
  // caller can probe every one of them, not just whichever id this install happens to declare.
  const bySteamAppid = new Map();
  for (const row of rows) {
    if (!row || row.uplay_id == null) continue;
    byId.set(String(row.uplay_id).trim(), row);
    if (row.steam_appid == null) continue;
    const appidKey = String(row.steam_appid).trim();
    if (!bySteamAppid.has(appidKey)) bySteamAppid.set(appidKey, []);
    bySteamAppid.get(appidKey).push(String(row.uplay_id).trim());
  }

  cache = { key, rows, byId, bySteamAppid };
  return cache;
}

module.exports.rows = () => read().rows;
module.exports.byId = () => read().byId;
module.exports.find = (uplayId) => {
  const id = String(uplayId == null ? '' : uplayId).trim();
  return id ? read().byId.get(id) || null : null;
};
// Every uplay_id the table lists under one Steam appid, including the one a caller already has.
module.exports.siblingsFor = (steamAppid) => {
  const id = String(steamAppid == null ? '' : steamAppid).trim();
  return id ? (read().bySteamAppid.get(id) || []).slice() : [];
};
// Tests replace the asset in place; the size/mtime key can collide within the same millisecond.
module.exports.invalidate = () => {
  cache = null;
};
module.exports.file = TABLE_FILE;
