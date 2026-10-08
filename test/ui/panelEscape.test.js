'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const { panelToClose } = require(path.join(appDir, 'util', 'panelEscape.js'));

test('Escape closes the panel that is on top', () => {
  assert.equal(panelToClose({ settingsOpen: true }), 'settings');
  assert.equal(panelToClose({ gameConfigOpen: true }), 'game-config');
  assert.equal(panelToClose({ settingsOpen: true, gameConfigOpen: true }), 'game-config', 'the game configuration opens over Settings');
  assert.equal(panelToClose({}), null);
  assert.equal(panelToClose(), null);
});

test('Escape belongs to whatever has its own use for it', () => {
  for (const busy of ['onboardingOpen', 'promptOpen', 'recordingHotkey']) {
    assert.equal(panelToClose({ settingsOpen: true, gameConfigOpen: true, [busy]: true }), null, busy);
  }
});

test('Settings wires Escape, focus entry, focus return and the focus trap', () => {
  const source = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
  assert.match(source, /keydown\.panelEscape[\s\S]*?event\.defaultPrevented/);
  assert.match(source, /recordingHotkey: listeningHotkey/);
  assert.match(source, /css\('pointer-events'\) !== 'none'\) cancel\.trigger\('click'\)/, 'a second Escape must not restart the fade-out');
  assert.match(source, /focusBeforeSettings = deepActiveElement\(\)/);
  assert.match(source, /if \(back && back\.isConnected\) back\.focus\(/);
  assert.match(source, /document\.addEventListener\('focusin'[\s\S]*?focusTrapTarget\(/);
  assert.match(source, /entry\.focus\(\{ preventScroll: true \}\)/);
});

test('the game configuration takes focus on open and gives it back on close', () => {
  const { rendererSource } = require('../helpers/rendererSource');
  const source = rendererSource();
  assert.match(source, /gameConfigFocusReturn = document\.activeElement;\s*\$\('#game-config-tabs button\.active'\)\[0\]\?\.focus\(/);
  assert.match(source, /fadeOut\(\(\) => \{\s*\$\('#game-config'\)\.hide\(\);[\s\S]*?gameConfigFocusReturn\.focus\(/);
});

test('a search field keeps Escape only while it has text to clear', () => {
  const settings = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
  const help = fs.readFileSync(path.join(appDir, 'ui', 'help.js'), 'utf8');
  assert.match(settings, /settings-search-input'\)\.on\('keydown', function \(e\) \{[^}]*e\.key === 'Escape' && \$\(this\)\.val\(\)/);
  assert.match(help, /event\.key !== 'Escape' \|\| !\$\(this\)\.val\(\)\) return;\s*event\.stopPropagation\(\)/);
});
