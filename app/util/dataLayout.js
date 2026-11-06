'use strict';

/*
  Where the app and the Watchdog agree to keep things: files under the user data folder that both
  sides open, and the playtime registry key the Watchdog writes and the app reads. Each is spelled
  here once. Loaded by the Watchdog at startup, so it requires nothing but path.
*/

const path = require('path');

// HKCU key holding one { total, last } subkey per appid; no trailing slash.
const PLAYTIME_REGISTRY_ROOT = 'Software/Achievement Watcher Next/Playtime/Steam';

// The user's own index (what the scan seeds and the Watchdog extends).
const gameIndexFile = (userData) => path.join(userData, 'cfg', 'gameIndex.json');

// The bundled legacy catalogue the Watchdog reads before the user's index.
const gameIndexCatalogueFile = (userData) => path.join(userData, 'steam_cache', 'schema', 'gameIndex.json');

// Catalogue first, so the user's entries win a merge.
const gameIndexFiles = (userData) => [gameIndexCatalogueFile(userData), gameIndexFile(userData)];

const iconCacheDir = (userData, appid) => path.join(userData, 'steam_cache', 'icon', String(appid));

// Icon-hash to apiName index, written by both the app and the Watchdog.
const apiNamesFile = (userData, appid) => path.join(userData, 'steam_cache', 'apinames', `${appid}.json`);

// Console watchers' unlock baselines: one json per game, shared with the reset and the relock.
const consoleBaselineDir = (userData) => path.join(userData, 'steam_cache', 'console');

const baselineSafeName = (key) => String(key == null ? '' : key).replace(/[^\w.-]/g, '_');

function baselineFileName(prefix, key) {
  return `${prefix ? `${prefix}-` : ''}${baselineSafeName(key)}.json`;
}

module.exports = {
  PLAYTIME_REGISTRY_ROOT,
  gameIndexFile,
  gameIndexCatalogueFile,
  gameIndexFiles,
  iconCacheDir,
  apiNamesFile,
  consoleBaselineDir,
  baselineSafeName,
  baselineFileName,
};
