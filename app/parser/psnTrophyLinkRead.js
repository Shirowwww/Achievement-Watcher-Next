'use strict';

/*
  The reading side of the tie between a game and its PlayStation trophy list, split from
  psnTrophyLink.js so the Watchdog can load it without the catalog and the Sony client: the 100%
  popup becomes the real platinum, and in the trophy mode an unlock carries the real grade.
  Dependency-free beyond the data folder and the grade table.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('../util/userDataPath.js');
const { trophyGradeOf, platinumFields } = require('./trophyGrade.js');

// `psnRoot` is steam_cache/psn; the library passes its own, the Watchdog takes the default.
const defaultRoot = () => path.join(userDataDir(), 'steam_cache', 'psn');
const safeKey = (appid) => String(appid || '').replace(/[^\w.-]/g, '_');
const linkFile = (appid, psnRoot = defaultRoot()) => path.join(psnRoot, 'links', `${safeKey(appid)}.json`);

function usableLink(link) {
  return link && link.listId && link.trophies && typeof link.trophies === 'object' ? link : null;
}

function readLink(appid, psnRoot = defaultRoot()) {
  if (!safeKey(appid)) return null;
  try {
    return usableLink(JSON.parse(fs.readFileSync(linkFile(appid, psnRoot), 'utf8')));
  } catch {
    return null; // no link, or one that cannot be read: the game keeps its own grades
  }
}

const trophyModeOn = (options) => String((options && options.achievement && options.achievement.rarityMode) || '').toLowerCase() === 'trophy';

// The Watchdog's part: it holds the user's options, the library does not.
function linkedGrade(options, link, achievementName) {
  if (!link || !trophyModeOn(options)) return undefined;
  const trophy = link.trophies[achievementName];
  return trophy ? trophyGradeOf(trophy.type) : undefined;
}

function linkedPlatinum(link) {
  return link && link.platinum && link.platinum.name ? link.platinum : null;
}

/*
  What an unlock seen by a live watcher (Xenia, a recompiled port, GOG, Ubisoft...) gains from its
  game's PlayStation list: the grade in the trophy mode, and the platinum popup when the achievement
  is the platinum itself. Fields the watcher set itself win.
*/
function withLinkedTrophy(options, payload) {
  const link = payload && readLink(payload.appid);
  const trophy = link && link.trophies[payload.achievementName];
  if (!trophy) return payload;
  const grade = linkedGrade(options, link, payload.achievementName);
  return { ...platinumFields(trophy.type, options), ...(grade ? { trophyGrade: grade } : {}), ...payload };
}

module.exports = { safeKey, linkFile, usableLink, readLink, linkedGrade, linkedPlatinum, withLinkedTrophy };
