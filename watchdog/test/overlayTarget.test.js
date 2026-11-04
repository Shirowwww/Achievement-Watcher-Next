'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createOverlayTarget, LIVE_UNLOCK_WINDOW_MS } = require('../util/overlayTarget.js');

const T0 = 1_000_000;

test('a process-tracked game wins over a recent emulator unlock', () => {
  const target = createOverlayTarget();
  target.noteLiveUnlock({ appid: 'NPWR02249_00' }, T0);
  assert.equal(target.appidFor('1133320', T0 + 1000), '1133320');
});

test('with no tracked game, the overlay follows the game that just unlocked something', () => {
  const target = createOverlayTarget();
  target.noteLiveUnlock({ appid: 'NPWR02249_00' }, T0);
  assert.equal(target.appidFor(null, T0 + 1000), 'NPWR02249_00');
});

test('the latest unlock wins when two emulator games unlocked', () => {
  const target = createOverlayTarget();
  target.noteLiveUnlock({ appid: 'NPWR00160_00' }, T0);
  target.noteLiveUnlock({ appid: 'NPWR02249_00' }, T0 + 10);
  assert.equal(target.appidFor(undefined, T0 + 20), 'NPWR02249_00');
});

test('an old unlock no longer steers the overlay, so the app falls back as before', () => {
  const target = createOverlayTarget();
  target.noteLiveUnlock({ appid: 'NPWR02249_00' }, T0);
  assert.equal(target.appidFor(null, T0 + LIVE_UNLOCK_WINDOW_MS + 1), '0');
});

test('nothing unlocked and nothing running asks the app for its fallback', () => {
  assert.equal(createOverlayTarget().appidFor(null, T0), '0');
});

test('playtime notices and payloads without an appid are not unlocks', () => {
  const target = createOverlayTarget();
  target.noteLiveUnlock({ appid: '4705510', notificationType: 'playtime' }, T0);
  target.noteLiveUnlock({ appid: '' }, T0);
  target.noteLiveUnlock(null, T0);
  assert.equal(target.appidFor(null, T0 + 1), '0');
});

test('wrapping a notify records the unlock and passes the call through untouched', async () => {
  const target = createOverlayTarget();
  const calls = [];
  const notify = target.wrapNotify(async (payload, opts) => {
    calls.push([payload, opts]);
    return 'sent';
  }, () => T0);
  const payload = { appid: 'NPWR02249_00', achievementDisplayName: 'Pop! Pop! BOOM!' };
  const opts = { notify: true };

  assert.equal(await notify(payload, opts), 'sent');
  assert.deepEqual(calls, [[payload, opts]]);
  assert.equal(target.appidFor(null, T0 + 1), 'NPWR02249_00');
});
