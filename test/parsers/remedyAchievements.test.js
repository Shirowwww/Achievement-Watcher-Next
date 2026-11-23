'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const remedy = require('../../app/util/remedyAchievements.js');
const crossSchema = require('../../app/util/crossSchemaUnlocks.js');

function writeChunk(t, statesByIndex, chunkIdsByIndex = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-remedy-achievements-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data.chunk');
  const recordCount = Math.max(0, ...Object.keys(statesByIndex).map(Number));
  const buffer = Buffer.alloc(8 + recordCount * 16);
  buffer.writeUInt32LE(1, 0);
  buffer.writeUInt32LE(recordCount, 4);

  for (let index = 1; index <= recordCount; index++) {
    const offset = 8 + (index - 1) * 16;
    buffer.writeUInt32LE(2, offset);
    buffer.writeUInt32LE(chunkIdsByIndex[index] || index, offset + 4);
    buffer.writeUInt32LE(statesByIndex[index] || 0, offset + 8);
  }
  fs.writeFileSync(file, buffer);
  return file;
}

test('Remedy state 1 unlocks use sequential record positions as Epic indexes', (t) => {
  const file = writeChunk(t, { 1: 1, 2: 1, 3: 3 }, { 1: 3, 2: 32, 3: 63 });
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), {
    1: { Achieved: true, UnlockTime: 0 },
    2: { Achieved: true, UnlockTime: 0 },
  });
});

test('sequential Remedy indexes remap onto the matching Epic schema entries', (t) => {
  const file = writeChunk(t, { 1: 1, 2: 1 });
  const schema = [
    { name: '1', displayName: 'First achievement' },
    { name: '2', displayName: 'Second achievement' },
  ];
  assert.deepEqual(
    crossSchema.remapUnlocksOntoSchema(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), schema, schema),
    {
      1: { Achieved: true, UnlockTime: 0, name: '1' },
      2: { Achieved: true, UnlockTime: 0, name: '2' },
    }
  );
});

test('only Alan Wake 2 reads the Remedy save, by its title or executable', () => {
  assert.equal(remedy.isAlanWake2({ title: 'Alan Wake 2' }), true);
  assert.equal(remedy.isAlanWake2({ title: 'Bluebird', exe: 'D:\\Games\\Alan Wake 2\\AlanWake2.exe' }), true);
  assert.equal(remedy.isAlanWake2({ title: 'Alan Wake Remastered', exe: 'D:\\Games\\AWR\\AlanWake.exe' }), false);
  assert.equal(remedy.isAlanWake2({ title: 'Hogwarts Legacy', exe: 'D:\\Games\\HL\\HogwartsLegacy.exe' }), false);
  assert.equal(remedy.isAlanWake2(), false);
});

test('Remedy data.chunk rejects a short or unknown-format file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-remedy-invalid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data.chunk');
  fs.writeFileSync(file, Buffer.alloc(8));
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), {});

  const unknownVersion = Buffer.alloc(24);
  unknownVersion.writeUInt32LE(2, 0);
  unknownVersion.writeUInt32LE(1, 4);
  fs.writeFileSync(file, unknownVersion);
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), {});
});

test('Remedy progress thresholds unlock only at their configured maximum', (t) => {
  const thresholds = {
    10: 5,
    11: 6,
    12: 8,
    20: 5,
    34: 13,
    57: 8,
    59: 17,
    60: 43,
    63: 14,
    69: 3,
    73: 6,
    81: 5,
    85: 4,
    87: 37,
  };
  assert.deepEqual(remedy.REMEDY_PROGRESS_MAXIMUMS, thresholds);
  const belowMaximum = Object.fromEntries(
    Object.entries(thresholds).map(([index, maximum]) => [index, maximum - 1])
  );
  const complete = Object.fromEntries(
    Object.entries(thresholds).map(([index, maximum]) => [index, maximum])
  );

  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [writeChunk(t, belowMaximum)] }), {});
  assert.deepEqual(
    remedy.readRemedyAlanWake2Unlocks({ files: [writeChunk(t, complete)] }),
    Object.fromEntries(
      Object.keys(thresholds).map((index) => [index, { Achieved: true, UnlockTime: 0 }])
    )
  );
});

test('Remedy charm achievements use the sequential schema indexes', (t) => {
  const file = writeChunk(t, { 62: 1, 63: 13 });
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), {
    62: { Achieved: true, UnlockTime: 0 },
  });

  const completeFile = writeChunk(t, { 62: 1, 63: 14, 65: 1 });
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [completeFile] }), {
    62: { Achieved: true, UnlockTime: 0 },
    63: { Achieved: true, UnlockTime: 0 },
    65: { Achieved: true, UnlockTime: 0 },
  });
});

test('Remedy chapter and DLC records keep their sequential Epic indexes', (t) => {
  const states = { 38: 1, 39: 1, 40: 1, 41: 1, 67: 1, 78: 1, 79: 1, 88: 1 };
  const file = writeChunk(t, states);
  const earned = remedy.readRemedyAlanWake2Unlocks({ files: [file] });
  assert.deepEqual(Object.keys(earned), Object.keys(states));
  for (const index of Object.keys(states)) {
    assert.deepEqual(earned[index], { Achieved: true, UnlockTime: 0 });
  }
});
