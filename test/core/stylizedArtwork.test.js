'use strict';

/*
  The tinted page background used to be cached under the cover's own file name, in the cover's own
  folder. Xbox hands the same picture back as both, so every Xbox tile in the library was painted
  with its blurred, blue-tinted page background - permanently, since a cached cover is never fetched
  again. Reported for Minecraft for Windows, Microsoft Solitaire Collection and GTA V.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const stylizedArtwork = require('../../app/util/stylizedArtwork.js');

const XBOX_PICTURE =
  'https://store-images.s-microsoft.com/image/apps.415.13510798885735219.53a3b855-fde7-4304-925c-9db1cd1c34a8.b07e27c9-cdb1-4433-982b-7df0888f871c';

function tempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-stylized-'));
}

test('a stylized background never lands in the cover cache', () => {
  const userData = tempUserData();
  try {
    const stylized = stylizedArtwork.stylizedBackgroundPath(userData, '896928775', XBOX_PICTURE);
    const cover = path.join(userData, 'steam_cache', 'icon', '896928775', stylizedArtwork.stylizedFileName(XBOX_PICTURE));

    assert.notEqual(stylized, cover, 'the veiled background must not be written over the cover');
    assert.ok(stylized.includes(path.join('steam_cache', 'stylized')));
    // The file name is unchanged, so a background built before this move is still found.
    assert.equal(path.basename(stylized), path.basename(cover));
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('a query string never reaches the file name, and an unusable URL yields no path', () => {
  const userData = tempUserData();
  try {
    // "?" is not a legal Windows filename: keeping it made every write fail silently.
    assert.equal(stylizedArtwork.stylizedFileName('https://cdn.example/img/hero.jpg?w=1920&h=1080'), 'hero.jpg');
    assert.equal(stylizedArtwork.stylizedFileName('not a url'), '');
    assert.equal(stylizedArtwork.stylizedBackgroundPath(userData, '1', 'not a url'), '');
    assert.equal(stylizedArtwork.stylizedBackgroundPath(userData, '', XBOX_PICTURE), '');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('an existing stylized background is found, and a missing one reports nothing', () => {
  const userData = tempUserData();
  try {
    assert.equal(stylizedArtwork.existingStylizedBackground(userData, '42', XBOX_PICTURE), '');

    const file = stylizedArtwork.stylizedBackgroundPath(userData, '42', XBOX_PICTURE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'blurred bytes');
    assert.equal(stylizedArtwork.existingStylizedBackground(userData, '42', XBOX_PICTURE), file);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('the one-time sweep clears the cached art of imported Xbox games and nothing else', () => {
  const userData = tempUserData();
  try {
    const iconRoot = path.join(userData, 'steam_cache', 'icon');
    const xboxRoot = path.join(userData, 'steam_cache', 'xbox');
    for (const titleId of ['896928775', '85494077']) {
      fs.mkdirSync(path.join(xboxRoot, titleId), { recursive: true });
      fs.mkdirSync(path.join(iconRoot, titleId), { recursive: true });
      fs.writeFileSync(path.join(iconRoot, titleId, 'cover.jpg'), 'tinted');
    }
    // A Steam game and an Epic namespace share the icon cache and must survive untouched.
    fs.mkdirSync(path.join(iconRoot, '4000'), { recursive: true });
    fs.writeFileSync(path.join(iconRoot, '4000', 'page_bg_generated_v6b.jpg'), 'valve background');
    fs.mkdirSync(path.join(iconRoot, '0233b9c5ec9c476cb63bda4b463caa7e'), { recursive: true });
    fs.writeFileSync(path.join(iconRoot, '0233b9c5ec9c476cb63bda4b463caa7e', 'hero.jpg'), 'epic background');

    const first = stylizedArtwork.purgeTintedXboxCovers(userData);
    assert.equal(first.skipped, false);
    assert.equal(first.purged, 2);
    assert.deepEqual(first.titles.sort(), ['85494077', '896928775']);
    assert.equal(fs.existsSync(path.join(iconRoot, '896928775')), false);
    assert.equal(fs.existsSync(path.join(iconRoot, '85494077')), false);
    assert.equal(fs.existsSync(path.join(iconRoot, '4000', 'page_bg_generated_v6b.jpg')), true);
    assert.equal(fs.existsSync(path.join(iconRoot, '0233b9c5ec9c476cb63bda4b463caa7e', 'hero.jpg')), true);
    // The Xbox library itself is a cache of schemas and unlocks; the sweep must not touch it.
    assert.equal(fs.existsSync(path.join(xboxRoot, '896928775')), true);

    // Runs once: a cover re-downloaded after the sweep is not thrown away on the next start.
    fs.mkdirSync(path.join(iconRoot, '896928775'), { recursive: true });
    fs.writeFileSync(path.join(iconRoot, '896928775', 'cover.jpg'), 'freshly fetched');
    const second = stylizedArtwork.purgeTintedXboxCovers(userData);
    assert.equal(second.skipped, true);
    assert.equal(fs.existsSync(path.join(iconRoot, '896928775', 'cover.jpg')), true);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('the sweep records itself even with no Xbox library at all', () => {
  const userData = tempUserData();
  try {
    const result = stylizedArtwork.purgeTintedXboxCovers(userData);
    assert.equal(result.purged, 0);
    assert.equal(result.skipped, false);
    assert.equal(fs.existsSync(path.join(userData, 'cfg', 'purged-tinted-covers.json')), true);
    assert.equal(stylizedArtwork.purgeTintedXboxCovers(userData).skipped, true);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
