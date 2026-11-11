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

/*
  Unlocks: Rockstar's API answers by number, metadata.dat numbers the names. The list shown is in
  the user's language, so the Steam release's English list does the matching.
*/
const ENGLISH_LIST = [
  { name: 'ACH00', displayName: 'Welcome to Los Santos' },
  { name: 'ACH27', displayName: 'Wanted: Alive or Alive' },
  { name: 'ACH42', displayName: 'Blitzed' },
];
// Rockstar's order: Welcome = 1, Blitzed = 2, Wanted = 3.
const ROCKSTAR_NAMES = ['Welcome to Los Santos', 'Blitzed', 'Wanted: Alive Or Alive'];

function metadataFile(t) {
  const dir = tempDir(t);
  const strings = ROCKSTAR_NAMES.flatMap((name) => [name, 'earned', 'locked']);
  const pool = Buffer.from(strings.join(''), 'utf8');
  const header = Buffer.alloc(36);
  Buffer.from([1, 0, 2, 0]).copy(header, 0);
  [7, 99, 1, strings.length, strings.length, 0, strings.length * 2, pool.length].forEach((v, i) => header.writeUInt32BE(v, 4 + i * 4));
  const offsets = Buffer.alloc(strings.length * 2);
  let end = 0;
  strings.forEach((s, i) => offsets.writeUInt16BE((end += Buffer.byteLength(s)), i * 2));
  const file = path.join(dir, 'metadata.dat');
  fs.writeFileSync(file, Buffer.concat([header, offsets, pool]));
  return file;
}

const enhancedRecord = { appid: 'rockstar-gtav-enhanced', name: 'GTAV Enhanced', data: { type: 'rockstarOfficial', title: 'GTAV Enhanced' } };
// The French list the library shows: same api names, Steam's own translations.
const frenchGame = {
  steamappid: 3240220,
  achievement: { list: [{ name: 'ACH00', displayName: 'Bienvenue à Los Santos' }, { name: 'ACH27', displayName: 'Recherché' }, { name: 'ACH42', displayName: 'Éclair' }] },
};
const englishSteam = { getGameData: async ({ lang }) => ({ achievement: { list: lang === 'english' ? ENGLISH_LIST : [] } }) };

test('the account unlocks land on the right achievements, by name and not by list order', async (t) => {
  const file = metadataFile(t);
  const asked = [];
  const invoke = async (channel, request) => {
    asked.push([channel, request]);
    return { ok: true, awarded: { 2: 1700000000, 3: 1700000100 } };
  };
  const unlocks = await rockstar.getAchievements(enhancedRecord, frenchGame, { invoke, steam: englishSteam, metadataFiles: () => [file] });
  assert.deepEqual(asked, [['rockstar:awarded', { title: 'gtav', platform: 'pcalt' }]]);
  assert.deepEqual(unlocks, { ACH42: { earned: true, earned_time: 1700000000 }, ACH27: { earned: true, earned_time: 1700000100 } });
});

test('no account, an API error or no matching metadata.dat shows nothing unlocked', async (t) => {
  const file = metadataFile(t);
  const options = (answer, files = [file]) => ({ invoke: async () => answer, steam: englishSteam, metadataFiles: () => files });
  assert.deepEqual(await rockstar.getAchievements(enhancedRecord, frenchGame, options({ ok: false, error: 'rockstar-not-connected' })), {});
  assert.deepEqual(await rockstar.getAchievements(enhancedRecord, frenchGame, options(null)), {});
  assert.deepEqual(await rockstar.getAchievements(enhancedRecord, frenchGame, options({ ok: true, awarded: { 1: 1 } }, [])), {});
});

test('a title the API does not know is never asked about', async () => {
  const record = { appid: 'rockstar-bully', name: 'Bully', data: { type: 'rockstarOfficial', title: 'Bully' } };
  const invoke = async () => assert.fail('no request for an unknown title');
  assert.deepEqual(await rockstar.getAchievements(record, frenchGame, { invoke, steam: englishSteam }), {});
  assert.deepEqual(rockstar.apiTitleOf('Grand Theft Auto V'), { title: 'gtav', platform: 'pc' });
  assert.deepEqual(rockstar.apiTitleOf('L.A. Noire'), { title: 'lan', platform: 'pc' });
});

test('the label wears the Social Club badge and counts as an owned copy', () => {
  assert.equal(sourceIdentity.libraryBadgeOf('Rockstar Games'), 'socialclub');
  assert.equal(sourceIdentity.purchasedPlatformOf('Rockstar Games'), 'rockstar');
});
