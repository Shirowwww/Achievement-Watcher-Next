'use strict';

/*
  Issue #80, second half. Listing the games an account owns is only useful if their progress comes
  with them: Steam writes a stats file the moment a game reports one HERE, so a game played on
  another PC had nothing local to read and every tile sat at 0%.

  The account is the authority on its own unlocks. Issue #98: the Web API endpoint first used here
  refuses the session token (400, "key is missing") for every game, and that refusal was cached as
  "no stats" across whole libraries. The community XML page answers for a public profile.
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
  return async () => ({ ok, status, text: async () => body });
}

// The shape steamcommunity.com/profiles/<id>/stats/<appid>/achievements/?xml=1 returns, apinames
// lowercased as it sends them.
const PLAYER_STATS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<playerstats>
  <privacyState>public</privacyState>
  <visibilityState>3</visibilityState>
  <game><gameFriendlyName>Hades</gameFriendlyName><gameName>Hades</gameName></game>
  <achievements>
    <achievement closed="1">
      <iconClosed><![CDATA[https://cdn/first.jpg]]></iconClosed>
      <name><![CDATA[First]]></name>
      <apiname><![CDATA[first]]></apiname>
      <description><![CDATA[Do it once]]></description>
      <unlockTimestamp>1712253396</unlockTimestamp>
    </achievement>
    <achievement closed="0">
      <name><![CDATA[Second]]></name>
      <apiname><![CDATA[second]]></apiname>
      <description><![CDATA[Do it twice]]></description>
    </achievement>
  </achievements>
</playerstats>`;

let profileNumber = 0;
// Each test its own profile: a private answer is remembered per profile for six hours.
const freshAccount = () => ({ ...ACCOUNT, steamid: String(76561197971376739n + BigInt(++profileNumber)) });

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

test('the community page gives the unlocks of the connected account', async () => {
  const unlocks = await steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: APPID, fetchImpl: reply(PLAYER_STATS) });
  assert.deepEqual(unlocks, [
    { apiname: 'first', achieved: 1, unlocktime: 1712253396 },
    { apiname: 'second', achieved: 0, unlocktime: 0 },
  ]);
});

test('the request names the profile and the game, and never sends the session token', async () => {
  let asked = '';
  const account = freshAccount();
  await steamAccount.fetchPlayerAchievements({
    ...account,
    appid: APPID,
    fetchImpl: async (url) => {
      asked = url;
      return { ok: true, status: 200, text: async () => PLAYER_STATS };
    },
  });
  assert.match(asked, new RegExp(`^https://steamcommunity\\.com/profiles/${account.steamid}/stats/${APPID}/achievements/\\?xml=1`));
  assert.ok(!asked.includes(ACCOUNT.token), 'a token in a URL ends up in logs and proxies');
});

test('a game with no stats reads as an empty list, which is safe to cache', async () => {
  const xml = '<?xml version="1.0"?><response><error><![CDATA[Requested app has no stats]]></error></response>';
  assert.deepEqual(await steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: APPID, fetchImpl: reply(xml) }), []);
});

// The #98 failure: a refusal read as "no stats" and cached over every game of the library.
test('a refusal, an error page or a private profile throws instead of reporting nothing unlocked', async () => {
  await assert.rejects(steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: APPID, fetchImpl: reply('<h1>Bad Request</h1>', false, 400) }), /http-400/);
  await assert.rejects(steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: APPID, fetchImpl: reply('<html>Sign in</html>') }), /unreadable/);
  await assert.rejects(
    steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: APPID, fetchImpl: reply('<response><error><![CDATA[This profile is private.]]></error></response>') }),
    /private/
  );
  await assert.rejects(
    steamAccount.fetchPlayerAchievements({ ...freshAccount(), appid: APPID, fetchImpl: async () => { throw new Error('fetch failed'); } }),
    /fetch failed/
  );
});

test('a private profile is asked once, not once per game', async () => {
  const account = freshAccount();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return { ok: true, status: 200, text: async () => '<response><error><![CDATA[This profile is private.]]></error></response>' };
  };
  for (const appid of ['10', '20', '30']) await assert.rejects(steamAccount.fetchPlayerAchievements({ ...account, appid, fetchImpl }), /private/);
  assert.equal(requests, 1);
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
