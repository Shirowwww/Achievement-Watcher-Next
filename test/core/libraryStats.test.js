'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateLibraryStats, calculateDetailedLibraryStats, isInstalled } = require('../../app/util/libraryStats.js');

const games = [
  { appid: 1, installed: true, achievement: { unlocked: 5, total: 10 } },
  { appid: 2, installed: false, achievement: { unlocked: 10, total: 10 } },
  { appid: 3, installed: '1', achievement: { unlocked: 0, total: 0 } },
  { appid: 4, installed: true },
];

test('library statistics include only games with an achievement set by default', () => {
  assert.deepEqual(calculateLibraryStats(games), {
    totalUnlocked: 15,
    completed: 1,
    total: 2,
    average: 75,
  });
});

test('installed-only statistics match the visible installed library', () => {
  assert.deepEqual(calculateLibraryStats(games, { installedOnly: true }), {
    totalUnlocked: 5,
    completed: 0,
    total: 1,
    average: 50,
  });
  assert.equal(isInstalled(games[0]), true);
  assert.equal(isInstalled(games[1]), false);
  assert.equal(isInstalled(games[2]), true);
});

test('achievement-less games never affect completed, unlocked, total or average stats', () => {
  const baseline = calculateLibraryStats(games.slice(0, 2));
  const withAchievementlessGames = calculateLibraryStats([
    ...games.slice(0, 2),
    { appid: 391540, name: 'UNDERTALE', installed: true, achievement: { unlocked: 0, total: 0, list: [] } },
    { appid: 'manual-local', manual: true, installed: true, achievement: { unlocked: 0, total: 0, list: [] } },
  ]);
  assert.deepEqual(withAchievementlessGames, baseline);
});

test('empty and invalid libraries produce a stable zero summary', () => {
  const empty = { totalUnlocked: 0, completed: 0, total: 0, average: 0 };
  assert.deepEqual(calculateLibraryStats([]), empty);
  assert.deepEqual(calculateLibraryStats(null, { installedOnly: true }), empty);
});

const detailedGames = [
  { appid: 1, source: 'Steam', installed: true, playtime: 3600, achievement: { unlocked: 5, total: 10 } },
  { appid: 2, source: 'Steam', installed: false, achievement: { unlocked: 10, total: 10 } },
  { appid: 3, source: 'GOG Galaxy', installed: true, playtime: 1800, achievement: { unlocked: 0, total: 4 } },
  { appid: 4, source: 'Steam', installed: true, achievement: { unlocked: 0, total: 0 } },
  { appid: 5, source: 'Xenia Emulator', installed: true, achievement: { unlocked: 12, total: 12 } },
];

test('the detailed breakdown splits the library into perfect, started and untouched games', () => {
  const stats = calculateDetailedLibraryStats(detailedGames);
  assert.deepEqual(stats.library, { total: 5, tracked: 4, untracked: 1, installed: 4 });
  assert.deepEqual(stats.games, { perfect: 2, inProgress: 1, notStarted: 1 });
  assert.deepEqual(stats.achievements, { unlocked: 27, total: 36, locked: 9 });
  assert.equal(Math.round(stats.completion.overall), 75);
  assert.equal(stats.completion.average, 62);
});

test('overall completion weighs achievements, the header average weighs games', () => {
  // One 1/100 game next to one 1/1 game: half of all games are complete, 2% of all achievements are.
  const stats = calculateDetailedLibraryStats([
    { appid: 1, achievement: { unlocked: 1, total: 100 } },
    { appid: 2, achievement: { unlocked: 1, total: 1 } },
  ]);
  assert.equal(Math.round(stats.completion.overall), 2);
  assert.equal(stats.completion.average, 50);
});

test('the platform breakdown uses the caller classification and is ordered by size', () => {
  const stats = calculateDetailedLibraryStats(detailedGames, {
    groupOf: (game) => ({ key: game.source === 'Xenia Emulator' ? 'xbox' : game.source.toLowerCase(), label: game.source }),
  });
  assert.deepEqual(
    stats.groups.map((group) => [group.key, group.games, group.unlocked, group.total, group.perfect]),
    [
      ['steam', 2, 15, 20, 1],
      ['xbox', 1, 12, 12, 1],
      ['gog galaxy', 1, 0, 4, 0],
    ]
  );
  assert.equal(Math.round(stats.groups[0].completion), 75);
});

test('an untracked game keeps its playtime but never enters an achievement denominator', () => {
  const stats = calculateDetailedLibraryStats(detailedGames);
  assert.deepEqual(stats.playtime, { seconds: 5400, games: 2 });
  assert.equal(stats.library.tracked, 4);
});

test('installed-only narrows every section, not just the counts', () => {
  const stats = calculateDetailedLibraryStats(detailedGames, { installedOnly: true });
  assert.equal(stats.library.total, 4);
  assert.deepEqual(stats.games, { perfect: 1, inProgress: 1, notStarted: 1 });
  assert.deepEqual(stats.achievements, { unlocked: 17, total: 26, locked: 9 });
});

test('an empty library reports zeroes instead of dividing by nothing', () => {
  const stats = calculateDetailedLibraryStats([]);
  assert.equal(stats.completion.overall, 0);
  assert.equal(stats.completion.average, 0);
  assert.deepEqual(stats.groups, []);
});
