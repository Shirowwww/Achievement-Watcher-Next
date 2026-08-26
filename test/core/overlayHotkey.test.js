'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const init = fs.readFileSync(path.join(root, 'app', 'electron', 'init.js'), 'utf8');
const watchdog = fs.readFileSync(path.join(root, 'watchdog', 'watchdog.js'), 'utf8');

// The overlay shortcut moved from a PowerShell helper the Watchdog kept alive all session (~92 MB for
// one RegisterHotKey call) to the main process's Electron globalShortcut. These guard the split: a
// shortcut nobody forwards, or a handler nobody triggers, is a hotkey that silently does nothing.

test('the main process owns the shortcut and forwards the press', () => {
  assert.match(init, /globalShortcut\.register\(accelerator,/, 'the shortcut is not registered by the app');
  assert.match(init, /monitorProc\.send\(\{ overlayHotkeyPressed: true \}\)/, 'the press is never forwarded to the Watchdog');
  assert.match(init, /msg\.registerOverlayHotkey\) registerOverlayHotkey\(msg\.registerOverlayHotkey\.hotkey\)/, 'the app never takes the requested hotkey');
  // A shortcut still held after quit is denied to every other application until reboot.
  assert.match(init, /unregisterOverlayHotkey\(\);\s*\n\s*if \(monitorProc\)/, 'the shortcut is not handed back on quit');
});

test('the Watchdog asks for the shortcut and reacts to the press', () => {
  assert.match(watchdog, /process\.send\(\{ registerOverlayHotkey: \{ hotkey \} \}\)/, 'the Watchdog never asks for a hotkey');
  assert.match(
    watchdog,
    /if \(msg\.overlayHotkeyPressed === true\) \{\s*\n\s*toggleOverlayForRunningGame\(\);/,
    'a forwarded press does not toggle the overlay'
  );
});

test('the controller reaches the overlay through the same toggle as the keyboard', () => {
  // The controller path predates the hotkey move and must stay independent of it: its "open" carries
  // fromController, which is what gates the send-Escape-to-the-game option.
  assert.match(watchdog, /case 'overlay\.toggle':\s*\n\s*toggleOverlayForRunningGame\(true\);/, 'the controller no longer toggles the overlay');
  assert.match(watchdog, /function toggleOverlayForRunningGame\(fromController = false\)/, 'the shared toggle changed shape');
});

test('no PowerShell helper is left holding the shortcut', () => {
  assert.ok(!fs.existsSync(path.join(root, 'watchdog', 'util', 'registerHotkey.ps1')), 'the PowerShell helper is back');
  assert.ok(!fs.existsSync(path.join(root, 'watchdog', 'util', 'globalHotkey.js')), 'the helper wrapper is back');
  assert.ok(!/globalHotkey/.test(watchdog), 'the Watchdog still loads the helper');
});
