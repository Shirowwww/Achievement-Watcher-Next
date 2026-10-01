'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ra = require('../../app/parser/retroAchievements.js');

const KEY = 'AbCdEf0123456789AbCdEf0123456789';

function tempUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-retroach-'));
  ra.setUserDataPath(dir);
  return dir;
}

// A fetch double answering by endpoint name; records every call so a test can count them.
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    calls.push({ endpoint, params: Object.fromEntries(url.searchParams) });
    const route = routes[endpoint];
    const answer = typeof route === 'function' ? route(url.searchParams) : route;
    const status = answer && answer.status ? answer.status : 200;
    const body = answer && answer.status ? answer.body : answer;
    const retryAfter = answer && answer.retryAfter;
    return { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (name) => (name === 'retry-after' && retryAfter ? String(retryAfter) : null) } };
  };
  impl.calls = calls;
  return impl;
}

const SONIC = {
  ID: 1,
  Title: 'Sonic the Hedgehog',
  ConsoleName: 'Mega Drive',
  ImageIcon: '/Images/067895.png',
  ImageTitle: '/Images/054993.png',
  ImageIngame: '/Images/000010.png',
  ImageBoxArt: '/Images/051872.png',
  NumDistinctPlayers: 200,
  Achievements: {
    9: { ID: 9, NumAwarded: 150, Title: 'That Was Easy', Description: 'Act 1', Points: 3, BadgeName: '250336', DisplayOrder: 2, type: 'progression', DateEarned: '2016-03-12 17:47:29', DateEarnedHardcore: '2016-03-12 17:47:29' },
    10: { ID: 10, NumAwarded: 10, Title: 'Faster', Description: 'Speed', Points: 10, BadgeName: '250337', DisplayOrder: 1, DateEarned: '2017-01-01 00:00:00' },
    11: { ID: 11, NumAwarded: 2, Title: 'Rare', Description: 'Hard', Points: 25, BadgeName: '250338', DisplayOrder: 3 },
  },
};

test('game ids are namespaced so they never collide with a Steam appid', () => {
  assert.equal(ra.toAppid(1), 'ra-1');
  assert.equal(ra.toAppid('ra-0042'), 'ra-42');
  assert.equal(ra.normalizeGameId('ra-1446'), '1446');
  assert.equal(ra.normalizeGameId('abc'), '');
  assert.equal(ra.normalizeGameId('0'), '');
  assert.equal(ra.isRetroAchievementsAppid('ra-12'), true);
  assert.equal(ra.isRetroAchievementsAppid('12'), false);
});

test('dates are read as UTC, the way the API writes them', () => {
  assert.equal(ra.parseDate('2016-03-12 17:47:29'), Date.UTC(2016, 2, 12, 17, 47, 29) / 1000);
  assert.equal(ra.parseDate('2024-04-23T21:28:49+00:00'), Date.UTC(2024, 3, 23, 21, 28, 49) / 1000);
  assert.equal(ra.parseDate(''), 0);
  assert.equal(ra.parseDate(null), 0);
});

test('a game answer becomes a schema in display order, with rarity, badges and unlock state', () => {
  const { schema, state } = ra.buildGameRecord(SONIC);
  assert.equal(schema.name, 'Sonic the Hedgehog (Mega Drive)');
  assert.equal(schema.source, 'RetroAchievements');
  assert.deepEqual(
    schema.achievement.list.map((a) => a.name),
    ['10', '9', '11']
  );
  const first = schema.achievement.list[1];
  assert.equal(first.displayName, 'That Was Easy');
  assert.equal(first.icon, 'https://media.retroachievements.org/Badge/250336.png');
  assert.equal(first.icongray, 'https://media.retroachievements.org/Badge/250336_lock.png');
  assert.equal(first.rarityPct, 75);
  assert.equal(first.points, 3);
  assert.equal(schema.img.portrait, 'https://media.retroachievements.org/Images/051872.png');
  assert.equal(schema.img.header, 'https://media.retroachievements.org/Images/054993.png');
  assert.deepEqual(state['9'], { earned: true, earned_time: ra.parseDate('2016-03-12 17:47:29'), hardcore: true });
  assert.deepEqual(state['10'], { earned: true, earned_time: ra.parseDate('2017-01-01 00:00:00'), hardcore: false });
  assert.equal(state['11'], undefined, 'an achievement not earned has no state entry');
});

