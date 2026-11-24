'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const init = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');

// The overlay window is hidden and shown again between opens. A borderless game that made itself
// topmost after the last open stays above a window shown again in place, so the overlay opened behind
// the game (measured with Electron 45: showInactive alone left it under, moveTop put it back on top).
test('the overlay is raised above the game each time it is shown', () => {
  const body = /function showOverlayAfterLoad\(info\) \{([\s\S]*?)\n\}/.exec(init);
  assert.ok(body, 'showOverlayAfterLoad not found');
  const show = body[1].lastIndexOf('showInactive()');
  const raise = body[1].indexOf('overlayWindow.moveTop()');
  assert.ok(show > 0, 'the overlay is no longer shown inactively');
  assert.ok(raise > show, 'the overlay is not raised after it is shown');
});
