'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const stores = require('../../app/util/gameDetailsStores.js');

// Shaped on a real displaycatalog answer (Forza Horizon 5), cut down to the fields that are read.
const MICROSOFT_PRODUCT = {
  ProductId: '9NKX70BBCDRN',
  LocalizedProperties: [
    {
      ProductTitle: 'Forza Horizon 5 Standard Edition',
      ShortDescription: 'Your ultimate <b>Horizon</b> adventure awaits!',
      ProductDescription: 'A much longer text.',
      DeveloperName: 'Playground Games',
      PublisherName: 'Xbox Game Studios',
      Images: [
        { ImagePurpose: 'Screenshot', ImagePositionInfo: 'Desktop/1', Uri: '//store-images.s-microsoft.com/image/apps.1.shot' },
        // The same screenshot again, for the console store page.
        { ImagePurpose: 'Screenshot', ImagePositionInfo: 'Xbox/1', Uri: '//store-images.s-microsoft.com/image/apps.1.xbox' },
        { ImagePurpose: 'SuperHeroArt', Uri: '//store-images.s-microsoft.com/image/apps.2.hero' },
        { ImagePurpose: 'Screenshot', Uri: 'http://insecure.example/shot' },
      ],
      CMSVideos: [
        {
          VideoPurpose: 'trailer',
          Caption: 'Announce Trailer',
          HLS: 'https://cdn-dynmedia-1.microsoft.com/is/content/microsoftassets/x-AVS.m3u8?packagedStreaming=true',
          DASH: 'https://cdn-dynmedia-1.microsoft.com/is/content/microsoftassets/x-AVS.mpd',
          PreviewImage: { Uri: '//store-images.s-microsoft.com/image/apps.3.preview' },
        },
      ],
    },
  ],
  MarketProperties: [{ OriginalReleaseDate: '2021-11-08T23:00:00.0000000Z', UsageData: [{ AggregateTimeSpan: '7Days', AverageRating: 3.7, RatingCount: 10 }, { AggregateTimeSpan: 'AllTime', AverageRating: 3.5, RatingCount: 31144 }] }],
  Properties: { Category: 'Racing & flying', Categories: ['Racing & flying', 'Simulation'] },
};

test('a Microsoft Store product gives its text, people, date, genres, screenshots and rating, not its refused trailers', () => {
  const game = stores.fromMicrosoftProduct(MICROSOFT_PRODUCT);

  assert.equal(game.title, 'Forza Horizon 5 Standard Edition');
  assert.equal(game.description, 'Your ultimate Horizon adventure awaits!');
  assert.deepEqual(game.developers, ['Playground Games']);
  assert.deepEqual(game.publishers, ['Xbox Game Studios']);
  assert.equal(game.releaseDate, '2021-11-08');
  assert.deepEqual(game.genres, ['Racing & flying', 'Simulation']);
  assert.deepEqual(game.videos, [], 'the streams are refused to home connections: a trailer that never plays is worse than none');
  assert.deepEqual(game.screenshots, [{ thumb: 'https://store-images.s-microsoft.com/image/apps.1.shot?w=640', full: 'https://store-images.s-microsoft.com/image/apps.1.shot' }]);
  assert.equal(game.background, 'https://store-images.s-microsoft.com/image/apps.2.hero');
  assert.deepEqual(game.ratings, [{ source: 'microsoft', score: 3.5, outOf: 5, count: 31144, url: 'https://www.xbox.com/games/store/p/9NKX70BBCDRN' }]);
});

test('the Microsoft search keeps the game itself, any of its editions, and never another game', () => {
  const family = (products) => ({ Results: [{ ProductFamilyName: 'Games', Products: products }] });
  // Store ids are 12 characters, such as 9NKX70BBCDRN; 'A' stands for 9AAAAAAAAAAA.
  const id = (letter) => `9${letter.repeat(11)}`;
  const product = (letter, Title, Type = 'Game') => ({ ProductId: id(letter), Title, Type });

  const choose = (products, title) => stores.chooseMicrosoftProduct(family(products), title);

  assert.equal(choose([product('A', 'Forza Horizon 5 Premium Edition'), product('B', 'Forza Horizon 5 Standard Edition')], 'Forza Horizon 5'), id('B'));
  assert.equal(choose([product('A', 'Forza Horizon 5 Édition standard'), product('B', 'Forza Horizon 5')], 'Forza Horizon 5'), id('B'), 'the game itself before any edition');
  assert.equal(choose([product('A', 'Halo 3: ODST'), product('B', 'Halo 3')], 'Halo 3'), id('B'));
  assert.equal(choose([product('A', 'Halo 3: ODST')], 'Halo 3'), null);
  assert.equal(choose([product('A', 'Starfield', 'Durable')], 'Starfield'), null);
  assert.equal(choose([product('A', 'Doom'), product('B', 'DOOM')], 'Doom'), null);
  assert.equal(choose([product('A', 'Forza Horizon 5 Édition Premium')], 'Forza Horizon 5'), id('A'));
  assert.equal(stores.chooseMicrosoftProduct({}, 'Anything'), null);
});

