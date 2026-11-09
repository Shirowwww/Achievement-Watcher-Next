'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { derivedPlatinumRate } = require('../../app/util/platinumRate.js');

const rates = (entries) => new Map(entries);

test('the platinum sits 0.1 to 0.3 points under the rarest trophy', () => {
  const list = rates([['a', 40], ['b', 12.5], ['c', 7.4]]);
  for (const seed of ['1', '2', '3', '761600', '2515020']) {
    const rate = derivedPlatinumRate(list, { seed });
    const gap = Math.round((7.4 - rate) * 100) / 100;
    assert.ok([0.1, 0.2, 0.3].includes(gap), `seed ${seed}: ${rate}`);
  }
});

test('a game gets the same platinum rate on every view', () => {
  const list = rates([['a', 9.9], ['b', 3.3]]);
  assert.equal(derivedPlatinumRate(list, { seed: 761600 }), derivedPlatinumRate(list, { seed: '761600' }));
});

test('DLC trophies are left out of the rarest', () => {
  const list = rates([['base', 20], ['dlc', 1]]);
  const rate = derivedPlatinumRate(list, { isDlc: (name) => name === 'dlc', seed: 'x' });
  assert.ok(rate > 19 && rate < 20, String(rate));
});

test('a very rare trophy is halved rather than taken to zero or below', () => {
  assert.equal(derivedPlatinumRate(rates([['a', 0.2]]), { seed: '\u0002' }), 0.1);
  assert.equal(derivedPlatinumRate(rates([['a', 0.1]]), { seed: '' }), 0.05);
  assert.equal(derivedPlatinumRate(rates([['a', 0]])), 0);
  // 0.3 - 0.2 is 0.0999... in floating point: still exactly the 0.1 floor, not a halving.
  assert.equal(derivedPlatinumRate(rates([['a', 0.3]]), { seed: '1' }), 0.1);
});

test('no base-game rate gives no platinum rate', () => {
  assert.equal(derivedPlatinumRate(rates([])), null);
  assert.equal(derivedPlatinumRate(rates([['a', null], ['b', 'n/a'], ['c', undefined]])), null);
  assert.equal(derivedPlatinumRate(rates([['dlc', 5]]), { isDlc: () => true }), null);
  assert.equal(derivedPlatinumRate(null), null);
});

test('numeric strings count as rates', () => {
  assert.equal(derivedPlatinumRate(rates([['a', '5']]), { seed: '' }), 4.9);
});
