'use strict';

/*
  The timeline's window and its snapping, the two sums every drag goes through. The window must
  hold the last entrance with a little room after it, and snapping must pick the nearest edge, or a
  bar dropped next to another lands a few pixels off it.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { spanOf, snapOf, totalOf, pageOffset } = require(path.join(__dirname, '..', '..', 'app', 'ui', 'presetTimeline.js'));

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

test('the timeline runs to the end of the card, exit included, and never stops short of its window', () => {
  // A 6s card: its exit ends at 6s, past the entrances' window.
  assert.equal(totalOf(2500, 6000), 6000);
  // A card shorter than its entrances still shows them all.
  assert.equal(totalOf(2500, 1200), 2500);
  // An unknown length leaves the window as it is; an odd one lands on the next tenth of a second.
  assert.equal(totalOf(1500, 0), 1500);
  assert.equal(totalOf(1500, 4321), 4400);
});

test('the window follows the playhead a page at a time, on whole ticks, inside the timeline', () => {
  // In view: it stays.
  assert.equal(pageOffset(800, 0, 2500, 6000), 0);
  // Past the right edge: the playhead comes back to a quarter of the window.
  assert.equal(pageOffset(2600, 0, 2500, 6000), 1975 - (1975 % 100));
  // Never past the end.
  assert.equal(pageOffset(5900, 2500, 2500, 6000), 3500);
  // Before the left edge (a replay from 0): back to the start.
  assert.equal(pageOffset(0, 3500, 2500, 6000), 0);
  // A timeline that fits its window never scrolls.
  assert.equal(pageOffset(1400, 0, 2500, 2500), 0);
});
