'use strict';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-psn-catalog-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

const freshModules = () => {
  for (const name of ['psnLibrary', 'psnCatalog']) delete require.cache[require.resolve(`../../app/parser/${name}.js`)];
  return { lib: require('../../app/parser/psnLibrary.js'), catalog: require('../../app/parser/psnCatalog.js') };
};

let lib;
let catalog;
let profile = 0;
beforeEach(() => {
  ({ lib, catalog } = freshModules());
  profile += 1;
  lib.setUserDataPath(path.join(temp, `profile-${profile}`));
});

const auth = { accessToken: async () => 'TOKEN' };
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const HUNTER = '1234567890';

// Sony as a public hunter sees it: one PS3 list he played, with his own unlocks.
function sony(overrides = {}) {
  const calls = [];
  const routes = {
    '/universalSearch': (body) =>
      body.includes('SocialAllAccounts')
        ? { domainResponses: [{ results: [{ socialMetadata: { onlineId: 'ikemenzi', accountId: HUNTER } }] }] }
        : { domainResponses: [{ results: [] }] },
    [`/users/${HUNTER}/trophyTitles?`]: {
      trophyTitles: [
        { npCommunicationId: 'NPWR00132_00', npServiceName: 'trophy', trophyTitleName: 'GTA IV', trophyTitlePlatform: 'PS3', trophyTitleIconUrl: 'https://img/gta.png' },
        { npCommunicationId: 'NPWR30000_00', npServiceName: 'trophy2', trophyTitleName: 'Grand Adventure', trophyTitlePlatform: 'PS5', trophyTitleIconUrl: 'http://img/insecure.png' },
      ],
    },
    [`/users/${HUNTER}/npCommunicationIds/NPWR00132_00/`]: {
      trophies: [
        { trophyId: 0, earned: true, earnedDateTime: '2010-01-01T00:00:00Z', trophyEarnedRate: '0.3' },
        { trophyId: 1, earned: true, trophyEarnedRate: '64.1', progress: '3' },
      ],
    },
    'NPWR00132_00/trophyGroups?': { trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'GTA IV' }, { trophyGroupId: '001', trophyGroupName: 'TLAD' }] },
    'npCommunicationIds/NPWR00132_00/trophyGroups/all/': {
      trophies: [
        { trophyId: 0, trophyType: 'platinum', trophyName: 'Taking A Liberty', trophyGroupId: 'default' },
        { trophyId: 1, trophyType: 'bronze', trophyName: 'Off The Boat', trophyGroupId: '001' },
      ],
    },
    ...overrides,
  };
  const fetchImpl = async (url, init = {}) => {
    calls.push(String(url));
    const key = Object.keys(routes).find((needle) => String(url).includes(needle));
    if (!key) return json({}, 404);
    const route = routes[key];
    const body = typeof route === 'function' ? route(String(init.body || '')) : route;
    return body && typeof body.json === 'function' ? body : json(body);
  };
  return { calls, fetchImpl };
}

const options = (fetchImpl) => ({ auth, fetchImpl, locale: 'fr-FR' });

test('the catalog finds lists by every typed word, the exact name first', () => {
  const lists = [{ name: 'GTA IV: Complete' }, { name: 'GTA IV' }, { name: 'Grand Theft Auto V' }, { name: 'The Ballad of GTA IV Fans' }];
  assert.deepEqual(
    catalog.rankMatches(lists, 'gta iv').map((entry) => entry.name),
    ['GTA IV', 'GTA IV: Complete', 'The Ballad of GTA IV Fans']
  );
  assert.deepEqual(catalog.rankMatches(lists, '  '), []);
});

test('a first search answers at once while the catalog loads in the background', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { fetchImpl } = sony();
  const slow = async (url, init) => {
    if (String(url).includes('/trophyTitles?')) await gate;
    return fetchImpl(url, init);
  };
  const first = await catalog.search('grand', options(slow));
  assert.deepEqual(first, { results: [], loading: true, count: 0 });
  release();
  await catalog.refreshInBackground(options(slow));
  const later = await catalog.search('grand', options(slow));
  assert.equal(later.loading, false);
  assert.equal(later.results.length, 1);
});

