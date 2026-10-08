'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const { applyToList, applyToTile, HIDDEN_CLASS } = require(path.join(appDir, 'util', 'collectionFilter.js'));
const collections = require(path.join(appDir, 'util', 'collections.js'));

// The few DOM members the filter touches, so this runs without a browser.
function tile(appid) {
  const classes = new Set();
  const box = { getAttribute: (name) => (name === 'data-appid' ? String(appid) : null) };
  return {
    tagName: 'LI',
    querySelector: (selector) => (selector === '.game-box' ? box : null),
    classList: { toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) },
  };
}

test('only the members stay visible and the shown count is returned', () => {
  const list = { children: [tile(10), tile('gog-10'), tile(11)] };
  const shown = applyToList(list, new Set(['10', '11']));
  assert.equal(shown, 2);
  assert.deepEqual(
    list.children.map((li) => li.classList.contains(HIDDEN_CLASS)),
    [false, true, false]
  );
});

test('no active collection shows everything again', () => {
  const list = { children: [tile(1), tile(2)] };
  applyToList(list, new Set(['1']));
  assert.equal(applyToList(list, null), 2);
  assert.equal(list.children.some((li) => li.classList.contains(HIDDEN_CLASS)), false);
});

test('a tile that streams in later follows the same rule', () => {
  const members = new Set(['5']);
  assert.equal(applyToTile(tile(5), members), true);
  const late = tile(6);
  assert.equal(applyToTile(late, members), false);
  assert.equal(late.classList.contains(HIDDEN_CLASS), true);
});

test('the stats scope counts only the collection, and everything when none is active', () => {
  const { calculateLibraryStats } = require(path.join(appDir, 'util', 'libraryStats.js'));
  const game = (appid, unlocked, total) => ({ appid, achievement: { unlocked, total } });
  const library = [game(1, 5, 10), game(2, 10, 10), game(3, 0, 10)];
  let state = collections.createCollection(collections.emptyState(), { id: '11111111-2222-3333-4444-555555555555', name: 'Done' }).state;
  state = collections.addGames(state, '11111111-2222-3333-4444-555555555555', ['2', 'not-installed-any-more']);

  const scoped = calculateLibraryStats(collections.filterGames(library, state, '11111111-2222-3333-4444-555555555555'), { isStarted: () => true });
  assert.deepEqual([scoped.total, scoped.completed, scoped.totalUnlocked], [1, 1, 10]);
  const all = calculateLibraryStats(collections.filterGames(library, state, ''), { isStarted: () => true });
  assert.deepEqual([all.total, all.completed, all.totalUnlocked], [3, 1, 15]);
});