test('merging keeps a live unlock the fetch had not seen yet and drops achievements the set removed', () => {
  const schemaList = [{ name: '1' }, { name: '2' }];
  const merged = ra.mergeState(
    { 1: { earned: true, earned_time: 500 }, 3: { earned: true, earned_time: 100 } },
    { 1: { earned: true, earned_time: 400, hardcore: true }, 2: { earned: false } },
    schemaList
  );
  assert.deepEqual(merged, { 1: { earned: true, earned_time: 400, hardcore: true } });
});

test('connect checks the key against the API, then stores it encrypted', async () => {
  tempUserData();
  const fetch = fakeFetch({ 'API_GetUserProfile.php': { User: 'MaxMilyin', ULID: '00003EMFWR7XB8SDPEHB3K56ZQ' } });
  const result = await ra.connect({ username: 'maxmilyin', apiKey: KEY }, { fetch });
  assert.equal(result.username, 'MaxMilyin', 'the canonical spelling from the API is kept');
  assert.equal(fetch.calls[0].params.y, KEY);
  assert.equal(fs.readFileSync(ra.authFile(), 'utf8').includes(KEY), false, 'the key is never written in clear');
  assert.deepEqual(ra.status(), { connected: true, username: 'MaxMilyin' });
  ra.clearAuth();
  assert.deepEqual(ra.status(), { connected: false });
});

test('connect rejects an unknown user and a refused key without storing anything', async () => {
  tempUserData();
  await assert.rejects(ra.connect({ username: 'nobody', apiKey: KEY }, { fetch: fakeFetch({ 'API_GetUserProfile.php': {} }) }), {
    code: 'retroachievements-user-not-found',
  });
  await assert.rejects(
    ra.connect({ username: 'someone', apiKey: KEY }, { fetch: fakeFetch({ 'API_GetUserProfile.php': { status: 401, body: { message: 'Unauthenticated.' } } }) }),
    { code: 'retroachievements-unauthorized' }
  );
  await assert.rejects(ra.connect({ username: 'someone', apiKey: 'short' }), { code: 'retroachievements-api-key-invalid' });
  assert.equal(fs.existsSync(ra.authFile()), false);
});

test('an API failure never carries the key in its message', async () => {
  const fetch = fakeFetch({ 'API_GetUserProfile.php': { status: 500, body: null } });
  const err = await ra.apiGet('API_GetUserProfile.php', { username: 'a', apiKey: KEY }, {}, { fetch, retries: 0 }).catch((e) => e);
  assert.equal(err.code, 'retroachievements-http-500');
  assert.equal(String(err.message).includes(KEY), false);
  assert.equal(String(err.stack).includes(KEY), false);
});

test('import writes every played game, then skips the ones whose completion row did not move', async () => {
  tempUserData();
  const auth = { username: 'MaxMilyin', apiKey: KEY };
  const completion = {
    Count: 2,
    Total: 2,
    Results: [
      { GameID: 1, Title: 'Sonic the Hedgehog', ConsoleName: 'Mega Drive', MaxPossible: 3, NumAwarded: 2, NumAwardedHardcore: 1, MostRecentAwardedDate: '2017-01-01T00:00:00+00:00' },
      { GameID: 2, Title: 'No Set', ConsoleName: 'NES', MaxPossible: 0, NumAwarded: 0 },
    ],
  };
  const routes = { 'API_GetUserCompletionProgress.php': completion, 'API_GetGameInfoAndUserProgress.php': SONIC };
  const fetch = fakeFetch(routes);

  const first = await ra.importLibrary({ auth, fetch, delayMs: 0 });
  assert.deepEqual({ created: first.created, skipped: first.skipped, failed: first.failed }, { created: 1, skipped: 1, failed: 0 });
  assert.deepEqual(ra.listCachedTitles(), ['ra-1']);
  assert.equal(ra.cachedTitleName('ra-1'), 'Sonic the Hedgehog (Mega Drive)');

  const again = fakeFetch(routes);
  const second = await ra.importLibrary({ auth, fetch: again, delayMs: 0 });
  assert.equal(second.unchanged, 1);
  assert.equal(again.calls.filter((c) => c.endpoint === 'API_GetGameInfoAndUserProgress.php').length, 0, 'an unchanged game costs no request');

  completion.Results[0].NumAwarded = 3;
  const third = await ra.importLibrary({ auth, fetch: fakeFetch(routes), delayMs: 0 });
  assert.equal(third.updated, 1, 'a game with new unlocks is fetched again');
});

