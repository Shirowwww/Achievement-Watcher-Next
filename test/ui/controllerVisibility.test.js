'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/*
  A single gamepad listener or getGamepads() call anywhere in the main window wakes Chromium's pad
  reading, and an Xbox Wireless Adapter pad then drops on restore (#217). Settings and Help kept
  doing both after controller.js was gated, so every script of app.html goes through its gate.
*/
test('only controller.js touches the Gamepad API in the main window (#217)', () => {
  const view = path.join(__dirname, '..', '..', 'app', 'view');
  const html = fs.readFileSync(path.join(view, 'app.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+\.js)"/g)].map((match) => path.resolve(view, match[1]));
  assert.ok(scripts.length > 10, 'the main window scripts were found');
  const offenders = scripts
    .filter((file) => path.basename(file) !== 'controller.js')
    .filter((file) => /getGamepads|gamepadconnected|gamepaddisconnected/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(view, file));
  assert.deepEqual(offenders, [], 'these read the pads directly instead of window.AWGamepads');
  const controller = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'controller.js'), 'utf8');
  assert.match(controller, /window\.AWGamepads = /, 'controller.js hands the gated reading to the other scripts');
});

test('renderer-side controller polling follows the main tray-window visibility signal', () => {
  const init = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'controller.js'), 'utf8');

  // The handlers also drive the idle renderer release (see backgroundFootprint.test.js), so match
  // the contract - show reports visible, hide reports hidden - rather than a one-line body.
  assert.match(init, /MainWin\.on\('show',[\s\S]{0,200}?sendMainWindowVisibility\(true\)/);
  assert.match(init, /MainWin\.on\('hide',[\s\S]{0,200}?sendMainWindowVisibility\(false\)/);
  assert.match(init, /did-finish-load', \(\) => sendMainWindowVisibility\(MainWin\.isVisible\(\)\)/);
  assert.match(source, /let mainWindowVisible = false;/);
  assert.match(source, /main-window-visibility/);
  assert.ok(
    source.includes("return padConnected && isAppControllerEnabled() && mainWindowVisible && document.visibilityState === 'visible';"),
    'polling stays gated on a connected pad, the tray-window signal and page visibility'
  );
  // No pad, no loop: the rAF poll is what the idle renderer was spending its frames on.
  assert.ok(source.includes("target.addEventListener('gamepadconnected', connected)"), 'the loop starts from the connect event');
  // ...and that event is only listened to while navigation by pad is on (#217).
  assert.match(source, /watching = isAppControllerEnabled\(\);\s*watchGamepads\(watching\);/, 'the pads are watched only with navigation on');
  assert.match(source, /let padConnected = false;/);
  assert.match(source, /isAppControllerEnabled\(\)/);
  assert.match(source, /controller-settings-changed/);
  assert.match(source, /appNavigation/);
  assert.match(source, /if \(pollFrame !== null\) cancelAnimationFrame\(pollFrame\);/);
  assert.match(source, /if \(pollFrame !== null \|\| !canPoll\(\)\) return;/);
});
