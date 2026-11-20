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

/*
  #212: a broken save held a stamp past milliseconds, and the library tile threw "Invalid time
  value" building its date. Micro and nanoseconds come back to seconds, so every caller gets a date.
*/
test('micro and nanosecond stamps come back to seconds, so a Date can always hold them', () => {
  for (const value of [1700000000000000, 1700000000000000000, '1700000000000000', 2e18]) {
    const seconds = parseUnlockTimeSeconds(value);
    assert.ok(seconds > 0 && seconds < 10_000_000_000, `${value} read as ${seconds}`);
    assert.doesNotThrow(() => new Date(seconds * 1000).toISOString());
  }
  assert.strictEqual(parseUnlockTimeSeconds(1700000000000000), 1700000000);
  assert.strictEqual(parseUnlockTimeSeconds(1700000000000000000), 1700000000);
});

// A FILETIME or .NET tick count would divide into a wrong but believable year: no date beats a false one.
test('a stamp in no unit we read answers no date rather than a wrong year', () => {
  for (const value of [133450000000000000, 638350000000000000, 9e16, 1e20]) {
    assert.strictEqual(parseUnlockTimeSeconds(value), 0, `${value} must read as no date`);
  }
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
