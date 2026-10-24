'use strict';

/*
  Relocking one achievement in the Steam-emulator text saves. For every format the same three
  properties: both the app's reader and the Watchdog's read the achievement locked, every other entry
  reads exactly as before, and the backup puts the original bytes back.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const appDir = path.join(__dirname, '..', '..', 'app');
const steam = require(path.join(appDir, 'parser', 'steam.js'));
const { normalizeSaveEntry } = require(path.join(appDir, 'parser', 'achievements.js'))._internal;
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const relock = require(path.join(appDir, 'parser', 'achievementRelock.js'));
const monitor = require(path.join(__dirname, '..', '..', 'watchdog', 'monitor.js'));

function tempProfile() {
  const dir = makeTempDir('aw-relock-');
  achievementReset.setUserDataPath(dir);
  manualUnlock.setUserDataPath(dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// What each reader makes of the save: { NAME: { achieved, time } }, a missing entry reading as locked.
async function readBoth(dir, file, { watchdog = true } = {}) {
  const app = {};
  for (const [key, entry] of Object.entries((await steam.getAchievementsFromFile(dir)) || {})) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const normalized = normalizeSaveEntry(entry, 'steam');
    app[key.toUpperCase()] = { achieved: !!normalized.Achieved, time: Number(normalized.UnlockTime) || 0 };
  }
  const watched = {};
  if (watchdog) {
    for (const entry of await monitor.parse(file)) watched[String(entry.name).toUpperCase()] = { achieved: !!entry.Achieved, time: Number(entry.UnlockTime) || 0 };
  }
  return { app, watchdog: watched };
}

const lockedIn = (reading, name) => !(reading[name] && reading[name].achieved);
const without = (reading, name) => Object.fromEntries(Object.entries(reading).filter(([key]) => key !== name));

async function relockCase({ source, files, saveFile, name = 'ACH_X', watchdog = true, list = [] }) {
  const profile = tempProfile();
  const dir = path.join(profile, 'saves', '480');
  for (const [file, content] of Object.entries(files)) write(path.join(dir, file), content);
  const target = path.join(dir, saveFile);
  const original = fs.readFileSync(target);
  const before = await readBoth(dir, target, { watchdog });
  assert.equal(before.app[name].achieved, true, 'the fixture starts unlocked for the app');
  if (watchdog) assert.equal(before.watchdog[name].achieved, true, 'and for the Watchdog');

  const game = { appid: '480', name: 'Spacewar', source, achievement: { list }, dataPaths: [{ source, path: dir }] };
  const plan = relock.plan(game, name, { gameRunning: false });
  assert.equal(plan.refusal, null, JSON.stringify(plan.refusal));
  const result = relock.run(plan, { gameRunning: false });
  assert.deepEqual(result.errors, []);

  const after = await readBoth(dir, target, { watchdog });
  assert.ok(lockedIn(after.app, name), 'the app reads it locked');
  assert.deepEqual(without(after.app, name), without(before.app, name), 'every other entry reads as before (app)');
  if (watchdog) {
    assert.ok(lockedIn(after.watchdog, name), 'the Watchdog reads it locked');
    assert.deepEqual(without(after.watchdog, name), without(before.watchdog, name), 'every other entry reads as before (Watchdog)');
  }

  const restored = achievementReset.restore('480', result.backupId);
  assert.deepEqual(restored.errors, []);
  assert.deepEqual(fs.readFileSync(target), original, 'the backup gives the original bytes back');
  return { profile, dir, plan, result };
}

test('GSE / Goldberg achievements.json, its stat counter lowered with it', async () => {
  const save = `{\n    "ACH_X": {\n        "earned": true,\n        "earned_time": 1700000000\n    },\n    "ACH_Y": {\n        "earned": true,\n        "earned_time": 1700000100\n    }\n}\n`;
  const profile = tempProfile();
  const settings = write(
    path.join(profile, 'game', 'steam_settings', 'achievements.json'),
    JSON.stringify([{ name: 'ACH_X', progress: { max_val: 10, value: { operation: 'statvalue', operand1: 'kills' } } }])
  );
  const dir = path.join(profile, 'GSE Saves', '480');
  write(path.join(dir, 'achievements.json'), save);
  const statFile = write(path.join(dir, 'stats', 'kills'), Buffer.from([10, 0, 0, 0]));
  const other = write(path.join(dir, 'stats', 'deaths'), Buffer.from([3, 0, 0, 0]));
  const game = { appid: '480', source: 'Goldberg', steamSettings: path.dirname(settings), dataPaths: [{ source: 'Goldberg', path: dir }] };

  const plan = relock.plan(game, 'ACH_X', { gameRunning: false });
  assert.equal(plan.stat, 'kills');
  const result = relock.run(plan, { gameRunning: false });
  assert.deepEqual(result.errors, []);
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'achievements.json'), 'utf8'));
  assert.deepEqual(parsed.ACH_X, { earned: false, earned_time: 0 });
  assert.deepEqual(parsed.ACH_Y, { earned: true, earned_time: 1700000100 });
  assert.match(fs.readFileSync(path.join(dir, 'achievements.json'), 'utf8'), /^\{\n {4}"ACH_X"/, 'indent kept');
  assert.deepEqual([...fs.readFileSync(statFile)], [0, 0, 0, 0]);
  assert.deepEqual([...fs.readFileSync(other)], [3, 0, 0, 0], 'other counters untouched');

  const watched = await monitor.parse(path.join(dir, 'achievements.json'));
  assert.equal(watched.find((entry) => entry.name === 'ACH_X').Achieved, false);
  achievementReset.restore('480', result.backupId);
  assert.equal(fs.readFileSync(path.join(dir, 'achievements.json'), 'utf8'), save);
  assert.deepEqual([...fs.readFileSync(statFile)], [10, 0, 0, 0]);
});

test('GSE achievements.json read by both readers', () =>
  relockCase({
    source: 'Goldberg',
    saveFile: 'achievements.json',
    files: { 'achievements.json': JSON.stringify({ ACH_X: { earned: true, earned_time: 1700000000 }, ACH_Y: { earned: true, earned_time: 1700000100 }, ACH_Z: { earned: false, earned_time: 0 } }, null, 2) },
  }));

const KILLS_SCHEMA = [{ name: 'ACH_X', progress: { max_val: 10, value: { operation: 'statvalue', operand1: 'kills' } } }];

test('CODEX achievements.ini with CRLF, its [UserStats] counter lowered', async () => {
  const ini = ['[SteamAchievements]', '00000=ACH_X', '00001=ACH_Y', 'Count=2', '', '[ACH_X]', 'Achieved=1', 'CurProgress=0', 'MaxProgress=0', 'UnlockTime=1700000000', '', '[ACH_Y]', 'Achieved=1', 'CurProgress=0', 'MaxProgress=0', 'UnlockTime=1700000100', ''].join('\r\n');
  const stats = '[UserStats]\r\nkills=10\r\ndeaths=3\r\n';
  const { plan } = await relockCase({ source: 'Codex', saveFile: 'achievements.ini', list: KILLS_SCHEMA, files: { 'achievements.ini': ini, 'stats.ini': stats } });
  assert.equal(plan.stat, 'kills');
  const statEdit = plan.edits.find((edit) => path.basename(edit.path) === 'stats.ini');
  assert.ok(statEdit, 'the counter is part of the plan');
  assert.equal(statEdit.steps.reduce((state, step) => step(state.buffer), { buffer: Buffer.from(stats) }).buffer.toString(), '[UserStats]\r\nkills=0\r\ndeaths=3\r\n');
});

test('an INI kept in UTF-16 keeps its byte-order mark and its CRLF', () => {
  const ini = ['[ACH_X]', 'Achieved=1', 'UnlockTime=1700000000', '[ACH_Y]', 'Achieved=1', 'UnlockTime=1700000100', ''].join('\r\n');
  const profile = tempProfile();
  const dir = path.join(profile, 'saves', '480');
  const file = write(path.join(dir, 'achievements.ini'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(ini, 'utf16le')]));
  const plan = relock.plan({ appid: '480', source: 'Codex', dataPaths: [{ source: 'Codex', path: dir }] }, 'ACH_X', { gameRunning: false });
  relock.run(plan, { gameRunning: false });
  const bytes = fs.readFileSync(file);
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(bytes.subarray(2).toString('utf16le'), ini.replace('Achieved=1', 'Achieved=0').replace('UnlockTime=1700000000', 'UnlockTime=0'));
});

test('OnlineFix achievements.ini (achieved=true, timestamp)', () =>
  relockCase({
    source: 'OnlineFix',
    saveFile: 'achievements.ini',
    files: { 'achievements.ini': '[ACH_X]\nachieved=true\ntimestamp=1700000000\n\n[ACH_Y]\nachieved=true\ntimestamp=1700000100\n' },
  }));

// The Watchdog's parser returns nothing for this layout, so only the app's reading is checked.
test('RLD! hex blobs', () =>
  relockCase({
    source: 'Steam-emulator',
    watchdog: false,
    saveFile: 'achievements.ini',
    files: { 'achievements.ini': '[ACH_X]\r\nState=0100000000\r\nTime=d01a156600\r\n[ACH_Y]\r\nState=0100000000\r\nTime=d01a156600\r\n' },
  }));

test('3DM stats.ini ([State] / [Time])', () =>
  relockCase({
    source: 'Reloaded - 3DM',
    saveFile: 'stats.ini',
    files: { 'stats.ini': '[State]\nACH_X=0101\nACH_Y=0101\n[Time]\nACH_X=145d1066\nACH_Y=145d1066\n' },
  }));

test('Hoodlum [Achievements] / [AchievementsUnlockTimes]', () =>
  relockCase({
    source: 'Hoodlum',
    saveFile: 'achievements.ini',
    files: { 'achievements.ini': '[Achievements]\nACH_X=1\nACH_Y=1\n[AchievementsUnlockTimes]\nACH_X=1700000000\nACH_Y=1700000100\n' },
  }));

test('ALI213 Achievements.Bin, text despite its name', () =>
  relockCase({
    source: 'ALI213',
    saveFile: 'Achievements.Bin',
    files: { 'Achievements.Bin': '[ACH_X]\nHaveAchieved=1\nHaveAchievedTime=1700000000\n[ACH_Y]\nHaveAchieved=1\nHaveAchievedTime=1700000100\n' },
  }));

test('TENOKE user_stats.ini, its [STATS] counter lowered', async () => {
  const save = '[ACHIEVEMENTS]\n"ACH_X" = {unlocked = true, time = 1700000000}\n"ACH_Y" = {unlocked = true, time = 1700000100}\n[STATS]\n"kills" = 10\n"deaths" = 3\n';
  const { plan } = await relockCase({ source: 'TENOKE', saveFile: 'user_stats.ini', list: KILLS_SCHEMA, files: { 'user_stats.ini': save } });
  const edit = plan.edits.find((entry) => path.basename(entry.path) === 'user_stats.ini');
  const next = edit.steps.reduce((state, step) => step(state.buffer), { buffer: Buffer.from(save) }).buffer.toString();
  assert.equal(next, '[ACHIEVEMENTS]\n"ACH_X" = {unlocked = false, time = 0}\n"ACH_Y" = {unlocked = true, time = 1700000100}\n[STATS]\n"kills" = 0\n"deaths" = 3\n');
});

test('RAZOR1911 achievement', () =>
  relockCase({
    source: 'Razor1911',
    saveFile: 'achievement',
    files: { achievement: 'ACH_X 1 1700000000\nACH_Y 1 1700000100\nACH_Z 0 0\n' },
  }));

test('CreamAPI stats/CreamAPI.Achievements.cfg', () =>
  relockCase({
    source: 'CreamAPI',
    saveFile: path.join('stats', 'CreamAPI.Achievements.cfg'),
    files: { [path.join('stats', 'CreamAPI.Achievements.cfg')]: '[ACH_X]\nachieved=true\nunlocktime=1700000000\n[ACH_Y]\nachieved=true\nunlocktime=1700000100\n' },
  }));

test('UniverseLAN Achievements.ini (Unlocked / UnlockTime)', () =>
  relockCase({
    source: 'UniverseLAN',
    saveFile: 'Achievements.ini',
    files: { 'Achievements.ini': '[ACH_X]\nUnlocked=true\nUnlockTime=1700000000\n[ACH_Y]\nUnlocked=true\nUnlockTime=1700000100\n' },
  }));

test('a Nemirtingas entry with no flag at all is removed, since it reads as unlocked', async () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'NemirtingasEpicEmu', 'abc');
  const file = write(path.join(dir, 'achievements.json'), JSON.stringify({ ACH_X: { unlock_time: 1700000000 }, ACH_Y: { unlock_time: 1700000100 } }));
  const plan = relock.plan({ appid: 'epic-abc', source: 'epic', dataPaths: [{ source: 'epic', path: dir }] }, 'ACH_X', { gameRunning: false });
  assert.equal(plan.refusal, null);
  relock.run(plan, { gameRunning: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ACH_Y: { unlock_time: 1700000100 } });
});

test('a progressive achievement with no known counter link says so before the relock', () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'saves', '481');
  write(path.join(dir, 'achievements.ini'), '[ACH_X]\nAchieved=1\nUnlockTime=1700000000\n');
  write(path.join(dir, 'stats.ini'), '[UserStats]\nkills=10\n');
  const plan = relock.plan({ appid: '481', source: 'Codex', dataPaths: [{ source: 'Codex', path: dir }] }, 'ACH_X', { gameRunning: false });
  assert.equal(plan.refusal, null);
  assert.equal(plan.stat, null);
  assert.equal(plan.statUnknown, true);
});
