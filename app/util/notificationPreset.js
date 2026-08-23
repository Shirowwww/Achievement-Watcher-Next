'use strict';

/*
  Overlay notification preset resolution. Priority: per-game override > platform preset
  (Xenia/RPCS3/ShadPS4) > main preset. Deliberately no per-type preset: a rare unlock or 100%
  completion is a STATE every preset paints itself (`state-rare`/`tier-*`/`state-platinum`), so a
  second preset for them would be a second way to express the same thing - one that could disagree
  with itself.
*/

// The preset a fresh install uses, and the one every fallback lands on.
const DEFAULT_PRESET = 'AW Next';

/*
  Bundled presets that no longer ship, mapped to the redesigned preset carrying the same idea.
  This is a FALLBACK, never a rewrite: resolvePresetFolder() looks the saved name up across every
  preset root first, so a user preset under one of these names keeps winning. Only a name that
  resolves to nothing (a removed bundled preset) lands here.
*/
const LEGACY_PRESET_ALIASES = {
  // The former default, and the name it carried before that.
  Shirow: DEFAULT_PRESET,
  Raposo: DEFAULT_PRESET,
  Default: DEFAULT_PRESET,
  Midnight: DEFAULT_PRESET,
  xqjan: DEFAULT_PRESET,
  // Console looks. The platform keeps its own name, so these are the older spellings of it.
  PS4: 'PlayStation',
  'PS5 enhanced': 'PlayStation',
  Trophy: 'PlayStation',
  'Xbox 360': 'Xbox',
  'Xbox One': 'Xbox',
  Orbit: 'Xbox',
  Deck: 'Steam',
  // Artwork behind the text.
  'Game Cover': 'Cover',
  Sunset: 'Cover',
  // Quiet, uncoloured cards.
  Clean: 'Glass',
  Modern: 'Glass',
  'Smooth Pop': 'Glass',
  // Loud, high-contrast cards.
  'Neon Future': 'Arcade',
  LAZ0RBOX: 'Arcade',
  /*
    The Xbox Series family: its rare/100% variants existed only for the per-type preset settings,
    which no longer exist (a preset paints those states itself now), so they fold back into one.
  */
  'Xbox Series - Purple': 'Xbox Series',
  'Xbox Series Rare': 'Xbox Series',
  'Xbox Series Rare - Purple': 'Xbox Series',
  'Xbox Series Platinum': 'Xbox Series',
  'Xbox Series Platinum - Purple': 'Xbox Series',
  // Community presets renamed for what they look like rather than who submitted them.
  ArmsofGod: 'Pantheon',
  'Epic Preset': 'Onyx',
  'TigerDX Award': 'Hexagon',
  mudoss: 'Outline',
};

// The preset a removed bundled name stands in for, or '' when the name is not one of them.
function legacyPresetAlias(name) {
  const raw = String(name == null ? '' : name).trim();
  return Object.prototype.hasOwnProperty.call(LEGACY_PRESET_ALIASES, raw) ? LEGACY_PRESET_ALIASES[raw] : '';
}

const EMULATOR_PLATFORM_BY_SOURCE = {
  xenia: ['xenia', 'xenia emulator'],
  rpcs3: ['rpcs3', 'rpcs3 emulator'],
  shadps4: ['shadps4', 'shadps4 emulator'],
};

function sourcePlatform(source) {
  const key = String(source || '').trim().toLowerCase();
  if (!key) return null;
  for (const [platform, aliases] of Object.entries(EMULATOR_PLATFORM_BY_SOURCE)) {
    if (aliases.includes(key)) return platform;
  }
  return null;
}

/*
  Every preset this notification may use, most specific first.

  A caller that can check whether a name still resolves to a folder walks the list and takes the
  first that does, so a per-game override naming a preset that was since deleted or renamed falls
  back to the platform/global choice instead of jumping straight to the default.
*/
function presetPriority({ presets = {}, source = '' } = {}) {
  const platform = sourcePlatform(source);
  return [
    // One game, chosen in its own panel: more specific than anything else, so it wins.
    presets.game || '',
    platform ? presets[platform] || '' : '',
    presets.main || DEFAULT_PRESET,
  ].filter(Boolean);
}

function resolvePreset(args) {
  return presetPriority(args)[0] || DEFAULT_PRESET;
}

/*
  First candidate that still exists in the shared preset catalog. Each saved name wins over its
  legacy alias, so a user-created preset that reused an old bundled name remains authoritative.
*/
function resolveAvailablePresetName(names, isAvailable) {
  const available = typeof isAvailable === 'function' ? isAvailable : () => true;
  for (const name of Array.isArray(names) ? names : []) {
    if (available(name)) return name;
    const alias = legacyPresetAlias(name);
    if (alias && available(alias)) return alias;
  }
  return DEFAULT_PRESET;
}

function resolveAvailablePreset(args, isAvailable) {
  return resolveAvailablePresetName(presetPriority(args), isAvailable);
}

module.exports = {
  DEFAULT_PRESET,
  LEGACY_PRESET_ALIASES,
  legacyPresetAlias,
  sourcePlatform,
  presetPriority,
  resolvePreset,
  resolveAvailablePresetName,
  resolveAvailablePreset,
};
