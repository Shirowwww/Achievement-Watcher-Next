'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { numericSteamId, usableArtwork, resolvePlaytimeArtwork } = require('../util/playtimeArtwork.js');

test('manual games use their resolved artwork instead of synthetic Steam URLs', () => {
  const game = {
    appid: 'manual-e5537b5f3f22',
    icon: 'not-a-steam-icon-hash',
    iconUrl: 'https://cdn2.steamgriddb.com/icon/ryujinx.png',
    headerUrl: 'https://cdn2.steamgriddb.com/hero/ryujinx.jpg',
    portraitUrl: 'https://cdn2.steamgriddb.com/grid/ryujinx.jpg',
  };

  assert.deepEqual(resolvePlaytimeArtwork(game), {
    icon: game.iconUrl,
    gameIcon: game.iconUrl,
    image: game.headerUrl,
  });
});

test('manual games without artwork do not manufacture invalid Steam CDN URLs', () => {
  assert.equal(numericSteamId({ appid: 'manual-abc' }), '');
  assert.deepEqual(resolvePlaytimeArtwork({ appid: 'manual-abc', icon: 'hash' }), {
    icon: undefined,
    gameIcon: undefined,
    image: undefined,
  });
});

test('a game with only a square logo still gets an image for the playtime card', () => {
  const game = { appid: 'manual-abc', iconUrl: 'https://cdn2.steamgriddb.com/icon/ryujinx.png' };
  assert.deepEqual(resolvePlaytimeArtwork(game), {
    icon: game.iconUrl,
    gameIcon: game.iconUrl,
    image: game.iconUrl,
  });
});

test('a Steam game with no header or portrait art falls back to its square logo', () => {
  // The common gameIndex shape: a numeric appid plus the legacy Steam icon hash, no scan artwork.
  const artwork = resolvePlaytimeArtwork({ appid: '480', icon: 'hash' });
  assert.match(artwork.icon, /\/480\/hash\.jpg$/);
  assert.match(artwork.image, /\/480\/header\.jpg$/);

  // Without a numeric appid there is no Steam header to fall back to, so the logo fills the slot.
  const synthetic = resolvePlaytimeArtwork({ appid: 'gse-480', icon: 'hash', iconUrl: 'C:\\cache\\480.png' });
  assert.equal(synthetic.image, 'C:\\cache\\480.png');
  assert.equal(synthetic.gameIcon, 'C:\\cache\\480.png');
});

test('a manual optional Steam AppID remains a valid fallback', () => {
  const artwork = resolvePlaytimeArtwork({ appid: 'manual-abc', steamappid: '123', icon: 'hash' });
  assert.match(artwork.icon, /\/123\/hash\.jpg$/);
  assert.match(artwork.gameIcon, /\/123\/library_600x900\.jpg$/);
  assert.match(artwork.image, /\/123\/header\.jpg$/);
});

test('artwork references reject relative schema tokens but accept URLs and absolute paths', () => {
  assert.equal(usableArtwork('header'), undefined);
  assert.equal(usableArtwork('https://example.test/image.png'), 'https://example.test/image.png');
  assert.equal(usableArtwork('C:\\Games\\cover.png'), 'C:\\Games\\cover.png');
});

test('a community square logo outranks the poster for the card thumbnail', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-playtime-artwork-'));
  try {
    const key = require('node:crypto').createHash('sha1').update('292030\0the witcher 3: wild hunt').digest('hex');
    const file = path.join(root, 'steam_cache', 'steamgriddb_icons', `${key}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ url: 'https://cdn2.steamgriddb.com/icon/abc.png', width: 512, height: 512 }));

    const artwork = resolvePlaytimeArtwork(
      { appid: '292030', name: 'The Witcher 3: Wild Hunt', icon: 'hash' },
      { userDataRoot: root }
    );
    assert.equal(artwork.gameIcon, 'https://cdn2.steamgriddb.com/icon/abc.png');
    assert.equal(artwork.icon, 'https://cdn2.steamgriddb.com/icon/abc.png');
    // The hero image is still the wide header - only the square slot changes.
    assert.match(artwork.image, /\/292030\/header\.jpg$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
