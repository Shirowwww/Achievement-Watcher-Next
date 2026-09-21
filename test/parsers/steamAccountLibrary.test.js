'use strict';

/*
  Issue #80. The legit-Steam source is built from what the local client has touched: a stats file, an
  install manifest, a registry key. A reporter whose account holds 667 games and 570 shared through
  Steam Family saw 115 tiles, and the log agreed with both numbers - the library was resolved
  correctly and then only ever used to decorate the games discovery had already found.

  These cover the opt-in source that turns that library into discovery records.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  return originalLoad.apply(this, arguments);
};
const steam = require('../../app/parser/steam.js');
const appInfo = require('../../app/parser/steamAppInfo.js');
Module._load = originalLoad;

const CATALOGUE = new Map([
  ['1671210', { appid: '1671210', name: 'DELTARUNE', type: 'game' }],
  ['250820', { appid: '250820', name: 'SteamVR', type: 'tool' }],
  ['228980', { appid: '228980', name: 'Steamworks Common Redistributables', type: 'tool' }],
]);

const ME = { user: '11111111', id: '76561197971376739', name: 'me' };
const SOMEONE_ELSE = { user: '22222222', id: '76561198000000000', name: 'flatmate' };

const LIBRARY = {
  owned: ['1671210', '440', '250820'],
  family: ['570'],
  names: new Map([
    ['1671210', 'DELTARUNE'],
    ['440', 'Team Fortress 2'],
    ['570', 'Dota 2'],
  ]),
};

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-account-lib-'));
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  steam.initDebug({ isDev: false, userDataPath: root });
  return root;
}

async function scan(options = {}, { catalogue = CATALOGUE, users = [ME] } = {}) {
  const root = scratch();
  const realLoad = appInfo.load;
  appInfo.load = () => catalogue;
  try {
    return await steam.scanAccountLibrary(LIBRARY, {
      steamid: ME.id,
      readSteamPath: async () => root,
      readUsers: async () => users,
      ...options,
    });
  } finally {
    appInfo.load = realLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ids = (list) => list.map((entry) => String(entry.appid));

test('nothing is added unless the source is asked for', async () => {
  assert.deepEqual(await scan(), []);
});

test('owned games become records, family ones only when asked', async () => {
  const owned = await scan({ includeOwned: true });
  assert.deepEqual(ids(owned).sort(), ['1671210', '440']);
  assert.ok(!ids(owned).includes('570'), 'a Family game is not something you own');

  const both = await scan({ includeOwned: true, includeFamily: true });
  assert.deepEqual(ids(both).sort(), ['1671210', '440', '570']);

  const familyOnly = await scan({ includeFamily: true });
  assert.deepEqual(ids(familyOnly), ['570']);
});

test('a record reads like the legit-Steam one, and says it is not installed', async () => {
  const [record] = await scan({ includeOwned: true, includeFamily: false });
  assert.equal(record.source, `Steam (${ME.name})`);
  assert.equal(record.name, 'DELTARUNE', 'the library already names the game, so no lookup is needed for it');
  assert.equal(record.data.type, 'steamAPI');
  assert.equal(record.data.installed, false);
  assert.equal(record.data.userID, ME);
  assert.equal(record.data.accountLibrary, 'owned');
  assert.equal(path.basename(record.data.cachePath), 'stats');
});

test('games discovery already found are left to the source that knows where they are installed', async () => {
  const list = await scan({ includeOwned: true, known: ['1671210'] });
  assert.deepEqual(ids(list), ['440']);
});

test('tools and redistributables in the owned list never become tiles', async () => {
  const list = await scan({ includeOwned: true });
  assert.ok(!ids(list).includes('250820'), 'SteamVR is owned, and it is not a game');
});

test('an appid the local catalogue has never seen is kept', async () => {
  // The whole point of the source is games this PC has never installed, so "unknown here" is the
  // normal case and cannot be a reason to drop one.
  const list = await scan({ includeOwned: true }, { catalogue: new Map() });
  assert.deepEqual(ids(list).sort(), ['1671210', '250820', '440']);
});

test('the games are attributed to the connected account, not to whoever else uses this PC', async () => {
  const list = await scan({ includeOwned: true }, { users: [SOMEONE_ELSE, ME] });
  assert.equal(list[0].data.userID, ME);
});

test('with no public profile on this PC nothing is added rather than attributed to nobody', async () => {
  assert.deepEqual(await scan({ includeOwned: true }, { users: [] }), []);
});

test('no local Steam install means no records, not a failed scan', async () => {
  const list = await scan({
    includeOwned: true,
    readSteamPath: async () => {
      throw 'Steam not found';
    },
  });
  assert.deepEqual(list, []);
});
