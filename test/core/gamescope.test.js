'use strict';

// In Steam's Game Mode AW's popups carry GAMESCOPE_EXTERNAL_OVERLAY so gamescope draws them above the game.

const assert = require('node:assert/strict');
const test = require('node:test');

const { createGamescope, windowId } = require('../../app/util/gamescope.js');

const ATOMS = { GAMESCOPE_FOCUSABLE_APPS: 301, GAMESCOPE_EXTERNAL_OVERLAY: 302 };

// A fake libX11 that records every property it is asked to set.
function fakeX({ gamescope = true, display = 0xd15 } = {}) {
  const calls = { open: [], props: [], flushes: 0 };
  const x = {
    openDisplay: (name) => {
      calls.open.push(name);
      return display;
    },
    internAtom: (_display, name, onlyIfExists) => (onlyIfExists && !gamescope ? 0 : ATOMS[name]),
    changeProperty: (...args) => calls.props.push(args),
    flush: () => calls.flushes++,
  };
  return { calls, load: () => x };
}

function fakeWindow(handle, { destroyed = false } = {}) {
  return { getNativeWindowHandle: () => handle, isDestroyed: () => destroyed };
}

const xid = (value) => {
  const handle = Buffer.alloc(8);
  handle.writeBigUInt64LE(BigInt(value));
  return handle;
};

test('a window is marked as gamescope external overlay with the cardinal 1', () => {
  const { calls, load } = fakeX();
  const host = createGamescope({ platform: 'linux', env: { DISPLAY: ':0' }, load });
  assert.equal(host.isActive(), true);
  assert.equal(host.showAboveGame(fakeWindow(xid(0x4a0000b))), true);
  assert.deepEqual(calls.props, [[0xd15, 0x4a0000b, 302, 6, 32, 0, [1], 1]]);
  assert.equal(calls.flushes, 1);
});

test('one X connection serves every window', () => {
  const { calls, load } = fakeX();
  const host = createGamescope({ platform: 'linux', env: { DISPLAY: ':1' }, load });
  host.showAboveGame(fakeWindow(xid(1)));
  host.showAboveGame(fakeWindow(xid(2)));
  assert.deepEqual(calls.open, [':1']);
});

test('nothing is marked on another X server, off Linux, or without a display', () => {
  const plain = fakeX({ gamescope: false });
  const desktop = createGamescope({ platform: 'linux', env: { DISPLAY: ':0' }, load: plain.load });
  assert.equal(desktop.isActive(), false);
  assert.equal(desktop.showAboveGame(fakeWindow(xid(1))), false);
  assert.equal(plain.calls.props.length, 0);

  const never = () => assert.fail('libX11 must not be loaded');
  assert.equal(createGamescope({ platform: 'win32', env: { DISPLAY: ':0' }, load: never }).isActive(), false);
  assert.equal(createGamescope({ platform: 'linux', env: {}, load: never }).isActive(), false);
});

test('a display that cannot be opened or a missing libX11 leaves AW as it is', () => {
  const closed = fakeX({ display: null });
  assert.equal(createGamescope({ platform: 'linux', env: { DISPLAY: ':0' }, load: closed.load }).isActive(), false);
  const lines = [];
  const missing = createGamescope({
    platform: 'linux',
    env: { DISPLAY: ':0' },
    load: () => {
      throw new Error('libX11.so.6: cannot open shared object file');
    },
    log: (line) => lines.push(line),
  });
  assert.equal(missing.isActive(), false);
  assert.match(lines[0], /libX11/);
});

test('a destroyed window or one without a handle is skipped', () => {
  const { calls, load } = fakeX();
  const host = createGamescope({ platform: 'linux', env: { DISPLAY: ':0' }, load });
  assert.equal(host.showAboveGame(fakeWindow(xid(1), { destroyed: true })), false);
  assert.equal(host.showAboveGame(fakeWindow(Buffer.alloc(0))), false);
  assert.equal(calls.props.length, 0);
});

test('the window id is read from a 4- or 8-byte native handle', () => {
  const four = Buffer.alloc(4);
  four.writeUInt32LE(0x3c00007);
  assert.equal(windowId(four), 0x3c00007);
  assert.equal(windowId(xid(0x3c00007)), 0x3c00007);
  assert.equal(windowId(null), 0);
});
