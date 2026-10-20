'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rareCutoff } = require('../util/rareCutoff.js');

test('the rare cutoff follows the setting and falls back to 15%', () => {
  assert.equal(rareCutoff(undefined), 15);
  assert.equal(rareCutoff({ achievement: {} }), 15);
  assert.equal(rareCutoff({ achievement: { rareGoldMax: '5', rareSilverMax: '10', rareMax: '25' } }), 25);
  assert.equal(rareCutoff({ achievement: { rareGoldMax: '5', rareSilverMax: '30', rareMax: '25' } }), 15);
});
