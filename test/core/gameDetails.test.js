'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const details = require('../../app/util/gameDetails.js');
const { resolveSteamStoreDetails } = require('../../app/util/steamMetadata.js');

const gogImage = (hash) => ({ url_format: `https://images.gog.com/${hash}{formatter}.{ext}?namespace=gamesdb` });

const GAMESDB_RELEASE = {
  platform_id: 'steam',
  external_id: '100',
  title: { '*': 'Night Town', 'en-US': 'Night Town' },
  summary: { '*': 'An open city.\r\n\r\nPlay as V.' },
  game: {
    id: '5100',
    first_release_date: '2020-12-10T00:00:00+0000',
    genres: [{ name: { '*': 'Role-playing (RPG)', 'en-US': 'Role-playing (RPG)' } }, { name: { '*': 'Shooter' } }],
    developers: [{ name: 'Red Studio' }],
    publishers: [{ name: 'Red' }],
    aggregated_rating: 75.24,
    videos: [
      { provider: 'youtube', video_id: 'UnA7tepsc7s', name: 'Launch trailer' },
      { provider: 'vimeo', video_id: '1', name: 'Elsewhere' },
      { provider: 'youtube', video_id: 'bad id"onload', name: 'Injected' },
    ],
    screenshots: [gogImage('aa11'), gogImage('bb22')],
    background: gogImage('cc33'),
  },
};

test('Steam store details keep the page fields and drop what is not text or https', () => {
  const store = resolveSteamStoreDetails({
    name: 'Night Town',
    short_description: 'A <b>dark</b> city &quot;obsessed&quot; with power.',
    genres: [{ id: '3', description: 'RPG' }, { description: '' }],
    developers: ['Red Studio', 'Red Studio'],
    publishers: ['Red'],
    release_date: { coming_soon: false, date: '9 Dec, 2020' },
    website: 'http://insecure.example',
    metacritic: { score: 86, url: 'https://www.metacritic.com/game/night-town' },
    movies: [
      {
        name: 'Trailer',
        thumbnail: 'https://cdn.example/t.jpg',
        hls_h264: 'https://video.example/master.m3u8',
        dash_h264: 'https://video.example/dash.mpd',
      },
      { name: 'No stream', thumbnail: 'https://cdn.example/t2.jpg' },
    ],
    screenshots: [{ path_thumbnail: 'https://cdn.example/s.600.jpg', path_full: 'https://cdn.example/s.1920.jpg' }, { path_full: 'javascript:alert(1)' }],
    background_raw: 'https://cdn.example/bg.jpg',
  });

  assert.equal(store.description, 'A dark city "obsessed" with power.');
  assert.deepEqual(store.genres, ['RPG']);
  assert.deepEqual(store.developers, ['Red Studio']);
  assert.equal(store.releaseDate, '9 Dec, 2020');
  assert.equal(store.website, '');
  assert.deepEqual(store.ratings, [{ source: 'metacritic', score: 86, url: 'https://www.metacritic.com/game/night-town' }]);
  assert.deepEqual(store.videos, [
    { name: 'Trailer', thumbnail: 'https://cdn.example/t.jpg', hls: 'https://video.example/master.m3u8', dash: 'https://video.example/dash.mpd' },
  ]);
  assert.deepEqual(store.screenshots, [{ thumb: 'https://cdn.example/s.600.jpg', full: 'https://cdn.example/s.1920.jpg' }]);
  assert.equal(store.background, 'https://cdn.example/bg.jpg');
});

test('a Steam game that is not out yet shows no release date', () => {
  const store = resolveSteamStoreDetails({ name: 'Soon', release_date: { coming_soon: true, date: 'Coming soon' } });
  assert.equal(store.releaseDate, '');
});

test('a GamesDB release gives its text, people, rating, YouTube trailers and images', () => {
  const game = details.fromGamesDb(GAMESDB_RELEASE);

  assert.equal(game.title, 'Night Town');
  assert.equal(game.description, 'An open city.\n\nPlay as V.');
  assert.deepEqual(game.genres, ['Role-playing (RPG)', 'Shooter']);
  assert.deepEqual(game.developers, ['Red Studio']);
  assert.deepEqual(game.publishers, ['Red']);
  assert.equal(game.releaseDate, '2020-12-10');
  assert.deepEqual(game.ratings, [{ source: 'gamesdb', score: 75, url: '' }]);
  assert.deepEqual(game.videos, [{ name: 'Launch trailer', thumbnail: 'https://i.ytimg.com/vi/UnA7tepsc7s/hqdefault.jpg', youtube: 'UnA7tepsc7s' }]);
  assert.deepEqual(game.screenshots[0], { thumb: 'https://images.gog.com/aa11_product_card_v2_mobile_slider_639.jpg?namespace=gamesdb', full: 'https://images.gog.com/aa11.jpg?namespace=gamesdb' });
  assert.equal(game.background, 'https://images.gog.com/cc33.jpg?namespace=gamesdb');
});

