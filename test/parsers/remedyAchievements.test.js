'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const remedy = require('../../app/util/remedyAchievements.js');

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
