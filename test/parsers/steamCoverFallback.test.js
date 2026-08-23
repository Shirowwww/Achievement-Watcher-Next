'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));

/*
  Library covers: tiles stayed blank for games SteamGridDB clearly has art for, because the SteamDB
  -> SteamGridDB chain ran only inside the cache-MISS path (getSteamDataFromSRV). Once a schema was
  cached with portrait: null, every later scan went through GetMissingData, which re-asked product
  info and stopped there - the tile could never recover. These tests pin the chain and its repair wiring.
*/

// Record the channels a resolution actually used, so ordering is asserted rather than assumed.
function recorder(answers) {
  const calls = [];
  return {
    calls,
    invoke: async (channel, ...args) => {
      calls.push(channel);
      const answer = answers[channel];
      return typeof answer === 'function' ? answer(...args) : answer;
    },
  };
}

test('a game with no product-info cover falls through SteamDB to SteamGridDB', async () => {
  const { calls, invoke } = recorder({
    'get-steamdb-cover': null, // the stealth-browser scrape came back empty (or could not launch)
    'get-steamgriddb-cover': 'https://cdn2.steamgriddb.com/grid/abc.png',
  });

  const portrait = await steam.resolvePortrait({ appid: 893180, name: 'Catherine Classic', portrait: null, invoke });

  assert.equal(portrait, 'https://cdn2.steamgriddb.com/grid/abc.png');
  assert.deepEqual(calls, ['get-steam-cdn-covers-status', 'get-steamdb-cover', 'get-steamgriddb-cover']);
});

test('SteamGridDB is not consulted when SteamDB already resolved the capsule', async () => {
  const { calls, invoke } = recorder({ 'get-steamdb-cover': 'https://cdn.st/library_600x900.jpg' });

  const portrait = await steam.resolvePortrait({ appid: 787480, name: 'Phoenix Wright', portrait: null, invoke });

  assert.equal(portrait, 'https://cdn.st/library_600x900.jpg');
  assert.deepEqual(calls, ['get-steam-cdn-covers-status', 'get-steamdb-cover']);
});

test('a product-info url that does not actually download is replaced, not trusted', async () => {
  // fetch-icon handing back the url it was given means nothing was cached: the guessable CDN path
  // is dead, which is exactly the case that used to leave a blank tile behind a truthy value.
  const dead = 'https://cdn.st/apps/1/library_600x900.jpg';
  const { calls, invoke } = recorder({
    'fetch-icon': dead,
    'get-steamdb-cover': null,
    'get-steamgriddb-cover': 'https://cdn2.steamgriddb.com/grid/real.png',
  });

  const portrait = await steam.resolvePortrait({ appid: 1, name: 'Some Game', portrait: dead, invoke });

  assert.equal(portrait, 'https://cdn2.steamgriddb.com/grid/real.png');
  assert.deepEqual(calls, ['fetch-icon', 'get-steam-cdn-covers-status', 'get-steamdb-cover', 'get-steamgriddb-cover']);
});

test('a product-info url that does download is kept, and costs no extra lookup', async () => {
  const live = 'https://cdn.st/apps/1/library_600x900.jpg';
  const { calls, invoke } = recorder({ 'fetch-icon': 'file:///cache/1/library_600x900.jpg' });

  const portrait = await steam.resolvePortrait({ appid: 1, name: 'Some Game', portrait: live, invoke });

  assert.equal(portrait, live);
  assert.deepEqual(calls, ['fetch-icon']);
});

test('the Steam CDN portrait fallback keeps the URL source instead of the disposable cache path', async () => {
  const source = 'https://cdn.cloudflare.steamstatic.com/steam/apps/391540/library_600x900.jpg';
  const { calls, invoke } = recorder({
    'get-steam-cdn-covers-status': { urls: [source], networkError: false },
    'fetch-icon': 'file:///user-data/steam_cache/icon/391540/library_600x900.jpg',
  });

  const portrait = await steam.resolvePortrait({ appid: 391540, name: 'Undertale', portrait: null, invoke });

  assert.equal(portrait, source);
  assert.deepEqual(calls, ['get-steam-cdn-covers-status', 'fetch-icon']);
});

test('a confirmed network outage stops portrait fallback before SteamDB or SteamGridDB', async () => {
  const { calls, invoke } = recorder({
    'get-steam-cdn-covers-status': { urls: [], networkError: true },
    'get-steamdb-cover': 'https://cdn.st/should-not-be-requested.jpg',
  });

  assert.equal(await steam.resolvePortrait({ appid: 391540, name: 'Undertale', portrait: null, invoke }), null);
  assert.deepEqual(calls, ['get-steam-cdn-covers-status']);
});

test('a non-http value is a fetch-icon token and is returned untouched', async () => {
  const { calls, invoke } = recorder({});

  const portrait = await steam.resolvePortrait({ appid: 1, name: 'Some Game', portrait: 'library_600x900.jpg', invoke });

  assert.equal(portrait, 'library_600x900.jpg');
  assert.deepEqual(calls, [], 'a token must not trigger a network lookup');
});

