'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));

/*
  Steam moved library artwork to hashed store_item_assets paths. Product info hands the schema a
  relative token that carries that directory ("<hash>/library_capsule.jpg"), and every appid
  onboarded since the migration has no flat /steam/apps/<id>/library_600x900.jpg at all - Sovereign
  Tower (4113940) among them. Flattening the token to its basename therefore probed a path that can
  never answer, and the tile stayed blank for good once the icon cache was cleared.
*/

const HASHED = '7a0f402ecc3f2af5e1be623d6b0be4eaced604a9/library_capsule.jpg';
const LIVE = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4113940/${HASHED}`;

test('a hashed product-info token keeps its directory instead of being flattened', async () => {
  const seen = [];
  const probe = async (url) => {
    seen.push(url);
    return url === LIVE;
  };

  assert.equal(await steam.resolveWorkingIconUrl(4113940, HASHED, { probe }), LIVE);
  assert.ok(
    seen.every((url) => url.includes(HASHED)),
    `the hash directory must survive: ${seen.join(', ')}`
  );
});

test('a hashed token that no CDN answers is returned untouched rather than as a wrong URL', async () => {
  // A different appid: findWorkingLink/findWorkingAssetPath memoise per appid for the whole process.
  const url = await steam.resolveWorkingIconUrl(4113941, HASHED, { probe: async () => false });
  assert.equal(url, HASHED);
});

test('a bare legacy token still reaches the flat CDN paths', async () => {
  const legacy = 'https://cdn.cloudflare.steamstatic.com/steam/apps/391540/library_600x900.jpg';
  const url = await steam.resolveWorkingIconUrl(391540, 'library_600x900.jpg', {
    probe: async (candidate) => candidate === legacy,
  });
  assert.equal(url, legacy);
});

// PRAGMATA (3357650) has no flat page_bg_generated file anywhere: only the store endpoint answers.
test('a page background with no flat CDN file falls back to the store background endpoint', async () => {
  const store = 'https://store.akamai.steamstatic.com/images/storepagebackground/app/3357650';
  const probe = async (candidate) => candidate === store;
  assert.equal(await steam.resolveWorkingIconUrl(3357650, 'page_bg_generated_v6b', { probe }), store);
  assert.equal(await steam.resolveWorkingIconUrl(3357651, 'https://cdn.akamai.steamstatic.com/steam/apps/3357651/page_bg_generated_v6b.jpg', { probe: async () => false }), 'https://cdn.akamai.steamstatic.com/steam/apps/3357651/page_bg_generated_v6b.jpg');
});

test('the store background fallback is reserved for page backgrounds', async () => {
  const seen = [];
  await steam.resolveWorkingIconUrl(3357652, 'library_600x900.jpg', { probe: async (candidate) => (seen.push(candidate), false) });
  assert.ok(!seen.some((url) => url.includes('storepagebackground')));
});

/*
  Xbox serves every achievement icon of a game from one `/image` path, with the identity of the
  picture in the query string. Cached by basename alone, a whole game collapsed onto a single file
  that each download overwrote in turn, and the game screen showed one empty square per achievement.
*/
test('an icon URL whose identity is in the query gets a cache file of its own', () => {
  const first = steam.iconCacheFilename('https://images-eds-ssl.xboxlive.com/image?url=AAA.bbb');
  const second = steam.iconCacheFilename('https://images-eds-ssl.xboxlive.com/image?url=CCC.ddd');

  assert.notEqual(first, second, 'two icons of the same game must not share a file');
  assert.match(first, /^image-[0-9a-f]{16}$/);
  assert.equal(first, steam.iconCacheFilename('https://images-eds-ssl.xboxlive.com/image?url=AAA.bbb'), 'stable');
  assert.doesNotMatch(first, /[?=]/, 'a query is not a legal Windows file name');

  // Steam keeps the name it has always been cached under: renaming those would re-fetch every icon
  // already on disk.
  assert.equal(
    steam.iconCacheFilename('https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/440/abc123.jpg'),
    'abc123.jpg'
  );
});

/*
  The cache is one folder per library appid. Modern Warfare 4 is listed under the Call of Duty hub's
  appid but shows its own store page's art: both are called header.jpg, so the hub's file, already on
  disk, answered for Modern Warfare 4's and the card kept the hub's cover.
*/
test("another app's artwork does not take the cache file of the library entry's own", () => {
  const own = steam.iconCacheFilename('https://cdn.akamai.steamstatic.com/steam/apps/1938090/header.jpg', '1938090');
  const other = steam.iconCacheFilename('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4435490/0c49/header.jpg', '1938090');

  assert.equal(own, 'header.jpg', "the entry's own art keeps the name it has always had");
  assert.notEqual(other, own);
  assert.equal(other, '4435490-header.jpg');
});
