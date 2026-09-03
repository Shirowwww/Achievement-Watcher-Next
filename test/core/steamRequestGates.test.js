'use strict';

/*
  Issue #55. A 192-game library asked four Steam hosts as fast as eight scan workers could, and the
  refusals were read as facts about the games: "no achievements", "no name". The renderer showed a
  bare AppID with an empty list, and only repeated rescans eventually caught enough answers.

  init.js cannot be required outside Electron, so what is pinned here is the wiring: every one of
  those fetches goes through its host's gate, a refusal is reported as unknown rather than as empty,
  and the keyless name fallback that made the AppID-titled tiles possible in the first place exists.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { mainProcessSource } = require('../helpers/mainProcessSource.js');
const source = mainProcessSource();

// Every host a scan asks about a game, and the gate its requests must be paced by.
const GATED_HOSTS = [
  { host: 'api.steampowered.com/IPlayerService/GetGameAchievements', gate: 'api' },
  { host: 'store.steampowered.com/api/appdetails', gate: 'store' },
  { host: 'steamhunters.com/api/apps/${appid}/achievements', gate: 'steamhunters' },
  { host: 'steamhunters.com/api/GetAchievementGroups', gate: 'steamhunters' },
];

test('a gate exists for each Steam host a scan hits per game', () => {
  const block = source.slice(source.indexOf('const steamGates = {'), source.indexOf('function logThrottle'));
  for (const gate of ['api', 'store', 'steamhunters', 'steamcommunity']) {
    assert.match(block, new RegExp(`${gate}: createRequestGate\\(`), `no gate for ${gate}`);
  }
  // Pacing without a give-up budget would trade lost games for stalled ones: each game has 30s.
  for (const line of block.split('\n').filter((l) => l.includes('createRequestGate('))) {
    assert.match(line, /maxWaitMs: \d+/, `a gate with no budget can stall a game load: ${line.trim()}`);
    const budget = Number(/maxWaitMs: (\d+)/.exec(line)[1]);
    assert.ok(budget < 30000, `a gate budget must stay inside the per-game load timeout: ${line.trim()}`);
  }
});

test('no per-game Steam request bypasses its gate', () => {
  for (const { host, gate } of GATED_HOSTS) {
    const at = source.indexOf(host);
    assert.notEqual(at, -1, `${host} is no longer requested; update this test`);
    // The URL may be built into a const above the fetch or written inline inside it, so look on
    // both sides of it for the gate that has to wrap the call.
    const around = source.slice(Math.max(0, at - 900), at + 900);
    assert.ok(around.includes(`steamGates.${gate}.run(`), `${host} is fetched without going through steamGates.${gate}`);
  }
});

test('a refusal is reported as unknown, never as an empty achievement list', () => {
  // networkError is the flag the whole chain already reads as "no verdict, keep the entry and retry
  // next scan". Without it, an empty list from a 429 is cached as the truth about the game.
  const keyless = source.slice(source.indexOf('async function getAchievementsKeyless'));
  const body = keyless.slice(0, keyless.indexOf('\n}\n'));
  assert.match(body, /let refused = false;/, 'the chain must remember that a host refused');
  assert.match(body, /if \(refused\) return \{ achievements: \[\], source: 'none', networkError: true \};/);
  assert.ok(
    body.indexOf('if (refused)') < body.lastIndexOf("return { achievements: [], source: 'none' };"),
    'the refusal check must come before the plain "no achievements" answer'
  );
});

test('every gated fetcher tells a not-attempted request apart from a real answer', () => {
  // run() resolves to null when the gate gave up queueing: nothing was sent, so nothing was learned.
  for (const fetcher of ['fetchStoreAppDetails', 'fetchSteamCommunityAchievements', 'getSchemaFromWebAPI', 'fetchSteamHuntersJson', 'fetchSteamHuntersApp']) {
    const at = source.indexOf(`function ${fetcher}(`);
    assert.notEqual(at, -1, `${fetcher} is gone; update this test`);
    const body = source.slice(at, at + 1600);
    assert.match(body, /res === null/, `${fetcher} treats a skipped request as an answer`);
  }
});

test('a name comes from a host that is not on Steam own budget', () => {
  // GetAppList is retired and the Steam client has never installed an emulator-only game, so the
  // title used to depend entirely on two rate-limited Steam endpoints.
  assert.match(source, /async function fetchSteamHuntersApp\(appid\)/);
  assert.match(source, /steamhunters\.com\/api\/apps\/\$\{appid\}`/, 'the per-app record is what carries the name');
  const fallback = source.slice(source.indexOf('if (!metadata.name) {'));
  assert.match(fallback.slice(0, 500), /await fetchSteamHuntersApp\(appid\)/);
  assert.match(fallback.slice(0, 500), /metadata\.name = hunted\.name/);
  // The same record says whether it is a game, which is what decides if a fetched schema is kept.
  assert.match(fallback.slice(0, 700), /metadata\.productType = hunted\.typeString\.toLowerCase\(\)/);
});

test('one dead Steam login does not cost every game its name', () => {
  // clientLogOn() only feeds getProductInfo, which has a breaker of its own; the store and the
  // SteamHunters fallback need no session at all. Letting it throw skipped both.
  const at = source.indexOf('await clientLogOn();');
  assert.notEqual(at, -1);
  const around = source.slice(at - 200, at + 200);
  assert.match(around, /try \{\s*await clientLogOn\(\);\s*\} catch/, 'the anonymous login must be best-effort here');
});

test('clearing caches also clears the pacing state', () => {
  // "Clear caches" means "try again now", so a pause earned by the previous scan must not survive.
  const reset = source.slice(source.indexOf('function resetSteamTransportCircuit'));
  assert.match(reset.slice(0, 400), /for \(const gate of Object\.values\(steamGates\)\) gate\.reset\(\);/);
});

test('a lookup nothing answered is reported as an outage, not as a nameless game', () => {
  /*
    The parser turns a nameless answer into a three-day negative-cache entry, and stops looking the
    AppID up at all for that long. A rate-limited metadata call looks exactly like a nameless answer
    from there, so a busy scan blacklisted the games it could not reach (issue #55). The main process
    has to say which of the two it was.
  */
  const at = source.indexOf('const store = await fetchStoreAppDetails(appid);');
  assert.notEqual(at, -1, 'the metadata block moved; update this test');
  const block = source.slice(at, at + 2600);

  assert.match(block, /let answered = store\.answered \|\| productInfo !== null;/, 'nothing tracks whether a source replied');
  assert.match(block, /if \(hunted\) answered = true;/, 'the keyless name lookup is an answer too');
  assert.match(block, /if \(!answered && !metadata\.name\) \{[\s\S]*?metadata\.networkError = true;/, 'an unanswered lookup must report itself');

  // And the store fetcher has to be able to tell "no page for this id" from "never got a reply".
  const store = source.slice(source.indexOf('async function fetchStoreAppDetails(appid)'));
  assert.match(store.slice(0, 1800), /const unanswered = \{ data: null, answered: false \};/);
  assert.match(store.slice(0, 1800), /return \{ data: \(json\[appid\] && json\[appid\]\.data\) \|\| null, answered: true \};/);
});

