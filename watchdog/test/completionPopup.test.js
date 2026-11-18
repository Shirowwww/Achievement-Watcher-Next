'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-completion-'));
process.env.AW_USER_DATA = temp;
after(() => fs.rmSync(temp, { recursive: true, force: true }));

const { resetCache } = require('../util/userData.js');
resetCache();
const { platinumPopup, withCompletionPopup } = require('../util/completionPopup.js');

const linksDir = path.join(temp, 'steam_cache', 'psn', 'links');
fs.mkdirSync(linksDir, { recursive: true });
const writeLink = (appid, link) => fs.writeFileSync(path.join(linksDir, `${appid}.json`), JSON.stringify(link));

const options = { achievement: { lang: 'english' }, notification: {} };
const unlock = (appid, completion, extra = {}) => ({
  source: 'Xenia Emulator',
  appid,
  gameDisplayName: 'Game',
  achievementName: '1',
  achievementDisplayName: 'First',
  icon: 'icon.png',
  time: 100,
  completion,
  ...extra,
});

function wrapped(opts = options) {
  const sent = [];
  const notify = withCompletionPopup(async (payload) => void sent.push(payload), () => opts);
  return { sent, notify };
}

test('the platinum popup follows the unlock that completes the game, once per game', async () => {
  const { sent, notify } = wrapped();
  await notify(unlock('G1', { unlocked: 2, total: 3 }));
  assert.equal(sent.length, 1, 'nothing below 100%');

  await notify(unlock('G1', { unlocked: 3, total: 3 }));
  assert.equal(sent.length, 3);
  assert.equal(sent[2].notificationType, 'platinum');
  assert.equal(sent[2].appid, 'G1');
  assert.equal(sent[2].achievementDisplayName, 'Game');

  await notify(unlock('G1', { unlocked: 3, total: 3 }));
  assert.equal(sent.length, 4, 'a second unlock of the same finished game adds no second popup');

  await notify(unlock('G2', { unlocked: 1, total: 1 }));
  assert.equal(sent.length, 6, 'another game gets its own');
});

test('a 100% platinum shows the game icon, not the icon of the last unlock (#204)', async () => {
  const sent = [];
  const notify = withCompletionPopup(async (payload) => void sent.push(payload), () => options);
  await notify(unlock('G7', { unlocked: 1, total: 1 }, { gameIcon: 'game.png' }));
  assert.equal(sent[1].notificationType, 'platinum');
  assert.equal(sent[1].icon, 'game.png');
  await notify(unlock('G8', { unlocked: 1, total: 1 }));
  assert.equal(sent[3].icon, 'icon.png', 'without a game icon the unlock icon still fills the popup');
});

test('the platinum popup keeps the screenshot souvenir options of the unlock (#204)', async () => {
  const calls = [];
  const notify = withCompletionPopup(async (payload, opts) => void calls.push(opts), () => options);
  const souvenir = { screenshot: true, dir: 'shots' };
  await notify(unlock('G9', { unlocked: 1, total: 1 }), { toast: {}, souvenir });
  assert.equal(calls[1].souvenir, souvenir);
});

test('a payload without completion, or with an empty list, never pops', async () => {
  const { sent, notify } = wrapped();
  await notify(unlock('G3', undefined));
  await notify(unlock('G3', { unlocked: 0, total: 0 }));
  assert.equal(sent.length, 2);
});

test('the popup is off when the platinum option is false', async () => {
  const { sent, notify } = wrapped({ ...options, notification: { platinum: false } });
  await notify(unlock('G4', { unlocked: 2, total: 2 }));
  assert.equal(sent.length, 1);
  assert.equal(platinumPopup({ notification: { platinum: false } }, unlock('G4', { unlocked: 2, total: 2 })), null);
});

test('the completion field of an unlock is not forwarded to notify', async () => {
  const { sent, notify } = wrapped();
  await notify(unlock('G5', { unlocked: 1, total: 2 }));
  await notify(unlock('G5', { unlocked: 2, total: 2 }));
  for (const payload of sent) assert.equal('completion' in payload, false);
});

