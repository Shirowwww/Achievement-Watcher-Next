'use strict';

// A cold scan (empty cache) hits the network for everything at once - a real 215-game run showed
// serialized SteamDB lookups re-paying an uncached miss every scan, a rate-limited store endpoint
// whose refusals were parsed as schema and aborted resolution, and offline hosts retried with no
// breaker. init.js cannot be required outside Electron, so these are assertions about its source.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const initSource = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');

function sliceFunction(name, source = initSource) {
  const start = source.indexOf(name);
  assert.ok(start !== -1, `${name} not found`);
  const rest = source.slice(start);
  const end = rest.indexOf('\n}\n');
  return rest.slice(0, end === -1 ? rest.length : end);
}

test('a SteamDB cover page that lists nothing is cached as the answer it is', () => {
  const covers = sliceFunction('async function fetchSteamDbAssets');
  const write = covers.indexOf('fs.writeFileSync(cacheFile');
  assert.ok(write !== -1, 'the scrape must persist its result');
  const guard = covers.slice(covers.lastIndexOf('if (', write), write);
  assert.ok(
    !/urls\.length/.test(guard),
    'the cache write must not be conditional on finding assets - an empty list is a real answer and re-scraping it costs 8s a game, every scan'
  );
  assert.ok(guard.includes('generation === artworkCacheGeneration'), 'but a cleared cache must still discard an in-flight result');
});

test('a cached miss expires sooner than a cached hit', () => {
  assert.ok(initSource.includes('STEAMDB_COVERS_MISS_TTL'), 'misses need their own TTL');
  const covers = sliceFunction('async function fetchSteamDbAssets');
  assert.ok(
    covers.includes('cached.urls.length ? STEAMDB_COVERS_TTL : STEAMDB_COVERS_MISS_TTL'),
    'a game can gain a capsule later, so a miss must be re-checked before a hit is'
  );
});

test('the SteamDB cover scrape has its own breaker and only a reached page writes a miss', () => {
  const covers = sliceFunction('async function fetchSteamDbAssets');
  const guardAt = covers.indexOf('steamdbCoversCircuit.unavailable()');
  const scrapeAt = covers.indexOf('const scrape =');
  assert.ok(guardAt !== -1 && guardAt < scrapeAt, 'an unreachable host must be answered from the breaker, not by opening a page per game');
  assert.ok(covers.includes('steamdbCoversCircuit.recordSuccess()'), 'a page that loaded closes the breaker');

  const failure = covers.slice(covers.indexOf('} catch (err) {'));
  assert.ok(failure.includes('steamdbCoversCircuit.recordFailure(err)'), 'a failed navigation opens it');
  assert.ok(!failure.includes('writeFileSync'), 'and must never write a miss - a navigation that never landed proves nothing about the game');
});

test('a refused store lookup is not parsed as if it were a schema', () => {
  const fetchStore = sliceFunction('async function fetchStoreAppDetails');
  assert.ok(fetchStore.includes('!res.ok'), 'an HTTP error is not JSON');
  assert.ok(/content-type/i.test(fetchStore), 'and neither is an HTML block page served under a 200');
  assert.ok(fetchStore.includes('res.json().catch(() => null)'), 'a body that does not parse must not throw');
  assert.ok(fetchStore.includes('if (!json)'), 'a throttled call answers with a bare null body - dereferencing it is the 162 TypeErrors');
  assert.ok(fetchStore.includes('storeAppDetailsCircuit.unavailable()'), 'and once it starts refusing, stop asking for the rest of the scan');
});

