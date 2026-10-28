'use strict';

/*
  The timeline's window and its snapping, the two sums every drag goes through. The window must
  hold the last entrance with a little room after it, and snapping must pick the nearest edge, or a
  bar dropped next to another lands a few pixels off it.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { spanOf, snapOf } = require(path.join(__dirname, '..', '..', 'app', 'ui', 'presetTimeline.js'));

const row = (delay, dur, enter = 'fade') => ({ delay, dur, enter });

test('the window is never shorter than a second and a half', () => {
  assert.equal(spanOf([]), 1500);
  assert.equal(spanOf([row(0, 400)]), 1500);
});

test('the window holds the last entrance with room after it, on whole half seconds', () => {
  assert.equal(spanOf([row(0, 520), row(1200, 600)]), 2500);
  assert.equal(spanOf([row(1750, 500)]), 2500);
  assert.equal(spanOf([row(2000, 500)]), 3000);
});

test('an element that comes in with the card does not stretch the window', () => {
  assert.equal(spanOf([row(0, 520), row(5000, 5000, 'none')]), 1500);
});

test('a bar edge snaps to the nearest point within reach', () => {
  const snap = snapOf([0, 500, 1000], [480, 980], 30);
  assert.deepEqual(snap, { point: 500, index: 0, gap: 20 });
});

test('the end edge can be the one that snaps', () => {
  const snap = snapOf([0, 1000], [300, 990], 30);
  assert.deepEqual(snap, { point: 1000, index: 1, gap: 10 });
});

test('nothing snaps out of reach', () => {
  assert.equal(snapOf([0, 1000], [400, 700], 30), null);
});
