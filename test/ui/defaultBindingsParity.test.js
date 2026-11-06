'use strict';

/*
  app/settings.js owns the default hotkey and controller bindings. Two places cannot require it and
  keep a copy: ui/help.js (loaded without require, also in the browser tests) and the overlay's
  page script (a sandboxed window). A default changed in one place only would make Help describe,
  or the overlay fall back to, a combination the app does not use.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const settings = require('../../app/settings.js');
const help = require('../../app/ui/help.js');

test('Help describes the same default hotkey and bindings the settings apply', () => {
  assert.equal(help.DEFAULT_HOTKEY, settings.DEFAULT_HOTKEY);
  assert.equal(help.DEFAULT_TOGGLE, settings.DEFAULT_CONTROLLER_BINDINGS.toggleBinding);
  assert.equal(help.DEFAULT_UI_MODE, settings.DEFAULT_CONTROLLER_BINDINGS.uiModeBinding);
  assert.equal(help.DEFAULT_MOVE, settings.DEFAULT_CONTROLLER_BINDINGS.controlModeBinding);
});

test('the overlay falls back to the same bindings the settings apply', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'overlay.js'), 'utf8');
  const block = /const DEFAULT_CONTROLLER_BINDINGS = (\{[\s\S]*?\});/.exec(source);
  assert.ok(block, 'overlay.js no longer declares its fallback bindings');
  const fallback = new Function(`return ${block[1]};`)();
  assert.equal(fallback.toggle.join('+'), settings.DEFAULT_CONTROLLER_BINDINGS.toggleBinding);
  assert.equal(fallback.ui.join('+'), settings.DEFAULT_CONTROLLER_BINDINGS.uiModeBinding);
  assert.equal(fallback.move.join('+'), settings.DEFAULT_CONTROLLER_BINDINGS.controlModeBinding);
});
