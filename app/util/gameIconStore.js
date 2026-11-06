'use strict';

/*
  Per-appid overrides for the square game logo - the icon beside the title on a game's achievement
  page, in the notification card and in the overlay. Same storage as the cover override (see
  imageOverrideStore.js), a single value per game instead of one per tile orientation.

  No `recoverPrefix`: icon picks come from SteamGridDB's icon set, whose cached filenames do not
  carry a rebuildable grid path. A cached pick is therefore copied into gameIcons/ rather than
  guessed back into a URL that could resolve to somebody else's artwork.
*/

const path = require('path');
const { createImageOverrideStore } = require('./imageOverrideStore.js');

const FILE_NAME = 'gameIcons.db';

// The map file the Watchdog reads straight from disk for a notification's icon.
function gameIconsFile(userDataPath) {
  return path.join(userDataPath, 'cfg', FILE_NAME);
}

module.exports = { ...createImageOverrideStore({ fileName: FILE_NAME, folder: 'gameIcons' }), gameIconsFile };
