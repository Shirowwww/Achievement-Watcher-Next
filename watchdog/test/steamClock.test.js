'use strict';

/*
  Issue #155: a PC running 59 s ahead of Steam aged every Steam client unlock past the 10 s
  threshold, so none of them notified. The Watchdog now reads those unlocks on Steam's clock.
*/
const assert = require('assert');
const path = require('path');
const test = require('node:test');

const { createSteamClock } = require(path.join(__dirname, '..', 'util', 'steamClock.js'));

const STEAM_NOW = 1_000_000;

function fakeSteam({ serverTime = STEAM_NOW, error = null } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (error) throw error;
    return { ok: true, status: 200, json: async () => ({ servertime: serverTime }) };
  };
  return { fetchImpl, calls };
}

test("a PC 59 s fast reads Steam's unlocks about 58 s earlier, never later than they happened", async () => {
  const steam = fakeSteam();
  const clock = createSteamClock({ fetchImpl: steam.fetchImpl, now: () => (STEAM_NOW + 59) * 1000 });

  assert.equal(await clock.offsetSeconds(), -58);
  assert.equal(steam.calls.length, 1);
});

test('one measure serves every read for an hour, then Steam is asked again', async () => {
  let pcMs = STEAM_NOW * 1000;
  const steam = fakeSteam();
  const clock = createSteamClock({ fetchImpl: steam.fetchImpl, now: () => pcMs });

  await Promise.all([clock.offsetSeconds(), clock.offsetSeconds(), clock.offsetSeconds()]);
  pcMs += 59 * 60 * 1000;
  await clock.offsetSeconds();
  assert.equal(steam.calls.length, 1);
  pcMs += 2 * 60 * 1000;
  await clock.offsetSeconds();
  assert.equal(steam.calls.length, 2);
});

test('an unreachable Steam leaves the PC clock as it is, and is asked again a few minutes later', async () => {
  let pcMs = STEAM_NOW * 1000;
  const steam = fakeSteam({ error: new Error('offline') });
  const clock = createSteamClock({ fetchImpl: steam.fetchImpl, now: () => pcMs });

  assert.equal(await clock.offsetSeconds(), 0);
  assert.equal(await clock.offsetSeconds(), 0);
  assert.equal(steam.calls.length, 1);
  pcMs += 6 * 60 * 1000;
  await clock.offsetSeconds();
  assert.equal(steam.calls.length, 2);
});

test('an answer without a server time changes nothing', async () => {
  const steam = fakeSteam({ serverTime: 'soon' });
  const clock = createSteamClock({ fetchImpl: steam.fetchImpl, now: () => STEAM_NOW * 1000 });

  assert.equal(await clock.offsetSeconds(), 0);
});
