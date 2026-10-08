'use strict';

const fs = require('fs');
const path = require('path');
const merge = require('deepmerge');

// Builds the overlay-language payload: strings for headers/status/empty labels plus the lang used for
// localized names. English is the base and every locale merges over it, degrading gracefully.
function loadOverlayLocale({ localeDir, lang } = {}) {
  const language = String(lang || 'english');
  const english = JSON.parse(fs.readFileSync(path.join(localeDir, 'english.json'), 'utf8'));
  let data = english;
  if (language !== 'english') {
    try {
      const requested = JSON.parse(fs.readFileSync(path.join(localeDir, `${language}.json`), 'utf8'));
      data = merge(english, requested, {
        arrayMerge: (dest, src) => src,
        isEmpty: (value) => value === null || value === '',
      });
    } catch {
      // Broken or missing per-language file: keep the English base.
    }
  }
  return {
    lang: language,
    // The masked-description label is shared with the main window, so it is read from there.
    strings: Object.assign({ hiddenDescription: data && data.hiddenDescriptionPlaceholder }, data && data.overlay),
    // Grade names for the overlay's trophy mode, from the same dialogs keys the profile uses.
    trophyLabels: {
      gold: (data && data.dialogs && data.dialogs['trophy-gold']) || 'Gold',
      silver: (data && data.dialogs && data.dialogs['trophy-silver']) || 'Silver',
      bronze: (data && data.dialogs && data.dialogs['trophy-bronze']) || 'Bronze',
    },
  };
}

module.exports = { loadOverlayLocale };
