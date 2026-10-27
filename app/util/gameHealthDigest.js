'use strict';

/*
  What a log export says about the library: counts for the whole of it, and the full Game Health
  report of the games most likely to be the reason someone is reporting - the ones whose tile is
  not green first, then the ones played most recently. Built in the renderer, which holds the game
  list, only when the user exports; the reports themselves come from util/gameHealth.js.
*/

const gameHealth = require('./gameHealth.js');

const DEFAULT_LIMIT = 25;

function lastUnlockOf(game) {
  const list = (game && game.achievement && Array.isArray(game.achievement.list) && game.achievement.list) || [];
  let latest = 0;
  for (const achievement of list) {
    const time = Number(achievement && achievement.UnlockTime) || 0;
    if (achievement && achievement.Achieved && time > latest) latest = time;
  }
  return latest;
}

function bump(map, key) {
  const name = key || 'unknown';
  map[name] = (map[name] || 0) + 1;
}

// Counts only: no names, so a library that says something about its owner stays theirs.
function librarySummary(games = []) {
  const summary = { total: 0, installed: 0, manual: 0, unconfigured: 0, noAchievements: 0, bySource: {}, byState: {} };
  for (const game of games) {
    if (!game) continue;
    summary.total += 1;
    if (game.installed) summary.installed += 1;
    if (game.manual) summary.manual += 1;
    if (game.unconfigured) summary.unconfigured += 1;
    if (game.achievement && game.achievement.none) summary.noAchievements += 1;
    bump(summary.bySource, game.source);
    bump(summary.byState, gameHealth.dotState(game) || 'none');
  }
  return summary;
}

// The games worth a full report, most suspicious first. Ties keep the library order.
function pickGames(games = [], { limit = DEFAULT_LIMIT } = {}) {
  return games
    .filter((game) => game && game.appid != null && gameHealth.needsFullReport(game))
    .map((game, index) => ({ game, index, healthy: gameHealth.dotState(game) === gameHealth.STATE.READY, lastUnlock: lastUnlockOf(game) }))
    .sort((a, b) => Number(a.healthy) - Number(b.healthy) || b.lastUnlock - a.lastUnlock || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.game);
}

// One game's entry: the verdict, the checks that are not fine, and the technical block as is.
function digestEntry(report, game = {}) {
  const checks = (report.checks || []).filter((entry) => entry.level !== gameHealth.LEVEL.OK);
  const lastUnlock = lastUnlockOf(game);
  return {
    appid: String(game.appid != null ? game.appid : (report.technical && report.technical.appid) || ''),
    name: game.name || (report.technical && report.technical.name) || '',
    lastUnlock: lastUnlock ? new Date(lastUnlock * 1000).toISOString() : null,
    state: report.state,
    reason: report.reason,
    checks: checks.map((entry) => ({ id: entry.id, level: entry.level, params: entry.params })),
    actions: report.actions || [],
    technical: report.technical,
  };
}

module.exports = { librarySummary, pickGames, digestEntry, lastUnlockOf, DEFAULT_LIMIT };
