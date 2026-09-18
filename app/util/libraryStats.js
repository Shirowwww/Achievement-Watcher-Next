'use strict';

const { startedGames, defaultIsStarted } = require('./trophyStats.js');

function isInstalled(game) {
  return Boolean(game && (game.installed === true || game.installed === 1 || game.installed === '1'));
}

function averageProgress(games) {
  if (games.length === 0) return 0;
  const sum = games.reduce((total, game) => {
    const max = Number(game.achievement.total) || 0;
    const unlocked = Math.min(max, Number.parseInt(game.achievement.unlocked, 10) || 0);
    return total + (max > 0 ? Math.round((100 * unlocked) / max) : 0);
  }, 0);
  return Math.floor(sum / games.length);
}

// The average completion only weighs games the player has started (see trophyStats.js): a game
// never launched is not a 0% the player earned.
function calculateLibraryStats(games, { installedOnly = false, isStarted = defaultIsStarted } = {}) {
  // A game with no achievement schema still belongs in the library and can track playtime, but it
  // has no meaningful completion percentage. Excluding it from every achievement-stat denominator
  // avoids turning 0/0 into either a completed game or an artificial 0% entry in the average.
  const visibleGames = (Array.isArray(games) ? games : []).filter((game) => {
    if (!game || !game.achievement || (installedOnly && !isInstalled(game))) return false;
    return Number(game.achievement.total) > 0;
  });

  const totalUnlocked = visibleGames.reduce(
    (sum, game) => sum + (Number.parseInt(game.achievement.unlocked, 10) || 0),
    0
  );
  const completed = visibleGames.filter((game) => {
    const total = Number(game.achievement.total) || 0;
    return total > 0 && Number(game.achievement.unlocked) === total;
  }).length;
  const started = startedGames(visibleGames, { isStarted });

  return {
    totalUnlocked,
    completed,
    total: visibleGames.length,
    started: started.length,
    average: averageProgress(started),
  };
}

/*
  The detailed breakdown behind the profile header's three numbers. Kept in the same module so both
  read "a tracked game" the same way: a game with no achievement schema is in the library but has no
  completion, so it never lands in an achievement denominator.

  `groupOf` returns { key, label } for the platform breakdown. It is injected rather than derived
  here because the renderer already classifies sources for the tile badges, and two answers to
  "which platform is this" is how a game ends up counted under a badge it does not carry.
*/
function calculateDetailedLibraryStats(games, { installedOnly = false, groupOf = null, isStarted = defaultIsStarted } = {}) {
  const all = (Array.isArray(games) ? games : []).filter(Boolean);
  const visible = installedOnly ? all.filter(isInstalled) : all;
  const tracked = visible.filter((game) => game.achievement && Number(game.achievement.total) > 0);

  const stats = {
    library: { total: visible.length, tracked: tracked.length, untracked: visible.length - tracked.length, installed: visible.filter(isInstalled).length },
    games: { perfect: 0, inProgress: 0, notStarted: 0 },
    achievements: { unlocked: 0, total: 0, locked: 0 },
    completion: { overall: 0, average: 0, started: 0 },
    playtime: { seconds: 0, games: 0 },
    groups: [],
  };

  const groups = new Map();

  for (const game of tracked) {
    const total = Number(game.achievement.total) || 0;
    const unlocked = Math.min(total, Number.parseInt(game.achievement.unlocked, 10) || 0);
    stats.achievements.unlocked += unlocked;
    stats.achievements.total += total;
    if (unlocked >= total) stats.games.perfect += 1;
    else if (unlocked > 0) stats.games.inProgress += 1;
    else stats.games.notStarted += 1;

    const group = (typeof groupOf === 'function' && groupOf(game)) || null;
    const key = String((group && group.key) || game.source || 'unknown');
    if (!groups.has(key)) {
      groups.set(key, { key, label: String((group && group.label) || key), games: 0, perfect: 0, unlocked: 0, total: 0, completion: 0 });
    }
    const bucket = groups.get(key);
    bucket.games += 1;
    bucket.unlocked += unlocked;
    bucket.total += total;
    if (unlocked >= total) bucket.perfect += 1;
  }

  // Playtime is only counted where it is known: a library where nothing has been launched through
  // the app must show an empty total, not a total averaged over the handful of games that have one.
  for (const game of visible) {
    const seconds = Number(game.playtime) || 0;
    if (seconds <= 0) continue;
    stats.playtime.seconds += seconds;
    stats.playtime.games += 1;
  }

  stats.achievements.locked = Math.max(0, stats.achievements.total - stats.achievements.unlocked);
  stats.completion.overall =
    stats.achievements.total > 0 ? Math.min(100, (100 * stats.achievements.unlocked) / stats.achievements.total) : 0;
  const started = startedGames(tracked, { isStarted });
  stats.completion.started = started.length;
  stats.completion.average = averageProgress(started);

  stats.groups = [...groups.values()]
    .map((group) => ({ ...group, completion: group.total > 0 ? Math.min(100, (100 * group.unlocked) / group.total) : 0 }))
    .sort((a, b) => b.games - a.games || b.unlocked - a.unlocked || a.label.localeCompare(b.label));

  return stats;
}

module.exports = { calculateLibraryStats, calculateDetailedLibraryStats, isInstalled };
