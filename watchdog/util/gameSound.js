'use strict';

/*
  The sound a game's own panel picked (app/util/gamePreset.js), for the Windows notification, which
  would otherwise ring with the global sound for a game set to "no sound". Re-read every ~2s, so a
  change made in the app applies without a restart.
*/

const { userDataDir } = require('./userData.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const gamePreset = require(sharedAppModulePath('util/gamePreset.js'));

const CACHE_MS = 2000;
let readAt = 0;

// '' when the game has no sound of its own, else a file name or one of the two keywords.
function soundFor(appid) {
  if (appid == null || appid === '') return '';
  const now = Date.now();
  if (now - readAt > CACHE_MS) {
    gamePreset.setUserDataPath(userDataDir());
    readAt = now;
  }
  return gamePreset.getSettings(appid).sound || '';
}

function _reset() {
  readAt = 0;
}

module.exports = { soundFor, _reset };
