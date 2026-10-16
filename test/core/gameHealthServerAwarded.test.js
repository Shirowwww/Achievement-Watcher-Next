'use strict';

/*
  Games whose achievements are granted by the publisher's servers, never by the Steam API.

  Halo: Campaign Evolved routes every unlock through PlayFab and Xbox Live: a forced unlock proved
  RUNE records fine, and a real one under RUNE reached no file and no account. An offline emulator
  can therefore never record one, and the panel has to say so instead of offering to swap runtimes.
  Only verified appids are listed, so the sentence can never reach a game it is wrong about.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const gameHealth = require('../../app/util/gameHealth.js');

const HALO = 2806050;
const RUNE = { name: 'CODEX / RUNE / scene emulator', replaceable: true };

const signalsFor = (overrides = {}) => ({
  appid: HALO,
  name: 'Halo: Campaign Evolved',
  gameDir: 'C:\\Jeux\\Halo Campaign Evolved',
  gameDirExists: true,
  installed: true,
  exe: 'C:\\Jeux\\Halo Campaign Evolved\\Meteorite\\Binaries\\Win64\\HaloCampaignEvolved.exe',
  exeExists: true,
  emulated: false,
  goldberg: null,
  achievements: { total: 58, unlocked: 0 },
  playtime: { total: 600, lastPlayed: 1792140000 },
  crackLoader: RUNE,
  ...overrides,
});

const emulatorRow = (report) => report.checks.find((check) => check.id === 'emulator');

test('a listed game under a scene crack is explained as server-awarded', () => {
  const report = gameHealth.deriveHealth(signalsFor());
  assert.equal(report.reason, 'server-awarded');
  assert.equal(report.state, gameHealth.STATE.NOT_TRACKING, 'nothing will ever be recorded, which is what this state means');
  assert.equal(emulatorRow(report).params.serverAwarded, true);
  assert.deepEqual(emulatorRow(report).actions, [], 'swapping the runtime changes nothing for a game that never calls it');
});

test('the sentence does not wait for an hour of play', () => {
  const fresh = gameHealth.deriveHealth(signalsFor({ playtime: { total: 0, lastPlayed: 0 } }));
  assert.equal(fresh.reason, 'server-awarded', 'the cause is known from the appid alone');
});

test('a Goldberg setup over a listed game gets the same sentence', () => {
  const goldberg = { steamSettings: true, dllCount: 1, emulator: 'gbe', achievements: { missing: [], missingIcons: [] }, issues: [] };
  const report = gameHealth.deriveHealth(signalsFor({ crackLoader: null, emulated: true, goldberg }));
  assert.equal(report.reason, 'server-awarded');
});

test('the same game on the official client is left alone', () => {
  const report = gameHealth.deriveHealth(signalsFor({ crackLoader: null, officialPlatform: 'steam' }));
  assert.notEqual(report.reason, 'server-awarded', 'Steam itself receives these unlocks');
  assert.equal(emulatorRow(report), undefined);
});

test('OnlineFix is not told it records nothing', () => {
  const report = gameHealth.deriveHealth(signalsFor({ crackLoader: { name: 'OnlineFix', replaceable: false } }));
  assert.notEqual(report.reason, 'server-awarded', 'it signs into a real account, so the unlocks reach Xbox');
});

test('an unlisted game keeps the ordinary crack sentences', () => {
  const report = gameHealth.deriveHealth(signalsFor({ appid: 2149010, playtime: { total: 7200, lastPlayed: 1792140000 } }));
  assert.equal(report.reason, 'crack-records-nothing');
});

test('the appid matches whether it arrives as a number or a string', () => {
  assert.equal(gameHealth.deriveHealth(signalsFor({ appid: String(HALO) })).reason, 'server-awarded');
});
