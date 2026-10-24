'use strict';

/*
  A game run as Spacewar (appid 480) by a steam_appid.txt, as FreeTP-style online fixes do: Steam
  receives the unlocks under Spacewar, finds none of the real game's names in Spacewar's list and
  rejects them, so nothing records them anywhere. The panel has to say so instead of reading as an
  untracked game. OnlineFix also runs as Spacewar but keeps the real game's unlocks on disk.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const gameHealth = require('../../app/util/gameHealth.js');
const crackLoaderDetect = require('../../app/util/crackLoaderDetect.js');

const signalsFor = (overrides = {}) => ({
  appid: 227300,
  name: 'Euro Truck Simulator 2',
  gameDir: 'C:\\Jeux\\ETS2',
  gameDirExists: true,
  installed: true,
  exe: 'C:\\Jeux\\ETS2\\bin\\win_x64\\eurotrucks2.exe',
  exeExists: true,
  emulated: false,
  goldberg: null,
  achievements: { total: 100, unlocked: 0 },
  playtime: { total: 7200, lastPlayed: 1792140000 },
  crackLoader: null,
  spacewar: true,
  ...overrides,
});

const emulatorRow = (report) => report.checks.find((check) => check.id === 'emulator');

test('a game run as Spacewar is explained as recording nothing', () => {
  const report = gameHealth.deriveHealth(signalsFor());
  assert.equal(report.reason, 'spacewar');
  assert.equal(report.state, gameHealth.STATE.NOT_TRACKING);
  assert.equal(emulatorRow(report).params.spacewar, true);
  assert.deepEqual(emulatorRow(report).actions, []);
});

test('OnlineFix running as Spacewar is not told it records nothing', () => {
  const report = gameHealth.deriveHealth(signalsFor({ crackLoader: { name: 'OnlineFix', replaceable: false } }));
  assert.notEqual(report.reason, 'spacewar', 'it keeps the real game\'s unlocks in Public\\Documents\\OnlineFix');
});

test('an emulator writing its own saves is not told it records nothing', () => {
  const goldberg = { steamSettings: true, dllCount: 1, emulator: 'gbe', achievements: { missing: [], missingIcons: [] }, issues: [] };
  const report = gameHealth.deriveHealth(signalsFor({ emulated: true, goldberg }));
  assert.notEqual(report.reason, 'spacewar');
});

test('Steam having recorded the real game wins over a leftover steam_appid.txt', () => {
  const report = gameHealth.deriveHealth(signalsFor({ steamClientServed: true }));
  assert.notEqual(report.reason, 'spacewar');
});

test('a steam_appid.txt set to 480 beside the game or its exe is found', () => {
  const root = makeTempDir('aw-spacewar-');
  const exeDir = path.join(root, 'bin', 'win_x64');
  fs.mkdirSync(exeDir, { recursive: true });
  assert.equal(crackLoaderDetect.runsAsSpacewar([root, exeDir]), false);

  fs.writeFileSync(path.join(exeDir, 'steam_appid.txt'), '480\r\n');
  assert.equal(crackLoaderDetect.runsAsSpacewar([root, exeDir]), true);

  fs.writeFileSync(path.join(exeDir, 'steam_appid.txt'), '227300');
  assert.equal(crackLoaderDetect.runsAsSpacewar([root, exeDir]), false, 'the real appid is not Spacewar');
  assert.equal(crackLoaderDetect.runsAsSpacewar(['', null]), false);
});
