'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { gameDisplayCenter } = require(path.join(__dirname, '..', 'util', 'gameDisplay.js'));

// A scripted user32: two displays, the game window on a portrait one left of the primary.
function fakeUser32({ displays = 2, window = 1, monitor = { left: -1080, top: 0, right: 0, bottom: 1920 }, infoOk = true, dpiContexts = true } = {}) {
  const contexts = [];
  return {
    contexts,
    infoSize: 40,
    GetSystemMetrics: () => displays,
    GetForegroundWindow: () => window,
    MonitorFromWindow: () => 7,
    GetMonitorInfoW: (_monitor, info) => {
      Object.assign(info.rcMonitor, monitor);
      return infoOk ? 1 : 0;
    },
    SetThreadDpiAwarenessContext: (context) => {
      contexts.push(context);
      if (!dpiContexts) return 0;
      return contexts.length === 1 ? 17 : -4;
    },
  };
}

test('the game display is given by its centre in physical pixels, with DPI awareness restored', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, () => {
  const native = fakeUser32();
  assert.deepEqual(gameDisplayCenter(native), { x: -540, y: 960 });
  assert.deepEqual(native.contexts, [-4, 17], 'per-monitor aware for the read, then back to what the thread had');
});

test('nothing is named with a single display, or when the display cannot be read', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, () => {
  assert.equal(gameDisplayCenter(fakeUser32({ displays: 1 })), null);
  assert.equal(gameDisplayCenter(fakeUser32({ window: null })), null);
  assert.equal(gameDisplayCenter(fakeUser32({ infoOk: false })), null);
  assert.equal(gameDisplayCenter(null), null);
});

test('a Windows that refuses per-monitor awareness names no display rather than a scaled point', { skip: process.platform !== 'win32' ? 'Windows-only' : false }, () => {
  const native = fakeUser32({ dpiContexts: false });
  assert.equal(gameDisplayCenter(native), null);
  assert.deepEqual(native.contexts, [-4], 'nothing to restore');
});

test('off Windows nothing is read', { skip: process.platform === 'win32' ? 'non-Windows only' : false }, () => {
  assert.equal(gameDisplayCenter(fakeUser32()), null);
});
