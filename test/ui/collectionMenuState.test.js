'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const collections = fs.readFileSync(path.join(appDir, 'ui', 'collections.js'), 'utf8');

// The collections button opens a menu (aria-haspopup), so it must also say whether that menu is open.
test('the collections button starts with its menu reported closed', () => {
  assert.match(html, /class="collection-filter"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
});

test('the collections button reports its menu open, and closed again when the menu goes away', () => {
  const open = collections.match(/function openFilterMenu[\s\S]*?\n {2}\}\n/)?.[0] || '';
  assert.match(open, /attr\('aria-expanded', 'true'\)/);
  assert.match(open, /callback: \(\) => [^\n]*attr\('aria-expanded', 'false'\)/);
});
