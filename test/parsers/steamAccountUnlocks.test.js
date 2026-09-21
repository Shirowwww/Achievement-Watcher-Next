'use strict';

/*
  Issue #80, second half. Listing the games an account owns is only useful if their progress comes
  with them: Steam writes a stats file the moment a game reports one HERE, so a game played on
  another PC had nothing local to read and every tile sat at 0%.

  The account is the authority on its own unlocks, and the token answers for a private profile too,
  which the community XML page the older path scrapes does not.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  return originalLoad.apply(this, arguments);
};
const steam = require('../../app/parser/steam.js');
const steamAccount = require('../../app/parser/steamAccount.js');
Module._load = originalLoad;

const APPID = '1091500';
const ACCOUNT = { token: 'token', steamid: '76561197971376739' };
const USER = { user: '11111111', id: ACCOUNT.steamid, name: 'me' };

function reply(body, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => body });
}

const PLAYER_STATS = {
  playerstats: {
    steamID: ACCOUNT.steamid,
    gameName: 'Hades',
    success: true,
    achievements: [
      { apiname: 'FIRST', achieved: 1, unlocktime: 1712253396 },
      { apiname: 'SECOND', achieved: 0, unlocktime: 0 },
    ],
  },
};

function scratch() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-acct-unlocks-')));
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  steam.initDebug({ isDev: false, userDataPath: root });
  steam.setUserDataPath(root);
  return root;
}

// The whole point: no UserGameStats bin for this appid, because the game never ran here.
async function readWithNoLocalStats({ account = ACCOUNT, fetchPlayerAchievements } = {}) {
  const root = scratch();
  const statsDir = path.join(root, 'appcache', 'stats');
  fs.mkdirSync(statsDir, { recursive: true });
  const real = steamAccount.fetchPlayerAchievements;
  if (fetchPlayerAchievements) steamAccount.fetchPlayerAchievements = fetchPlayerAchievements;
  try {
    const result = await steam.getAchievementsFromAPI({ appID: APPID, user: USER, path: statsDir, account });
    return { result, cacheFile: path.join(root, 'steam_cache', 'user', USER.user, `${APPID}.db`), root };
  } finally {
    steamAccount.fetchPlayerAchievements = real;
  }
}

test('the API call reads unlocks for the connected account', async () => {
  const unlocks = await steamAccount.fetchPlayerAchievements({ ...ACCOUNT, appid: APPID, fetchImpl: reply(PLAYER_STATS) });
  assert.deepEqual(unlocks, [
    { apiname: 'FIRST', achieved: 1, unlocktime: 1712253396 },
    { apiname: 'SECOND', achieved: 0, unlocktime: 0 },
  ]);
});

test('the call carries the token and the steamid, and asks for no language', async () => {
  let asked = '';
  await steamAccount.fetchPlayerAchievements({
    ...ACCOUNT,
    appid: APPID,
    fetchImpl: async (url) => {
      asked = url;
      return { ok: true, status: 200, json: async () => PLAYER_STATS };
    },
  });
  assert.match(asked, /GetPlayerAchievements/);
  assert.match(asked, new RegExp(`access_token=${ACCOUNT.token}`));
  assert.match(asked, new RegExp(`steamid=${ACCOUNT.steamid}`));
  assert.match(asked, new RegExp(`appid=${APPID}`));
  assert.ok(!/[?&]l=/.test(asked), 'only apiname/achieved/unlocktime are read, so no language is needed');
});

// Steam answers 400 for an app that publishes no stats. That is a fact about the game, not an
// outage: it must read as "no achievements" so it is cached instead of retried every scan.
test('an app with no stats reads as an empty list, not as a failure', async () => {
  const unlocks = await steamAccount.fetchPlayerAchievements({ ...ACCOUNT, appid: APPID, fetchImpl: reply({}, false, 400) });
  assert.deepEqual(unlocks, []);
});

test('a call that could not be made throws rather than reporting nothing unlocked', async () => {
  await assert.rejects(
    () =>
      steamAccount.fetchPlayerAchievements({
        ...ACCOUNT,
        appid: APPID,
        fetchImpl: async () => {
          throw new Error('fetch failed');
        },
      }),
    /fetch failed/
  );
});

test('a game with no local stats file is read from the account', async () => {
  const { result, cacheFile } = await readWithNoLocalStats({
    fetchPlayerAchievements: async () => [{ apiname: 'FIRST', achieved: 1, unlocktime: 1712253396 }],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].achieved, 1);
  assert.ok(fs.existsSync(cacheFile), 'the answer is cached so the next scan does not ask again');
});

test('with no connected account the old answer stands: nothing unlocked', async () => {
  const { result } = await readWithNoLocalStats({
    account: null,
    fetchPlayerAchievements: async () => {
      throw new Error('must not be called without an account');
    },
  });
  assert.deepEqual(result, []);
});

test('a fresh cache is served instead of asking Steam again', async () => {
  const root = scratch();
  const statsDir = path.join(root, 'appcache', 'stats');
  fs.mkdirSync(statsDir, { recursive: true });
  const cacheFile = path.join(root, 'steam_cache', 'user', USER.user, `${APPID}.db`);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify([{ apiname: 'CACHED', achieved: 1, unlocktime: 1 }]));

  const real = steamAccount.fetchPlayerAchievements;
  let called = false;
  steamAccount.fetchPlayerAchievements = async () => {
    called = true;
    return [];
  };
  try {
    const result = await steam.getAchievementsFromAPI({ appID: APPID, user: USER, path: statsDir, account: ACCOUNT });
    assert.equal(called, false, 'a library of several hundred games is several hundred requests otherwise');
    assert.equal(result[0].apiname, 'CACHED');
  } finally {
    steamAccount.fetchPlayerAchievements = real;
  }
});

test('an unreachable Steam leaves the game at its local answer instead of failing the scan', async () => {
  const { result } = await readWithNoLocalStats({
    fetchPlayerAchievements: async () => {
      throw new Error('ENOTFOUND api.steampowered.com');
    },
  });
  assert.deepEqual(result, []);
});

// A whole library is one request per game, which is the traffic shape Steam answers with 429. The
// default transport test does not read an HTTP status as a reason to stop, so the breaker was given
// one - without it every remaining game would take its own refusal.
test('rate limiting and server errors open the breaker, not just a dead host', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'), 'utf8');
  const from = source.indexOf('const accountUnlocksCircuit');
  assert.ok(from > -1, 'the account-unlocks breaker must still exist');
  const declaration = source.slice(from, source.indexOf('});', from));
  assert.match(declaration, /429/, 'a throttled Steam must count towards opening the breaker');
  assert.match(declaration, /5\\d\\d/, 'so must a server error');
});
