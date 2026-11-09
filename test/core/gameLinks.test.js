'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { helpLinks } = require('../../app/util/gameLinks.js');

// The help pages; the guides that follow them are checked on their own below.
const labels = (links) => links.filter((link) => link.kind !== 'guide').map((link) => link.label);
const guides = (game) => helpLinks(game).filter((link) => link.kind === 'guide');
const guideLabels = (game) => guides(game).map((link) => link.label);

test('a game with a Steam appid gets the Steam pages, SteamDB, PCGamingWiki and SteamHunters', () => {
  const links = helpLinks({ catalogAppid: '1145360', name: 'Hades', source: 'Goldberg' });

  assert.deepEqual(labels(links), ['Steam', 'SteamDB', 'PCGamingWiki', 'SteamHunters', 'Steam Community']);
  assert.deepEqual(links[0], { label: 'Steam', steam: 'store', appid: '1145360' });
  assert.equal(links[1].url, 'https://steamdb.info/app/1145360/');
  assert.equal(links[2].url, 'https://pcgamingwiki.com/api/appid.php?appid=1145360');
  assert.equal(links[3].url, 'https://steamhunters.com/apps/1145360/achievements');
  assert.deepEqual(links[4], { label: 'Steam Community', steam: 'hub', appid: '1145360' });
});

test('a store game without a Steam appid gets its store search and a PCGamingWiki search', () => {
  assert.deepEqual(helpLinks({ catalogAppid: '', name: 'Alan Wake 2', source: 'epic-official' }).filter((link) => link.kind !== 'guide'), [
    { label: 'Epic Games Store', url: 'https://store.epicgames.com/search?q=Alan%20Wake%202' },
    { label: 'PCGamingWiki', url: 'https://pcgamingwiki.com/w/index.php?search=Alan%20Wake%202' },
  ]);
  assert.deepEqual(labels(helpLinks({ name: 'X', source: 'GOG Galaxy' })), ['GOG', 'PCGamingWiki']);
  assert.deepEqual(labels(helpLinks({ name: 'X', source: 'ea' })), ['EA', 'PCGamingWiki']);
  assert.deepEqual(labels(helpLinks({ name: 'X', source: 'rpcs3 emulator' })), ['RPCS3 Wiki', 'PCGamingWiki']);
  assert.deepEqual(labels(helpLinks({ name: 'X', source: 'Ubisoft Connect' })), ['Ubisoft Store', 'PCGamingWiki']);
  assert.deepEqual(labels(helpLinks({ name: 'X', source: 'xenia emulator' })), ['PCGamingWiki']);
});

test('a manual game keeps a PCGamingWiki search, and the Steam one is never doubled', () => {
  assert.deepEqual(labels(helpLinks({ name: 'My Game', source: 'Manual', manual: true })), ['PCGamingWiki']);
  assert.deepEqual(labels(helpLinks({ catalogAppid: '10', name: 'Half', source: 'GOG Galaxy' })), ['Steam', 'SteamDB', 'PCGamingWiki', 'SteamHunters', 'Steam Community', 'GOG']);
});

test('nothing is offered without an appid or a name, and a non-numeric appid is no Steam id', () => {
  assert.deepEqual(helpLinks({}), []);
  assert.deepEqual(helpLinks({ catalogAppid: 'uplay-635', source: 'Steam' }), []);
  assert.deepEqual(helpLinks(null), []);
});

test('every named game gets achievement guides, on the sites that track its platform', () => {
  assert.deepEqual(guides({ catalogAppid: '1145360', name: 'Hades', source: 'Goldberg' }), [
    { label: 'Steam Guides', url: 'https://steamcommunity.com/app/1145360/guides/', kind: 'guide' },
    { label: 'PowerPyx', url: 'https://www.powerpyx.com/?s=Hades', kind: 'guide' },
    { label: 'Exophase', url: 'https://www.exophase.com/search/?q=Hades', kind: 'guide' },
  ]);
  assert.deepEqual(guideLabels({ name: 'Halo 3', source: 'Xbox PC' }), ['TrueAchievements', 'PowerPyx', 'Exophase']);
  assert.equal(guides({ name: 'Halo 3', source: 'Xbox PC' })[0].url, 'https://www.trueachievements.com/search-results?search=Halo%203');
  assert.deepEqual(guideLabels({ name: 'Bloodborne', source: 'PlayStation Network' }), ['PSNProfiles', 'PowerPyx', 'Exophase']);
  assert.equal(guides({ name: 'Bloodborne', source: 'PlayStation Network' })[0].url, 'https://psnprofiles.com/search/games?q=Bloodborne');
  assert.deepEqual(guideLabels({ name: 'X', source: 'GOG Galaxy' }), ['PowerPyx', 'Exophase']);
});

test('an emulated game also gets its emulator compatibility list, and a retro one RetroAchievements', () => {
  assert.deepEqual(guideLabels({ name: 'Halo 3', source: 'xenia emulator' }), ['TrueAchievements', 'PowerPyx', 'Exophase', 'Xenia compatibility']);
  assert.equal(guides({ name: 'Halo 3', source: 'xenia emulator' })[3].url, 'https://github.com/xenia-project/game-compatibility/issues?q=Halo%203');
  assert.deepEqual(guideLabels({ name: 'Bloodborne', source: 'shadps4 emulator' }), ['PSNProfiles', 'PowerPyx', 'Exophase', 'shadPS4 compatibility']);
  assert.deepEqual(guides({ name: 'Spyro the Dragon (PlayStation)', source: 'RetroAchievements' }), [
    { label: 'RetroAchievements', url: 'https://retroachievements.org/searchresults.php?s=Spyro%20the%20Dragon', kind: 'guide' },
    { label: 'Exophase', url: 'https://www.exophase.com/search/?q=Spyro%20the%20Dragon', kind: 'guide' },
  ]);
});
