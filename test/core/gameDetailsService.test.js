'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createGameDetailsService } = require('../../app/util/gameDetailsService.js');

const STEAM_STORE = {
  name: 'Night Town',
  short_description: 'An open city.',
  genres: [{ description: 'RPG' }],
  developers: ['Red Studio'],
  publishers: ['Red'],
  release_date: { date: '9 Dec, 2020' },
};

const GAMESDB_RELEASE = {
  title: { '*': 'Night Town' },
  summary: { '*': 'From GamesDB.' },
  game: { first_release_date: '2020-12-10T00:00:00+0000', genres: [{ name: { '*': 'Shooter' } }], developers: [{ name: 'Red Studio' }], publishers: [{ name: 'Red' }] },
};

const METACRITIC = 'https://backend.metacritic.com';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-game-details-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function notFound() {
  return Object.assign(new Error('HTTP 404'), { status: 404 });
}

// A fake network: each url answers from the table, anything else is a 404; every call is counted.
function fakeNetwork(table) {
  const calls = [];
  return {
    calls,
    getJson: async (url) => {
      calls.push(url);
      const answer = table[url];
      if (answer instanceof Error) throw answer;
      if (answer === undefined) throw notFound();
      return answer;
    },
  };
}

function steamStore(data, calls = []) {
  return async (appid, lang) => {
    calls.push(`${appid}:${lang}`);
    return data === 'refused' ? { data: null, answered: false } : { data, answered: true };
  };
}

test('a Steam game shows its store page, cached so the next opening asks nothing', async (t) => {
  const cacheDir = tempDir(t);
  const storeCalls = [];
  const network = fakeNetwork({});
  const options = { cacheDir, getJson: network.getJson, fetchSteamStore: steamStore(STEAM_STORE, storeCalls) };

  const first = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });
  const second = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });

  assert.equal(first.details.description, 'An open city.');
  assert.deepEqual(first.details.sources, ['steam']);
  assert.deepEqual(second.details, first.details);
  assert.deepEqual(storeCalls, ['100:english']);
  assert.deepEqual(network.calls.filter((url) => new URL(url).origin !== METACRITIC &&!url.includes('/appreviewhistogram/')), [], 'the store page was complete: no GamesDB');
  assert.equal(network.calls.filter((url) => url.includes('/search/')).length, 1, 'the Metacritic search is cached too');
});

test('GamesDB fills what the store page lacks, by the store id and not by the name', async (t) => {
  const network = fakeNetwork({ 'https://gamesdb.gog.com/platforms/steam/external_releases/100': GAMESDB_RELEASE });
  const service = createGameDetailsService({
    cacheDir: tempDir(t),
    getJson: network.getJson,
    fetchSteamStore: steamStore({ name: 'Night Town', short_description: 'From Steam.' }),
  });

  const { details } = await service.get({ appid: '100', source: 'Goldberg', name: 'Night Town' });

  assert.equal(details.description, 'From Steam.');
  assert.deepEqual(details.genres, ['Shooter']);
  assert.deepEqual(details.sources, ['steam', 'gamesdb']);
  assert.ok(!network.calls.some((url) => url.includes('?title=')));
});

test('a refused store is not remembered, so the page asks again next time', async (t) => {
  const cacheDir = tempDir(t);
  const storeCalls = [];
  const options = { cacheDir, getJson: fakeNetwork({}).getJson, fetchSteamStore: steamStore('refused', storeCalls) };

  const first = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg' });
  await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg' });

  assert.equal(first.details, null);
  assert.equal(first.networkError, true);
  assert.equal(storeCalls.length, 2);
});

test('a store lookup that throws counts as no answer, not as a failed page', async (t) => {
  const network = fakeNetwork({ 'https://gamesdb.gog.com/platforms/steam/external_releases/100': GAMESDB_RELEASE });
  const service = createGameDetailsService({
    cacheDir: tempDir(t),
    getJson: network.getJson,
    fetchSteamStore: async () => {
      throw new Error('socket hang up');
    },
  });

  const result = await service.get({ appid: '100', source: 'Goldberg' });

  assert.equal(result.details.description, 'From GamesDB.');
  assert.equal(result.networkError, true);
});

