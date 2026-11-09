'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ratings = require('../../app/util/gameRatings.js');

const search = (items) => ({ data: { items: items.map(([slug, title, platforms, typeId = 13]) => ({ typeId, slug, title, platforms: platforms.map((name) => ({ name })) })) } });

test('the Metacritic search keeps the one game of that exact title, on the game platform when titles repeat', () => {
  assert.equal(ratings.chooseMetacriticGame(search([['hades', 'Hades', ['PC']], ['hades-ii', 'Hades II', ['PC']]]), 'Hades', ['PC']), 'hades');
  assert.equal(ratings.chooseMetacriticGame(search([['doom', 'Doom', ['PC']], ['doom-1993', 'DOOM', ['PlayStation']]]), 'Doom', ['PC']), 'doom');
  assert.equal(ratings.chooseMetacriticGame(search([['doom', 'Doom', ['PC']], ['doom-2016', 'DOOM', ['PC']]]), 'Doom', ['PC']), null, 'two games of that title on the platform: no guess');
  assert.equal(ratings.chooseMetacriticGame(search([['hades', 'Hades', ['PC'], 2]]), 'Hades', ['PC']), null, 'a movie or a show is not the game');
  assert.equal(ratings.chooseMetacriticGame(search([['bad/../slug', 'Hades', ['PC']]]), 'Hades', ['PC']), null);
  assert.equal(ratings.chooseMetacriticGame({}, 'Hades', ['PC']), null);
});

test('one game of that title on other platforms only is another game, not this one', () => {
  const doom2016 = search([['doom', 'DOOM', ['Nintendo Switch', 'PC', 'Xbox One', 'PlayStation 4']]]);

  assert.equal(ratings.chooseMetacriticGame(doom2016, 'Doom', ['Super Nintendo']), null, 'the SNES Doom is not DOOM (2016)');
  assert.equal(ratings.chooseMetacriticGame(search([['halo-3', 'Halo 3', ['Xbox 360']]]), 'Halo 3', ['PC']), null);
  assert.equal(ratings.chooseMetacriticGame(search([['halo-3', 'Halo 3', []]]), 'Halo 3', ['Xbox 360']), null);
});

test('the platforms to prefer follow the game source, and a retro console its Metacritic name', () => {
  assert.deepEqual(ratings.metacriticPlatforms({ source: 'Goldberg' }), ['PC']);
  assert.ok(ratings.metacriticPlatforms({ source: 'xenia emulator' }).includes('Xbox 360'));
  assert.ok(ratings.metacriticPlatforms({ source: 'shadps4 emulator' }).includes('PlayStation 4'));
  assert.deepEqual(ratings.metacriticPlatforms({ source: 'RetroAchievements', name: 'Spyro the Dragon (PlayStation)' }), ['PlayStation']);
  assert.deepEqual(ratings.metacriticPlatforms({ source: 'RetroAchievements', name: 'Mario (SNES/Super Famicom)' }), ['Super Nintendo']);
});

test('Metacritic gives the critics score and the players score, each with how many reviewed', () => {
  const critic = { data: { item: { max: 100, score: 93, reviewCount: 58 } } };
  const user = { data: { item: { max: 10, score: 8.5, reviewCount: 5487 } } };

  assert.deepEqual(ratings.metacriticRatings('hades', critic, user), [
    { source: 'metacritic', score: 93, count: 58, url: 'https://www.metacritic.com/game/hades/' },
    { source: 'metacritic-users', score: 8.5, outOf: 10, count: 5487, url: 'https://www.metacritic.com/game/hades/user-reviews/' },
  ]);
  assert.deepEqual(ratings.metacriticRatings('hades', { data: { item: { score: null, reviewCount: 2 } } }, null), [], 'too few reviews for a score');
});

test('the GOG players rating is read for the very product, out of five', () => {
  const answer = { products: [{ id: '1207658930', reviewsRating: 47 }, { id: '1207658924', slug: 'the_witcher', reviewsRating: 46 }] };

  assert.deepEqual(ratings.gogRating(answer, '1207658924'), [{ source: 'gog', score: 4.6, outOf: 5, count: 0, url: 'https://www.gog.com/game/the_witcher' }]);
  assert.deepEqual(ratings.gogRating(answer, '999'), []);
  assert.equal(ratings.gogRating({ products: [{ id: '1', slug: '../admin', reviewsRating: 40 }] }, '1')[0].url, '', 'a slug that is a path links nothing');
  assert.deepEqual(ratings.gogRating({ products: [{ id: '1', reviewsRating: 0 }] }, '1'), [], 'no rating yet');
});

test('the Steam players rating adds up every month of its review histogram, as a share of positive reviews', () => {
  const histogram = { success: 1, results: { rollups: [{ recommendations_up: 700, recommendations_down: 100 }, { recommendations_up: 200, recommendations_down: 0 }] } };

  assert.deepEqual(ratings.steamReviews(histogram, '1245620'), [
    { source: 'steam', score: 90, outOf: 100, percent: true, count: 1000, url: 'https://store.steampowered.com/app/1245620/#app_reviews_hash' },
  ]);
  assert.deepEqual(ratings.steamReviews({ success: 1, results: { rollups: [] } }, '1'), [], 'no review yet');
  assert.deepEqual(ratings.steamReviews({ success: 2 }, '1'), []);
});
