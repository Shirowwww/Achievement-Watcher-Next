'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const settings = require(path.join(appDir, 'settings.js'));
const libraryChrome = require(path.join(appDir, 'util', 'libraryChrome.js'));
const libraryLayout = require(path.join(appDir, 'util', 'libraryLayout.js'));
const libraryRefresh = require(path.join(appDir, 'util', 'libraryRefresh.js'));
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const settingsUi = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const localeLoader = fs.readFileSync(path.join(appDir, 'locale', 'loader.js'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

test('the Play button setting defaults on and persists both states', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-play-button-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);

  const log = console.log;
  let config;
  try {
    console.log = () => {};
    config = settings.load();
  } finally {
    console.log = log;
  }

  assert.equal(config.achievement.showPlayButton, true);

  config.achievement.showPlayButton = false;
  await settings.save(config);
  assert.equal(settings.load().achievement.showPlayButton, false);

  config.achievement.showPlayButton = true;
  await settings.save(config);
  assert.equal(settings.load().achievement.showPlayButton, true);
});

test('the row lives in the Library tiles card, not in the General list', () => {
  const document = htmlParser.parse(html);
  const control = document.querySelector('#option_showPlayButton');
  assert.ok(control);
  assert.deepEqual(
    control.querySelectorAll('option').map((option) => option.getAttribute('value')),
    ['true', 'false']
  );

  // Two things depended on where this control sat. The General save sweep reads every <select> in
  // #options-ui into app.config.achievement but applies nothing, which is why turning the button off
  // used to need a restart; the Library tiles card reads its own controls AND applies them.
  const card = document.querySelector('#library-tiles');
  assert.ok(card && card.querySelector('#option_showPlayButton'), 'the row must sit in the Library tiles card');
  assert.ok(!document.querySelector('#options-ui #option_showPlayButton'), 'it must have left the General list');

  const generalSave = settingsUi.slice(settingsUi.indexOf("$('#options-ui .right')"), settingsUi.indexOf('app.config.achievement.thumbnailPortrait'));
  assert.doesNotMatch(generalSave, /option_showPlayButton/);

  assert.match(localeLoader, /#play-button-settings-label/);
  assert.match(localeLoader, /#play-button-settings-help/);
});

test('saving applies the choice to the tiles already on screen, without a rescan', () => {
  // readLibraryChromeUi() covers every TOGGLES key, so OK both stores the value and hands it to
  // applyLibraryChrome. Nothing else in the panel does that, which is the whole point of the move.
  assert.ok(
    libraryChrome.TOGGLES.some((toggle) => toggle.key === 'showPlayButton'),
    'showPlayButton must be one of the tile chrome toggles'
  );
  assert.match(settingsUi, /Object\.assign\(app\.config\.achievement, readLibraryChromeUi\(\)\)/);
  assert.match(settingsUi, /window\.applyLibraryChrome\(app\.config\.achievement\)/);
  assert.match(settingsUi, /for \(const key of LIBRARY_TOGGLES\) chrome\[key\] = /);

  // A rescan would empty the grid and re-run discovery; hiding a button must not cost that.
  const base = { config: { achievement: { showPlayButton: true } } };
  const hidden = { config: { achievement: { showPlayButton: false } } };
  assert.equal(libraryRefresh.needsRescan(libraryRefresh.signature(base), libraryRefresh.signature(hidden)), false);
});

test('disabled hides the shared card control without removing launch functionality', () => {
  assert.deepEqual(libraryChrome.resolve({ showPlayButton: false }).hiddenClasses, ['hide-play-button']);
  assert.deepEqual(libraryChrome.resolve({ showPlayButton: true }).hiddenClasses, []);
  assert.deepEqual(libraryChrome.resolve({}).hiddenClasses, []);

  assert.equal((appSource.match(/class="game-box"/g) || []).length, 1);
  assert.equal((appSource.match(/class="play-button"/g) || []).length, 1);
  assert.match(appSource, /label: t\('launch-game'[\s\S]*?app\.onPlayButtonClick\(self\.find\('\.play-button'\)\)/);
  assert.match(css, /#game-list\.hide-play-button \.play-button \{\s*display: none;\s*\}/);
  assert.match(css, /\.play-button \{[\s\S]*?position: absolute/);
  assert.ok(libraryLayout.MODES.includes('default'), 'the base card view must remain supported');
  for (const mode of libraryLayout.MODES.filter((name) => name !== 'default')) {
    assert.match(css, new RegExp(`#game-list\\.view-${mode}`), `${mode} must keep using the shared card styling`);
  }
});

test('every locale names and explains the Play button setting', () => {
  const localeDir = path.join(appDir, 'locale', 'lang');
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    const playButton = locale.settings?.general?.playButton;
    assert.ok(String(playButton?.name || '').trim(), `${file}: missing Play button setting name`);
    assert.ok(String(playButton?.description || '').trim(), `${file}: missing Play button setting description`);
  }
});