test('the store page in English that a scan already fetched serves when the language page fails', async (t) => {
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: fakeNetwork({}).getJson, fetchSteamStore: steamStore('refused') });
  service.rememberSteamStore('100', STEAM_STORE);

  const result = await service.get({ appid: '100', source: 'Goldberg' }, { lang: 'french' });

  assert.equal(result.details.title, 'Night Town');
  assert.equal(result.networkError, true, 'the French page never answered, so the caller may ask again');
});

test('a forced refresh during a normal opening asks the store again instead of sharing it', async (t) => {
  const storeCalls = [];
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: fakeNetwork({}).getJson, fetchSteamStore: steamStore(STEAM_STORE, storeCalls) });

  await Promise.all([service.get({ appid: '100', source: 'Goldberg' }), service.get({ appid: '100', source: 'Goldberg' }, { force: true })]);

  assert.equal(storeCalls.length, 2);
});

test('a game without a store id is found by its exact title, then remembered', async (t) => {
  const cacheDir = tempDir(t);
  const search = 'https://gamesdb.gog.com/games?title=Night%20Town';
  const network = fakeNetwork({
    [search]: { items: [{ id: '5100', title: { '*': 'Night Town' }, releases: [{ platform_id: 'origin', external_id: 'x' }] }] },
    'https://gamesdb.gog.com/games/5100': { id: '5100', ...GAMESDB_RELEASE, ...GAMESDB_RELEASE.game },
  });
  const options = { cacheDir, getJson: network.getJson, fetchSteamStore: steamStore(null) };

  const { details } = await createGameDetailsService(options).get({ appid: '7001', source: 'ea', name: 'Night Town' });
  await createGameDetailsService(options).get({ appid: '7001', source: 'ea', name: 'Night Town' });

  assert.equal(details.description, 'From GamesDB.');
  assert.deepEqual(details.sources, ['gamesdb']);
  assert.equal(network.calls.filter((url) => url === search).length, 1);
});

test('an ambiguous title gives no page rather than another game', async (t) => {
  const network = fakeNetwork({
    'https://gamesdb.gog.com/games?title=Doom': {
      items: [
        { id: '1', title: 'Doom', releases: [{ platform_id: 'steam', external_id: '1' }] },
        { id: '2', title: 'DOOM', releases: [{ platform_id: 'steam', external_id: '2' }] },
      ],
    },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: '7002', source: 'ea', name: 'Doom' });

  assert.equal(details, null);
  assert.ok(!network.calls.some((url) => url.startsWith('https://gamesdb.gog.com/games/')));
});

test('an Epic game reads its product page through the store mapping', async (t) => {
  const network = fakeNetwork({
    'https://store-content.ak.epicgames.com/api/content/productmapping': { min: 'hades' },
    'https://store-content.ak.epicgames.com/api/en-US/content/products/hades': {
      productName: 'Underworld',
      pages: [{ data: { about: { shortDescription: 'Battle out of hell.' } } }],
    },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: 'min', source: 'epic-official', name: 'Underworld' });

  assert.equal(details.description, 'Battle out of hell.');
  assert.equal(details.sources[0], 'epic');
});

test('two openings of the same page at once share one lookup', async (t) => {
  const storeCalls = [];
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: fakeNetwork({}).getJson, fetchSteamStore: steamStore(STEAM_STORE, storeCalls) });

  await Promise.all([service.get({ appid: '100', source: 'Goldberg' }), service.get({ appid: '100', source: 'Goldberg' })]);

  assert.equal(storeCalls.length, 1);
});

