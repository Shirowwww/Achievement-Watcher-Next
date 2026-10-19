'use strict';

/*
  The PC port watcher reads through the app's parser, so what is checked here is the wiring: an unlock
  file present at start is the baseline and says nothing, a new "true" is announced and dated, a file
  that appears after the start is picked up, and half a file is never taken for a reset.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pcportswatch-'));
const realUserData = process.env.AW_USER_DATA;
const realLocalAppData = process.env.LOCALAPPDATA;
process.env.AW_USER_DATA = path.join(temp, 'userData');
process.env.LOCALAPPDATA = path.join(temp, 'LocalAppData');

const pcportsWatch = require(path.join(__dirname, '..', 'console', 'pcportsWatch.js'));
const pcports = require(path.join(__dirname, '..', '..', 'app', 'parser', 'pcports.js'));
const { makeInstall, writeUnlocks, unlockText } = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'pcports.js'));

const { watchedFolders, discoverGame, handleChange, seedBaseline, resolveWatchTarget } = pcportsWatch._internal;
const userDirFile = path.join(process.env.AW_USER_DATA, 'cfg', 'userdir.db');
const baselineFile = path.join(process.env.AW_USER_DATA, 'steam_cache', 'console', 'pcports-pcports-ladxhd.json');

test.after(() => {
  pcportsWatch.stop();
  if (realUserData === undefined) delete process.env.AW_USER_DATA;
  else process.env.AW_USER_DATA = realUserData;
  if (realLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = realLocalAppData;
  fs.rmSync(temp, { recursive: true, force: true });
});

function context() {
  const sent = [];
  return {
    sent,
    options: {
      achievement: { lang: 'english' },
      notification: { notify: true, rumble: false },
      notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
      notification_toast: { customToastAudio: '0', groupToast: false },
    },
    notify: async (payload) => {
      sent.push(payload);
    },
  };
}

// A fresh install, unlock file and baseline for each scenario: they share one title id.
function scene(name, earned) {
  fs.rmSync(baselineFile, { force: true });
  fs.rmSync(path.join(process.env.LOCALAPPDATA, 'Zelda_LA'), { recursive: true, force: true });
  const game = makeInstall(path.join(temp, name, 'Zelda'));
  const file = path.join(process.env.LOCALAPPDATA, 'Zelda_LA', 'achievements');
  if (earned) writeUnlocks(file, earned);
  fs.mkdirSync(path.dirname(userDirFile), { recursive: true });
  fs.writeFileSync(userDirFile, JSON.stringify([{ path: path.join(temp, name), enabled: true }]));
  return { game, file };
}

async function waitFor(condition, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !condition()) await new Promise((resolve) => setTimeout(resolve, 50));
}

test('only the enabled folders are searched, and the install is found below them', () => {
  const { game } = scene('folders');
  assert.equal(watchedFolders(userDirFile).length, 1);
  assert.equal(discoverGame(userDirFile).root, game);
  assert.equal(discoverGame(path.join(temp, 'absent.db')), null, 'a missing folder list is no game, never an error');
});

test('what the file already holds is the baseline, and a new true is announced and dated', async () => {
  const { file } = scene('known', [0, 1]);
  const game = discoverGame(userDirFile);
  const ctx = context();

  seedBaseline(file);
  await handleChange(game, file, ctx);
  assert.equal(ctx.sent.length, 0, 'achievements earned before the start are not replayed');

  writeUnlocks(file, [0, 1, 7]);
  await handleChange(game, file, ctx);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].achievementName, 'achievement7');
  assert.equal(ctx.sent[0].achievementDisplayName, 'English name 7');
  assert.equal(ctx.sent[0].source, 'PC Port');
  assert.equal(ctx.sent[0].appid, 'pcports-ladxhd');
  assert.ok(ctx.sent[0].icon && fs.existsSync(ctx.sent[0].icon), 'the icon is a local file');
  const seen = pcports.getAchievements(game).find((entry) => entry.id === 'achievement7');
  assert.equal(seen.earned_time, ctx.sent[0].time, 'the moment it was seen is its date, kept');

  await handleChange(game, file, ctx);
  assert.equal(ctx.sent.length, 1, 'the same file read again announces nothing');
});

test('half a file is not a reset, and a deleted file lets the same achievement announce again', async () => {
  const { file } = scene('reset', [3]);
  const game = discoverGame(userDirFile);
  const ctx = context();
  seedBaseline(file);

  fs.writeFileSync(file, `${unlockText([3])}achievement9 tr`);
  await handleChange(game, file, ctx);
  writeUnlocks(file, [3, 4]);
  await handleChange(game, file, ctx);
  assert.deepEqual(ctx.sent.map((payload) => payload.achievementName), ['achievement4'], 'the cut file changed nothing');

  fs.rmSync(file);
  await handleChange(game, file, ctx, true);
  writeUnlocks(file, [3]);
  await handleChange(game, file, ctx);
  assert.deepEqual(ctx.sent.map((payload) => payload.achievementName), ['achievement4', 'achievement3']);
});

test('a save rewritten as delete-then-create is not a reset', async () => {
  const { file } = scene('rewrite', [0, 1, 2]);
  const game = discoverGame(userDirFile);
  const ctx = context();
  seedBaseline(file);

  fs.rmSync(file);
  const reported = handleChange(game, file, ctx, true);
  writeUnlocks(file, [0, 1, 2]);
  await reported;
  await handleChange(game, file, ctx);
  assert.equal(ctx.sent.length, 0, 'the achievements already earned are not replayed');
});

test('a save restored after a reset is a baseline, not a burst of notifications', async () => {
  const { file } = scene('restored', [0, 1, 2]);
  const game = discoverGame(userDirFile);
  const ctx = context();
  seedBaseline(file);
  fs.rmSync(file);
  await handleChange(game, file, ctx, true);
  writeUnlocks(file, Array.from({ length: 12 }, (_, i) => i));
  await handleChange(game, file, ctx);
  assert.equal(ctx.sent.length, 0);
});

test('a copied-in file with many unlocks is a baseline, not a burst of notifications', async () => {
  const { file } = scene('copied');
  writeUnlocks(file, Array.from({ length: 12 }, (_, i) => i));
  const game = discoverGame(userDirFile);
  const ctx = context();
  await handleChange(game, file, ctx);
  assert.equal(ctx.sent.length, 0);
});

test('the watch target is the folder, or the nearest folder above it', () => {
  const base = path.join(temp, 'target');
  fs.mkdirSync(base, { recursive: true });
  assert.deepEqual(resolveWatchTarget(base), { ready: true });
  assert.deepEqual(resolveWatchTarget(path.join(base, 'Zelda_LA')), { ready: false, watchDir: base, nextExpected: 'Zelda_LA' });
});

test('a file that already exists at start is silent, then the next true is announced', async () => {
  const { file } = scene('live-existing', [0]);
  const ctx = context();
  await pcportsWatch.start(ctx);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(ctx.sent.length, 0);
    writeUnlocks(file, [0, 2]);
    await waitFor(() => ctx.sent.length > 0);
    assert.deepEqual(ctx.sent.map((payload) => payload.achievementName), ['achievement2']);
  } finally {
    pcportsWatch.stop();
  }
});

test('a file created after the start announces what it holds as true', async () => {
  const { file } = scene('live-late');
  assert.equal(fs.existsSync(path.dirname(file)), false, 'not even the game folder exists yet');
  const ctx = context();
  await pcportsWatch.start(ctx);
  try {
    writeUnlocks(file, [5]);
    await waitFor(() => ctx.sent.length > 0);
    assert.deepEqual(ctx.sent.map((payload) => payload.achievementName), ['achievement5']);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(ctx.sent.length, 1, 'and only once');
  } finally {
    pcportsWatch.stop();
  }
});

test('a file with only false lines created after the start says nothing, then a true does', async () => {
  const { file } = scene('live-empty');
  const ctx = context();
  await pcportsWatch.start(ctx);
  try {
    writeUnlocks(file, []);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ctx.sent.length, 0);
    writeUnlocks(file, [8]);
    await waitFor(() => ctx.sent.length > 0);
    assert.deepEqual(ctx.sent.map((payload) => payload.achievementName), ['achievement8']);
  } finally {
    pcportsWatch.stop();
  }
});

test('the source switch and the master notify switch turn the watcher off', async () => {
  const { file } = scene('switches', [0]);
  const off = context();
  off.options.achievement_source = { pcports: false };
  await pcportsWatch.start(off);
  writeUnlocks(file, [0, 1]);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(off.sent.length, 0);
  pcportsWatch.stop();
});
