'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { playThroughApp } = require('../util/soundPlayer.js');

function run(options) {
  return new Promise((resolve) => playThroughApp('C:\\sounds\\unlock.mp3', 0.4, resolve, options));
}

test('on Windows the app is asked to play the sound, no process is started', async () => {
  const sent = [];
  const err = await run({ send: (msg) => sent.push(msg), connected: true });
  assert.equal(err, undefined);
  assert.deepEqual(sent, [{ playSound: { file: 'C:\\sounds\\unlock.mp3', volume: 0.4 } }]);
});

test('without the app the sound is reported as not played', async () => {
  assert.match(String(await run({ send: undefined, connected: false })), /no app to play the sound/);
  assert.match(String(await run({ send: () => {}, connected: false })), /no app to play the sound/);
});

test('a channel that breaks while sending is reported', async () => {
  const err = await run({
    send: () => {
      throw new Error('channel closed');
    },
    connected: true,
  });
  assert.match(String(err), /channel closed/);
});
