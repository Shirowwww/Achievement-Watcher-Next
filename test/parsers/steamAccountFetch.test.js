'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const steamAccount = require('../../app/parser/steamAccount.js');

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-lib-'));

function fakeFetch(routes) {
  return async (url) => {
    for (const [fragment, body] of Object.entries(routes)) {
      if (String(url).includes(fragment)) return jsonResponse(body);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

/*
  GetOwnedGames refuses a request with no steamid: the token says who is calling, not which library
  it means. Omitting it silently returned 173 games listed, 0 owned, 0 stale.
*/
test('the owned-games request carries the steamid', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return jsonResponse({ response: { games: [{ appid: 440, name: 'Team Fortress 2' }] } });
  };
  const library = await steamAccount.fetchLibrary({ token: 'T', steamid: '76561198235048344', fetchImpl });
  assert.deepEqual(library.owned, ['440']);
  const owned = seen.find((url) => url.includes('GetOwnedGames'));
  assert.ok(owned.includes('steamid=76561198235048344'), `steamid absent de ${owned}`);
});

test('with no steamid, no network call is made', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse({});
  };
  const library = await steamAccount.fetchLibrary({ token: 'T', steamid: '', fetchImpl });
  assert.equal(called, false);
  assert.deepEqual(library.owned, []);
});

test('a GetOwnedGames failure is logged, never swallowed silently', async () => {
  const lines = [];
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await steamAccount.fetchLibrary({ token: 'T', steamid: '76561198235048344', fetchImpl, log: (m) => lines.push(m) });
  assert.ok(
    lines.some((line) => /401/.test(line)),
    `aucune ligne ne rapporte l echec: ${JSON.stringify(lines)}`
  );
});

test('owned games and their names are read from GetOwnedGames', async () => {
  const fetchImpl = fakeFetch({
    GetOwnedGames: { response: { games: [{ appid: 440, name: 'Team Fortress 2' }, { appid: 570, name: 'Dota 2' }] } },
    GetFamilyGroupForUser: { response: { family_groupid: '0' } },
  });
  const library = await steamAccount.fetchLibrary({ token: 'T', steamid: '76561198235048344', fetchImpl });
  assert.deepEqual(library.owned.sort(), ['440', '570']);
  assert.deepEqual(library.family, []);
  assert.equal(library.names.get('440'), 'Team Fortress 2');
});

/*
  GetOwnedGames already carries the playtime of every entry; reading it costs nothing extra. Steam
  counts in minutes, the local counter in seconds.
*/
test('Steam playtime is read alongside the library', async () => {
  const fetchImpl = fakeFetch({
    GetOwnedGames: {
      response: {
        games: [
          { appid: 440, name: 'Team Fortress 2', playtime_forever: 125, rtime_last_played: 1700000000 },
          { appid: 570, name: 'Dota 2', playtime_forever: 0, rtime_last_played: 0 },
        ],
      },
    },
    GetFamilyGroupForUser: { response: { family_groupid: '0' } },
  });
  const library = await steamAccount.fetchLibrary({ token: 'T', steamid: '76561198235048344', fetchImpl });
  assert.deepEqual(library.playtime.get('440'), { seconds: 125 * 60, lastPlayed: 1700000000 });
  // A game never launched does not deserve an entry: it teaches the local counter nothing.
  assert.equal(library.playtime.has('570'), false);
});

test('playtime survives the disk cache', async () => {
  const cacheFile = path.join(cacheDir, 'playtime.json');
  const fetchImpl = fakeFetch({
    GetOwnedGames: { response: { games: [{ appid: 440, name: 'TF2', playtime_forever: 30, rtime_last_played: 1700000000 }] } },
    GetFamilyGroupForUser: { response: { family_groupid: '0' } },
  });
  await steamAccount.loadLibrary({ cacheFile, token: 'T', steamid: '76561198235048344', fetchImpl, now: 1000, ttlMs: 10000 });

  let called = false;
  const reread = await steamAccount.loadLibrary({
    cacheFile,
    token: 'T',
    steamid: '76561198235048344',
    fetchImpl: async () => {
      called = true;
      throw new Error('ne doit pas etre appele');
    },
    now: 2000,
    ttlMs: 10000,
  });
  assert.equal(called, false);
  assert.deepEqual(reread.playtime.get('440'), { seconds: 1800, lastPlayed: 1700000000 });
});

test('the Family library is read when a group exists', async () => {
  const fetchImpl = fakeFetch({
    GetOwnedGames: { response: { games: [{ appid: 440, name: 'Team Fortress 2' }] } },
    GetFamilyGroupForUser: { response: { family_groupid: '123' } },
    GetSharedLibraryApps: { response: { apps: [{ appid: 730, name: 'CS2', owner_steamids: ['76561198000000001'] }] } },
  });
  const library = await steamAccount.fetchLibrary({ token: 'T', steamid: '76561198235048344', fetchImpl });
  assert.deepEqual(library.family, ['730']);
  assert.equal(library.names.get('730'), 'CS2');
  assert.deepEqual(library.owners.get('730'), ['76561198000000001']);
});

