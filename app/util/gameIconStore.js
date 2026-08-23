'use strict';

/*
  Per-appid overrides for the square game logo - the icon beside the title on a game's achievement
  page, in the notification card and in the overlay. Same storage as the cover override (see
  imageOverrideStore.js), a single value per game instead of one per tile orientation.

  No `recoverPrefix`: icon picks come from SteamGridDB's icon set, whose cached filenames do not
  carry a rebuildable grid path. A cached pick is therefore copied into gameIcons/ rather than
  guessed back into a URL that could resolve to somebody else's artwork.
*/

const { createImageOverrideStore } = require('./imageOverrideStore.js');

module.exports = createImageOverrideStore({ fileName: 'gameIcons.db', folder: 'gameIcons' });
