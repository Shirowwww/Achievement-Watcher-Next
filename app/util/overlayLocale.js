'use strict';

const fs = require('fs');
const path = require('path');
const merge = require('deepmerge');

// The screenshot and clip viewer reads the main window's own strings; a missing one keeps the overlay's default.
const CAPTURE_KEYS = {
  captureScreenshot: 'capture-show-screenshot',
  captureClip: 'capture-show-clip',
  captureClose: 'capture-viewer-close',
  capturePrevious: 'capture-viewer-previous',
  captureNext: 'capture-viewer-next',
  captureCount: 'capture-viewer-count',
  captureUnavailable: 'capture-viewer-unavailable',
  captureFolder: 'capture-viewer-folder',
};

function captureStrings(dialogs) {
  const out = {};
  for (const [key, dialogKey] of Object.entries(CAPTURE_KEYS)) {
    if (dialogs && typeof dialogs[dialogKey] === 'string' && dialogs[dialogKey]) out[key] = dialogs[dialogKey];
  }
  return out;
}

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
    // So are the steps toggle's name and the pin labels.
    strings: Object.assign(
      {
        hiddenDescription: data && data.hiddenDescriptionPlaceholder,
        steps: data && data.dialogs && data.dialogs['steps-toggle'],
        pin: data && data.dialogs && data.dialogs['ach-pin-menu'],
        unpin: data && data.dialogs && data.dialogs['ach-unpin-menu'],
      },
      captureStrings(data && data.dialogs),
      data && data.overlay
    ),
    // Grade names for the overlay's trophy mode, from the same dialogs keys the profile uses.
    trophyLabels: {
      gold: (data && data.dialogs && data.dialogs['trophy-gold']) || 'Gold',
      silver: (data && data.dialogs && data.dialogs['trophy-silver']) || 'Silver',
      bronze: (data && data.dialogs && data.dialogs['trophy-bronze']) || 'Bronze',
    },
  };
}

module.exports = { loadOverlayLocale };
