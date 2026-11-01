'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { deriveHealth, checkSignature, LEVEL, STATE } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));
const { createHealthIgnoreStore } = require(path.join(__dirname, '..', '..', 'app', 'util', 'healthIgnoreStore.js'));

// A working game Game Health cannot recognise (#160): an emulator report it reads as broken.
function flagged(overrides = {}) {
  return {
    appid: '447040',
    name: 'Watch Dogs 2',
    source: 'Goldberg',
    gameDir: 'C:/Jeux/WD2',
    gameDirExists: true,
    installed: true,
    achievements: { total: 55, unlocked: 1 },
    emulated: true,
    goldberg: {
      emulator: 'gbe',
      steamSettings: 'C:/Jeux/WD2/steam_settings',
      dllCount: 1,
      save: { exists: true, type: 'gbe', earned: 1, total: 55 },
      issues: [{ level: 'warning', code: 'NO_GC_TOKEN', message: '' }],
    },
    uplay: null,
    tracking: { indexed: true, binary: 'WatchDogs2.exe' },
    notifications: { transport: 'toast', progressMuted: false },
    ...overrides,
  };
}

const emulatorRow = (report) => report.checks.find((entry) => entry.id === 'emulator');

test('an ignored problem stops counting against the game and offers no fix', () => {
  const before = deriveHealth(flagged());
  assert.equal(emulatorRow(before).level, LEVEL.WARN);

  const flaggedRows = before.checks.filter((entry) => entry.level === LEVEL.WARN || entry.level === LEVEL.FAIL);
  const after = deriveHealth(flagged({ ignored: flaggedRows.map(checkSignature) }));

  assert.equal(emulatorRow(after).ignored, true);
  assert.equal(emulatorRow(after).ignoredLevel, LEVEL.WARN);
  assert.notEqual(emulatorRow(after).level, LEVEL.WARN);
  assert.deepEqual(emulatorRow(after).actions, []);
  assert.equal(after.state, STATE.READY);
});

test('a different problem on the same row shows again', () => {
  const ignored = [checkSignature(emulatorRow(deriveHealth(flagged())))];
  const worse = flagged({ ignored, goldberg: { ...flagged().goldberg, issues: [{ level: 'error', code: 'MISSING_ACHIEVEMENTS', message: '' }] } });

  const report = deriveHealth(worse);

  assert.equal(emulatorRow(report).ignored, undefined);
  assert.equal(emulatorRow(report).level, LEVEL.FAIL);
});

test('the store keeps ignores per game and survives a reload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-health-ignore-'));
  const store = createHealthIgnoreStore(root);

  store.ignore('447040', 'emulator:warn:{}');
  store.ignore('447040', 'emulator:warn:{}');
  store.ignore('2668510', 'progress:warn:{}');

  const reloaded = createHealthIgnoreStore(root);
  assert.deepEqual(reloaded.get('447040'), ['emulator:warn:{}']);
  reloaded.unignore('447040', 'emulator:warn:{}');
  assert.deepEqual(createHealthIgnoreStore(root).get('447040'), []);
  assert.deepEqual(createHealthIgnoreStore(root).get('2668510'), ['progress:warn:{}']);
});

test('a corrupt store reads as nothing ignored', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-health-ignore-'));
  fs.mkdirSync(path.join(root, 'cfg'));
  fs.writeFileSync(path.join(root, 'cfg', 'healthIgnored.json'), '{not json');

  assert.deepEqual(createHealthIgnoreStore(root).get('447040'), []);
});
