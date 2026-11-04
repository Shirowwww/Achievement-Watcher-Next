'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const settings = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'resources', 'css', 'app.css'), 'utf8');

test('the Steam library import rows stay in place and grey out instead of vanishing', () => {
  assert.match(settings, /\$\('#steam-library-card'\)\.toggle\(!!s\.connected\);/);
  assert.doesNotMatch(settings, /#steam-library-card'\)\.toggle\([^)]*option_legitSteam/);
  assert.match(settings, /toggleClass\('is-unavailable', !available\)/);
  assert.match(css, /#steam-library-card li\.is-unavailable \.right/);
});

test('the Steam libraries list inside the account card has no filled title bar', () => {
  const rule = css.match(/#settings #steam-connect \.arrow-list > \.title \{([^}]*)\}/);
  assert.ok(rule, 'subheading rule missing');
  assert.match(rule[1], /background: transparent/);
  // The sticky title's blur painted a lighter band even with no background of its own.
  assert.match(rule[1], /backdrop-filter: none/);
});
