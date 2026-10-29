'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const libraryReuse = require('../../app/util/libraryReuse.js');

const NOW = 1_700_000_000_000;
const VERSION = '3.10.3';

function entry(overrides = {}) {
  return {
    games: [{ appid: '480', name: 'Game', img: {}, achievement: { list: [] } }],
    fingerprint: { dirs: [['C:/games', 1]], files: [] },
    appVersion: VERSION,
    discoveredAppids: ['480'],
    savedAt: NOW - 60_000,
    ...overrides,
  };
}

function reason(storedEntry, options = {}, context = {}) {
  return libraryReuse.refuseReason(storedEntry, options, {
    now: NOW,
    appVersion: VERSION,
    inputsUnchanged: () => true,
    ...context,
  });
}

test('an untouched library from this version is reused', async () => {
  assert.equal(await reason(entry()), '');
});

test('a library is never reused when the disk it was read from moved', async () => {
  assert.equal(await reason(entry(), {}, { inputsUnchanged: () => false }), 'a game folder or unlock file changed');
});

// The window asks the scan host, which answers over IPC: the answer has to be waited for, not read
// as a promise - a pending promise is truthy, and would have reused a library that had moved.
test('a sweep that answers asynchronously is waited for', async () => {
  assert.equal(await reason(entry(), {}, { inputsUnchanged: async () => false }), 'a game folder or unlock file changed');
  assert.equal(await reason(entry(), {}, { inputsUnchanged: async () => true }), '');
});

test('the user asking for a recheck always gets a real scan', async () => {
  assert.equal(await reason(entry(), { forceAchievementRecheck: true }), 'a recheck was requested');
  assert.equal(await reason(entry(), { preserveExistingOnFailure: true }), 'the caches were just cleared');
});

test('a library stored by another version is rebuilt, not trusted', async () => {
  assert.equal(await reason(entry({ appVersion: '3.10.2' })), 'stored by version 3.10.2');
  assert.equal(await reason(entry({ appVersion: '' })), 'stored by version unknown');
});

test('reuse expires, so sources with no file behind them cannot go stale forever', async () => {
  const justInside = entry({ savedAt: NOW - (libraryReuse.REUSE_TTL_MS - 1000) });
  assert.equal(await reason(justInside), '');

  const justOutside = entry({ savedAt: NOW - (libraryReuse.REUSE_TTL_MS + 1000) });
  assert.match(await reason(justOutside), /^the last scan is 6\.0h old$/);
});

test('a clock that moved backwards refuses the reuse instead of extending it', async () => {
  assert.equal(await reason(entry({ savedAt: NOW + 60_000 })), 'the stored library is dated in the future');
});

test('a scan that left an undescribed game must run again so it retries', async () => {
  const undescribed = entry();
  undescribed.games = [...undescribed.games, { appid: '20', provisional: true }];
  assert.equal(await reason(undescribed), 'the last scan left entries undescribed');
});

test('a fresh confirmed-miss provisional game still blocks reuse, so it gets a prompt retry', async () => {
  const stillFresh = entry();
  stillFresh.games = [
    ...stillFresh.games,
    { appid: '20', provisional: true, provisionalDefinitive: true, provisionalAt: NOW - (libraryReuse.PROVISIONAL_GRACE_MS - 1000) },
  ];
  assert.equal(await reason(stillFresh), 'the last scan left entries undescribed');
});

test('a confirmed-miss provisional game past the grace period no longer blocks reuse of the rest', async () => {
  const settled = entry();
  settled.games = [
    ...settled.games,
    { appid: '20', provisional: true, provisionalDefinitive: true, provisionalAt: NOW - (libraryReuse.PROVISIONAL_GRACE_MS + 1000) },
  ];
  assert.equal(await reason(settled), '');
});

test('a library with nothing to prove it is current is rebuilt', async () => {
  assert.equal(await reason(null), 'nothing stored yet');
  assert.equal(await reason(entry({ games: [] })), 'nothing stored yet');
  assert.equal(await reason(entry({ fingerprint: null })), 'stored without a fingerprint');
  assert.equal(await reason(entry(), {}, { appVersion: '' }), 'the running version could not be read');
});

test('the filesystem sweep runs last, after every cheaper reason to refuse', async () => {
  let swept = 0;
  const context = {
    inputsUnchanged: () => {
      swept += 1;
      return true;
    },
  };
  await reason(entry({ appVersion: '3.10.2' }), {}, context);
  await reason(entry(), { forceAchievementRecheck: true }, context);
  await reason(null, {}, context);
  assert.equal(swept, 0);

  await reason(entry(), {}, context);
  assert.equal(swept, 1);
});
