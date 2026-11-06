'use strict';

const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const path = require('path');
const fs = require(sharedAppModulePath('util/fsAsync.js'));
// Only used when an unrecognised process needs its directory searched for an emulator config.
const glob = require('../util/lazyRequire.js').lazyRequire('fast-glob');
const ini = require(sharedAppModulePath('util/ini.js'));

async function findByReadingContentOfKnownConfigfilesIn(dirPath, exeDir) {
  const files = [
    'steam_appid.txt', //generic
    'steam_emu.ini', //Codex, ...
    'ALI213.ini',
    'valve.ini',
    'SteamConfig.ini', //ALI213
    'hlm.ini', //Hoodlum
    'ds.ini', //DarkSiders
    'steam_api.ini', //Rld, Skidrow, ...
    'CPY.ini',
    'ColdClientLoader.ini', //Goldberg experimental
    'SmartSteamEmu.ini',
    'ColdAPI.ini',
  ];

  const list = await glob(
    files.map((file) => '**/' + file),
    // No emulator config lives in a dependency tree, and one can hold tens of thousands of files.
    { cwd: dirPath, onlyFiles: true, absolute: true, ignore: ['**/node_modules/**'] }
  );

  // Every marker found, not the first: a folder that holds several games (a Downloads folder) answers
  // with several appids, and none of them stands for the exe that was run from there.
  const found = [];

  for (const file of list) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let appid;
      if (path.parse(file).ext === '.txt') {
        appid = content.toString().trim();
      } else {
        const data = ini.parse(content);

        //Nb: order of if test is ~somewhat~ important
        if (data.SmartSteamEmu) appid = data.SmartSteamEmu.AppId;
        else if (data.Steam) appid = data.Steam.AppId;
        else if (data.Settings) appid = data.Settings.AppId || data.Settings.AppID;
        else if (data.GameSettings) appid = data.GameSettings.AppId;
        else if (data.SteamData) appid = data.SteamData.AppID;
        else if (data.SteamClient) appid = data.SteamClient.AppId;
        else throw 'ERROR_UNEXPECTED_CONTENT';
      }
      appid = String(appid || '').trim();
      if (appid) found.push({ appid, dir: key(path.dirname(file)) });
    } catch (err) {
      /*Do Nothing; Try next file if any*/
    }
  }

  return pickMarker(found, key(dirPath), key(exeDir || dirPath));
}

function key(dir) {
  return path.resolve(dir).toLowerCase();
}

function isInside(dir, root) {
  return dir === root || dir.startsWith(root + path.sep);
}

/*
  Which marker stands for the exe. `searched` is the folder globbed, `exeDir` the exe's own folder
  (the same, or a descendant when the search climbed to a game root).
  - a marker beside the exe, or on the path from the exe up to the searched folder: the nearest wins,
    other markers in the tree (an embedded tool, a DLC) do not matter;
  - otherwise one distinct appid below: trusted when the search climbed (the exe lives in that tree),
    `nested` when it did not (the caller must corroborate: it may be a game next to an installer);
  - several distinct appids below: a folder of many games, no answer.
*/
function pickMarker(found, searched, exeDir) {
  if (found.length === 0) throw 'ERROR_NOT_FOUND';
  const onPath = found.filter((m) => isInside(exeDir, m.dir)).sort((a, b) => b.dir.length - a.dir.length);
  if (onPath.length > 0) return { appid: onPath[0].appid, nested: false };
  if (new Set(found.map((m) => m.appid)).size > 1) throw 'ERROR_AMBIGUOUS';
  return { appid: found[0].appid, nested: searched === exeDir };
}

module.exports = { findByReadingContentOfKnownConfigfilesIn };