test('only the host that actually refused is paced hard', () => {
  /*
    Pacing is not free: it is dead time on every game of every cold scan. The reporter's logs show
    exactly one host refusing (store.steampowered.com, 21 x HTTP 429) and one stalling (product info).
    A sweep of the 826 AppIDs from those logs never got a refusal from the schema endpoint or from
    SteamHunters at any rate tried, so spacing those two hard bought no safety and cost 80s. What
    protects them is the shared backoff, which costs nothing until something refuses.

    This test exists so a future "let's be safer" tightening has to argue with the measurement.
  */
  const block = source.slice(source.indexOf('const steamGates = {'), source.indexOf('function logThrottle'));
  const spacing = {};
  for (const line of block.split(/\r?\n/)) {
    const gate = /^\s*(\w+): createRequestGate/.exec(line);
    if (!gate) continue;
    spacing[gate[1]] = Number(/minIntervalMs: (\d+)/.exec(line)[1]);
  }

  assert.deepEqual(Object.keys(spacing).sort(), ['api', 'steamcommunity', 'steamhunters', 'store']);
  assert.ok(spacing.store >= 300, `the store is the one host that refused: ${spacing.store}ms is too close together`);
  for (const host of ['api', 'steamhunters']) {
    assert.ok(spacing[host] <= 60, `${host} never refused, so ${spacing[host]}ms of spacing is dead time on every game`);
    assert.ok(spacing[host] < spacing.store, `${host} must not be paced like the store`);
  }
});
