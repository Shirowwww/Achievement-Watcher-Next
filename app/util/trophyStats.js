'use strict';

/*
  The profile's trophy showcase.

  Platinum is a game at 100%, not an achievement. Every unlocked achievement is graded by its
  global unlock rate with the tiers the rarity badges and notifications use (overlayUi.rarityTier:
  gold up to 5%, silver up to 10%, bronze up to 15%). Anything more common, or with no known rate,
  is common.

  Only games the player has started count: launched at least once, or with an unlock. A library
  full of never-launched games would otherwise sink every average without saying anything about
  the player.
*/

const { rarityTier } = require('./overlayUi.js');

// RPCS3 trophy sets carry their own grade. The platinum trophy itself is a single achievement, so it
// ranks with the gold ones; the game it completes is what the platinum counter counts.
// How many of the rarest unlocks the stats panel lists.
const RAREST_COUNT = 10;

const NATIVE_GRADES = { P: 'gold', G: 'gold', S: 'silver', B: 'bronze' };

function isInstalled(game) {
  return Boolean(game && (game.installed === true || game.installed === 1 || game.installed === '1'));
}

function isAchieved(achievement) {
  return Boolean(achievement && (achievement.Achieved === true || achievement.Achieved == 1));
}

function unlockedCount(game) {
  const total = Number(game.achievement.total) || 0;
  return Math.min(total, Number.parseInt(game.achievement.unlocked, 10) || 0);
}

function defaultIsStarted(game) {
  return unlockedCount(game) > 0 || Number(game.playtime) > 0 || Number(game.lastplayed) > 0;
}

// Games with an achievement set that the player has launched or unlocked something in.
function startedGames(games, { installedOnly = false, isStarted = defaultIsStarted } = {}) {
  return (Array.isArray(games) ? games : []).filter((game) => {
    if (!game || !game.achievement || Number(game.achievement.total) <= 0) return false;
    if (installedOnly && !isInstalled(game)) return false;
    return unlockedCount(game) > 0 || Boolean(isStarted(game));
  });
}

function tierFor(achievement, percent) {
  const native = NATIVE_GRADES[String((achievement && achievement.type) || '').toUpperCase()];
  if (native) return native;
  return rarityTier(percent) || 'common';
}

/*
  `rarityOf(game)` returns a Map of achievement name to global unlock %, or null when the game has
  no known rates. It is injected because the rates live in the renderer's on-disk cache.
*/
function calculateTrophyStats(games, { installedOnly = false, isStarted = defaultIsStarted, rarityOf = null } = {}) {
  const counted = startedGames(games, { installedOnly, isStarted });
  const stats = {
    games: counted.length,
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    common: 0,
    unranked: 0,
    platinumGames: [],
    rarest: [],
  };

  for (const game of counted) {
    const list = Array.isArray(game.achievement.list) ? game.achievement.list : [];
    const total = Number(game.achievement.total) || 0;
    if (unlockedCount(game) >= total) {
      const completedAt = list.reduce((latest, a) => (isAchieved(a) ? Math.max(latest, Number(a.UnlockTime) || 0) : latest), 0);
      stats.platinum += 1;
      stats.platinumGames.push({ game, completedAt });
    }

    const rates = typeof rarityOf === 'function' ? rarityOf(game) : null;
    for (const achievement of list) {
      if (!isAchieved(achievement)) continue;
      const raw = rates ? rates.get(String(achievement.name)) : undefined;
      const percent = raw === undefined || raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
      const tier = tierFor(achievement, percent);
      stats[tier] += 1;
      if (percent === null && tier === 'common') stats.unranked += 1;
      // Kept sorted and capped as it goes: a large library has tens of thousands of unlocks.
      if (percent !== null && (stats.rarest.length < RAREST_COUNT || percent < stats.rarest[stats.rarest.length - 1].percent)) {
        const entry = { game, achievement, percent, tier };
        const at = stats.rarest.findIndex((other) => percent < other.percent);
        if (at === -1) stats.rarest.push(entry);
        else stats.rarest.splice(at, 0, entry);
        if (stats.rarest.length > RAREST_COUNT) stats.rarest.pop();
      }
    }
  }

  stats.platinumGames.sort((a, b) => b.completedAt - a.completedAt);
  return stats;
}

/*
  Every unlocked achievement of the started games, rarest first, for the stats panel's full list.
  Built only when that list opens: sorting every unlock has no place in the header refresh.
  Achievements with no known rate go last, most recent unlock first.
*/
function listUnlockedByRarity(games, { installedOnly = false, isStarted = defaultIsStarted, rarityOf = null } = {}) {
  const out = [];
  for (const game of startedGames(games, { installedOnly, isStarted })) {
    const list = Array.isArray(game.achievement.list) ? game.achievement.list : [];
    const rates = typeof rarityOf === 'function' ? rarityOf(game) : null;
    for (const achievement of list) {
      if (!isAchieved(achievement)) continue;
      const raw = rates ? rates.get(String(achievement.name)) : undefined;
      const percent = raw === undefined || raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
      out.push({ game, achievement, percent, tier: tierFor(achievement, percent), unlockedAt: Number(achievement.UnlockTime) || 0 });
    }
  }
  return out.sort((a, b) => {
    if (a.percent === null || b.percent === null) {
      if (a.percent !== b.percent) return a.percent === null ? 1 : -1;
      return b.unlockedAt - a.unlockedAt;
    }
    return a.percent - b.percent || b.unlockedAt - a.unlockedAt;
  });
}

module.exports = { calculateTrophyStats, listUnlockedByRarity, startedGames, defaultIsStarted, RAREST_COUNT };
