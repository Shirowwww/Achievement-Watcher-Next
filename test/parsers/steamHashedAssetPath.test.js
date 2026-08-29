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
