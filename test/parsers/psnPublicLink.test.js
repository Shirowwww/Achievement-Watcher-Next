'use strict';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-psn-public-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

let lib;
let links;
let pub;
let profile = 0;
beforeEach(() => {
  for (const name of ['psnLibrary', 'psnCatalog', 'psnTrophyLink', 'psnPublicLink']) delete require.cache[require.resolve(`../../app/parser/${name}.js`)];
  lib = require('../../app/parser/psnLibrary.js');
  links = require('../../app/parser/psnTrophyLink.js');
  pub = require('../../app/parser/psnPublicLink.js');
  profile += 1;
  lib.setUserDataPath(path.join(temp, `profile-${profile}`));
});

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const trophy = (trophyId, trophyType, trophyName, trophyDetail) => ({ trophyId, trophyType, trophyName, trophyDetail, trophyGroupId: 'default', trophyIconUrl: `https://img/${trophyId}.png` });

// An archive list as FlexBy420/sce-tmdb-scraper serves it, in English and French.
const archived = {
  en: { npCommunicationId: 'NPWR10000_00', trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'Base' }], trophies: [trophy(0, 'platinum', 'Master', 'All trophies'), trophy(1, 'bronze', 'First Shot', 'Shoot'), trophy(2, 'gold', 'Ghost', 'Unseen'), trophy(3, 'silver', 'Collector', 'Find all')] },
  fr: { npCommunicationId: 'NPWR10000_00', trophyGroups: [], trophies: [trophy(0, 'platinum', 'Maître', 'Tous les trophées'), trophy(1, 'bronze', 'Premier tir', 'Tirer'), trophy(2, 'gold', 'Fantôme', 'Invisible'), trophy(3, 'silver', 'Collectionneur', 'Tout trouver')] },
};
const index = { version: 1, source: 'test', names: { 'sniper story': [{ id: 'NPWR10000_00', platform: 'PS4', service: 'trophy' }] } };

function network({ indexBody = index } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const text = String(url);
    calls.push(text);
    if (text === pub.INDEX_URL) return indexBody ? json(indexBody) : json({}, 404);
    const hit = text.match(/\/trophies\/(\w+)\/(NPWR\d{5}_\d{2})\.json$/);
    if (hit && archived[hit[1]] && hit[2] === 'NPWR10000_00') return json(archived[hit[1]]);
    return json({}, 404);
  };
  return { calls, fetchImpl };
}

const noExophase = { searchExophaseTrophyLists: async () => [], fetchExophaseAchievementsMultiLang: async () => ({ items: [] }) };
const englishGame = {
  appid: '100',
  name: 'Sniper Story™',
  achievements: [
    { name: 'A1', displayName: 'First Shot', description: '' },
    { name: 'A2', displayName: 'Ghost', description: '' },
    { name: 'A3', displayName: 'Collector', description: '' },
  ],
};

test('without an account a game is tied to its archive list and its real platinum, Sony never asked', async () => {
  const net = network();
  const linked = await pub.linkGames([englishGame], { lang: 'french', fetchImpl: net.fetchImpl, exophase: noExophase });
  assert.equal(linked, 1);
  const link = links.readLink('100');
  assert.equal(link.listId, 'NPWR10000_00');
  assert.equal(link.locale, 'fr-FR');
  assert.deepEqual(link.platinum, { id: '0', name: 'Maître', description: 'Tous les trophées', icon: 'https://img/0.png' }, 'the platinum reads in the app language');
  assert.deepEqual(link.trophies, { A1: { type: 'B' }, A2: { type: 'G' }, A3: { type: 'S' } }, 'English names matched through the English list');
  assert.ok(!net.calls.some((url) => url.includes('playstation.com')), 'no Sony request without a token');
});

test('the index is downloaded once a week, and a failed download keeps the cached copy', async () => {
  const net = network();
  const ctx = lib.publicContext({ fetchImpl: net.fetchImpl });
  const now = Date.now();
  assert.deepEqual(await pub.loadIndex(ctx, now), index.names);
  assert.deepEqual(await pub.loadIndex(ctx, now + 1000), index.names);
  assert.equal(net.calls.filter((url) => url === pub.INDEX_URL).length, 1);
  const offline = lib.publicContext({ fetchImpl: async () => json({}, 500) });
  assert.deepEqual(await pub.loadIndex(offline, now + 8 * 24 * 60 * 60 * 1000), index.names);
});

