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
  const close = collections.match(/function closeFilterMenu[\s\S]*?\n {2}\}\n/)?.[0] || '';
  assert.match(open, /attr\('aria-expanded', 'true'\)/);
  assert.match(close, /attr\('aria-expanded', 'false'\)/);
  // Every way out goes through the one close: a click elsewhere, Escape, a pick, a resize.
  assert.match(open, /mousedown\.collectionMenu[\s\S]*closeFilterMenu\(\)/);
  assert.match(open, /e\.key === 'Escape'[\s\S]*closeFilterMenu\(/);
  assert.match(open, /resize\.collectionMenu', \(\) => closeFilterMenu\(\)/);
});

// The menu is drawn in the page like the dropdown lists, not as a native OS menu.
test('the collections filter menu is an in-page panel styled like the dropdowns', () => {
  const open = collections.match(/function openFilterMenu[\s\S]*?\n {2}\}\n/)?.[0] || '';
  assert.match(open, /class="select-menu collection-menu" role="menu"/);
  assert.doesNotMatch(open, /menu\.popup\(/);
});
