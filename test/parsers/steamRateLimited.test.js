'use strict';

/*
  Issue #55: a library of 192 GSE save folders rendered most of its games as a bare AppID with an
  empty achievement list, and rescanning about ten times was the only cure. The scan asks Steam's
  hosts faster than they allow, so the refusals arrived as an unnamed, untyped product-info answer -
  and the achievement list that the keyless chain HAD successfully fetched was then discarded,
  because "no type" was read as "not a game".

  These tests pin the two halves of that: the type gate must only fire on a type Steam actually
  named, and a schema fetched while the metadata call was refused must survive into the game record.
*/

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let steamData = {};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcRenderer: {
        sendSync: () => false,
        invoke: async (channel, payload) => {
          if (channel !== 'get-steam-data') return null;
          const type = (payload && payload.type) || '';
          const answer = steamData[type];
          return typeof answer === 'function' ? answer(payload) : answer;
        },
      },
    };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const steam = require('../../app/parser/steam.js');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-throttle-'));
fs.mkdirSync(path.join(userData, 'steam_cache', 'schema'), { recursive: true });
fs.writeFileSync(
  path.join(userData, 'steam_cache', 'schema', 'appList.json'),
  JSON.stringify([{ appid: 4018950, name: 'Lost Wiki: Kozlovka' }])
);
steam.initDebug({ isDev: false, userDataPath: userData });

const schemaFile = (appid) => path.join(userData, 'steam_cache', 'schema', 'english', `${appid}.db`);

const SCHEMA = [
  { name: 'ACH_ONE', displayName: 'First find', description: 'Found the first page', hidden: 0, icon: '', icongray: '' },
  { name: 'ACH_TWO', displayName: 'Second find', description: 'Found the second page', hidden: 0, icon: '', icongray: '' },
];

test('an unknown product type keeps a schema that was actually fetched', () => {
  // Steam never said what this appid is: the metadata call was refused or the host was unreachable.
  assert.equal(steam.shouldKeepFetchedAchievements({}), true);
  assert.equal(steam.shouldKeepFetchedAchievements({ isGame: false, productType: '' }), true);
  assert.equal(steam.shouldKeepFetchedAchievements({ appid: 1, networkError: true }), true);
  assert.equal(steam.shouldKeepFetchedAchievements(undefined), true);
});

test('a type Steam did name, and that is not a game, still drops the list', () => {
  // The rule this gate was written for: a DLC or a soundtrack must not inherit the base game's
  // achievements from a title-matched lookup.
  assert.equal(steam.shouldKeepFetchedAchievements({ isGame: false, productType: 'dlc' }), false);
  assert.equal(steam.shouldKeepFetchedAchievements({ isGame: false, productType: 'music' }), false);
  assert.equal(steam.shouldKeepFetchedAchievements({ isGame: false, productType: 'demo' }), false);
  assert.equal(steam.shouldKeepFetchedAchievements({ isGame: true, productType: 'game' }), true);
});

test('a refused metadata call no longer empties a game that has achievements', async () => {
  // The reported case, appid and all: the keyless schema chain answered, the product-info call did
  // not. Before the fix this produced a tile named "4018950" with zero achievements.
  steamData = {
    common: { appid: 4018950, networkError: true },
    steamhunters: { appid: 4018950, achievements: SCHEMA, source: 'official' },
    steamgroups: { ok: false, groups: [] },
  };
  fs.rmSync(schemaFile(4018950), { force: true });

  const game = await steam.getGameData({ appID: 4018950, lang: 'english', showHidden: false, fastStart: true });

  assert.ok(game, 'the game must resolve');
  assert.equal(game.name, 'Lost Wiki: Kozlovka', 'the app-list name stands in for the refused lookup');
  assert.equal(game.achievement.total, 2, 'the fetched schema must not be thrown away');
  assert.deepEqual(
    game.achievement.list.map((a) => a.name),
    ['ACH_ONE', 'ACH_TWO']
  );
});

test('a named non-game keeps its empty list even when a lookup returns achievements', async () => {
  steamData = {
    common: { appid: 4018951, name: 'Lost Wiki: Kozlovka Soundtrack', isGame: false, productType: 'music' },
    steamhunters: { appid: 4018951, achievements: SCHEMA, source: 'official' },
    steamgroups: { ok: false, groups: [] },
  };
  fs.rmSync(schemaFile(4018951), { force: true });

  const game = await steam.getGameData({ appID: 4018951, lang: 'english', showHidden: false, fastStart: true });

  assert.ok(game);
  assert.equal(game.achievement.total, 0, 'a soundtrack does not inherit the base game schema');
});

