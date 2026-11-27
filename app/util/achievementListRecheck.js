'use strict';

/*
  A game's achievement list as cached from Steam, brought up to date. Shared by the library
  (app/parser/steam.js) and the Watchdog (watchdog/steam.js), which both read the same cached file:
  an unlock the cached list does not know was dropped by the Watchdog and hidden by the library.
*/

const fs = require('fs');

// A save naming achievements the cached list lacks re-checks it at most this often: a save whose
// entries were renamed for good misses on every scan.
const UNKNOWN_RECHECK_MS = 24 * 60 * 60 * 1000;

// Merges a fresh fetch into the cached list (matched by apiName): patches blank fields, takes Steam's
// sets and archive flags, and appends achievements missing from `list`. Mutates in place; never
// drops an entry, so a short/failed fetch can't delete unlocked history (one Steam dropped is marked).
function reconcileAchievementList(list, fresh) {
  if (!Array.isArray(list) || !Array.isArray(fresh) || fresh.length === 0) return { changed: false, addedCount: 0 };
  let changed = false;
  const freshByName = new Map(fresh.filter((a) => a && a.name != null).map((a) => [String(a.name).toUpperCase(), a]));
  for (const ach of list) {
    const f = freshByName.get(String(ach.name).toUpperCase());
    if (!f) continue;
    if ((!ach.description || String(ach.description).trim() === '') && f.description) {
      ach.description = f.description;
      changed = true;
    }
    if ((!ach.displayName || String(ach.displayName).trim() === '') && f.displayName) {
      ach.displayName = f.displayName;
      changed = true;
    }
    if (ach.hidden == null && f.hidden != null) {
      ach.hidden = f.hidden;
      changed = true;
    }
    // Steam's own sets and archive flags (only Steam's schema sources carry `archived`) win.
    if (typeof f.archived === 'boolean' && !!ach.archived !== f.archived) {
      ach.archived = f.archived;
      changed = true;
    }
    if (f.category && ach.category !== f.category) {
      ach.category = f.category;
      changed = true;
    }
  }
  // Before the new ones are appended: they would count as shared names.
  const removed = markRemoved(list, fresh, freshByName);
  const knownNames = new Set(list.filter((a) => a && a.name != null).map((a) => String(a.name).toUpperCase()));
  const added = [];
  for (const achievement of fresh) {
    if (!achievement || achievement.name == null) continue;
    const key = String(achievement.name).toUpperCase();
    if (knownNames.has(key)) continue;
    knownNames.add(key);
    added.push(achievement);
  }
  if (added.length) {
    list.push(...added);
    changed = true;
  }
  return { changed: changed || removed.changed, addedCount: added.length, removedCount: removed.count };
}

/*
  An achievement Steam's own list no longer has is marked removed, never dropped: a real unlock of it
  stays on the page, outside every count. Only Steam's own schema (each entry carries its archive
  flag) can say so; SteamHunters may lag. A list sharing under half the cached names is another game's.
*/
function markRemoved(list, fresh, freshByName) {
  let changed = false;
  let count = 0;
  const fromSteam = fresh.every((achievement) => achievement && typeof achievement.archived === 'boolean');
  const cached = list.filter((achievement) => achievement && achievement.name != null);
  const shared = cached.filter((achievement) => freshByName.has(String(achievement.name).toUpperCase())).length;
  if (!fromSteam || shared * 2 < cached.length) return { changed, count };
  for (const achievement of cached) {
    const gone = !freshByName.has(String(achievement.name).toUpperCase());
    if (gone) count += 1;
    if (gone === Boolean(achievement.removed)) continue;
    if (gone) achievement.removed = true;
    else delete achievement.removed;
    changed = true;
  }
  return { changed, count };
}

function readCachedRecord(filePath) {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return record && record.name && Array.isArray(record.achievement && record.achievement.list) ? record : null;
  } catch {
    return null;
  }
}

/*
  Brings `list` (the game being built or watched) and the cached file up to date with Steam. An empty
  or failed answer is no verdict, so it is not stamped; `force` skips the daily limit for a write the
  user asked for. Returns how many `list` gained.
*/
async function recheckCachedList({ filePath, list, fetchSchema, log = () => {}, now = Date.now(), force = false }) {
  if (!Array.isArray(list)) return 0;
  const record = readCachedRecord(filePath);
  if (!record) return 0;
  // The Watchdog keeps its list in memory: what the other process already cached costs no request.
  const known = reconcileAchievementList(list, record.achievement.list).addedCount;
  const checkedAt = Number(record.unknownCheckedAt);
  if (!force && checkedAt > 0 && now - checkedAt < UNKNOWN_RECHECK_MS) return known;
  let fresh;
  try {
    const answer = await fetchSchema();
    if (answer && answer.networkError === true) return known;
    fresh = Array.isArray(answer) ? answer : (answer && answer.achievements) || [];
  } catch (err) {
    log(`could not re-check the achievement list for unknown saved achievements: ${err.code || err.message || err}`);
    return known;
  }
  if (fresh.length === 0) return known;
  // Read again: the app may have rewritten the file while Steam was being asked.
  const latest = readCachedRecord(filePath);
  if (latest) {
    reconcileAchievementList(latest.achievement.list, fresh);
    latest.achievement.total = latest.achievement.list.length;
    latest.unknownCheckedAt = now;
    try {
      fs.writeFileSync(filePath, JSON.stringify(latest, null, 2));
    } catch (err) {
      log(`could not save the re-checked achievement list: ${err.code || err.message || err}`);
    }
  }
  const { addedCount } = reconcileAchievementList(list, fresh);
  if (addedCount) log(`picked up ${addedCount} new achievement(s) the save already had`);
  return known + addedCount;
}

module.exports = { UNKNOWN_RECHECK_MS, reconcileAchievementList, recheckCachedList };
