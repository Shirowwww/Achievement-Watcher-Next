'use strict';

/*
  Which Settings blocks are collapsible sections. Collapsing only toggles a class - positional i18n
  requires the DOM to survive - so the selectors are part of the contract, tested against app.html.
*/

/*
  A section is a card with one of the three card headers; heroes and nested blocks are excluded.
*/
const SECTION_SELECTOR = '.arrow-list, .emulator-group, .settings-card, #epic-connect, .emulator-login';

/*
  The clickable header of a section, as a DIRECT child. Three shapes exist:
    .title                  - the ordinary card header
    .emulator-group-title   - emulator groups
    .emulator-login-heading - account/customizer cards, whose .title is nested one level deeper
*/
const HEADER_SELECTOR = '.title, .emulator-group-title, .emulator-login-heading';

/*
  Sections that start collapsed: rarely-touched cards, so a tab opens on the few controls most
  people use. Keys are section ids (see sectionKey). Bump DEFAULTS_VERSION when this list changes,
  so a profile that already stored its own open/closed state is brought up to date once.
*/
const DEFAULT_COLLAPSED = [
  'options-ui-app',
  'options-ui-trophies',
  'options-source-emulators',
  'defaultdir',
  'options-notify-transport',
  'options-notify-test',
  'options-notify-souvenir',
  'options-notify-clip',
  'theme-library',
  'theme-customizer',
  'adv-goldberg-title',
  'adv-diag-title',
  'profile-backup-title',
  'gbe-dll-settings',
];
const DEFAULTS_VERSION = 1;

/*
  The collapsed keys to apply, given what was stored. A profile with no stored state gets the
  defaults; one stored before DEFAULTS_VERSION keeps its choices and gains the new defaults once.
  `changed` tells the caller to write the result back.
*/
function resolveCollapsed(stored, seenVersion) {
  const keys = new Set(Array.isArray(stored) ? stored : DEFAULT_COLLAPSED);
  if (!Array.isArray(stored) || Number(seenVersion) >= DEFAULTS_VERSION) {
    return { keys, version: DEFAULTS_VERSION, changed: false };
  }
  DEFAULT_COLLAPSED.forEach((key) => keys.add(key));
  return { keys, version: DEFAULTS_VERSION, changed: true };
}

// The header element of a section, or null when it has none (which makes it not a section).
function headerFor($, section) {
  const header = $(section).children(HEADER_SELECTOR).first();
  return header.length ? header : null;
}

/*
  The collapsible sections of one tab: matches of SECTION_SELECTOR that have a header and are not
  themselves inside another match. `.emulator-list` also carries `.arrow-list`, so an emulator
  group's inner list would otherwise be reported as a second section inside its own group.
*/
function sectionsIn($, scope) {
  const root = $(scope);
  return root.find(SECTION_SELECTOR).filter(function () {
    if (!headerFor($, this)) return false;
    return $(this).parentsUntil(root).filter(SECTION_SELECTOR).length === 0;
  });
}

/*
  A stable, language-independent key for remembering a section's open/closed state. Ids come
  first since they survive re-ordering; the positional fallback covers only a handful of unnamed
  cards, where the worst case is a section forgetting its state after a layout change.
*/
function sectionKey($, section, view, index) {
  const el = $(section);
  const own = el.attr('id');
  if (own) return own;

  const list = el.find('ul[id]').first().attr('id');
  if (list) return list;

  const header = headerFor($, section);
  const labelled = header ? header.find('[id]').first().attr('id') : '';
  if (labelled) return labelled;

  return `${view || 'view'}:${index}`;
}

module.exports = { SECTION_SELECTOR, HEADER_SELECTOR, DEFAULT_COLLAPSED, DEFAULTS_VERSION, resolveCollapsed, headerFor, sectionsIn, sectionKey };
