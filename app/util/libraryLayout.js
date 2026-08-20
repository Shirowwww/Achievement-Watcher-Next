'use strict';

const MODES = Object.freeze(['default', 'portrait', 'compact', 'portrait-compact', 'list', 'details']);

function normalize(value, legacyPortrait = false) {
  return MODES.includes(value) ? value : legacyPortrait === true ? 'portrait' : 'default';
}

function isPortrait(value) {
  return value === 'portrait' || value === 'portrait-compact';
}

module.exports = { MODES, normalize, isPortrait };
