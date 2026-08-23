'use strict';

/*
  The legit-Steam source enumerated UserGameStats_<user>_<appid>.bin, which Steam only writes once a
  game has reported statistics - so it listed what had been played, not owned or installed. Measured
  on one real machine, 59 known-locally appids never reached the scan (games included), and 29 of
  those were DLC - which is why the widened source is gated on Steam's own type per appid.
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

const CATALOGUE = new Map(
  [
    ['1671210', { appid: '1671210', name: 'DELTARUNE', type: 'game' }],
    ['3241660', { appid: '3241660', name: 'R.E.P.O.', type: 'game' }],
    ['578080', { appid: '578080', name: 'PUBG: BATTLEGROUNDS', type: 'game' }],
    ['3081410', { appid: '3081410', name: 'Battlefield 6 Open Beta', type: 'beta' }],
    ['250820', { appid: '250820', name: 'SteamVR', type: 'tool' }],
    ['22465', { appid: '22465', name: 'Fallout New Vegas ClassicPack', type: 'dlc' }],
    ['241100', { appid: '241100', name: 'Steam Input Configs', type: 'config' }],
    ['2494960', { appid: '2494960', name: 'Bopl Battle Demo', type: 'demo' }],
  ].map(([k, v]) => [k, v])
);

const PLAYED = '440'; // has a stats file: the only kind of entry the old source could see

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-owned-'));
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  steam.initDebug({ isDev: false, userDataPath: root });
  return root;
}

// Drive the inputs the widened source reads, so the test describes the code and not the machine.
async function discovered({ installs = [], registry = [], catalogue = CATALOGUE, listingType = 2 }) {
  const root = scratch();
  const realLoad = appInfo.load;
  appInfo.load = () => catalogue;
  try {
    return await steam._internal.addLocallyKnownSteamApps([{ userID: '11111111', appID: PLAYED }], {
      steamPath: root,
      listingType,
      stats: [{ userID: '11111111', appID: PLAYED }],
      readInstalls: async () => new Map(installs.map((id) => [String(id), { name: '', gameDir: `C:/games/${id}` }])),
      readOwnedRegistry: () => registry.map(String),
    });
  } finally {
    appInfo.load = realLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('an installed game with no stats file is discovered', async () => {
  const list = await discovered({ installs: ['1671210'], registry: [] });
  const ids = list.map((entry) => String(entry.appID));
  assert.ok(ids.includes('1671210'), 'DELTARUNE is on disk; a game does not have to be played to be in the library');
  assert.ok(ids.includes(PLAYED), 'and the stats entries this source already found are kept');
});

test('an owned game that was never installed is discovered in owned mode only', async () => {
  const owned = await discovered({ installs: [], registry: ['578080'], listingType: 2 });
  assert.ok(owned.map((entry) => String(entry.appID)).includes('578080'));

  const installedOnly = await discovered({ installs: [], registry: ['578080'], listingType: 1 });
  assert.ok(
    !installedOnly.map((entry) => String(entry.appID)).includes('578080'),
    '"installed only" must stay a filter on what is on disk, not quietly become the owned list'
  );
});

test('DLC, tools, demos and config apps never reach the library', async () => {
  const junk = ['250820', '22465', '241100', '2494960'];
  const list = await discovered({ installs: junk, registry: junk });
  const ids = list.map((entry) => String(entry.appID));
  for (const appid of junk) assert.ok(!ids.includes(appid), `${appid} (${CATALOGUE.get(appid).type}) must be filtered out`);
  assert.deepEqual(ids, [PLAYED], 'nothing but the stats entry survives a candidate set made only of junk');
});

test('a beta branch is the game, so it is kept', async () => {
  const list = await discovered({ installs: ['3081410'], registry: [] });
  assert.ok(list.map((entry) => String(entry.appID)).includes('3081410'));
});

test('an owned appid the local catalogue has never seen is not guessed at', async () => {
  const list = await discovered({ installs: [], registry: ['888888888'] });
  assert.deepEqual(
    list.map((entry) => String(entry.appID)),
    [PLAYED],
    'the owned list is where DLC and tooling would come in unchecked, so an unknown type is refused there'
  );
});

test('an install manifest is its own evidence, even for an appid the catalogue has not heard of', async () => {
  const list = await discovered({ installs: ['999999999'], registry: [] });
  assert.ok(
    list.map((entry) => String(entry.appID)).includes('999999999'),
    'a manifest means that folder is on this disk right now - a brand-new release must not be hidden because the client has not catalogued it yet'
  );
});

test('with no readable catalogue the source falls back to exactly its old behaviour', async () => {
  const list = await discovered({ installs: ['1671210'], registry: ['578080'], catalogue: new Map() });
  assert.deepEqual(list.map((entry) => String(entry.appID)), [PLAYED], 'no filter available means no widening, never an unfiltered dump');
});

test('a discovered game with no stats file reads back as nothing unlocked, not as an error', async () => {
  const root = scratch();
  try {
    const result = await steam.getAchievementsFromAPI({
      appID: '1671210',
      user: { user: '11111111', id: '76561190000000000' },
      path: path.join(root, 'no-such-stats-dir'),
    });
    assert.deepEqual(result, [], 'owned and never played is a complete answer; throwing would fail the whole game load');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