test('an Epic offer from egdata gives its text, people, date, gallery, playable trailers and players rating', () => {
  const offer = {
    id: 'offer1',
    title: 'Hades',
    productSlug: 'hades',
    description: 'Defy the god of the dead.',
    developerDisplayName: 'Supergiant Games',
    publisherDisplayName: 'Supergiant Games',
    releaseDate: '2019-12-10T11:00:00.000Z',
    keyImages: [{ type: 'DieselStoreFrontWide', url: 'https://cdn1.epicgames.com/wide.jpg' }, { type: 'Thumbnail', url: 'https://cdn1.epicgames.com/thumb.jpg' }],
  };
  const media = {
    images: [{ src: 'https://cdn2.unrealengine.com/g1.jpg' }, { src: 'javascript:alert(1)' }],
    videos: [
      {
        outputs: [
          { key: 'low', contentType: 'video/webm', url: 'https://media-cdn.epicgames.com/v/low.webm', width: 854 },
          { key: 'high', contentType: 'video/webm', url: 'https://media-cdn.epicgames.com/v/high.webm', width: 1920 },
          { key: 'thumbnail', contentType: 'image/jpeg', url: 'https://media-cdn.epicgames.com/v/thumb.jpg' },
        ],
      },
      { outputs: [{ contentType: 'application/dash+xml', url: 'https://media-cdn.epicgames.com/v/x.mpd' }] },
    ],
  };

  const game = stores.fromEgdata(offer, media, { averageRating: 4.9 });

  assert.equal(game.title, 'Hades');
  assert.equal(game.description, 'Defy the god of the dead.');
  assert.deepEqual(game.developers, ['Supergiant Games']);
  assert.equal(game.releaseDate, '2019-12-10');
  assert.deepEqual(game.screenshots, [{ thumb: 'https://cdn2.unrealengine.com/g1.jpg', full: 'https://cdn2.unrealengine.com/g1.jpg' }]);
  // Epic serves the picture and the sound as two files: a trailer without sound, for the moving backdrop.
  assert.deepEqual(game.videos, [{ name: '', thumbnail: 'https://media-cdn.epicgames.com/v/thumb.jpg', file: 'https://media-cdn.epicgames.com/v/high.webm', silent: true }]);
  assert.equal(game.background, 'https://cdn1.epicgames.com/wide.jpg');
  assert.deepEqual(game.ratings, [{ source: 'epic', score: 4.9, outOf: 5, count: 0, url: 'https://store.epicgames.com/p/hades' }]);
  assert.equal(stores.fromEgdata(null), null);
});

test('a GOG product gives its translated text, screenshots and YouTube trailers', () => {
  const product = {
    title: 'The Witcher: Enhanced Edition',
    release_date: '2008-10-30T00:00:00+0300',
    description: { lead: '<p>The Witcher est un jeu de r&ocirc;les.</p>', full: 'Long.' },
    screenshots: [{ formatter_template_url: 'https://images-2.gog-statics.com/abc_{formatter}.jpg' }],
    videos: [
      { provider: 'youtube', video_url: 'https://www.youtube.com/embed/vMgX5QNjQOA?wmode=opaque', thumbnail_url: 'https://img.youtube.com/vi/vMgX5QNjQOA/hqdefault.jpg' },
      { provider: 'wistia', video_url: 'https://fast.wistia.net/embed/iframe/00177yg2c5' },
    ],
  };

  const game = stores.fromGogProduct(product);

  assert.equal(game.title, 'The Witcher: Enhanced Edition');
  assert.equal(game.description, 'The Witcher est un jeu de rôles.');
  assert.equal(game.releaseDate, '2008-10-30');
  assert.deepEqual(game.screenshots, [{ thumb: 'https://images-2.gog-statics.com/abc_product_card_v2_mobile_slider_639.jpg', full: 'https://images-2.gog-statics.com/abc_ggvgl_2x.jpg' }]);
  assert.deepEqual(game.videos, [{ name: '', thumbnail: 'https://i.ytimg.com/vi/vMgX5QNjQOA/hqdefault.jpg', youtube: 'vMgX5QNjQOA' }]);
});

test('a GOG description is real HTML: its layout newlines fold, and the feature list after the first heading stays on GOG', () => {
  const lead = '<p>Le sorceleur\nGeralt.</p>\n<p>Une toile\n tissée.</p>\n<h4>CARACTÉRISTIQUES</h4>\n<br>\n<p>\n<strong>GERALT</strong>\n \n</p>';

  assert.equal(stores.fromGogProduct({ description: { lead } }).description, 'Le sorceleur Geralt.\n\nUne toile tissée.');
});

test("the store languages follow the app's language", () => {
  assert.equal(stores.epicLocale('french'), 'fr');
  assert.equal(stores.epicLocale('brazilian'), 'pt-BR');
  assert.equal(stores.epicLocale('schinese'), 'zh-CN');
  assert.equal(stores.epicLocale('latam'), 'es-MX');
  assert.equal(stores.epicLocale('nonsense'), 'en');
  assert.deepEqual(stores.microsoftMarket('french'), { market: 'FR', language: 'fr-fr' });
  assert.deepEqual(stores.microsoftMarket('english'), { market: 'US', language: 'en-us' });
});

test('a rating links its store page only when the store id or slug is one, never a path', () => {
  const epicUrl = (offer) => stores.fromEgdata({ id: 'o', ...offer }, null, { averageRating: 4 }).ratings[0].url;
  const microsoftUrl = (ProductId) => stores.fromMicrosoftProduct({ ...MICROSOFT_PRODUCT, ProductId }).ratings[0].url;

  assert.equal(epicUrl({ productSlug: '../x' }), '');
  assert.equal(epicUrl({ productSlug: 'a/b' }), '');
  assert.equal(epicUrl({ offerMappings: [{ pageSlug: 'hades' }] }), 'https://store.epicgames.com/p/hades', 'the page mapping stands in for a missing slug');
  assert.equal(microsoftUrl('9NKX70BB/../x'), '');
  assert.equal(microsoftUrl(undefined), '');
});