test('a GamesDB game record (the title search answer) reads like a release', () => {
  const game = details.fromGamesDb({ ...GAMESDB_RELEASE.game, title: { '*': 'Night Town' }, summary: { '*': 'Short.' } });
  assert.equal(game.title, 'Night Town');
  assert.equal(game.description, 'Short.');
  assert.deepEqual(game.publishers, ['Red']);
});

test('an Epic product page gives its text, release date, gallery and streamed trailers only', () => {
  const recipes = JSON.stringify({
    'en-US': [
      {
        recipe: 'video-fmp4',
        outputs: [
          { contentType: 'application/dash+xml', key: 'manifest', url: 'https://media-cdn.epicgames.com/a/a.mpd' },
          { contentType: 'image/png', key: 'thumbnail', url: 'https://cdn2.unrealengine.com/thumb.png' },
        ],
      },
    ],
  });
  const page = {
    productName: 'Underworld',
    pages: [
      {
        _slug: 'home',
        data: {
          about: { shortDescription: 'Battle out of hell.', developerAttribution: 'Super Studio', publisherAttribution: 'Super Studio' },
          hero: { backgroundImageUrl: 'https://cdn2.unrealengine.com/bg.png' },
          meta: { releaseDate: '2018-12-06T13:00:00.000Z' },
          gallery: { galleryImages: [{ src: 'https://cdn2.unrealengine.com/g1.jpg' }, { src: 'http://cdn2.unrealengine.com/g2.jpg' }] },
          carousel: { items: [{ video: { recipes } }, { video: { recipes: '{not json' } }, { image: { src: 'https://cdn2.unrealengine.com/c1.png' } }] },
        },
      },
    ],
  };

  const game = details.fromEpicProduct(page);

  assert.equal(game.title, 'Underworld');
  assert.equal(game.description, 'Battle out of hell.');
  assert.deepEqual(game.developers, ['Super Studio']);
  assert.equal(game.releaseDate, '2018-12-06');
  assert.deepEqual(game.screenshots, [{ thumb: 'https://cdn2.unrealengine.com/g1.jpg', full: 'https://cdn2.unrealengine.com/g1.jpg' }]);
  assert.deepEqual(game.videos, [{ name: '', thumbnail: 'https://cdn2.unrealengine.com/thumb.png', dash: 'https://media-cdn.epicgames.com/a/a.mpd', hls: '' }]);
  assert.equal(game.background, 'https://cdn2.unrealengine.com/bg.png');
});

test('merging keeps the first source for each field and fills only what it lacks', () => {
  const steam = { title: 'Night Town', description: 'From Steam.', genres: [], videos: [{ hls: 'https://a' }], ratings: [{ source: 'metacritic', score: 86, url: '' }] };
  const gamesdb = details.fromGamesDb(GAMESDB_RELEASE);

  const merged = details.mergeDetails([
    { source: 'steam', value: steam },
    { source: 'gamesdb', value: gamesdb },
    { source: 'epic', value: null },
  ]);

  assert.equal(merged.description, 'From Steam.');
  assert.deepEqual(merged.genres, ['Role-playing (RPG)', 'Shooter']);
  assert.deepEqual(merged.videos, [{ hls: 'https://a' }]);
  assert.deepEqual(
    merged.ratings.map((rating) => rating.source),
    ['metacritic', 'gamesdb']
  );
  assert.deepEqual(merged.sources, ['steam', 'gamesdb']);
  assert.equal(details.mergeDetails([{ source: 'steam', value: null }]), null);
});

test('of two ratings from one source, the one that says how many reviewed is kept', () => {
  const merged = details.mergeDetails([
    { source: 'steam', value: { title: 'Hades', ratings: [{ source: 'metacritic', score: 93, url: 'https://steam.example' }] } },
    { source: 'metacritic', value: { ratings: [{ source: 'metacritic', score: 93, count: 58, url: 'https://mc.example' }] } },
  ]);

  assert.deepEqual(merged.ratings, [{ source: 'metacritic', score: 93, count: 58, url: 'https://mc.example' }]);
});

