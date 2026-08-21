'use strict';

/*
  The two halves of the SAN import that are not in util/sanImport.js: the button that starts one, and
  the report that tells the user what it did.

  The conversion itself is covered by test/core/sanImport.test.js. What matters here is that the
  adapter cannot grow a new outcome the UI has no words for, that the import writes only into the
  user's own preset storage, and that nothing about the button ships unlabelled.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BUNDLED_LOCALE_COUNT } = require('../helpers/locales.js');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { parse } = require(path.join(appRoot, 'node_modules', 'node-html-parser'));
const sanImport = require(path.join(appRoot, 'util', 'sanImport.js'));

const read = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');
const document = parse(read('view', 'app.html'));
const settings = read('ui', 'settings.js');
const main = read('electron', 'init.js');
const localeDir = path.join(appRoot, 'locale', 'lang');
const localeFiles = fs.readdirSync(localeDir).filter((file) => file.endsWith('.json'));

test('the import sits with the other preset actions and is fully labelled', () => {
  const button = document.querySelector('#pd-actions #btn-import-san');
  assert.ok(button, 'no SAN import button in the preset designer actions');
  assert.equal(button.querySelector('span').getAttribute('data-lang'), 'importSan');

  assert.equal(localeFiles.length, BUNDLED_LOCALE_COUNT);
  for (const file of localeFiles) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    assert.ok(String(locale.settings.notification.option.designer.importSan || '').trim(), `${file}: the button has no label`);
  }
});

test('the button converts a theme, it does not teach the app to read SAN files', () => {
  // The whole feature is one call into the adapter. Nothing else in the app may learn the format.
  assert.match(settings, /invoke\('import-san-theme', \{\}\)/);
  assert.match(main, /ipcMain\.handle\('import-san-theme'/);
  assert.match(main, /sanImport\.installSanTheme\(\{/);

  const sources = ['app.js', path.join('ui', 'settings.js'), path.join('watchdog', 'toaster.js')];
  for (const relative of sources) {
    let source = '';
    try {
      source = fs.readFileSync(path.join(appRoot, relative), 'utf8');
    } catch {
      continue;
    }
    assert.doesNotMatch(source, /usertheme\.json/, `${relative} reads the SAN format directly`);
  }

  // ...and once imported it is a preset like any other: the same menus rebuild, the same editor opens.
  const handler = /\$\('#btn-import-san'\)\.click\([\s\S]*?\n    \}\);/.exec(settings);
  assert.ok(handler, 'the SAN import handler is gone');
  assert.match(handler[0], /await refreshOverlayPresetMenu\(res\.name\)/);
  assert.match(handler[0], /await refreshGeneratedPresetList\(res\.name\)/);
  assert.match(handler[0], /await loadPresetIntoBuilder\(res\.name\)/);
  // A name clash asks, exactly as an .awpreset import does, and changes nothing until it is answered.
  assert.match(handler[0], /res\.error === 'duplicate'/);
  assert.match(handler[0], /duplicate: choice === 1 \? 'replace' : 'rename'/);
});

test('an import can only ever write into the user own folders', () => {
  const call = /sanImport\.installSanTheme\(\{[\s\S]*?\}\);/.exec(main);
  assert.ok(call, 'the install call is gone');
  assert.match(call[0], /presetsDir: usersPresetsDir\(\)/);
  assert.match(call[0], /soundsDir: userSoundsDir\(\)/);
  assert.match(call[0], /imagesDir: userPresetImagesDir\(\)/);
  // The designer's scratch preset is not a name a theme may take over.
  assert.match(call[0], /reservedNames: \[PREVIEW_PRESET_NAME\]/);
  // A bundled preset of the same name is a clash, or the import would quietly hide it.
  assert.match(call[0], /takenNames: bundledPresetRoots\(\)/);
  assert.match(main, /function userPresetImagesDir\(\) \{\s*\n\s*return path\.join\(userData, 'presets', 'images'\);/);
});

test('every outcome the adapter can report has words in the UI', () => {
  const detail = /function sanReportDetail\(report\)[\s\S]*?\n    \}/.exec(settings);
  assert.ok(detail, 'the report is not rendered anywhere');

  // Every disposition a key can be given, and every way an asset can fail, is printed. A code with
  // no sentence would silently drop part of "what was not carried over" from the report.
  const reported = new Set(sanImport.SAN_KEYS.map((entry) => entry.code).filter((code) => code !== 'mapped' && code !== 'internal'));
  reported.add('unknown');
  for (const code of reported) assert.ok(detail[0].includes(`'${code}'`), `the report never mentions ${code}`);
  for (const code of ['asset-missing', 'asset-rejected']) assert.ok(detail[0].includes(`'${code}'`), `the report never mentions ${code}`);
  // Every structural difference the adapter can point out is stated outright, not left implicit.
  for (const note of sanImport.SAN_NOTES) assert.ok(detail[0].includes(`'${note}'`), `the report never mentions the note ${note}`);
  assert.match(settings, /detail: sanReportDetail\(res\.report\)/);
});

test('a preset can carry its own background picture, from a folder the app owns', () => {
  const field = document.querySelector('#options-notify-designer .pd-field[data-key="bgImage"]');
  assert.ok(field, 'the background picture has no control');
  assert.equal(field.getAttribute('data-shown-for'), 'bgMode:image', 'it should only be offered in the mode that draws it');
  assert.ok(field.querySelector('#pd-bgImage'), 'no picture menu');
  assert.ok(field.querySelector('#btn-import-preset-image'), 'no way to bring a picture in');

  // Dimming, blur and framing apply to both kinds of picture, so their controls follow both modes.
  for (const key of ['artworkDim', 'artworkPosition']) {
    const shared = document.querySelector(`#options-notify-designer .pd-field[data-key="${key}"]`);
    assert.equal(shared.getAttribute('data-shown-for'), 'bgMode:artwork,image', `${key} is not offered for a preset's own picture`);
  }

  assert.match(settings, /invoke\('list-preset-images'\)/);
  assert.match(settings, /invoke\('import-preset-image'\)/);
  assert.match(main, /ipcMain\.handle\('list-preset-images'/);
  assert.match(main, /ipcMain\.handle\('import-preset-image'/);
  // Writing a preset copies the picture in beside its stylesheet, or the generated url would
  // resolve to nothing on the machine it was shared with.
  assert.match(main, /copyPresetImage\(dir, values\.bgImage\);/);
  // Only names the schema accepts ever reach the folder.
  assert.match(main, /presetSchema\.ASSET_RE\.test\(base\)/);

  // The menu's "no picture" entry is worded from the locale, like the sound menu's first entry.
  assert.match(read('locale', 'loader.js'), /\$\('#pd-bgImage'\)\.attr\('data-lang-none', clear\(c\.value\.noImage\)\)/);
  for (const file of localeFiles) {
    const value = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8')).settings.notification.option.designer.value;
    assert.ok(String(value.noImage || '').trim(), `${file}: the picture menu has no empty entry`);
    assert.ok(String(value.image || '').trim(), `${file}: the background mode has no label`);
  }
});

test('the whole report reaches the log, not just the outcome', () => {
  // The dialog is the only place a user sees what was lost, and it is one click from being gone.
  const handler = /ipcMain\.handle\('import-san-theme'[\s\S]*?\n\}\);/.exec(main);
  assert.ok(handler, 'the SAN import handler is gone');
  assert.match(handler[0], /out\.report\.sanVersion/);
  assert.match(handler[0], /out\.report\.skipped/);
  assert.match(handler[0], /out\.report\.assets/);
});

test('the preview resolves a preset picture rather than showing a broken one', () => {
  /*
    A generated preset names its picture relative to its own stylesheet. The preview is a srcdoc
    document with no preset folder behind it, so the same filename would resolve to nothing and the
    card would preview without the background it was designed around.
  */
  assert.match(settings, /function presetAssetUrl\(name\)/);
  assert.match(settings, /const previewCss = \(values\) => presetGenerator\.buildCustomPresetCss\(values, \{ assetUrl: presetAssetUrl \}\);/);
  assert.match(settings, /buildPresetPreviewHtml\(values, \{ hold, assetUrl: presetAssetUrl \}\)/);
  // Cached: the stylesheet is rebuilt on every slider movement, and a wallpaper is not cheap to encode.
  assert.match(settings, /presetImageUris\.has\(name\)/);
});
