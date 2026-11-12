'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHltbClient } = require('../../app/util/hltb.js');

// Trimmed from a live answer for "God of War" (2026-11-12): two games of that exact name.
const GOD_OF_WAR_ANSWER = {
  count: 21,
  pageCurrent: 1,
  pageTotal: 2,
  pageSize: 20,
  data: [
    { game_id: 38050, game_name: 'God of War', game_alias: 'God of War (PS4)', game_type: 'game', comp_main: 74042, comp_plus: 118472, comp_100: 183758, comp_all: 118331, comp_all_count: 10249, count_comp: 27783, profile_platform: 'PC, PlayStation 4', release_world: 2018 },
    { game_id: 3974, game_name: 'God of War', game_alias: 'God of War HD', game_type: 'game', comp_main: 32702, comp_plus: 36445, comp_100: 48073, comp_all: 34891, comp_all_count: 2449, count_comp: 8200, profile_platform: 'PlayStation 2, PlayStation 3, PlayStation Vita', release_world: 2005 },
    { game_id: 83146, game_name: 'God of War: Ragnarök', game_alias: 'God of War: Ragnarok', game_type: 'game', comp_main: 95741, comp_plus: 146604, comp_100: 200752, comp_all: 157042, comp_all_count: 6642, count_comp: 11898, profile_platform: 'PC, PlayStation 4, PlayStation 5', release_world: 2022 },
  ],
};
const ELDEN_RING = { game_id: 68151, game_name: 'Elden Ring', comp_main: 216469, comp_plus: 365143, comp_100: 490392, comp_all_count: 10722, count_comp: 21777, release_world: 2022 };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// A fake site: home page, one script holding the search call, init and search endpoints.
function fakeSite({ path = '/api/search/site', pageHasPath = true, init = { token: 'tok-1' }, answer = () => GOD_OF_WAR_ANSWER, searchStatuses = [] } = {}) {
  const calls = [];
  const statuses = [...searchStatuses];
  const fetchImpl = async (url, options = {}) => {
    const { pathname } = new URL(url);
    calls.push({ pathname, method: options.method || 'GET', headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null, signal: options.signal });
    if (pathname === '/') return new Response('<html><script src="/_next/static/chunks/app-1.js"></script><script src="/_next/static/chunks/other.js"></script></html>');
    if (pathname === '/_next/static/chunks/app-1.js') return new Response(pageHasPath ? `x=1;fetch("${path}",{method:"POST",headers:{}})` : 'x=1');
    if (pathname === '/_next/static/chunks/other.js') return new Response('y=2');
    if (pathname.endsWith('/init')) return json(init);
    if (options.method === 'POST') {
      const status = statuses.shift();
      if (status) return new Response('', { status });
      return json(answer(options.body ? JSON.parse(options.body) : null));
    }
    return new Response('', { status: 404 });
  };
  return { fetchImpl, calls, searches: () => calls.filter((call) => call.method === 'POST'), inits: () => calls.filter((call) => call.pathname.endsWith('/init')) };
}

test('an exact title resolves to its times in whole seconds and a numeric-id url', async () => {
  const site = fakeSite();
  const result = await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War');
  assert.deepEqual(result, { id: 38050, name: 'God of War', main: 74042, extra: 118472, complete: 183758, url: 'https://howlongtobeat.com/game/38050' });
});

test('the request carries the token, referer, origin and the split search terms', async () => {
  const site = fakeSite();
  await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War');
  const [search] = site.searches();
  assert.equal(search.pathname, '/api/search/site');
  assert.equal(search.headers['x-auth-token'], 'tok-1');
  assert.equal(search.headers.Origin, 'https://howlongtobeat.com');
  assert.equal(search.headers.Referer, 'https://howlongtobeat.com/');
  assert.ok(search.headers['User-Agent'].startsWith('Mozilla/'));
  assert.equal(search.headers['x-hp-key'], undefined);
  const [init] = site.inits();
  assert.equal(init.headers.Referer, 'https://howlongtobeat.com/');
  assert.equal(init.headers.Origin, 'https://howlongtobeat.com');
  assert.deepEqual(search.body.searchTerms, ['God', 'of', 'War']);
  assert.equal(search.body.searchType, 'games');
  assert.ok(search.signal instanceof AbortSignal);
});

test('a key and value from init are sent as headers and in the body', async () => {
  const site = fakeSite({ init: { token: 'tok-1', hpKey: 'ign_abc', hpVal: 'v-123' } });
  await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War');
  const [search] = site.searches();
  assert.equal(search.headers['x-hp-key'], 'ign_abc');
  assert.equal(search.headers['x-hp-val'], 'v-123');
  assert.equal(search.body.ign_abc, 'v-123');
});

test('several exact matches: the release year wins, else the most completions', async () => {
  const client = createHltbClient({ fetchImpl: fakeSite().fetchImpl });
  assert.equal((await client.lookup('God of War', { year: 2005 })).id, 3974);
  assert.equal((await client.lookup('God of War', { year: 2018 })).id, 38050);
  assert.equal((await client.lookup('God of War', { year: 1999 })).id, 38050);
  assert.equal((await client.lookup('God of War')).id, 38050);
});

