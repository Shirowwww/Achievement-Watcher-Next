'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const htmlParser = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'node-html-parser'));

// Which Settings rows each system offers. A row is hidden, never removed (nth-child locale bindings).
const appDir = path.join(__dirname, '..', '..', 'app');
const root = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

const rowOf = (id) => {
  const control = root.querySelector(`#${id}`);
  assert.ok(control, `#${id} exists`);
  return control.closest('li');
};

test('settings that only act on Windows are marked Windows-only', () => {
  const windowsOnly = [
    'option_groupToast', // Action Center grouping
    'option_souvenirHdr', // Windows HDR colour correction
    'option_clipAudio', // both Linux recorders take the whole PC's sound
    'option_controllerSendEscape', // keybd_event, user32
    'option_controllerBackend', // XInput or GameInput
    'option_xboxPc',
  ];
  for (const id of windowsOnly) assert.ok(rowOf(id).hasAttribute('data-windows-only'), id);
});

test('settings that work on both systems are not marked', () => {
  for (const id of ['option_steamlessAutoUnpack', 'option_steamlessExperimental', 'option_apiCheckBypass', 'option_urgent', 'option_rumble']) {
    const row = rowOf(id);
    assert.ok(!row.hasAttribute('data-windows-only') && !row.hasAttribute('data-linux-only'), id);
  }
});

test('the Folders tab lists the native Linux emulator folders on Linux only', () => {
  const linuxRows = root.querySelectorAll('#defaultdir > li[data-linux-only]').map((li) => li.querySelector('.path').text);
  assert.deepEqual(linuxRows, ['~/.local/share/GSE Saves', '~/.local/share/Goldberg SteamEmu Saves']);
});

test('the stylesheet hides each system the other one only', () => {
  assert.match(css, /html:not\(\[data-platform='win32'\]\) \[data-windows-only\]/);
  assert.match(css, /html:not\(\[data-platform='linux'\]\) \[data-linux-only\]/);
});

test('each Linux clip recorder shows only the controls it reads', () => {
  assert.equal(rowOf('option_clipCodec').getAttribute('data-clip-engine-only'), 'gpu');
  assert.equal(rowOf('option_clipResolution').getAttribute('data-clip-engine-only'), 'software');
  assert.match(css, /\[data-clip-engine='gpu'\] > li\[data-clip-engine-only='software'\]/);
  assert.match(css, /\[data-clip-engine='software'\] > li\[data-clip-engine-only='gpu'\]/);
});
