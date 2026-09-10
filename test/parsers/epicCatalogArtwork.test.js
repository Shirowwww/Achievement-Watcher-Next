'use strict';

/*
  An Epic game's artwork used to be left entirely to the SteamGridDB fallback, which matches on the
  game's name: anything obscure enough to miss found nothing at all and rendered as a blank tile
  reading "No artwork found". "Football Manager 2024 Pre-game editor" and "Space Grunts: Chrono
  Shard" were both reported that way, while Epic was publishing a picture for each of them in the
  very catalog response their title already came from.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const { epicCatalogArtwork } = require('../../app/parser/epicOfficial.js')._internal;

test('the store pictures Epic publishes are read off the catalog item', () => {
  const artwork = epicCatalogArtwork({
    keyImages: [
      { type: 'Thumbnail', url: 'https://cdn1.epicgames.com/thumb.jpg' },
      { type: 'DieselStoreFrontWide', url: 'https://cdn1.epicgames.com/wide.jpg' },
      { type: 'DieselStoreFrontTall', url: 'https://cdn1.epicgames.com/tall.jpg' },
      { type: 'DieselGameBoxLogo', url: 'https://cdn1.epicgames.com/logo.png' },
    ],
  });

  assert.deepEqual(artwork, {
    landscape: 'https://cdn1.epicgames.com/wide.jpg',
    portrait: 'https://cdn1.epicgames.com/tall.jpg',
    logo: 'https://cdn1.epicgames.com/logo.png',
  });
});

test('each shape falls back through the types Epic actually uses', () => {
  const artwork = epicCatalogArtwork({
    keyImages: [
      { type: 'OfferImageWide', url: 'https://cdn1.epicgames.com/offer-wide.jpg' },
      { type: 'OfferImageTall', url: 'https://cdn1.epicgames.com/offer-tall.jpg' },
    ],
  });

  assert.equal(artwork.landscape, 'https://cdn1.epicgames.com/offer-wide.jpg');
  assert.equal(artwork.portrait, 'https://cdn1.epicgames.com/offer-tall.jpg');
  assert.equal(artwork.logo, '');
});

test('the most specific type wins whatever order the catalog lists them in', () => {
  const artwork = epicCatalogArtwork({
    keyImages: [
      { type: 'OfferImageWide', url: 'https://cdn1.epicgames.com/offer-wide.jpg' },
      { type: 'DieselStoreFrontWide', url: 'https://cdn1.epicgames.com/store-wide.jpg' },
    ],
  });

  assert.equal(artwork.landscape, 'https://cdn1.epicgames.com/store-wide.jpg');
});

test('a catalog entry with no usable picture asks for the fallback instead of half-filling the tile', () => {
  assert.equal(epicCatalogArtwork({}), null);
  assert.equal(epicCatalogArtwork({ keyImages: [] }), null);
  assert.equal(epicCatalogArtwork(null), null);
  // A relative or empty URL is not something the renderer can paint.
  assert.equal(epicCatalogArtwork({ keyImages: [{ type: 'DieselStoreFrontWide', url: '/images/wide.jpg' }] }), null);
  assert.equal(epicCatalogArtwork({ keyImages: [{ type: 'DieselStoreFrontWide', url: '' }] }), null);
});

test('one shape missing does not cost the others', () => {
  const artwork = epicCatalogArtwork({ keyImages: [{ type: 'DieselStoreFrontTall', url: 'https://cdn1.epicgames.com/tall.jpg' }] });
  assert.equal(artwork.landscape, '');
  assert.equal(artwork.portrait, 'https://cdn1.epicgames.com/tall.jpg');
});
