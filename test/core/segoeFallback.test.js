'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { test } = require('node:test');

const { segoeFallbackCss, insertSegoeFallback, FACES, FONT_DIR } = require(path.join(__dirname, '..', '..', 'app', 'util', 'segoeFallback.js'));

function recorder() {
  const inserted = [];
  return { inserted, webContents: { insertCSS: (css) => (inserted.push(css), Promise.resolve()) } };
}

test('every Selawik face the CSS points at ships with the app, with its licence', () => {
  for (const face of FACES) assert.ok(fs.existsSync(path.join(FONT_DIR, face.file)), face.file);
  assert.match(fs.readFileSync(path.join(FONT_DIR, 'LICENSE'), 'utf8'), /SIL Open Font License, Version 1\.1/);
});

test('the fallback names Segoe UI, keeps an installed Segoe UI first and loads Selawik by file URL', () => {
  const css = segoeFallbackCss();
  assert.equal(css.match(/@font-face/g).length, FACES.length);
  assert.match(css, /font-weight: 600; src: local\('Segoe UI Semibold'\), url\('file:/);
  for (const url of css.match(/file:[^']+/g)) assert.ok(fs.existsSync(fileURLToPath(url)), url);
});

test('Windows keeps its own Segoe UI and gets no fallback', () => {
  const windows = recorder();
  insertSegoeFallback(windows.webContents, { platform: 'win32' });
  assert.equal(windows.inserted.length, 0);

  const linux = recorder();
  insertSegoeFallback(linux.webContents, { platform: 'linux' });
  assert.deepEqual(linux.inserted, [segoeFallbackCss()]);
});
