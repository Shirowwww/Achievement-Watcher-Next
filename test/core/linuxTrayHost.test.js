'use strict';

// A Linux tray icon is only drawn when a StatusNotifier host owns its watcher name on the bus.

const assert = require('node:assert/strict');
const test = require('node:test');

const { hasStatusNotifierHost, waitForStatusNotifierHost, minimizeOrHide, WATCHER } = require('../../app/util/linuxTrayHost.js');

const answering = (stdout, error = null) => (command, args, options, done) => {
  assert.equal(command, 'dbus-send');
  assert.ok(args.includes(`string:${WATCHER}`));
  done(error, stdout);
};

test('the host is present only when the bus says the watcher name has an owner', async () => {
  assert.equal(await hasStatusNotifierHost({ run: answering('method return time=1 sender=org.freedesktop.DBus\n   boolean true\n') }), true);
  assert.equal(await hasStatusNotifierHost({ run: answering('   boolean false\n') }), false);
  assert.equal(await hasStatusNotifierHost({ run: answering('', new Error('no session bus')) }), false);
});

test('waiting for a host stops as soon as one appears, or gives up after the timeout', async () => {
  const answers = [false, false, true];
  const naps = [];
  const appeared = await waitForStatusNotifierHost({ timeoutMs: 10000, intervalMs: 1000, check: async () => answers.shift(), sleep: async (ms) => naps.push(ms) });
  assert.equal(appeared, true);
  assert.deepEqual(naps, [1000, 1000]);

  const never = await waitForStatusNotifierHost({ timeoutMs: 3000, intervalMs: 1000, check: async () => false, sleep: async () => {} });
  assert.equal(never, false);
});

function fakeWindow({ honoursMinimize, destroyed = false }) {
  const calls = [];
  const listeners = new Map();
  let minimized = false;
  return {
    calls,
    once: (event, handler) => listeners.set(event, handler),
    removeListener: (event) => listeners.delete(event),
    minimize: () => {
      calls.push('minimize');
      minimized = honoursMinimize;
      if (honoursMinimize && listeners.has('minimize')) listeners.get('minimize')();
    },
    restore: () => {
      minimized = false;
    },
    hide: () => calls.push('hide'),
    isMinimized: () => minimized,
    isVisible: () => !minimized,
    isDestroyed: () => destroyed,
  };
}

test('a window the user restores from the dock while AW checks is not hidden behind their back', async () => {
  const win = fakeWindow({ honoursMinimize: true });
  assert.equal(await minimizeOrHide(win, { wait: async () => win.restore() }), 'minimized');
  assert.deepEqual(win.calls, ['minimize']);
});

test('without a tray the closed window is minimized where the desktop has a minimized state', async () => {
  const win = fakeWindow({ honoursMinimize: true });
  assert.equal(await minimizeOrHide(win, { wait: async () => {} }), 'minimized');
  assert.deepEqual(win.calls, ['minimize']);
});

test('a compositor that ignores minimize (Hyprland) gets the window hidden, not a dead close button', async () => {
  const win = fakeWindow({ honoursMinimize: false });
  const waits = [];
  assert.equal(await minimizeOrHide(win, { checkAfterMs: 800, wait: async (ms) => waits.push(ms) }), 'hidden');
  assert.deepEqual(win.calls, ['minimize', 'hide']);
  assert.deepEqual(waits, [800]);
});

test('a window destroyed while waiting is left alone', async () => {
  const win = fakeWindow({ honoursMinimize: false, destroyed: true });
  assert.equal(await minimizeOrHide(win, { wait: async () => {} }), 'gone');
  assert.deepEqual(win.calls, ['minimize']);
});