test('titles are compared without case, trademark signs, accents or punctuation', async () => {
  const client = createHltbClient({ fetchImpl: fakeSite().fetchImpl });
  assert.equal((await client.lookup('GOD OF WAR™')).id, 38050);
  assert.equal((await client.lookup('God of War: Ragnarok')).id, 83146);
  assert.equal((await client.lookup('God of War Ragnarök')).id, 83146);
  assert.equal(await client.lookup('God of War Ragnarok 2'), null);
});

test('no exact match gives null, never the closest game', async () => {
  const site = fakeSite({ answer: () => ({ data: [ELDEN_RING, { ...ELDEN_RING, game_id: 2, game_name: 'Elden Ring: Nightreign' }] }) });
  assert.equal(await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('Elden'), null);
  assert.equal(await createHltbClient({ fetchImpl: fakeSite({ answer: () => ({ data: [] }) }).fetchImpl }).lookup('Nothing Here'), null);
});

test('a network failure gives undefined and does not throw', async () => {
  const client = createHltbClient({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await client.lookup('God of War'), undefined);
});

test('a persistent 500 gives undefined after one retry', async () => {
  const site = fakeSite({ searchStatuses: [500, 500, 500] });
  assert.equal(await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War'), undefined);
  assert.equal(site.searches().length, 2);
});

test('an answer of an unexpected shape gives undefined', async () => {
  const site = fakeSite({ answer: () => ({ hello: 'world' }) });
  assert.equal(await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War'), undefined);
});

test('a 403 throws the token away, rediscovers once and retries once', async () => {
  const site = fakeSite({ searchStatuses: [403] });
  const result = await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War');
  assert.equal(result.id, 38050);
  assert.equal(site.inits().length, 2);
  assert.equal(site.searches().length, 2);
  assert.equal(site.calls.filter((call) => call.pathname === '/').length, 2);
});

test('a second 403 in a row gives undefined, not a loop', async () => {
  const site = fakeSite({ searchStatuses: [403, 403, 403] });
  assert.equal(await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War'), undefined);
  assert.equal(site.searches().length, 2);
});

test('a moved search path is read from the page scripts', async () => {
  const site = fakeSite({ path: '/api/locate/site' });
  assert.equal((await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War')).id, 38050);
  assert.equal(site.inits()[0].pathname, '/api/locate/site/init');
  assert.equal(site.searches()[0].pathname, '/api/locate/site');
});

test('without a path in the page the last known default path is used', async () => {
  const site = fakeSite({ pageHasPath: false });
  assert.equal((await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War')).id, 38050);
  assert.equal(site.searches()[0].pathname, '/api/search/site');
});

test('discovery and token are kept, and concurrent lookups share one discovery', async () => {
  const site = fakeSite();
  const client = createHltbClient({ fetchImpl: site.fetchImpl });
  await Promise.all([client.lookup('God of War'), client.lookup('God of War', { year: 2005 })]);
  await client.lookup('God of War');
  assert.equal(site.inits().length, 1);
  assert.equal(site.calls.filter((call) => call.pathname === '/').length, 1);
});

test('an edition suffix is removed only when the first exact search found nothing', async () => {
  const site = fakeSite({ answer: (body) => ({ data: body.searchTerms.join(' ') === 'Elden Ring' ? [ELDEN_RING] : [] }) });
  const client = createHltbClient({ fetchImpl: site.fetchImpl });
  assert.equal((await client.lookup('Elden Ring - Definitive Edition')).id, 68151);
  assert.deepEqual(site.searches().map((call) => call.body.searchTerms.join(' ')), ['Elden Ring - Definitive Edition', 'Elden Ring']);

  const direct = fakeSite({ answer: () => ({ data: [{ ...ELDEN_RING, game_name: 'Elden Ring Remastered' }] }) });
  assert.equal((await createHltbClient({ fetchImpl: direct.fetchImpl }).lookup('Elden Ring Remastered')).id, 68151);
  assert.equal(direct.searches().length, 1);
});

test('hostile values are rejected: negative or huge times, a non-numeric id, a huge name', async () => {
  const hostile = [
    { ...ELDEN_RING, comp_main: -5 },
    { ...ELDEN_RING, comp_plus: 1e30 },
    { ...ELDEN_RING, comp_100: 'abc' },
    { ...ELDEN_RING, game_id: '68151/../../evil' },
    { ...ELDEN_RING, game_id: 1.5 },
    { ...ELDEN_RING, game_name: 'Elden Ring'.padEnd(5000, ' ') },
    null,
    'text',
  ];
  const client = createHltbClient({ fetchImpl: fakeSite({ answer: () => ({ data: hostile }) }).fetchImpl });
  assert.equal(await client.lookup('Elden Ring'), null);
});

test('missing times become 0 and a hostile one does not hide a good game', async () => {
  const site = fakeSite({ answer: () => ({ data: [{ ...ELDEN_RING, comp_main: -1 }, { game_id: 9, game_name: 'Elden Ring', release_world: 2022 }] }) });
  const result = await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('Elden Ring');
  assert.deepEqual(result, { id: 9, name: 'Elden Ring', main: 0, extra: 0, complete: 0, url: 'https://howlongtobeat.com/game/9' });
});

test('a hostile init answer gives undefined', async () => {
  const site = fakeSite({ init: { token: 'x'.repeat(5000) } });
  assert.equal(await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('God of War'), undefined);
});

test('an empty title gives null without any request', async () => {
  const site = fakeSite();
  assert.equal(await createHltbClient({ fetchImpl: site.fetchImpl }).lookup('   '), null);
  assert.equal(site.calls.length, 0);
});
