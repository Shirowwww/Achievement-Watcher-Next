'use strict';

/*
  Issue #80, second half. Listing the games an account owns is only useful if their progress comes
  with them: Steam writes a stats file the moment a game reports one HERE, so a game played on
  another PC had nothing local to read and every tile sat at 0%.

  The account is the authority on its own unlocks. Issue #98: the Web API endpoint first used here
  refuses the session token (400, "key is missing") for every game, and that refusal was cached as
  "no stats" across whole libraries. The keyless GetUserAchievements answers for a public profile;
  the community XML page it replaced answered "all locked" when the game details are hidden.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const { makeTempDir } = require('../helpers/tempDir');

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

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

// Trimmed real answers (2026-10). The schema names achievements by internal key, key 0 included.
const SCHEMA = {
  response: {
    schema_hash: 860090977,
    achievements: [
      { internal_name: 'FIRST', internal_key: 0 },
      { internal_name: 'SECOND', internal_key: 1, max_progress_int: 10 },
      { internal_name: 'THIRD', internal_key: 2 },
    ],
  },
};
const PLAYER_STATS = {
  response: {
    schema_hash: 860090977,
    groups: [{ groupid: 0, is_achievable: true, completed_achievements: 1, is_completed: false }],
    achievements: [
      { internal_key: 0, unlocked: true, unlock_time: 1712253396 },
      { internal_key: 1, progress_int: 4 },
    ],
  },
};
// What Steam sends for hidden game details, and for a game without stats.
const EMPTY = { response: {} };

// Answers the player call with `player` and the schema call with `schema`, recording every URL.
function steamApi({ player = PLAYER_STATS, schema = SCHEMA, asked = [] } = {}) {
  return async (url) => {
    asked.push(url);
    if (url.includes('/GetUserAchievements/')) return typeof player === 'function' ? player() : json(player);
    if (url.includes('/GetGameAchievements/')) return json(schema);
    throw new Error(`unexpected request ${url}`);
  };
}

let profileNumber = 0;
// Each test its own profile: a private answer is remembered per profile for six hours.
const freshAccount = () => ({ ...ACCOUNT, steamid: String(76561197971376739n + BigInt(++profileNumber)) });

function scratch() {
  const root = fs.realpathSync(makeTempDir('aw-acct-unlocks-'));
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

test('GetUserAchievements gives the unlocks of the connected account, mapped by internal key', async () => {
  const unlocks = await steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '101', fetchImpl: steamApi() });
  assert.deepEqual(unlocks, [
    { apiname: 'FIRST', achieved: 1, unlocktime: 1712253396 },
    { apiname: 'SECOND', achieved: 0, unlocktime: 0, progress: 4, max_progress: 10 },
    { apiname: 'THIRD', achieved: 0, unlocktime: 0 },
  ]);
});

test('the request names the profile and the game, and never sends the session token', async () => {
  const asked = [];
  const account = freshAccount();
  await steamAccount.fetchPlayerAchievements({ ...account, appid: '102', fetchImpl: steamApi({ asked }) });
  assert.match(asked[0], new RegExp(`^https://api\\.steampowered\\.com/IPlayerService/GetUserAchievements/v1/\\?appid=102&steamid=${account.steamid}$`));
  assert.ok(asked.every((url) => !url.includes(ACCOUNT.token)), 'a token in a URL ends up in logs and proxies');
});

test('the schema is asked once per game while its hash holds', async () => {
  const asked = [];
  const fetchImpl = steamApi({ asked });
  await steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '103', fetchImpl });
  await steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '103', fetchImpl });
  assert.equal(asked.filter((url) => url.includes('/GetGameAchievements/')).length, 1);
});

test('a game with no stats reads as an empty list, which is safe to cache', async () => {
  const fetchImpl = steamApi({ player: EMPTY, schema: EMPTY });
  assert.deepEqual(await steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '104', fetchImpl }), []);
});

// The #98 failure: a refusal read as "no stats" and cached over every game of the library.
test('a refusal, hidden game details or a dead host throws instead of reporting nothing unlocked', async () => {
  const refused = steamApi({ player: () => json({}, false, 400) });
  await assert.rejects(steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '105', fetchImpl: refused }), /http-400/);
  await assert.rejects(steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '105', fetchImpl: steamApi({ player: EMPTY }) }), /private/);
  const dead = async () => {
    throw new Error('fetch failed');
  };
  await assert.rejects(steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '105', fetchImpl: dead }), /fetch failed/);
});

test('a private profile is asked once, not once per game', async () => {
  const account = freshAccount();
  const asked = [];
  const fetchImpl = steamApi({ player: EMPTY, asked });
  for (const appid of ['10', '20', '30']) await assert.rejects(steamAccount.fetchPlayerAchievements({ ...account, appid, fetchImpl }), /private/);
  assert.equal(asked.filter((url) => url.includes('/GetUserAchievements/')).length, 1);
});

test('an empty list cached before the fix is asked again, a newer one is trusted', async () => {
  const root = scratch();
  const statsDir = path.join(root, 'appcache', 'stats');
  fs.mkdirSync(statsDir, { recursive: true });
  const cacheFile = path.join(root, 'steam_cache', 'user', USER.user, `${APPID}.db`);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, '[]');
  const real = steamAccount.fetchPlayerAchievements;
  let calls = 0;
  steamAccount.fetchPlayerAchievements = async () => {
    calls += 1;
    return [{ apiname: 'first', achieved: 1, unlocktime: 1712253396 }];
  };
  try {
    const before = new Date(Date.UTC(2026, 9, 4));
    fs.utimesSync(cacheFile, before, before);
    const healed = await steam.getAchievementsFromAPI({ appID: APPID, user: USER, path: statsDir, account: ACCOUNT });
    assert.equal(calls, 1, 'the poisoned empty list is not served');
    assert.equal(healed[0].achieved, 1);
    fs.writeFileSync(cacheFile, '[]');
    const after = new Date(Math.max(Date.now(), Date.UTC(2026, 9, 5)));
    fs.utimesSync(cacheFile, after, after);
    await steam.getAchievementsFromAPI({ appID: APPID, user: USER, path: statsDir, account: ACCOUNT });
    assert.equal(calls, 1, 'an empty answer written now is a real one and stays cached');
  } finally {
    steamAccount.fetchPlayerAchievements = real;
  }
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

test('a request is cut short by the caller signal, on top of its own timeout', async () => {
  const seen = [];
  const fetchImpl = (url, options) => {
    seen.push(options.signal);
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
  };
  const controller = new AbortController();
  const pending = steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: '106', fetchImpl, signal: controller.signal });
  controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aborted, true);
});

// Runs last: it opens the module's breaker for ten minutes. #137: seven games each held a scan
// worker for about 32s after Steam had answered 429, waiting out two 15s timeouts.
test('opening the breaker releases the requests already waiting on Steam', async () => {
  const root = scratch();
  const statsDir = path.join(root, 'appcache', 'stats');
  fs.mkdirSync(statsDir, { recursive: true });
  const real = steamAccount.fetchPlayerAchievements;
  const hung = [];
  const SAFETY_MS = 5000;
  steamAccount.fetchPlayerAchievements = async ({ appid, signal }) => {
    if (appid.startsWith('7')) {
      hung.push(signal);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve([{ apiname: 'LATE', achieved: 1, unlocktime: 1 }]), SAFETY_MS);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error('steam-api-http-429');
  };
  const read = (appID) => steam.getAchievementsFromAPI({ appID, user: USER, path: statsDir, account: ACCOUNT });
  try {
    const started = Date.now();
    const waiting = ['701', '702', '703'].map(read);
    for (const appID of ['801', '802', '803']) await read(appID);
    const results = await Promise.all(waiting);
    assert.ok(Date.now() - started < SAFETY_MS / 2, 'the waiting reads end when the breaker opens, not at their timeout');
    assert.equal(hung.length, 3);
    assert.ok(hung.every((signal) => signal.aborted));
    assert.deepEqual(results, [[], [], []], 'a cancelled read leaves the game at its local answer');
    assert.ok(!fs.existsSync(path.join(root, 'steam_cache', 'user', USER.user, '701.db')), 'nothing is cached from a cancelled read');
  } finally {
    steamAccount.fetchPlayerAchievements = real;
  }
});