test('a name from the index is looked up exactly, then without its edition, and never on the prototype', () => {
  const names = { ...index.names, constructor: 'nope' };
  assert.equal(pub.listsInIndex(names, 'Sniper Story Deluxe Edition')[0].id, 'NPWR10000_00');
  assert.deepEqual(pub.listsInIndex(names, 'toString'), []);
  assert.deepEqual(pub.listsInIndex({ x: [{ id: '../evil', platform: 'PS4' }] }, 'x'), [], 'only real list ids pass');
});

test('a list with the same name but other trophies is never linked', async () => {
  const net = network();
  const other = { ...englishGame, appid: '101', achievements: [{ name: 'Z1', displayName: 'Nothing', description: '' }, { name: 'Z2', displayName: 'Alike', description: '' }, { name: 'Z3', displayName: 'Here', description: '' }] };
  assert.equal(await pub.linkGames([other], { fetchImpl: net.fetchImpl, exophase: noExophase }), 0);
  assert.equal(links.readLink('101'), null);
  assert.equal(links.isFresh('101', 'en-US'), true, 'the miss is remembered for MISS_MAX_AGE');
});

// Exophase items as fetchExophaseAchievementsMultiLang returns them for a PS5 page.
const exoItems = [
  { index: 1, grade: 'P', titles: { english: 'Elden Lord', french: 'Seigneur' }, descriptions: { english: 'All trophies', french: 'Tous les trophées' }, icon_url: 'https://m.exophase.com/p.png' },
  { index: 2, grade: 'B', titles: { english: 'Tutorial' }, descriptions: { english: 'Finish it' }, icon_url: 'https://m.exophase.com/1.png' },
  { index: 3, grade: 'G', titles: { english: 'Boss' }, descriptions: { english: 'Beat it' }, icon_url: 'https://m.exophase.com/2.png' },
  { index: 4, grade: 'S', titles: { english: 'Map' }, descriptions: { english: 'Read it' }, icon_url: 'http://m.exophase.com/3.png' },
];

function fakeExophase() {
  const asked = [];
  return {
    asked,
    searchExophaseTrophyLists: async (query) => {
      asked.push(['search', query]);
      return [
        { title: 'ELDEN RING NIGHTREIGN', slug: 'elden-ring-nightreign-psn', platform: 'ps5', baseUrl: 'https://www.exophase.com/game/elden-ring-nightreign-psn/trophies/' },
        { title: 'ELDEN RING', slug: 'elden-ring-psn-2', platform: 'ps4', baseUrl: 'https://www.exophase.com/game/elden-ring-psn-2/trophies/' },
        { title: 'ELDEN RING', slug: 'elden-ring-psn', platform: 'ps5', baseUrl: 'https://www.exophase.com/game/elden-ring-psn/trophies/' },
      ];
    },
    fetchExophaseAchievementsMultiLang: async (options) => {
      asked.push(['page', options.baseUrl, options.langKeys]);
      return { items: exoItems };
    },
  };
}

const eldenRing = {
  appid: '1245620',
  name: 'ELDEN RING',
  achievements: [
    { name: 'TUTO', displayName: 'Tutorial', description: '' },
    { name: 'BOSS', displayName: 'Boss', description: '' },
    { name: 'MAP', displayName: 'Map', description: '' },
  ],
};

test('a game missing from the index is tied to its Exophase list, PS5 first, with a non-Sony list id', async () => {
  const exo = fakeExophase();
  const linked = await pub.linkGames([eldenRing], { lang: 'french', fetchImpl: network().fetchImpl, exophase: exo });
  assert.equal(linked, 1);
  const link = links.readLink('1245620');
  assert.equal(link.listId, 'exophase:elden-ring-psn', 'another game with a longer name is left out');
  assert.equal(link.platform, 'PS5');
  assert.equal(link.service, 'trophy2');
  assert.deepEqual(link.platinum, { id: '1', name: 'Seigneur', description: 'Tous les trophées', icon: 'https://m.exophase.com/p.png' });
  assert.deepEqual(link.trophies, { TUTO: { type: 'B' }, BOSS: { type: 'G' }, MAP: { type: 'S' } });
  assert.deepEqual(exo.asked[1], ['page', 'https://www.exophase.com/game/elden-ring-psn/trophies/', ['english', 'french']]);
  const pages = exo.asked.filter(([kind]) => kind === 'page').map(([, url]) => url);
  assert.equal(pages.length, new Set(pages).size, 'a page is loaded once for both languages');
  assert.ok(!pages.some((url) => url.includes('nightreign')));
});

