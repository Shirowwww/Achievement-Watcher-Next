'use strict';

const assert = require('assert');
const test = require('node:test');
const { parseUnlockTimeSeconds } = require('../../app/util/unlockTime.js');

test('epoch seconds are kept as they are', () => {
  assert.strictEqual(parseUnlockTimeSeconds(1700000000), 1700000000);
  assert.strictEqual(parseUnlockTimeSeconds('1700000000'), 1700000000);
});

test('milliseconds are converted, seconds are not', () => {
  assert.strictEqual(parseUnlockTimeSeconds(1700000000000), 1700000000);
  assert.strictEqual(parseUnlockTimeSeconds('1700000000000'), 1700000000);
});

// This is the shape Xbox answers with; reading it as a number left every Xbox unlock undated.
test('an ISO 8601 date is read', () => {
  assert.strictEqual(parseUnlockTimeSeconds('2023-11-14T22:13:20.0000000Z'), 1700000000);
  assert.strictEqual(parseUnlockTimeSeconds('2023-11-14T22:13:20Z'), 1700000000);
});

test('an absent, empty or zero date answers zero', () => {
  for (const value of [null, undefined, '', '   ', 0, '0', -5, 'not a date', {}, NaN]) {
    assert.strictEqual(parseUnlockTimeSeconds(value), 0, `${String(value)} must read as no date`);
  }
});

// EA writes this for an achievement it has no date for.
test('a year-zero placeholder date answers zero', () => {
  assert.strictEqual(parseUnlockTimeSeconds('0000-00-00T00:00:00'), 0);
});
