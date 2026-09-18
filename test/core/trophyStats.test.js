'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateTrophyStats, listUnlockedByRarity, startedGames } = require('../../app/util/trophyStats.js');
const { calculateLibraryStats, calculateDetailedLibraryStats } = require('../../app/util/libraryStats.js');

const ach = (name, achieved, extra = {}) => ({ name, Achieved: achieved ? 1 : 0, UnlockTime: achieved ? 1700000000 : 0, ...extra });

const games = [
  {
    appid: 1,
    name: 'Complete',
    installed: true,
    achievement: { unlocked: 3, total: 3, list: [ach('a', true), ach('b', true, { UnlockTime: 1800000000 }), ach('c', true)] },
  },
  { appid: 2, name: 'Started', installed: false, achievement: { unlocked: 1, total: 4, list: [ach('x', true), ach('y', false)] } },
  { appid: 3, name: 'Launched only', installed: true, achievement: { unlocked: 0, total: 5, list: [ach('z', false)] } },
  { appid: 4, name: 'Never launched', installed: true, achievement: { unlocked: 0, total: 5, list: [ach('w', false)] } },
  { appid: 5, name: 'No schema', installed: true, achievement: { unlocked: 0, total: 0, list: [] } },
];

const launched = (game) => game.appid === 3;
const rates = new Map([
  [1, new Map([['a', 1.2], ['b', 7.5], ['c', 50]])],
  [2, new Map()],
]);
const rarityOf = (game) => rates.get(game.appid) || null;

test('only games that were launched or have an unlock count', () => {
  assert.deepEqual(
    startedGames(games, { isStarted: launched }).map((game) => game.appid),
    [1, 2, 3]
  );
});

test('unlocks are graded gold to 5%, silver to 10%, bronze to 15%, common above or unknown', () => {
  const stats = calculateTrophyStats(games, { isStarted: launched, rarityOf });
  assert.equal(stats.games, 3);
  assert.equal(stats.platinum, 1);
  assert.equal(stats.gold, 1); // 1.2%
  assert.equal(stats.silver, 1); // 7.5%
  assert.equal(stats.bronze, 0);
  assert.equal(stats.common, 2); // 50% and the unknown one
  const edge = calculateTrophyStats(
    [{ appid: 9, achievement: { unlocked: 4, total: 4, list: [ach('g', true), ach('s', true), ach('b', true), ach('c', true)] } }],
    { rarityOf: () => new Map([['g', 5], ['s', 10], ['b', 12], ['c', 80]]) }
  );
  assert.deepEqual([edge.gold, edge.silver, edge.bronze, edge.common], [1, 1, 1, 1]);
  assert.equal(stats.unranked, 1);
  assert.deepEqual(stats.rarest.map((entry) => entry.achievement.name), ['a', 'b', 'c']);
  assert.equal(stats.platinumGames[0].completedAt, 1800000000);
});

test('native PlayStation grades win over the global rate', () => {
  const stats = calculateTrophyStats(
    [{ appid: 'NPWR1', achievement: { unlocked: 2, total: 3, list: [ach('p', true, { type: 'P' }), ach('s', true, { type: 'S' }), ach('g', false, { type: 'G' })] } }],
    { rarityOf: () => new Map([['s', 1]]) }
  );
  assert.deepEqual([stats.gold, stats.silver, stats.bronze, stats.common], [1, 1, 0, 0]);
});

test('the installed-only filter applies to trophies too', () => {
  const stats = calculateTrophyStats(games, { installedOnly: true, isStarted: launched, rarityOf });
  assert.equal(stats.games, 2);
  assert.equal(stats.platinum, 1);
  assert.equal(stats.gold + stats.silver + stats.bronze + stats.common, 3);
});

test('the average completion leaves never-launched games out', () => {
  // 100% + 25% + 0% (launched) over three games; the never-launched 0% is not counted.
  assert.equal(calculateLibraryStats(games, { isStarted: launched }).average, 41);
  assert.equal(calculateLibraryStats(games, { isStarted: launched }).started, 3);
  const detailed = calculateDetailedLibraryStats(games, { isStarted: launched });
  assert.equal(detailed.completion.average, 41);
  assert.equal(detailed.completion.started, 3);
  assert.equal(detailed.library.tracked, 4);
});

test('an empty library has no trophies', () => {
  const stats = calculateTrophyStats(null);
  assert.deepEqual(
    [stats.games, stats.platinum, stats.gold, stats.silver, stats.bronze, stats.common, stats.rarest.length],
    [0, 0, 0, 0, 0, 0, 0]
  );
});

test('the rarest list keeps the ten rarest unlocks, rarest first', () => {
  const list = Array.from({ length: 25 }, (_, i) => ach('r' + i, true));
  const rates = new Map(list.map((a, i) => [a.name, 25 - i]));
  const stats = calculateTrophyStats([{ appid: 1, achievement: { unlocked: 25, total: 25, list } }], { rarityOf: () => rates });
  assert.equal(stats.rarest.length, 10);
  assert.deepEqual(stats.rarest.map((entry) => entry.percent), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('the full list is every unlock of the started games, rarest first, unknown rates last', () => {
  const list = listUnlockedByRarity(games, { isStarted: launched, rarityOf });
  assert.deepEqual(
    list.map((entry) => entry.achievement.name),
    ['a', 'b', 'c', 'x']
  );
  assert.deepEqual(list.map((entry) => entry.tier), ['gold', 'silver', 'common', 'common']);
});