test('Exophase awards become Sony-shaped trophies, and a page without grades is no list', () => {
  const trophies = pub.exophaseTrophies(exoItems, 'french');
  assert.deepEqual(trophies[0], { trophyId: 1, trophyType: 'platinum', trophyName: 'Seigneur', trophyDetail: 'Tous les trophées', trophyIconUrl: 'https://m.exophase.com/p.png', trophyGroupId: 'default' });
  assert.equal(trophies[1].trophyName, 'Tutorial', 'an untranslated award keeps its English text');
  assert.equal(pub.exophaseTrophies([{ index: 1, grade: '', titles: { english: 'x' } }], 'english'), null);
  const small = pub.exophaseTrophies([{ index: 1, grade: 'P', titles: { english: 'x' }, icon_url: 'https://m.exophase.com/psn/awards/s/3gd61d7.png?v=1' }], 'english');
  assert.equal(small[0].trophyIconUrl, 'https://m.exophase.com/psn/awards/l/3gd61d7.png?v=1', 'the 240px icon, not the 64px one');
});

test('Exophase lookups stop at the pass budget and the daily one, and leftovers are not marked missing', async () => {
  const exo = fakeExophase();
  const games = Array.from({ length: 30 }, (_, at) => ({ ...eldenRing, appid: `g${at}`, name: `Game ${at}` }));
  const now = Date.now();
  await pub.linkGames(games, { fetchImpl: network().fetchImpl, exophase: exo, now });
  const searches = () => exo.asked.filter(([kind]) => kind === 'search').length;
  assert.equal(searches(), pub.EXOPHASE_LOOKUPS_PER_PASS);
  assert.equal(links.isFresh('g29', 'en-US'), false, 'a game left over waits for the next pass');
  for (let pass = 0; pass < 5; pass += 1) await pub.linkGames(games, { fetchImpl: network().fetchImpl, exophase: exo, now });
  assert.equal(searches(), pub.EXOPHASE_LOOKUPS_PER_DAY, 'no more than the daily budget');
  await pub.linkGames(games, { fetchImpl: network().fetchImpl, exophase: exo, now: now + 25 * 60 * 60 * 1000 });
  assert.equal(searches(), pub.EXOPHASE_LOOKUPS_PER_DAY + pub.EXOPHASE_LOOKUPS_PER_PASS, 'a new day has a new budget');
});

test('an unreachable Exophase or archive is not taken for a game with no list', async () => {
  const down = { searchExophaseTrophyLists: async () => Promise.reject(new Error('ETIMEDOUT')), fetchExophaseAchievementsMultiLang: async () => ({ items: [] }) };
  assert.equal(await pub.linkGames([eldenRing], { fetchImpl: network().fetchImpl, exophase: down }), 0);
  assert.equal(links.isFresh('1245620', 'en-US'), false);
  const archiveDown = async (url) => (String(url) === pub.INDEX_URL ? json(index) : json({}, 503));
  assert.equal(await pub.linkGames([englishGame], { fetchImpl: archiveDown, exophase: noExophase }), 0);
  assert.equal(links.isFresh('100', 'en-US'), false);
});

test('a game already linked is not looked up again', async () => {
  const net = network();
  await pub.linkGames([englishGame], { fetchImpl: net.fetchImpl, exophase: noExophase });
  const before = net.calls.length;
  await pub.linkGames([englishGame], { fetchImpl: net.fetchImpl, exophase: noExophase });
  assert.equal(net.calls.length, before);
});

test('the English achievements come from the Steam schema cache, a .db file', () => {
  const userData = path.join(temp, 'english-cache');
  const dir = path.join(userData, 'steam_cache', 'schema', 'english');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1245620.db'), JSON.stringify({ achievement: { list: [{ name: 'TUTO', displayName: 'Tutorial', description: 'Finish it', rarityPercent: 90 }] } }));
  assert.deepEqual(links.englishAchievementsOf(userData, '1245620'), [{ name: 'TUTO', displayName: 'Tutorial', description: 'Finish it' }]);
  assert.equal(links.englishAchievementsOf(userData, 'uplay-1'), null, 'only Steam appids have a Steam schema');
  assert.equal(links.englishAchievementsOf(userData, '1'), null);
});
