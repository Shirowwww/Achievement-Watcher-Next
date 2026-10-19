'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSteamClientProcess } = require('../playtime/monitor.js');

test('the Steam overlay a Steam shortcut starts is never taken for a game', () => {
  // Playnite launches through Steam shortcuts, which start the overlay next to every game.
  assert.equal(isSteamClientProcess('gameoverlayui64.exe'), true);
  assert.equal(isSteamClientProcess('GameOverlayUI.exe'), true);
});

test('the other Steam client processes are recognised on Windows and Linux', () => {
  for (const name of ['steam.exe', 'steamwebhelper.exe', 'steamerrorreporter64.exe', 'steamservice.exe', 'steam', 'steamwebhelper', 'gameoverlayui']) {
    assert.equal(isSteamClientProcess(name), true, name);
  }
});

test('a game whose name only starts like a Steam process is still tracked', () => {
  for (const name of ['Hacknet.exe', 'SteamWorld Dig.exe', 'steamworlddig2.exe', 'overlay.exe', '']) {
    assert.equal(isSteamClientProcess(name), false, name);
  }
});