test('a refused key stops the import instead of failing every game one by one', async () => {
  tempUserData();
  const fetch = fakeFetch({ 'API_GetUserCompletionProgress.php': { status: 401, body: {} } });
  await assert.rejects(ra.importLibrary({ auth: { username: 'a', apiKey: KEY }, fetch, delayMs: 0 }), { code: 'retroachievements-unauthorized' });
});

test('the library reads the cached game with its unlocks', async () => {
  tempUserData();
  ra.writeGame('1', SONIC);
  const game = await ra.getGameData('ra-1');
  assert.equal(game.appid, 'ra-1');
  assert.equal(game.source, 'RetroAchievements');
  assert.equal(game.achievement.total, 3);
  assert.equal(game.achievement.unlocked, 2);
  assert.deepEqual(Object.keys(ra.getAchievements('ra-1')).sort(), ['10', '9']);
  assert.equal(await ra.getGameData('ra-999'), null);
});

test('live unlocks are recorded in the cache before the next import', () => {
  tempUserData();
  ra.writeGame('1', SONIC);
  ra.recordUnlocks('1', [{ achievementId: '11', time: 1700000000, hardcore: true }]);
  assert.deepEqual(ra.readState('1')['11'], { earned: true, earned_time: 1700000000, hardcore: true });
});

test('recent unlocks are normalized and sorted oldest first', async () => {
  const fetch = fakeFetch({
    'API_GetUserRecentAchievements.php': [
      { Date: '2024-01-01 10:05:00', HardcoreMode: 1, AchievementID: 20, Title: 'B', GameID: 5, GameTitle: 'Game', ConsoleName: 'SNES', BadgeURL: '/Badge/7.png', Points: 5 },
      { Date: '2024-01-01 10:00:00', HardcoreMode: 0, AchievementID: 19, Title: 'A', GameID: 5, GameTitle: 'Game', ConsoleName: 'SNES', BadgeName: '6' },
      { Date: '2024-01-01 10:00:00', AchievementID: 'x', GameID: 5 },
    ],
  });
  const unlocks = await ra.fetchRecentUnlocks({ username: 'a', apiKey: KEY }, 2.4, { fetch });
  assert.equal(fetch.calls[0].params.m, '3', 'the window is rounded up to whole minutes');
  assert.deepEqual(
    unlocks.map((u) => [u.achievementId, u.hardcore, u.icon]),
    [
      ['19', false, 'https://media.retroachievements.org/Badge/6.png'],
      ['20', true, 'https://media.retroachievements.org/Badge/7.png'],
    ]
  );
  assert.equal(unlocks[0].gameName, 'Game (SNES)');
});

test('a 429 is reported with its Retry-After to a caller that cannot wait', async () => {
  const fetch = fakeFetch({ 'API_GetUserRecentAchievements.php': { status: 429, body: {}, retryAfter: 232 } });
  await assert.rejects(ra.fetchRecentUnlocks({ username: 'a', apiKey: KEY }, 3, { fetch }), (err) => {
    assert.equal(err.code, 'retroachievements-rate-limited');
    assert.equal(err.retryAfterMs, 232000);
    return true;
  });
  assert.equal(fetch.calls.length, 1, 'no retry burns more of the allowance');
});

