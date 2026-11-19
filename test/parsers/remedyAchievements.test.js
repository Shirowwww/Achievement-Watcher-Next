'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const remedy = require('../../app/util/remedyAchievements.js');
const crossSchema = require('../../app/util/crossSchemaUnlocks.js');

test('Remedy Alan Wake 2 data.chunk marks state 1 achievements earned', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-remedy-achievements-'));
  const file = path.join(temp, 'data.chunk');
  const buffer = Buffer.alloc(8 + 3 * 16);
  buffer.writeUInt32LE(1, 0);
  buffer.writeUInt32LE(3, 4);

  [[3, 1], [32, 1], [63, 3]].forEach(([id, state], index) => {
    const at = 8 + index * 16;
    buffer.writeUInt32LE(2, at);
    buffer.writeUInt32LE(id, at + 4);
    buffer.writeUInt32LE(state, at + 8);
  });

  fs.writeFileSync(file, buffer);
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), {
    3: { Achieved: true, UnlockTime: 0 },
    32: { Achieved: true, UnlockTime: 0 },
  });
});

test('Remedy data.chunk rejects a short or unknown-format file', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-remedy-invalid-'));
  const file = path.join(temp, 'data.chunk');
  fs.writeFileSync(file, Buffer.alloc(8));
  assert.deepEqual(remedy.readRemedyAlanWake2Unlocks({ files: [file] }), {});
});

test('Remedy numeric record ids remap onto Alan Wake 2 Epic names', () => {
  const epicSchema = [
    { name: '3', displayName: 'Not the Last' },
    { name: '32', displayName: 'Nightmare Territory' },
    { name: '38', displayName: 'Hunting Season' },
    { name: '66', displayName: 'The Other Side' },
  ];
  const local = remedy.readRemedyAlanWake2Unlocks({ files: [] });
  assert.deepEqual(crossSchema.remapUnlocksOntoSchema(
    {
      3: { Achieved: true, UnlockTime: 0 },
      32: { Achieved: true, UnlockTime: 0 },
      38: { Achieved: true, UnlockTime: 0 },
      66: { Achieved: true, UnlockTime: 0 },
    },
    epicSchema,
    epicSchema
  ), {
    3: { Achieved: true, UnlockTime: 0, name: '3' },
    32: { Achieved: true, UnlockTime: 0, name: '32' },
    38: { Achieved: true, UnlockTime: 0, name: '38' },
    66: { Achieved: true, UnlockTime: 0, name: '66' },
  });
  assert.deepEqual(local, {});
});
