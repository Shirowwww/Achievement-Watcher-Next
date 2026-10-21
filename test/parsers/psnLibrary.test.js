'use strict';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const psnLibrary = require('../../app/parser/psnLibrary.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-psn-library-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

let profile = 0;
beforeEach(() => {
  profile += 1;
  psnLibrary.setUserDataPath(path.join(temp, `profile-${profile}`));
});

const auth = { accessToken: async () => 'TOKEN' };
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// One PS5 game with a DLC group and two trophies (one earned), and one PS3 game the game list misses.
function sony(overrides = {}) {
  const calls = [];
  // Matched in order, so the title id lookup comes before the trophy titles it contains.
  const routes = {
    '/titles/trophyTitles?npTitleIds=': { titles: [{ npTitleId: 'PPSA01234_00', trophyTitles: [{ npCommunicationId: 'NPWR11111_00' }] }] },
    '/trophyTitles?': {
      trophyTitles: [
        {
          npCommunicationId: 'NPWR11111_00',
          npServiceName: 'trophy2',
          trophyTitleName: 'Astro Trophies',
          trophyTitleIconUrl: 'https://img/astro-icon.png',
          trophyTitlePlatform: 'PS5',
          trophyGroupCount: 2,
          lastUpdatedDateTime: '2026-10-01T10:00:00Z',
        },
        {
          npCommunicationId: 'NPWR22222_00',
          npServiceName: 'trophy',
          trophyTitleName: 'Old Game',
          trophyTitleIconUrl: 'https://img/old-icon.png',
          trophyTitlePlatform: 'PS3',
          trophyGroupCount: 1,
          lastUpdatedDateTime: '2015-01-01T10:00:00Z',
        },
      ],
    },
    '/gamelist/v2/': {
      titles: [
        {
          titleId: 'PPSA01234_00',
          name: 'ASTRO BOT',
          localizedName: 'ASTRO BOT',
          concept: { media: { images: [{ type: 'GAMEHUB_COVER_ART', url: 'https://img/hub.jpg' }, { type: 'PORTRAIT_BANNER', url: 'https://img/portrait.jpg' }, { type: 'MASTER', url: 'http://img/insecure.png' }] } },
        },
      ],
    },
    '/universalSearch': {
      domainResponses: [{ results: [{ conceptMetadata: { name: 'Old Game™', media: { images: [{ type: 'GAMEHUB_COVER_ART', url: 'https://img/old-hub.jpg' }] } } }] }],
    },
    'NPWR11111_00/trophyGroups?': { trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'Astro' }, { trophyGroupId: '001', trophyGroupName: 'Space Pack' }] },
    'users/me/npCommunicationIds/NPWR11111_00/': {
      trophies: [
        { trophyId: 0, earned: true, earnedDateTime: '2026-09-30T20:00:00Z', trophyEarnedRate: '12.5' },
        { trophyId: 1, earned: false, trophyEarnedRate: '3.1', progress: '4' },
      ],
    },
    'npCommunicationIds/NPWR11111_00/trophyGroups/all/': {
      trophies: [
        { trophyId: 0, trophyType: 'platinum', trophyName: 'Platinum', trophyDetail: 'All of them', trophyIconUrl: 'https://img/t0.png', trophyGroupId: 'default' },
        { trophyId: 1, trophyType: 'bronze', trophyName: 'Collector', trophyDetail: 'Find ten', trophyIconUrl: 'https://img/t1.png', trophyGroupId: '001', trophyHidden: true, trophyProgressTargetValue: '10' },
      ],
    },
    'users/me/npCommunicationIds/NPWR22222_00/': { trophies: [{ trophyId: 0, earned: true, earnedDateTime: '2015-01-01T09:00:00Z', trophyEarnedRate: '40.0' }] },
    'npCommunicationIds/NPWR22222_00/trophyGroups/all/': { trophies: [{ trophyId: 0, trophyType: 'gold', trophyName: 'Old gold', trophyIconUrl: 'https://img/o0.png' }] },
    ...overrides,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const key = Object.keys(routes).find((needle) => String(url).includes(needle));
    if (!key) return json({}, 404);
    const route = routes[key];
    return typeof route === 'function' ? route() : json(route);
  };
  return { calls, fetchImpl };
}

const run = (fetchImpl, extra = {}) => psnLibrary.importLibrary({ auth, fetchImpl, locale: 'fr-FR', delayMs: 0, ...extra });

