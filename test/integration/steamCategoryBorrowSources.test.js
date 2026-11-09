'use strict';

/*
  A GOG, Ubisoft or Epic game shows the DLC labels of its Steam release: the Steam schema of the
  appid the game names (or the one its title resolves to) is read, and its labels copied over.
  A Steam game, or a store game that already has labels, is left alone.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-category-borrow-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const achievements = require('../../app/parser/achievements.js');
const steam = require('../../app/parser/steam.js');
Module._load = originalLoad;
achievements.initDebug({ isDev: false, userDataPath: userData });
const { borrowSteamCategories } = achievements._internal;

const option = { achievement: { lang: 'english' } };
const steamSchema = {
  name: 'The Game',
  achievement: {
    list: [
      { name: 'A1', displayName: 'One' },
      { name: 'A2', displayName: 'Two' },
      { name: 'A3', displayName: 'Three' },
      { name: 'A4', displayName: 'Four', category: 'The DLC' },
    ],
  },
};
const storeGame = () => ({
  name: 'The Game',
  achievement: { list: ['One', 'Two', 'Three', 'Four'].map((displayName, index) => ({ name: `gog_${index}`, displayName })) },
});

function stubSteam(t, { byName = '4242' } = {}) {
  const calls = { names: [], appids: [] };
  t.mock.method(steam, 'findAppidByName', async (name) => {
    calls.names.push(name);
    return byName;
  });
  t.mock.method(steam, 'getGameData', async (cfg) => {
    calls.appids.push(cfg.appID);
    return steamSchema;
  });
  return calls;
}

test('a GOG game takes the labels of the Steam release its title resolves to', async (t) => {
  const calls = stubSteam(t);
  const game = storeGame();
  await borrowSteamCategories(game, { appid: '1207658924', data: { type: 'gogOfficial' } }, option);
  assert.deepEqual(calls.names, ['The Game']);
  assert.deepEqual(calls.appids, ['4242']);
  assert.equal(game.achievement.list[3].category, 'The DLC');
  assert.equal(game.achievement.list[0].category, undefined);
});

test('a Ubisoft game that already names its Steam appid uses it without a title lookup', async (t) => {
  const calls = stubSteam(t);
  const game = { ...storeGame(), steamappid: '777' };
  await borrowSteamCategories(game, { appid: '5059', data: { type: 'ubisoftOfficial' } }, option);
  assert.deepEqual(calls.names, []);
  assert.deepEqual(calls.appids, ['777']);
  assert.equal(game.achievement.list[3].category, 'The DLC');
});

test('a Steam game and a store game with its own labels are not touched', async (t) => {
  const calls = stubSteam(t);
  const steamGame = storeGame();
  await borrowSteamCategories(steamGame, { appid: '4242', data: { type: 'steamAPI' } }, option);
  const labelled = storeGame();
  labelled.achievement.list[0].category = 'Own';
  await borrowSteamCategories(labelled, { appid: 'x', data: { type: 'epicOfficial' } }, option);
  assert.deepEqual(calls.appids, []);
  assert.equal(steamGame.achievement.list[3].category, undefined);
});

test('no Steam release, or a Steam failure, leaves the game as it was', async (t) => {
  stubSteam(t, { byName: null });
  const game = storeGame();
  await borrowSteamCategories(game, { appid: 'x', data: { type: 'epicOfficial' } }, option);
  assert.equal(game.achievement.list[3].category, undefined);

  t.mock.method(steam, 'findAppidByName', async () => '1');
  t.mock.method(steam, 'getGameData', async () => {
    throw new Error('offline');
  });
  await assert.doesNotReject(() => borrowSteamCategories(game, { appid: 'x', data: { type: 'ea' } }, option));
  assert.equal(game.achievement.list[3].category, undefined);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
