'use strict';

const path = require('path');
const { lazyRequire } = require('../util/lazyRequire.js');
const glob = lazyRequire('fast-glob');
const ffs = require('../util/fsAsync');

// The Watchdog's unlock baseline per game, <appid>.db: written by watchdog/track.js, listed here,
// deleted or edited by a reset.
const BASELINE_DIR = 'steam_cache/data';

function baselineDir(userDataPath) {
  return path.join(userDataPath || '', BASELINE_DIR);
}

const baselineName = (appid) => `${appid}.db`;

function baselineFile(userDataPath, appid) {
  return path.join(baselineDir(userDataPath), baselineName(appid));
}

module.exports.BASELINE_DIR = BASELINE_DIR;
module.exports.baselineDir = baselineDir;
module.exports.baselineFile = baselineFile;
module.exports.baselineName = baselineName;

let cache;

module.exports.setUserDataPath = (p) => {
  cache = baselineDir(p);
};

module.exports.scan = async () => {
  let data = [];

  for (let file of await glob('([0-9])+.db', { cwd: cache, onlyFiles: true, absolute: false })) {
    data.push({
      appid: file.replace('.db', ''),
      source: 'Achievement Watcher : Watchdog',
      data: {
        type: 'cached',
      },
    });
  }

  return data;
};

module.exports.getAchievements = async (appID) => {
  return JSON.parse(await ffs.readFile(path.join(cache, baselineName(appID)), 'utf8'));
};
