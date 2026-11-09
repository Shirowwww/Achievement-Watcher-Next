'use strict';

/*
  The help and store pages of a game, shared by the library's right-click "Links" menu and the game
  page. A Steam link carries `steam` ('store' or 'hub') instead of a url: the caller opens it in the
  Steam client when it runs (openSteamTarget in app.js). Other stores are searched by name, and
  PCGamingWiki is offered once, by appid when there is one, else by name. Achievement guides follow.
*/

const { libraryBadgeOf } = require('./sourceIdentity.js');

const SEARCHES = [
  { test: (source) => source.startsWith('epic'), label: 'Epic Games Store', url: (q) => `https://store.epicgames.com/search?q=${q}` },
  { test: (source) => source.startsWith('gog'), label: 'GOG', url: (q) => `https://www.gog.com/games?search=${q}` },
  { test: (source) => source === 'ea', label: 'EA', url: (q) => `https://www.ea.com/search?q=${q}` },
  { test: (source) => source.includes('rpcs3'), label: 'RPCS3 Wiki', url: (q) => `https://wiki.rpcs3.net/index.php?search=${q}` },
  { test: (source) => ['shadps4', 'kytyps5', 'xenia'].some((name) => source.includes(name)) || source === 'ps4 recomp' || source === 'ps3 recomp', label: '' },
  { test: (source) => source.includes('uplay') || source === 'lumaplay' || source.includes('ubisoft'), label: 'Ubisoft Store', url: (q) => `https://store.ubi.com/us/search?q=${q}` },
];

function steamLinks(appid) {
  return [
    { label: 'Steam', steam: 'store', appid },
    { label: 'SteamDB', url: `https://steamdb.info/app/${appid}/` },
    { label: 'PCGamingWiki', url: `https://pcgamingwiki.com/api/appid.php?appid=${appid}` },
    { label: 'SteamHunters', url: `https://steamhunters.com/apps/${appid}/achievements` },
    { label: 'Steam Community', steam: 'hub', appid },
  ];
}

// Achievement guides, by the sites that track the game's platform; searched by name.
const GUIDES = [
  { test: (family) => family === 'xbox', label: 'TrueAchievements', url: (q) => `https://www.trueachievements.com/search-results?search=${q}` },
  { test: (family) => family === 'playstation', label: 'PSNProfiles', url: (q) => `https://psnprofiles.com/search/games?q=${q}` },
  { test: (family) => family === 'retroachievements', label: 'RetroAchievements', url: (q) => `https://retroachievements.org/searchresults.php?s=${q}` },
  // PowerPyx writes guides for the big store and console games, not the retro ones.
  { test: (family) => family !== 'retroachievements', label: 'PowerPyx', url: (q) => `https://www.powerpyx.com/?s=${q}` },
  { test: () => true, label: 'Exophase', url: (q) => `https://www.exophase.com/search/?q=${q}` },
  { test: (family, source) => source.includes('xenia') || source === 'xbox 360 recomp', label: 'Xenia compatibility', url: (q) => `https://github.com/xenia-project/game-compatibility/issues?q=${q}` },
  { test: (family, source) => source.includes('shadps4'), label: 'shadPS4 compatibility', url: (q) => `https://github.com/shadps4-emu/shadps4-game-compatibility/issues?q=${q}` },
];

// RetroAchievements names end with the console, "Spyro the Dragon (PlayStation)": the sites search the title.
const titleOf = (name, family) => (family === 'retroachievements' ? name.replace(/ \([^()]{2,60}\)$/, '') : name).trim();

function guideLinks(appid, name, source) {
  const family = libraryBadgeOf(source);
  const query = encodeURIComponent(titleOf(name, family));
  const steam = /^\d+$/.test(appid) ? [{ label: 'Steam Guides', url: `https://steamcommunity.com/app/${appid}/guides/`, kind: 'guide' }] : [];
  if (!query) return steam;
  const sourceLower = String(source || '').toLowerCase();
  return [...steam, ...GUIDES.filter((entry) => entry.test(family, sourceLower)).map((entry) => ({ label: entry.label, url: entry.url(query), kind: 'guide' }))];
}

function storeAndWikiLinks(appid, name, source, manual) {
  const links = /^\d+$/.test(appid) ? steamLinks(appid) : [];
  const query = encodeURIComponent(name);
  if (!query) return links;
  const sourceLower = String(source || '').toLowerCase();
  const search = SEARCHES.find((entry) => entry.test(sourceLower));
  if (!search && !manual) return links;
  if (search && search.label) links.push({ label: search.label, url: search.url(query) });
  if (!links.some((link) => link.label === 'PCGamingWiki')) {
    links.push({ label: 'PCGamingWiki', url: `https://pcgamingwiki.com/w/index.php?search=${query}` });
  }
  return links;
}

// The help pages first, then the guides (`kind: 'guide'`).
function helpLinks(game) {
  const { catalogAppid, name, source, manual } = game || {};
  const appid = String(catalogAppid || '');
  const title = String(name || '');
  return [...storeAndWikiLinks(appid, title, source, manual), ...guideLinks(appid, title, source)];
}

module.exports = { helpLinks };
