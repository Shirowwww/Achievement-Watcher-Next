'use strict';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-psn-link-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

let lib;
let links;
let profile = 0;
beforeEach(() => {
  for (const name of ['psnLibrary', 'psnCatalog', 'psnTrophyLink']) delete require.cache[require.resolve(`../../app/parser/${name}.js`)];
  lib = require('../../app/parser/psnLibrary.js');
  links = require('../../app/parser/psnTrophyLink.js');
  profile += 1;
  lib.setUserDataPath(path.join(temp, `profile-${profile}`));
});

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const auth = { accessToken: async () => 'TOKEN' };

// Two lists named like the game: an old one of another game, and the real PS5 one.
function seedCatalog() {
  lib.writeJson(path.join(lib.cacheRoot(), 'catalog.json'), {
    version: 2,
    builtAt: Date.now(),
    lists: [
      { id: 'NPWR00001_00', name: 'Sniper Elite 5', platform: 'PS3', service: 'trophy', icon: '', holder: '1' },
      { id: 'NPWR21465_00', name: 'Sniper Elite 5', platform: 'PS5', service: 'trophy2', icon: '', holder: '1' },
    ],
  });
}

const trophy = (trophyId, trophyType, trophyName, trophyDetail, trophyGroupId = 'default') => ({ trophyId, trophyType, trophyName, trophyDetail, trophyGroupId, trophyIconUrl: `https://img/${trophyId}.png` });

function sony({ locale = 'fr-FR' } = {}) {
  const calls = [];
  const lists = {
    NPWR00001_00: [trophy(0, 'gold', 'Autre jeu', 'Rien à voir'), trophy(1, 'bronze', 'Encore autre', 'Rien')],
    NPWR21465_00: [
      trophy(0, 'platinum', 'Tireur d’élite', 'Tous les trophées'),
      trophy(1, 'bronze', 'Premier tir', 'Tirer une fois'),
      trophy(2, 'gold', 'Fantôme', 'Finir sans être vu'),
      trophy(3, 'silver', 'Collectionneur', 'Trouver tous les objets', '001'),
    ],
  };
  const english = { 1: 'First Shot', 2: 'Ghost', 3: 'Collector' };
  const fetchImpl = async (url, init = {}) => {
    calls.push(String(url));
    const id = (String(url).match(/NPWR\d{5}_00/) || [])[0];
    const lang = (init.headers && (init.headers['Accept-Language'] || init.headers['accept-language'])) || '';
    if (String(url).includes('/trophyGroups?')) return json({ trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'Base' }, { trophyGroupId: '001', trophyGroupName: 'Deathstorm' }] });
    if (!lists[id]) return json({}, 404);
    const translated = lang.startsWith('en') ? lists[id].map((t) => ({ ...t, trophyName: english[t.trophyId] || t.trophyName })) : lists[id];
    return json({ trophies: translated });
  };
  return { calls, fetchImpl, ctx: () => lib.createContext({ auth, fetchImpl, locale }) };
}

const achievements = [
  { name: 'ACH_FIRST', displayName: 'Premier tir', description: '' },
  { name: 'ACH_GHOST', displayName: 'Fantôme', description: '' },
  { name: 'ACH_COLLECT', displayName: 'Collectionneuse', description: 'Trouver tous les objets' },
];

test('achievements are tied to trophies by name, then by description, never twice', () => {
  const trophies = [trophy(0, 'platinum', 'Plat', 'All'), trophy(1, 'bronze', 'Premier tir', 'x'), trophy(2, 'gold', 'Other', 'Trouver tous les objets')];
  const { matched, size } = links.matchTrophies([...achievements, { name: 'DUP', displayName: 'Premier tir' }], trophies);
  assert.equal(size, 2, 'the platinum has no achievement of its own');
  assert.deepEqual([...matched].map(([name, t]) => [name, t.trophyId]), [
    ['ACH_FIRST', 1],
    ['ACH_COLLECT', 2],
  ]);
});

test('a game own "everything unlocked" achievement named like the platinum becomes the platinum', () => {
  const trophies = [trophy(0, 'platinum', 'Cercle d’Elden', 'Obtenir tous les trophées'), trophy(1, 'gold', 'Seigneur', 'Fin')];
  const { matched, size } = links.matchTrophies(
    [
      { name: 'ALL', displayName: 'Cercle d’Elden', description: 'Obtenir tous les succès' },
      { name: 'END', displayName: 'Seigneur', description: '' },
    ],
    trophies
  );
  assert.equal(size, 1);
  assert.deepEqual([...matched].map(([name, t]) => [name, t.trophyType]), [
    ['END', 'gold'],
    ['ALL', 'platinum'],
  ]);
});

