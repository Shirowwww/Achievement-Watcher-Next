'use strict';

/*
  The library's progress and platform filters, beside the collections. Pure rules over a game record,
  so the tiles, the stats and the tests agree on which games a filter keeps.
*/

const { baseProgress } = require('./achievementGroups.js');

const PROGRESS_FILTERS = Object.freeze(['all', 'not-started', 'in-progress', 'almost', 'complete', 'complete-base']);
// "Almost done": what is left is a short evening, not a second playthrough.
const ALMOST_PERCENT = 80;

const normalizeProgressFilter = (value) => (PROGRESS_FILTERS.includes(value) ? value : 'all');
const normalizePlatformFilter = (value) => (typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value) ? value : '');

function progressOf(game) {
  const achievement = (game && game.achievement) || {};
  const list = Array.isArray(achievement.list) ? achievement.list : [];
  const unlocked = Math.max(0, Number(achievement.unlocked) || 0);
  const total = Math.max(Number(achievement.total) || 0, list.length, unlocked);
  return { unlocked, total, list };
}

// `categoryOf(game, achievement)` is the page's own grouping, so "100% base game" agrees with it.
function matchesProgress(game, filter, categoryOf = (owner, achievement) => achievement.category) {
  const mode = normalizeProgressFilter(filter);
  if (mode === 'all') return true;
  const { unlocked, total, list } = progressOf(game);
  if (total === 0) return false;
  if (mode === 'not-started') return unlocked === 0;
  if (mode === 'in-progress') return unlocked > 0 && unlocked < total;
  if (mode === 'almost') return unlocked < total && (unlocked / total) * 100 >= ALMOST_PERCENT;
  if (mode === 'complete') return unlocked >= total;
  const base = baseProgress(list, (achievement) => categoryOf(game, achievement));
  return base.total > 0 && base.unlocked >= base.total;
}

/*
  Which games the library marks as perfect (Settings > Appearance > Library tiles): every achievement
  DLC included ('all', the default), the base game alone ('base'), or none ('off'). Same rules as the
  "100%" and "100% base game" filters.
*/
const PERFECT_MODES = Object.freeze(['all', 'base', 'off']);
const normalizePerfectMode = (value) => (PERFECT_MODES.includes(value) ? value : 'all');

function isPerfect(game, mode, categoryOf) {
  const wanted = normalizePerfectMode(mode);
  return wanted !== 'off' && matchesProgress(game, wanted === 'base' ? 'complete-base' : 'complete', categoryOf);
}

// `platformOf(game)` gives the platform key the filter compares, '' keeps every platform.
function matchesFilters(game, { progress = 'all', platform = '', platformOf = () => '', categoryOf } = {}) {
  const wanted = normalizePlatformFilter(platform);
  return matchesProgress(game, progress, categoryOf) && (!wanted || platformOf(game) === wanted);
}

module.exports = { PROGRESS_FILTERS, ALMOST_PERCENT, PERFECT_MODES, normalizeProgressFilter, normalizePlatformFilter, normalizePerfectMode, matchesProgress, matchesFilters, isPerfect };
