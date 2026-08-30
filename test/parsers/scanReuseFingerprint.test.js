'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

/*
  What the library reuse rests on. A stored library is only served in place of a scan while every
  folder and unlock file it was built from still reads the same, so the two things worth pinning are
  which files that covers and that a reused library leaves the background poll the baseline a real
  scan would have left it.
*/

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, send: () => {}, invoke: async () => '' } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'));
const { achievementDataFiles } = achievements._internal;

test('a save folder or file a game is read from is part of what the reuse checks', () => {
  const files = achievementDataFiles([
    { appid: '480', data: { type: 'file', path: 'C:/saves/480/achievements.json' } },
    { appid: '20', data: { type: 'directory', path: 'C:/saves/20' } },
  ]);

  assert.deepEqual(files, ['C:/saves/480/achievements.json', 'C:/saves/20']);
});

test('a legit Steam game is covered by the stats file Steam rewrites when it unlocks', () => {
  const files = achievementDataFiles([
    { appid: '730', data: { type: 'steamAPI', cachePath: 'C:/Steam/appcache/stats', userID: { user: '12345', name: 'Player' } } },
  ]);

  assert.deepEqual(files, [path.join('C:/Steam/appcache/stats', 'UserGameStats_12345_730.bin')]);
});

test('a game merged from several sources contributes every source it was read from', () => {
  const files = achievementDataFiles([
    {
      appid: '480',
      data: { type: 'file', path: 'C:/gse/480/achievements.json' },
      _sources: [
        { appid: '480', data: { type: 'file', path: 'C:/gse/480/achievements.json' } },
        { appid: '480', data: { type: 'directory', path: 'C:/uplay/480' } },
      ],
    },
  ]);

  assert.deepEqual(files, ['C:/gse/480/achievements.json', 'C:/uplay/480']);
});

test('a source with nothing on disk behind it contributes nothing to check', () => {
  const files = achievementDataFiles([
    { appid: 'x', data: { type: 'xboxPc', title: 'Halo' } },
    { appid: 'y', data: { type: 'ubisoftOfficial' } },
    { appid: 'z' },
    null,
  ]);

  assert.deepEqual(files, []);
});

test('a restored fingerprint gives the background poll the folders it compares against', () => {
  achievements.forgetInstallScanCache();
  assert.equal(achievements.discoveryInputsUnchanged(), false);

  const restored = achievements.restoreScanFingerprint({
    dirs: [[__dirname, fs.statSync(__dirname).mtimeMs]],
    files: [],
  });

  assert.equal(restored, true);
  assert.equal(achievements.discoveryInputsUnchanged(), true);
  assert.equal(achievements.scanInputsUnchanged(achievements.getScanFingerprint()), true);
});

test('a fingerprint with no folders is refused rather than believed', () => {
  achievements.forgetInstallScanCache();
  assert.equal(achievements.restoreScanFingerprint({ dirs: [], files: [] }), false);
  assert.equal(achievements.restoreScanFingerprint(null), false);
  assert.equal(achievements.getScanFingerprint(), null);
  assert.equal(achievements.scanInputsUnchanged(null), false);
});
