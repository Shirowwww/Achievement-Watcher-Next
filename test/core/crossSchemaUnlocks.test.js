'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const bridge = require(path.join(__dirname, '..', '..', 'app', 'util', 'crossSchemaUnlocks.js'));

// The same three achievements, as each store names them.
const STEAM = [
  { name: 'ACH_WELCOME', displayName: 'Welcome to Horizon!' },
  { name: 'ACH_FAME', displayName: 'Fame Stamp' },
  { name: 'ACH_START', displayName: 'Off to a Good Start' },
];
const XBOX = [
  { name: '1', displayName: 'Welcome to Horizon!' },
  { name: '2', displayName: 'Fame Stamp' },
  { name: '3', displayName: 'off to a good start' }, // same title, different casing
];

test('unlocks move onto the schema of the game they are merged into', () => {
  const moved = bridge.remapUnlocksOntoSchema(
    { 1: { Achieved: true, UnlockTime: 1700000000 }, 3: { Achieved: true, UnlockTime: 0 } },
    XBOX,
    STEAM
  );
  assert.deepEqual(Object.keys(moved).sort(), ['ACH_START', 'ACH_WELCOME']);
  assert.equal(moved.ACH_WELCOME.Achieved, true);
  assert.equal(moved.ACH_WELCOME.UnlockTime, 1700000000);
  assert.equal(moved.ACH_WELCOME.name, 'ACH_WELCOME', 'the entry carries the name it was matched to');
});

test('with no schema to translate onto, the keys are left as they are', () => {
  const kept = bridge.remapUnlocksOntoSchema({ 1: { Achieved: true } }, XBOX, []);
  assert.deepEqual(Object.keys(kept), ['1']);
});

test('an unlock with no counterpart is left behind rather than attached to the wrong achievement', () => {
  const moved = bridge.remapUnlocksOntoSchema({ 2: { Achieved: true } }, XBOX, [
    { name: 'ACH_OTHER', displayName: 'Something else entirely' },
  ]);
  assert.deepEqual(moved, {});
});

test('a title shared by two achievements identifies neither', () => {
  // Guessing here would credit the wrong achievement, which is worse than crediting none.
  const ambiguous = [
    { name: 'a', displayName: 'Level cleared' },
    { name: 'b', displayName: 'Level cleared' },
  ];
  assert.deepEqual(bridge.indexByTitle(ambiguous).size, 0);
  assert.deepEqual(bridge.remapUnlocksOntoSchema({ 1: { Achieved: true } }, XBOX, ambiguous), {});
});
