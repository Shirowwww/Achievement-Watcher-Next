'use strict';

/*
  Relocking several achievements at once (rows picked with Ctrl or Shift in the game view): one
  plan, one backup and one confirmation, where each save file is edited once for all of them.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const appDir = path.join(__dirname, '..', '..', 'app');
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const relock = require(path.join(appDir, 'parser', 'achievementRelock.js'));

const SOURCE = 'Goldberg';

function gseGame(save) {
  const profile = makeTempDir('aw-relock-many-');
  achievementReset.setUserDataPath(profile);
  manualUnlock.setUserDataPath(profile);
  const dir = path.join(profile, 'GSE Saves', '480');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'achievements.json');
  fs.writeFileSync(file, JSON.stringify(save, null, 2));
  const game = { appid: '480', name: 'Spacewar', source: SOURCE, achievement: { list: [] }, dataPaths: [{ source: SOURCE, path: dir }] };
  return { game, file };
}

const unlocked = (time) => ({ earned: true, earned_time: time });
const readSave = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('several achievements of one save are relocked in one run, the others kept', () => {
  const { game, file } = gseGame({ ACH_A: unlocked(100), ACH_B: unlocked(200), ACH_C: unlocked(300) });
  const original = fs.readFileSync(file);
  const plan = relock.planMany(game, ['ACH_A', 'ACH_C'], { gameRunning: false });
  assert.equal(plan.refusal, null, JSON.stringify(plan.refusal));
  assert.deepEqual(plan.achievements, ['ACH_A', 'ACH_C']);
  assert.equal(plan.edits.filter((edit) => edit.path === file).length, 1, 'the save is edited once');

  const result = relock.run(plan, { gameRunning: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  const after = readSave(file);
  assert.ok(!(after.ACH_A && after.ACH_A.earned), 'ACH_A is locked');
  assert.ok(!(after.ACH_C && after.ACH_C.earned), 'ACH_C is locked');
  assert.deepEqual(after.ACH_B, unlocked(200), 'ACH_B is untouched');

  const restored = achievementReset.restore('480', result.backupId);
  assert.deepEqual(restored.errors, []);
  assert.deepEqual(fs.readFileSync(file), original, 'one backup brings both back');
});

test('an achievement no save records as unlocked is skipped, not a reason to refuse the rest', () => {
  const { game } = gseGame({ ACH_A: unlocked(100) });
  const plan = relock.planMany(game, ['ACH_A', 'ACH_GONE'], { gameRunning: false });
  assert.equal(plan.refusal, null);
  assert.deepEqual(plan.achievements, ['ACH_A']);
  assert.deepEqual(plan.skipped, ['ACH_GONE']);
  // The confirmation reads these as lists whatever is left once the others are skipped.
  assert.ok(Array.isArray(plan.stats), 'stats is a list');
  assert.ok(Array.isArray(plan.manual), 'manual is a list');
});

test('nothing to relock among all of them is refused like a single one', () => {
  const { game } = gseGame({ ACH_A: { earned: false, earned_time: 0 } });
  assert.equal(relock.planMany(game, ['ACH_A', 'ACH_B'], { gameRunning: false }).refusal.reason, 'nothing');
});

test('a running game refuses the whole batch', () => {
  const { game } = gseGame({ ACH_A: unlocked(100), ACH_B: unlocked(200) });
  assert.equal(relock.planMany(game, ['ACH_A', 'ACH_B'], { gameRunning: true }).refusal.reason, 'running');
});

test('the manual unlocks of every relocked achievement are cleared, a manual-only one is skipped', () => {
  const { game, file } = gseGame({ ACH_A: unlocked(100), ACH_B: unlocked(200) });
  manualUnlock.saveUpdate('480', SOURCE, 'ACH_A', 'mark-unlocked');
  manualUnlock.saveUpdate('480', SOURCE, 'ACH_B', 'mark-unlocked');
  manualUnlock.saveUpdate('480', SOURCE, 'ACH_C', 'mark-unlocked');
  const plan = relock.planMany(game, ['ACH_A', 'ACH_B', 'ACH_C'], { gameRunning: false });
  assert.equal(plan.refusal, null, JSON.stringify(plan.refusal));
  assert.deepEqual(plan.skipped, ['ACH_C'], 'no save records ACH_C: clearing its manual unlock is the other menu entry');
  const result = relock.run(plan, { gameRunning: false });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const left = manualUnlock.readMap(manualUnlock.sidecarFile())[manualUnlock.gameKey('480', SOURCE)] || {};
  assert.deepEqual(Object.keys(left), ['ACH_C'], 'only the skipped one keeps its manual unlock');
  const after = readSave(file);
  assert.ok(!(after.ACH_A || {}).earned && !(after.ACH_B || {}).earned);
});

test('a single name through planMany is the same plan as plan()', () => {
  const { game } = gseGame({ ACH_A: unlocked(100) });
  const one = relock.plan(game, 'ACH_A', { gameRunning: false });
  const many = relock.planMany(game, ['ACH_A'], { gameRunning: false });
  assert.equal(many.achievement, one.achievement);
  assert.deepEqual(many.edits.map((edit) => edit.path), one.edits.map((edit) => edit.path));
});
