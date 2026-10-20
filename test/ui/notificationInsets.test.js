'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { paintedInsets, mergeInsets, edgeShift, snapToDevicePixel } = require('../../app/util/notificationInsets.js');

// A BGRA bitmap with one opaque rectangle and an optional faint halo around it.
function bitmap(width, height, rect, halo = 0) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const near = x >= rect.x - halo && x < rect.x + rect.w + halo && y >= rect.y - halo && y < rect.y + rect.h + halo;
      buf[(y * width + x) * 4 + 3] = inside ? 255 : near ? 40 : 0;
    }
  }
  return buf;
}

test('the painted box ignores a faint shadow and reports the transparent room on each side', () => {
  const buf = bitmap(100, 50, { x: 10, y: 5, w: 70, h: 30 }, 4);

  assert.deepEqual(paintedInsets(buf, 100, 50), { left: 10, top: 5, right: 20, bottom: 15 });
});

test('a preset painted only in translucent pixels still yields its box', () => {
  const buf = bitmap(40, 20, { x: 0, y: 0, w: 0, h: 0 }, 0);
  for (let y = 2; y < 18; y++) for (let x = 3; x < 30; x++) buf[(y * 40 + x) * 4 + 3] = 60;

  assert.deepEqual(paintedInsets(buf, 40, 20), { left: 3, top: 2, right: 10, bottom: 2 });
});

test('an empty capture has no painted box', () => {
  assert.equal(paintedInsets(Buffer.alloc(10 * 10 * 4), 10, 10), null);
});

test('merging keeps the smallest room per side, so no sample can be pushed off screen', () => {
  const merged = mergeInsets([
    { left: 180, top: 60, right: 0, bottom: 1 },
    null,
    { left: 40, top: 62, right: 2, bottom: 0 },
  ]);

  assert.deepEqual(merged, { left: 40, top: 60, right: 0, bottom: 0 });
  assert.equal(mergeInsets([null, null]), null);
});

test('an edge anchor moves the window past that edge by its transparent room, scaled', () => {
  const room = { left: 10, top: 6, right: 20, bottom: 15 };

  assert.deepEqual(edgeShift('bottom-right', room, 1), { dx: 20, dy: 15 });
  assert.deepEqual(edgeShift('top-left', room, 1.5), { dx: -15, dy: -9 });
  assert.deepEqual(edgeShift('middle-right', room, 1), { dx: 20, dy: 0 });
  assert.deepEqual(edgeShift('center-top', room, 1), { dx: 0, dy: -6 });
  assert.deepEqual(edgeShift('center-bottom', room, 0.75), { dx: 0, dy: 11 });
  assert.deepEqual(edgeShift('bottom-left', room, 1), { dx: -10, dy: 15 });
});

test('a window coordinate is snapped to the nearest whole physical pixel', () => {
  assert.equal(snapToDevicePixel(1349, 1.25), 1348);
  assert.equal(snapToDevicePixel(1351, 1.25), 1352);
  assert.equal(snapToDevicePixel(-21, 1.25), -20);
  assert.equal(snapToDevicePixel(981, 1.5), 982);
  assert.equal(snapToDevicePixel(1349, 1), 1349);
  assert.equal(snapToDevicePixel(1349, 2), 1349);
});

test('a custom anchor and an unmeasured preset are never moved', () => {
  assert.deepEqual(edgeShift('custom', { left: 10, top: 10, right: 10, bottom: 10 }, 1), { dx: 0, dy: 0 });
  assert.deepEqual(edgeShift('bottom-right', null, 1), { dx: 0, dy: 0 });
});
