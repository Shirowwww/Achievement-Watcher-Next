'use strict';

/*
  Games that publish no achievements at all - The Sims 4 is the one this came from. Every signal the
  health model reads is a count, and a count of zero used to mean "AW Next cannot see the schema":
  the game was reported as Not tracking, its folder was diagnosed against a Goldberg setup it never
  needed, and the right-click menu offered to install one. The distinction the tests below hold is
  between "there is nothing to track" and "tracking is broken", which only the verdict achievements
  .js stamps can tell apart - never the number itself.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { deriveHealth, hasDot, scannedState, STATE, LEVEL } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

// The Sims 4 as AW Next saw it: matched to its Steam appid, a folder somebody set a GBE runtime up
// in, and a schema that is legitimately empty.
function noAchievementGame(overrides = {}) {
  return {
    appid: '1222670',
    steamappid: '1222670',
    name: 'The Sims 4',
    source: 'Goldberg',
    gameDir: 'C:/Jeux/The Sims 4',
    gameDirExists: true,
    installed: true,
    achievements: { total: 0, unlocked: 0, none: true },
    emulated: true,
    goldberg: {
      emulator: 'gbe',
      steamSettings: 'C:/Jeux/The Sims 4/steam_settings',
      dllCount: 1,
      achievements: { expected: 0, found: 0, missing: [], missingIcons: [] },
      save: { exists: false },
      issues: [{ level: 'error', code: 'NO_ACHIEVEMENTS_JSON', message: 'achievements.json is empty.' }],
    },
    uplay: null,
    tracking: { indexed: false, binary: '' },
    notifications: { transport: 'toast', progressMuted: false },
    playtime: { total: 0, lastPlayed: 0 },
    ...overrides,
  };
}

function checkFor(report, id) {
  return report.checks.find((entry) => entry.id === id);
}

test('a game with no achievements is not reported as a game AW Next failed to read', () => {
  const report = deriveHealth(noAchievementGame());
  assert.equal(report.state, STATE.READY);
  assert.equal(report.reason, 'no-achievements');
  assert.ok(
    !report.checks.some((entry) => entry.blocking && entry.level === LEVEL.FAIL),
    'nothing can block tracking for a game with nothing to track'
  );
});

test('the achievement row says so instead of calling the list missing', () => {
  const data = checkFor(deriveHealth(noAchievementGame()), 'achievement-data');
  assert.equal(data.level, LEVEL.INFO);
  assert.equal(data.params.none, true);
  assert.deepEqual(data.actions, [], 'there is no list to rewrite, so no repair may be offered');
});

test('no setup row and no progress row: neither has anything to describe', () => {
  const report = deriveHealth(noAchievementGame());
  assert.equal(checkFor(report, 'emulator'), undefined);
  assert.equal(checkFor(report, 'progress'), undefined);
  assert.equal(checkFor(report, 'tracking'), undefined);
});

test('an empty count on its own still means the schema could not be read', () => {
  // The whole point of the flag: without it, zero is ambiguous and has to stay a failure.
  const report = deriveHealth(noAchievementGame({ achievements: { total: 0, unlocked: 0 } }));
  assert.equal(report.state, STATE.NOT_TRACKING);
  assert.equal(report.reason, 'no-achievement-data');
});

test('the tile carries no status dot for a game with no achievements', () => {
  assert.equal(hasDot({ appid: '1222670', hasSteamApiDll: true, achievement: { total: 0, none: true } }), false);
  assert.equal(hasDot({ appid: '1222670', hasSteamApiDll: true, achievement: { total: 0 } }), true, 'an unverified zero still gets one');
});

test('the scanned state answers ready rather than "worth a check"', () => {
  assert.equal(scannedState({ hasSteamApiDll: true, achievement: { total: 0, none: true } }), STATE.READY);
  assert.equal(scannedState({ hasSteamApiDll: false, achievement: { total: 0, none: true } }), STATE.READY);
});