test('a network failure returns an empty library rather than throwing', async () => {
  const fetchImpl = async () => {
    throw new Error('offline');
  };
  const library = await steamAccount.fetchLibrary({ token: 'T', steamid: '76561198235048344', fetchImpl });
  assert.deepEqual(library.owned, []);
  assert.deepEqual(library.family, []);
});

test('with no token, no network call is made', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse({});
  };
  const library = await steamAccount.fetchLibrary({ token: '', fetchImpl });
  assert.equal(called, false);
  assert.deepEqual(library.owned, []);
});

/*
  A cache written by an earlier version is fresh and yet incomplete: it is missing fields added
  since. Serving it as-is returned an empty playtime Map with no signal, and playtime stayed absent
  until the cache expired. The shape is therefore versioned: a cache from another version is ignored
  as if it did not exist.
*/
test('a cache written by an earlier version is ignored, not served incomplete', async () => {
  const cacheFile = path.join(cacheDir, 'ancienne-version.json');
  fs.writeFileSync(
    cacheFile,
    JSON.stringify({ savedAt: 1000, owned: ['440'], family: [], names: {}, owners: {} }),
    'utf8'
  );

  const fetchImpl = fakeFetch({
    GetOwnedGames: { response: { games: [{ appid: 4000, name: "Garry's Mod", playtime_forever: 600, rtime_last_played: 1700000000 }] } },
    GetFamilyGroupForUser: { response: { family_groupid: '0' } },
  });
  const library = await steamAccount.loadLibrary({ cacheFile, token: 'T', steamid: '76561198235048344', fetchImpl, now: 1500, ttlMs: 10000 });

  assert.deepEqual(library.owned, ['4000']);
  assert.deepEqual(library.playtime.get('4000'), { seconds: 36000, lastPlayed: 1700000000 });

  // And the rewritten file carries the current version, so the next read accepts it.
  const rewritten = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert.equal(rewritten.version, steamAccount.LIBRARY_CACHE_VERSION);
});

test('a fresh cache is served with no network call at all', async () => {
  const cacheFile = path.join(cacheDir, 'fresh.json');
  fs.writeFileSync(
    cacheFile,
    JSON.stringify({ version: steamAccount.LIBRARY_CACHE_VERSION, savedAt: 1000, owned: ['440'], family: ['730'], names: { 440: 'TF2' }, owners: { 730: ['76561198000000001'] } }),
    'utf8'
  );

  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error('ne doit pas etre appele');
  };
  const library = await steamAccount.loadLibrary({ cacheFile, token: 'T', steamid: '76561198235048344', fetchImpl, now: 2000, ttlMs: 10000 });

  assert.equal(called, false);
  assert.deepEqual(library.owned, ['440']);
  assert.deepEqual(library.family, ['730']);
  assert.equal(library.names.get('440'), 'TF2');
  assert.deepEqual(library.owners.get('730'), ['76561198000000001']);
});

test('a stale cache triggers a new call and is rewritten', async () => {
  const cacheFile = path.join(cacheDir, 'stale.json');
  fs.writeFileSync(cacheFile, JSON.stringify({ version: steamAccount.LIBRARY_CACHE_VERSION, savedAt: 1000, owned: ['440'], family: [], names: {}, owners: {} }), 'utf8');

  const fetchImpl = fakeFetch({
    GetOwnedGames: { response: { games: [{ appid: 570, name: 'Dota 2' }] } },
    GetFamilyGroupForUser: { response: { family_groupid: '0' } },
  });
  const library = await steamAccount.loadLibrary({ cacheFile, token: 'T', steamid: '76561198235048344', fetchImpl, now: 999999, ttlMs: 10000 });

  assert.deepEqual(library.owned, ['570']);
  assert.deepEqual(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).owned, ['570']);
});

test('a network failure never replaces an existing cache with an empty one', async () => {
  const cacheFile = path.join(cacheDir, 'keep.json');
  fs.writeFileSync(cacheFile, JSON.stringify({ version: steamAccount.LIBRARY_CACHE_VERSION, savedAt: 1000, owned: ['440'], family: [], names: {}, owners: {} }), 'utf8');

  const fetchImpl = async () => {
    throw new Error('offline');
  };
  const library = await steamAccount.loadLibrary({ cacheFile, token: 'T', steamid: '76561198235048344', fetchImpl, now: 999999, ttlMs: 10000 });

  assert.deepEqual(library.owned, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).owned, ['440']);
});