test('a request that is not a plain game is refused before any lookup', async (t) => {
  const storeCalls = [];
  const network = fakeNetwork({});
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(STEAM_STORE, storeCalls) });

  for (const game of [null, 'x', { appid: '' }, { appid: '../../etc' , source: 'epic' }, { appid: '..', source: 'epic' }, { appid: 'a'.repeat(500) }]) {
    assert.deepEqual(await service.get(game), { details: null });
  }
  assert.deepEqual(await service.get({ appid: '100', source: 'Goldberg' }, { lang: '../x' }).then((r) => r.details.title), 'Night Town');
  assert.deepEqual(storeCalls, ['100:english']);
  assert.deepEqual(network.calls.filter((url) => url.includes('..')), []);
});

test('a broken cache file is read as missing, not as an error', async (t) => {
  const cacheDir = tempDir(t);
  const storeCalls = [];
  const options = { cacheDir, getJson: fakeNetwork({}).getJson, fetchSteamStore: steamStore(STEAM_STORE, storeCalls) };
  await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg' });
  for (const file of fs.readdirSync(cacheDir, { recursive: true })) {
    const full = path.join(cacheDir, file);
    if (fs.statSync(full).isFile()) fs.writeFileSync(full, '{not json');
  }

  const { details } = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg' });

  assert.equal(details.title, 'Night Town');
  assert.equal(storeCalls.length, 2);
});

const MS = 'https://displaycatalog.mp.microsoft.com/v7.0';
const EG = 'https://api.egdata.app';
const MS_PRODUCT = {
  ProductId: '9NKX70BBCDRN',
  LocalizedProperties: [{ ProductTitle: 'Forza Horizon 5 Standard Edition', ShortDescription: 'Une aventure Horizon.', DeveloperName: 'Playground Games', PublisherName: 'Xbox Game Studios' }],
  MarketProperties: [{ OriginalReleaseDate: '2021-11-08T23:00:00Z', UsageData: [{ AggregateTimeSpan: 'AllTime', AverageRating: 4.6, RatingCount: 120 }] }],
};

test('an Xbox game reads its Microsoft Store page, found by its exact title, in the app language', async (t) => {
  const search = `${MS}/productFamilies/autosuggest?market=FR&languages=fr-fr&query=Forza%20Horizon%205&productFamilyNames=Games`;
  const network = fakeNetwork({
    [search]: { Results: [{ ProductFamilyName: 'Games', Products: [{ ProductId: '9NKX70BBCDRN', Title: 'Forza Horizon 5 Standard Edition', Type: 'Game' }] }] },
    [`${MS}/products?bigIds=9NKX70BBCDRN&market=FR&languages=fr-fr`]: { Products: [MS_PRODUCT] },
  });
  const options = { cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) };
  const game = { appid: 'Microsoft.624F8B84B80_8wekyb3d8bbwe', source: 'Xbox PC', name: 'Forza Horizon 5' };

  const { details } = await createGameDetailsService(options).get(game, { lang: 'french' });
  await createGameDetailsService(options).get(game, { lang: 'french' });

  assert.equal(details.description, 'Une aventure Horizon.');
  assert.equal(details.sources[0], 'microsoft');
  assert.deepEqual(details.ratings[0], { source: 'microsoft', score: 4.6, outOf: 5, count: 120, url: 'https://www.xbox.com/games/store/p/9NKX70BBCDRN' });
  assert.equal(network.calls.filter((url) => url === search).length, 1, 'the second opening reads the cache');
});

test('an Epic game reads egdata in the app language, with its gallery and players rating', async (t) => {
  const network = fakeNetwork({
    [`${EG}/sandboxes/min/base-game?locale=fr`]: { id: 'offer1', title: 'Hades', description: 'Défiez le dieu des morts.', developerDisplayName: 'Supergiant Games' },
    [`${EG}/offers/offer1/media`]: { images: [{ src: 'https://cdn2.unrealengine.com/g1.jpg' }], videos: [] },
    [`${EG}/offers/offer1/polls`]: { averageRating: 4.8 },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: 'min', source: 'epic-official', name: 'Hades' }, { lang: 'french' });

  assert.equal(details.description, 'Défiez le dieu des morts.');
  assert.equal(details.screenshots.length, 1);
  assert.deepEqual(details.ratings, [{ source: 'epic', score: 4.8, outOf: 5, count: 0, url: '' }]);
  assert.ok(!network.calls.some((url) => url.includes('productmapping')), 'egdata answered: the old page is not needed');
});

