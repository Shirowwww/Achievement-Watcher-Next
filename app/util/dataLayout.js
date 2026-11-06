'use strict';

/*
  Where the app and the Watchdog agree to keep things: files under the user data folder that both
  sides open, the capture folder, and the playtime registry key the Watchdog writes and the app
  reads. Each is spelled here once. Loaded by the Watchdog at startup, so it requires only path and os.
*/

const os = require('os');
const path = require('path');

// HKCU key holding one { total, last } subkey per appid; no trailing slash.
const PLAYTIME_REGISTRY_ROOT = 'Software/Achievement Watcher Next/Playtime/Steam';

// Default home of screenshot souvenirs ('pictures') and clips ('videos'): <home>/Pictures and
// <home>/Videos, where every version has saved them, even when OneDrive moves the system folder.
const CAPTURE_DIR_NAME = 'Achievement Watcher Next';
const captureDir = (kind, home = os.homedir()) => path.join(home, kind === 'videos' ? 'Videos' : 'Pictures', CAPTURE_DIR_NAME);

// The user's own index (what the scan seeds and the Watchdog extends).
const gameIndexFile = (userData) => path.join(userData, 'cfg', 'gameIndex.json');

// The bundled legacy catalogue the Watchdog reads before the user's index.
const gameIndexCatalogueFile = (userData) => path.join(userData, 'steam_cache', 'schema', 'gameIndex.json');

// Catalogue first, so the user's entries win a merge.
const gameIndexFiles = (userData) => [gameIndexCatalogueFile(userData), gameIndexFile(userData)];

// The user's settings, read by both processes.
const optionsFile = (userData) => path.join(userData, 'cfg', 'options.ini');

// Downloaded artwork, one folder per appid; the Watchdog's popups read what the scan fetched.
const iconCacheRoot = (userData) => path.join(userData, 'steam_cache', 'icon');
const iconCacheDir = (userData, appid) => path.join(iconCacheRoot(userData), String(appid));

// SteamDB's cover links for one appid: fetched by the app, read by the Watchdog's artwork.
const steamDbCoversFile = (userData, appid) => path.join(userData, 'steam_cache', 'steamdb_covers', `${appid}.json`);

// Icons unpacked from a Ubisoft achievements archive, by the scan or the live watcher.
const ubisoftIconDir = (userData, appid) => path.join(userData, 'steam_cache', 'ubisoftOfficial', String(appid), 'img');

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
  CAPTURE_DIR_NAME,
  captureDir,
  gameIndexFile,
  gameIndexCatalogueFile,
  gameIndexFiles,
  optionsFile,
  iconCacheRoot,
  iconCacheDir,
  steamDbCoversFile,
  ubisoftIconDir,
  apiNamesFile,
  consoleBaselineDir,
  baselineSafeName,
  baselineFileName,
};
