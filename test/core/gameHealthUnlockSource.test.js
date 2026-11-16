'use strict';

/*
  Three facts Game Health used to blur into one green "Ready" (#197): the achievement list is known,
  the game is watched for play time, and something on this PC records its unlocks. Also the configured
  and watched executables (#193), and the data row that config options turned orange (#167).
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { deriveHealth, dotState, scannedState, STATE, LEVEL, ACTION } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const checkFor = (report, id) => report.checks.find((entry) => entry.id === id);

// The Blood of Dawnwalker as penczol added it by hand: Steam appid, real exe, nothing else.
function manualGame(overrides = {}) {
  return {
    appid: 'manual-3751260',
    steamappid: '3751260',
    name: 'The Blood of Dawnwalker',
    source: 'Manual',
    manual: true,
    installed: true,
    gameDir: 'D:/Games/Dawnwalker',
    gameDirExists: true,
    exe: 'D:/Games/Dawnwalker/Dawnwalker.exe',
    exeExists: true,
    achievements: { total: 46, unlocked: 0 },
    emulated: false,
    saveSources: [],
    goldberg: null,
    uplay: null,
    crackLoader: null,
    processTracking: true,
    tracking: { indexed: true, binary: 'Dawnwalker.exe' },
    notifications: { transport: 'auto' },
    ...overrides,
  };
}

test('a manual game with no unlock source is playtime only, not ready (#197)', () => {
  const report = deriveHealth(manualGame());
  assert.equal(report.state, STATE.PLAYTIME_ONLY);
  assert.equal(report.reason, 'playtime-only');
  assert.equal(checkFor(report, 'achievement-data').level, LEVEL.OK, 'the list itself is known');
  assert.equal(checkFor(report, 'tracking').level, LEVEL.OK, 'play time is watched');
  const source = checkFor(report, 'emulator');
  assert.equal(source.level, LEVEL.INFO, 'a fact, not a fault');
  assert.equal(source.params.noSource, true);
  assert.equal(checkFor(report, 'progress'), undefined, 'no "nothing unlocked yet" for a game nothing records');
  assert.ok(!report.actions.includes(ACTION.INSTALL_RUNTIME) && !report.actions.includes(ACTION.REPAIR_DATA), 'no repair is pushed on it');
});

test('the tile dot follows the report', () => {
  assert.equal(dotState({ installed: true, achievement: { total: 46 } }, STATE.PLAYTIME_ONLY), STATE.PLAYTIME_ONLY);
});

test('any source of unlocks keeps the usual verdicts', () => {
  const sources = {
    'a save being read': { saveSources: [{ source: 'GBE Fork', path: 'C:/Users/x/AppData/Roaming/GSE Saves/3751260' }] },
    'a crack loader': { crackLoader: { name: 'RUNE', replaceable: false } },
    'the Steam client': { steamClientServed: true },
    'a store account': { officialPlatform: true, processTracking: false },
    'an unlock already seen': { achievements: { total: 46, unlocked: 3 } },
    'an emulator setup': { emulated: true, goldberg: { emulator: 'gbe', steamSettings: 'D:/Games/Dawnwalker/steam_settings', dllCount: 1, issues: [], achievements: { expected: 46, found: 46, missing: [], missingIcons: [] } } },
  };
  for (const [label, signals] of Object.entries(sources)) {
    const report = deriveHealth(manualGame(signals));
    assert.notEqual(report.state, STATE.PLAYTIME_ONLY, label);
    assert.notEqual(report.reason, 'playtime-only', label);
  }
});

test('a card a library reader found is never playtime only', () => {
  const report = deriveHealth(manualGame({ manual: false, source: 'Codex' }));
  assert.notEqual(report.state, STATE.PLAYTIME_ONLY);
});

test('zero unlocks alone is never a failure', () => {
  const report = deriveHealth(manualGame());
  assert.ok(!report.checks.some((entry) => entry.level === LEVEL.FAIL || entry.level === LEVEL.WARN));
});

test('a real fault still outranks playtime only', () => {
  const report = deriveHealth(manualGame({ exe: 'D:/Games/Dawnwalker/Gone.exe', exeExists: false }));
  assert.notEqual(report.state, STATE.PLAYTIME_ONLY);
});

test('a game with no achievements stays ready, not playtime only', () => {
  const report = deriveHealth(manualGame({ achievements: { total: 0, unlocked: 0, none: true } }));
  assert.equal(report.state, STATE.READY);
});

test('metadata without a runtime is still a setup to finish (the reverse case in #197)', () => {
  const goldberg = { emulator: 'gbe', steamSettings: 'D:/Games/Dawnwalker/steam_settings', dllCount: 0, issues: [], achievements: { expected: 46, found: 46, missing: [], missingIcons: [] } };
  const report = deriveHealth(manualGame({ emulated: true, goldberg }));
  assert.equal(report.state, STATE.NOT_TRACKING);
  assert.equal(report.reason, 'emulator-runtime-missing', 'says exactly what is missing, and offers it');
});

test('a configured exe the index does not watch is shown and can be re-watched (#193)', () => {
  const report = deriveHealth(
    manualGame({
      exe: 'D:/Games/GoW/FairlightConcept/Binaries/Win64/GoWEDay-Steam.exe',
      tracking: { indexed: true, binary: 'start_protected_game.exe' },
      saveSources: [{ source: 'GBE Fork', path: 'C:/x/GSE Saves/3010850' }],
    })
  );
  const tracking = checkFor(report, 'tracking');
  assert.equal(tracking.level, LEVEL.WARN);
  assert.deepEqual(tracking.params, { binary: 'start_protected_game.exe', configured: 'GoWEDay-Steam.exe' });
  assert.equal(report.reason, 'tracking-mismatch');
  assert.equal(report.actions[0], ACTION.START_TRACKING, 'the fix is watching the chosen exe');
});

test('a configured launcher that starts the watched game is said, not flagged', () => {
  const report = deriveHealth(
    manualGame({
      exe: 'D:/Games/GoW/start_protected_game.exe',
      tracking: { indexed: true, binary: 'GoWEDay-Steam.exe' },
      saveSources: [{ source: 'GBE Fork', path: 'C:/x/GSE Saves/3010850' }],
    })
  );
  const tracking = checkFor(report, 'tracking');
  assert.equal(tracking.level, LEVEL.INFO);
  assert.equal(tracking.params.launcher, true);
  assert.notEqual(report.state, STATE.ATTENTION);
});

test('the Unreal shipping variant counts as the same executable', () => {
  const report = deriveHealth(manualGame({ exe: 'D:/Games/X/Binaries/Win64/X-Win64-Shipping.exe', tracking: { indexed: true, binary: 'X.exe' } }));
  assert.equal(checkFor(report, 'tracking').level, LEVEL.OK);
});

test('emulator options never mark a complete achievement list (#167)', () => {
  // Construction Simulator as DarKnight594 sent it: 33 of 33 achievements, only ticket and account options flagged.
  const goldberg = {
    emulator: 'gbe',
    steamSettings: 'D:/Games/Construction Simulator/steam_settings',
    dllCount: 1,
    achievements: { expected: 33, found: 33, missing: [], missingIcons: [] },
    issues: [
      { level: 'warning', code: 'NO_NEW_APP_TICKET' },
      { level: 'warning', code: 'NO_GC_TOKEN' },
      { level: 'warning', code: 'UNKNOWN_STATS_REJECTED' },
      { level: 'warning', code: 'BAD_USER_CONFIG' },
    ],
  };
  const report = deriveHealth(manualGame({ source: 'GBE Fork', emulated: true, goldberg, achievements: { total: 33, unlocked: 0 } }));
  assert.equal(checkFor(report, 'achievement-data').level, LEVEL.OK, 'the list is complete');
  assert.notEqual(report.reason, 'achievement-data-incomplete', 'no "some unlocks would be missed"');
  assert.equal(checkFor(report, 'emulator').level, LEVEL.WARN, 'the options stay on the emulator row');
  assert.ok(report.actions.includes(ACTION.REPAIR_DATA));
});

// The tile dot before the full report: the scan's record must give the same grey, or the tile shows
// green (Valve's own dll counted) and then turns grey a moment later.
test('the scan-time dot of a manual game with no unlock source is already playtime only', () => {
  const record = { manual: true, installed: true, hasSteamApiDll: true, noUnlockSource: true, achievement: { total: 46, unlocked: 0 } };
  assert.equal(scannedState(record), STATE.PLAYTIME_ONLY);
  assert.equal(dotState(record), STATE.PLAYTIME_ONLY);
  assert.equal(scannedState({ ...record, hasSteamApiDll: false }), STATE.PLAYTIME_ONLY, 'no dll at all is not "not tracking" either');
});

test('the scan-time dot keeps its usual colour once anything records unlocks', () => {
  const record = { manual: true, installed: true, hasSteamApiDll: true, noUnlockSource: true, achievement: { total: 46, unlocked: 0 } };
  assert.equal(scannedState({ ...record, noUnlockSource: false }), STATE.READY, 'an emulator found on disk');
  assert.equal(scannedState({ ...record, noUnlockSource: undefined }), STATE.READY, 'not looked at: unchanged');
  assert.equal(scannedState({ ...record, achievement: { total: 46, unlocked: 2 } }), STATE.READY, 'an unlock proves a source');
  assert.equal(scannedState({ ...record, dataPath: 'C:/x/GSE Saves/3751260' }), STATE.READY, 'a save being read');
  assert.equal(scannedState({ ...record, manual: false }), STATE.READY, 'only a hand-added card');
});
