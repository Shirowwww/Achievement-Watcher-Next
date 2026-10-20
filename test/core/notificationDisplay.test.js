'use strict';

/*
  With several displays the popup goes to the game's: the Watchdog names that display by its centre,
  and a custom position keeps its place relative to the screen when the game is on another one.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const { parsePoint, moveAnchor } = require('../../app/util/notificationDisplay.js');

const PRIMARY = { x: 0, y: 0, width: 2560, height: 1440 };
const PORTRAIT = { x: 2560, y: -184, width: 1080, height: 1920 };

test('the game display arrives as "x,y", negative coordinates included', () => {
  assert.deepEqual(parsePoint('1280,720'), { x: 1280, y: 720 });
  assert.deepEqual(parsePoint('-540,960'), { x: -540, y: 960 });
  for (const bad of ['', null, undefined, '12', '1,2,3', 'a,b', '1.5,2']) assert.equal(parsePoint(bad), null, String(bad));
});

test('a custom position keeps its place relative to the screen on the game display', () => {
  assert.deepEqual(moveAnchor({ x: 2560, y: 1440, extra: true }, PRIMARY, PORTRAIT), { x: 3640, y: 1736, extra: true });
  assert.deepEqual(moveAnchor({ x: 2560, y: -184 }, PORTRAIT, PRIMARY), { x: 0, y: 0 });
  assert.equal(moveAnchor(null, PRIMARY, PORTRAIT), null);
});
