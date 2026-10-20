'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const { prefixFolder } = require(path.join(__dirname, '..', '..', 'app', 'util', 'prefixFolder.js'));

test('a Folders tab variable reads as the folder it is inside a prefix', () => {
  assert.equal(prefixFolder('%appdata%'), 'AppData/Roaming');
  assert.equal(prefixFolder('%localappdata%'), 'AppData/Local');
  assert.equal(prefixFolder('%PUBLIC%'), 'Public');
  assert.equal(prefixFolder('%ProgramData%'), 'ProgramData');
  assert.equal(prefixFolder('%DOCUMENTS%'), 'Documents');
});

test('anything else is not a prefix folder', () => {
  assert.equal(prefixFolder('~/.local/share'), null);
  assert.equal(prefixFolder('%TEMP%'), null);
  assert.equal(prefixFolder('%constructor%'), null);
  assert.equal(prefixFolder(''), null);
  assert.equal(prefixFolder(undefined), null);
});

test('every variable the Folders tab lists has a prefix folder', () => {
  const html = require('node:fs').readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'app.html'), 'utf8');
  const start = html.indexOf('<ul id="defaultdir">');
  // The list closes the Folders tab, so it runs to the end of its section.
  const list = html.slice(start, html.indexOf('</section>', start));
  const variables = [...list.matchAll(/<span class="constant">(%[^<]+%)<\/span>/g)].map((m) => m[1]);
  assert.ok(variables.length > 10);
  assert.deepEqual(variables.filter((v) => !prefixFolder(v)), []);
});
