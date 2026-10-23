'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const htmlParser = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'node-html-parser'));
const { luminance, contrast } = require('../helpers/contrast');

// The theme picker opens on a short primary set and keeps the rest behind "More themes…". The real
// risk is silent loss: a built-in listed in neither array disappears from the UI while its palette
// and app.css block stay in the tree, so nothing else fails. These tests pin both arrays against the
// theme engine, and pin the light theme's contrast - the one palette the stylesheet's dark-base overlays were not written for.

const appDir = path.join(__dirname, '..', '..', 'app');
const themeLayers = require(path.join(appDir, 'util', 'themeLayers.js'));
const source = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');

function listValues(name) {
  const block = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(block, `${name} must stay a top-level array literal in settings.js`);
  return [...block[1].matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]);
}

const primary = listValues('PRIMARY_THEMES');
const more = listValues('MORE_THEMES');
const sentinel = (source.match(/const MORE_THEMES_VALUE = '([^']+)'/) || [])[1];

test('the picker opens on a set small enough to choose from', () => {
  assert.ok(primary.length >= 6 && primary.length <= 7, `expected 6-7 primary themes, got ${primary.length}`);
});

test('every built-in theme is still reachable from the picker', () => {
  const offered = [...primary, ...more];
  assert.equal(new Set(offered).size, offered.length, 'a theme must not appear in both lists');
  assert.deepEqual(offered.slice().sort(), Object.keys(themeLayers.BUILTIN_COLORS).sort(), 'the two lists together must cover every built-in palette');
});

test('the primary set keeps the default and spans both extremes', () => {
  assert.ok(primary.includes('default'), 'the default theme must not be hidden behind More themes…');
  assert.ok(primary.includes('light'), 'the only light theme belongs in the primary set');
  assert.ok(primary.includes('oled'), 'the pure-black theme belongs in the primary set');
});

test('primary themes are visually distinct from one another', () => {
  // Two primaries that render near-identically waste one of the seven slots.
  for (let i = 0; i < primary.length; i++) {
    for (let j = i + 1; j < primary.length; j++) {
      const a = themeLayers.BUILTIN_COLORS[primary[i]];
      const b = themeLayers.BUILTIN_COLORS[primary[j]];
      assert.notEqual(a.bg + a.accent, b.bg + b.accent, `${primary[i]} and ${primary[j]} share a background and accent`);
    }
  }
});