test('the GamesDB release a game is known by follows its own store id, never a guess', () => {
  assert.deepEqual(details.gamesDbIdentity({ appid: '100', source: 'Goldberg' }, '100'), { platform: 'steam', id: '100' });
  assert.deepEqual(details.gamesDbIdentity({ appid: 'gog-1207658924', source: 'GOG Galaxy' }, ''), { platform: 'gog', id: '1207658924' });
  assert.deepEqual(details.gamesDbIdentity({ appid: 'uplay-635', source: 'Ubisoft Connect' }, ''), { platform: 'uplay', id: '635' });
  assert.deepEqual(details.gamesDbIdentity({ appid: 'CUSA13285', source: 'shadps4 emulator' }, ''), { platform: 'psn', id: 'CUSA13285_00' });
  assert.equal(details.gamesDbIdentity({ appid: 'NPWR12345_00', source: 'playstation network' }, ''), null);
  assert.equal(details.gamesDbIdentity({ appid: '12345', source: 'ea' }, ''), null);
});

test('a console list takes the game of that name released since its console', () => {
  const item = (id, year) => ({ id, title: 'God of War', first_release_date: `${year}-03-22T00:00:00+0000`, releases: [{ platform_id: 'psn', external_id: id }] });
  const items = [item('1', 2009), item('2', 2018), item('3', 2005)];

  assert.equal(details.chooseTitleMatch(items, 'God of War', ['psn']), null);
  assert.equal(details.chooseTitleMatch(items, 'God of War', ['psn'], { launchYear: 2013 })?.id, '2');
  assert.equal(details.chooseTitleMatch(items, 'God of War', ['psn'], { launchYear: 2006 }), null, 'two fit: still no guess');
});

test('the title search accepts one exact match and nothing ambiguous', () => {
  const item = (id, title, platforms) => ({ id, title: { '*': title }, releases: platforms.map((platform_id) => ({ platform_id, external_id: id })) });

  assert.equal(details.chooseTitleMatch([item('1', 'Hollow Knight', ['steam']), item('2', 'Hollow Knight: Silksong', ['steam'])], 'Hollow Knight™', ['steam'])?.id, '1');
  assert.equal(details.chooseTitleMatch([item('1', 'Doom', ['steam']), item('2', 'DOOM', ['steam'])], 'Doom', ['steam']), null);
  assert.equal(details.chooseTitleMatch([item('1', 'Doom', ['psn']), item('2', 'Doom', ['steam'])], 'Doom', ['steam'])?.id, '2');
  assert.equal(details.chooseTitleMatch([item('1', 'Doom', ['psn']), item('2', 'Doom', ['xboxone'])], 'Doom', ['steam']), null);
  assert.equal(details.chooseTitleMatch([item('1', 'Doom', ['psn'])], 'Doom', ['steam'])?.id, '1');
  assert.equal(details.chooseTitleMatch([item('1', 'Doom', ['generic'])], 'Doom', ['steam']), null);
});

test('a retro game listed twice on its console is the record with far more releases there', () => {
  const item = (id, platforms) => ({ id, title: 'Spyro the Dragon', releases: platforms.map((platform_id) => ({ platform_id, external_id: id })) });
  const main = item('1', ['psx', 'psx', 'xboxone', 'psx', 'psx', 'psx']);

  assert.equal(details.chooseTitleMatch([item('2', ['psx', 'psn']), main], 'Spyro the Dragon', ['psx'])?.id, '1');
  assert.equal(details.chooseTitleMatch([item('2', ['psx', 'psx', 'psx']), main], 'Spyro the Dragon', ['psx']), null, 'close counts stay ambiguous');
});

test("a PC port's game, listed twice alike, is the record GamesDB gives first, on its console first", () => {
  const item = (id, platforms) => ({ id, title: 'The Legend of Zelda: Twilight Princess', releases: platforms.map((platform_id) => ({ platform_id, external_id: id })) });
  const both = [item('wii', ['nwii']), item('1', ['ncube', 'nwii']), item('2', ['nwii', 'ncube'])];

  assert.equal(details.chooseTitleMatch(both, 'The Legend of Zelda: Twilight Princess', ['ncube']), null, 'other games stay strict');
  assert.equal(details.chooseTitleMatch(both, 'The Legend of Zelda: Twilight Princess', ['ncube'], { decide: true })?.id, '1');
  assert.equal(details.chooseTitleMatch([item('a', ['psp'])], 'Other', ['ncube'], { decide: true }), null, 'never a game of another name');
  assert.equal(details.decidesTies({ source: 'PC Port' }), true);
  assert.equal(details.decidesTies({ source: 'Steam' }), false);
});

