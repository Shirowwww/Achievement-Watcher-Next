'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { splitPlaytime, joinPlaytime, stepPlaytime, playtimeFields, playtimeToSave, MAX_SECONDS } = require(path.join(__dirname, '../../app/util/playtimeInput.js'));

const HOURS_ONLY = playtimeFields('hours');
const TO_THE_SECOND = playtimeFields('seconds');

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

test('each Library tiles > Playtime choice opens its own fields', () => {
  assert.deepEqual([...playtimeFields('auto')], ['days', 'hours', 'minutes']);
  assert.deepEqual([...HOURS_ONLY], ['hours', 'minutes']);
  assert.deepEqual([...TO_THE_SECOND], ['hours', 'minutes', 'seconds']);
  assert.deepEqual([...playtimeFields('something else')], ['days', 'hours', 'minutes']);
});

test('hours only keeps every hour in one field', () => {
  assert.deepEqual(splitPlaytime(2 * 86400 + 5 * 3600 + 12 * 60 + 59, HOURS_ONLY), { hours: 53, minutes: 12 });
  assert.deepEqual(stepPlaytime({ hours: '23', minutes: '59' }, 'minutes', 1, HOURS_ONLY), { hours: 24, minutes: 0 });
});

test('the seconds fields read back to the second and step without rounding', () => {
  const seconds = 2 * 86400 + 5 * 3600 + 12 * 60 + 59;
  assert.deepEqual(splitPlaytime(seconds, TO_THE_SECOND), { hours: 53, minutes: 12, seconds: 59 });
  assert.equal(joinPlaytime({ hours: '53', minutes: '12', seconds: '59' }), seconds);
  assert.deepEqual(stepPlaytime({ hours: '0', minutes: '4', seconds: '59' }, 'seconds', 1, TO_THE_SECOND), { hours: 0, minutes: 5, seconds: 0 });
  assert.deepEqual(stepPlaytime({ hours: '1', minutes: '0', seconds: '30' }, 'hours', 1, TO_THE_SECOND), { hours: 2, minutes: 0, seconds: 30 });
});

test('confirming untouched fields keeps the seconds they do not show', () => {
  const stored = 4 * 3600 + 40 * 60 + 37;
  assert.equal(playtimeToSave(stored, { days: '0', hours: '4', minutes: '40' }, playtimeFields('auto')), stored);
  assert.equal(playtimeToSave(stored, { hours: '4', minutes: '40' }, HOURS_ONLY), stored);
  assert.equal(playtimeToSave(stored, { days: '0', hours: '5', minutes: '40' }, playtimeFields('auto')), 5 * 3600 + 40 * 60);
  assert.equal(playtimeToSave(stored, { days: '0', hours: '0', minutes: '0' }, playtimeFields('auto')), 0);
  assert.equal(playtimeToSave(stored, { hours: 'abc' }, HOURS_ONLY), null);
});

test('fields at zero store zero, even over a total that opened as zero', () => {
  assert.equal(playtimeToSave(37, { days: '0', hours: '0', minutes: '0' }, playtimeFields('auto')), 0);
  assert.equal(playtimeToSave(37, { hours: '0', minutes: '0', seconds: '37' }, TO_THE_SECOND), 37);
});
