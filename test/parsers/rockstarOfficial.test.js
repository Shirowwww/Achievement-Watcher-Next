'use strict';

/*
  The Rockstar Games Launcher source: the titles it installed come from its registry keys, and the
  achievement list from the title's Steam release. The hosts are fakes, so this runs on any system.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const rockstar = require('../../app/parser/rockstarOfficial.js');
const socialclub = require('../../app/parser/socialclub.js');
const sourceIdentity = require('../../app/util/sourceIdentity.js');

const ROOT = 'Software/WOW6432Node/Rockstar Games';

function fakeHost(keys) {
  return {
    id: 'native',
    regSubkeys: (hive, key) => (hive === 'HKLM' && key === ROOT ? Object.keys(keys) : []),
    regValue: (hive, key, name) => {
      const title = key.startsWith(`${ROOT}/`) ? key.slice(ROOT.length + 1) : '';
      return hive === 'HKLM' && keys[title] ? (keys[title][name] ?? null) : null;
    },
    localPath: (p) => p,
  };
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rockstar-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('an installed launcher title becomes one record with a stable id', (t) => {
  const dir = tempDir(t);
  const [record, ...rest] = rockstar.scan([fakeHost({ 'GTAV Enhanced': { InstallFolder: dir } })]);
  assert.equal(rest.length, 0);
  assert.deepEqual(record, {
    appid: 'rockstar-gtav-enhanced',
    name: 'GTAV Enhanced',
    source: 'Rockstar Games',
    data: { type: 'rockstarOfficial', title: 'GTAV Enhanced', gameDir: dir },
  });
});

test('the launcher and Social Club keys, missing folders and store copies are not games', (t) => {
  const dir = tempDir(t);
  const records = rockstar.scan([
    fakeHost({
      Launcher: { InstallFolder: dir },
      'Rockstar Games Social Club': { InstallFolder: dir },
      'Red Dead Redemption 2': { InstallFolder: path.join(dir, 'uninstalled') },
      'L.A. Noire': { InstallFolder: '', InstallFolderSteam: dir },
    }),
  ]);
  assert.deepEqual(records, []);
});

test('a title recorded on two hosts is listed once', (t) => {
  const dir = tempDir(t);
  const keys = { 'GTAV Enhanced': { InstallFolder: dir } };
  assert.equal(rockstar.scan([fakeHost(keys), fakeHost(keys)]).length, 1);
});

test('launcher titles resolve to their Steam release offline', async () => {
  assert.equal(await socialclub.resolveSteamAppId('GTAV Enhanced'), 3240220);
  assert.equal(await socialclub.resolveSteamAppId('GTAV'), 271590);
  assert.equal(await socialclub.resolveSteamAppId('L.A. Noire'), 110800);
  assert.equal(await socialclub.resolveSteamAppId('Red Dead Redemption'), 2668510);
});

test('the schema is the Steam release under the launcher identity, nothing unlocked', async () => {
  const record = { appid: 'rockstar-gtav-enhanced', name: 'GTAV Enhanced', data: { type: 'rockstarOfficial', title: 'GTAV Enhanced' } };
  const asked = [];
  const steam = {
    getGameData: async ({ appID }) => {
      asked.push(appID);
      return { appid: appID, name: 'Grand Theft Auto V Enhanced', img: {}, achievement: { total: 1, list: [{ name: 'ACH01' }] } };
    },
  };
  const game = await rockstar.getGameData(record, 'english', { resolveSteamAppId: async () => 3240220, steam });
  assert.deepEqual(asked, [3240220]);
  assert.equal(game.appid, 'rockstar-gtav-enhanced');
  assert.equal(game.steamappid, 3240220);
  assert.equal(game.source, 'Rockstar Games');
  assert.equal(game.name, 'Grand Theft Auto V Enhanced');
  assert.equal(game.achievement.total, 1);
});

test('a title with no Steam release still shows, with an empty list', async () => {
  const record = { appid: 'rockstar-unknown-title', name: 'Unknown Title', data: { type: 'rockstarOfficial', title: 'Unknown Title' } };
  const steam = { getGameData: async () => assert.fail('no Steam appid, no Steam request') };
  const game = await rockstar.getGameData(record, 'english', { resolveSteamAppId: async () => null, steam });
  assert.equal(game.name, 'Unknown Title');
  assert.equal(game.achievement.total, 0);
});

test('the label wears the Social Club badge and counts as an owned copy', () => {
  assert.equal(sourceIdentity.libraryBadgeOf('Rockstar Games'), 'socialclub');
  assert.equal(sourceIdentity.purchasedPlatformOf('Rockstar Games'), 'rockstar');
});
