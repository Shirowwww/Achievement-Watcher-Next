'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const init = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');

test('a real popup on Linux is an X11 notification window, so Hyprland and wlroots leave the keyboard to the game', () => {
  // Those compositors focus an unmanaged X11 window when it maps unless its _NET_WM_WINDOW_TYPE says
  // notification: a native Wayland game then lost its keys for as long as the popup showed.
  // Game Mode keeps the plain type: gamescope's popup was proven without it.
  assert.match(init, /type: process\.platform === 'linux' && !reposition && !gamescope\(\)\.isActive\(\) \? 'notification' : undefined/);
});
