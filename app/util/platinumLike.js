'use strict';

/*
  A game's own platinum: an achievement for earning all the others ("Obtain every achievement",
  "Platinum Action Unleashed!"), or the one tied to its PlayStation platinum trophy. The notifier pops
  it as the platinum and the achievement page labels it so: both ask this file, so they cannot disagree.
  On 913 popular Steam games the rule found 66, none wrongly (two are an expansion's own, Iceborne's).
*/

const EVERY_ACHIEVEMENT =
  /(^|[^a-z])(all|every|each)( of)?( the)?( other| remaining| original| base[- ]game| non-dlc| regular| main)* ?(game )?(achievements?|trophies)([^a-z]|$)/i;
const EVERY_OTHER = /(other|remaining) (achievements?|trophies)/i;
// "Unlock all 6 pistol achievements", "Collect all trophies" (in-game ones), "Find all the trophies in...",
// "Earn all achievements for any gun", "Win all the trophies on grass".
const NOT_EVERYTHING = /(all|every) [0-9]|following|new map|trophy animal|weapon|find all|collect all (the )?trophies|win all (the )?trophies|(achievements?|trophies) for (any|each|every|a|an) /i;
// A name that says platinum over a text that says everything: "Platinum Action Unleashed!" / "You did
// everything you could do". Medal and league rows ("Kills Platinum", "World Cup (Platinum)") say neither.
const PLATINUM_NAME = /(^|[^a-z])platinum([^a-z]|$)/i;
const EVERYTHING = /(^|[^a-z])everything([^a-z]|$)/i;
const NOT_PLATINUM_NAME = /\(platinum\)|medal|league|rank|award|card/i;
// The platinum is among the rarest: within three times the rarest rate (plus half a point of noise).
const RARE_FACTOR = 3;
const RARE_SLACK = 0.5;

function looksLikePlatinum(description, displayName = '') {
  const text = String(description || '');
  const name = String(displayName || '');
  if ((EVERY_ACHIEVEMENT.test(text) || EVERY_OTHER.test(text)) && !NOT_EVERYTHING.test(text)) return true;
  return PLATINUM_NAME.test(name) && EVERYTHING.test(text) && !NOT_PLATINUM_NAME.test(`${name} ${text}`);
}

const rateOf = (achievement) => {
  const rate = Number(achievement && achievement.rarityPercent);
  return Number.isFinite(rate) && rate >= 0 && achievement.rarityPercent !== null && achievement.rarityPercent !== '' ? rate : null;
};

// The name of the list's platinum-like achievement, or null when it has none (or no clear one).
function platinumLikeName(list) {
  if (!Array.isArray(list)) return null;
  const achievements = list.filter((achievement) => achievement && typeof achievement === 'object' && achievement.name);
  const candidates = achievements.filter((achievement) => looksLikePlatinum(achievement.description, achievement.displayName));
  if (candidates.length === 0) return null;
  const rates = achievements.map(rateOf).filter((rate) => rate !== null);
  if (rates.length === 0) return candidates.length === 1 ? String(candidates[0].name) : null;
  const ceiling = Math.min(...rates) * RARE_FACTOR + RARE_SLACK;
  const rare = candidates.filter((achievement) => rateOf(achievement) !== null && rateOf(achievement) <= ceiling);
  if (rare.length === 0) return null;
  return String(rare.reduce((best, achievement) => (rateOf(achievement) < rateOf(best) ? achievement : best)).name);
}

/**
 * The game's own platinum achievement, by the one rule the notifier and the page share.
 * @param {object} game a library or Watchdog game ({ appid, achievement: { list } })
 * @param {{ lang?: string, rates?: Map<string, number>, englishList?: (appid: string) => object[]|null, twinName?: string|null }} [options]
 *   `englishList` reads the cached English schema: the rule reads English, and achievement names are
 *   the same in every language. `twinName` is the achievement tied to a PlayStation platinum.
 * @returns {string|null}
 */
function platinumNameOf(game, { lang = 'english', rates = new Map(), englishList = null, twinName = null } = {}) {
  const own = game && game.achievement && game.achievement.list;
  const has = (name) => Array.isArray(own) && own.some((achievement) => achievement && String(achievement.name) === name);
  if (twinName && has(String(twinName))) return String(twinName);
  // A list cached without rates borrows the ones the notifier already loaded for its rare badge.
  const withRate = (achievement) =>
    achievement && rateOf(achievement) === null && rates.has(achievement.name) ? { ...achievement, rarityPercent: rates.get(achievement.name) } : achievement;
  const list = Array.isArray(own) ? own.map(withRate) : own;
  const appid = String((game && (game.steamappid || game.appid)) || '');
  if (lang !== 'english' && /^\d+$/.test(appid) && typeof englishList === 'function') {
    const found = platinumLikeName(englishList(appid));
    if (found && has(found)) return found;
  }
  return platinumLikeName(list);
}

module.exports = { looksLikePlatinum, platinumLikeName, platinumNameOf };
