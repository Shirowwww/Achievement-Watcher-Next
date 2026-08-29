'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');

// SteamGridDB lookups: "Staffer Retro : A Supernatural Mystery Quest" had a permanently blank tile
// because SteamGridDB files it under the shorter "Staffer Retro", and the title matcher is
// deliberately strict (a prefix rule would equally mismatch "LEGO Batman" to its sequel). The fix is
// /games/steam/<appid> identity lookup, preferred where available; title matching stays just as strict elsewhere.

test('a Steam appid is resolved by identity, before any title is matched', () => {
  assert.match(source, /BASE_URL\}\/games\/steam\/\$\{encodeURIComponent\(id\)\}/, 'the by-appid endpoint must be used');
  // One resolver serves every asset list (grids, icons); it is the only place the order matters.
  const resolver = source.slice(source.indexOf('async function resolveSteamGridDbGameId'), source.indexOf('async function fetchSteamGridDbGrids'));
  const identityAt = resolver.indexOf('fetchSteamGridDbGameIdBySteamAppid');
  const searchAt = resolver.indexOf('search/autocomplete');
  assert.ok(identityAt !== -1 && searchAt !== -1);
  assert.ok(identityAt < searchAt, 'the appid lookup must come before the title search');
  assert.match(resolver, /if \(!name\) return \{ gameId: 0/, 'the title search must be the fallback, not the default');
  // Both asset lists must go through it rather than matching titles on their own.
  const grids = source.slice(source.indexOf('async function fetchSteamGridDbGrids'), source.indexOf('async function fetchSteamGridDbCovers'));
  const icons = source.slice(source.indexOf('async function fetchSteamGridDbIcon'), source.indexOf("ipcMain.handle('get-steamgriddb-icon'"));
  assert.match(grids, /resolveSteamGridDbGameId\(/);
  assert.match(icons, /resolveSteamGridDbGameId\(/);
  assert.doesNotMatch(grids + icons, /search\/autocomplete/, 'title matching belongs to the shared resolver only');
});

test('the strict title matcher is unchanged - no prefix or subset rule crept in', () => {
  const picker = source.slice(source.indexOf('function pickSteamGridDbGame'), source.indexOf('function rankSteamGridDbGrids'));
  // An exact match, then "all query words present with at most one extra word". Nothing else.
  assert.match(picker, /tokensOf\(g\)\.length - queryTokens\.length <= 1/);
  assert.doesNotMatch(picker, /startsWith|includes\(name\)|indexOf\(name\)/, 'a prefix rule would mismatch sequels and subtitled releases');
  // The wider rule is a last resort a caller has to ask for, and it refuses to choose between two
  // candidates - which is what stops it from handing a sequel's cover to the game before it.
  assert.match(picker, /\{ relaxed = false \} = \{\}/, 'strict is what a caller gets by default');
  assert.match(picker, /if \(close \|\| !relaxed\) return close \|\| null;/);
  assert.match(picker, /candidates\.length === 1 \? candidates\[0\] : null/);
});

test('a network failure never poisons the appid cache', () => {
  const lookup = source.slice(source.indexOf('async function fetchSteamGridDbGameIdBySteamAppid'), source.indexOf('// Prefer an exact title match'));
  // The catch must bail out before the cache write below it, so an unreachable host leaves no
  // record behind and the next scan asks again. A cached "no such game" would be permanent.
  const catchStart = lookup.indexOf('} catch (err) {');
  const writeStart = lookup.indexOf('fs.mkdirSync(path.dirname(cacheFile)');
  assert.ok(catchStart !== -1 && writeStart !== -1 && catchStart < writeStart);
  const catchBody = lookup.slice(catchStart, writeStart);
  assert.match(catchBody, /return null;/, 'an unreachable host must leave the cache alone');
});

test('the covers cache is keyed on the appid as well as the title', () => {
  // The same title resolved by identity and by search can legitimately be different games.
  const expected = 'update(`${appid}' + String.fromCharCode(92) + '0${name.toLowerCase()}' + String.fromCharCode(92) + '0${orient}`)';
  assert.ok(source.includes(expected), 'the appid must be part of the covers cache key');
});

/*
  Every game asks SteamHunters for its achievement groups independently. When that host is
  unreachable the whole library used to pay the full 10s timeout each: a user's log shows 52
  consecutive "aborted due to timeout" lines spanning 70 seconds of one scan.
*/
test('a dead SteamHunters groups endpoint is not re-proven once per game', () => {
  assert.match(source, /function steamGroupsUnavailable\(\)/);
  assert.match(source, /if \(steamGroupsUnavailable\(\)\) return \{ ok: false, groups: \[\] \};/);
  assert.ok(source.includes('createNetworkCircuit({ failureLimit: 3'), 'the groups breaker still opens after three consecutive failures');
  // An HTTP status is a real answer from a live host and must clear the breaker.
  const handler = source.slice(source.indexOf("if (type === 'steamgroups')"));
  const successAt = handler.indexOf('recordSteamGroupsSuccess()');
  const okCheckAt = handler.indexOf('if (!res.ok)');
  assert.ok(successAt !== -1 && successAt < okCheckAt, 'a reachable host clears the breaker even on an error status');
});

// Lift the shipped helpers out of init.js so these check the real code, not a copy of it.
function editionHelpers() {
  const from = source.indexOf('const SGDB_EDITION_TAIL');
  const body = source.slice(from, source.indexOf('/*\n  A lookup that found nothing'));
  // The matcher, with the token normalisation it reads names through.
  const picker = source.slice(source.indexOf('const SGDB_ROMAN'), source.indexOf('// Native size first'));
  // oxlint-disable-next-line no-eval -- evaluating the shipped code is the point, rather than restating it here.
  return eval(`${body}\n${picker}\n({ steamGridDbNameVariants, pickSteamGridDbGame })`);
}

test('an edition tag is dropped from the query, and a subtitle is not', () => {
  const { steamGridDbNameVariants } = editionHelpers();
  // SteamGridDB files these under the base name, and the matcher is strict, so the query is what
  // has to give: every one of these showed an empty tile.
  for (const [name, expected] of [
    ['Disco Elysium - The Final Cut', 'Disco Elysium'],
    ['Echo Generation: Midnight Edition', 'Echo Generation'],
    ['Styx: Shards of Darkness - Deluxe', 'Styx: Shards of Darkness'],
    ['The Witcher 3: Wild Hunt - Complete Edition', 'The Witcher 3: Wild Hunt'],
    // An edition tag does not always come after a separator.
    ['Trine Enchanted Edition', 'Trine'],
    ['Trine 2: Complete Story', 'Trine 2'],
  ]) {
    assert.ok(steamGridDbNameVariants(name).includes(expected), `${name} must also be searched as "${expected}"`);
  }

  // A subtitle is part of the name, not an edition: cutting it would ask for a different game.
  for (const name of ['Styx: Shards of Darkness', 'Total War: PHARAOH DYNASTIES', 'Half-Life 2', 'Sea of Thieves: 2026 Edition']) {
    const variants = steamGridDbNameVariants(name);
    assert.ok(variants.includes(name), 'the name as given is always tried first');
    assert.equal(variants[0], name);
  }
  assert.deepEqual(steamGridDbNameVariants('Styx: Shards of Darkness'), ['Styx: Shards of Darkness']);

  // Trademark marks are in the store name and never in SteamGridDB's.
  assert.ok(steamGridDbNameVariants('UNCHARTED™: Legacy of Thieves Collection').includes('UNCHARTED: Legacy of Thieves Collection'));

  // A subtitle after a dash is tried on its own last: SteamGridDB files some games under the short
  // name, and the strict matcher still has to recognise what comes back.
  assert.ok(steamGridDbNameVariants('Rustler - Grand Theft Horse').includes('Rustler'));
});

test('a lookup that found nothing is remembered, and a failed one is not', () => {
  // Without this every coverless game was searched again on every scan, five requests each, on a
  // key shared by every install - which is also how a rate-limited answer became a blank tile.
  const resolver = source.slice(source.indexOf('async function resolveImagesForGame'), source.indexOf("ipcMain.on('get-images-for-game'"));
  assert.match(resolver, /rememberMiss\(\);\s*\n\s*return null;/, 'a "no entry" answer must be cached');
  // Reading it back belongs to the module both processes share, so the window can serve a cached
  // answer without a round trip per game.
  const cache = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'util', 'sgdbAssetCache.js'), 'utf8');
  assert.match(cache, /cached\.notFound === true/, 'and read back');
  assert.match(cache, /age < MISS_TTL_MS/, 'on a TTL of its own, shorter than a hit');
  assert.match(cache, /MISS_TTL_MS = 3 \* 24/);
  assert.match(cache, /HIT_TTL_MS = 30 \* 24/);
  const failure = resolver.slice(resolver.indexOf('recordSteamGridDbFailure(err'));
  assert.doesNotMatch(failure, /rememberMiss\(/, 'a request that failed is not an answer');
});

test('the last resort takes a single wider match, and never picks between siblings', () => {
  const { pickSteamGridDbGame } = editionHelpers();
  // The store dropped a subtitle SteamGridDB keeps.
  const oneCandidate = [{ id: 1, name: 'Trine 4: The Nightmare Prince' }, { id: 2, name: 'Trine 2' }];
  assert.equal(pickSteamGridDbGame(oneCandidate, 'Trine 4'), null, 'the usual rules still refuse it');
  assert.equal(pickSteamGridDbGame(oneCandidate, 'Trine 4', { relaxed: true })?.id, 1);

  // Two entries carry the name: the runner-up is a different game, so neither is taken.
  const siblings = [
    { id: 1, name: 'LEGO Batman 2: DC Super Heroes' },
    { id: 2, name: 'LEGO Batman 3: Beyond Gotham' },
  ];
  assert.equal(pickSteamGridDbGame(siblings, 'LEGO Batman', { relaxed: true }), null);
});

test('a sequel numbered differently and an accent are the same name', () => {
  const { pickSteamGridDbGame } = editionHelpers();
  assert.equal(pickSteamGridDbGame([{ id: 7, name: 'Ghostrunner II' }], 'Ghostrunner 2')?.id, 7);
  assert.equal(pickSteamGridDbGame([{ id: 8, name: 'Pâquerette Down the Bunburrows' }], 'Paquerette Down the Bunburrows')?.id, 8);
  // Folding numerals must not merge two different games.
  assert.equal(pickSteamGridDbGame([{ id: 9, name: 'Ghostrunner' }], 'Ghostrunner 2'), null);
});

test('an unreachable SteamGridDB changes nothing on disk, and asks again next time', () => {
  // Offline, every lookup fails the same way. None of it may be mistaken for an answer: no cached
  // "no artwork", and no wider retry either, since there was nothing to widen against.
  const resolver = source.slice(source.indexOf('async function resolveImagesForGame'), source.indexOf("ipcMain.on('get-images-for-game'"));
  assert.match(resolver, /if \(steamGridDbUnavailable\(\)\) return null;/, 'the breaker short-circuits before any request');
  assert.match(resolver, /if \(!game && answered\) \{/, 'the last-resort pass needs an answer to widen from');
  assert.match(resolver, /if \(answered\) rememberMiss\(\);/);
});