test('an id egdata sends back is never a ".." path step to another route', async (t) => {
  const network = fakeNetwork({
    [`${EG}/sandboxes/min/base-game?locale=fr`]: { id: '..', title: 'Hades' },
    [`${EG}/sandboxes/art1/base-game?locale=fr`]: notFound(),
    [`${EG}/assets/art1`]: { artifactId: 'art1', namespace: '..' },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  await service.get({ appid: 'min', source: 'epic-official', name: 'Hades' }, { lang: 'french' });
  await service.get({ appid: 'art1', source: 'epic-official', name: 'Hades' }, { lang: 'french' });

  assert.ok(!network.calls.some((url) => url.includes('/../') || url.endsWith('/..')), network.calls.join('\n'));
});

test('an egdata gallery or rating that did not answer is asked again, not cached as missing', async (t) => {
  const cacheDir = tempDir(t);
  const polls = `${EG}/offers/offer1/polls`;
  const table = {
    [`${EG}/sandboxes/min/base-game?locale=en`]: { id: 'offer1', title: 'Hades', description: 'Defy the god of the dead.' },
    [`${EG}/offers/offer1/media`]: { images: [], videos: [] },
    [polls]: Object.assign(new Error('socket hang up'), { status: 503 }),
  };
  const network = fakeNetwork(table);
  const options = { cacheDir, getJson: network.getJson, fetchSteamStore: steamStore(null) };

  const first = await createGameDetailsService(options).get({ appid: 'min', source: 'epic-official', name: 'Hades' });
  table[polls] = { averageRating: 4.9 };
  const second = await createGameDetailsService(options).get({ appid: 'min', source: 'epic-official', name: 'Hades' });

  assert.equal(first.networkError, true);
  assert.deepEqual(second.details.ratings, [{ source: 'epic', score: 4.9, outOf: 5, count: 0, url: '' }]);
});

test('an Epic artifact id is turned into its namespace by egdata before its page is read', async (t) => {
  const network = fakeNetwork({
    [`${EG}/assets/Fig`]: { artifactId: 'Fig', namespace: 'min' },
    [`${EG}/sandboxes/min/base-game?locale=en`]: { id: 'offer1', title: 'Hades', description: 'Defy the god of the dead.' },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: 'Fig', source: 'epic', name: 'Hades' });

  assert.equal(details.description, 'Defy the god of the dead.');
});

test('the old Epic page is read in the app language when egdata does not know the game', async (t) => {
  const network = fakeNetwork({
    'https://store-content.ak.epicgames.com/api/content/productmapping': { min: 'hades' },
    'https://store-content.ak.epicgames.com/api/fr-FR/content/products/hades': { productName: 'Hades', pages: [{ data: { about: { shortDescription: 'Sortez des Enfers.' } } }] },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: 'min', source: 'epic-official', name: 'Hades' }, { lang: 'french' });

  assert.equal(details.description, 'Sortez des Enfers.');
});

test('a GOG game reads its translated product page from GOG itself', async (t) => {
  const network = fakeNetwork({
    'https://api.gog.com/products/1207658924?expand=description,screenshots,videos&locale=fr-FR': { title: 'The Witcher', description: { lead: 'Un jeu de rôle.' } },
    'https://catalog.gog.com/v1/catalog?query=like:The%20Witcher&limit=20': { products: [{ id: '1207658930', reviewsRating: 47 }, { id: '1207658924', reviewsRating: 46 }] },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: '1207658924', source: 'GOG Galaxy', name: 'The Witcher' }, { lang: 'french' });

  assert.equal(details.description, 'Un jeu de rôle.');
  assert.equal(details.sources[0], 'gog');
  assert.deepEqual(details.ratings, [{ source: 'gog', score: 4.6, outOf: 5, count: 0, url: '' }], 'the rating of that very product, not of The Witcher 2');
});

test('a Xenia game is found in GamesDB by its title id, without a store search', async (t) => {
  const network = fakeNetwork({ 'https://gamesdb.gog.com/platforms/xboxone/external_releases/1297287142': GAMESDB_RELEASE });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: '4D5307E6', source: 'xenia emulator', name: 'Halo 3' });

  assert.equal(details.description, 'From GamesDB.');
  assert.ok(!network.calls.some((url) => url.includes('displaycatalog')), 'an Xbox 360 game has no Microsoft Store page to search');
});

