'use strict';

// A Linux tray icon is only drawn when a StatusNotifier host owns its watcher name on the bus.

const assert = require('node:assert/strict');
const test = require('node:test');

const { hasStatusNotifierHost, waitForStatusNotifierHost, WATCHER } = require('../../app/util/linuxTrayHost.js');

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
