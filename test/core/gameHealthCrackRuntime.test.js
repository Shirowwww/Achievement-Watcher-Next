'use strict';

/*
  What the panel says about a game another crack serves.

  The emulator row is deliberately not a Goldberg diagnosis for such a folder: measuring RUNE or
  ALI213 against a steam_settings reports working games as broken. But saying nothing at all left no
  row whatsoever on exactly the games whose unlocks come from somewhere unexpected - the Little
  Nightmares report walked through a green panel and an empty save folder without ever being told
  which emulator was in charge.

  So the row names the loader. It stays informational, because a crack that works is not a fault,
  and it carries one action only where AW can prove the crack recorded nothing and where swapping
  steam_api would be the complete change (crackLoaderDetect's `replaceable`).
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const gameHealth = require('../../app/util/gameHealth.js');

const RUNE = { name: 'CODEX / RUNE / scene emulator', replaceable: true };

const signalsFor = (overrides = {}) => ({
  appid: 2149010,
  name: 'Little Nightmares Enhanced Edition',
  gameDir: 'D:\\Games\\Little Nightmares - Enhanced Edition',
  gameDirExists: true,
  installed: true,
  exe: 'D:\\Games\\Little Nightmares - Enhanced Edition\\Little_Nightmares_Enhanced.exe',
  exeExists: true,
  emulated: false,
  goldberg: null,
  achievements: { total: 22, unlocked: 0 },
  playtime: { total: 1353, lastPlayed: 1789280171 },
  crackLoader: RUNE,
  ...overrides,
});

const emulatorRow = (signals) => gameHealth.deriveHealth(signals).checks.find((check) => check.id === 'emulator');

test('the loader serving a game is named instead of leaving the row out', () => {
  const row = emulatorRow(signalsFor());
  assert.ok(row, 'no row at all is what left the reporter guessing for two weeks');
  assert.equal(row.level, gameHealth.LEVEL.INFO, 'AW cannot inspect that runtime, and cannot call it broken either');
  assert.equal(row.params.servedBy, RUNE.name);
  assert.equal(row.blocking, false);
});

test('a crack that ran and recorded nothing is offered the supported runtime, once', () => {
  const report = gameHealth.deriveHealth(signalsFor());
  assert.deepEqual(emulatorRow(signalsFor()).actions, [gameHealth.ACTION.SWITCH_RUNTIME]);
  assert.ok(report.actions.includes(gameHealth.ACTION.SWITCH_RUNTIME), 'the button has to reach the panel, not just the row');
  assert.notEqual(gameHealth.ACTION.SWITCH_RUNTIME, gameHealth.ACTION.INSTALL_RUNTIME, 'restoring a missing file and replacing a working one are different sentences');
});

test('a crack that has recorded something is left alone', () => {
  const working = signalsFor({ achievements: { total: 22, unlocked: 7 } });
  assert.deepEqual(emulatorRow(working).actions, [], 'this one is delivering - swapping it out would lose the unlocks');
  assert.equal(emulatorRow(working).params.idle, undefined);
});

test('a game that has never been launched is not told its crack is failing', () => {
  const fresh = signalsFor({ playtime: { total: 0, lastPlayed: 0 } });
  assert.deepEqual(emulatorRow(fresh).actions, [], 'nothing recorded after no play time proves nothing at all');
});

test('a loader whose emulation is not the steam_api dll is named but never swapped', () => {
  const proxied = signalsFor({ crackLoader: { name: 'OnlineFix', replaceable: false } });
  assert.equal(emulatorRow(proxied).params.servedBy, 'OnlineFix');
  assert.deepEqual(emulatorRow(proxied).actions, []);
});

test('naming the loader does not drag the game out of its normal state', () => {
  const report = gameHealth.deriveHealth(signalsFor({ tracking: { indexed: true, binary: 'Little_Nightmares_Enhanced.exe' } }));
  assert.notEqual(report.state, gameHealth.STATE.NOT_TRACKING, 'an INFO row is not a failure');
});

/*
  The other half: a folder AW does diagnose, whose dll turns out to be nobody's emulator. Every
  other row of that report describes a folder the game never opens, so the report has to lead with
  that and offer the one thing that changes it.
*/
const foreignRuntimeReport = {
  steamSettings: 'D:\\Games\\LN\\Engine\\Binaries\\ThirdParty\\Steamworks\\Steamv151\\Win64\\steam_settings',
  emulator: 'gbe',
  dllCount: 1,
  settingsBesideDll: true,
  foreignRuntimeDirs: ['D:\\Games\\LN\\Engine\\Binaries\\ThirdParty\\Steamworks\\Steamv151\\Win64'],
  issues: [{ level: 'error', code: 'RUNTIME_DLL_NOT_EMULATOR', message: 'the dll is not a Goldberg/GBE runtime' }],
  achievements: { expected: 22, found: 22, missing: [], missingIcons: [] },
};

test('a complete setup no dll will ever read blocks, and says so in its own words', () => {
  const report = gameHealth.deriveHealth(signalsFor({ emulated: true, crackLoader: null, goldberg: foreignRuntimeReport }));
  const row = report.checks.find((check) => check.id === 'emulator');

  assert.equal(row.level, gameHealth.LEVEL.FAIL);
  assert.equal(row.blocking, true, '22 of 22 achievements in a folder nothing opens is not a working game');
  assert.ok(row.actions.includes(gameHealth.ACTION.INSTALL_RUNTIME));
  assert.equal(report.reason, 'emulator-runtime-foreign', '"the emulator file is missing" would be the wrong thing to tell the user');
  assert.deepEqual(row.params.topics, ['runtime']);
});

test('a seeded save the game has not run on since is not a warning yet', () => {
  const { deriveHealth, LEVEL } = require('../../app/util/gameHealth.js');
  const seededAt = 1789312929483;
  const base = {
    installed: true,
    gameDirExists: true,
    exeExists: true,
    emulated: true,
    achievements: { total: 35, unlocked: 0 },
    goldberg: { steamSettings: 'C:/g/steam_settings', dllCount: 1, issues: [], save: { exists: true, seeded: true, seededAt, earned: 0 } },
  };
  const progress = (lastPlayed) => deriveHealth({ ...base, playtime: { total: 60, lastPlayed } }).checks.find((c) => c.id === 'progress');
  assert.equal(progress(0).level, LEVEL.INFO, 'never played');
  assert.equal(progress(Math.floor(seededAt / 1000) - 3600).level, LEVEL.INFO, 'played only before the setup');
  assert.equal(progress(Math.floor(seededAt / 1000) + 3600).level, LEVEL.WARN, 'played since and still nothing written');
});
