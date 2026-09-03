'use strict';

/*
  Settings draws its overlay preview in the app's own main process, so pressing Test in any mode but
  "Windows notification" never entered the Watchdog at all - and the OBS browser source, which
  renders whatever the notification feed carries, stayed empty for exactly the button a user presses
  to find out whether it works. `broadcast-test` is the missing half: the same sample payload, put
  on the feed and nowhere else.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// Before anything reads it: the Watchdog resolves its config from this, and a test must not load,
// let alone rewrite, the real profile's options.ini.
process.env.AW_USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-broadcast-'));
fs.mkdirSync(path.join(process.env.AW_USER_DATA, 'cfg'), { recursive: true });

const websocket = require('../websocket.js');
const notificationTest = require('../notification-test.js');

function captureBroadcast(run) {
  const original = websocket.broadcast;
  const seen = [];
  websocket.broadcast = (message) => seen.push(message);
  return Promise.resolve()
    .then(run)
    .finally(() => {
      websocket.broadcast = original;
    })
    .then(() => seen);
}

test('a preview that the app renders itself still reaches the notification feed', async () => {
  const seen = await captureBroadcast(() => notificationTest.broadcastOnly('rare'));

  assert.equal(seen.length, 1, 'one press is one event on the feed, never two');
  const [message] = seen;
  assert.ok(message.game, 'a client paints the game name');
  assert.ok(message.displayName, 'and what was unlocked');
  assert.ok(message.icon, 'and its artwork');
  assert.equal(message.test, true, 'a client written against the feed can tell a rehearsal apart');
  assert.ok(Number.isFinite(Number(message.rarityPercent)), 'the rare sample carries a rate, or no preset can paint the tier');
});

test('each kind of test puts its own kind on the feed', async () => {
  for (const [kind, expected] of [
    ['toast', 'achievement'],
    ['progress', 'progress'],
    ['playtime', 'playtime'],
    ['platinum', 'platinum'],
  ]) {
    const [message] = await captureBroadcast(() => notificationTest.broadcastOnly(kind));
    assert.equal(message.notificationType, expected, `${kind} must announce itself as ${expected}`);
  }

  // Playtime is the one that must never make a sound, on any transport.
  const [playtime] = await captureBroadcast(() => notificationTest.broadcastOnly('playtime'));
  assert.equal(playtime.silent, true);
});

test('a test fired from one game carries that game, not the sample', async () => {
  const game = { appid: 480, name: 'Spacewar', icon: 'https://example.invalid/spacewar.jpg' };
  const [message] = await captureBroadcast(() => notificationTest.broadcastOnly('toast', { game }));
  assert.equal(message.appID, 480);
  assert.equal(message.game, 'Spacewar');
});

test('the websocket answers the command the app sends, and refuses an unknown kind gracefully', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'websocket.js'), 'utf8');
  assert.match(source, /req\.cmd === 'broadcast-test'/, 'the command the renderer sends must be handled');
  assert.match(source, /\['toast', 'rare', 'progress', 'playtime', 'platinum'\]\.includes\(req\.kind\)/, 'an unknown kind falls back rather than throwing');
  assert.equal(typeof notificationTest.broadcastOnly, 'function');
});
