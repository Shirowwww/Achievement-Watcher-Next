'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const watcher = require('../console/remedyEpicWatch.js');

test('Remedy live watcher seeds the first observation without fresh unlocks', () => {
  const result = watcher._internal.diffUnlocked(null, {
    11: { Achieved: true, UnlockTime: 0 },
  });
  assert.equal(result.firstObservation, true);
  assert.deepEqual(result.fresh, []);
  assert.deepEqual(result.unlocked, ['11']);
});

test('Remedy live watcher reports only IDs absent from the prior baseline', () => {
  const result = watcher._internal.diffUnlocked(
    { unlocked: ['3', '11'] },
    {
      3: { Achieved: true, UnlockTime: 0 },
      11: { Achieved: true, UnlockTime: 0 },
      66: { Achieved: true, UnlockTime: 0 },
    }
  );
  assert.equal(result.firstObservation, false);
  assert.deepEqual(result.unlocked, ['3', '11', '66']);
  assert.deepEqual(result.fresh, ['66']);
});