test('the catalog is built from the public accounts once, and keeps only https icons', async () => {
  const { fetchImpl, calls } = sony();
  await catalog.refreshInBackground(options(fetchImpl));
  const { results, count } = await catalog.search('grand', options(fetchImpl));
  assert.equal(count, 2);
  assert.deepEqual(results.map((entry) => [entry.id, entry.platform, entry.icon]), [['NPWR30000_00', 'PS5', '']]);
  assert.equal(results[0].holder, undefined, 'the public account id stays in the main process');

  const asked = calls.length;
  await catalog.search('gta', options(fetchImpl));
  await catalog.refreshInBackground(options(fetchImpl));
  assert.equal(calls.length, asked, 'a fresh catalog is read from the cache');
});

test('a rate limit during a catalog load is not taken for the end of the list', async () => {
  const limited = sony({ [`/users/${HUNTER}/trophyTitles?`]: () => json({}, 429) });
  await assert.rejects(catalog.refreshInBackground(options(limited.fetchImpl)), { code: 'psn-rate-limited' });
  const { fetchImpl, calls } = sony();
  await catalog.refreshInBackground(options(fetchImpl));
  assert.ok(calls.some((url) => url.includes('/trophyTitles?')), 'the next check loads the catalog again');
});

test('an added list takes the public player rates and groups, never his unlocks', async () => {
  const { fetchImpl } = sony();
  await catalog.refreshInBackground(options(fetchImpl));
  const added = await catalog.addGame('NPWR00132_00', options(fetchImpl));
  assert.deepEqual(added, { appid: 'psn-NPWR00132_00', name: 'GTA IV' });

  const game = lib.getGameData('psn-NPWR00132_00');
  assert.equal(game.psnAdded, true);
  assert.equal(game.achievement.unlocked, 0);
  assert.deepEqual(game.achievement.list.map((trophy) => [trophy.type, trophy.rarityPct, trophy.category]), [
    ['P', 0.3, undefined],
    ['B', 64.1, 'TLAD'],
  ]);
  assert.deepEqual(lib.getAchievements('psn-NPWR00132_00'), {});
});

test('a list already in the library is left as it is', async () => {
  const { fetchImpl } = sony();
  await catalog.refreshInBackground(options(fetchImpl));
  await catalog.addGame('NPWR00132_00', options(fetchImpl));
  const before = lib.readSchema('NPWR00132_00').meta.fetchedAt;
  const again = sony();
  assert.deepEqual(await catalog.addGame('psn-NPWR00132_00', options(again.fetchImpl)), { appid: 'psn-NPWR00132_00', name: 'GTA IV' });
  assert.equal(again.calls.length, 0);
  assert.equal(lib.readSchema('NPWR00132_00').meta.fetchedAt, before);
  await assert.rejects(catalog.addGame('../cfg', options(again.fetchImpl)), { code: 'psn-list-invalid' });
});

test('Sony refusing a list falls back to the public archive, in the app language first', async () => {
  const archived = {
    trophies: [{ trophyId: 0, trophyType: 'gold', trophyName: 'Archivé', trophyGroupId: 'default' }],
    trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'GTA IV' }],
  };
  const { fetchImpl, calls } = sony({
    'npCommunicationIds/NPWR00132_00/trophyGroups/all/': () => json({}, 500),
    'raw.githubusercontent.com': archived,
  });
  await catalog.refreshInBackground(options(fetchImpl));
  await catalog.addGame('NPWR00132_00', options(fetchImpl));
  assert.ok(calls.some((url) => url.endsWith('/trophies/fr/NPWR00132_00.json')));
  assert.equal(lib.getGameData('psn-NPWR00132_00').achievement.list[0].displayName, 'Archivé');
});

