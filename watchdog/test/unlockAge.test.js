'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { freshUnlockTime, FUTURE_TOLERANCE_S } = require('../util/unlockAge.js');

const READ_AT = 1_762_900_000;

test('an unlock stamped before the read keeps its own time', () => {
  assert.equal(freshUnlockTime(READ_AT - 4, READ_AT), READ_AT - 4);
  assert.equal(freshUnlockTime(READ_AT, READ_AT), READ_AT);
});

test('an unlock stamped a few minutes ahead of this clock counts as unlocked at the read (Discord report)', () => {
  // A Goldberg save of LEGO Marvel Super Heroes stamped unlocks 1 to 4 minutes ahead: each was
  // dropped as Outatime, with no popup, and the library listed it "in 3 minutes".
  assert.equal(freshUnlockTime(READ_AT + 1, READ_AT), READ_AT);
  assert.equal(freshUnlockTime(READ_AT + 180, READ_AT), READ_AT);
  assert.equal(freshUnlockTime(READ_AT + FUTURE_TOLERANCE_S, READ_AT), READ_AT);
});

test('a stamp far in the future is still not a fresh unlock', () => {
  assert.equal(freshUnlockTime(READ_AT + FUTURE_TOLERANCE_S + 1, READ_AT), READ_AT + FUTURE_TOLERANCE_S + 1);
  assert.equal(freshUnlockTime(READ_AT + 365 * 86400, READ_AT), READ_AT + 365 * 86400);
});
