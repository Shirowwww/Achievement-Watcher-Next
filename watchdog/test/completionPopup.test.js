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