test('a rate-limited scan does not blacklist the games it could not reach', async () => {
  /*
    The three-day negative cache exists for an AppID Steam really has no record of. A refused
    metadata call produces the same nameless answer, and used to be written to it: the game then
    stopped being looked up at all for three days, which is what turned "rescan and some come back"
    into "rescan ten times" (issue #55).
  */
  const unresolvedFile = path.join(userData, 'steam_cache', 'unresolved.json');
  fs.rmSync(unresolvedFile, { force: true });
  steam.forgetUnresolved();

  steamData = {
    // Nothing answered about the product: no store page, no product info, no SteamHunters record.
    common: { appid: 999000111, networkError: true },
    steamhunters: { appid: 999000111, achievements: [], source: 'steamhunters' },
    steamgroups: { ok: false, groups: [] },
    name: '',
  };

  const game = await steam.getGameData({ appID: 999000111, lang: 'english', showHidden: false, fastStart: true });
  assert.equal(game, undefined, 'an unresolved appid still resolves to nothing for this scan');

  const remembered = fs.existsSync(unresolvedFile) ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf8')) : {};
  assert.ok(!('999000111' in remembered), 'a refusal must not be remembered as "this AppID does not exist"');
});

test('an AppID Steam really answered about is still remembered as a miss', async () => {
  // The rule the negative cache is there for must survive the fix above.
  const unresolvedFile = path.join(userData, 'steam_cache', 'unresolved.json');
  fs.rmSync(unresolvedFile, { force: true });
  steam.forgetUnresolved();

  steamData = {
    // Steam answered: it just has nothing under this id (no name, no type, no network error).
    common: { appid: 999000222 },
    steamhunters: { appid: 999000222, achievements: [], source: 'steamhunters' },
    steamgroups: { ok: false, groups: [] },
    name: '',
  };

  await steam.getGameData({ appID: 999000222, lang: 'english', showHidden: false, fastStart: true });

  const remembered = fs.existsSync(unresolvedFile) ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf8')) : {};
  assert.ok('999000222' in remembered, 'a real miss is still worth remembering');
});

test('a transient outage flag never reaches the schema on disk', () => {
  /*
    networkError and metadataUnanswered describe one lookup, not the game. A name recovered from
    another source makes a record carrying one of them worth caching, and writing the flag with it
    would carry a moment's rate limiting into the cache for as long as that schema lives.
  */
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'), 'utf8');
  const write = source.slice(source.indexOf('if (needSaving) {'), source.indexOf('not caching a schema with no name'));

  assert.match(write, /const \{ networkError: _networkError, metadataUnanswered: _metadataUnanswered, \.\.\.record \} = result;/);
  assert.match(write, /fs\.writeFileSync\(filePath, JSON\.stringify\(record, null, 2\)\)/);
  assert.doesNotMatch(write, /JSON\.stringify\(result/, 'the raw result must not be the thing written');
});

test('a game keeps the achievements that were fetched even when nothing could name it', async () => {
  /*
    The name and the achievement list come from different hosts. The reporter's logs show 589 games
    losing both because only the naming half had failed: the schema was fetched and then thrown away
    with the game. Half an answer is worth more than none, and the title arrives on the next scan.
  */
  steamData = {
    // Every naming source silent: no store page, no product info, no app-list entry.
    common: { appid: 777000111 },
    steamhunters: { appid: 777000111, achievements: SCHEMA, source: 'official' },
    steamgroups: { ok: false, groups: [] },
    name: '',
  };
  fs.rmSync(schemaFile(777000111), { force: true });

  const game = await steam.getGameData({ appID: 777000111, lang: 'english', showHidden: false, fastStart: true });

  assert.ok(game, 'the game must survive a failed naming lookup');
  assert.equal(game.achievement.total, 2, 'its achievements were fetched and must be kept');
  assert.ok(!game.name, 'and it is handed over unnamed for the caller to label');
  assert.equal(fs.existsSync(schemaFile(777000111)), false, 'a nameless record is still never cached');
});

test('a game with no name AND no achievements is still treated as a miss', async () => {
  // The keep-what-was-found rule must not turn every unknown AppID into a permanent empty tile.
  steamData = {
    common: { appid: 777000222 },
    steamhunters: { appid: 777000222, achievements: [], source: 'steamhunters' },
    steamgroups: { ok: false, groups: [] },
    name: '',
  };

  const game = await steam.getGameData({ appID: 777000222, lang: 'english', showHidden: false, fastStart: true });
  assert.equal(game, undefined, 'nothing was found, so nothing is returned');
});
