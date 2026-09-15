'use strict';

/*
  The placeholder problem.

  Applying a GBE setup seeds <GSE Saves>/<appid>/achievements.json with every achievement locked, so
  a freshly fixed game shows its list before it has ever run. The diagnosis then read that file back
  and announced "Runtime save found (gbe): 0/46 unlocked", which sounds like the emulator is writing
  and is not: the only thing that ever wrote it was AW Next. A packaged Unreal build whose dll the
  process never loads produced exactly that line, and the health panel downgraded its warning to a
  calm "nothing unlocked yet" on the strength of it (The Blood of Dawnwalker, reported on 3.10.5
  after the engine-dll fix had already shipped).

  These cover the marker that tells the two apart, and the two places that must act on it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const runtimeSaveSeed = require(path.join(__dirname, '..', '..', 'app', 'util', 'runtimeSaveSeed.js'));
const { deriveHealth, LEVEL } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const APPID = '3751260';
const SCHEMA = {
  achievement: {
    total: 2,
    list: [
      { name: 'FIRST', displayName: 'First', description: 'First one', hidden: 0 },
      { name: 'SECOND', displayName: 'Second', description: 'Second one', hidden: 0 },
    ],
  },
};

function tmpdir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

// One GSE Saves root, seeded the way a repair seeds it.
function seededRoot(prefix) {
  const root = path.join(tmpdir(prefix), 'GSE Saves');
  const savesRoots = [{ type: 'gbe', root }];
  const summary = goldberg.seedRuntimeSave({ appid: APPID, schema: SCHEMA, steamSettings: null, savesRoots });
  return { root, savesRoots, file: path.join(root, APPID, 'achievements.json'), summary };
}

// What the emulator writing one unlock looks like: same file, different bytes.
function emulatorWrites(file, earned = 1) {
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = Object.keys(state);
  for (let i = 0; i < earned && i < names.length; i += 1) {
    state[names[i]] = { ...state[names[i]], earned: true, earned_time: 1789000000 };
  }
  fs.writeFileSync(file, JSON.stringify(state, null, 4));
}

test('a seeded save is marked, and reads back as the placeholder it is', () => {
  const saves = seededRoot('aw-seed-mark-');

  assert.equal(saves.summary.created.length, 1);
  assert.ok(fs.existsSync(runtimeSaveSeed.markerFile(saves.file)), 'the seed records what it wrote');
  assert.equal(runtimeSaveSeed.isUntouchedSeed(saves.file), true);

  const state = goldberg.inspectSaveState(APPID, saves.savesRoots);
  assert.equal(state.exists, true);
  assert.equal(state.seeded, true, 'the file is there, and it proves nothing');
  assert.equal(state.total, 2);
  assert.equal(state.earned, 0);
});

test('the first thing the emulator writes ends the placeholder', () => {
  const saves = seededRoot('aw-seed-written-');
  emulatorWrites(saves.file);

  assert.equal(runtimeSaveSeed.isUntouchedSeed(saves.file), false);
  const state = goldberg.inspectSaveState(APPID, saves.savesRoots);
  assert.equal(state.seeded, false);
  assert.equal(state.earned, 1);
});

test('a save AW Next never seeded is never called a placeholder', () => {
  // Every save written before the marker existed, and every save the emulator created on its own.
  const root = path.join(tmpdir('aw-seed-foreign-'), 'GSE Saves');
  const file = path.join(root, APPID, 'achievements.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ FIRST: { earned: false, earned_time: 0 } }, null, 2));

  assert.equal(goldberg.inspectSaveState(APPID, [{ type: 'gbe', root }]).seeded, false);
});

test('re-seeding an existing save leaves it alone, marker and all', () => {
  const saves = seededRoot('aw-seed-again-');
  emulatorWrites(saves.file, 2);
  const before = fs.readFileSync(saves.file, 'utf8');

  const again = goldberg.seedRuntimeSave({ appid: APPID, schema: SCHEMA, steamSettings: null, savesRoots: saves.savesRoots });
  assert.equal(again.created.length, 0);
  assert.equal(again.skipped.length, 1);
  assert.equal(fs.readFileSync(saves.file, 'utf8'), before, 'a repair must never wipe real unlocks');
  assert.equal(goldberg.inspectSaveState(APPID, saves.savesRoots).seeded, false);
});

test('the diagnosis says who wrote the save', () => {
  const gameDir = path.join(tmpdir('aw-seed-diagnose-'), 'Game');
  const settings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(settings, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'gbe steam_settings marker');
  fs.writeFileSync(
    path.join(settings, 'achievements.json'),
    JSON.stringify(SCHEMA.achievement.list.map((a) => ({ ...a, hidden: '0', icon: '', icongray: '' })))
  );
  const saves = seededRoot('aw-seed-diagnose-saves-');

  const seeded = goldberg.diagnose({ gameDir, appid: APPID, schema: SCHEMA, savesRoots: saves.savesRoots });
  assert.ok(
    seeded.issues.some((issue) => issue.code === 'SAVE_SEEDED_NOT_WRITTEN'),
    'the placeholder must be named as one'
  );
  assert.ok(!seeded.issues.some((issue) => issue.code === 'SAVE_PRESENT'));

  emulatorWrites(saves.file);
  const written = goldberg.diagnose({ gameDir, appid: APPID, schema: SCHEMA, savesRoots: saves.savesRoots });
  assert.ok(written.issues.some((issue) => issue.code === 'SAVE_PRESENT'));
  assert.ok(!written.issues.some((issue) => issue.code === 'SAVE_SEEDED_NOT_WRITTEN'));
});

/*
  The health panel is where this cost the user an answer: the placeholder turned the one warning that
  points at the emulator into an info row about a game nobody has played.
*/
function emulatedGame(save) {
  return {
    appid: APPID,
    name: 'The Blood of Dawnwalker',
    source: 'Manual',
    gameDir: 'D:/Games/Dawnwalker',
    gameDirExists: true,
    installed: true,
    exe: 'D:/Games/Dawnwalker/Binaries/Win64/Dawnwalker.exe',
    exeExists: true,
    achievements: { total: 46, unlocked: 0 },
    emulated: true,
    goldberg: {
      emulator: 'gbe',
      steamSettings: 'D:/Games/Dawnwalker/steam_settings',
      dllCount: 1,
      achievements: { expected: 46, found: 46, missing: [], missingIcons: [] },
      save,
      issues: [],
      ok: true,
    },
    uplay: null,
    tracking: { indexed: true, binary: 'Dawnwalker.exe' },
    notifications: { transport: 'auto', progressMuted: false },
    playtime: { total: 21106, lastPlayed: 1789145451 },
  };
}

test('a placeholder save does not stand in for progress the emulator never wrote', () => {
  const seeded = deriveHealth(emulatedGame({ exists: true, seeded: true, type: 'gbe', earned: 0, total: 46 }));
  const check = seeded.checks.find((entry) => entry.id === 'progress');

  assert.equal(check.level, LEVEL.WARN, 'nothing is recording unlocks, and the report has to say so');
  assert.equal(seeded.reason, 'no-progress-yet');

  const real = deriveHealth(emulatedGame({ exists: true, seeded: false, type: 'gbe', earned: 0, total: 46 }));
  assert.equal(real.checks.find((entry) => entry.id === 'progress').level, LEVEL.INFO);
  assert.equal(real.reason, 'nothing-unlocked-yet', 'a real empty save is still just a game with no progress');
});

test('the technical dump carries the flag, so a pasted report can be read from the outside', () => {
  const report = deriveHealth(emulatedGame({ exists: true, seeded: true, type: 'gbe', earned: 0, total: 46 }));
  assert.equal(report.technical.goldberg.save.seeded, true);
});
