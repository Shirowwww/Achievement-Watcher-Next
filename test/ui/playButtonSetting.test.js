'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const settings = require(path.join(appDir, 'settings.js'));
const libraryLayout = require(path.join(appDir, 'util', 'libraryLayout.js'));
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

test('the General setting uses the existing achievement settings plumbing', () => {
  const document = htmlParser.parse(html);
  const control = document.querySelector('#option_showPlayButton');
  assert.ok(control);
  assert.deepEqual(
    control.querySelectorAll('option').map((option) => option.getAttribute('value')),
    ['true', 'false']
  );
  assert.match(settingsUi, /for \(let option in app\.config\.achievement\)/);

  const generalSave = settingsUi.slice(settingsUi.indexOf("$('#options-ui .right')"), settingsUi.indexOf('app.config.achievement.thumbnailPortrait'));
  assert.match(generalSave, /id\.replace\('option_', ''\)/);
  assert.doesNotMatch(generalSave, /option_showPlayButton/);

  assert.match(localeLoader, /#play-button-settings-label/);
  assert.match(localeLoader, /#play-button-settings-help/);
  assert.match(localeLoader, /#option_showPlayButton option\[value='true'\][\s\S]*?settings\.common\.show/);
  assert.match(localeLoader, /#option_showPlayButton option\[value='false'\][\s\S]*?settings\.common\.hide/);
});

test('disabled hides the shared card control without removing launch functionality', () => {
  const helper = appSource.match(/function applyPlayButtonVisibility\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'the renderer visibility helper must exist');

  const toggles = [];
  const context = {
    $: (selector) => {
      assert.equal(selector, '#game-list');
      return {
        toggleClass(name, state) {
          toggles.push({ name, state });
        },
      };
    },
  };
  vm.runInNewContext(`${helper}\nresult = [applyPlayButtonVisibility(false), applyPlayButtonVisibility(true), applyPlayButtonVisibility()];`, context);

  assert.deepEqual(Array.from(context.result), [false, true, true]);
  assert.deepEqual(toggles, [
    { name: 'hide-play-button', state: true },
    { name: 'hide-play-button', state: false },
    { name: 'hide-play-button', state: false },
  ]);
  assert.match(appSource, /applyPlayButtonVisibility\(self\.config\.achievement\.showPlayButton\)/);
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
