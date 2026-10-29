'use strict';

/*
  A game's own "unlock everything" achievement, read from real Steam lists (fixtures/platinumLike.json,
  taken from the public schema with each achievement's global unlock rate). The positives are the ones
  a player knows as the game's platinum; the negatives are the wordings that look like it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const games = require('./fixtures/platinumLike.json');
const userData = require('../util/userData.js');
const { platinumLikeName, looksLikePlatinum, platinumLikeForGame } = require('../util/platinumLike.js');

const listOf = (appid) => games[appid].achievements;

test('finds the achievement that stands for unlocking every other one', () => {
  const expected = {
    1245620: 'ELDEN RING',
    1145350: 'Hades II',
    1113000: 'Persona 4 Golden',
    1088850: 'Guardians of the Galaxy',
    570940: 'DARK SOULS: REMASTERED',
  };
  for (const appid of Object.keys(expected)) {
    const name = platinumLikeName(listOf(appid));
    const found = listOf(appid).find((achievement) => achievement.name === name);
    assert.ok(found, `${expected[appid]}: nothing found`);
    assert.ok(looksLikePlatinum(found.description), `${expected[appid]}: picked "${found.displayName}"`);
  }
});

test('in-game trophies, weapon sets and collections are not the platinum', () => {
  for (const appid of ['892970', '779340', '240', '2379780', '265930']) {
    assert.equal(platinumLikeName(listOf(appid)), null, games[appid].game);
  }
});

test('a common achievement that mentions the others is not it either', () => {
  // The Stanley Parable's "Get your first achievement" is earned by 93.6% of players.
  assert.equal(platinumLikeName(listOf('1703340')), null);
});

test('without unlock rates only a single clear candidate counts', () => {
  const bare = (list) => list.map(({ rarityPercent: _rate, ...rest }) => rest);
  assert.equal(platinumLikeName(bare(listOf('1245620'))), 'ACH00');
  const two = [
    { name: 'A', description: 'Obtain all achievements' },
    { name: 'B', description: 'Unlock all base game achievements' },
  ];
  assert.equal(platinumLikeName(two), null);
});

test('a game in another language is read through its cached English list', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-platinum-like-'));
  const previous = process.env.AW_USER_DATA;
  process.env.AW_USER_DATA = root;
  userData.resetCache();
  t.after(() => {
    if (previous === undefined) delete process.env.AW_USER_DATA;
    else process.env.AW_USER_DATA = previous;
    userData.resetCache();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const english = listOf('1245620');
  fs.mkdirSync(path.join(root, 'steam_cache', 'schema', 'english'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steam_cache', 'schema', 'english', '1245620.db'), JSON.stringify({ achievement: { list: english } }));
  // The French list carries no rate and words nothing the English rule reads.
  const french = english.map(({ name }) => ({ name, description: 'Texte en français' }));
  assert.equal(platinumLikeForGame({ appid: '1245620', achievement: { list: french } }, 'french'), 'ACH00');
  // Without the English copy, the rates the notifier loaded let the list's own text decide.
  const rates = new Map(english.map((achievement) => [achievement.name, achievement.rarityPercent]));
  const bare = english.map(({ rarityPercent: _rate, ...rest }) => rest);
  assert.equal(platinumLikeForGame({ appid: '999', achievement: { list: bare } }, 'english', rates), 'ACH00');
});

test('an empty, missing or malformed list finds nothing', () => {
  for (const list of [undefined, null, [], [null], [{}], 'x']) assert.equal(platinumLikeName(list), null);
});
