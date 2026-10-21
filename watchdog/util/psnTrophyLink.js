'use strict';

/*
  The tie the app made between a game and its PlayStation trophy list (app/parser/psnTrophyLink.js):
  the 100% popup becomes the real platinum, and in the trophy mode an unlock carries the real grade.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { trophyGradeOf, platinumFields } = require('./trophyGrade.js');

const linkFile = (appid) => path.join(userDataDir(), 'steam_cache', 'psn', 'links', `${String(appid || '').replace(/[^\w.-]/g, '_')}.json`);

function readLink(appid) {
  if (!appid) return null;
  try {
    const link = JSON.parse(fs.readFileSync(linkFile(appid), 'utf8'));
    return link && link.listId && link.trophies && typeof link.trophies === 'object' ? link : null;
  } catch {
    return null; // no link, or one that cannot be read: the game keeps its own grades
  }
}

const trophyModeOn = (options) => String((options && options.achievement && options.achievement.rarityMode) || '').toLowerCase() === 'trophy';

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

module.exports = { readLink, linkedGrade, linkedPlatinum, withLinkedTrophy };