/*
  "More themes…" used to be a sentinel <option>: picking it closed the list, rebuilt the <select> and
  needed a second click to show the long list. The extras are now always in the <select>, marked
  data-more, and the dropdown (ui/selectMenu.js) unfolds them in place; it opens unfolded when the
  applied theme is one of them.
*/
test('the long list is folded inside the dropdown, not behind a command row', () => {
  assert.equal(sentinel, undefined, 'no sentinel value: a command row is not a theme');
  const populate = source.slice(source.indexOf('function populateThemeSelect'));
  const body = populate.slice(0, populate.indexOf('ipcRenderer'));
  assert.match(body, /for \(const \[value, label\] of MORE_THEMES\) sel\.append\(themeOption\(value, label\)\.attr\('data-more', ''\)\)/, 'every extra theme is listed, folded');
  assert.match(body, /data-more-label', t\('themeMore'/, 'the fold row is labelled More themes…');

  const menu = fs.readFileSync(path.join(appDir, 'ui', 'selectMenu.js'), 'utf8');
  assert.match(menu, /option\.hasAttribute\('data-more'\)/, 'the dropdown reads the fold marker');
  assert.match(menu, /!items\.some\(\(item\) => item\.more && item\.index === select\.selectedIndex\)/, 'a selected extra theme opens the list unfolded');
});

test('theme rows stay plain so the selected one is obvious', () => {
  // Tinting the options was tried at full palette and at a faint accent wash; a native <select>
  // offers no control over how that swatch renders, and either way the list looked like a patchwork
  // and the tint fought Chromium's highlight for the current row.
  const optionFn = source.slice(source.indexOf('function themeOption'), source.indexOf('function populateThemeSelect'));
  assert.doesNotMatch(optionFn, /background-color/, 'theme rows must not be tinted');
  assert.doesNotMatch(optionFn, /\.css\(/, 'theme rows must not carry inline styling at all');
});

test('the light accent is muted enough for a pale background', () => {
  const light = themeLayers.BUILTIN_COLORS.light;
  const n = parseInt(light.accent.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  assert.ok(saturation < 0.75, `light accent is too saturated for a white surface (${saturation.toFixed(2)})`);
  assert.ok(contrast(light.accent, light.bg) >= 4.5, 'the light accent must still be readable as text on the light background');
});

test('the markup fallback mirrors the primary set', () => {
  const root = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
  const options = root.querySelectorAll('#option_theme option').map((o) => o.getAttribute('value'));
  assert.deepEqual(options, primary, 'the static <option> list must match PRIMARY_THEMES so the control never flashes a stale list');
});

test('light is the only light-based built-in and stays readable', () => {
  const light = themeLayers.BUILTIN_COLORS.light;
  assert.ok(light, 'the light theme must exist in the theme engine');
  assert.ok(luminance(light.bg) > 0.5, 'the light theme must have a light background');
  for (const [name, colors] of Object.entries(themeLayers.BUILTIN_COLORS)) {
    if (name === 'light') continue;
    assert.ok(luminance(colors.bg) < 0.2, `${name} is expected to stay a dark theme`);
  }
  assert.ok(contrast(light.text, light.bg) >= 4.5, 'light theme body text must meet WCAG AA against its background');
  assert.ok(contrast(light.muted, light.bg) >= 4.5, 'light theme muted text must meet WCAG AA against its background');
});

test('a theme the picker offers survives being saved', () => {
  /*
    settings.js validates general.theme and rewrites anything it does not recognise back to
    "default". It used to carry its own copy of the built-in names, and that copy never learned
    about "light": the picker offered it, the stylesheet implemented it, and the next load quietly
    reset it. Reading the theme engine here is what keeps the two from drifting again.
  */
  const validator = fs.readFileSync(path.join(appDir, 'settings.js'), 'utf8');
  assert.doesNotMatch(
    validator,
    /\[\s*'default',\s*'(?:oled|light)'[^\]]*\]\.includes\(options\.general\.theme\)/,
    'the theme validator must not hard-code a second list of built-ins'
  );
  assert.match(
    validator,
    /Object\.keys\(themeLayers\.BUILTIN_COLORS\)\.includes\(options\.general\.theme\)/,
    'the theme validator must accept every palette the theme engine defines'
  );

  // Custom and user themes are not palettes in BUILTIN_COLORS, so they need their own branches.
  assert.match(validator, /options\.general\.theme !== 'custom'/, 'the Custom theme must stay valid');
  assert.match(validator, /\^user:/, 'user themes from <userData>\\themes must stay valid');
});

/*
  A theme the user saved, or one somebody sent them, has to survive a restart too.

  `pack:` was missing from the validator, so every read of options.ini rewrote an imported theme back
  to Steam Blue - an imported theme was applied, saved with OK, and gone the next time the app
  started. Saved themes live in the same value space, so this is now load-bearing for both.
*/
test('a saved or imported theme survives being saved', () => {
  const validator = fs.readFileSync(path.join(appDir, 'settings.js'), 'utf8');
  assert.match(validator, /\^pack:/, 'themes in <userData>\theme-packs must stay valid');

  // The validator is a string check on purpose: it runs on every load, so it must not walk storage.
  const block = validator.slice(validator.indexOf('options.general.theme !== \'custom\''));
  const body = block.slice(0, block.indexOf('\n    }'));
  assert.ok(!/readdirSync|existsSync|listInstalledThemes/.test(body), 'validating a theme name must not touch the disk');
});

/*
  Five palettes were removed. Each lived in three places that have to agree - the table, the token
  block that paints the window, and the list the picker offers - so a half-done removal would leave
  a row that paints nothing, or a palette nothing can reach.
*/
test('a removed palette is gone from every place that knew it', () => {
  const removed = ['cyberpunk', 'ember', 'hacker', 'burgundy', 'champagne'];
  const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

  for (const name of removed) {
    assert.equal(themeLayers.BUILTIN_COLORS[name], undefined, `${name} is still a palette`);
    assert.ok(!css.includes(`[data-theme='${name}']`), `${name} still has a token block in app.css`);
    assert.ok(!primary.includes(name), `${name} is still offered by the picker`);
    assert.ok(!more.includes(name), `${name} is still offered behind More themes`);
  }

  // Nothing else went with them: the palettes that remain are still whole.
  for (const [name, colors] of Object.entries(themeLayers.BUILTIN_COLORS)) {
    for (const layer of ['bg', 'header', 'panel', 'card', 'settings', 'text', 'muted', 'border', 'accent']) {
      assert.match(String(colors[layer] || ''), /^#[0-9a-f]{6}$/i, `${name}.${layer} is not a colour`);
    }
  }
});
