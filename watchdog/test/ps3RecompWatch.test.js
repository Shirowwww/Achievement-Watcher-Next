'use strict';

/*
  The PS3 Recomp watcher reads through the app's own parser, so what is checked here is the wiring:
  it watches the very folder the library reads, what is unlocked at start stays silent, a new
  unlock is announced with its name and grade, a half-written or broken file announces nothing,
  and a port whose trophies folder does not exist yet is followed until it does (real events).
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps3recompwatch-'));
const realUserData = process.env.AW_USER_DATA;
process.env.AW_USER_DATA = path.join(temp, 'userData');
require('../util/userData.js').resetCache();

const watcher = require(path.join(__dirname, '..', 'console', 'ps3RecompWatch.js'));
const appParser = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps3Recomp.js'));
const fixture = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'ps3Recomp.js'));
const { discover, watchedFolders, foldersOf, handleChange, seedBaseline } = watcher._internal;

const userDirDb = path.join(process.env.AW_USER_DATA, 'cfg', 'userdir.db');

test.after(() => {
  watcher.stop();
  if (realUserData === undefined) delete process.env.AW_USER_DATA;
  else process.env.AW_USER_DATA = realUserData;
  fs.rmSync(temp, { recursive: true, force: true });
});

function context() {
  const sent = [];
  return {
    sent,
    options: {
      achievement: { lang: 'english' },
      achievement_source: { ps3recomp: true },
      notification: { notify: true, rumble: false },
      notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
      notification_toast: { customToastAudio: '0', groupToast: false },
    },
    notify: async (payload) => {
      sent.push(payload);
    },
  };
}

function writeDb(paths) {
  fs.mkdirSync(path.dirname(userDirDb), { recursive: true });
  fs.writeFileSync(userDirDb, JSON.stringify(paths.map((p) => ({ path: p, enabled: true }))));
  return userDirDb;
}

async function waitFor(check, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

const progressOf = (root) => path.join(root, 'gamedata', 'trophies', 'NPWR00104.json');

test('the watcher watches the folder the library reads, and a port found twice once', () => {
  const library = path.join(temp, 'agree');
  const root = path.join(library, 'Odyssey');
  fixture.makePort(root);
  const configFile = path.join(temp, 'agree.db');
  fs.writeFileSync(configFile, JSON.stringify([{ path: library, enabled: true }, root, { path: path.join(temp, 'off'), enabled: false }]));
  assert.equal(watchedFolders(configFile).length, 2);
  const records = discover(configFile);
  assert.equal(records.length, 1);
  const [library_] = appParser.scan(library);
  assert.equal(records[0].appid, library_.appid);
  assert.deepEqual(foldersOf(records).map((folder) => folder.dir), [path.dirname(library_.data.progressFile)]);
  assert.deepEqual(discover(path.join(temp, 'absent.db')), [], 'a missing folder list is empty, never an error');
});

test('what is unlocked at start is silent, a new unlock is announced, a broken file announces nothing', async () => {
  const root = path.join(temp, 'lines', 'Odyssey');
  fixture.makePort(root);
  fixture.writeUnlocks(progressOf(root), [{ id: 1, timestamp: 1793000000 }]);
  const [record] = discover(writeDb([root]));
  const ctx = context();
  seedBaseline(record);
  await handleChange(record, ctx);
  assert.equal(ctx.sent.length, 0, 'the unlock present at start is not replayed');

  fixture.write(progressOf(root), '{"trophies": [ { "id": 1, "timest');
  await handleChange(record, ctx);
  fixture.write(progressOf(root), 'garbage');
  await handleChange(record, ctx);
  assert.equal(ctx.sent.length, 0, 'a file being rewritten is neither an unlock nor a relock');

  fixture.writeUnlocks(progressOf(root), [{ id: 1, timestamp: 1793000000 }, { id: 2, timestamp: 1793000500 }, { id: 77, timestamp: 1793000600 }]);
  await handleChange(record, ctx);
  assert.equal(ctx.sent.length, 1, 'trophy 77 is not on the list and is not announced');
  assert.equal(ctx.sent[0].achievementDisplayName, 'Secret Ending');
  assert.equal(ctx.sent[0].gameDisplayName, fixture.TITLE);
  assert.equal(ctx.sent[0].source, 'PS3 Recomp');
  assert.equal(ctx.sent[0].trophyGrade, 'gold');
  assert.equal(ctx.sent[0].time, 1793000500);
  assert.ok(ctx.sent[0].icon && fs.existsSync(ctx.sent[0].icon), 'the icon is a local file');
});

test('a port with no trophies folder yet is followed until its first unlock file', async () => {
  const root = path.join(temp, 'live', 'Odyssey');
  fixture.makePort(root);
  writeDb([root]);
  const ctx = context();
  await watcher.start(ctx);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.mkdirSync(path.join(root, 'gamedata', 'trophies'), { recursive: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.writeUnlocks(progressOf(root), [{ id: 1, timestamp: 1793000900 }]);
    assert.ok(await waitFor(() => ctx.sent.length > 0), 'the first unlock written after start is announced');
    assert.equal(ctx.sent[0].achievementDisplayName, 'First Step');
    assert.equal(ctx.sent[0].trophyGrade, 'bronze');
    fixture.writeUnlocks(progressOf(root), [{ id: 1, timestamp: 1793000900 }, { id: 0, timestamp: 1793001000 }]);
    assert.ok(await waitFor(() => ctx.sent.length > 1), 'a later rewrite of the now watched file is announced too');
    assert.equal(ctx.sent[1].trophyGrade, 'platinum');
  } finally {
    watcher.stop();
  }
});

test('the source switched off watches nothing', async () => {
  const ctx = context();
  ctx.options.achievement_source.ps3recomp = false;
  await watcher.start(ctx);
  assert.equal(watcher._internal.watcherCount(), 0);
  watcher.stop();
});
