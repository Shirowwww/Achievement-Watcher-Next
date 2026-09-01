'use strict';

/*
  The Watchdog and the app share one rarity sidecar (steam_cache/rarity/<appid>.json). The app has
  always refused to ask Valve about an id that is not a Steam appid; this process did not, and it
  runs for every unlock of every platform - so a GOG or Epic id that happens to look like a Steam
  appid could file another game's rarity under it, for both processes to read back.
*/

const assert = require('node:assert/strict');
const test = require('node:test');
const { isSteamRarityId } = require('../util/rarity.js');

test('a Steam appid is asked about', () => {
  assert.equal(isSteamRarityId('480', ''), true);
  assert.equal(isSteamRarityId(480, 'steam'), true);
  assert.equal(isSteamRarityId('730', 'Goldberg SteamEmu'), true);
});

test('another store answering with a numeric id of its own is not', () => {
  for (const source of ['epic-official', 'gog-official', 'GOG Galaxy', 'Ubisoft Connect', 'ea', 'Xbox PC', 'Lumaplay']) {
    assert.equal(isSteamRarityId('123456', source), false, `${source} ids are not Steam appids`);
  }
});

test('a namespaced id is never asked about, whatever the source says', () => {
  for (const appid of ['uplay-123', 'socialclub-gta', 'local-a1b2c3', 'epic-abc', '', null, undefined]) {
    assert.equal(isSteamRarityId(appid, ''), false, `${String(appid)} is not a Steam appid`);
  }
});
