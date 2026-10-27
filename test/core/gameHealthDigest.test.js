'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const digest = require('../../app/util/gameHealthDigest.js');
const gameHealth = require('../../app/util/gameHealth.js');

function game(appid, extra = {}) {
  return { appid, name: `Game ${appid}`, source: 'GBE', installed: true, hasSteamApiDll: true, achievement: { total: 10, list: [] }, ...extra };
}

const unlocked = (time) => ({ list: [{ Achieved: true, UnlockTime: time }, { Achieved: false, UnlockTime: time + 99 }], total: 2 });

test('the library summary counts by source and tile state, with no game names', () => {
  const summary = digest.librarySummary([
    game(1),
    game(2, { source: 'Steam', hasSteamApiDll: false }),
    game(3, { installed: false, manual: true }),
    game(4, { achievement: { none: true } }),
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.installed, 3);
  assert.equal(summary.manual, 1);
  assert.equal(summary.noAchievements, 1);
  assert.deepEqual(summary.bySource, { GBE: 3, Steam: 1 });
  assert.equal(summary.byState[gameHealth.STATE.READY], 1);
  assert.equal(summary.byState[gameHealth.STATE.NOT_TRACKING], 1);
  assert.equal(summary.byState.none, 2);
  assert.ok(!JSON.stringify(summary).includes('Game '));
});

test('games that are not green come first, then the most recently unlocked, up to the limit', () => {
  const games = [
    game(10, { achievement: unlocked(100) }),
    game(11, { hasSteamApiDll: false }),
    game(12, { achievement: unlocked(300) }),
    game(13, { installed: false }),
    game(14, { achievement: unlocked(200) }),
  ];
  assert.deepEqual(digest.pickGames(games).map((g) => g.appid), [11, 12, 14, 10]);
  assert.deepEqual(digest.pickGames(games, { limit: 2 }).map((g) => g.appid), [11, 12]);
});

test('the last unlock ignores locked entries', () => {
  assert.equal(digest.lastUnlockOf(game(1, { achievement: unlocked(500) })), 500);
  assert.equal(digest.lastUnlockOf({}), 0);
});

test('a digest entry keeps the verdict, the checks that are not fine and the technical block', () => {
  const g = game(480, { achievement: unlocked(1700000000) });
  const report = gameHealth.deriveHealth({ appid: 480, name: 'Spacewar', installed: true, achievements: { total: 0, unlocked: 0 } });
  const entry = digest.digestEntry(report, g);
  assert.equal(entry.appid, '480');
  assert.equal(entry.state, report.state);
  assert.equal(entry.lastUnlock, '2023-11-14T22:13:20.000Z');
  assert.ok(entry.checks.every((c) => c.level !== gameHealth.LEVEL.OK));
  assert.deepEqual(entry.technical, report.technical);
});
