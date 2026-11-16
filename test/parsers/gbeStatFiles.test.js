'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gbeStatFiles = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeStatFiles.js'));
const statProgress = require(path.join(__dirname, '..', '..', 'app', 'parser', 'statProgress.js'));

const int32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n, 0);
  return b;
};
const float32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(n, 0);
  return b;
};

function saveFolder(t, stats) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-stats-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'stats'));
  for (const [name, buffer] of Object.entries(stats)) fs.writeFileSync(path.join(dir, 'stats', name), buffer);
  return dir;
}

const link = (name, stat, max = 100) => ({ name, progress: { min_val: 0, max_val: max, value: { operation: 'statvalue', operand1: stat } } });

test('a stat file is read as the type stats.json declares, else as an int unless that is implausible', () => {
  assert.equal(gbeStatFiles.decodeStat(int32(37), 'int'), 37);
  assert.equal(gbeStatFiles.decodeStat(float32(37.5), 'float'), 37.5);
  assert.equal(gbeStatFiles.decodeStat(int32(37), undefined), 37);
  assert.equal(gbeStatFiles.decodeStat(float32(37), undefined), 37);
  assert.equal(gbeStatFiles.decodeStat(Buffer.alloc(8), undefined), null);
  // A large undeclared int is not a float whose bits happen to read as one.
  assert.equal(gbeStatFiles.decodeStat(int32(12000000), undefined), 12000000);
});

test('a stat named like an Object property is still read', (t) => {
  const dir = saveFolder(t, { constructor: int32(40) });
  assert.deepEqual(gbeStatFiles.readStatValues([dir], ['constructor']), { constructor: 40 });
});

// #168: the game wrote the counter's stat before it was tied to its achievement, so achievements.json
// has no progress for it; the stat file holds the value.
test('a counter with no progress in achievements.json takes the value of its stat file', (t) => {
  const dir = saveFolder(t, { rmostat_rank_rmo_ach_30: int32(37) });
  const root = { ACH_30: { earned: false, earned_time: 0 } };
  const schema = [link('ACH_30', 'rmostat_rank_rmo_ach_30')];
  assert.equal(gbeStatFiles.addSavedStats(root, { folders: [dir], schema }), 1);
  statProgress.applyLocalStatProgress(root, schema);
  assert.equal(root.ACH_30.CurProgress, 37);
  assert.deepEqual(root.__rawStatKeys, ['rmostat_rank_rmo_ach_30']);
});

// GBE writes progress only when the stat changes, so the json can lag behind the stat file.
test('a stat file further on than the progress achievements.json recorded wins', (t) => {
  const dir = saveFolder(t, { rmostat_rank_rmo_ach_30: int32(55) });
  const root = { ACH_30: { earned: false, progress: 40, max_progress: 100 } };
  const schema = [link('ACH_30', 'rmostat_rank_rmo_ach_30')];
  gbeStatFiles.addSavedStats(root, { folders: [dir], schema });
  statProgress.applyLocalStatProgress(root, schema);
  assert.equal(root.ACH_30.CurProgress, 55);
});

test('a recorded progress further on than the stat file is kept', (t) => {
  const dir = saveFolder(t, { rmostat_rank_rmo_ach_30: int32(20) });
  const root = { ACH_30: { earned: false, progress: 40, max_progress: 100 } };
  const schema = [link('ACH_30', 'rmostat_rank_rmo_ach_30')];
  gbeStatFiles.addSavedStats(root, { folders: [dir], schema });
  statProgress.applyLocalStatProgress(root, schema);
  assert.notEqual(root.ACH_30.CurProgress, 20);
});

// The game's own appid folder and a Steam shortcut's id folder each keep the stats written while the
// game was started that way.
test('the highest value across the save folders of one game wins', (t) => {
  const own = saveFolder(t, { a: int32(12), b: int32(80) });
  const shortcut = saveFolder(t, { a: int32(40) });
  assert.deepEqual(gbeStatFiles.readStatValues([own, shortcut], ['A', 'b']), { a: 40, b: 80 });
});

test('stats.json types are honoured', (t) => {
  const dir = saveFolder(t, { ratio: float32(0.5) });
  const settings = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-settings-'));
  t.after(() => fs.rmSync(settings, { recursive: true, force: true }));
  fs.writeFileSync(path.join(settings, 'stats.json'), JSON.stringify([{ name: 'Ratio', type: 'float', default: '0' }]));
  assert.deepEqual(gbeStatFiles.readStatValues([dir], ['ratio'], gbeStatFiles.declaredStatTypes(settings)), { ratio: 0.5 });
});

test('nothing is added without a progress schema or a stats folder', (t) => {
  const root = {};
  assert.equal(gbeStatFiles.addSavedStats(root, { folders: [], schema: [link('ACH_1', 'x')] }), 0);
  const dir = saveFolder(t, {});
  assert.equal(gbeStatFiles.addSavedStats(root, { folders: [dir], schema: [] }), 0);
  assert.equal(root.__rawStatKeys, undefined);
});
