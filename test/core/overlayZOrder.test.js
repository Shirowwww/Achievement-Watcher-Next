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

// A new overlay window (every open after five idle minutes, so most opens in a game) was shown by its
// constructor: activated over the game, holding its keyboard, then pushed off with blur(). It now
// stays hidden until showOverlayAfterLoad shows it inactive and raises it, like a reused window.
test('a new overlay window is shown by the same path as a reused one', () => {
  const create = /async function createOverlayWindow\(info\) \{([\s\S]*?)\n\}/.exec(init);
  assert.ok(create, 'createOverlayWindow not found');
  const options = /overlayWindow = new BrowserWindow\(\{([\s\S]*?)\n {4}\}\);/.exec(create[1]);
  assert.ok(options, 'the overlay BrowserWindow options were not found');
  assert.match(options[1], /\n\s*show: false,/, 'a new overlay window is shown before it is loaded and raised');
  assert.doesNotMatch(create[1], /overlayWindow\.blur\(\)/, 'a new overlay window still hands the foreground on with blur()');
  assert.match(create[1], /'did-finish-load', \(\) => \{\s*\n\s*showOverlayAfterLoad\(info\);/, 'a new overlay window is never shown');
  assert.match(create[1], /overlayWindow\.removeMenu\(\)/, 'the default menu can close the overlay with Ctrl+W');
});

test('each open logs what sits above the overlay, and an outside close is told apart', () => {
  const body = /function showOverlayAfterLoad\(info\) \{([\s\S]*?)\n\}/.exec(init);
  assert.match(body[1], /logOverlayShown\(\);/, 'an open leaves no trace of where the overlay ended up');
  assert.match(init, /overlayWindow\.on\('close', \(\) => \{\s*\n\s*if \(!app\.isQuiting\) debug\.log\('\[overlay\] window closed from outside the app/);
});

test('the z-order probe names the windows above the overlay and the foreground one', () => {
  const { createZOrderProbe } = require('../../app/util/overlayZOrder.js');
  // The overlay (1) sits under a hidden window (3) and a topmost game (2) that has the foreground.
  const windows = {
    1: { prev: 3, cls: 'Chrome_WidgetWin_1', topmost: true, visible: true },
    3: { prev: 2, cls: 'Hidden', topmost: false, visible: false },
    2: { prev: 0, cls: 'UnityWndClass', topmost: true, visible: true },
  };
  const api = {
    GetWindow: (h) => windows[h].prev,
    IsWindowVisible: (h) => windows[h].visible,
    GetClassNameW: (h, buf) => {
      const name = windows[h].cls;
      for (let i = 0; i < name.length; i += 1) buf[i] = name.charCodeAt(i);
      return name.length;
    },
    GetWindowLongPtrW: (h) => (windows[h].topmost ? 0x8 : 0),
    GetForegroundWindow: () => 2,
  };
  const text = createZOrderProbe({ api })(1);
  assert.equal(text, 'overlay topmost; above it: UnityWndClass [topmost]; foreground: UnityWndClass [topmost] (ABOVE the overlay)');
});

// Seen 26/11: Windows keeps cloaked shell windows (CoreWindow, ImmersiveShell) above everything; they
// hid nothing, yet the line said fifteen windows covered the overlay.
test('the z-order probe leaves out cloaked windows and windows clear of the overlay', () => {
  const { createZOrderProbe } = require('../../app/util/overlayZOrder.js');
  const windows = {
    1: { prev: 4, cls: 'Chrome_WidgetWin_1', rect: [100, 0, 500, 600] },
    4: { prev: 5, cls: 'Windows.UI.Core.CoreWindow', rect: [0, 0, 2560, 1440], cloaked: true },
    5: { prev: 6, cls: 'Elsewhere', rect: [600, 0, 900, 300] },
    6: { prev: 2, cls: 'Empty', rect: [0, 0, 0, 0] },
    2: { prev: 0, cls: 'UnrealWindow', rect: [0, 0, 2560, 1440] },
  };
  const api = {
    GetWindow: (h) => windows[h].prev,
    IsWindowVisible: () => true,
    GetClassNameW: (h, buf) => {
      const name = windows[h].cls;
      for (let i = 0; i < name.length; i += 1) buf[i] = name.charCodeAt(i);
      return name.length;
    },
    GetWindowLongPtrW: () => 0x8,
    GetForegroundWindow: () => 2,
    GetWindowRect: (h, rect) => {
      [rect.left, rect.top, rect.right, rect.bottom] = windows[h].rect;
      return true;
    },
    DwmGetWindowAttribute: (h, attribute, out) => {
      out[0] = windows[h].cloaked ? 1 : 0;
      return 0;
    },
  };
  const text = createZOrderProbe({ api })(1);
  assert.equal(text, 'overlay topmost; above it: UnrealWindow [topmost]; foreground: UnrealWindow [topmost] (ABOVE the overlay)');
});

test('the z-order probe answers null rather than throw', () => {
  const { createZOrderProbe } = require('../../app/util/overlayZOrder.js');
  const broken = {
    GetForegroundWindow: () => {
      throw new Error('no user32');
    },
  };
  assert.equal(createZOrderProbe({ api: broken })(1), null);
});
