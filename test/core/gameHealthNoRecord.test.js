'use strict';

/*
  Razor1911's GTA IV Complete Edition fakes the Social Club inside the game and keeps no record of an
  unlock anywhere. The library lists it from its %APPDATA%\.1911 profile; Game Health has to say
  that nothing will ever come in, rather than read as a game waiting for its first unlock.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const gameHealth = require('../../app/util/gameHealth.js');

const signals = (overrides = {}) => ({
  appid: 'socialclub-gta-iv',
  name: 'Grand Theft Auto IV: The Complete Edition',
  source: 'Razor1911 (Rockstar)',
  installed: true,
  emulated: false,
  goldberg: null,
  crackLoader: null,
  achievements: { total: 89, unlocked: 0 },
  playtime: { total: 0, lastPlayed: 0 },
  noAchievementRecord: 'Razor1911 (Rockstar)',
  ...overrides,
});

const emulatorRow = (report) => report.checks.find((check) => check.id === 'emulator');

test('a crack that keeps no achievement record is explained as tracking nothing', () => {
  const report = gameHealth.deriveHealth(signals());
  assert.equal(report.reason, 'crack-keeps-no-record');
  assert.equal(report.state, gameHealth.STATE.NOT_TRACKING);
  assert.deepEqual(emulatorRow(report).params, { servedBy: 'Razor1911 (Rockstar)', noRecord: true });
  assert.deepEqual(emulatorRow(report).actions, []);
});

test('a game whose crack keeps its unlocks is not told it records nothing', () => {
  const report = gameHealth.deriveHealth(signals({ noAchievementRecord: '' }));
  assert.notEqual(report.reason, 'crack-keeps-no-record');
  assert.notEqual(emulatorRow(report)?.params?.noRecord, true);
});