test('a RetroAchievements game is searched by its title alone, on its own console', async (t) => {
  const network = fakeNetwork({
    'https://gamesdb.gog.com/games?title=Spyro%20the%20Dragon': {
      items: [
        { id: '1', title: 'Spyro the Dragon', releases: [{ platform_id: 'psx', external_id: 'a' }] },
        { id: '2', title: 'Spyro the Dragon', releases: [{ platform_id: 'gba', external_id: 'b' }] },
      ],
    },
    'https://gamesdb.gog.com/games/1': { id: '1', ...GAMESDB_RELEASE, ...GAMESDB_RELEASE.game },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: 'ra-11', source: 'RetroAchievements', name: 'Spyro the Dragon (PlayStation)' });

  assert.equal(details.description, 'From GamesDB.');
});

test("a PC port is searched as the game it ports, on that game's console", async (t) => {
  const network = fakeNetwork({
    'https://gamesdb.gog.com/games?title=Pikmin': {
      items: [
        { id: '1', title: 'Pikmin', releases: [{ platform_id: 'ncube', external_id: 'a' }] },
        { id: '2', title: 'Pikmin', releases: [{ platform_id: 'nswitch', external_id: 'b' }] },
      ],
    },
    'https://gamesdb.gog.com/games/1': { id: '1', ...GAMESDB_RELEASE, ...GAMESDB_RELEASE.game },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(null) });

  const { details } = await service.get({ appid: 'recompports-nectar', source: 'PC Port', name: 'Pikmin (Open Nectar)', console: 'GameCube' });
  const borrowed = await service.get({ appid: 'recompports-mod', source: 'PC Port', name: 'Pikmin Mod (Launcher)', console: 'GameCube', detailsTitle: 'Pikmin' });

  assert.equal(details.description, 'From GamesDB.');
  assert.equal(borrowed.details.description, 'From GamesDB.', 'a mod takes the page of the game it is closest to');
});

test('a GOG catalogue that did not answer leaves the GOG page shown and its rating asked again', async (t) => {
  const cacheDir = tempDir(t);
  const catalog = 'https://catalog.gog.com/v1/catalog?query=like:The%20Witcher&limit=20';
  const table = {
    'https://api.gog.com/products/1207658924?expand=description,screenshots,videos&locale=en-US': { title: 'The Witcher', description: { lead: 'A role-playing game.' } },
    [catalog]: Object.assign(new Error('timeout'), { status: 504 }),
  };
  const options = { cacheDir, getJson: fakeNetwork(table).getJson, fetchSteamStore: steamStore(null) };
  const game = { appid: '1207658924', source: 'GOG Galaxy', name: 'The Witcher' };

  const first = await createGameDetailsService(options).get(game);
  table[catalog] = { products: [{ id: '1207658924', reviewsRating: 46 }] };
  const second = await createGameDetailsService(options).get(game);

  assert.equal(first.details.description, 'A role-playing game.');
  assert.equal(first.networkError, true);
  assert.deepEqual(second.details.ratings, [{ source: 'gog', score: 4.6, outOf: 5, count: 0, url: '' }]);
});

