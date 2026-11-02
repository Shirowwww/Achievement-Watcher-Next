'use strict';

/*
  Which install folder Game Health reports on once the user has picked the game's executable. MGS4
  (RUNE, appid 2492670) ships <root>\Launcher\launcher.exe and the game itself in <root>\MGS4: the
  scan found the launcher's folder, and the executable picked in the sibling folder was ignored, so
  the emulator fix replaced the launcher's two dlls and never the one the game loads.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const exeDetect = require(path.join(__dirname, '..', '..', 'app', 'parser', 'exeDetect.js'));

const root = path.resolve('/games/METAL GEAR SOLID 4');
const launcherDir = path.join(root, 'Launcher');
const gameDir = path.join(root, 'MGS4');

test('a configured executable in a sibling folder of the scanned one takes over the install folder', () => {
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: launcherDir, gameDirExists: true, derived: gameDir }), gameDir);
});

test('a separate install nested in the scanned folder takes over, as before', () => {
  const nested = path.join(root, 'Enhanced Edition');
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: root, gameDirExists: true, derived: nested }), nested);
});

test('a missing scanned folder is replaced by the executable\'s folder', () => {
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: launcherDir, gameDirExists: false, derived: gameDir }), gameDir);
});

test('an executable somewhere unrelated leaves the scanned folder alone', () => {
  const elsewhere = path.resolve('/tools/Some Mod Manager');
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: launcherDir, gameDirExists: true, derived: elsewhere }), launcherDir);
});

test('the scanned folder itself, or a parent of it, changes nothing', () => {
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: launcherDir, gameDirExists: true, derived: launcherDir }), launcherDir);
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: launcherDir, gameDirExists: true, derived: root }), launcherDir);
});

test('no derived folder keeps whatever the scan found', () => {
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: launcherDir, gameDirExists: true, derived: '' }), launcherDir);
  assert.equal(exeDetect.installDirForConfiguredExe({ gameDir: '', gameDirExists: false, derived: '' }), '');
});
