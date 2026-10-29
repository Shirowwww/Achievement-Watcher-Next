'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const collections = require(path.join(appDir, 'util', 'collections.js'));
const { createCollectionStore } = require(path.join(appDir, 'util', 'collectionStore.js'));
const { applyToList, HIDDEN_CLASS } = require(path.join(appDir, 'util', 'collectionFilter.js'));

const ID = '11111111-2222-3333-4444-555555555555';
const library = [
  { appid: '1', installed: true },
  { appid: '2', installed: false },
  { appid: '3', installed: true },
];

function tile(appid) {
  const classes = new Set();
  const box = { getAttribute: (name) => (name === 'data-appid' ? String(appid) : null) };
  return {
    tagName: 'LI',
    querySelector: (selector) => (selector === '.game-box' ? box : null),
    classList: { toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) },
  };
}

// The blacklist drops a game from the scan; this is the other kind of hiding, asked for by a user
// who keeps the blacklist for tools: the game stays tracked, only out of sight.
test('a hidden game leaves All games and every collection, and only the Hidden view lists it', () => {
  let state = collections.createCollection(collections.emptyState(), { id: ID, name: 'Mine' }).state;
  state = collections.addGames(state, ID, ['1', '2']);
  state = collections.hideGames(state, '2');

  assert.deepEqual(collections.filterGames(library, state, '').map((g) => g.appid), ['1', '3']);
  assert.deepEqual(collections.filterGames(library, state, ID).map((g) => g.appid), ['1']);
  assert.deepEqual(collections.filterGames(library, state, collections.HIDDEN_ID).map((g) => g.appid), ['2']);
  assert.equal(collections.countGames(library, state, ID), 1);
  assert.equal(collections.countGames(library, state, collections.HIDDEN_ID), 1);
  assert.equal(collections.countGames(library, state, collections.HIDDEN_ID, { installedOnly: true }), 0);
});

test('showing a game again puts it back where it was', () => {
  let state = collections.createCollection(collections.emptyState(), { id: ID, name: 'Mine' }).state;
  state = collections.addGames(state, ID, ['2']);
  state = collections.unhideGames(collections.hideGames(state, '2'), '2');

  assert.equal(collections.isHidden(state, '2'), false);
  assert.deepEqual(collections.filterGames(library, state, ID).map((g) => g.appid), ['2']);
});

test('hidden keys are validated like collection members and survive the store', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hidden-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = collections.normalizeState({ collections: [], hidden: ['5', '5', '<script>', null, 'gog-9'] });
  assert.deepEqual(state.hidden, ['5', 'gog-9']);

  const store = createCollectionStore(dir);
  store.hideGames('7');
  assert.equal(collections.isHidden(createCollectionStore(dir).read(), '7'), true);
  store.unhideGames('7');
  assert.deepEqual(createCollectionStore(dir).read().hidden, []);
});

test('tiles of hidden games are hidden outside the Hidden view', () => {
  const list = { children: [tile(1), tile(2), tile(3)] };
  applyToList(list, null, new Set(['2']));
  assert.deepEqual(
    list.children.map((li) => li.classList.contains(HIDDEN_CLASS)),
    [false, true, false]
  );
  applyToList(list, new Set(['2']), null);
  assert.deepEqual(
    list.children.map((li) => li.classList.contains(HIDDEN_CLASS)),
    [true, false, true]
  );
});
