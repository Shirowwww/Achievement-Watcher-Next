'use strict';

/*
  Steam knows the playtime clocked on other machines, AW knows what it measured here, including
  outside Steam. Neither value is authoritative over the other: the rule is to keep the larger of
  each, and to write only when it advances.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeSteamPlaytime } = require('../../app/parser/playtime.js');

test('an empty local counter takes the Steam value', () => {
  const merged = mergeSteamPlaytime({ playtime: 0, lastplayed: 0 }, { seconds: 7200, lastPlayed: 1700000000 });
  assert.deepEqual(merged, { total: 7200, last: 1700000000 });
});

test('a larger local counter is never lowered by Steam', () => {
  // AW measured runs outside Steam: deferring to Steam would erase that time.
  const merged = mergeSteamPlaytime({ playtime: 9000, lastplayed: 1700000500 }, { seconds: 7200, lastPlayed: 1700000000 });
  assert.equal(merged, null);
});

test('each field is decided on its own', () => {
  // Played elsewhere a long time ago, but launched here more recently: the total comes from Steam,
  // the last-played time stays local.
  const merged = mergeSteamPlaytime({ playtime: 100, lastplayed: 1700000500 }, { seconds: 7200, lastPlayed: 1700000000 });
  assert.deepEqual(merged, { total: 7200, last: 1700000500 });
});

test('identical values cause no write', () => {
  assert.equal(mergeSteamPlaytime({ playtime: 7200, lastplayed: 1700000000 }, { seconds: 7200, lastPlayed: 1700000000 }), null);
});

test('a missing or empty Steam entry changes nothing', () => {
  assert.equal(mergeSteamPlaytime({ playtime: 100, lastplayed: 5 }, null), null);
  assert.equal(mergeSteamPlaytime({ playtime: 100, lastplayed: 5 }, { seconds: 0, lastPlayed: 0 }), null);
});

test('an unreadable local record counts as a zero counter', () => {
  const merged = mergeSteamPlaytime(null, { seconds: 60, lastPlayed: 1700000000 });
  assert.deepEqual(merged, { total: 60, last: 1700000000 });
});
