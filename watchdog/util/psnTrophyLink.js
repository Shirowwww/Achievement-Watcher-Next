'use strict';

/*
  The tie the app made between a game and its PlayStation trophy list (app/parser/psnTrophyLink.js):
  in the trophy mode an unlock carries the real grade, and the 100% popup becomes the real platinum.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { trophyGradeOf } = require('./trophyGrade.js');

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

function linkedPlatinum(options, link) {
  if (!link || !trophyModeOn(options) || !link.platinum || !link.platinum.name) return null;
  return link.platinum;
}

module.exports = { readLink, linkedGrade, linkedPlatinum };
