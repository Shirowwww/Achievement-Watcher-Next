'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMainWindowState,
  resolveMainWindowState,
  buildMainWindowState,
  mainWindowStateChanged,
} = require('../../app/util/mainWindowState.js');

const manifestWindow = { width: 1300, height: 800, minWidth: 900, minHeight: 600 };
const fullHd = { x: 0, y: 0, width: 1920, height: 1040 };

test('a saved shape is restored as-is when it still fits the display', () => {
  const saved = { bounds: { x: 200, y: 120, width: 1500, height: 900 }, maximized: false };
  assert.deepEqual(resolveMainWindowState(manifestWindow, saved, { workArea: fullHd }), {
    bounds: { x: 200, y: 120, width: 1500, height: 900 },
    maximized: false,
  });
});

test('a window saved on a larger monitor shrinks to the display it now opens on', () => {
  const saved = { bounds: { x: 2600, y: 300, width: 2400, height: 1300 }, maximized: false };
  assert.deepEqual(resolveMainWindowState(manifestWindow, saved, { workArea: fullHd }), {
    bounds: { x: 0, y: 0, width: 1920, height: 1040 },
    maximized: false,
  });
});

test('the manifest minimums win over a smaller saved size', () => {
  const saved = { bounds: { x: 10, y: 10, width: 400, height: 200 } };
  assert.deepEqual(resolveMainWindowState(manifestWindow, saved, { workArea: fullHd }).bounds, {
    x: 10,
    y: 10,
    width: 900,
    height: 600,
  });
});

test('an off-screen position is pulled back so the frameless caption stays clickable', () => {
  const saved = { bounds: { x: 1850, y: 1000, width: 1300, height: 800 } };
  assert.deepEqual(resolveMainWindowState(manifestWindow, saved, { workArea: fullHd }).bounds, {
    x: 620,
    y: 240,
    width: 1300,
    height: 800,
  });
});

test('the maximized flag survives on its own, with no bounds to restore', () => {
  assert.deepEqual(resolveMainWindowState(manifestWindow, { maximized: true }, { workArea: fullHd }), {
    bounds: null,
    maximized: true,
  });
});

test('a size without a complete position is restored centred rather than pinned to a corner', () => {
  const state = normalizeMainWindowState({ bounds: { width: 1400, height: 900, x: 40 } });
  assert.deepEqual(state.bounds, { width: 1400, height: 900 });
  assert.equal(Object.hasOwn(state.bounds, 'x'), false);
});

test('a truncated, empty or hand-broken file falls back to the manifest defaults', () => {
  for (const raw of [null, {}, [], 'nope', { bounds: null }, { bounds: { width: 0, height: 800 } }, { bounds: { width: 'wide', height: 800 } }]) {
    assert.deepEqual(resolveMainWindowState(manifestWindow, raw, { workArea: fullHd }).bounds, null);
  }
});

test('what is written back is the same shape that is read, so a rejected value cannot round-trip', () => {
  assert.deepEqual(buildMainWindowState({ bounds: { x: 5.6, y: 9.2, width: 1300.4, height: 800.5 }, maximized: true }), {
    bounds: { x: 6, y: 9, width: 1300, height: 801 },
    maximized: true,
  });
  assert.deepEqual(buildMainWindowState({ bounds: { width: -10, height: 800 } }), { bounds: null, maximized: false });
  assert.deepEqual(buildMainWindowState(), { bounds: null, maximized: false });
});

test('an unchanged geometry is not written again on every resize event', () => {
  const state = buildMainWindowState({ bounds: { x: 1, y: 2, width: 1300, height: 800 } });
  assert.equal(mainWindowStateChanged(state, buildMainWindowState({ bounds: { x: 1, y: 2, width: 1300, height: 800 } })), false);
  assert.equal(mainWindowStateChanged(state, buildMainWindowState({ bounds: { x: 1, y: 2, width: 1420, height: 800 } })), true);
  assert.equal(mainWindowStateChanged(null, state), true);
});

test('a couple of pixels of DPI rounding is not treated as a resize', () => {
  // setBounds(1002) then getNormalBounds() reports 1004 on a 125% display. Writing that back is what
  // made the window creep wider on every launch.
  const saved = buildMainWindowState({ bounds: { x: 300, y: 120, width: 1002, height: 701 } });
  const measured = buildMainWindowState({ bounds: { x: 300, y: 120, width: 1004, height: 701 } });
  assert.equal(mainWindowStateChanged(saved, measured), false);

  const resized = buildMainWindowState({ bounds: { x: 300, y: 120, width: 1060, height: 701 } });
  assert.equal(mainWindowStateChanged(saved, resized), true);
  const moved = buildMainWindowState({ bounds: { x: 700, y: 120, width: 1002, height: 701 } });
  assert.equal(mainWindowStateChanged(saved, moved), true);
});

test('maximizing is always a change, however close the restore size is', () => {
  const normal = buildMainWindowState({ bounds: { x: 0, y: 0, width: 1300, height: 800 } });
  const maximized = buildMainWindowState({ bounds: { x: 0, y: 0, width: 1300, height: 800 }, maximized: true });
  assert.equal(mainWindowStateChanged(normal, maximized), true);
});
