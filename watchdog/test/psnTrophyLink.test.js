'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-psn-link-'));
process.env.AW_USER_DATA = temp;
after(() => fs.rmSync(temp, { recursive: true, force: true }));

const { resetCache } = require('../util/userData.js');
resetCache();
const psnTrophyLink = require('../util/psnTrophyLink.js');
const { platinumFields } = require('../util/trophyGrade.js');

const dir = path.join(temp, 'steam_cache', 'psn', 'links');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, '1029690.json'),
  JSON.stringify({ listId: 'NPWR21465_00', trophies: { ACH_GHOST: { type: 'G' } }, platinum: { name: 'Tireur', description: 'Tout', icon: 'https://img/0.png' } })
);
const trophyMode = { achievement: { rarityMode: 'trophy' } };
const rareMode = { achievement: { rarityMode: 'rare' } };

test('an unlock takes the grade of its PlayStation trophy in the trophy mode only', () => {
  const link = psnTrophyLink.readLink('1029690');
  assert.equal(psnTrophyLink.linkedGrade(trophyMode, link, 'ACH_GHOST'), 'gold');
  assert.equal(psnTrophyLink.linkedGrade(trophyMode, link, 'OTHER'), undefined);
  assert.equal(psnTrophyLink.linkedGrade(rareMode, link, 'ACH_GHOST'), undefined);
  assert.equal(psnTrophyLink.readLink('../cfg'), null);
});

test('the 100% popup becomes the real platinum when the game has one, in every rarity mode', () => {
  const link = psnTrophyLink.readLink('1029690');
  assert.deepEqual(psnTrophyLink.linkedPlatinum(link), { name: 'Tireur', description: 'Tout', icon: 'https://img/0.png' });
  assert.equal(psnTrophyLink.linkedPlatinum({ ...link, platinum: null }), null);
  assert.equal(psnTrophyLink.linkedPlatinum(null), null);
});

test('a live watcher unlock takes the grade and platinum popup of the linked trophy', () => {
  fs.writeFileSync(
    path.join(dir, '4D5307E6.json'),
    JSON.stringify({ listId: 'NPWR00001_00', trophies: { 1: { type: 'S' }, 9: { type: 'P' } }, platinum: { name: 'Roi', description: 'Tout' } })
  );
  const unlock = (name) => ({ source: 'Xenia Emulator', appid: '4D5307E6', achievementName: name });
  assert.deepEqual(psnTrophyLink.withLinkedTrophy(trophyMode, unlock('1')), { trophyGrade: 'silver', ...unlock('1') });
  assert.deepEqual(psnTrophyLink.withLinkedTrophy(rareMode, unlock('1')), unlock('1'), 'grades stay with the trophy mode');
  assert.deepEqual(psnTrophyLink.withLinkedTrophy(rareMode, unlock('9')), { notificationType: 'platinum', ...unlock('9') });
  assert.deepEqual(psnTrophyLink.withLinkedTrophy(trophyMode, { ...unlock('9'), trophyGrade: 'gold' }).trophyGrade, 'gold', 'the watcher own grade wins');
  assert.deepEqual(psnTrophyLink.withLinkedTrophy(trophyMode, unlock('404')), unlock('404'));
  assert.deepEqual(psnTrophyLink.withLinkedTrophy(trophyMode, { ...unlock('1'), appid: 'none' }), { ...unlock('1'), appid: 'none' });
});

test('an emulator platinum trophy uses the platinum popup unless it is turned off', () => {
  assert.deepEqual(platinumFields('P', {}), { notificationType: 'platinum' });
  assert.deepEqual(platinumFields('G', {}), {});
  assert.deepEqual(platinumFields('P', { notification: { platinum: false } }), {});
});
