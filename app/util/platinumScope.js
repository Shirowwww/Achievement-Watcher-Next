'use strict';

/*
  Which achievements the platinum waits for. By default ('base') the base game's, its DLC sets and
  extra trophy groups aside, as on PlayStation: Spider-Man Remastered's platinum needs 50 of 78.
  'all' waits for the whole list. The notifier, the achievement page and the trophy stats share it.
*/

const SCOPES = ['base', 'all'];
const DEFAULT_SCOPE = 'base';

const normalizeScope = (value) => (SCOPES.includes(value) ? value : DEFAULT_SCOPE);

/**
 * @param {object[]} list the game's achievements
 * @param {{ scope?: string, categoryOf?: (achievement: object) => string }} [options] `categoryOf` gives
 *   the DLC set or trophy group an achievement belongs to, '' for the base game.
 * @returns {((achievement: object) => boolean)|null} whether an achievement counts for the platinum,
 *   or null when the whole list counts (scope 'all', no DLC, or a list made only of sets).
 */
function platinumFilter(list, { scope = DEFAULT_SCOPE, categoryOf = (achievement) => achievement.category } = {}) {
  if (normalizeScope(scope) === 'all' || !Array.isArray(list)) return null;
  const isBase = (achievement) => Boolean(achievement) && !String(categoryOf(achievement) || '').trim();
  const real = list.filter((achievement) => achievement && !achievement.removed);
  const base = real.filter(isBase).length;
  if (base === 0 || base === real.length) return null;
  return isBase;
}

module.exports = { SCOPES, DEFAULT_SCOPE, normalizeScope, platinumFilter };
