'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { statsSiblingFile } = require('../util/statsSibling.js');
const { SAVE_ROOTS } = require('../../app/parser/emuSaveRoots.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-stats-sibling-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the OnlineFix root also hears Stats.ini, read through the achievement list beside it (#231)', () => {
  const onlineFix = SAVE_ROOTS.find((row) => row.dir.join('/') === 'Documents/OnlineFix');
  assert.ok(onlineFix, 'the OnlineFix root exists');
  assert.equal(onlineFix.watch.statsSibling, true);
  const files = onlineFix.watch.file.map((name) => name.toLowerCase());
  assert.ok(files.includes('stats.ini'));
  assert.ok(files.includes('achievements.ini'));
});

test('a Stats.ini change is read through the Achievements.ini OnlineFix writes beside it, even empty', (t) => {
  const stats = path.join(tempDir(t), '2483190', 'Stats');
  fs.mkdirSync(stats, { recursive: true });
  fs.writeFileSync(path.join(stats, 'Achievements.ini'), '');
  fs.writeFileSync(path.join(stats, 'Stats.ini'), '[Stats]\nstat_1=100\n');
  const sibling = statsSiblingFile(path.join(stats, 'Stats.ini'));
  assert.ok(sibling);
  assert.equal(path.dirname(sibling), stats);
  assert.equal(path.basename(sibling).toLowerCase(), 'achievements.ini');
});

test('a stats.ini with no achievement list beside it is left alone', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'stats.ini'), '[UserStats]\nkills=3\n');
  assert.equal(statsSiblingFile(path.join(dir, 'stats.ini')), null);
});
