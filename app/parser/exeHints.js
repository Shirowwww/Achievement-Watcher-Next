'use strict';

/*
  What the store says about a game's executable, as exeDetect options: the Steam appid its folder may
  declare, and the exe names Steam launches. The names come from the launch metadata the main process
  already caches (steam_cache/steamdb_launch/<appid>.json, see electron/init.js); nothing is fetched.
*/

const fs = require('fs');
const path = require('path');
const { steamAppidOf } = require('../util/platformId.js');
const { knownUserDataDir } = require('../util/userDataPath.js');

function declaredExeNames(appid, userData) {
  if (!appid || !userData) return [];
  try {
    const cached = JSON.parse(fs.readFileSync(path.join(userData, 'steam_cache', 'steamdb_launch', `${appid}.json`), 'utf8'));
    return String((cached && cached.process_name) || '')
      .split(';')
      .map((name) => name.trim())
      .filter((name) => /\.exe$/i.test(name));
  } catch {
    return [];
  }
}

function exeHintsFor(game, userData = knownUserDataDir()) {
  const steamAppId = game ? steamAppidOf(game) : '';
  return { steamAppId, hints: declaredExeNames(steamAppId, userData) };
}

module.exports = { exeHintsFor };