test('the import waits out a short rate limit and says so', async () => {
  tempUserData();
  let limited = true;
  const progress = [];
  const fetch = fakeFetch({
    'API_GetUserCompletionProgress.php': { Total: 1, Results: [{ GameID: 1, MaxPossible: 3, NumAwarded: 2, MostRecentAwardedDate: '2024-01-01' }] },
    'API_GetGameInfoAndUserProgress.php': () => {
      if (!limited) return SONIC;
      limited = false;
      return { status: 429, body: {}, retryAfter: 1 };
    },
  });
  const result = await ra.importLibrary({ auth: { username: 'a', apiKey: KEY }, fetch, delayMs: 0, onProgress: (p) => progress.push(p) });
  assert.equal(result.created, 1);
  assert.ok(progress.some((p) => p.rateLimitedMs === 1000), 'the wait is reported so Settings can show it');
});

test('an import stopped by the rate limit resumes, most recently played first', async () => {
  tempUserData();
  const auth = { username: 'a', apiKey: KEY };
  const completion = {
    Total: 2,
    Results: [
      { GameID: 1, MaxPossible: 3, NumAwarded: 2, MostRecentAwardedDate: '2020-01-01' },
      { GameID: 2, MaxPossible: 3, NumAwarded: 1, MostRecentAwardedDate: '2024-06-01' },
    ],
  };
  let blocked = false;
  const routes = {
    'API_GetUserCompletionProgress.php': completion,
    'API_GetGameInfoAndUserProgress.php': (params) => {
      if (blocked) return { status: 429, body: {}, retryAfter: 232 };
      blocked = true;
      return { ...SONIC, ID: Number(params.get('g')) };
    },
  };
  const fetch = fakeFetch(routes);
  const first = await ra.importLibrary({ auth, fetch, delayMs: 0, maxRateWaitMs: 0 });
  assert.equal(fetch.calls.find((c) => c.endpoint === 'API_GetGameInfoAndUserProgress.php').params.g, '2', 'the most recent game goes first');
  assert.deepEqual({ created: first.created, failed: first.failed, rateLimited: first.rateLimited }, { created: 1, failed: 0, rateLimited: true });

  blocked = false;
  const second = await ra.importLibrary({ auth, fetch: fakeFetch(routes), delayMs: 0, maxRateWaitMs: 0 });
  assert.deepEqual({ created: second.created, unchanged: second.unchanged, rateLimited: second.rateLimited }, { created: 1, unchanged: 1, rateLimited: false });
});

test('connecting another account drops the previous account games, reconnecting the same one keeps them', async () => {
  tempUserData();
  const profile = (name) => fakeFetch({ 'API_GetUserProfile.php': { User: name } });
  await ra.connect({ username: 'First', apiKey: KEY }, { fetch: profile('First') });
  ra.writeGame('1', SONIC);
  await ra.connect({ username: 'first', apiKey: KEY }, { fetch: profile('First') });
  assert.deepEqual(ra.listCachedTitles(), ['ra-1'], 'same account, library kept');
  await ra.connect({ username: 'Second', apiKey: KEY }, { fetch: profile('Second') });
  assert.deepEqual(ra.listCachedTitles(), [], 'another account starts empty');
});

test('the "No Screenshot Found" stand-in is not taken as art, even from an older cache', async () => {
  tempUserData();
  const { schema } = ra.buildGameRecord({ ...SONIC, ImageBoxArt: '/Images/000002.png', ImageTitle: '/Images/000002.png' });
  assert.equal(schema.img.portrait, '');
  assert.equal(schema.img.header, 'https://media.retroachievements.org/Images/000010.png', 'the in-game shot stands in for the title');
  ra.writeGame('1', SONIC);
  const file = path.join(ra.cacheRoot(), '1', 'schema.json');
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  old.img.portrait = 'https://media.retroachievements.org/Images/000002.png';
  fs.writeFileSync(file, JSON.stringify(old));
  assert.equal((await ra.getGameData('ra-1')).img.portrait, '');
});