test('official rates for a list off the account come from a public player who has it', async () => {
  const { fetchImpl } = sony();
  assert.deepEqual(await catalog.publicRates({ npCommId: 'NPWR00132_00', service: 'trophy' }, options(fetchImpl)), {
    ok: true,
    entries: [
      { name: '0', percent: 0.3 },
      { name: '1', percent: 64.1 },
    ],
  });
  assert.deepEqual(await catalog.publicRates({ npCommId: 'NPWR99999_00', service: 'trophy' }, options(fetchImpl)), { ok: false, error: 'psn-not-on-account' });
});

test('rates no hunter has come from a hunter friend, asked first next time, and a miss is not asked again', async () => {
  const FRIEND = '5550001';
  const { fetchImpl, calls } = sony({
    [`/users/${HUNTER}/friends?`]: { friends: [FRIEND] },
    [`/users/${FRIEND}/npCommunicationIds/NPWR44056_00/`]: { trophies: [{ trophyId: 0, trophyEarnedRate: '1.9' }] },
  });
  const palworld = { npCommId: 'NPWR44056_00', service: 'trophy2' };
  assert.deepEqual(await catalog.publicRates(palworld, options(fetchImpl)), { ok: true, entries: [{ name: '0', percent: 1.9 }] });

  calls.length = 0;
  await catalog.publicRates(palworld, options(fetchImpl));
  assert.deepEqual(calls.filter((url) => url.includes('/npCommunicationIds/')), [`https://m.np.playstation.com/api/trophy/v1/users/${FRIEND}/npCommunicationIds/NPWR44056_00/trophyGroups/all/trophies?npServiceName=trophy2`]);

  const nobody = { npCommId: 'NPWR99999_00', service: 'trophy' };
  assert.deepEqual(await catalog.publicRates(nobody, options(fetchImpl)), { ok: false, error: 'psn-not-on-account' });
  calls.length = 0;
  assert.deepEqual(await catalog.publicRates(nobody, options(fetchImpl)), { ok: false, error: 'psn-not-on-account' });
  assert.equal(calls.filter((url) => url.includes('/npCommunicationIds/')).length, 0);
});

test('a Sony failure while asking for rates is not remembered as nobody having the list', async () => {
  let down = true;
  const { fetchImpl } = sony({
    [`/users/${HUNTER}/friends?`]: { friends: [] },
    [`/users/${HUNTER}/npCommunicationIds/NPWR44056_00/`]: () => (down ? json({}, 503) : { trophies: [{ trophyId: 0, trophyEarnedRate: '1.9' }] }),
  });
  const palworld = { npCommId: 'NPWR44056_00', service: 'trophy2' };
  assert.deepEqual(await catalog.publicRates(palworld, options(fetchImpl)), { ok: false, error: 'psn-not-on-account' });
  down = false;
  assert.deepEqual(await catalog.publicRates(palworld, options(fetchImpl)), { ok: true, entries: [{ name: '0', percent: 1.9 }] });
});

test('a hunter the catalog holds in full is not asked about a list it lacks, his friends are', async () => {
  const FRIEND = '5550001';
  const { fetchImpl, calls } = sony({
    '/universalSearch': (body) =>
      body.includes('MobileGames')
        ? { domainResponses: [{ results: [{ conceptMetadata: { name: 'Palworld', titleIds: ['PPSA17000_00'] } }] }] }
        : { domainResponses: [{ results: [{ socialMetadata: { onlineId: 'ikemenzi', accountId: HUNTER } }] }] },
    [`/users/${HUNTER}/friends?`]: { friends: [FRIEND] },
    [`/users/${FRIEND}/titles/trophyTitles?`]: { titles: [{ trophyTitles: [{ npCommunicationId: 'NPWR44056_00', npServiceName: 'trophy2', trophyTitleName: 'Palworld', trophyTitlePlatform: 'PS5' }] }] },
    [`/users/${FRIEND}/npCommunicationIds/NPWR44056_00/`]: { trophies: [{ trophyId: 0, trophyEarnedRate: '1.9' }] },
  });
  await catalog.refreshInBackground(options(fetchImpl));
  calls.length = 0;
  const ctx = await lib.createContext(options(fetchImpl));
  assert.deepEqual((await catalog.listsFromStore(ctx, 'Palworld')).map((entry) => entry.id), ['NPWR44056_00']);
  assert.deepEqual(await catalog.publicRates({ npCommId: 'NPWR44056_00', service: 'trophy2' }, options(fetchImpl)), { ok: true, entries: [{ name: '0', percent: 1.9 }] });
  assert.equal(calls.filter((url) => url.includes(`/users/${HUNTER}/titles/`) || url.includes(`/users/${HUNTER}/npCommunicationIds/`)).length, 0);
});