test('an import writes every trophy list with its trophies, DLC group, rarity and unlocks', async () => {
  const { fetchImpl, calls } = sony();
  const result = await run(fetchImpl);

  assert.deepEqual(result, { total: 2, created: 2, updated: 0, unchanged: 0, skipped: 0, failed: 0, rateLimited: false });
  assert.deepEqual(psnLibrary.listCachedTitles().sort(), ['psn-NPWR11111_00', 'psn-NPWR22222_00']);
  assert.ok(calls.every((call) => call.init.headers.Authorization === 'Bearer TOKEN' && call.init.headers['Accept-Language'] === 'fr-FR'));

  const game = psnLibrary.getGameData('psn-NPWR11111_00');
  assert.equal(game.name, 'ASTRO BOT', 'the store name wins over the trophy list name');
  assert.equal(game.system, 'playstation');
  assert.equal(game.source, 'PlayStation Network');
  assert.equal(game.platform, 'PS5');
  assert.equal(game.img.header, 'https://img/hub.jpg');
  assert.equal(game.img.portrait, 'https://img/portrait.jpg');
  assert.equal(game.img.icon, 'https://img/astro-icon.png', 'an http picture is never kept');
  assert.equal(game.achievement.unlocked, 1);
  const [platinum, collector] = game.achievement.list;
  assert.equal(platinum.type, 'P');
  assert.equal(platinum.rarityPct, 12.5);
  assert.equal(platinum.Achieved, true);
  assert.equal(platinum.UnlockTime, Date.parse('2026-09-30T20:00:00Z') / 1000);
  assert.equal(platinum.category, undefined, 'the base game carries no group label');
  assert.equal(collector.category, 'Space Pack');
  assert.equal(collector.hidden, 1);
  assert.deepEqual([collector.CurProgress, collector.MaxProgress], [4, 10]);
});

test('a PS3 list missing from the game list gets its pictures from the store search, by exact name', async () => {
  const { fetchImpl } = sony();
  await run(fetchImpl);
  const game = psnLibrary.getGameData('psn-NPWR22222_00');
  assert.equal(game.name, 'Old Game');
  assert.equal(game.platform, 'PS3');
  assert.equal(game.img.header, 'https://img/old-hub.jpg');
  assert.equal(game.img.headerStandIn, undefined);
});

test('without any store picture, the trophy icon stands in and says so', async () => {
  const { fetchImpl } = sony({ '/universalSearch': { domainResponses: [{ results: [{ conceptMetadata: { name: 'Another Game', media: { images: [] } } }] }] } });
  await run(fetchImpl);
  const game = psnLibrary.getGameData('psn-NPWR22222_00');
  assert.equal(game.img.header, 'https://img/old-icon.png');
  assert.equal(game.img.headerStandIn, true);
});

test('a second import skips the lists that did not move, and never loses an unlock', async () => {
  const first = sony();
  await run(first.fetchImpl);
  const second = sony({ 'users/me/npCommunicationIds/NPWR11111_00/': { trophies: [{ trophyId: 0, earned: false }] } });
  assert.equal((await run(second.fetchImpl)).unchanged, 2);
  assert.ok(!second.calls.some((call) => call.url.includes('/trophyGroups/all/')), 'no trophy list asked again');
  assert.ok(!second.calls.some((call) => call.url.includes('npTitleIds')), 'the title id mapping is kept');

  const forced = await run(second.fetchImpl, { force: true });
  assert.equal(forced.updated, 2);
  assert.equal(psnLibrary.getAchievements('psn-NPWR11111_00')['0'].Achieved, true);
});

test('a rate limit stops the import with what was done, a refused token stops it outright', async () => {
  const limited = sony({ 'npCommunicationIds/NPWR22222_00/trophyGroups/all/': () => json({}, 429) });
  const result = await run(limited.fetchImpl);
  assert.equal(result.created, 1);
  assert.equal(result.rateLimited, true);

  const refused = sony({ '/trophyTitles?': () => json({}, 401) });
  await assert.rejects(run(refused.fetchImpl), { code: 'psn-not-connected' });
  await assert.rejects(psnLibrary.importLibrary({ auth: { accessToken: async () => '' }, fetchImpl: refused.fetchImpl }), { code: 'psn-not-connected' });
});

test('one game with lists on two consoles gets the console in each tile name', () => {
  const titles = [
    { npCommunicationId: 'NPWR00001_00', trophyTitleName: 'Same Game', trophyTitlePlatform: 'PS4' },
    { npCommunicationId: 'NPWR00002_00', trophyTitleName: 'Same Game Trophies', trophyTitlePlatform: 'PS5,PSPC' },
    { npCommunicationId: 'NPWR00003_00', trophyTitleName: 'Solo', trophyTitlePlatform: 'PSVITA' },
  ];
  const names = psnLibrary.displayNames(titles, new Map());
  assert.deepEqual([...names.values()], ['Same Game (PS4)', 'Same Game (PS5)', 'Solo']);
});

test('only well-formed trophy list ids are accepted', () => {
  assert.equal(psnLibrary.normalizeListId('psn-npwr12345_00'), 'NPWR12345_00');
  assert.equal(psnLibrary.normalizeListId('NPWR12345_00/../x'), '');
  assert.equal(psnLibrary.getGameData('psn-../../cfg'), null);
});
