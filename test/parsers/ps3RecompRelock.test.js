'use strict';

/*
  Resetting or relocking a PS3Recomp port edits gamedata/trophies/<NPWRnnnnn>.json, the file the
  runtime reads back when the game registers its trophy context: a missing file reads as nothing
  unlocked, and the reader takes one trophy per line. Before, the reset reported success after
  deleting nothing and the relock said no save held the trophy.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const relock = require(path.join(appDir, 'parser', 'achievementRelock.js'));
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));
const ps3Recomp = require(path.join(appDir, 'parser', 'ps3Recomp.js'));

const RUNTIME_FILE = '{\n  "trophies": [\n    { "id": 1, "timestamp": 1793643005 },\n    { "id": 2, "timestamp": 1793643100 }\n  ]\n}\n';

function port(t, content = RUNTIME_FILE) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps3-relock-'));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  achievementReset.setUserDataPath(profile);
  manualUnlock.setUserDataPath(profile);
  const dir = path.join(profile, 'simpsons', 'gamedata', 'trophies');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'NPWR00104.json');
  fs.writeFileSync(file, content);
  const game = { appid: 'ps3recomp-NPWR00104_00', name: 'Test Odyssey', source: 'PS3 Recomp', dataPath: dir, dataPaths: [{ source: 'PS3 Recomp', path: dir }] };
  return { game, file };
}

// What the runtime's trophy_load() keeps from a file: an "id" per line.
function runtimeReads(content) {
  return content.split('\n').map((line) => /"id":\s*(\d+)/.exec(line)).filter(Boolean).map((match) => Number(match[1]));
}

test("a reset deletes the port's unlock file and puts it back on restore", (t) => {
  const { game, file } = port(t);
  const plan = achievementReset.plan(game);
  assert.equal(plan.supported, true);
  assert.deepEqual(plan.files.map((entry) => entry.path), [file]);
  const result = achievementReset.run(plan);
  assert.deepEqual(result.errors, []);
  assert.equal(fs.existsSync(file), false);
  achievementReset.restore(game.appid, result.backupId);
  assert.equal(fs.readFileSync(file, 'utf8'), RUNTIME_FILE);
});

test('a relock rewrites the unlock file without that trophy, in the lines the runtime reads', (t) => {
  const { game, file } = port(t);
  const plan = relock.plan(game, '1', { gameRunning: false });
  assert.equal(plan.refusal || null, null, JSON.stringify(plan.refusal));
  const result = relock.run(plan, { gameRunning: false });
  assert.deepEqual(result.errors, []);
  const after = fs.readFileSync(file, 'utf8');
  assert.deepEqual(runtimeReads(after), [2]);
  assert.deepEqual(JSON.parse(after), { trophies: [{ id: 2, timestamp: 1793643100 }] });
});

test('the rewritten file keeps the layout the runtime itself writes', () => {
  const { text, changed } = ps3Recomp.relockUnlocks(RUNTIME_FILE, 2);
  assert.equal(changed, true);
  assert.equal(text, '{\n  "trophies": [\n    { "id": 1, "timestamp": 1793643005 }\n  ]\n}\n');
  assert.equal(ps3Recomp.relockUnlocks(RUNTIME_FILE, 7).changed, false);
});

test('a trophy the file does not hold is nothing to relock', (t) => {
  const { game } = port(t);
  assert.equal(relock.plan(game, '0', { gameRunning: false }).refusal.reason, 'nothing');
});

test('an unlock file that is not the JSON the runtime writes makes the relock uncertain', (t) => {
  const { game, file } = port(t, '{ "trophies": [ { "id": 1, ');
  const plan = relock.plan(game, '1', { gameRunning: false });
  assert.equal(plan.refusal.reason, 'uncertain');
  assert.equal(plan.refusal.file, file);
});
