'use strict';

/*
  The PS4 Recomp watcher reads through the app's own parser, so what is checked here is the wiring:
  which folders are searched, that what is unlocked at start stays silent, that a new log line is
  announced with its name and grade, and that a port whose user folder does not exist yet is
  followed until its first log appears (real file system events, no stubbed watcher).
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps4recompwatch-'));
const realUserData = process.env.AW_USER_DATA;
const realAppData = process.env.APPDATA;
process.env.AW_USER_DATA = path.join(temp, 'userData');
process.env.APPDATA = path.join(temp, 'AppData');
require('../util/userData.js').resetCache();

const watcher = require(path.join(__dirname, '..', 'console', 'ps4RecompWatch.js'));
const fixture = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'ps4Recomp.js'));
const { discover, watchedFolders, handleChange, seedBaseline } = watcher._internal;

const userDirDb = path.join(process.env.AW_USER_DATA, 'cfg', 'userdir.db');

test.after(() => {
  watcher.stop();
  if (realUserData === undefined) delete process.env.AW_USER_DATA;
  else process.env.AW_USER_DATA = realUserData;
  if (realAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = realAppData;
  fs.rmSync(temp, { recursive: true, force: true });
});

function context() {
  const sent = [];
  return {
    sent,
    options: {
      achievement: { lang: 'english' },
      achievement_source: { ps4recomp: true },
      notification: { notify: true, rumble: false },
      notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
      notification_toast: { customToastAudio: '0', groupToast: false },
    },
    notify: async (payload) => {
      sent.push(payload);
    },
  };
}

// A Bloodborne port with its dump inside, logs in <port>/user.
function makeBloodborne(name) {
  const root = fixture.makePort(path.join(temp, name, 'Bloodborne'), 'bloodborne');
  fixture.makeGameDump(path.join(root, 'Game'));
  return root;
}

async function waitFor(check, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

test('only the enabled folders are searched, a port found twice is watched once', () => {
  const root = makeBloodborne('folders');
  const configFile = path.join(temp, 'folders.db');
  fs.writeFileSync(configFile, JSON.stringify([{ path: root, enabled: true }, path.join(temp, 'folders'), { path: path.join(temp, 'off'), enabled: false }]));
  assert.equal(watchedFolders(configFile).length, 2);
  const groups = discover(configFile);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].records.length, 1);
  assert.equal(groups[0].userDir, path.join(root, 'user'));
  assert.deepEqual(discover(path.join(temp, 'absent.db')), [], 'a missing folder list is empty, never an error');
});

test('what is unlocked at start is silent, a new line is announced with its grade', async () => {
  const root = makeBloodborne('lines');
  const log = fixture.write(path.join(root, 'user', 'trophies.log'), '1 1700000000\n');
  const [group] = discover(writeDb([root]));
  const [record] = group.records;
  const ctx = context();

  seedBaseline(record);
  await handleChange(record, ctx);
  assert.equal(ctx.sent.length, 0, 'the unlock present at start is not replayed');

  fs.appendFileSync(log, '2 1700000500\n0 17000');
  await handleChange(record, ctx);
  assert.equal(ctx.sent.length, 1, 'the unfinished line waits for its newline');
  assert.equal(ctx.sent[0].achievementDisplayName, 'Yharnam Sunrise');
  assert.equal(ctx.sent[0].gameDisplayName, 'Bloodborne');
  assert.equal(ctx.sent[0].source, 'PS4 Recomp');
  assert.equal(ctx.sent[0].trophyGrade, 'gold');
  assert.equal(ctx.sent[0].time, 1700000500);
  assert.ok(ctx.sent[0].icon && fs.existsSync(ctx.sent[0].icon), 'the icon is a local file');

  fs.appendFileSync(log, '00\n');
  fixture.write(path.join(root, 'user', 'last_run.log'), 'Runtime: trophy 2 unlocked\n');
  await handleChange(record, ctx);
  assert.deepEqual(ctx.sent.map((p) => p.trophyGrade), ['gold', 'platinum'], 'the same trophy in both logs is announced once');
});

function writeDb(paths) {
  fs.mkdirSync(path.dirname(userDirDb), { recursive: true });
  fs.writeFileSync(userDirDb, JSON.stringify(paths.map((p) => ({ path: p, enabled: true }))));
  return userDirDb;
}

test('a port with no user folder yet is followed until its first trophies.log line', async () => {
  const root = makeBloodborne('live');
  writeDb([root]);
  const ctx = context();
  await watcher.start(ctx);
  try {
    // Give the parent watcher a moment to be armed before the folder appears.
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.mkdirSync(path.join(root, 'user'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.writeFileSync(path.join(root, 'user', 'trophies.log'), '1 1700000900\n');
    assert.ok(await waitFor(() => ctx.sent.length > 0), 'the first unlock written after start is announced');
    assert.equal(ctx.sent[0].achievementDisplayName, 'Hunter');
    assert.equal(ctx.sent[0].trophyGrade, 'bronze');

    fs.appendFileSync(path.join(root, 'user', 'trophies.log'), '2 1700001000\n');
    assert.ok(await waitFor(() => ctx.sent.length > 1), 'a later line in the now watched folder is announced too');
    assert.equal(ctx.sent[1].achievementDisplayName, 'Yharnam Sunrise');
  } finally {
    watcher.stop();
  }
});

test('a port writing its own trophy list is announced from unlocked.txt', async () => {
  const root = path.join(temp, 'tsv', 'CTR');
  const list = fixture.makeTrophyList(path.join(root, 'user'), { unlocked: '21 1792472145\r\n' });
  writeDb([root]);
  const ctx = context();
  await watcher.start(ctx);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.appendFileSync(path.join(list, 'unlocked.txt'), '43 1792472177\r\n');
    assert.ok(await waitFor(() => ctx.sent.length > 0), 'a new unlocked.txt line is announced');
    assert.equal(ctx.sent.length, 1, 'the unlock present at start is not replayed');
    assert.equal(ctx.sent[0].achievementDisplayName, 'Get off me!');
    assert.equal(ctx.sent[0].gameDisplayName, 'Crash Team Racing Nitro-Fueled');
    assert.equal(ctx.sent[0].trophyGrade, 'bronze');
    assert.equal(ctx.sent[0].time, 1792472177);
  } finally {
    watcher.stop();
  }
});

// #138: the folder appears with the first trophy ever earned, and each game has its own file.
test('the Nathan Drake Collection port is followed until its first trophyNN.txt line', async () => {
  const root = fixture.makeCollectionPort(path.join(temp, 'ndc', 'Uncharted-windows'));
  writeDb([root]);
  const groups = discover(userDirDb);
  assert.equal(groups.length, 1, 'the three games share one watched folder');
  assert.equal(groups[0].records.length, 3);
  const ctx = context();
  await watcher.start(ctx);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const trophyDir = path.join(root, 'analysis', 'uncharted-user', 'trophy');
    fs.mkdirSync(trophyDir);
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.writeFileSync(path.join(trophyDir, 'trophy02.txt'), '1 1792644204\r\n');
    assert.ok(await waitFor(() => ctx.sent.length > 0), 'the first unlock written after start is announced');
    assert.equal(ctx.sent[0].gameDisplayName, 'Uncharted 2', 'by the game whose list file grew');
    assert.equal(ctx.sent[0].achievementDisplayName, 'Hunter');
    assert.equal(ctx.sent[0].time, 1792644204);

    fs.appendFileSync(path.join(trophyDir, 'trophy02.txt'), '2 1792645166\r\n');
    assert.ok(await waitFor(() => ctx.sent.length > 1), 'a later line is announced too');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(ctx.sent.map((p) => [p.gameDisplayName, p.achievementName]), [['Uncharted 2', '1'], ['Uncharted 2', '2']], 'the other two games stay silent');
  } finally {
    watcher.stop();
  }
});

test('the source switch turns the watcher off', async () => {
  const root = makeBloodborne('off');
  writeDb([root]);
  const ctx = context();
  ctx.options.achievement_source.ps4recomp = false;
  await watcher.start(ctx);
  fixture.write(path.join(root, 'user', 'trophies.log'), '1 1700000000\n');
  await new Promise((resolve) => setTimeout(resolve, 500));
  watcher.stop();
  assert.equal(ctx.sent.length, 0);
});
