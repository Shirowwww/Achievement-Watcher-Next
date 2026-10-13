'use strict';

/*
  Issue #56 asked for bigger artwork, a tighter grid, and an independent Show/Hide for the game name,
  the progress bar, the platform badge and the game-health dot. The renderer and the settings
  normalizer must agree on every value, or a slider would save one number and apply another.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');

const libraryChrome = require('../../app/util/libraryChrome.js');

// Toggles shipped hidden (issue #123's "No achievements" bar); every other one ships shown.
const HIDDEN_BY_DEFAULT = libraryChrome.TOGGLES.filter((toggle) => toggle.shownByDefault === false).map((toggle) => toggle.hiddenClass);

test('an absent setting means the layout that shipped', () => {
  const chrome = libraryChrome.resolve({});
  assert.equal(chrome.tileScale, 1);
  assert.equal(chrome.density, 1);
  assert.deepEqual(chrome.hiddenClasses, HIDDEN_BY_DEFAULT, 'only the toggles shipped hidden start hidden');
});

test('the bar of a game with no achievements ships hidden and shows only on an explicit yes', () => {
  assert.deepEqual(HIDDEN_BY_DEFAULT, ['hide-tile-empty-progress']);
  for (const value of [undefined, false, 'false', 0]) {
    assert.ok(libraryChrome.resolve({ libraryShowEmptyProgress: value }).hiddenClasses.includes('hide-tile-empty-progress'));
  }
  for (const value of [true, 'true']) {
    assert.ok(!libraryChrome.resolve({ libraryShowEmptyProgress: value }).hiddenClasses.includes('hide-tile-empty-progress'));
  }
});

test('a config from an older version needs no migration', () => {
  for (const value of [undefined, null, 'not an object']) {
    const chrome = libraryChrome.resolve(value);
    assert.equal(chrome.tileScale, 1);
    assert.equal(chrome.density, 1);
    assert.deepEqual(chrome.hiddenClasses, HIDDEN_BY_DEFAULT);
  }
});

test('an out-of-range value is clamped, never rejected', () => {
  // options.ini is hand-editable: a 5 there means "as big as it goes", not "reset my layout".
  assert.equal(libraryChrome.normalizeTileScale(5), libraryChrome.TILE_SCALE.max);
  assert.equal(libraryChrome.normalizeTileScale(0.1), libraryChrome.TILE_SCALE.min);
  assert.equal(libraryChrome.normalizeDensity(-3), libraryChrome.DENSITY.min);
  assert.equal(libraryChrome.normalizeDensity(9), libraryChrome.DENSITY.max);
});

test('a value that is not a number falls back to the default', () => {
  for (const value of [undefined, null, '', 'big', NaN, Infinity, {}]) {
    assert.equal(libraryChrome.normalizeTileScale(value), 1, `${String(value)} is not a scale`);
    assert.equal(libraryChrome.normalizeDensity(value), 1, `${String(value)} is not a density`);
  }
});

test('a saved value always lands on a slider position', () => {
  // The slider steps in 5%, so a stored 1.234 must come back as something the control can show.
  const scale = libraryChrome.normalizeTileScale(1.234);
  assert.equal(Math.round(scale * 100) % (libraryChrome.TILE_SCALE.step * 100), 0);
  const density = libraryChrome.normalizeDensity(0.77);
  assert.equal(Math.round(density * 100) % (libraryChrome.DENSITY.step * 100), 0);
});

test('a gap of zero is a real choice, not a missing value', () => {
  // "the space between games smaller, vertically and horizontally" - all the way down to none.
  assert.equal(libraryChrome.normalizeDensity(0), 0);
  assert.equal(libraryChrome.resolve({ libraryDensity: 0 }).density, 0);
});

test('each toggle changes its own element and nothing else', () => {
  const base = libraryChrome.resolve({}).hiddenClasses;
  for (const toggle of libraryChrome.TOGGLES) {
    // Flip it away from its shipped default: exactly its own class must change state.
    const flipped = libraryChrome.resolve({ [toggle.key]: toggle.shownByDefault === false }).hiddenClasses;
    const changed = [...base.filter((name) => !flipped.includes(name)), ...flipped.filter((name) => !base.includes(name))];
    assert.deepEqual(changed, [toggle.hiddenClass], `${toggle.key} must act alone`);
  }
});

test('only an explicit false hides a toggle shipped shown', () => {
  // A truthy-but-not-true value (an old string "true" from options.ini) must not read as "hide".
  for (const value of [true, 'true', 1, undefined]) {
    assert.ok(!libraryChrome.resolve({ libraryShowTitle: value }).hiddenClasses.includes('hide-tile-title'));
  }
  assert.ok(libraryChrome.resolve({ libraryShowTitle: false }).hiddenClasses.includes('hide-tile-title'));
});

test('the renderer is told every class it owns, so it can clear the ones it no longer needs', () => {
  const chrome = libraryChrome.resolve({ libraryShowHealth: false });
  assert.equal(chrome.allClasses.length, libraryChrome.TOGGLES.length);
  for (const hidden of chrome.hiddenClasses) {
    assert.ok(chrome.allClasses.includes(hidden), `${hidden} must be clearable`);
  }
});

test('every toggle has a stylesheet rule and a Settings control', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', '..', 'app');
  const css = fs.readFileSync(path.join(root, 'resources', 'css', 'app.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'view', 'app.html'), 'utf8');

  for (const toggle of libraryChrome.TOGGLES) {
    assert.ok(css.includes(`#game-list.${toggle.hiddenClass} `), `no CSS hides .${toggle.hiddenClass}`);
    assert.ok(html.includes(`id="option_${toggle.key}"`), `no Settings row for ${toggle.key}`);
  }
  assert.ok(html.includes('id="option_libraryTileScale"'), 'no tile-size control');
  assert.ok(html.includes('id="option_libraryDensity"'), 'no density control');
});

test('every view sizes itself from the two multipliers', () => {
  // A view that kept hardcoded pixels would silently ignore both settings, which is exactly how the
  // portrait views behaved before this change.
  const fs = require('node:fs');
  const path = require('node:path');
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'resources', 'css', 'app.css'), 'utf8');

  for (const view of ['view-portrait', 'view-portrait-compact', 'view-compact', 'view-list', 'view-details']) {
    const start = css.indexOf(`#game-list.${view} {`);
    assert.notEqual(start, -1, `${view} declares no size tokens`);
    const block = css.slice(start, css.indexOf('}', start));
    assert.match(block, /var\(--library-scale\)|var\(--library-gap-scale\)/, `${view} ignores the library size settings`);
  }
});

test('the settings file is normalized on load, not only when the sliders move', () => {
  // options.ini stores numbers as strings and can be hand-edited, so app.config must already hold a
  // clamped number by the time the renderer reads it - the renderer never re-clamps on its own.
  const fs = require('node:fs');
  const path = require('node:path');
  const settings = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'settings.js'), 'utf8');

  assert.match(settings, /libraryChrome\.normalizeTileScale\(options\.achievement\.libraryTileScale\)/);
  assert.match(settings, /libraryChrome\.normalizeDensity\(options\.achievement\.libraryDensity\)/);
  assert.match(settings, /for \(const toggle of libraryChrome\.TOGGLES\)/, 'the toggles must be normalized from one list');
  for (const toggle of libraryChrome.TOGGLES) {
    assert.match(settings, new RegExp(`${toggle.key}: ${toggle.shownByDefault !== false}`), `${toggle.key} has no shipped default`);
  }
  assert.match(settings, /options\.achievement\[toggle\.key\] = toggle\.shownByDefault !== false/, 'normalized to each toggle default');
  assert.match(settings, /libraryTileScale: 1,/);
  assert.match(settings, /libraryDensity: 1,/);
});

test('a number written as a string by options.ini still reads as a number', () => {
  assert.equal(libraryChrome.normalizeTileScale('1.25'), 1.25);
  assert.equal(libraryChrome.normalizeDensity('0'), 0);
  assert.equal(libraryChrome.resolve({ libraryTileScale: '1.6', libraryDensity: '0' }).tileScale, 1.6);
});