test('every game gets the Metacritic critics and players scores, found by its exact title', async (t) => {
  const network = fakeNetwork({
    [`${METACRITIC}/finder/metacritic/search/Night%20Town/web?offset=0&limit=20&mcoTypeId=13`]: { data: { items: [{ typeId: 13, slug: 'night-town', title: 'Night Town', platforms: [{ name: 'PC' }] }] } },
    [`${METACRITIC}/reviews/metacritic/critic/games/night-town/stats/web`]: { data: { item: { score: 88, reviewCount: 40 } } },
    [`${METACRITIC}/reviews/metacritic/user/games/night-town/stats/web`]: { data: { item: { score: 7.9, reviewCount: 1200 } } },
  });
  const service = createGameDetailsService({ cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(STEAM_STORE) });

  const { details } = await service.get({ appid: '100', source: 'Goldberg', name: 'Night Town' });

  assert.deepEqual(details.ratings, [
    { source: 'metacritic', score: 88, count: 40, url: 'https://www.metacritic.com/game/night-town/' },
    { source: 'metacritic-users', score: 7.9, outOf: 10, count: 1200, url: 'https://www.metacritic.com/game/night-town/user-reviews/' },
  ]);
  assert.equal(details.description, 'An open city.', 'Metacritic adds ratings, never the text');
});

test('a Metacritic score that did not answer is asked again, not cached as missing', async (t) => {
  const cacheDir = tempDir(t);
  const users = `${METACRITIC}/reviews/metacritic/user/games/night-town/stats/web`;
  const table = {
    [`${METACRITIC}/finder/metacritic/search/Night%20Town/web?offset=0&limit=20&mcoTypeId=13`]: { data: { items: [{ typeId: 13, slug: 'night-town', title: 'Night Town', platforms: [{ name: 'PC' }] }] } },
    [`${METACRITIC}/reviews/metacritic/critic/games/night-town/stats/web`]: { data: { item: { score: 88, reviewCount: 40 } } },
    [users]: Object.assign(new Error('timeout'), { status: 504 }),
  };
  const options = { cacheDir, getJson: fakeNetwork(table).getJson, fetchSteamStore: steamStore(STEAM_STORE) };

  const first = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });
  table[users] = { data: { item: { score: 7.9, reviewCount: 1200 } } };
  const second = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });

  assert.equal(first.networkError, true);
  assert.equal(second.details.ratings.length, 2);
});

test('a Steam review histogram that did not answer is asked again, not cached as missing', async (t) => {
  const histogram = 'https://store.steampowered.com/appreviewhistogram/100?l=english&review_score_preference=0';
  const table = { [histogram]: Object.assign(new Error('timeout'), { status: 503 }) };
  const options = { cacheDir: tempDir(t), getJson: fakeNetwork(table).getJson, fetchSteamStore: steamStore(STEAM_STORE) };

  const first = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });
  table[histogram] = { success: 1, results: { rollups: [{ recommendations_up: 9, recommendations_down: 1 }] } };
  const second = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });

  assert.equal(first.details.title, 'Night Town', 'the page itself still shows');
  assert.equal(second.details.ratings[0].score, 90);
});

test('a Steam game gets its players rating from the review histogram, cached with the page', async (t) => {
  const histogram = 'https://store.steampowered.com/appreviewhistogram/100?l=english&review_score_preference=0';
  const network = fakeNetwork({ [histogram]: { success: 1, results: { rollups: [{ recommendations_up: 90, recommendations_down: 10 }] } } });
  const options = { cacheDir: tempDir(t), getJson: network.getJson, fetchSteamStore: steamStore(STEAM_STORE) };

  const { details } = await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });
  await createGameDetailsService(options).get({ appid: '100', source: 'Goldberg', name: 'Night Town' });

  assert.deepEqual(details.ratings, [{ source: 'steam', score: 90, outOf: 100, percent: true, count: 100, url: 'https://store.steampowered.com/app/100/#app_reviews_hash' }]);
  assert.equal(network.calls.filter((url) => url === histogram).length, 1);
});
