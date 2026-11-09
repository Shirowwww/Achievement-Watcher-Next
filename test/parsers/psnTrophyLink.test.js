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
  assert.equal(link.service, 'trophy2', 'the link remembers which trophy service holds the list');
  assert.match(link.platinum.id, /^\d+$/, 'the link remembers which trophy of the list is the platinum');
  assert.deepEqual(link.trophies, { ACH_FIRST: { type: 'B' }, ACH_GHOST: { type: 'G' }, ACH_COLLECT: { type: 'S', group: 'Deathstorm' } });
  assert.deepEqual(link.platinum, { id: '0', name: 'Tireur d’élite', description: 'Tous les trophées', icon: 'https://img/0.png' });
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

test('a miss on the account is handed to the next source instead of being written (#160)', async () => {
  seedCatalog();
  const psn = sony();
  const missed = [];
  const game = { appid: '43', name: 'Another PC Game', achievements };
  assert.equal(await links.linkGame(await psn.ctx(), game, { onMiss: (entry) => missed.push(entry.appid) }), null);
  assert.deepEqual(missed, ['43']);
  assert.equal(links.isFresh('43', 'fr-FR'), false, 'nothing is remembered yet: the public archive and Exophase still get their turn');
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

// LEGO Batman: Legacy of the Dark Knight has English-only achievements on Steam, even asked in
// French, and no English copy in the cache: its own texts are the English ones to try.
test('a game whose store answers in English matches the English trophies without an English copy', async () => {
  seedCatalog();
  const psn = sony();
  const englishCtx = await lib.createContext({ auth, fetchImpl: psn.fetchImpl, locale: 'en-US' });
  const untranslated = [
    { name: 'ACH_FIRST', displayName: 'First Shot', description: '' },
    { name: 'ACH_GHOST', displayName: 'Ghost', description: '' },
    { name: 'ACH_COLLECT', displayName: 'Collector', description: '' },
  ];
  const link = await links.linkGame(await psn.ctx(), { appid: '2215200', name: 'Sniper Elite 5', achievements: untranslated }, { englishCtx, english: null });
  assert.equal(link && link.listId, 'NPWR21465_00');
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

test('a name loses its last subtitle or qualifier, never more, and nothing when it has none', () => {
  assert.equal(links.withoutSubtitle('Sea of Thieves: 2026 Edition'), 'Sea of Thieves');
  assert.equal(links.withoutSubtitle('Grand Theft Auto V Enhanced (PC)'), 'Grand Theft Auto V Enhanced');
  assert.equal(links.withoutSubtitle('Cities: Skylines II - PC Edition'), 'Cities: Skylines II', 'only the last part goes');
  assert.equal(links.withoutSubtitle('Hollow Knight: Silksong'), 'Hollow Knight');
  assert.equal(links.withoutSubtitle('Grand Theft Auto: Vice City \u2013 The Definitive Edition'), 'Grand Theft Auto: Vice City');
  assert.equal(links.withoutSubtitle('Forza Horizon 5'), '');
  assert.equal(links.withoutSubtitle('Sniper Elite 5: Deluxe Edition'), '', 'an edition alone is already dropped by the first try');
  assert.equal(links.withoutSubtitle(': Nothing'), '');
});

// A series: its first game on PlayStation, and games of the series named after it.
const steps = Array.from({ length: 10 }, (_, at) => trophy(at + 1, 'bronze', `Step ${at + 1}`, ''));
function seedSeries() {
  lib.writeJson(path.join(lib.cacheRoot(), 'catalog.json'), {
    version: 2,
    builtAt: Date.now(),
    lists: [{ id: 'NPWR30000_00', name: 'Hollow Story', platform: 'PS4', service: 'trophy', icon: '', holder: '1' }],
  });
  const fetchImpl = async (url) => (String(url).includes('NPWR30000_00') && !String(url).includes('/trophyGroups?') ? json({ trophies: [trophy(0, 'platinum', 'All', ''), ...steps] }) : json({}, 404));
  return lib.createContext({ auth, fetchImpl, locale: 'fr-FR' });
}
const stepsOf = (count) => Array.from({ length: count }, (_, at) => ({ name: `S${at}`, displayName: `Step ${at + 1}`, description: '' }));
// Six names of ten in common: enough for a list that bears the game's own name.
const sequel = () => [...stepsOf(6), ...Array.from({ length: 4 }, (_, at) => ({ name: `N${at}`, displayName: `New ${at}`, description: '' }))];

test('without its subtitle a game finds the list of the same game under its plain name', async () => {
  const ctx = await seedSeries();
  const link = await links.linkGame(ctx, { appid: '1717113201', name: 'Hollow Story: 2026 Edition', achievements: stepsOf(10) });
  assert.equal(link && link.listId, 'NPWR30000_00');
  assert.equal(Object.keys(link.trophies).length, 10);
});

test('a sequel is not tied to the first game of its series, even sharing more than half of its names', async () => {
  const ctx = await seedSeries();
  assert.equal(await links.linkGame(ctx, { appid: '1668241504', name: 'Hollow Story: Silk', achievements: sequel() }), null);
  assert.equal(links.readLink('1668241504'), null);
  assert.equal(links.isFresh('1668241504', 'fr-FR'), true, 'the miss is remembered');
});

test('a game that bears the plain name keeps the plain rule', async () => {
  const ctx = await seedSeries();
  const link = await links.linkGame(ctx, { appid: '44', name: 'Hollow Story', achievements: sequel() });
  assert.equal(link && link.listId, 'NPWR30000_00', 'links that work today stay as they are');
});
