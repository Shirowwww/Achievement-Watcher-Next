'use strict';

// The one reading of a save that the library and the Watchdog share (app/parser/saveState.js).

const test = require('node:test');
const assert = require('node:assert/strict');

const { saveState, entryState } = require('../../app/parser/saveState.js');

const DISTANCE = [{ name: 'ACH_LUGGER', progress: { min_val: 0, max_val: 80, value: { operation: 'statvalue', operand1: 'STAT_DIST' } } }];

function stateOf(items, name) {
  const item = items.find((entry) => entry.name === name);
  return item && item.state;
}

test('a float counter saved past its goal is unlocked (#225: 80.43 km of 80)', () => {
  const root = { ACH_LUGGER: { Achieved: '0', CurProgress: '80.43', MaxProgress: '80', UnlockTime: '0' } };
  assert.equal(stateOf(saveState(root), 'ACH_LUGGER').Achieved, true);
});

test('a stat at its goal unlocks the achievement the save still lists as locked (#225)', () => {
  const root = { ACH_LUGGER: { Achieved: '0', CurProgress: '80.43', MaxProgress: '80', UnlockTime: '0' }, stat_dist: 80.43 };
  Object.defineProperty(root, '__rawStatKeys', { value: ['stat_dist'], enumerable: false, configurable: true });
  const items = saveState(root, { schema: DISTANCE });
  assert.equal(stateOf(items, 'ACH_LUGGER').Achieved, true);
  assert.equal(items.some((item) => item.key === 'stat_dist'), false, 'the raw stat leaves the list');
});

test('a stat below its goal gives progress and leaves the achievement locked', () => {
  const root = { ACH_LUGGER: { Achieved: '0', CurProgress: '0', MaxProgress: '0', UnlockTime: '0' }, stat_dist: 42 };
  Object.defineProperty(root, '__rawStatKeys', { value: ['stat_dist'], enumerable: false, configurable: true });
  const state = stateOf(saveState(root, { schema: DISTANCE }), 'ACH_LUGGER');
  assert.equal(state.Achieved, false);
  assert.equal(state.CurProgress, 42);
  assert.equal(state.MaxProgress, 80);
});

test('the save entry is found whatever the case of its name, never doubled', () => {
  const root = { ach_lugger: { Achieved: '0', CurProgress: '0', MaxProgress: '0', UnlockTime: '0' }, STAT_DIST: 80 };
  const items = saveState(root, { schema: DISTANCE });
  assert.deepEqual(
    items.map((item) => item.key),
    ['ach_lugger']
  );
  assert.equal(items[0].state.Achieved, true);
});

test('dates come out in epoch seconds, whatever unit the save wrote', () => {
  assert.equal(entryState('A', { Achieved: '1', UnlockTime: 1712253396000 }).state.UnlockTime, 1712253396);
  assert.equal(entryState('A', { Achieved: '1', UnlockTime: '1712253396' }).state.UnlockTime, 1712253396);
  assert.equal(entryState('A', { achieved: true, unlock_time: '2024-04-04T18:36:36Z' }).state.UnlockTime, 1712255796);
  assert.equal(entryState('A', { Achieved: '1', UnlockTime: '1712253396.5' }).state.UnlockTime, 1712253396);
  assert.equal(entryState('A', { Achieved: '1', UnlockTime: 1712253396000 }).rawUnlockTime, 1712253396000, 'the raw stamp stays for the log');
});

test('a legacy GOG or Epic save lists only unlocks: an entry with no flag is one there', () => {
  assert.equal(entryState('A', { UnlockTime: 0 }, 'gog').state.Achieved, true);
  assert.equal(entryState('A', { UnlockTime: 0 }, 'steam').state.Achieved, false);
});

test('a GBE raw stat keeps its count as progress when no schema maps it', () => {
  const items = saveState({ real_stat_hash: { value: 3 } });
  assert.equal(items[0].state.CurProgress, 3);
});
