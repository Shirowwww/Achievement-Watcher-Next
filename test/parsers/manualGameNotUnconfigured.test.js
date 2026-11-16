'use strict';

/*
  Seen on screen (2026-11-16): a folder added by hand with "Add game manually" stayed in the library
  a second time, as the unconfigured install the scan had found before. The folders the unconfigured
  scan leaves alone came from exeList only (games with a Steam AppID); a manual game's exe never
  counted, so its folder was listed again under its folder name.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const { claimedInstallExes } = require('../../app/parser/achievements.js')._internal;

test('a manually added game claims its folder from the unconfigured scan', () => {
  const exes = claimedInstallExes({
    exeEntries: [
      { appid: '400', exe: 'C:\\Games\\Portal\\portal.exe' },
      { appid: 'local-76797eef', exe: 'C:\\Games\\Manual Hollow\\hollow_knight.exe' },
      { appid: '620', exe: '' },
    ],
    manualEntries: [{ id: 'manual-1092e4941d9d', exe: 'C:\\Games\\Manual Hollow\\hollow_knight.exe' }, { id: 'manual-2', exe: '' }],
  });
  assert.deepEqual(exes, ['C:\\Games\\Portal\\portal.exe', 'C:\\Games\\Manual Hollow\\hollow_knight.exe']);
});

test('nothing to claim gives an empty list', () => {
  assert.deepEqual(claimedInstallExes({}), []);
});
