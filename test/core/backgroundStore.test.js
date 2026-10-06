'use strict';

/*
  Per-game background overrides for the achievement page (issue #105 follow-up). Same machinery as
  the cover and icon stores, so what is checked is its own identity and its wiring into the page.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const appRoot = path.join(__dirname, '..', '..', 'app');
const backgroundStore = require(path.join(appRoot, 'util', 'backgroundStore.js'));
const coverStore = require(path.join(appRoot, 'util', 'coverStore.js'));

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-background-'));
backgroundStore.setStoreFile(path.join(root, 'cfg', 'backgrounds.db'));

test('the background store has its own cfg file', () => {
  assert.equal(path.basename(backgroundStore.defaultFile()), 'backgrounds.db');
  assert.equal(path.basename(coverStore.defaultFile()), 'covers.db');
});

test('a picked local image is copied into backgrounds/ and can be reset', () => {
  const source = path.join(root, 'hero.png');
  fs.writeFileSync(source, PNG);
  const stored = backgroundStore.persist('193864', pathToFileURL(source).href, root);
  assert.ok(stored.includes('/backgrounds/'), `expected a durable backgrounds/ copy, got ${stored}`);
  assert.equal(backgroundStore.get('193864'), stored);
  assert.equal(backgroundStore.isUsable(stored), true);
  backgroundStore.remove('193864');
  assert.equal(backgroundStore.get('193864'), null);
});

test('the achievement page paints a chosen background before the game artwork', () => {
  const app = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
  assert.match(app, /const customBackground = backgroundOverrideFor\(game\.appid\)/);
  const page = app.slice(app.indexOf('const customBackground = backgroundOverrideFor(game.appid)'));
  assert.match(page.slice(0, 600), /if \(customBackground \|\| game\.img\.background\)/);
});

test('the cover menu offers to choose and reset the background', () => {
  const app = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
  assert.match(app, /t\('choose-background-image'/);
  assert.match(app, /t\('reset-background-to-default'/);
  assert.match(app, /backgroundStore\.persist\(appid, pathToFileURL\(files\[0\]\)\.href, getUserDataPath\(\)\)/);
  const english = JSON.parse(fs.readFileSync(path.join(appRoot, 'locale', 'lang', 'english.json'), 'utf8'));
  for (const key of ['choose-background-image', 'reset-background-to-default', 'could-not-set-background']) {
    assert.ok(Object.values(english).some((section) => section && typeof section === 'object' && section[key]), `english.json lacks ${key}`);
  }
});
