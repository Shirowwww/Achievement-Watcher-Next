'use strict';

// Per-appid overrides for the achievement page background: the cover store's machinery (see
// imageOverrideStore.js) with one value per game, kept in cfg/backgrounds.db and backgrounds/.

const { createImageOverrideStore } = require('./imageOverrideStore.js');

module.exports = createImageOverrideStore({ fileName: 'backgrounds.db', folder: 'backgrounds' });
