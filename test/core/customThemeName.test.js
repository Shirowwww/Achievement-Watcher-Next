'use strict';

/*
  The name a person gives their own theme.

  It has to be one string doing three jobs at once - the row in the theme picker, the folder an
  installed copy would take, and the name the .awtheme file is offered under - so what it may
  contain is decided once, by the same rules the package format already applied, and everything
  else reads it back. These pin that: the rules agree, the name survives the save that happens
  twice per edit, and a file written before the field existed still loads.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const themeLayers = require(path.join(appRoot, 'util', 'themeLayers.js'));
const themePackage = require(path.join(appRoot, 'util', 'themePackage.js'));

function userData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-name-'));
}

/*
  themeLayers cannot require themePackage (themePackage requires themeLayers), so the sanitizer is
  written out twice. This is what stops the copies drifting: a name the picker accepts and a name
  the package writes have to be the same name, or exporting would quietly rename the theme.
*/
test('the two sanitizers agree on every name', () => {
  const names = [
    'Harbour Lights',
    '  Harbour  Lights  ',
    'Ques?tion*marks|and:slashes/',
    'trailing dots...',
    'x'.repeat(80),
    '',
    '   ',
    '<script>alert(1)</script>',
    'Thème français',
    '主题',
  ];
  for (const name of names) {
    assert.equal(
      themeLayers.sanitizeCustomThemeName(name),
      themePackage.sanitizeThemeName(name),
      `the two sanitizers disagree about ${JSON.stringify(name)}`
    );
  }
});

test('a name is stored beside the layers, and read back', () => {
  const dir = userData();
  themeLayers.saveCustomTheme(dir, themeLayers.defaultCustomTheme(), '  Harbour  Lights  ');
  assert.equal(themeLayers.loadCustomThemeName(dir), 'Harbour Lights', 'the stored name is the sanitized one');

  // The model itself is untouched by the field: every reader of a theme still sees exactly the
  // nine layers, so the CSS builder, the package writer and the mock need to know nothing about it.
  const theme = themeLayers.loadCustomTheme(dir);
  assert.deepEqual(Object.keys(theme).sort(), [...themeLayers.LAYER_IDS].sort());
});

/*
  Saving runs twice for one edit: once with what the editor holds, then again to record the blur
  copies that were generated from it. Only the first call knows the name, so a second call that
  wiped it would erase the theme's name every time a layer image changed.
*/
test('a save that says nothing about the name keeps the one on disk', () => {
  const dir = userData();
  themeLayers.saveCustomTheme(dir, themeLayers.defaultCustomTheme(), 'Harbour Lights');
  themeLayers.saveCustomTheme(dir, themeLayers.defaultCustomTheme());
  assert.equal(themeLayers.loadCustomThemeName(dir), 'Harbour Lights');
});

test('an empty name is a theme with no name, not a theme called nothing in particular', () => {
  const dir = userData();
  themeLayers.saveCustomTheme(dir, themeLayers.defaultCustomTheme(), 'Harbour Lights');
  themeLayers.saveCustomTheme(dir, themeLayers.defaultCustomTheme(), '   ');
  assert.equal(themeLayers.loadCustomThemeName(dir), '');
});

// Backward compatibility: a customTheme.json written before this field existed is an unnamed theme,
// which is exactly the state the editor asks the user to leave. It must not fail to load.
test('a theme file from before the field existed still loads', () => {
  const dir = userData();
  const file = themeLayers.customThemeFile(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(themeLayers.defaultCustomTheme(), null, 2), 'utf8');

  assert.equal(themeLayers.loadCustomThemeName(dir), '');
  assert.deepEqual(themeLayers.loadCustomTheme(dir), themeLayers.defaultCustomTheme());
});

test('no name is missing from a file that never had one written', () => {
  assert.equal(themeLayers.loadCustomThemeName(userData()), '', 'a theme storage with no file yet has no name');
});

