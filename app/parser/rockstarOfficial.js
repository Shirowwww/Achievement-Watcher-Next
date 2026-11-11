'use strict';

/*
  Rockstar Games Launcher (official): the games it installed, with their achievement list.

  The launcher records each installed title under HKLM\SOFTWARE\WOW6432Node\Rockstar Games\<title>,
  with the folder in InstallFolder. The list comes from the title's Steam release, which carries the
  same achievements with art and every language. The local unlock file (achievements.dat) is
  encrypted with a key of the signed-in account, so unlocks come from Rockstar's achievements API
  once a Rockstar account is connected (electron/rockstarAccount.js); without one, all are locked.
*/

const fs = require('fs');
const path = require('path');
const { appHosts, documentsFolders } = require('../util/appHosts.js');
const { normalizeNameKey } = require('./socialclubNames.js');
const rockstarMetadata = require('./rockstarMetadata.js');
const { SOURCE_LABEL } = require('../util/sourceIdentity.js');

const SOURCE = SOURCE_LABEL.ROCKSTAR;
const TITLES_ROOT = 'Software/WOW6432Node/Rockstar Games';
// Keys the launcher writes for itself, not for a game.
const NOT_A_GAME = new Set(['launcher', 'rockstar games launcher', 'rockstar games social club', 'social club']);

let debug = { log() {}, warn() {}, error() {} };

function initDebug({ isDev, userDataPath }) {
  debug = new (require('../util/logger'))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
}

function rockstarAppId(title) {
  return `rockstar-${normalizeNameKey(title).replace(/\s+/g, '-') || 'unknown'}`;
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/*
  Every title the launcher installed: [{ title, dir }]. Only InstallFolder counts: a copy bought on
  Steam or Epic fills InstallFolderSteam / InstallFolderEpic instead, and those stores' own sources
  list it. The launcher keeps a key after an uninstall, so the folder must still exist.
*/
function installedTitles(hosts = appHosts()) {
  const found = [];
  const seen = new Set();
  for (const host of hosts) {
    for (const title of host.regSubkeys('HKLM', TITLES_ROOT)) {
      const key = normalizeNameKey(title);
      if (!key || NOT_A_GAME.has(key) || seen.has(key)) continue;
      const raw = String(host.regValue('HKLM', `${TITLES_ROOT}/${title}`, 'InstallFolder') || '').trim();
      const dir = raw ? host.localPath(raw) : '';
      if (!dir || !isDirectory(dir)) continue;
      seen.add(key);
      found.push({ title: String(title), dir });
    }
  }
  return found;
}

function scan(hosts) {
  const records = [];
  try {
    for (const { title, dir } of installedTitles(hosts)) {
      records.push({
        appid: rockstarAppId(title),
        name: title,
        source: SOURCE,
        data: { type: 'rockstarOfficial', title, gameDir: dir },
      });
      debug.log(`[rockstar] ${title} installed in ${dir}`);
    }
  } catch (err) {
    debug.error(`[rockstar] scan failed: ${err}`);
  }
  return records;
}

/*
  The Steam release's schema under the launcher's identity. `resolveSteamAppId` and `steam` are
  injected so the module loads without steam.js (and its network stack) in tests.
*/
async function getGameData(record, lang, { resolveSteamAppId, steam }) {
  const title = (record && record.data && record.data.title) || (record && record.name) || '';
  const steamAppId = await resolveSteamAppId(title);
  let game = null;
  if (steamAppId) {
    try {
      game = await steam.getGameData({ appID: steamAppId, lang });
    } catch (err) {
      debug.log(`[rockstar] no Steam schema for ${title} (${steamAppId}) => ${err}`);
    }
  } else {
    debug.log(`[rockstar] ${title}: no Steam release found, no achievement list`);
  }
  if (!game || !game.name) {
    return {
      appid: record.appid,
      name: title || 'Unknown game',
      steamappid: steamAppId || undefined,
      source: SOURCE,
      img: {},
      achievement: { total: 0, unlocked: 0, list: [] },
      installed: true,
    };
  }
  return { ...game, appid: record.appid, steamappid: steamAppId, source: SOURCE, installed: true };
}

/*
  The name Rockstar's achievements API knows a launcher title by, and the platform its unlocks are
  kept under: GTA V Enhanced has its own ('pcalt'). Keyed by the launcher's registry title. Only
  GTA V (both editions) was checked against a real account; a wrong entry costs nothing, since
  unlocks are only kept once metadata.dat ties them to the game's own list.
*/
const API_TITLES = {
  'gtav enhanced': { title: 'gtav', platform: 'pcalt' },
  'grand theft auto v enhanced': { title: 'gtav', platform: 'pcalt' },
  'gtav': { title: 'gtav', platform: 'pc' },
  'gta v': { title: 'gtav', platform: 'pc' },
  'grand theft auto v': { title: 'gtav', platform: 'pc' },
  'gtaiv': { title: 'gtaiv', platform: 'pc' },
  'gta iv': { title: 'gtaiv', platform: 'pc' },
  'grand theft auto iv': { title: 'gtaiv', platform: 'pc' },
  'l a noire': { title: 'lan', platform: 'pc' },
  'max payne 3': { title: 'mp3', platform: 'pc' },
  'red dead redemption 2': { title: 'rdr2', platform: 'pc' },
  'gta iii definitive edition': { title: 'gta3unreal', platform: 'pc' },
  'gta vice city definitive edition': { title: 'gtavcunreal', platform: 'pc' },
  'gta san andreas definitive edition': { title: 'gtasaunreal', platform: 'pc' },
};

const apiTitleOf = (title) => API_TITLES[normalizeNameKey(title)] || null;

/*
  The signed-in account's unlocks for a launcher game, as the shared merge reads them:
  { apiName: { earned, earned_time } }. Empty without an account, for a title the API does not
  know, or when no metadata.dat ties Rockstar's numbers to this game's list.
*/
async function getAchievements(record, game, { invoke, steam, metadataFiles = () => rockstarMetadata.metadataFiles(documentsFolders()) }) {
  const title = (record && record.data && record.data.title) || '';
  const target = apiTitleOf(title);
  const list = game && game.achievement && Array.isArray(game.achievement.list) ? game.achievement.list : [];
  if (!target || !list.length || !invoke) return {};
  const answer = await invoke('rockstar:awarded', target);
  if (!answer || !answer.ok) {
    if (answer && answer.error !== 'rockstar-not-connected') debug.log(`[rockstar] ${title}: no unlocks (${answer.error})`);
    return {};
  }
  // Rockstar's names match the Steam release's English ones; the game's own language fills a gap.
  let english = null;
  if (game.steamappid) {
    try {
      const data = await steam.getGameData({ appID: game.steamappid, lang: 'english' });
      english = data && data.achievement && data.achievement.list;
    } catch (err) {
      debug.log(`[rockstar] ${title}: no English list to match (${err})`);
    }
  }
  const numbers = rockstarMetadata.numbersFromFiles(metadataFiles(), [english, list].filter(Boolean));
  if (!numbers) {
    debug.log(`[rockstar] ${title}: no metadata.dat matches its list, unlocks not shown`);
    return {};
  }
  const unlocks = {};
  for (const [apiName, number] of Object.entries(numbers)) {
    if (Object.hasOwn(answer.awarded || {}, String(number))) unlocks[apiName] = { earned: true, earned_time: answer.awarded[number] };
  }
  return unlocks;
}

module.exports = { SOURCE, initDebug, rockstarAppId, installedTitles, scan, getGameData, getAchievements, apiTitleOf };
