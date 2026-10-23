'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { splitPlaytime, joinPlaytime, stepPlaytime, MAX_SECONDS } = require(path.join(__dirname, '../../app/util/playtimeInput.js'));

test('a total opens as days, hours and minutes', () => {
  assert.deepEqual(splitPlaytime(31 * 3600), { days: 1, hours: 7, minutes: 0 });
  assert.deepEqual(splitPlaytime(2 * 86400 + 5 * 3600 + 12 * 60 + 59), { days: 2, hours: 5, minutes: 12 });
  assert.deepEqual(splitPlaytime(0), { days: 0, hours: 0, minutes: 0 });
  assert.deepEqual(splitPlaytime(undefined), { days: 0, hours: 0, minutes: 0 });
});

test('the three fields add up, and a blank one counts as zero', () => {
  assert.equal(joinPlaytime({ days: '1', hours: '7', minutes: '30' }), 86400 + 7 * 3600 + 30 * 60);
  assert.equal(joinPlaytime({ days: '', hours: ' 31 ', minutes: '' }), 31 * 3600);
  assert.equal(joinPlaytime({ minutes: '90' }), 90 * 60);
  assert.equal(joinPlaytime({}), 0);
});

test('a field that is not a whole number is refused', () => {
  for (const bad of ['-3', '1.5', '1,5', 'abc', '1e3', '12h']) {
    assert.equal(joinPlaytime({ hours: bad }), null, bad);
  }
});

test('a total the registry cannot hold is refused', () => {
  assert.equal(joinPlaytime({ days: String(Math.ceil(MAX_SECONDS / 86400) + 1) }), null);
});

test('a total reads back to the same minute', () => {
  for (const seconds of [0, 59, 60, 3600, 45 * 60, 31 * 3600, 3 * 86400 + 12 * 3600 + 30 * 60 + 17]) {
    const parts = splitPlaytime(seconds);
    const fields = Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, String(value)]));
    assert.equal(joinPlaytime(fields), Math.floor(seconds / 60) * 60, String(seconds));
  }
});

test('a step carries into the next unit, as a clock would', () => {
  assert.deepEqual(stepPlaytime({ days: '0', hours: '4', minutes: '59' }, 'minutes', 1), { days: 0, hours: 5, minutes: 0 });
  assert.deepEqual(stepPlaytime({ days: '1', hours: '0', minutes: '0' }, 'hours', -1), { days: 0, hours: 23, minutes: 0 });
  assert.deepEqual(stepPlaytime({ days: '0', hours: '2', minutes: '10' }, 'hours', 1), { days: 0, hours: 3, minutes: 10 });
});

test('a step never goes below zero or past what the registry holds', () => {
  assert.deepEqual(stepPlaytime({ days: '0', hours: '0', minutes: '0' }, 'minutes', -1), { days: 0, hours: 0, minutes: 0 });
  assert.deepEqual(stepPlaytime({ days: '0', hours: '0', minutes: '20' }, 'hours', -1), { days: 0, hours: 0, minutes: 0 });
  const top = splitPlaytime(MAX_SECONDS);
  assert.deepEqual(stepPlaytime(top, 'days', 1), top);
});

test('a step from fields that do not read starts again from zero', () => {
  assert.deepEqual(stepPlaytime({ hours: 'abc' }, 'minutes', 5), { days: 0, hours: 0, minutes: 5 });
});
