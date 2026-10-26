'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The whole page is `user-select: none`; players copy an achievement's name to look up how to unlock
// it, so the name and description opt back in, while a masked (spoiler) description stays out.
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'resources', 'css', 'app.css'), 'utf8');

test('achievement names and descriptions can be selected and copied', () => {
  assert.match(css, /\.achievement \.content \.title,\s*\.achievement \.content \.description \{\s*user-select: text;/);
});

test('a masked description stays unselectable', () => {
  assert.match(css, /\.achievement \.content \.description\.masked-desc \{[^}]*user-select: none;/);
});
