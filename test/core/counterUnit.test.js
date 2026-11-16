'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { isPercentCounter, counterLabel } = require(path.join(__dirname, '..', '..', 'app', 'util', 'counterUnit.js'));

// #168: Stupid Never Dies declares every counter 0 to 100 and counts in percent.
test('a 0-100 counter whose text names another quantity is a percentage', () => {
  assert.equal(isPercentCounter(100, 'Use a total of 10000 E of OT Energy at the Boost Pit.'), true);
  assert.equal(isPercentCounter(100, 'Increase Zombie Skill rarity levels 10 times at Bessie Burger.'), true);
  assert.equal(isPercentCounter(100, 'Select a Receipt of Legendary rarity.'), true);
  assert.equal(isPercentCounter(100, 'Reach 100% completion.'), true);
});

test('a counter whose text states the 100, or whose goal is not 100, is a count', () => {
  assert.equal(isPercentCounter(100, 'Open 100 treasure chests.'), false);
  assert.equal(isPercentCounter('100', 'Ouvrir 100 coffres.'), false);
  assert.equal(isPercentCounter(100, '打开100个宝箱'), false);
  assert.equal(isPercentCounter(300, 'Chomp 300 cores.'), false);
  assert.equal(isPercentCounter(10, 'Win 10 games.'), false);
  assert.equal(isPercentCounter(100, 'Use a total of 1,000 E.'), true);
});

test('the label is "37%" for a percentage and "37 / 100" for a count', () => {
  assert.equal(counterLabel(37, 100, 'Chomp 300 cores.'), '37%');
  assert.equal(counterLabel(37.6, 100, 'Chomp 300 cores.'), '37%');
  assert.equal(counterLabel(37, 100, 'Open 100 chests.'), '37 / 100');
  assert.equal(counterLabel(3, 10, 'x', { formatNumber: (n) => `<${n}>`, separator: '/' }), '<3>/<10>');
  assert.equal(counterLabel(37, 100, '', { formatPercent: (n) => `${n} %` }), '37 %');
});
