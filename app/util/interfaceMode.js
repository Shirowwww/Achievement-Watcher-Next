'use strict';

/*
  Simple / Advanced - how much of AW Next the interface shows. A DISPLAY setting only: every
  parser, the watchdog, the scan and the unlock pipeline behave identically in both modes, and
  every capability stays one switch away.

  Kept pure (no DOM/fs/Electron/i18n) so the whole policy is one testable list instead of
  conditions scattered across the renderer. app/ui/settings.js does the class toggling with these
  selectors; app/app.js reads the check policy.
*/

const SIMPLE = 'simple';
const ADVANCED = 'advanced';
const MODES = [SIMPLE, ADVANCED];

// Class the renderer puts on anything Simple mode hides. Rows are hidden, never removed: the
// settings panel is translated positionally (locale/loader.js binds `li:nth-child(n)`), so the DOM
// order has to survive every mode switch. Same reason obsolete rows are hidden rather than deleted.
const HIDDEN_CLASS = 'mode-hidden';

// Attribute marking a single row or card that only Simple mode hides, inside a tab it still shows.
const ADVANCED_ATTRIBUTE = 'data-advanced';

/*
  Settings tabs Simple mode hides entirely: the low-level setup surface (emulator runtime,
  Steamless, API-check bypass, Uplay R2) and diagnostics/bulk-repair. Gating is per-tab only when
  the whole tab is technical - Controller stays visible (an everyday choice), with just its three
  implementation rows carrying ADVANCED_ATTRIBUTE instead.
*/
const ADVANCED_VIEWS = ['emulator', 'uplay', 'advanced'];

// Tabs Simple mode always shows. Listed rather than derived so a new tab has to make a deliberate
// choice instead of silently defaulting into the streamlined interface.
const SIMPLE_VIEWS = ['general', 'appearance', 'controller', 'notification', 'presets', 'source', 'folder', 'help'];

/*
  Game Health checks Simple mode leaves out of the summary list. `identity` reports the resolved
  appid and the platform the game was matched from - a diagnostic value, not an outcome a player
  can act on. It stays in Technical details, which both modes show.
*/
const SIMPLE_HIDDEN_CHECKS = ['identity'];

/*
  Niche source switches, keyed by `[achievement_source]`, with the `source` values the parsers
  stamp on their games. These are the only rows Simple may fold away, decided per row (see
  hiddenOptionalSources()) - everything else in Sources is a name a player recognises, and shows.
*/
const OPTIONAL_SOURCES = {
  greenLuma: ['GreenLuma Reborn', 'GreenLuma 2020', 'GreenLuma 2024', 'GreenLuma 2025'],
  lumaPlay: ['Lumaplay'],
  gog: ['gog'],
  epic: ['epic'],
  socialClub: ['Goldberg SocialClub'],
  xlln: ['XLiveLessNess'],
  importCache: ['Achievement Watcher : Watchdog'],
};

function sourceKey(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/*
  Which niche source rows Simple hides: only ones both switched OFF and absent from the library,
  so the mode never strands anyone (an OFF-but-used source keeps its only control visible; a used
  source keeps its switch in any mode). Advanced hides nothing.
*/
function hiddenOptionalSources({ mode, enabled = {}, librarySources = [] } = {}) {
  if (!isSimple(mode)) return [];
  const present = new Set((Array.isArray(librarySources) ? librarySources : []).map(sourceKey));
  return Object.keys(OPTIONAL_SOURCES).filter((key) => {
    if (enabled[key] === false) return false;
    return !OPTIONAL_SOURCES[key].some((name) => present.has(sourceKey(name)));
  });
}

function normalize(value) {
  const mode = String(value == null ? '' : value).trim().toLowerCase();
  return MODES.includes(mode) ? mode : '';
}

// The mode to render with. An unset/unreadable value resolves to Advanced on purpose: showing
// everything is the safe failure, hiding controls from someone who never chose Simple is not.
function resolve(config) {
  return normalize(config && config.general && config.general.interfaceMode) || ADVANCED;
}

// Whether the user has actually made the choice. Onboarding blocks on this rather than accepting
// the resolve() fallback as an answer.
function isChosen(config) {
  return normalize(config && config.general && config.general.interfaceMode) !== '';
}

function isSimple(mode) {
  return normalize(mode) === SIMPLE;
}

function isViewVisible(view, mode) {
  if (!isSimple(mode)) return true;
  return !ADVANCED_VIEWS.includes(String(view));
}

function isCheckVisible(checkId, mode) {
  if (!isSimple(mode)) return true;
  return !SIMPLE_HIDDEN_CHECKS.includes(String(checkId));
}

module.exports = {
  SIMPLE,
  ADVANCED,
  MODES,
  HIDDEN_CLASS,
  ADVANCED_ATTRIBUTE,
  ADVANCED_VIEWS,
  SIMPLE_VIEWS,
  SIMPLE_HIDDEN_CHECKS,
  OPTIONAL_SOURCES,
  hiddenOptionalSources,
  normalize,
  resolve,
  isChosen,
  isSimple,
  isViewVisible,
  isCheckVisible,
};
