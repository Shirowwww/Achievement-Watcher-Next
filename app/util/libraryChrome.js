'use strict';

/*
  How a library tile is sized and which parts of it are drawn (issue #56: "there's a ton of wasted
  space... an option to hide the progress bar, the platform, the game health and the game name, each
  one independently").

  Two multipliers and five flags, shared by the settings normalizer (which writes options.ini) and
  the renderer (which turns them into CSS custom properties and classes on #game-list), so a value
  can never be clamped one way when saved and another way when applied.

  The scale bounds are deliberately narrow: below 0.7 the cover art stops being readable at the
  title level, above 1.6 a default-width window fits two columns. Density goes down to 0 - "no gap
  at all" is a look people ask for - but not above 1.5, past which the grid reads as unrelated
  cards rather than one library.
*/

const TILE_SCALE = Object.freeze({ min: 0.7, max: 1.6, default: 1, step: 0.05 });
const DENSITY = Object.freeze({ min: 0, max: 1.5, default: 1, step: 0.05 });

// Which piece of tile chrome each flag draws, and the class that hides it. The renderer iterates
// this list, so adding a toggle is one entry here plus one CSS rule plus one Settings row.
const TOGGLES = Object.freeze([
  Object.freeze({ key: 'libraryShowTitle', hiddenClass: 'hide-tile-title' }),
  Object.freeze({ key: 'libraryShowProgress', hiddenClass: 'hide-tile-progress' }),
  Object.freeze({ key: 'libraryShowSource', hiddenClass: 'hide-tile-source' }),
  Object.freeze({ key: 'libraryShowHealth', hiddenClass: 'hide-tile-health' }),
  Object.freeze({ key: 'libraryShowAchievementButton', hiddenClass: 'hide-tile-achievement-button' }),
  Object.freeze({ key: 'libraryShowConfigButton', hiddenClass: 'hide-tile-config-button' }),
  // Older options.ini files call this one showPlayButton, so the key keeps its historical name
  // rather than gaining a library prefix: renaming it would silently reset everyone's choice.
  Object.freeze({ key: 'showPlayButton', hiddenClass: 'hide-play-button' }),
]);

// A value out of range is clamped, not rejected: options.ini is hand-editable, and a 5 there should
// mean "as big as it goes", not "reset everything I chose".
function clamp(value, { min, max, default: fallback }) {
  // Number(null) and Number('') are both 0, so an absent value would be clamped to the minimum
  // rather than left at the default: an options.ini that never mentioned the setting would come
  // back as the smallest tiles in the range. Absent is decided before the conversion.
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// Rounded to the step the slider uses, so a saved value and a slider position always agree. The
// trailing toFixed drops binary-float noise (0.7 comes back as 0.7000000000000001 otherwise), which
// would land in options.ini and read as a hand-edited value on the next load.
function quantize(value, step) {
  return Number((Math.round(value / step) * step).toFixed(4));
}

function normalizeTileScale(value) {
  return quantize(clamp(value, TILE_SCALE), TILE_SCALE.step);
}

function normalizeDensity(value) {
  return quantize(clamp(value, DENSITY), DENSITY.step);
}

/*
  The achievement settings block -> what the renderer needs: the two CSS custom properties and the
  list of classes to put on #game-list. Missing keys mean "shipped default" (true / 1), so an
  options.ini written by an older version needs no migration.
*/
function resolve(achievement) {
  const settings = achievement && typeof achievement === 'object' ? achievement : {};
  const hiddenClasses = TOGGLES.filter((toggle) => settings[toggle.key] === false).map((toggle) => toggle.hiddenClass);
  return {
    tileScale: normalizeTileScale(settings.libraryTileScale),
    density: normalizeDensity(settings.libraryDensity),
    hiddenClasses,
    // Every class this module owns, so the renderer can clear them before applying the current set
    // without knowing which ones it added last time.
    allClasses: TOGGLES.map((toggle) => toggle.hiddenClass),
  };
}

module.exports = { TILE_SCALE, DENSITY, TOGGLES, normalizeTileScale, normalizeDensity, resolve };
