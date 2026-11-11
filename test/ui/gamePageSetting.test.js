'use strict';

// Issue #183: the game page can be turned off in Settings, so a game opens straight on its list.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const settings = require(path.join(appDir, 'settings.js'));
const read = (...parts) => fs.readFileSync(path.join(appDir, ...parts), 'utf8');

function quietLoad() {
  const log = console.log;
  try {
    console.log = () => {};
    return settings.load();
  } finally {
    console.log = log;
  }
}

test('the game page is on by default, and turning it off persists', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-game-page-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);

  const config = quietLoad();
  assert.equal(config.achievement.libraryGamePage, true);
  config.achievement.libraryGamePage = false;
  await settings.save(config);
  assert.equal(quietLoad().achievement.libraryGamePage, false);
});

test('a value that is not a boolean reads as on', () => {
  const config = settings.normalize({ achievement: { libraryGamePage: 'nope' } });
  assert.equal(config.achievement.libraryGamePage, true);
});

test('the Settings row offers Enable first and is translated by its own ids', () => {
  const root = htmlParser.parse(read('view', 'app.html'));
  const select = root.querySelector('#option_libraryGamePage');
  assert.ok(select, 'the row exists');
  assert.deepEqual(
    select.querySelectorAll('option').map((option) => option.getAttribute('value')),
    ['true', 'false']
  );
  assert.ok(root.querySelector('#library-gamepage-label') && root.querySelector('#library-gamepage-help'));
  assert.match(read('locale', 'loader.js'), /\['#library-gamepage-label', '#library-gamepage-help', '#option_libraryGamePage', lib\.gamePage, 'enable', 'disable'\]/);

  const ui = read('ui', 'settings.js');
  assert.match(ui, /\$\('#option_libraryGamePage'\)\.val\(String\(settings\.libraryGamePage !== false\)\)/);
  assert.match(ui, /app\.config\.achievement\.libraryGamePage = \$\('#option_libraryGamePage'\)\.val\(\) !== 'false';/);
});

test('with the page off, a game opens on its list and the list leads back to the library', () => {
  const app = read('app.js');
  const body = app.slice(app.indexOf('function showGameOverview('), app.indexOf('function updateGamePage('));
  assert.match(body, /const pageOff = app\.config\?\.achievement\?\.libraryGamePage === false;/);
  assert.match(body, /if \(pageOff\) \{\s*window\.GameOverview\.reset\(\);\s*setGameView\('list', \{ animate: false \}\);\s*return;/);
  // The trophy request is consumed even when the page is off, so it never fires on a later game.
  assert.ok(body.indexOf('takeListOpen(game.appid)') < body.indexOf('if (pageOff)'));

  const css = read('resources', 'css', 'app.css');
  assert.match(css, /#achievement\[data-overview='off'\] #btn-overview,/);
  assert.match(css, /#achievement\[data-view='list'\]:not\(\[data-overview='off'\]\) #btn-previous \{/);
  // The mouse Back button follows whichever back button is on screen.
  assert.match(read('ui', 'game.js'), /\$\(\$\('#btn-overview'\)\.is\(':visible'\) \? '#btn-overview' : '#btn-previous'\)\.trigger\('click'\);/);
});
