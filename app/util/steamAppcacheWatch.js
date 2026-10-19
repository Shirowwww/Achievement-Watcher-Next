'use strict';

/*
  Live unlocks for games Steam itself runs, read from Steam/appcache/stats.

  Steam rewrites UserGameStats_<account>_<appid>.bin the moment a game reports an unlock, for a
  legit copy and equally for one added through SteamTools, LuaTools or GreenLuma, whose unlocks
  Valve's servers never report (issue #91). A scan already reads these files; this only moves the
  open library as they change, so a card no longer waits for the next rescan. Nothing here
  notifies: the Watchdog does, when "Steam client games" is on (watchdog/util/steamClientStats.js).
*/

const fs = require('fs');
const path = require('path');

const USER_BIN = /^UserGameStats_(\d+)_(\d+)\.bin$/i;
// Steam writes the bin in more than one pass; reading between them sees half a file.
const SETTLE_MS = 250;

/*
  statsDir   Steam/appcache/stats
  readStats  ({ statsDir, appid, accountId }) => [{ apiname, achieved, unlocktime, progress?, max_progress? }] | null
  baseline   (accountId, appid) => the same array as last read by a scan, or null
  onUnlock   ({ appid, name, time }) for each achievement that became earned
  onProgress ({ appid, name, current, max }) for each locked counter that moved up
  isWanted   () => false while nobody would see the result, so the file is not even parsed
*/
function watchSteamAppcache({ statsDir, readStats, baseline = () => null, onUnlock, onProgress = () => {}, isWanted = () => true, watch = fs.watch }) {
  const seen = new Map();
  const timers = new Map();

  const snapshot = (rows) => {
    const earned = new Set();
    const progress = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row) continue;
      if (row.achieved) earned.add(String(row.apiname));
      else if (Number(row.max_progress) > 0) progress.set(String(row.apiname), { current: Number(row.progress) || 0, max: Number(row.max_progress) });
    }
    return { earned, progress };
  };

  function check(accountId, appid) {
    const key = `${accountId}_${appid}`;
    const rows = readStats({ statsDir, appid, accountId });
    if (!rows) return;
    const before = seen.has(key) ? seen.get(key) : snapshot(baseline(accountId, appid));
    const now = snapshot(rows);
    seen.set(key, now);
    for (const row of rows) {
      if (!row || !row.achieved || before.earned.has(String(row.apiname))) continue;
      onUnlock({ appid: String(appid), name: String(row.apiname), time: Number(row.unlocktime) || 0 });
    }
    // A game Steam runs (OnlineFix's Friend's Pass among them) counts a collectible here and
    // nowhere the Watchdog may be watching, so the open library hears of it from this read too.
    for (const [name, { current, max }] of now.progress) {
      const previous = before.progress.get(name);
      if (current > (previous ? previous.current : 0)) onProgress({ appid: String(appid), name, current, max });
    }
  }

  function onChange(_event, fileName) {
    const match = String(fileName || '').match(USER_BIN);
    if (!match || !isWanted()) return;
    const [, accountId, appid] = match;
    const key = `${accountId}_${appid}`;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        try {
          check(accountId, appid);
        } catch {
          /* a file caught mid-write is read again on Steam's next flush */
        }
      }, SETTLE_MS)
    );
  }

  let watcher = null;
  try {
    watcher = watch(statsDir, { persistent: false }, onChange);
    if (watcher && typeof watcher.on === 'function') watcher.on('error', () => close());
  } catch {
    return null;
  }

  function close() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    try {
      if (watcher) watcher.close();
    } catch {}
    watcher = null;
  }

  return { close, _check: check };
}

// What the last scan cached for a game: steam.js getAchievementsFromAPI writes this very array.
function scanCacheBaseline(cacheRoot) {
  return (accountId, appid) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(cacheRoot, 'steam_cache', 'user', String(accountId), `${appid}.db`), 'utf8'));
    } catch {
      return null;
    }
  };
}

module.exports = { watchSteamAppcache, scanCacheBaseline, SETTLE_MS };
