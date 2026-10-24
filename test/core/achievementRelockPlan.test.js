'use strict';

/*
  When a relock is refused, and what it does beside the save: AW Next's own baselines, manual
  unlocks, the registry and the backup that undoes all of it.
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

// Appids no real install uses, since a Uplay plan also probes the user's own save roots.
const APPID = '999999901';

function tempProfile() {
  const dir = makeTempDir('aw-relock-plan-');
  achievementReset.setUserDataPath(dir);
  manualUnlock.setUserDataPath(dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function goldberg(profile, appid = APPID) {
  const dir = path.join(profile, 'GSE Saves', appid);
  write(path.join(dir, 'achievements.json'), JSON.stringify({ ACH_X: { earned: true, earned_time: 1700000000 }, ACH_Y: { earned: true, earned_time: 1700000100 } }));
  return { appid, name: 'Demo', source: 'Goldberg', dataPaths: [{ source: 'Goldberg', path: dir }] };
}

function fakeRegistry(values) {
  return {
    names: (key) => Object.keys(values[key] || {}),
    subkeys: (key) => [...new Set(Object.keys(values).filter((name) => name.startsWith(`${key}/`)).map((name) => name.slice(key.length + 1).split('/')[0]))],
    read: (key, name) => (values[key] || {})[name] ?? null,
    write: (key, name, value) => {
      values[key] = { ...values[key], [name]: value };
    },
  };
}

const reasonOf = (plan) => plan.refusal && plan.refusal.reason;

test('a running game, or one whose state is unknown, is refused', () => {
  const game = goldberg(tempProfile());
  assert.equal(reasonOf(relock.plan(game, 'ACH_X', { gameRunning: true })), 'running');
  assert.equal(reasonOf(relock.plan(game, 'ACH_X', {})), 'running-unknown');
});

test('a platform that owns its unlocks is refused, merged or not', () => {
  const profile = tempProfile();
  assert.equal(reasonOf(relock.plan({ appid: '620', source: 'Steam (Demo)' }, 'ACH_X', { gameRunning: false })), 'official');
  const merged = goldberg(profile);
  merged.dataPaths.push({ source: 'GOG Galaxy', path: profile });
  assert.equal(reasonOf(relock.plan(merged, 'ACH_X', { gameRunning: false })), 'official');
});

test('formats that cannot be edited one entry at a time are refused, naming the format', () => {
  const profile = tempProfile();
  const folder = (name, files) => {
    const dir = path.join(profile, name);
    for (const [file, content] of Object.entries(files)) write(path.join(dir, file), content);
    return { appid: APPID, source: name, dataPaths: [{ source: name, path: dir }] };
  };
  const sse = relock.plan(folder('SmartSteamEmu', { 'stats.bin': Buffer.alloc(28) }), 'ACH_X', { gameRunning: false });
  assert.deepEqual([sse.refusal.reason, sse.refusal.format], ['unsupported', 'smartsteamemu']);
  assert.equal(relock.plan(folder('Skidrow', { 'achieve.dat': '[ACHIEVE_DATA]\nACH_X=1\n' }), 'ACH_X', { gameRunning: false }).refusal.format, 'skidrow');
  assert.equal(relock.plan(folder('StatsOnly', { 'stats.json': '{"kills":{"value":10}}' }), 'ACH_X', { gameRunning: false }).refusal.format, 'stats-json');
  assert.equal(relock.plan({ appid: 'ps4-demo', source: 'PS4 Recomp', dataPaths: [{ source: 'PS4 Recomp', path: profile }] }, '1', { gameRunning: false }).refusal.format, 'ps4-recomp');
});

test('a save that does not parse makes the plan uncertain instead of being guessed at', () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'trophy', 'NPWR00002_00');
  write(path.join(dir, 'TROPUSR.DAT'), Buffer.from('not a trophy file'));
  const plan = relock.plan({ appid: 'NPWR00002_00', source: 'RPCS3 Emulator', dataPaths: [{ source: 'RPCS3 Emulator', path: dir }] }, '1', { gameRunning: false });
  assert.equal(plan.refusal.reason, 'uncertain');
  assert.equal(plan.refusal.file, path.join(dir, 'TROPUSR.DAT'));
});

test('an achievement no save holds unlocked is refused as nothing to do', () => {
  const game = goldberg(tempProfile());
  assert.equal(reasonOf(relock.plan(game, 'ACH_NEVER', { gameRunning: false })), 'nothing');
});

test('registry unlocks are refused outside Windows: a Wine prefix is not edited', () => {
  tempProfile();
  const plan = relock.plan({ appid: APPID, source: 'GreenLuma 2024' }, 'ACH_X', { gameRunning: false, platform: 'linux' });
  assert.equal(reasonOf(plan), 'registry-prefix');
});

test('GreenLuma and LumaPlay values go to 0 and come back on restore', () => {
  tempProfile();
  const glKey = `SOFTWARE/GL2024/AppID/${APPID}/Achievements`;
  const values = { [glKey]: { ACH_X: 1, ACH_X_Time: 1700000000, ACH_Y: 1, ACH_Y_Time: 1700000100 } };
  const registry = fakeRegistry(values);
  const plan = relock.plan({ appid: APPID, source: 'GreenLuma 2024' }, 'ach_x', { gameRunning: false, platform: 'win32', registry });
  assert.equal(plan.refusal, null);
  const result = relock.run(plan, { gameRunning: false, registry });
  assert.deepEqual(values[glKey], { ACH_X: 0, ACH_X_Time: 0, ACH_Y: 1, ACH_Y_Time: 1700000100 });
  achievementReset.restore(APPID, result.backupId, { registry });
  assert.deepEqual(values[glKey], { ACH_X: 1, ACH_X_Time: 1700000000, ACH_Y: 1, ACH_Y_Time: 1700000100 });

  const lumaKey = 'SOFTWARE/LumaPlay/player/12345/Achievements';
  const luma = { [lumaKey]: { ACH_7: 1, ACH_8: 1 } };
  const lumaRegistry = fakeRegistry(luma);
  relock.run(relock.plan({ appid: 'UPLAY12345', source: 'Lumaplay' }, '7', { gameRunning: false, platform: 'win32', registry: lumaRegistry }), { gameRunning: false, registry: lumaRegistry });
  assert.deepEqual(luma[lumaKey], { ACH_7: 0, ACH_8: 1 });
});

test('the Watchdog baseline and the manual unlock follow the save, and come back with it', () => {
  const profile = tempProfile();
  const game = goldberg(profile);
  const db = write(path.join(profile, 'steam_cache', 'data', `${APPID}.db`), JSON.stringify([{ name: 'ACH_X', Achieved: true, UnlockTime: 1700000000 }, { name: 'ACH_Y', Achieved: true, UnlockTime: 1700000100 }]));
  const dbBefore = fs.readFileSync(db);
  manualUnlock.saveUpdate(APPID, 'Goldberg', 'ACH_X', 'mark-unlocked');

  const plan = relock.plan(game, 'ACH_X', { gameRunning: false });
  assert.equal(plan.manual, 'ACH_X');
  assert.ok(plan.edits.some((edit) => edit.path === db && edit.kind === 'state'));
  const result = relock.run(plan, { gameRunning: false });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(db, 'utf8')), [
    { name: 'ACH_X', Achieved: false, UnlockTime: 0 },
    { name: 'ACH_Y', Achieved: true, UnlockTime: 1700000100 },
  ]);
  assert.equal(manualUnlock.readMap(manualUnlock.sidecarFile())[manualUnlock.gameKey(APPID, 'Goldberg')], undefined);

  const backups = achievementReset.listBackups(APPID);
  assert.equal(backups[0].id, result.backupId, 'the relock is listed with the resets');
  achievementReset.restore(APPID, result.backupId);
  assert.deepEqual(fs.readFileSync(db), dbBefore);
  assert.ok(manualUnlock.readMap(manualUnlock.sidecarFile())[manualUnlock.gameKey(APPID, 'Goldberg')].ACH_X);
});

test('two relocks within a second keep two backups', () => {
  const profile = tempProfile();
  const game = goldberg(profile);
  const now = new Date(2026, 9, 24, 12, 0, 0);
  const first = relock.run(relock.plan(game, 'ACH_X', { gameRunning: false }), { gameRunning: false, now });
  const second = relock.run(relock.plan(game, 'ACH_Y', { gameRunning: false }), { gameRunning: false, now });
  assert.notEqual(first.backupDir, second.backupDir);
  assert.equal(achievementReset.listBackups(APPID).length, 2);
});

test('a Uplay R2 save keyed by objective id is relocked under the Steam api-name', () => {
  const profile = tempProfile();
  const saveDir = path.join(profile, 'uplay-save');
  const file = write(path.join(saveDir, 'achievements.json'), JSON.stringify({ 1: { earned: 1, earned_time: 1700000000 }, 2: { earned: 1, earned_time: 1700000100 } }));
  const game = {
    appid: '999999902',
    source: 'Uplay R2',
    uplayR2: true,
    gameDir: path.join(profile, 'game'),
    achievement: { list: [{ name: 'UBI_ACH_1' }, { name: 'UBI_ACH_2' }] },
    dataPaths: [{ source: 'Uplay R2', path: saveDir }],
  };
  fs.mkdirSync(game.gameDir, { recursive: true });
  const plan = relock.plan(game, 'UBI_ACH_1', { gameRunning: false });
  assert.equal(plan.refusal, null, JSON.stringify(plan.refusal));
  relock.run(plan, { gameRunning: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { 1: { earned: 0, earned_time: 0 }, 2: { earned: 1, earned_time: 1700000100 } });
});

test('a game known only from the Watchdog cache is relocked there', () => {
  const profile = tempProfile();
  const db = write(path.join(profile, 'steam_cache', 'data', '999999903.db'), JSON.stringify([{ name: 'ACH_X', Achieved: true, UnlockTime: 5 }]));
  const plan = relock.plan({ appid: '999999903', source: 'Achievement Watcher : Watchdog' }, 'ACH_X', { gameRunning: false });
  assert.equal(plan.refusal, null);
  relock.run(plan, { gameRunning: false });
  assert.equal(JSON.parse(fs.readFileSync(db, 'utf8'))[0].Achieved, false);
});
