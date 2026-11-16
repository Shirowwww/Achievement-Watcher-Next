'use strict';

/*
  Reset of several games at once (#192). Each game goes through the single-game plan and run, so
  each keeps its own backup and its own all-or-nothing rollback; this only sorts the games and
  collects the outcomes. A game whose platform owns its unlocks is skipped, never half-reset.
*/

const path = require('path');
const achievementReset = require(path.join(__dirname, 'achievementReset.js'));

const SKIP = Object.freeze({ OFFICIAL: 'official', NOTHING: 'nothing', ERROR: 'error' });

// Sorts the games into what will be reset and what is skipped, and why. `planOne` is for tests.
function planMany(games, { planOne = (game) => achievementReset.plan(game) } = {}) {
  const ready = [];
  const skipped = [];
  const seen = new Set();
  for (const game of Array.isArray(games) ? games : []) {
    const key = game && game.appid != null ? String(game.appid) : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let resetPlan;
    try {
      resetPlan = planOne(game);
    } catch (err) {
      skipped.push({ game, reason: SKIP.ERROR, message: String((err && err.message) || err) });
      continue;
    }
    if (resetPlan && resetPlan.supported) {
      ready.push({ game, plan: resetPlan });
    } else {
      const official = resetPlan && resetPlan.blocked.some((entry) => entry.reason === 'official-platform');
      skipped.push({ game, reason: official ? SKIP.OFFICIAL : SKIP.NOTHING });
    }
  }
  return { ready, skipped };
}

// Runs the plans one game after another. A failed game is rolled back by its own run and the next
// one still goes ahead: one locked save must not keep the others from being reset.
function runMany(ready, { runOne = (resetPlan) => achievementReset.run(resetPlan) } = {}) {
  const done = [];
  const failed = [];
  for (const entry of ready) {
    let result;
    try {
      result = runOne(entry.plan);
    } catch (err) {
      failed.push({ game: entry.game, errors: [{ path: '', message: String((err && err.message) || err) }] });
      continue;
    }
    if (result && result.ok) done.push({ game: entry.game, plan: entry.plan, result });
    else failed.push({ game: entry.game, result, errors: (result && result.errors) || [] });
  }
  return { done, failed };
}

module.exports = { SKIP, planMany, runMany };