test('the store lookup is optional, so its failure cannot abort name resolution', () => {
  const resolve = sliceFunction('async function resolveSteamData');
  const storeAt = resolve.indexOf('fetchStoreAppDetails(appid)');
  const productAt = resolve.indexOf('fetchSteamProductInfo(appid)');
  assert.ok(storeAt !== -1 && productAt !== -1 && storeAt < productAt);
  assert.ok(
    !/await fetch\(storeURL/.test(resolve),
    'the raw store fetch threw on a rate-limited response and skipped product info entirely - that is why the schema had no name and was never cached'
  );
});

test('concurrent identical metadata lookups share one answer', () => {
  assert.ok(initSource.includes('const steamDataInFlight = new Map()'));
  const wrapper = sliceFunction('async function getSteamData(request)');
  assert.ok(wrapper.includes('COALESCED_STEAM_TYPES.has(type)'), 'only the read-only lookups coalesce');
  assert.ok(wrapper.includes('steamDataInFlight.delete(key)'), 'the entry lasts only as long as the request is in flight');
  assert.ok(wrapper.includes('copySteamData(await pending)'), 'callers mutate what they receive, so each gets its own copy');

  const coalesced = initSource.slice(initSource.indexOf('const COALESCED_STEAM_TYPES'));
  assert.ok(!/COALESCED_STEAM_TYPES = new Set\(\[[^\]]*'user'/.test(coalesced), "'user' depends on which profile is asked - it must not share an answer");
});

test('SteamGridDB gets the same breaker treatment as the Steam hosts', () => {
  assert.ok(initSource.includes('sgdbCircuit = createNetworkCircuit('), 'artwork is requested per game; offline that is one timeout each');
  assert.ok(initSource.includes('shouldCount: isSteamTransportFailure'), 'only transport failures count - an HTTP answer means the host is up');

  const byAppid = sliceFunction('async function fetchSteamGridDbGameIdBySteamAppid');
  assert.ok(byAppid.includes('steamGridDbUnavailable()'), 'the appid lookup must consult the breaker');
  assert.ok(
    byAppid.includes('{ value: null, networkError: true }'),
    'and report the skip as the network error it is, so the caller keeps the tile recoverable'
  );
  assert.ok(byAppid.includes('sgdbCircuit.recordSuccess()'), 'a reachable host closes it again');
});

test('clearing caches retries every host immediately', () => {
  const reset = sliceFunction('function resetArtworkLookupCaches');
  for (const circuit of ['resetSteamTransportCircuit()', 'sgdbCircuit.reset()', 'steamdbCoversCircuit.reset()']) {
    assert.ok(reset.includes(circuit), `clearing caches is an explicit request to try again - ${circuit} must run`);
  }
});

/*
  Measured on a real cold scan of a 215-game library: all eight scan workers blocked on Steam's
  product info at the same instant and were killed together by the 30s per-game budget - 24 real
  installs reduced to provisional tiles in one run, then stalled again on the next scan. Nothing on
  our side bounded that call.
*/
test('product info cannot hold a scan worker indefinitely', () => {
  const fetchProduct = sliceFunction('async function fetchSteamProductInfo');
  assert.ok(fetchProduct.includes('STEAM_PRODUCT_INFO_TIMEOUT_MS'), 'the call needs a deadline of its own');
  assert.ok(fetchProduct.includes('Promise.race('), 'steam-user offers no timeout for it');
  assert.ok(fetchProduct.includes('clearTimeout(timer)'), 'and the loser of the race must not keep a timer alive');
  assert.ok(
    fetchProduct.includes('productInfoCircuit.unavailable()') && fetchProduct.includes('productInfoCircuit.recordFailure()'),
    'one hung connection stalls every worker at once, so stop asking after it hangs twice'
  );
  assert.ok(fetchProduct.includes('return null'), 'a missing answer is not fatal - the store and the app list still name the game');
});

test('the per-game deadline stays comfortably above the lookups it contains', () => {
  const budget = 30000; // GAME_LOAD_TIMEOUT_MS in app/parser/achievements.js
  const numeric = (name) => {
    const match = new RegExp(`const ${name} = ([0-9]+)`).exec(initSource);
    assert.ok(match, `${name} must be a plain millisecond literal so this bound can be read`);
    return Number(match[1]);
  };
  for (const name of ['STEAM_PRODUCT_INFO_TIMEOUT_MS', 'STEAM_KEYLESS_TIMEOUT_MS', 'SGDB_FETCH_TIMEOUT_MS']) {
    assert.ok(numeric(name) < budget / 2, `${name} must leave room for the rest of the chain inside the 30s per-game budget`);
  }
});
