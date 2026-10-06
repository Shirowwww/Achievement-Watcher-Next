'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ea = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ea.js'));
const { steamAppidOf } = require(path.join(__dirname, '..', '..', 'app', 'util', 'platformId.js'));

/*
  Issue #105: an EA app game is listed under EA's masterTitleId (Star Wars Battlefront II = 193864),
  a number in the same space as Steam appids. The cover chain took it for one and asked Steam,
  SteamDB and SteamGridDB about app 193864 instead of the real release, 1237950.
*/

const BATTLEFRONT_DIR = 'D:\\SteamLibrary\\steamapps\\common\\STAR WARS Battlefront II';
const localInstalls = new Map([
  ['6060', { name: 'STAR WARS Battlefront II (Classic, 2005)', gameDir: 'D:\\SteamLibrary\\steamapps\\common\\Star Wars Battlefront II Classic' }],
  ['1237950', { name: 'STAR WARS Battlefront II', gameDir: BATTLEFRONT_DIR }],
]);

test('an EA game installed in a Steam library takes the appid of the appmanifest owning its folder', async () => {
  let asked = false;
  const sid = await ea.resolveSteamAppid(
    { gameDir: `${BATTLEFRONT_DIR}\\`, name: 'STAR WARS Battlefront II' },
    {
      scanLocalInstalls: async () => localInstalls,
      findAppidByName: async () => {
        asked = true;
        return '6060';
      },
    }
  );
  assert.equal(sid, '1237950');
  assert.equal(asked, false, 'the folder is proof; no title guess is needed');
});

test('an EA game outside any Steam library falls back to the title lookup', async () => {
  const sid = await ea.resolveSteamAppid(
    { gameDir: 'E:\\Games\\Battlefield 1', name: 'Battlefield 1' },
    { scanLocalInstalls: async () => localInstalls, findAppidByName: async (name) => (name === 'Battlefield 1' ? 1238840 : null) }
  );
  assert.equal(sid, '1238840');
});

test('an EA game with no Steam counterpart resolves to nothing, never to its own EA id', async () => {
  const sid = await ea.resolveSteamAppid(
    { gameDir: '', name: 'Some EA Exclusive' },
    { scanLocalInstalls: async () => new Map(), findAppidByName: async () => null }
  );
  assert.equal(sid, '');
});

test('a failing lookup is not fatal', async () => {
  const sid = await ea.resolveSteamAppid(
    { gameDir: BATTLEFRONT_DIR, name: 'STAR WARS Battlefront II' },
    {
      scanLocalInstalls: async () => {
        throw new Error('no Steam');
      },
      findAppidByName: async () => {
        throw new Error('offline');
      },
    }
  );
  assert.equal(sid, '');
});

test('the Steam appid of an EA game is never its EA id', () => {
  assert.equal(steamAppidOf({ appid: '193864', source: 'ea' }), '');
  assert.equal(steamAppidOf({ appid: '193864', source: 'ea', steamappid: '1237950' }), '1237950');
  assert.equal(steamAppidOf({ appid: '193864', system: 'ea' }), '');
});

test('a Steam-keyed game keeps its own numeric appid', () => {
  assert.equal(steamAppidOf({ appid: '1237950', source: 'Goldberg' }), '1237950');
  assert.equal(steamAppidOf({ appid: 1237950 }), '1237950');
  assert.equal(steamAppidOf({ appid: 'UPLAY123', source: 'uplay' }), '');
  assert.equal(steamAppidOf({ appid: 'uplay-5', steamappid: '298110' }), '298110');
  assert.equal(steamAppidOf(null), '');
});

// The renderer cannot be loaded headless, so its three Steam-id sites are pinned to the helper.
test('the cover chain, the cover picker and the context menu all ask steamAppidOf', () => {
  const root = path.join(__dirname, '..', '..', 'app');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'ui', 'artworkPicker.js'), 'utf8');
  const recover = app.slice(app.indexOf('async function recoverLibraryCover'), app.indexOf('function hasOwnShapeCover'));
  assert.match(recover, /steamAppidOf\(game\)/);
  assert.doesNotMatch(recover, /test\(String\(cacheAppid/);
  assert.match(app, /const catalogAppid = String\([^;]*steamAppidOf\(/);
  // The prompt's default is the id the cover came from: the cache folder name is not a Steam appid.
  assert.match(app, /\/\^\[0-9\]\+\$\/\.test\(catalogAppid\) \? catalogAppid : ''/);
  assert.match(picker, /const steamCoverId = steamAppidOf\(game\)/);
});
