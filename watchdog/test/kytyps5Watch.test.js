'use strict';

/*
  The KytyPS5 watcher reads through the app's own parser, so what is checked here is the wiring: which
  folders are considered, and when an unlock is announced. A title already on disk at start is never
  replayed, a title that appears while the Watchdog runs is new from its first unlock, and a whole
  copied-in save is not read as a play session.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-kytyps5watch-'));
// Baselines and icons go to the Watchdog's user data; keep them in the fixture.
const realUserData = process.env.AW_USER_DATA;
const realProgramData = process.env.ProgramData;
process.env.AW_USER_DATA = path.join(temp, 'userData');
process.env.ProgramData = path.join(temp, 'ProgramData');

const kytyWatch = require(path.join(__dirname, '..', 'console', 'kytyps5Watch.js'));
const { TITLE_ID, makeGame, makeEmulator, writeUnlocks } = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'kytyps5.js'));

const { discover, watchedFolders, iconPathOf, handleChange, titleFor, titleIdsOnDisk, seedBaseline } = kytyWatch._internal;

test.after(() => {
  if (realUserData === undefined) delete process.env.AW_USER_DATA;
  else process.env.AW_USER_DATA = realUserData;
  process.env.ProgramData = realProgramData;
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

function unlockFile(emulator, titleId = TITLE_ID) {
  return path.join(emulator, '_Trophies', titleId, 'trophies_1000_0.json');
}

test('only the enabled folders are searched, each emulator once', () => {
  const root = path.join(temp, 'folders');
  makeGame(path.join(root, 'Games'));
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')] });
  const configFile = path.join(temp, 'userdir.db');
  fs.writeFileSync(
    configFile,
    JSON.stringify([
      { path: emulator, enabled: true },
      { path: path.join(emulator, '_Trophies'), enabled: true },
      { path: path.join(temp, 'off'), enabled: false },
    ])
  );
  assert.equal(watchedFolders(configFile).length, 2, 'a folder switched off is not watched');
  const targets = discover(configFile);
  assert.equal(targets.length, 1, 'the same emulator reached twice is watched once');
  assert.deepEqual(targets[0].titles.map((title) => title.titleId), [TITLE_ID]);
  assert.deepEqual([...titleIdsOnDisk(emulator)], [TITLE_ID]);
  assert.deepEqual(discover(path.join(temp, 'absent.db')), [], 'a missing folder list is empty, never an error');
});

test('a known title announces only what is new, with its name and icon', async () => {
  const root = path.join(temp, 'known');
  makeGame(path.join(root, 'Games'));
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], unlocks: { 1000: { 1: 1700000000 } } });
  const [title] = require(path.join(__dirname, '..', '..', 'app', 'parser', 'kytyps5.js')).discover(emulator);
  const known = new Set([TITLE_ID]);
  const ctx = context();

  await handleChange(title, unlockFile(emulator), ctx, known);
  assert.equal(ctx.sent.length, 0, 'the first sight of a title present at start is recorded silently');

  writeUnlocks(emulator, TITLE_ID, { 1000: { 1: 1700000000, 0: 1700000500 } });
  await handleChange(title, unlockFile(emulator), ctx, known);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].achievementDisplayName, 'Playroom Master');
  assert.equal(ctx.sent[0].gameDisplayName, "ASTRO's PLAYROOM");
  assert.equal(ctx.sent[0].source, 'KytyPS5 Emulator');
  assert.equal(ctx.sent[0].time, 1700000500);
  assert.ok(ctx.sent[0].icon && fs.existsSync(ctx.sent[0].icon), 'the icon is a local file');
  assert.equal(ctx.sent[0].trophyGrade, 'platinum', 'the popup is painted in the trophy grade');
  assert.ok(ctx.sent[0].gameIcon && fs.existsSync(ctx.sent[0].gameIcon), "the game's own icon goes along");

  await handleChange(title, unlockFile(emulator), ctx, known);
  assert.equal(ctx.sent.length, 1, 'the same file read again announces nothing');

  // A reset deletes the file; the trophy earned again afterwards is announced again.
  fs.rmSync(unlockFile(emulator));
  await handleChange(title, '', ctx, known);
  assert.equal(ctx.sent.length, 1, 'a reset announces nothing');
  writeUnlocks(emulator, TITLE_ID, { 1000: { 1: 1700000900 } });
  await handleChange(title, unlockFile(emulator), ctx, known);
  assert.deepEqual(ctx.sent.slice(1).map((payload) => payload.achievementDisplayName), ['First Steps']);
});

test('a title that appears while running is new from its first unlock, unless it is a copied-in save', async () => {
  // Its own title id: baselines are kept per title, and the test above already recorded one.
  const appearing = 'PPSA02000';
  const root = path.join(temp, 'appearing');
  makeGame(path.join(root, 'Games'), { titleId: appearing });
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], unlocks: null });
  const target = { root: emulator, titles: [] };
  writeUnlocks(emulator, appearing, { 1000: { 1: 1700000000 } });

  const title = titleFor(target, unlockFile(emulator, appearing));
  assert.ok(title, 'the new title is found again from its file');
  assert.equal(target.titles.length, 1, 'and remembered');

  const ctx = context();
  await handleChange(title, unlockFile(emulator, appearing), ctx, new Set());
  assert.deepEqual(ctx.sent.map((payload) => payload.achievementDisplayName), ['First Steps']);

  const copied = path.join(temp, 'copied');
  makeGame(path.join(copied, 'Games'), { titleId: 'PPSA99999' });
  const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, 1700000000]));
  const copiedEmulator = makeEmulator(copied, { gameDirs: [path.join(copied, 'Games')], unlocks: { 1000: many }, titleId: 'PPSA99999' });
  const copiedTitle = titleFor({ root: copiedEmulator, titles: [] }, unlockFile(copiedEmulator, 'PPSA99999'));
  const quiet = context();
  await handleChange(copiedTitle, unlockFile(copiedEmulator, 'PPSA99999'), quiet, new Set());
  assert.equal(quiet.sent.length, 0, 'eleven unlocks at once are a save copied in, not played');
});

test('a reset made while the Watchdog was stopped does not silence the trophies earned again', async () => {
  const resetTitle = 'PPSA03000';
  const root = path.join(temp, 'stopped-reset');
  makeGame(path.join(root, 'Games'), { titleId: resetTitle });
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], unlocks: { 1000: { 1: 1700000000, 0: 1700000100 } }, titleId: resetTitle });
  const [title] = require(path.join(__dirname, '..', '..', 'app', 'parser', 'kytyps5.js')).discover(emulator);
  seedBaseline(title);

  fs.rmSync(unlockFile(emulator, resetTitle));
  seedBaseline(title);
  writeUnlocks(emulator, resetTitle, { 1000: { 1: 1700000900 } });
  const ctx = context();
  await handleChange(title, unlockFile(emulator, resetTitle), ctx, new Set([resetTitle]));
  assert.deepEqual(ctx.sent.map((payload) => payload.achievementDisplayName), ['First Steps']);
});

test('only local icon files are handed to the toast', () => {
  assert.equal(iconPathOf({ icon: 'file:///C:/cache/kytyps5/A/1.png' }), path.normalize('C:/cache/kytyps5/A/1.png'));
  assert.equal(iconPathOf({ icon: 'https://example.invalid/1.png' }), '');
  assert.equal(iconPathOf({}), '');
});
