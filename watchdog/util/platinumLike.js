'use strict';

/*
  The Watchdog's door to the shared platinum rule (app/util/platinumLike.js): the achievement page
  labels the same achievement the notifier pops as the platinum. Only the English schema read from
  the cache is the Watchdog's own.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const debug = require('./log.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const shared = require(sharedAppModulePath('util/platinumLike.js'));

function cachedEnglishList(appid) {
  try {
    const english = JSON.parse(fs.readFileSync(path.join(userDataDir(), 'steam_cache', 'schema', 'english', `${appid}.db`), 'utf8'));
    return english && english.achievement && english.achievement.list;
  } catch (err) {
    // No English copy is the usual case; a damaged one is worth a line, and either way the list
    // in the user's language is read instead.
    if (err && err.code !== 'ENOENT') debug.warn(`[platinum] English schema of ${appid} unreadable: ${err.message || err}`);
    return null;
  }
}

function platinumLikeForGame(game, lang, rates = new Map(), twinName = null) {
  return shared.platinumNameOf(game, { lang, rates, englishList: cachedEnglishList, twinName });
}

module.exports = { looksLikePlatinum: shared.looksLikePlatinum, platinumLikeName: shared.platinumLikeName, platinumLikeForGame };
