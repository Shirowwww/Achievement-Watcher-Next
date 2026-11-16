'use strict';

/*
  The base-game platinum (darts0007's idea): the platinum waits for the base game only, DLC sets and
  extra trophy groups aside, as on PlayStation. The notifier, the page marks and the trophy stats
  share platinumFilter; "DLC included" keeps the whole list.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { platinumFilter, normalizeScope, DEFAULT_SCOPE } = require('../../app/util/platinumScope.js');
const { platinumEarnedAt } = require('../../app/util/trophyStats.js');

// Spider-Man Remastered's shape: base trophies, then DLC groups the platinum does not wait for.
const list = [
  { name: 'BASE_1', Achieved: 1, UnlockTime: 10 },
  { name: 'BASE_2', Achieved: 1, UnlockTime: 20 },
  { name: 'DLC_1', category: 'The Heist', Achieved: 0 },
  { name: 'DLC_2', category: 'Turf Wars', Achieved: 0 },
];

test('by default the platinum waits for the base game only', () => {
  assert.equal(DEFAULT_SCOPE, 'base');
  const inScope = platinumFilter(list);
  assert.deepEqual(list.filter(inScope).map((a) => a.name), ['BASE_1', 'BASE_2']);
  // The trophy stats read it the same way: the platinum is earned with the last base-game unlock.
  assert.equal(platinumEarnedAt({ achievement: { list, total: 4, unlocked: 2 } }), 20);
});

test('"DLC included" and lists without a base game keep the whole list', () => {
  assert.equal(platinumFilter(list, { scope: 'all' }), null);
  assert.equal(platinumFilter([{ name: 'A' }, { name: 'B' }]), null, 'no DLC: nothing to set aside');
  assert.equal(platinumFilter([{ name: 'A', category: 'X' }, { name: 'B', category: 'Y' }]), null, 'only sets');
  assert.equal(platinumFilter(null), null);
  assert.equal(platinumEarnedAt({ achievement: { list, total: 4, unlocked: 2 } }, null, () => ''), null, 'whole list: not yet');
});

test('a PSN trophy group counts like a Steam set, and an unknown scope is the default', () => {
  const groups = { DLC_A: 'Episode 1' };
  const inScope = platinumFilter([{ name: 'A' }, { name: 'DLC_A' }], { categoryOf: (a) => groups[a.name] || '' });
  assert.equal(inScope({ name: 'A' }), true);
  assert.equal(inScope({ name: 'DLC_A' }), false);
  assert.equal(normalizeScope('weird'), 'base');
  assert.equal(normalizeScope('all'), 'all');
});

test('removed achievements never make a list look split', () => {
  assert.equal(platinumFilter([{ name: 'A' }, { name: 'OLD', category: 'X', removed: true }]), null);
});
