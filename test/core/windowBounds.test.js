'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clampWindowBoundsToWorkArea, fitWindowBoundsToWorkArea } = require('../../app/util/windowBounds.js');

test('brings an overlay saved beyond the right edge of a 200% display back onto it', () => {
  // A player's real case: the overlay reopened at x=2090 on a 1920-wide display (3840x2160 at 200%),
  // visible and topmost for Windows, seen by nobody.
  assert.deepEqual(
    fitWindowBoundsToWorkArea({ x: 2090, y: 25, width: 451, height: 802 }, { x: 0, y: 0, width: 1920, height: 1032 }),
    { x: 1469, y: 25, width: 451, height: 802 }
  );
});

test('shrinks a saved overlay taller than the work area so all of it shows', () => {
  assert.deepEqual(
    fitWindowBoundsToWorkArea({ x: 40, y: 30, width: 450, height: 1400 }, { x: 0, y: 0, width: 1280, height: 752 }),
    { x: 40, y: 0, width: 450, height: 752 }
  );
});

test('leaves an overlay that already fits where the player put it', () => {
  const bounds = { x: 1450, y: 20, width: 450, height: 800 };
  assert.deepEqual(fitWindowBoundsToWorkArea(bounds, { x: 0, y: 0, width: 1920, height: 1032 }), bounds);
});

test('keeps fully visible window bounds unchanged', () => {
  const bounds = { x: 120, y: 64, width: 1200, height: 800 };
  assert.deepEqual(clampWindowBoundsToWorkArea(bounds, { x: 0, y: 0, width: 1536, height: 864 }), bounds);
});

test('brings a high-DPI window whose title-bar controls are off-screen back into the work area', () => {
  assert.deepEqual(
    clampWindowBoundsToWorkArea(
      { x: 366, y: 151, width: 1316, height: 809 },
      { x: 0, y: 0, width: 1536, height: 864 }
    ),
    { x: 220, y: 55, width: 1316, height: 809 }
  );
});

test('supports displays with negative coordinates and windows larger than the work area', () => {
  assert.deepEqual(
    clampWindowBoundsToWorkArea(
      { x: -1800, y: 700, width: 2200, height: 1100 },
      { x: -1920, y: 0, width: 1920, height: 1040 }
    ),
    { x: -1920, y: 0, width: 2200, height: 1100 }
  );
});

test('leaves malformed geometry untouched rather than guessing a position', () => {
  const bounds = { x: 10, y: 20, width: 1200, height: 800 };
  assert.equal(clampWindowBoundsToWorkArea(bounds, { x: 0, y: 0, width: 'wide', height: 900 }), bounds);
});