/*
  The whole point of the name: it is what the exported file is called. `exportTheme` names the
  package from it, so a theme called "Harbour Lights" travels as Harbour Lights.awtheme and says so
  in its own manifest.
*/
test('the name becomes the exported package name', () => {
  const dir = userData();
  const destination = path.join(dir, 'Harbour Lights.awtheme');
  const out = themePackage.exportTheme({
    theme: themeLayers.defaultCustomTheme(),
    name: 'Harbour Lights',
    destination,
    appVersion: '3.10.1',
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.name, 'Harbour Lights');

  const read = themePackage.readThemePackage(destination, { appVersion: '3.10.1' });
  assert.equal(read.ok, true, read.error);
  assert.equal(read.manifest.name, 'Harbour Lights');
});

test('a theme with no name has nothing to export under', () => {
  const dir = userData();
  const out = themePackage.exportTheme({
    theme: themeLayers.defaultCustomTheme(),
    name: '',
    destination: path.join(dir, 'x.awtheme'),
    appVersion: '3.10.1',
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'invalid-name');
});

/*
  Saving a theme, which is what the Save button in the editor writes.

  It lands in the same storage an imported .awtheme installs into, so a theme somebody saved and a
  theme somebody was sent are the same kind of thing afterwards - listed, selected, exported and
  deleted by one set of code.
*/
test('a saved theme is an ordinary installed theme afterwards', () => {
  const dir = userData();
  const out = themePackage.saveThemeAs({
    userDataPath: dir,
    name: 'Harbour Lights',
    theme: themePackage.themeFromBuiltin('nord'),
    base: 'nord',
    appVersion: '3.10.1',
  });
  assert.equal(out.ok, true, out.error);

  const listed = themePackage.listInstalledThemes(dir);
  assert.deepEqual(listed.map((theme) => theme.name), ['Harbour Lights']);
  assert.equal(listed[0].base, 'nord', 'a theme built on a palette says which one');

  // And it reads back as a theme, not as a folder that happens to be there.
  const installed = themePackage.readInstalledTheme(dir, 'Harbour Lights');
  assert.ok(installed, 'the saved theme cannot be read back');
  assert.equal(installed.theme.accent.color, themeLayers.BUILTIN_COLORS.nord.accent);
});

// The rule the whole Save button rests on: a second name is a second theme.
test('saving under another name keeps both, and the same name refuses until told', () => {
  const dir = userData();
  const first = themePackage.saveThemeAs({ userDataPath: dir, name: 'Mine', theme: themePackage.themeFromBuiltin('nord'), appVersion: '3.10.1' });
  assert.equal(first.ok, true, first.error);

  // The same name reports the clash and changes nothing.
  const clash = themePackage.saveThemeAs({ userDataPath: dir, name: 'Mine', theme: themePackage.themeFromBuiltin('gruvbox'), appVersion: '3.10.1' });
  assert.equal(clash.ok, false);
  assert.equal(clash.error, 'duplicate');
  assert.equal(
    themePackage.readInstalledTheme(dir, 'Mine').theme.accent.color,
    themeLayers.BUILTIN_COLORS.nord.accent,
    'a refused save must not have written anything'
  );

  // Told to replace, it replaces.
  const replaced = themePackage.saveThemeAs({
    userDataPath: dir,
    name: 'Mine',
    theme: themePackage.themeFromBuiltin('gruvbox'),
    appVersion: '3.10.1',
    overwrite: true,
  });
  assert.equal(replaced.ok, true, replaced.error);
  assert.equal(themePackage.readInstalledTheme(dir, 'Mine').theme.accent.color, themeLayers.BUILTIN_COLORS.gruvbox.accent);

  // A different name leaves the first alone, which is the whole point.
  const second = themePackage.saveThemeAs({ userDataPath: dir, name: 'Mine too', theme: themePackage.themeFromBuiltin('dracula'), appVersion: '3.10.1' });
  assert.equal(second.ok, true, second.error);
  assert.deepEqual(themePackage.listInstalledThemes(dir).map((theme) => theme.name).sort(), ['Mine', 'Mine too']);
  assert.equal(themePackage.readInstalledTheme(dir, 'Mine').theme.accent.color, themeLayers.BUILTIN_COLORS.gruvbox.accent);
  assert.equal(themePackage.readInstalledTheme(dir, 'Mine too').theme.accent.color, themeLayers.BUILTIN_COLORS.dracula.accent);
});

// A saved theme may not take a name the picker already means something else by.
test('a saved theme cannot shadow a built-in', () => {
  const dir = userData();
  const out = themePackage.saveThemeAs({
    userDataPath: dir,
    name: 'nord',
    theme: themePackage.themeFromBuiltin('nord'),
    appVersion: '3.10.1',
    reservedNames: Object.keys(themeLayers.BUILTIN_COLORS),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'reserved-name');
});

/*
  Saving is not a rename of the Custom slot. The scratchpad keeps whatever is in it, so the next
  visit opens on the design that was left there rather than on a blank one.
*/
test('saving out of the Custom slot leaves the slot alone', () => {
  const dir = userData();
  const scratch = themeLayers.defaultCustomTheme();
  scratch.accent.color = '#04ff00';
  themeLayers.saveCustomTheme(dir, scratch, 'Prout');

  themePackage.saveThemeAs({ userDataPath: dir, name: 'Prout', theme: scratch, appVersion: '3.10.1' });

  assert.equal(themeLayers.loadCustomTheme(dir).accent.color, '#04ff00', 'the slot lost what was in it');
  assert.equal(themeLayers.loadCustomThemeName(dir), 'Prout', 'the slot lost its remembered name');
});