test('the Steam appid is forwarded to SteamGridDB, which resolves by identity', async () => {
  /*
    SteamGridDB can be asked for a game by Steam appid outright, and that is not a guess: it is why
    "Staffer Retro : A Supernatural Mystery Quest" reaches art filed under the shorter "Staffer Retro".
    Loosening the title matcher to a prefix rule instead would equally match "LEGO Batman" to "LEGO
    Batman: Legacy of the Dark Knight", so the appid must reach the handler for the matcher to stay strict.
  */
  const seen = [];
  const invoke = async (channel, ...args) => {
    seen.push([channel, args]);
    return channel === 'get-steamgriddb-cover' ? 'https://cdn2.steamgriddb.com/grid/by-id.png' : null;
  };

  const portrait = await steam.resolvePortrait({ appid: 3837350, name: 'Staffer Retro : A Supernatural Mystery Quest', portrait: null, invoke });

  assert.equal(portrait, 'https://cdn2.steamgriddb.com/grid/by-id.png');
  const sgdb = seen.find(([channel]) => channel === 'get-steamgriddb-cover');
  assert.deepEqual(sgdb[1], ['Staffer Retro : A Supernatural Mystery Quest', 3837350], 'the appid must be passed alongside the name');
  assert.deepEqual(seen.map(([channel]) => channel), ['get-steam-cdn-covers-status', 'get-steamdb-cover', 'get-steamgriddb-cover']);
});

test('a record with neither a name nor an appid asks nothing', async () => {
  const { calls, invoke } = recorder({ 'get-steamdb-cover': 'x' });

  assert.equal(await steam.resolvePortrait({ appid: '', name: '', portrait: null, invoke }), null);
  assert.deepEqual(calls, [], 'with no handle at all there is nothing to look up');
});

test('a nameless record can still be resolved from its appid alone', async () => {
  // Both remaining sources are keyed on the appid, so a missing title is no longer a dead end.
  const { calls, invoke } = recorder({ 'get-steamdb-cover': 'https://cdn.st/library_600x900.jpg' });

  assert.equal(await steam.resolvePortrait({ appid: 1, name: '', portrait: null, invoke }), 'https://cdn.st/library_600x900.jpg');
  assert.deepEqual(calls, ['get-steam-cdn-covers-status', 'get-steamdb-cover']);
});

test('the cached-schema repair path is wired to the same chain, on a retry stamp', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'), 'utf8');
  const body = source.slice(source.indexOf('async function GetMissingData'));

  assert.match(body, /resolvePortrait\(\{ appid: data\.appid, name: data\.name, portrait: null \}\)/, 'GetMissingData must run the full portrait chain, not just product info');
  // Without a stamp a genuinely cover-less game would re-run both lookups on every single scan.
  assert.match(body, /portraitCheckedAt/, 'the attempt must be remembered so a miss is not retried every scan');
});

/*
  SteamDB is the only step in this chain that runs a browser, and one global queue serializes every
  game in the library through it. A cold scan therefore has games waiting on covers for games ahead
  of them - inside the same 30s budget that decides whether the game loads at all. A user log shows
  37 games failing at exactly 30s while that queue was still working through 8s-per-game pages.
*/
test('a slow SteamDB queue does not hold the game past its budget', async () => {
  let steamdbSettled = false;
  const { calls, invoke } = recorder({
    // Still queued behind other games when this one's budget runs out.
    'get-steamdb-cover': () =>
      new Promise((resolve) => setTimeout(() => { steamdbSettled = true; resolve('https://cdn.st/late.jpg'); }, 200)),
    'get-steamgriddb-cover': 'https://cdn2.steamgriddb.com/grid/abc.png',
  });

  const started = Date.now();
  const portrait = await steam.resolvePortrait({ appid: 220, name: 'Half-Life 2', portrait: null, invoke, steamdbWaitMs: 20 });

  assert.ok(Date.now() - started < 150, 'the wait is bounded, not the whole scrape');
  assert.equal(steamdbSettled, false, 'and it really did give up before SteamDB answered');
  assert.equal(portrait, 'https://cdn2.steamgriddb.com/grid/abc.png', 'the chain continues to the next source');
  assert.deepEqual(calls, ['get-steam-cdn-covers-status', 'get-steamdb-cover', 'get-steamgriddb-cover']);
});

test('a SteamDB answer that arrives in time is still preferred', async () => {
  const { calls, invoke } = recorder({
    'get-steamdb-cover': () => new Promise((resolve) => setTimeout(() => resolve('https://cdn.st/library_600x900.jpg'), 5)),
  });

  const portrait = await steam.resolvePortrait({ appid: 787480, name: 'Phoenix Wright', portrait: null, invoke, steamdbWaitMs: 500 });

  assert.equal(portrait, 'https://cdn.st/library_600x900.jpg');
  assert.deepEqual(calls, ['get-steam-cdn-covers-status', 'get-steamdb-cover']);
});

test('a rejected SteamDB lookup falls through instead of failing the resolution', async () => {
  const { invoke } = recorder({
    'get-steamdb-cover': () => Promise.reject(new Error('Execution context was destroyed')),
    'get-steamgriddb-cover': 'https://cdn2.steamgriddb.com/grid/xyz.png',
  });

  const portrait = await steam.resolvePortrait({ appid: 400, name: 'Portal', portrait: null, invoke });
  assert.equal(portrait, 'https://cdn2.steamgriddb.com/grid/xyz.png');
});
