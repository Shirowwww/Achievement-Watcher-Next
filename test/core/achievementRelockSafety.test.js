'use strict';

/*
  What keeps a relock or a reset from leaving a save half changed: all or nothing, a manifest on disk
  from the first write, other entries kept byte for byte, and each edit kept to the files and keys
  that belong to the game.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const appDir = path.join(__dirname, '..', '..', 'app');
const targets = require(path.join(appDir, 'util', 'achievementResetTargets.js'));
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const relock = require(path.join(appDir, 'parser', 'achievementRelock.js'));
const extras = require(path.join(appDir, 'parser', 'achievementSaveExtras.js'));
const markerpatch = require(path.join(appDir, 'parser', 'markerpatch.js'));

const APPID = '999999921';

function tempProfile() {
  const dir = makeTempDir('aw-relock-safety-');
  achievementReset.setUserDataPath(dir);
  manualUnlock.setUserDataPath(dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function goldberg(profile, content) {
  const dir = path.join(profile, 'GSE Saves', APPID);
  const save = write(path.join(dir, 'achievements.json'), content || JSON.stringify({ ACH_X: { earned: true, earned_time: 1700000000 }, ACH_Y: { earned: true, earned_time: 1700000100 } }));
  return { save, dir, game: { appid: APPID, name: 'Demo', source: 'Goldberg', dataPaths: [{ source: 'Goldberg', path: dir }] } };
}

function fakeRegistry(values, writes = []) {
  return {
    names: (key) => Object.keys(values[key] || {}),
    subkeys: (key) => [...new Set(Object.keys(values).filter((name) => name.startsWith(`${key}/`)).map((name) => name.slice(key.length + 1).split('/')[0]))],
    read: (key, name) => (values[key] || {})[name] ?? null,
    write: (key, name, value, type) => {
      writes.push({ key, name, value, type });
      values[key] = { ...values[key], [name]: value };
    },
  };
}

const latestManifest = (appid) => {
  const root = achievementReset.gameBackupRoot(appid);
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).sort() : [];
  const file = dirs.length ? path.join(root, dirs[dirs.length - 1], 'manifest.json') : '';
  return file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

const failingEdit = (file) => ({ path: file, format: 'json', kind: 'save', source: 'Goldberg', steps: [() => { throw new Error('disk full'); }] });

test('relock: a save that fails puts back the ones already edited and leaves AW state alone', () => {
  const profile = tempProfile();
  const { save, game } = goldberg(profile);
  const other = write(path.join(profile, 'other', 'achievements.json'), '{"ACH_X":{"earned":true}}');
  const db = write(path.join(profile, 'steam_cache', 'data', `${APPID}.db`), JSON.stringify([{ name: 'ACH_X', Achieved: true, UnlockTime: 1700000000 }]));
  manualUnlock.saveUpdate(APPID, 'Goldberg', 'ACH_X', 'mark-unlocked');
  const before = [save, db].map((file) => fs.readFileSync(file));

  const plan = relock.plan(game, 'ACH_X', { gameRunning: false });
  assert.equal(plan.refusal, null);
  plan.edits.push(failingEdit(other));
  const result = relock.run(plan, { gameRunning: false });

  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.equal(result.errors[0].path, other);
  assert.deepEqual([save, db].map((file) => fs.readFileSync(file)), before, 'the save is back and the .db never moved');
  assert.ok(manualUnlock.readMap(manualUnlock.sidecarFile())[manualUnlock.gameKey(APPID, 'Goldberg')].ACH_X, 'the manual unlock stays');
  assert.ok(fs.existsSync(path.join(result.backupDir, 'manifest.json')), 'the backup stays on disk');
});

test('reset: a file that fails puts back the ones already cleared and keeps the baselines', () => {
  const profile = tempProfile();
  const { save, dir, game } = goldberg(profile);
  const db = write(path.join(profile, 'steam_cache', 'data', `${APPID}.db`), '[{"name":"ACH_X","Achieved":true}]');
  const plan = achievementReset.plan(game);
  plan.files.push({ path: path.join(dir, 'gone.json'), action: targets.ACTION.DELETE, source: 'Goldberg' });
  const before = fs.readFileSync(save);

  const result = achievementReset.run(plan);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].stage, 'backup');
  assert.deepEqual(fs.readFileSync(save), before, 'the cleared save is back');
  assert.ok(fs.existsSync(db), 'the Watchdog baseline is only emptied once every save is');
});

test('relock JSON: every other entry keeps its exact bytes, escapes and non-ASCII names included', () => {
  const profile = tempProfile();
  const original = '{\n  "ACH_X": {"earned": true, "earned_time": 1700000000},\n  "ACH_\\u00e9": {"earned": true, "earned_time": 1700000100},\n  "ACH_ét中": {"earned" : true,"earned_time":1.7e9}\n}\n';
  const { save, game } = goldberg(profile, Buffer.from(original, 'utf8'));
  relock.run(relock.plan(game, 'ACH_X', { gameRunning: false }), { gameRunning: false });
  assert.equal(fs.readFileSync(save, 'utf8'), original.replace('{"earned": true, "earned_time": 1700000000}', '{"earned": false, "earned_time": 0}'));

  relock.run(relock.plan(game, 'ACH_ét中', { gameRunning: false }), { gameRunning: false });
  assert.match(fs.readFileSync(save, 'utf8'), /"ACH_ét中": \{"earned" : false,"earned_time":0\}/);
  relock.run(relock.plan(game, 'ACH_é', { gameRunning: false }), { gameRunning: false });
  assert.match(fs.readFileSync(save, 'utf8'), /"ACH_\\u00e9": \{"earned": false, "earned_time": 0\}/);
});

test('relock JSON: a file that is not valid UTF-8 is refused as uncertain', () => {
  const profile = tempProfile();
  const bytes = Buffer.concat([Buffer.from('{"ACH_X":{"earned":true},"ACH_'), Buffer.from([0xe9]), Buffer.from('":{"earned":true}}')]);
  const { game } = goldberg(profile, bytes);
  assert.equal(relock.plan(game, 'ACH_X', { gameRunning: false }).refusal.reason, 'uncertain');
});

test('relock: run refuses a game that started, or a state it cannot know, and touches nothing', () => {
  const profile = tempProfile();
  const { save, game } = goldberg(profile);
  const before = fs.readFileSync(save);
  const plan = relock.plan(game, 'ACH_X', { gameRunning: false });
  assert.deepEqual(relock.run(plan, { gameRunning: true }).refusal, { reason: 'running' });
  assert.deepEqual(relock.run(plan).refusal, { reason: 'running-unknown' });
  assert.deepEqual(fs.readFileSync(save), before);
  assert.equal(achievementReset.listBackups(APPID).length, 0);
});

test('KytyPS5: only the active user\'s unlock file is edited', () => {
  const profile = tempProfile();
  write(path.join(profile, 'Kyty.ini'), '[GlobalConfiguration]\nuser_id=2\n');
  const dir = path.join(profile, '_Trophies', 'PPSA00002');
  const content = '{"unlockedTrophies":[3],"unlockedAt":{"3":638500000000000001}}';
  const first = write(path.join(dir, 'trophies_1_0.json'), content);
  const second = write(path.join(dir, 'trophies_2_0.json'), content);
  const plan = relock.plan({ appid: 'PPSA00002', source: 'KytyPS5 Emulator', dataPaths: [{ source: 'KytyPS5 Emulator', path: dir }] }, '3', { gameRunning: false });
  assert.equal(plan.refusal, null);
  relock.run(plan, { gameRunning: false });
  assert.equal(fs.readFileSync(first, 'utf8'), content, 'user 1 is not the one the launcher runs');
  assert.equal(fs.readFileSync(second, 'utf8'), '{"unlockedTrophies":[],"unlockedAt":{}}');
});

test('registry: a game takes only the key family of its own source', () => {
  const glKey = 'SOFTWARE/GL2024/AppID/999999922/Achievements';
  const lumaKey = 'SOFTWARE/LumaPlay/player/777/Achievements';
  const registry = fakeRegistry({ [glKey]: { ACH_X: 1 }, [lumaKey]: { ACH_1: 1 } });
  const keysOf = (game) => extras.registryKeys(game, registry).map((entry) => entry.key);
  assert.deepEqual(keysOf({ appid: '999999922', source: 'GreenLuma 2024', uplayId: '777' }), [glKey]);
  assert.deepEqual(keysOf({ appid: 'UPLAY777', steamappid: '999999922', source: 'Lumaplay' }), [lumaKey]);
});

test('registry: a value kept as a string is zeroed and restored as a string', () => {
  tempProfile();
  const key = 'SOFTWARE/GL2024/AppID/999999923/Achievements';
  const values = { [key]: { ACH_X: '1', ACH_X_Time: '1700000000', ACH_Y: 1 } };
  const writes = [];
  const registry = fakeRegistry(values, writes);
  const game = { appid: '999999923', source: 'GreenLuma 2024' };
  const result = relock.run(relock.plan(game, 'ACH_X', { gameRunning: false, platform: 'win32', registry }), { gameRunning: false, registry });
  assert.deepEqual(values[key], { ACH_X: '0', ACH_X_Time: '0', ACH_Y: 1 });
  assert.deepEqual(writes.map((entry) => entry.type), ['REG_SZ', 'REG_SZ']);
  achievementReset.restore('999999923', result.backupId, { registry });
  assert.deepEqual(values[key], { ACH_X: '1', ACH_X_Time: '1700000000', ACH_Y: 1 });

  const reset = achievementReset.run(achievementReset.plan(game, { registry, platform: 'win32' }), { registry });
  assert.deepEqual(values[key], { ACH_X: '0', ACH_X_Time: '0', ACH_Y: 0 });
  achievementReset.restore('999999923', reset.backupId, { registry });
  assert.deepEqual(values[key], { ACH_X: '1', ACH_X_Time: '1700000000', ACH_Y: 1 });
});

test('relock: the manifest is on disk before the second file is touched', () => {
  const profile = tempProfile();
  const { save, game } = goldberg(profile);
  write(path.join(profile, 'steam_cache', 'data', `${APPID}.db`), JSON.stringify([{ name: 'ACH_X', Achieved: true, UnlockTime: 1 }]));
  const plan = relock.plan(game, 'ACH_X', { gameRunning: false });
  let seen = null;
  const later = plan.edits.find((edit) => edit.kind === 'state');
  later.steps.push((buffer) => {
    seen = latestManifest(APPID);
    return { buffer, changed: false };
  });
  relock.run(plan, { gameRunning: false });
  assert.deepEqual(seen && seen.files.map((entry) => entry.original), [save]);
});

test('reset: the manifest lists each file before it is cleared', (t) => {
  const profile = tempProfile();
  const { dir, game } = goldberg(profile);
  write(path.join(dir, 'stats', 'kills'), Buffer.from([1, 0, 0, 0]));
  const unlink = fs.unlinkSync;
  const listed = [];
  t.mock.method(fs, 'unlinkSync', (file) => {
    const manifest = latestManifest(APPID);
    listed.push(!!manifest && manifest.files.some((entry) => entry.original === file));
    return unlink(file);
  });
  achievementReset.run(achievementReset.plan(game));
  assert.deepEqual(listed, [true, true]);
});

test('RAZOR1911 `achievement` is a save only in a RAZOR1911 root', () => {
  assert.equal(targets.resetActionFor('achievement', 'Razor1911'), targets.ACTION.DELETE);
  assert.equal(targets.resetActionFor('achievement', 'Goldberg'), null);
  assert.equal(relock.formatFor('achievement', 'Razor1911'), 'razor');
  assert.equal(relock.formatFor('achievement', 'Goldberg'), null);
});

test('reset: only the stats folder of the game\'s own save dir goes', () => {
  const profile = tempProfile();
  const { dir, game } = goldberg(profile);
  const own = write(path.join(dir, 'stats', 'kills'), Buffer.from([1, 0, 0, 0]));
  write(path.join(dir, 'remote', 'achievements.json'), '{}');
  const nested = write(path.join(dir, 'remote', 'stats', 'kills'), Buffer.from([2, 0, 0, 0]));
  const files = achievementReset.plan(game).files.map((entry) => entry.path);
  assert.ok(files.includes(own));
  assert.ok(!files.includes(nested));
});

test('reset: MarkerPatch settings.txt is replaced atomically, never rewritten in place', (t) => {
  const profile = tempProfile();
  const markerFile = write(path.join(profile, 'marker', 'settings.txt'), 'Controls.AcL.X = 3\nControls.AcL.Y = 0\n');
  t.mock.method(markerpatch, 'stateFilePaths', () => [markerFile]);
  const writeFileSync = fs.writeFileSync;
  const direct = [];
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    if (file === markerFile) direct.push(file);
    return writeFileSync(file, ...rest);
  });
  achievementReset.run(achievementReset.plan({ appid: markerpatch.APPID, source: 'MarkerPatch', dataPaths: [{ source: 'MarkerPatch', path: path.join(profile, 'game') }] }));
  assert.equal(fs.readFileSync(markerFile, 'utf8'), 'Controls.AcL.X = 0\nControls.AcL.Y = 0\n');
  assert.deepEqual(direct, []);
});