test('the title to search drops marks and refuses ids posing as names', () => {
  assert.equal(details.searchTitle('  Hollow Knight™ '), 'Hollow Knight');
  assert.equal(details.searchTitle('1091500'), '');
  assert.equal(details.searchTitle('CUSA13285'), '');
  assert.equal(details.searchTitle('NPWR10600_00'), '');
  assert.equal(details.searchTitle(''), '');
  assert.equal(details.searchTitle('x'.repeat(300)), '');
});

test('a game page is complete once text, genres, people and date are known', () => {
  const full = { description: 'a', genres: ['b'], developers: ['c'], publishers: ['d'], releaseDate: '2020' };
  assert.equal(details.isComplete(full), true);
  assert.equal(details.isComplete({ ...full, publishers: [] }), false);
  assert.equal(details.isComplete(null), false);
});

test('the page lets in the stream hosts of Steam and Epic trailers', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'app.html'), 'utf8');
  const media = (/media-src ([^;"]*)/.exec(html) || [])[1] || '';
  // Steam serves its trailers from video.*.steamstatic.com, Epic from media-cdn.epicgames.com.
  for (const host of ['https://*.steamstatic.com', 'https://media-cdn.epicgames.com']) {
    assert.ok(media.split(/\s+/).includes(host), `media-src must allow ${host}`);
  }
});

test('an Xbox game is known to GamesDB by its title id, in decimal for an Xbox 360 one too', () => {
  assert.deepEqual(details.gamesDbIdentity({ appid: '1297287142', source: 'Xbox PC' }, ''), { platform: 'xboxone', id: '1297287142' });
  assert.deepEqual(details.gamesDbIdentity({ appid: '4D5307E6', source: 'xenia emulator' }, ''), { platform: 'xboxone', id: '1297287142' });
  assert.deepEqual(details.gamesDbIdentity({ appid: '0x4D5307E6', source: 'xbox 360 recomp' }, ''), { platform: 'xboxone', id: '1297287142' });
  assert.equal(details.gamesDbIdentity({ appid: 'not-hex', source: 'xenia emulator' }, ''), null);
});

test('a RetroAchievements game is searched without its console and on that console first', () => {
  const game = { appid: 'ra-1', source: 'RetroAchievements', name: 'Spyro the Dragon (PlayStation)', console: 'PlayStation' };
  assert.equal(details.searchTitle(details.ownTitle(game)), 'Spyro the Dragon');
  assert.deepEqual(details.preferredPlatforms(game), ['psx']);
  assert.deepEqual(details.preferredPlatforms({ ...game, console: 'Nintendo 64' }), ['n64']);
  assert.deepEqual(details.preferredPlatforms({ ...game, console: 'Unknown Box' }), []);
  const unsent = { appid: 'ra-1', source: 'RetroAchievements', name: 'Spyro the Dragon (PlayStation)' };
  assert.equal(details.ownTitle(unsent), 'Spyro the Dragon', 'the page does not send the console: the name ending gives it');
  assert.deepEqual(details.preferredPlatforms(unsent), ['psx']);
  assert.equal(details.ownTitle({ name: 'Halo 3 (Xbox 360)', console: '' }), 'Halo 3 (Xbox 360)');
});

test('a PC port is searched as the game it ports, without the port named in brackets', () => {
  assert.equal(details.ownTitle({ source: 'PC Port', name: 'The Legend of Zelda: Twilight Princess (Dusklight)' }), 'The Legend of Zelda: Twilight Princess');
  assert.equal(details.ownTitle({ source: 'PC Port', name: 'F-Zero X (G-Diffuser)' }), 'F-Zero X');
  assert.equal(details.ownTitle({ source: 'PC Port', name: 'Super Mario Bros. Remastered' }), 'Super Mario Bros. Remastered');
  assert.equal(details.ownTitle({ source: 'Steam', name: 'Hitman (2016)' }), 'Hitman (2016)', 'another source keeps its brackets');
});

test('a mod or fan game no store lists takes the page of the game it is closest to', () => {
  assert.equal(details.ownTitle({ source: 'PC Port', name: 'Super Mario Eclipse (SMS Launcher)', detailsTitle: 'Super Mario Sunshine' }), 'Super Mario Sunshine');
  assert.equal(details.ownTitle({ source: 'Steam', name: 'Portal', detailsTitle: 'Half-Life' }), 'Portal', 'only a PC port borrows a page');
});
