'use strict';

/*
  Little Nightmares III with OnlineFix's Friend's Pass: unlocks go through real Steam, while the game
  recreates an empty Public\Documents\OnlineFix\<appid> folder on each launch. Whenever that folder
  existed the card showed everything locked, because a merged card read every record with its main
  record's reader and the Steam record has no folder to read. Reported on cs.rin.ru (3.11.0).
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-onlinefix-pass-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const achievements = require('../../app/parser/achievements.js');
Module._load = originalLoad;

achievements.initDebug({ isDev: false, userDataPath: userData });
const { consolidateDiscoveryList, readRecordUnlocks, NO_RECORD_TO_READ } = achievements._internal;

const APPID = '1392860';
const USER = { user: '12345678', id: '76561197972611406', name: 'Player' };
const OPTION = { achievement: { lang: 'english', showHidden: false } };
const HELPERS = { readUplayR2Save: () => ({}), warnEmptyAchievementFileOnce: () => {} };
const SCHEMA = { achievement: { list: [{ name: 'ACH_TOYBOX' }, { name: 'ACH_CHAPTER' }], total: 2, unlocked: 0 } };

const emptyOnlineFix = path.join(tmp, 'Public', 'Documents', 'OnlineFix', APPID);
fs.mkdirSync(emptyOnlineFix, { recursive: true });

// What the Steam reader already cached for this account: one unlock.
const steamCache = path.join(userData, 'steam_cache', 'user', USER.user, `${APPID}.db`);
fs.mkdirSync(path.dirname(steamCache), { recursive: true });
fs.writeFileSync(steamCache, JSON.stringify([{ apiname: 'ACH_TOYBOX', achieved: 1, unlocktime: 1791053000 }]));

const onlineFixRecord = () => ({ appid: APPID, source: 'OnlineFix', data: { type: 'file', path: emptyOnlineFix } });
const steamRecord = () => ({
  appid: APPID,
  source: `Steam (${USER.name})`,
  data: { type: 'steamAPI', userID: USER, cachePath: path.join(tmp, 'no-appcache'), installed: true },
});

test('the Steam record is read as itself inside a card led by a save folder', async () => {
  const unlocks = await readRecordUnlocks('file', steamRecord(), SCHEMA, OPTION, HELPERS);
  assert.notEqual(unlocks, NO_RECORD_TO_READ, 'the Steam record has something to read');
  assert.equal(unlocks.length, 1);
  assert.equal(unlocks[0].apiname, 'ACH_TOYBOX');
});

test('a save folder is read as itself inside a card led by Steam', async () => {
  const rune = path.join(tmp, 'Public', 'Documents', 'Steam', 'RUNE', APPID);
  fs.mkdirSync(rune, { recursive: true });
  fs.writeFileSync(path.join(rune, 'achievements.ini'), ['[ACH_CHAPTER]', 'Achieved=1', 'UnlockTime=1791053100', ''].join('\n'));
  const unlocks = await readRecordUnlocks('steamAPI', { appid: APPID, source: 'Rune', data: { type: 'file', path: rune } }, SCHEMA, OPTION, HELPERS);
  assert.deepEqual(Object.keys(unlocks), ['ACH_CHAPTER']);
});

for (const [label, order] of [
  ['OnlineFix first', () => [onlineFixRecord(), steamRecord()]],
  ['Steam first', () => [steamRecord(), onlineFixRecord()]],
]) {
  test(`an empty OnlineFix folder leaves the card to the installed Steam copy (${label})`, () => {
    const [card] = consolidateDiscoveryList(order());
    assert.equal(card.data.type, 'steamAPI');
    assert.equal(card.source, `Steam (${USER.name})`);
    assert.equal(card._sources.length, 2, 'the folder is still one of its sources');
  });
}

test('an OnlineFix folder holding a save keeps leading the card', () => {
  const filled = path.join(tmp, 'Public', 'Documents', 'OnlineFix', '9999');
  fs.mkdirSync(filled, { recursive: true });
  fs.writeFileSync(path.join(filled, 'Achievements.ini'), '[ACH_X]\nAchieved=1\n');
  const [card] = consolidateDiscoveryList([
    { appid: '9999', source: 'OnlineFix', data: { type: 'file', path: filled } },
    { ...steamRecord(), appid: '9999' },
  ]);
  assert.equal(card.data.type, 'file');
});
