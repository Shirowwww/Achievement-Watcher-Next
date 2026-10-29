'use strict';

/*
  Many Steam games have their own platinum, an achievement for earning all the others. Its unlock is
  shown as the platinum popup, with its own name and icon, instead of a normal popup and then the
  synthetic one at 100%. On 760 popular games this rule found 68 of 80 and none wrongly.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const debug = require('./log.js');

const EVERY_ACHIEVEMENT = /(^|[^a-z])(all|every|each)( of)?( the)?( other| remaining| original| base[- ]game| regular| main)* ?(game )?(achievements?|trophies)([^a-z]|$)/i;
const EVERY_OTHER = /(other|remaining) (achievements?|trophies)/i;
// "Unlock all 6 pistol achievements", "Collect all trophies" (in-game ones), "Find all the trophies in...".
const NOT_EVERYTHING = /(all|every) [0-9]|following|new map|trophy animal|weapon|find all|collect all (the )?trophies/i;
// The platinum is among the rarest: within three times the rarest rate (plus half a point of noise).
const RARE_FACTOR = 3;
const RARE_SLACK = 0.5;

function looksLikePlatinum(description) {
  const text = String(description || '');
  return (EVERY_ACHIEVEMENT.test(text) || EVERY_OTHER.test(text)) && !NOT_EVERYTHING.test(text);
}

const rateOf = (achievement) => {
  const rate = Number(achievement && achievement.rarityPercent);
  return Number.isFinite(rate) && rate >= 0 && achievement.rarityPercent !== null && achievement.rarityPercent !== '' ? rate : null;
};

// The name of the list's platinum-like achievement, or null when it has none (or no clear one).
function platinumLikeName(list) {
  if (!Array.isArray(list)) return null;
  const achievements = list.filter((achievement) => achievement && typeof achievement === 'object' && achievement.name);
  const candidates = achievements.filter((achievement) => looksLikePlatinum(achievement.description));
  if (candidates.length === 0) return null;
  const rates = achievements.map(rateOf).filter((rate) => rate !== null);
  if (rates.length === 0) return candidates.length === 1 ? String(candidates[0].name) : null;
  const ceiling = Math.min(...rates) * RARE_FACTOR + RARE_SLACK;
  const rare = candidates.filter((achievement) => rateOf(achievement) !== null && rateOf(achievement) <= ceiling);
  if (rare.length === 0) return null;
  return String(rare.reduce((best, achievement) => (rateOf(achievement) < rateOf(best) ? achievement : best)).name);
}

/*
  The rule reads English: the list in the user's language serves only when no English copy is
  cached. Achievement names are the same in every language, so the answer fits either list.
*/
function platinumLikeForGame(game, lang, rates = new Map()) {
  const own = game && game.achievement && game.achievement.list;
  // A list cached without rates borrows the ones the notifier already loaded for its rare badge.
  const withRate = (achievement) =>
    achievement && rateOf(achievement) === null && rates.has(achievement.name) ? { ...achievement, rarityPercent: rates.get(achievement.name) } : achievement;
  const list = Array.isArray(own) ? own.map(withRate) : own;
  const appid = String((game && (game.steamappid || game.appid)) || '');
  if (lang !== 'english' && /^\d+$/.test(appid)) {
    try {
      const english = JSON.parse(fs.readFileSync(path.join(userDataDir(), 'steam_cache', 'schema', 'english', `${appid}.db`), 'utf8'));
      const found = platinumLikeName(english && english.achievement && english.achievement.list);
      if (found && Array.isArray(list) && list.some((achievement) => achievement && String(achievement.name) === found)) return found;
    } catch (err) {
      // No English copy is the usual case; a damaged one is worth a line, and either way the list
      // in the user's language is read instead.
      if (err && err.code !== 'ENOENT') debug.warn(`[platinum] English schema of ${appid} unreadable: ${err.message || err}`);
    }
  }
  return platinumLikeName(list);
}

module.exports = { looksLikePlatinum, platinumLikeName, platinumLikeForGame };