test('a linked PlayStation platinum gives its real name, description and icon', async () => {
  writeLink('G6', { listId: 'NPWR00006_00', trophies: { 1: { type: 'G' } }, platinum: { name: 'Roi', description: 'Tout fait', icon: 'https://img/p.png' } });
  const { sent, notify } = wrapped();
  await notify(unlock('G6', { unlocked: 2, total: 2 }));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].notificationType, 'platinum');
  assert.equal(sent[1].achievementDisplayName, 'Roi');
  assert.equal(sent[1].achievementDescription, 'Tout fait');
  assert.equal(sent[1].icon, 'https://img/p.png');
  // A theme that draws its own 100% picture steps aside for the real trophy.
  assert.equal(sent[1].realPlatinum, true);
});

test('a completion with no PlayStation list is not marked as a real platinum', async () => {
  const { sent, notify } = wrapped();
  await notify(unlock('G8', { unlocked: 1, total: 1 }));
  assert.equal(sent[1].notificationType, 'platinum');
  assert.equal(sent[1].realPlatinum, false);
});

test('a list whose own trophy is the platinum gives no second popup', async () => {
  writeLink('G7', { listId: 'NPWR00007_00', trophies: { 1: { type: 'G' }, 9: { type: 'P' } }, platinum: { name: 'Roi', description: 'Tout' } });
  const { sent, notify } = wrapped();
  await notify(unlock('G7', { unlocked: 2, total: 2 }));
  assert.equal(sent.length, 1);
});

// The live sources follow the rules a save-file game follows (util/platinumLike.js, platinumScope.js).
const { completionOf } = require('../util/completionPopup.js');
const gogList = [
  { name: 'A', displayName: 'First steps', description: 'Finish the tutorial' },
  { name: 'B', displayName: 'Hero', description: 'Beat the game' },
  { name: 'ALL', displayName: 'Completionist', description: 'Unlock all other achievements' },
];

test("a game's own platinum achievement pops as the platinum, and no 100% popup follows", async () => {
  const { sent, notify } = wrapped();
  await notify(unlock('G9', completionOf(gogList, ['A', 'B', 'ALL']), { achievementName: 'ALL', achievementDisplayName: 'Completionist' }));
  assert.equal(sent.length, 1, 'one popup, not the unlock plus a 100% one');
  assert.equal(sent[0].notificationType, 'platinum');
  assert.equal(sent[0].achievementDisplayName, 'Completionist');
  // The last ordinary unlock of a game that has its own platinum pops nothing more either.
  await notify(unlock('G10', completionOf(gogList, ['A', 'B', 'ALL']), { achievementName: 'B' }));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].notificationType, undefined);
});

test('with the platinum popup off, the own platinum is an ordinary unlock', async () => {
  const { sent, notify } = wrapped({ ...options, notification: { platinum: false } });
  await notify(unlock('G11', completionOf(gogList, ['A', 'B', 'ALL']), { achievementName: 'ALL' }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].notificationType, undefined);
});

test('the platinum waits for the base game by default, and for everything when asked', async () => {
  const list = [{ name: 'A' }, { name: 'B' }, { name: 'DLC', category: 'Episode 1' }];
  const base = wrapped();
  await base.notify(unlock('G12', completionOf(list, ['A', 'B']), { achievementName: 'B' }));
  assert.equal(base.sent.length, 2, 'the base game is done: platinum');
  assert.equal(base.sent[1].notificationType, 'platinum');
  // A later DLC unlock is no platinum, even in a new session.
  const later = wrapped();
  await later.notify(unlock('G12', completionOf(list, ['A', 'B', 'DLC']), { achievementName: 'DLC' }));
  assert.equal(later.sent.length, 1);

  const all = wrapped({ ...options, notification: { platinumScope: 'all' } });
  await all.notify(unlock('G13', completionOf(list, ['A', 'B']), { achievementName: 'B' }));
  assert.equal(all.sent.length, 1, 'DLC included: not yet');
  await all.notify(unlock('G13', completionOf(list, ['A', 'B', 'DLC']), { achievementName: 'DLC' }));
  assert.equal(all.sent.length, 3);
});

test('completionOf counts what the list knows and keeps each entry', () => {
  const completion = completionOf([{ name: 1 }, { name: 'B' }, null], ['1', 'X']);
  assert.equal(completion.unlocked, 1);
  assert.equal(completion.total, 2);
  assert.deepEqual(completion.achievements.map((a) => [a.name, a.earned]), [['1', true], ['B', false]]);
});
