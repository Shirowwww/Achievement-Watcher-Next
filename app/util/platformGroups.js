'use strict';

/*
  The platform a game is summed up under, in the stats panel and the library's platform filter. It
  takes the `kind` of the tile badge (sourcePresentationFor), so a game is never counted under a
  platform its own badge disagrees with. Labels are store names, proper nouns left untranslated.
*/
const sourceIdentity = require('./sourceIdentity.js');

const PLATFORMS = {
  steam: { label: 'Steam', img: 'Steam' },
  gog: { label: 'GOG', img: 'gog' },
  epic: { label: 'Epic Games', img: 'epic' },
  ubisoft: { label: 'Ubisoft Connect', img: 'ubisoft' },
  ea: { label: 'EA', img: 'ea' },
  socialclub: { label: 'Social Club', img: 'Goldberg SocialClub' },
  playstation: { label: 'PlayStation', img: 'RPCS3 Emulator' },
  'playstation-3': { label: 'PlayStation 3', img: 'RPCS3 Emulator' },
  'playstation-4': { label: 'PlayStation 4', img: 'ShadPS4 Emulator' },
  'playstation-5': { label: 'PlayStation 5', img: 'KytyPS5 Emulator' },
  xbox: { label: 'Xbox', img: 'Xenia Emulator' },
  'xbox-360': { label: 'Xbox 360', img: 'Xenia Emulator' },
  retroachievements: { label: 'RetroAchievements', img: 'RetroAchievements' },
  pcport: { label: 'PC Port', img: 'PC Port' },
  pc: { label: 'PC', img: 'Unconfigured' },
};

// A tile with no achievements has a badge kind of its own; it still belongs to its platform.
const SAME_PLATFORM = { 'steam-owned': 'steam', empty: 'pc', 'ubisoft-empty': 'ubisoft', 'playstation-empty': 'playstation', 'xbox-empty': 'xbox' };

function platformGroupOf(kind, source) {
  let key = SAME_PLATFORM[kind] || String(kind || '');
  // A console family splits by console when the source names one; a manual entry stays generic.
  if (key === 'playstation' || key === 'xbox') key = sourceIdentity.consoleGroupOf(source) || key;
  // Anything else is the default badge, Steam via an emulator: one key per label, or the filter
  // lists the same name twice.
  if (!PLATFORMS[key]) key = 'steam';
  return { key, label: PLATFORMS[key].label, img: PLATFORMS[key].img };
}

const platformImgOf = (key) => (PLATFORMS[key] ? PLATFORMS[key].img : '');

module.exports = { platformGroupOf, platformImgOf };
