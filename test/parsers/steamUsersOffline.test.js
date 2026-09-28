'use strict';

/*
  The legit-Steam source is gated on whether the local account's profile is public, answered over the
  network. `whoIs` used to swallow every failure into `{}`, read as "not public" - so offline every
  account looked private and the source threw itself out (58 of 215 games survived on one real run).
  A profile confirmed public earlier must not become private just because the network is down.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const steamIdPath = path.join(__dirname, '..', '..', 'app', 'util', 'steamID.js');
const steamID = require(steamIdPath);

// getSteamUsers() enumerates real local accounts from HKCU/Software/Valve/Steam/Users before it ever
// reaches steamID.whoIs() below - on a developer's machine with Steam installed that answers with
// whatever accounts are really configured there, on a CI runner it answers with none at all, so
// "No Steam User ID found" that the fixture below (account '274782616') never gets a chance to match.
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '../util/reg') {
    return {
      readRegistryString: () => '',
      readRegistryStringAndExpand: () => '',
      regKeyExists: () => true,
      readRegistryInteger: () => 0,
      listRegistryAllSubkeys: () => ['274782616'],
    };
  }
  return originalLoad.apply(this, arguments);
};
const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));
Module._load = originalLoad;

test('a transport failure is told apart from a real answer about the account', () => {
  for (const err of [{ code: 'ENOTFOUND' }, { code: 'ECONNREFUSED' }, new Error('socket hang up'), new Error('read ETIMEDOUT')]) {
    assert.equal(steamID.isTransportFailure(err), true, `${err.code || err.message} means the question never reached Steam`);
  }
  for (const err of [{ code: 404 }, { code: 403 }, { code: 500 }]) {
    assert.equal(steamID.isTransportFailure(err), false, `HTTP ${err.code} came from a live host and is an answer`);
  }
});

async function withScratch(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-users-'));
  const previousWhoIs = steamID.whoIs;
  try {
    steam.initDebug({ isDev: false, userDataPath: root });
    return await run(root);
  } finally {
    steamID.whoIs = previousWhoIs;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const USERS = [{ user: '274782616', id: '76561198235048344', name: 'someone', profile: { privacyState: 'public' } }];

test('a profile confirmed public earlier survives a scan that cannot reach Steam', () =>
  withScratch((root) => {
    const file = path.join(root, 'steam_cache', 'steamUsers.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(USERS));

    steamID.whoIs = async () => ({ networkError: true });
    return steam.getSteamUsers(root).then((users) => {
      assert.deepEqual(users, USERS, 'the last confirmed answer stands in while the check cannot run');
    });
  }));

test('an offline scan never writes a verdict it could not verify', () =>
  withScratch(async (root) => {
    steamID.whoIs = async () => ({ networkError: true });
    await steam.getSteamUsers(root).catch(() => {});
    assert.equal(fs.existsSync(path.join(root, 'steam_cache', 'steamUsers.json')), false, 'nothing was confirmed, so nothing is recorded');
  }));

// Issue #91: unlocks come from the local appcache, which needs no profile. A private account (or a
// SteamTools/LuaTools setup Valve will not report on) must keep the legit-Steam source.
test('a private profile is kept as a local-only account', () =>
  withScratch(async (root) => {
    steamID.whoIs = async () => ({ privacyState: 'private', steamID: 'someone' });
    const users = await steam.getSteamUsers(root);
    assert.equal(users.length, 1);
    assert.equal(users[0].user, '274782616');
    assert.equal(users[0].name, 'someone');
    assert.equal(users[0].local, true);
    assert.equal(fs.existsSync(path.join(root, 'steam_cache', 'steamUsers.json')), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'steam_cache', 'steamUsers.json'), 'utf8')), [], 'only confirmed public profiles are remembered');
  }));

test('an account never seen online is named from loginusers.vdf', () =>
  withScratch(async (root) => {
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'config', 'loginusers.vdf'),
      '"users"\n{\n\t"76561198235048344"\n\t{\n\t\t"AccountName"\t\t"acct"\n\t\t"PersonaName"\t\t"Local Name"\n\t}\n}\n'
    );
    steamID.whoIs = async () => ({ networkError: true });
    const users = await steam.getSteamUsers(root);
    assert.deepEqual(users, [{ user: '274782616', id: '76561198235048344', name: 'Local Name', profile: null, local: true }]);
  }));
