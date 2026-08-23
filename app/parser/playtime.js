'use strict';

const { readRegistryInteger, readRegistryIntegers, writeRegistryDword } = require('../util/reg');

// Read side of the playtime counters the Watchdog writes in watchdog/playtime/track.js - the two
// must name the same registry key. Counters recorded under the older "Achievement Watcher" and
// "Achievement Watcher 3.0" namespaces are copied here once by migratePlaytimeRegistry().
const PLAYTIME_KEY = 'Software/Achievement Watcher Next/Playtime/Steam/';

module.exports = async (appID) => {
  const current = +readRegistryInteger('HKCU', PLAYTIME_KEY + appID, 'total') || 0;
  const last = +readRegistryInteger('HKCU', PLAYTIME_KEY + appID, 'last') || 0;
  return { playtime: current, lastplayed: last };
};

// Synchronous "last played" unix timestamp (0 if untracked). Used when building the game list so a
// "recently played" sort has its value available on the tile at creation time. Registry reads are
// in-process (registry-js) and cheap; guarded so a missing key can never break the list build.
module.exports.lastPlayedSync = (appID) => {
  try {
    return +readRegistryInteger('HKCU', PLAYTIME_KEY + appID, 'last') || 0;
  } catch {
    return 0;
  }
};

// One registry pass for library rows that show both total playtime and the last session.
module.exports.readSync = (appID) => {
  try {
    const values = readRegistryIntegers('HKCU', PLAYTIME_KEY + appID, ['total', 'last']);
    return { playtime: +values.total || 0, lastplayed: +values.last || 0 };
  } catch {
    return { playtime: 0, lastplayed: 0 };
  }
};

module.exports.reset = async (appID) => {
  const path = `${PLAYTIME_KEY}${appID}`;
  await writeRegistryDword('HKCU', path, 'total', 0);
  await writeRegistryDword('HKCU', path, 'last', 0);
};

// Neither Steam nor the local counter is authoritative (Steam sees other machines, AW sees
// non-Steam play), so each field keeps its larger value; null means nothing to write.
function mergeSteamPlaytime(local, steam) {
  const steamSeconds = Number(steam && steam.seconds) || 0;
  const steamLast = Number(steam && steam.lastPlayed) || 0;
  if (steamSeconds <= 0 && steamLast <= 0) return null;

  const localSeconds = Number(local && local.playtime) || 0;
  const localLast = Number(local && local.lastplayed) || 0;
  const total = Math.max(localSeconds, steamSeconds);
  const last = Math.max(localLast, steamLast);
  return total === localSeconds && last === localLast ? null : { total, last };
}
module.exports.mergeSteamPlaytime = mergeSteamPlaytime;

// Copies Steam playtime into the local counter when it advances it; returns whether a write happened.
module.exports.seedFromSteam = async (appID, steam) => {
  const merged = mergeSteamPlaytime(module.exports.readSync(appID), steam);
  if (!merged) return false;
  const path = `${PLAYTIME_KEY}${appID}`;
  await writeRegistryDword('HKCU', path, 'total', merged.total);
  await writeRegistryDword('HKCU', path, 'last', merged.last);
  return true;
};
