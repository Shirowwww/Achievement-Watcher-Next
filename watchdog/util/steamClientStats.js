'use strict';

/*
  Unlocks of the games the Steam client itself runs, for the optional Steam notifications (issue
  #91). Steam rewrites appcache/stats/UserGameStats_<account>_<appid>.bin when a game stores an
  unlock, for a legit copy and for one added through SteamTools, LuaTools or GreenLuma alike. The
  file goes through the same notification path as an emulator save; this only names the root and
  turns the bin into that path's rows.
*/

const fs = require('fs');
const path = require('path');
const { sharedAppModulePath } = require('./sharedAppModule.js');

const USER_STATS_FILE = /UserGameStats_(\d+)_(\d+)\.bin$/i;

function statsFileIds(file) {
  const match = String(file || '').match(USER_STATS_FILE);
  return match ? { accountId: match[1], appid: match[2] } : null;
}

/*
  The watch root, or null when the setting is off or Steam is not installed. The process check is
  skipped because Steam only writes the file for a game it runs; the unlock time Steam records is
  what keeps a resync of older unlocks from notifying.
*/
function steamClientRoot(options, { clientDir } = {}) {
  if (!options || !options.notification || options.notification.steamClient !== true) return null;
  let steamDir = clientDir;
  if (steamDir === undefined) {
    try {
      steamDir = require(sharedAppModulePath('parser/steamLibrary.js')).steamClientDir();
    } catch {
      steamDir = '';
    }
  }
  if (!steamDir) return null;
  const dir = path.join(steamDir, 'appcache', 'stats');
  if (!fs.existsSync(dir)) return null;
  return {
    dir,
    options: { recursive: false, filter: USER_STATS_FILE, steamClient: true, disableCheckIfProcessIsRunning: true },
  };
}

// The bin as the rows monitor.parse returns for an emulator save.
function readSteamClientUnlocks(file, { readStats } = {}) {
  const ids = statsFileIds(path.basename(String(file || '')));
  if (!ids) throw `'${file}' is not a Steam stats file`;
  const read = readStats || require(sharedAppModulePath('parser/steamOfficial.js')).readLocalUserStats;
  const rows = read({ statsDir: path.dirname(file), appid: ids.appid, accountId: ids.accountId });
  if (!Array.isArray(rows)) throw `Steam has no achievement list cached for ${ids.appid} yet`;
  return rows.map((row) => ({
    name: String(row.apiname),
    Achieved: Boolean(row.achieved),
    CurProgress: Number(row.progress) || 0,
    MaxProgress: Number(row.max_progress) || 0,
    UnlockTime: Number(row.unlocktime) || 0,
  }));
}

module.exports = { USER_STATS_FILE, statsFileIds, steamClientRoot, readSteamClientUnlocks };