test('an added list can be removed, the account own lists cannot', async () => {
  const { fetchImpl } = sony();
  await catalog.refreshInBackground(options(fetchImpl));
  await catalog.addGame('NPWR00132_00', options(fetchImpl));
  assert.deepEqual(
    catalog.addedGames().map((game) => [game.id, game.added]),
    [['NPWR00132_00', true]]
  );
  assert.deepEqual(catalog.removeGame('psn-NPWR00132_00'), { appid: 'psn-NPWR00132_00', name: 'GTA IV' });
  assert.equal(lib.readSchema('NPWR00132_00'), null);
  assert.deepEqual(catalog.addedGames(), []);

  lib.writeJson(path.join(lib.cacheRoot(), 'NPWR77777_00', 'schema.json'), { listId: 'NPWR77777_00', name: 'Mine', achievement: { list: [] }, meta: {} });
  assert.throws(() => catalog.removeGame('NPWR77777_00'), { code: 'psn-list-not-added' });
  assert.throws(() => catalog.removeGame('../cfg'), { code: 'psn-list-not-added' });
});

test('the catalog is read in English, and one built in another language is started again', async () => {
  lib.writeJson(path.join(lib.cacheRoot(), 'catalog.json'), { builtAt: Date.now(), lists: [{ id: 'NPWR00132_00', name: 'Trophées de GTA IV' }] });
  const { fetchImpl } = sony();
  const languages = [];
  const spy = async (url, init = {}) => {
    if (String(url).includes('/trophyTitles?')) languages.push(init.headers && init.headers['Accept-Language']);
    return fetchImpl(url, init);
  };
  assert.equal((await catalog.search('gta', options(spy))).loading, true, 'the old catalog is not used');
  await catalog.refreshInBackground(options(spy));
  assert.ok(languages.length && languages.every((lang) => String(lang).startsWith('en')), String(languages));
  assert.deepEqual(catalog.listsNamed('GTA IV').map((entry) => entry.id), ['NPWR00132_00']);
});

test('a game no hunter played is found through the store, the account first', async () => {
  const asked = [];
  const { fetchImpl } = sony({
    '/universalSearch': (body) =>
      body.includes('MobileGames')
        ? { domainResponses: [{ results: [{ conceptMetadata: { name: 'Baldur’s Gate 3', nameEn: "Baldur's Gate 3", titleIds: ['PPSA14002_00', 'bad id'] } }] }] }
        : { domainResponses: [{ results: [{ socialMetadata: { onlineId: 'ikemenzi', accountId: HUNTER } }] }] },
    '/users/me/titles/trophyTitles?': () => (asked.push('me'), { titles: [{ npTitleId: 'PPSA14002_00', trophyTitles: [] }] }),
    [`/users/${HUNTER}/titles/trophyTitles?`]: () => (
      asked.push('hunter'), { titles: [{ trophyTitles: [{ npCommunicationId: 'NPWR35000_00', npServiceName: 'trophy2', trophyTitleName: "Baldur's Gate 3", trophyTitlePlatform: 'PS5' }] }] }
    ),
  });
  const ctx = await lib.createContext(options(fetchImpl));
  const lists = await catalog.listsFromStore(ctx, "Baldur's Gate 3");
  assert.deepEqual(asked, ['me', 'hunter']);
  assert.deepEqual(lists.map((entry) => [entry.id, entry.service, entry.platform]), [['NPWR35000_00', 'trophy2', 'PS5']]);
  assert.deepEqual(await catalog.listsFromStore(ctx, 'Unknown Game'), []);
});
