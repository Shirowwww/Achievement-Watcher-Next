'use strict';

const { sharedAppModulePath } = require('./sharedAppModule.js');
const rarityTiers = require(sharedAppModulePath('util/rarityTiers.js'));

// The highest unlock rate a notification still calls rare: Settings > General > Rarity thresholds.
function rareCutoff(options) {
  return rarityTiers.normalizeRareBounds(options && options.achievement).rareMax;
}

module.exports = { rareCutoff };
