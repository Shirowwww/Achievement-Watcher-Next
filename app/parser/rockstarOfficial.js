'use strict';

/*
  Rockstar Games Launcher (official): the games it installed, with their achievement list.

  The launcher records each installed title under HKLM\SOFTWARE\WOW6432Node\Rockstar Games\<title>,
  with the folder in InstallFolder. The list comes from the title's Steam release, which carries the
  same achievements with art and every language. Unlock state is not read: Social Club keeps it in
  Documents\Rockstar Games\Social Club\Profiles\<id>\Titles\<title>\achievements.dat, encrypted with
  a key held by the signed-in account, so every achievement shows locked.
*/

const fs = require('fs');
const path = require('path');
const { appHosts } = require('../util/appHosts.js');
const { normalizeNameKey } = require('./socialclubNames.js');
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

module.exports = { SOURCE, initDebug, rockstarAppId, installedTitles, scan, getGameData };
