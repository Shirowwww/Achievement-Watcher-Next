'use strict';

/*
  #232: a GBE counter moving writes only <save>/stats/<name>. Every GBE root the Watchdog watches
  must read that change through the achievements.json beside it, and the read must count a stat at
  its goal as an unlock, as the library does, since GBE itself never turns it into one when the
  stat got there before its link.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const monitor = require('../monitor.js');
const { saveFileFor } = require('../../app/parser/emuSaveRoots.js');

const find = (folders, dir) => folders.find((entry) => path.resolve(String(entry.dir || '')).toLowerCase() === path.resolve(dir).toLowerCase());

test('a stat file under any GBE root is read through the save beside it', async () => {
  const redirected = path.resolve(path.sep, 'Games', 'Rune Game', 'saves');
  const entry = find(await monitor.getFolders([], {}, [redirected]), redirected);
  assert.ok(entry, 'the redirected folder must be watched');
  const save = path.join(redirected, '1245620');
  assert.equal(saveFileFor(path.join(save, 'stats', 'kills_total'), entry.options), path.join(save, 'achievements.json'));
});

test('a stat file at its goal reads as an unlock of the achievement tied to it', async (t) => {
  const save = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-goal-watch-'));
  t.after(() => fs.rmSync(save, { recursive: true, force: true }));
  fs.mkdirSync(path.join(save, 'stats'));
  fs.writeFileSync(path.join(save, 'achievements.json'), JSON.stringify({ ACH_19: { earned: false, earned_time: 0, progress: 37, max_progress: 100 } }));
  const value = Buffer.alloc(4);
  value.writeInt32LE(100, 0);
  fs.writeFileSync(path.join(save, 'stats', 'rmostat_rank_rmo_ach_19'), value);
  const schema = [{ name: 'ACH_19', progress: { min_val: 0, max_val: 100, value: { operation: 'statvalue', operand1: 'rmostat_rank_rmo_ach_19' } } }];

  const [entry] = await monitor.parse(path.join(save, 'achievements.json'), { schema });

  assert.equal(entry.name, 'ACH_19');
  assert.equal(entry.Achieved, true);
  assert.equal(entry.CurProgress, 100);
});

// Seen with gbe_fork release-2026_09_27: a stat set with no achievement tied to it writes
// stats/<name> and no achievements.json at all.
test('a GBE save made of stat files alone is read as an empty save with its stats', async (t) => {
  const save = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-goal-watch-'));
  t.after(() => fs.rmSync(save, { recursive: true, force: true }));
  fs.mkdirSync(path.join(save, 'stats'));
  const value = Buffer.alloc(4);
  value.writeInt32LE(10, 0);
  fs.writeFileSync(path.join(save, 'stats', 'stat_kills'), value);
  const schema = [{ name: 'ACH_KILLS', progress: { min_val: 0, max_val: 10, value: { operation: 'statvalue', operand1: 'stat_kills' } } }];
  const file = path.join(save, 'achievements.json');

  const [entry] = await monitor.parse(file, { schema, statsOnly: true });

  assert.equal(entry.name, 'ACH_KILLS');
  assert.equal(entry.Achieved, true);
  await assert.rejects(monitor.parse(file, { schema }), 'a missing save is still an error everywhere else');
});
