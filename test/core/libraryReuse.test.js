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

test('an untouched library from this version is reused', () => {
  assert.equal(reason(entry()), '');
});

test('a library is never reused when the disk it was read from moved', () => {
  assert.equal(reason(entry(), {}, { inputsUnchanged: () => false }), 'a game folder or unlock file changed');
});

test('the user asking for a recheck always gets a real scan', () => {
  assert.equal(reason(entry(), { forceAchievementRecheck: true }), 'a recheck was requested');
  assert.equal(reason(entry(), { preserveExistingOnFailure: true }), 'the caches were just cleared');
});

test('a library stored by another version is rebuilt, not trusted', () => {
  assert.equal(reason(entry({ appVersion: '3.10.2' })), 'stored by version 3.10.2');
  assert.equal(reason(entry({ appVersion: '' })), 'stored by version unknown');
});

test('reuse expires, so sources with no file behind them cannot go stale forever', () => {
  const justInside = entry({ savedAt: NOW - (libraryReuse.REUSE_TTL_MS - 1000) });
  assert.equal(reason(justInside), '');

  const justOutside = entry({ savedAt: NOW - (libraryReuse.REUSE_TTL_MS + 1000) });
  assert.match(reason(justOutside), /^the last scan is 6\.0h old$/);
});

test('a clock that moved backwards refuses the reuse instead of extending it', () => {
  assert.equal(reason(entry({ savedAt: NOW + 60_000 })), 'the stored library is dated in the future');
});

test('a scan that left an undescribed game must run again so it retries', () => {
  const undescribed = entry();
  undescribed.games = [...undescribed.games, { appid: '20', provisional: true }];
  assert.equal(reason(undescribed), 'the last scan left entries undescribed');
});

test('a library with nothing to prove it is current is rebuilt', () => {
  assert.equal(reason(null), 'nothing stored yet');
  assert.equal(reason(entry({ games: [] })), 'nothing stored yet');
  assert.equal(reason(entry({ fingerprint: null })), 'stored without a fingerprint');
  assert.equal(reason(entry(), {}, { appVersion: '' }), 'the running version could not be read');
});

test('the filesystem sweep runs last, after every cheaper reason to refuse', () => {
  let swept = 0;
  const context = {
    inputsUnchanged: () => {
      swept += 1;
      return true;
    },
  };
  reason(entry({ appVersion: '3.10.2' }), {}, context);
  reason(entry(), { forceAchievementRecheck: true }, context);
  reason(null, {}, context);
  assert.equal(swept, 0);

  reason(entry(), {}, context);
  assert.equal(swept, 1);
});