test('a game finds its PlayStation list, its grades, DLC groups and platinum', async () => {
  seedCatalog();
  const psn = sony();
  const link = await links.linkGame(await psn.ctx(), { appid: '1029690', name: 'Sniper Elite 5', achievements });
  assert.equal(link.listId, 'NPWR21465_00', 'the list of another game with the same name is left out');
  assert.deepEqual(link.trophies, { ACH_FIRST: { type: 'B' }, ACH_GHOST: { type: 'G' }, ACH_COLLECT: { type: 'S', group: 'Deathstorm' } });
  assert.deepEqual(link.platinum, { name: 'Tireur d’élite', description: 'Tous les trophées', icon: 'https://img/0.png' });
  assert.deepEqual(links.readLink('1029690'), link);
  assert.equal(links.isFresh('1029690', 'fr-FR'), true);
  assert.equal(links.isFresh('1029690', 'de-DE'), false, 'another language links again');
});

test('a game with no PlayStation list is remembered without asking Sony', async () => {
  seedCatalog();
  const psn = sony();
  assert.equal(await links.linkGame(await psn.ctx(), { appid: '42', name: 'Some PC Game', achievements }), null);
  assert.equal(psn.calls.length, 0);
  assert.equal(links.readLink('42'), null);
  assert.equal(links.isFresh('42', 'fr-FR'), true);
});

test('an edition name finds the plain list, and English names give a second chance', async () => {
  seedCatalog();
  const psn = sony();
  const englishCtx = await lib.createContext({ auth, fetchImpl: psn.fetchImpl, locale: 'en-US' });
  const translated = [
    { name: 'ACH_FIRST', displayName: 'Erster Schuss', description: '' },
    { name: 'ACH_GHOST', displayName: 'Geist', description: '' },
    { name: 'ACH_COLLECT', displayName: 'Sammler', description: '' },
  ];
  const english = [
    { name: 'ACH_FIRST', displayName: 'First Shot', description: '' },
    { name: 'ACH_GHOST', displayName: 'Ghost', description: '' },
    { name: 'ACH_COLLECT', displayName: 'Collector', description: '' },
  ];
  const link = await links.linkGame(await psn.ctx(), { appid: 'uplay-1', name: 'Sniper Elite 5 Deluxe Edition', achievements: translated }, { englishCtx, english });
  assert.equal(link.listId, 'NPWR21465_00');
  assert.deepEqual(Object.keys(link.trophies).sort(), ['ACH_COLLECT', 'ACH_FIRST', 'ACH_GHOST']);
});

test('a game missing from the catalog is looked up in the store, within the pass budget', async () => {
  seedCatalog();
  const psn = sony();
  const store = async (url, init = {}) => {
    const text = String(url);
    if (text.includes('/universalSearch')) return json({ domainResponses: [{ results: [{ conceptMetadata: { nameEn: 'Ghost Story', titleIds: ['PPSA00001_00'] } }] }] });
    if (text.includes('/users/me/titles/')) return json({ titles: [{ trophyTitles: [{ npCommunicationId: 'NPWR21465_00', npServiceName: 'trophy2', trophyTitleName: 'Ghost Story', trophyTitlePlatform: 'PS5' }] }] });
    return psn.fetchImpl(url, init);
  };
  const ctx = await lib.createContext({ auth, fetchImpl: store, locale: 'fr-FR' });
  const spent = { store: 0 };
  assert.equal(await links.linkGame(ctx, { appid: '7', name: 'Ghost Story', achievements }, { budget: spent }), null);
  assert.equal(links.isFresh('7', 'fr-FR'), false, 'a game left over by the budget is not marked as missing');

  const budget = { store: 1 };
  const link = await links.linkGame(ctx, { appid: '7', name: 'Ghost Story', achievements }, { budget });
  assert.equal(link.listId, 'NPWR21465_00');
  assert.equal(budget.store, 0);
});

test('a rate limit stops the linking instead of passing for a game with no list', async () => {
  seedCatalog();
  const ctx = await lib.createContext({ auth, fetchImpl: async () => json({}, 429), locale: 'fr-FR' });
  await assert.rejects(links.linkGame(ctx, { appid: '1029690', name: 'Sniper Elite 5', achievements }), { code: 'psn-rate-limited' });
  assert.equal(links.isFresh('1029690', 'fr-FR'), false);
});
