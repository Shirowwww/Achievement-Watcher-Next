'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { parsePlaytime, formatPlaytimeInput, MAX_SECONDS } = require(path.join(__dirname, '../../app/util/playtimeInput.js'));

test('a plain number is read as hours, with either decimal separator', () => {
  assert.equal(parsePlaytime('12'), 12 * 3600);
  assert.equal(parsePlaytime('12.5'), 12.5 * 3600);
  assert.equal(parsePlaytime('12,5'), 12.5 * 3600);
  assert.equal(parsePlaytime('3h'), 3 * 3600);
  assert.equal(parsePlaytime('0'), 0);
});

test('hours and minutes are read in the usual spellings', () => {
  assert.equal(parsePlaytime('12:30'), 12 * 3600 + 30 * 60);
  assert.equal(parsePlaytime('12h30'), 12 * 3600 + 30 * 60);
  assert.equal(parsePlaytime('12h 30m'), 12 * 3600 + 30 * 60);
  assert.equal(parsePlaytime(' 1 H 05 min '), 3600 + 5 * 60);
  assert.equal(parsePlaytime('90m'), 90 * 60);
  assert.equal(parsePlaytime('45min'), 45 * 60);
});

test('anything that is not a duration is refused', () => {
  for (const text of ['', 'abc', '-3', '12:75', '1e3', '12h30h', null, undefined]) {
    assert.equal(parsePlaytime(text), null, String(text));
  }
});

test('a total the registry cannot hold is refused', () => {
  assert.equal(parsePlaytime(String(Math.ceil(MAX_SECONDS / 3600) + 1)), null);
});

test('the starting value reads back to the same minute', () => {
  for (const seconds of [0, 59, 60, 3600, 45 * 60, 12 * 3600 + 30 * 60 + 17]) {
    const shown = formatPlaytimeInput(seconds);
    assert.equal(parsePlaytime(shown), Math.floor(seconds / 60) * 60, shown);
  }
  assert.equal(formatPlaytimeInput(12 * 3600 + 5 * 60), '12h05');
  assert.equal(formatPlaytimeInput(5 * 3600), '5h');
});
