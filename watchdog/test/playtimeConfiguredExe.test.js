'use strict';

// A process started from the executable set for a game is that game, whatever binary the index
// watches (#193): the Watchdog used to know only names from gameIndex.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { appidForExecutable } = require(sharedAppModulePath('parser/exeList.js'));
const { findGameForConfiguredExe } = require('../playtime/monitor.js');

const GAME = 'D:\\Games\\Gears of War E-Day\\FairlightConcept\\Binaries\\Win64\\GoWEDay-Steam.exe';
const index = [
  { appid: '3010850', name: 'Gears of War: E-Day', binary: 'start_protected_game.exe' },
  { appid: '480', name: 'Spacewar', binary: 'spacewar.exe' },
];

function listFile(t, rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-configured-exe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'exeList.db');
  fs.writeFileSync(file, JSON.stringify(rows));
  return file;
}

test('appidForExecutable answers the appid an exe path was set for, case and slashes aside', (t) => {
  const file = listFile(t, [{ appid: 3010850, exe: GAME, args: '' }, { appid: '1', exe: '', args: '' }]);
  assert.equal(appidForExecutable(GAME, { file }), '3010850');
  assert.equal(appidForExecutable(GAME.toLowerCase().replace(/\\/g, '/'), { file }), '3010850');
  assert.equal(appidForExecutable('D:\\Games\\Other\\game.exe', { file }), '');
  assert.equal(appidForExecutable('', { file }), '');
  assert.equal(appidForExecutable(GAME, { file: path.join(path.dirname(file), 'missing.db') }), '', 'no list, no answer');
});

test('appidForExecutable follows an edited list', (t) => {
  const file = listFile(t, [{ appid: '3010850', exe: GAME }]);
  assert.equal(appidForExecutable(GAME, { file }), '3010850');
  fs.writeFileSync(file, JSON.stringify([{ appid: '3010850', exe: 'E:\\Moved\\GoWEDay-Steam.exe', args: '' }]));
  const later = Date.now() / 1000 + 5;
  fs.utimesSync(file, later, later);
  assert.equal(appidForExecutable(GAME, { file }), '');
  assert.equal(appidForExecutable('E:\\Moved\\GoWEDay-Steam.exe', { file }), '3010850');
});

test('a process started from the configured exe is matched to its game', () => {
  const appidFor = (file) => (file === GAME ? '3010850' : '');
  assert.equal(findGameForConfiguredExe(GAME, index, appidFor).appid, '3010850');
  assert.equal(findGameForConfiguredExe('D:\\Elsewhere\\GoWEDay-Steam.exe', index, appidFor), null, 'same name, other folder: not this game');
  assert.equal(findGameForConfiguredExe(GAME, [], appidFor), null, 'a game the index does not hold is not invented');
  assert.equal(findGameForConfiguredExe('', index, appidFor), null);
});

test('a configured launcher is not matched: the game it starts is the session', () => {
  const launcher = 'D:\\Games\\Gears of War E-Day\\start_protected_game.exe';
  assert.equal(findGameForConfiguredExe(launcher, index, () => '3010850'), null);
});

// Under Wine or Proton the process path is argv[0] turned into a Unix path (procSnapshot.js), spelled
// the way the launcher typed it; the configured exe is the file the dialog returned.
test('a Wine path spelled in another case still names the configured exe', (t) => {
  const { winToUnix } = require(sharedAppModulePath('util/winHosts.js'));
  const prefix = '/home/player/.local/share/Steam/steamapps/compatdata/3010850/pfx';
  const picked = `${prefix}/drive_c/Games/GoW/GoWEDay-Steam.exe`;
  const file = listFile(t, [{ appid: '3010850', exe: picked }]);
  const running = winToUnix(prefix, 'C:\\GAMES\\GOW\\GOWEDAY-STEAM.EXE').split(path.sep).join('/');
  assert.equal(appidForExecutable(running, { file }), '3010850');
  assert.equal(appidForExecutable(winToUnix(prefix, 'Z:\\home\\player\\Other\\Game.exe'), { file }), '', 'Z: maps to /, another file');
});

test('a configured exe reached through a symbolic link names the running one', { skip: process.platform === 'win32' && 'Linux-only' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-configured-link-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const real = path.join(dir, 'local', 'share', 'Steam', 'steamapps', 'common', 'Game');
  fs.mkdirSync(real, { recursive: true });
  fs.writeFileSync(path.join(real, 'Game.exe'), 'MZ');
  fs.symlinkSync(path.join(dir, 'local', 'share', 'Steam'), path.join(dir, 'steam'));
  const file = listFile(t, [{ appid: '42', exe: path.join(dir, 'steam', 'steamapps', 'common', 'Game', 'Game.exe') }]);
  assert.equal(appidForExecutable(path.join(real, 'Game.exe'), { file }), '42', 'the dialog went through ~/.steam/steam, Proton reports the real folder');
});
