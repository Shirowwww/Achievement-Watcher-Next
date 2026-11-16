'use strict';

// A release that loads GBE's steamclient through version.dll keeps Valve's steam_api untouched, so
// that dll's date says nothing about when the emulator was put in place (#167 follow-up).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { setupFiles, deriveHealth, LEVEL } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

test('the proxy-loaded runtime and its loader count as the emulator setup files', () => {
  const files = setupFiles(['D:/g/Engine/Steamv157/Win64/steam_api64.dll'], [
    { runtime: 'D:/g/Bin/steamclient64.dll', loadedBy: 'D:/g/Bin/version.dll' },
    { runtime: 'D:/g/Bin2/steamclient64.dll', loadedBy: null },
  ]);
  assert.deepEqual(files, [
    'D:/g/Engine/Steamv157/Win64/steam_api64.dll',
    'D:/g/Bin/steamclient64.dll',
    'D:/g/Bin/version.dll',
    'D:/g/Bin2/steamclient64.dll',
  ]);
  assert.deepEqual(setupFiles(undefined, undefined), []);
});

test('a proxied setup not played since it was put in place is not flagged', () => {
  const setupAt = 1790000000000;
  const report = deriveHealth({
    installed: true,
    gameDirExists: true,
    exeExists: true,
    emulated: true,
    achievements: { total: 54, unlocked: 0 },
    playtime: { total: 600, lastPlayed: Math.floor(setupAt / 1000) - 3600 },
    goldberg: {
      steamSettings: 'D:/g/Bin/steam_settings',
      dllCount: 0,
      proxiedRuntimes: [{ runtime: 'D:/g/Bin/steamclient64.dll', loadedBy: 'D:/g/Bin/version.dll' }],
      issues: [],
      setupAt,
      save: { exists: false, seeded: false, earned: 0 },
    },
  });
  assert.equal(report.checks.find((c) => c.id === 'progress').level, LEVEL.INFO);
});

test('the panel dates the setup from those files, not from steam_api alone', () => {
  const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'gameHealthPanel.js'), 'utf8');
  assert.match(panel, /gameHealth\.setupFiles\(emu\.dll, report\.proxiedRuntimes\)/);
});
