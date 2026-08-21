'use strict';

/*
  The legit-Steam source is gated on "is this local Steam account's profile public?", and that
  question is answered over the network. `whoIs` used to swallow every failure into `{}`, which the
  caller reads as "not public" - so with no connection every account looked private and the source
  threw itself out of the scan. Measured on a real offline run: 58 of 215 games survived.

  A profile confirmed public on an earlier scan does not become private because the network is down.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const steamIdPath = path.join(__dirname, '..', '..', 'app', 'util', 'steamID.js');
const steamID = require(steamIdPath);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
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

test('a genuinely private profile is still reported as private, not as offline', () =>
  withScratch(async (root) => {
    steamID.whoIs = async () => ({ privacyState: 'private', steamID: 'someone' });
    await assert.rejects(
      () => steam.getSteamUsers(root),
      (err) => String(err) === 'Public profile: none.',
      'a real answer must keep its own error, so the log still tells the two cases apart'
    );
  }));
