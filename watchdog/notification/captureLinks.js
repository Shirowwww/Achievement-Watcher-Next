'use strict';

// Ties each screenshot and clip to its achievement as it is asked for (app/util/captureIndex.js),
// so the viewer never guesses from a file name. Never at the cost of the capture itself.

const debug = require('../util/log.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');

function store() {
  const { userDataDir } = require('../util/userData.js');
  return { index: require(sharedAppModulePath('util/captureIndex.js')), userData: userDataDir() };
}

function remember(message, kind, file) {
  if (!file || !message) return;
  try {
    const { index, userData } = store();
    index.record(userData, { appid: message.appid, name: message.achievementName, kind, file });
  } catch (err) {
    debug.warn(`[souvenir] could not record ${file}: ${err.message || err}`);
  }
}

// The unlock joined a clip that was still recording, so its own file will never exist.
function relink(requested, joined) {
  if (!requested || !joined || requested === joined) return;
  try {
    const { index, userData } = store();
    index.relink(userData, requested, joined);
  } catch (err) {
    debug.warn(`[clip] could not relink ${requested}: ${err.message || err}`);
  }
}

module.exports = { remember, relink };
