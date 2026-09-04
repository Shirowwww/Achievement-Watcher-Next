'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));

const html = fs.readFileSync(path.join(appDir, 'view/app.html'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'resources/css/app.css'), 'utf8');
const appJs = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const loader = fs.readFileSync(path.join(appDir, 'locale/loader.js'), 'utf8');
const document = htmlParser.parse(html);

test('the details button is a sibling of the profile stat list, never a fourth item in it', () => {
  const items = document.querySelectorAll('#user-info .info .stats ul li');
  assert.equal(items.length, 3, 'locale/loader.js addresses these three by nth-child');
  // The loader's own selectors are the contract this protects.
  assert.match(loader, /#user-info \.info \.stats/);
  assert.match(loader, /li:nth-child\(3\) span:eq\(1\)/);

  const button = document.querySelector('#user-info .info .stats > #profile-stats-open');
  assert.ok(button, 'the button must sit beside the list, inside .stats');
  assert.equal(document.querySelectorAll('#user-info .info .stats ul #profile-stats-open').length, 0);
});

test('the panel is a simple-modal, so it clears the draggable title bar like the others', () => {
  const panel = document.querySelector('#profile-stats');
  assert.ok(panel);
  assert.match(panel.getAttribute('class') || '', /\bsimple-modal\b/);
  assert.equal(panel.getAttribute('aria-hidden'), 'true');
  assert.ok(panel.querySelector('.overlay'), 'the click-to-close backdrop');
  assert.equal(panel.querySelector('.box').getAttribute('role'), 'dialog');
  assert.match(css, /\.simple-modal \{[^}]*inset: 30px 0 0;/);
});

test('every field the renderer writes into exists in the markup', () => {
  const ids = [...appJs.matchAll(/\$\('(#profile-stats[^']*)'\)/g)].map((match) => match[1]);
  assert.ok(ids.length > 10, 'the panel renderer should address more than a handful of nodes');

  for (const selector of new Set(ids)) {
    for (const part of selector.split(',').map((value) => value.trim())) {
      assert.ok(document.querySelector(part), `${part} is written to but missing from app.html`);
    }
  }
});

test('the platform table can scroll on its own so the panel never scrolls sideways', () => {
  assert.match(css, /\.profile-stats-table-wrap \{[^}]*overflow-x: auto;/);
  assert.ok(document.querySelector('#profile-stats .profile-stats-table-wrap .profile-stats-table tbody'));
});

test('the completion dial is driven by one custom property, not by inline geometry', () => {
  const ring = document.querySelector('#profile-stats-ring');
  assert.match(ring.getAttribute('style') || '', /--value:\s*0/);
  assert.match(css, /\.profile-stats-ring::before \{[^}]*conic-gradient\(var\(--accent\) calc\(var\(--value\) \* 1%\)/);
  // Masked, not covered by an opaque disc: the panel's own background is translucent.
  assert.match(css, /\.profile-stats-ring::before \{[^}]*\n\s*mask: radial-gradient\(farthest-side/);
  assert.match(appJs, /\$\('#profile-stats-ring'\)\.css\('--value', overall\)/);
});

test('the panel closes on its backdrop, its button and Escape', () => {
  assert.match(appJs, /\$\('#profile-stats-close, #profile-stats > \.overlay'\)\.on\('click', closeProfileStats\)/);
  assert.match(appJs, /event\.key === 'Escape' && \$\('#profile-stats'\)\.attr\('aria-hidden'\) === 'false'/);
});

test('no full-viewport overlay covers the only draggable surface in the window', () => {
  // A modal pinned at inset: 0 hides the title bar, and with it the window's only
  // -webkit-app-region: drag area, so the app cannot be moved while it is open.
  for (const [, block] of css.matchAll(/(#onboarding|\.simple-modal|\.aw-prompt-overlay) \{([^}]*)\}/g)) {
    if (!/position: fixed/.test(block)) continue;
    assert.doesNotMatch(block, /inset: 0;/, 'a fixed modal must start below the 30px title bar');
    assert.match(block, /inset: 30px 0 0;/);
  }
});
