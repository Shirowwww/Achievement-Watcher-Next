'use strict';

/*
  The profile's trophy showcase.

  Platinum is a game at 100%, not an achievement. Every unlocked achievement is graded by its
  global unlock rate with the tiers the rarity badges and notifications use (rarityTiers.js). By
  default that is gold up to 5%, silver up to 10%, bronze up to 15%, and anything more common, or
  with no known rate, is common. In trophy mode every unlock is graded.

  Only games the player has started count: launched at least once, or with an unlock. A library
  full of never-launched games would otherwise sink every average without saying anything about
  the player.
*/

const rarityTiers = require('./rarityTiers.js');

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

// A PlayStation trophy's own letter, or the one of the PlayStation release a game is tied to.
function nativeTypeOf(game, achievement, trophyTypeOf) {
  const own = achievement && achievement.type;
  return String(own || (typeof trophyTypeOf === 'function' ? trophyTypeOf(game, achievement) : '') || '').toUpperCase();
}

/*
  When a game earned its platinum, or null. A game with a platinum trophy of its own has it once that
  trophy is earned, DLC trophies left or not, as on the console; any other game at 100%.
*/
function platinumEarnedAt(game, trophyTypeOf = null) {
  const list = Array.isArray(game?.achievement?.list) ? game.achievement.list : [];
  const trophy = list.find((achievement) => nativeTypeOf(game, achievement, trophyTypeOf) === 'P');
  if (trophy) return isAchieved(trophy) ? Number(trophy.UnlockTime) || 0 : null;
  if (unlockedCount(game) < (Number(game.achievement.total) || 0)) return null;
  return list.reduce((latest, a) => (isAchieved(a) ? Math.max(latest, Number(a.UnlockTime) || 0) : latest), 0);
}

function tierFor(type, percent, grading) {
  const native = NATIVE_GRADES[type];
  if (native) return native;
  return rarityTiers.tierFor(percent, grading.mode, grading.thresholds) || 'common';
}

/*
  `rarityOf(game)` returns a Map of achievement name to global unlock %, or null when the game has
  no known rates. It is injected because the rates live in the renderer's on-disk cache, as is `trophyTypeOf(game,
  achievement)`, the P/G/S/B letter of the PlayStation trophy an achievement is tied to.
*/
function calculateTrophyStats(games, { installedOnly = false, isStarted = defaultIsStarted, rarityOf = null, trophyTypeOf = null, mode, thresholds } = {}) {
  const grading = { mode, thresholds };
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
    const completedAt = platinumEarnedAt(game, trophyTypeOf);
    if (completedAt !== null) {
      stats.platinum += 1;
      stats.platinumGames.push({ game, completedAt });
    }

    const rates = typeof rarityOf === 'function' ? rarityOf(game) : null;
    for (const achievement of list) {
      if (!isAchieved(achievement)) continue;
      const raw = rates ? rates.get(String(achievement.name)) : undefined;
      const percent = raw === undefined || raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
      const type = nativeTypeOf(game, achievement, trophyTypeOf);
      const tier = tierFor(type, percent, grading);
      stats[tier] += 1;
      if (percent === null && !NATIVE_GRADES[type]) stats.unranked += 1;
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
function listUnlockedByRarity(games, { installedOnly = false, isStarted = defaultIsStarted, rarityOf = null, trophyTypeOf = null, mode, thresholds } = {}) {
  const grading = { mode, thresholds };
  const out = [];
  for (const game of startedGames(games, { installedOnly, isStarted })) {
    const list = Array.isArray(game.achievement.list) ? game.achievement.list : [];
    const rates = typeof rarityOf === 'function' ? rarityOf(game) : null;
    for (const achievement of list) {
      if (!isAchieved(achievement)) continue;
      const raw = rates ? rates.get(String(achievement.name)) : undefined;
      const percent = raw === undefined || raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
      out.push({ game, achievement, percent, tier: tierFor(nativeTypeOf(game, achievement, trophyTypeOf), percent, grading), unlockedAt: Number(achievement.UnlockTime) || 0 });
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

module.exports = { calculateTrophyStats, listUnlockedByRarity, platinumEarnedAt, startedGames, defaultIsStarted, RAREST_COUNT };
