'use strict';

// Behaviour is covered in test/browser/titleBarKeyboard.browser.test.js; this pins what a browser
// cannot show: the shadow-root stylesheet and the translated names.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { BUNDLED_LOCALE_COUNT } = require('../helpers/locales.js');

const appDir = path.join(__dirname, '..', '..', 'app');
const read = (...parts) => fs.readFileSync(path.join(appDir, ...parts), 'utf8');

test('the title bar shows a focus ring inside its own shadow root', () => {
  const css = read('resources/css/titlebar.css');
  assert.match(css, /ul > li:focus-visible,\s*#start-watchdog:focus-visible \{\s*outline: 2px solid var\(--accent\)/);
});

test('window buttons are named by a translated tooltip in every language', () => {
  const loader = read('locale/loader.js');
  for (const selector of ['#btn-settings', '#btn-minimize', '#btn-maximize', '#btn-close']) {
    assert.ok(loader.includes(`'${selector}'`), `${selector} is never named`);
  }
  assert.match(loader, /button\.setAttribute\('aria-label', clear\(label\)\)/);

  const langDir = path.join(appDir, 'locale', 'lang');
  const files = fs.readdirSync(langDir).filter((file) => file.endsWith('.json'));
  assert.equal(files.length, BUNDLED_LOCALE_COUNT);
  const english = JSON.parse(read('locale/lang/english.json')).windowControls;
  for (const file of files) {
    const labels = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8')).windowControls;
    assert.deepEqual(Object.keys(labels), ['minimize', 'maximize', 'close'], file);
    for (const value of Object.values(labels)) assert.ok(value.trim(), `${file} has an empty window label`);
    if (file !== 'english.json') assert.notDeepEqual(labels, english, `${file} still carries the English labels`);
  }
});
