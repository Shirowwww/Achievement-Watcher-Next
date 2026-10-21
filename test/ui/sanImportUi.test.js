'use strict';

// The parts of the SAN import outside util/sanImport.js: the two buttons that start one, the report
// that tells the user what it did, the export that must carry every sound, and the notification
// path that plays each state's own sound (the import itself is test/core/sanImport.test.js).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BUNDLED_LOCALE_COUNT } = require('../helpers/locales.js');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { parse } = require(path.join(appRoot, 'node_modules', 'node-html-parser'));

const read = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');
const document = parse(read('view', 'app.html'));
const settings = read('ui', 'settings.js');
const { mainProcessSource } = require('../helpers/mainProcessSource.js');
const main = mainProcessSource();
const localeDir = path.join(appRoot, 'locale', 'lang');
const localeFiles = fs.readdirSync(localeDir).filter((file) => file.endsWith('.json'));

const block = (source, pattern, what) => {
  const match = pattern.exec(source);
  assert.ok(match, `${what} is gone`);
  return match[0];
};

test('both imports sit with the other preset actions and are labelled in every language', () => {
  const buttons = { '#btn-import-san': 'importMenuSan', '#btn-import-san-setup': 'importMenuSanSetup' };
  assert.equal(localeFiles.length, BUNDLED_LOCALE_COUNT);
  for (const [selector, key] of Object.entries(buttons)) {
    const button = document.querySelector(`#pd-actions ${selector}`);
    assert.ok(button, `${selector} is not in the preset designer actions`);
    assert.equal(button.querySelector('span').getAttribute('data-lang'), key);
    for (const file of localeFiles) {
      const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
      assert.ok(String(locale.settings.notification.option.designer[key] || '').trim(), `${file}: ${selector} has no label`);
    }
  }
});

test('the buttons hand the work to the main process and select what it installed', () => {
  assert.match(settings, /invoke\('import-san-theme', \{\}\)/);
  assert.match(settings, /invoke\('import-san-setup'\)/);
  assert.match(main, /ipcMain\.handle\('import-san-theme'/);
  assert.match(main, /ipcMain\.handle\('import-san-setup'/);

  const select = block(settings, /async function showImportedSanPreset\(name\) \{[\s\S]*?\n    \}/, 'the shared selection step');
  assert.match(select, /await refreshOverlayPresetMenu\(name\)/);
  assert.match(select, /await refreshGeneratedPresetList\(name\)/);

  const single = block(settings, /\$\('#btn-import-san'\)\.click\([\s\S]*?\n    \}\);/, 'the .san import handler');
  assert.match(single, /await showImportedSanPreset\(res\.name\)/);
  // A name clash asks, exactly as an .awpreset import does, and changes nothing until it is answered.
  assert.match(single, /res\.error === 'duplicate'/);
  assert.match(single, /duplicate: choice === 1 \? 'replace' : 'rename'/);

  const setup = block(settings, /\$\('#btn-import-san-setup'\)\.click\([\s\S]*?\n    \}\);/, 'the settings import handler');
  assert.match(setup, /await showImportedSanPreset\(installed\[0\]\.name\)/);
  assert.match(setup, /res\.error === 'san-not-found'/);

  // Nothing outside the importer learns the format.
  for (const relative of ['app.js', path.join('ui', 'settings.js')]) {
    let source = '';
    try {
      source = fs.readFileSync(path.join(appRoot, relative), 'utf8');
    } catch {
      continue;
    }
    assert.doesNotMatch(source, /usertheme\.json/, `${relative} reads the SAN format directly`);
  }
});

test('an import can only ever write into the user own folders', () => {
  for (const call of [/sanImport\.installSanTheme\(\{[\s\S]*?\}\);/, /sanImport\.installSanSetup\(\{[\s\S]*?\}\);/]) {
    const source = block(main, call, String(call));
    assert.match(source, /presetsDir: usersPresetsDir\(\)/);
    assert.match(source, /soundsDir: userSoundsDir\(\)/);
    assert.match(source, /reservedNames: \[PREVIEW_PRESET_NAME\]/);
    // A bundled preset of the same name is a clash, or the import would quietly hide it.
    assert.match(source, /takenNames: bundledPresetNames\(\)/);
  }
});

test('every outcome the importer reports has words in the dialog', () => {
  const detail = block(settings, /function sanReportDetail\(report\)[\s\S]*?\n    \}/, 'the report');
  for (const field of ['report.kept', 'report.layouts', 'report.missing', 'report.unknown', 'report.assets']) {
    assert.ok(detail.includes(field), `the report never reads ${field}`);
  }
  for (const code of ['asset-missing', 'asset-rejected', 'installed']) assert.ok(detail.includes(`'${code}'`), `the report never mentions ${code}`);
  assert.match(settings, /detail: sanReportDetail\(res\.report\)/);
});

test('the whole report reaches the log, not just the outcome', () => {
  const log = block(main, /function logSanImport\(source, out\) \{[\s\S]*?\n\}/, 'the import log');
  for (const field of ['report.sanVersion', 'report.layouts', 'report.types', 'report.kept', 'report.unknown', 'report.assets']) {
    assert.ok(log.includes(field), `the log never prints ${field}`);
  }
  const single = block(main, /ipcMain\.handle\('import-san-theme'[\s\S]*?\n\}\);/, 'the .san handler');
  assert.match(single, /logSanImport\(/);
  const setup = block(main, /ipcMain\.handle\('import-san-setup'[\s\S]*?\n\}\);/, 'the settings handler');
  assert.match(setup, /logSanImport\(/);
});

test('exporting a SAN preset carries its origin, its cut-offs and every state sound', () => {
  const exporter = block(main, /ipcMain\.handle\('export-preset'[\s\S]*?\n\}\);/, 'the export handler');
  for (const field of ['origin: previous.origin', 'sanSounds: previous.sanSounds', 'sanThresholds: previous.sanThresholds']) {
    assert.ok(exporter.includes(field), `the export drops ${field}`);
  }
  assert.match(exporter, /extraSounds,/);
  // A preset with no designer options keeps its own sound rather than taking the global one.
  assert.match(exporter, /options \? options\.sound : previous\.sound/);
});

test('a notification from a SAN preset plays the sound of its own state', () => {
  const init = read('electron', 'init.js');
  assert.match(init, /sanEngine\.presetSound\(presetFolder, \{/);
  // The unlock rate reaches the popup page, which picks the state the same way.
  assert.match(init, /unlockRate: data\.unlockRate != null \? data\.unlockRate : data\.rarityPercent/);
  // Installed SAN presets follow the engine they were built with.
  assert.match(init, /sanEngine\.refreshPreset\(/);
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

test('the preview resolves a preset picture rather than showing a broken one', () => {
  /*
    A generated preset names its picture relative to its own stylesheet. The preview is a srcdoc
    document with no preset folder behind it, so the same filename would resolve to nothing and the
    card would preview without the background it was designed around.
  */
  assert.match(settings, /function presetAssetUrl\(name\)/);
  assert.match(settings, /const previewCss = \(values\) => presetGenerator\.buildCustomPresetCss\(values, \{ assetUrl: presetAssetUrl \}\);/);
  assert.match(settings, /buildPresetPreviewHtml\(values, \{ hold, assetUrl: presetAssetUrl, css:/);
  // Cached: the stylesheet is rebuilt on every slider movement, and a wallpaper is not cheap to encode.
  assert.match(settings, /presetImageUris\.has\(name\)/);
});