'use strict';

// "Switch to the supported emulator" renames the scene crack's files to .bak and AW's dll replaces
// the crack's runtime (kept as steam_api64.dll.bak). Some builds then refuse to start (007 First
// Light 1.3.1: "You do not own this game"), so the switch has to be undoable from the same panel.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));

const RUNE_RUNTIME = Buffer.from('rune runtime');
const GBE_RUNTIME = Buffer.from('gbe build reading steam_settings');

function runeFolder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-undo-switch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), RUNE_RUNTIME);
  fs.writeFileSync(path.join(dir, 'steam_api64.rne'), 'valve original');
  fs.writeFileSync(path.join(dir, 'steam_emu.ini'), '[Settings]\nAppId=1\n');
  return dir;
}

// What the Game Health switch leaves on disk: markers sidelined, then the dll replaced once.
function switchToGbe(dir) {
  crackLoaderDetect.disableLoaderMarkers([dir]);
  fs.copyFileSync(path.join(dir, 'steam_api64.dll'), path.join(dir, 'steam_api64.dll.bak'));
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), GBE_RUNTIME);
}

test('an untouched crack folder offers no undo', (t) => {
  const dir = runeFolder(t);
  assert.deepStrictEqual(crackLoaderDetect.switchedLoaderDirs([dir]), []);
});

test('a switched folder is found and put back exactly as the crack shipped it', (t) => {
  const dir = runeFolder(t);
  switchToGbe(dir);
  assert.deepStrictEqual(crackLoaderDetect.switchedLoaderDirs([dir, dir]), [dir]);

  const restored = crackLoaderDetect.restoreSwitchedLoader([dir]);

  assert.deepStrictEqual(restored.map((file) => path.basename(file)).sort(), ['steam_api64.dll', 'steam_api64.rne', 'steam_emu.ini']);
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, 'steam_api64.dll')), RUNE_RUNTIME);
  assert.ok(!fs.existsSync(path.join(dir, 'steam_api64.dll.bak')), 'the next switch takes a fresh backup');
  assert.ok(!fs.existsSync(path.join(dir, 'steam_emu.ini.bak')));
  assert.strictEqual(crackLoaderDetect.detectWorkingCrackLoader(dir).name, 'CODEX / RUNE / scene emulator');
  assert.deepStrictEqual(crackLoaderDetect.switchedLoaderDirs([dir]), []);
});

test('a dll AW did not install is never overwritten by the backup', (t) => {
  const dir = runeFolder(t);
  switchToGbe(dir);
  // The user (or a repack update) already put another runtime in place by hand.
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'some other runtime');

  crackLoaderDetect.restoreSwitchedLoader([dir]);

  assert.strictEqual(fs.readFileSync(path.join(dir, 'steam_api64.dll'), 'utf8'), 'some other runtime');
  assert.ok(fs.existsSync(path.join(dir, 'steam_api64.dll.bak')), 'the backup is kept for a manual restore');
  assert.ok(fs.existsSync(path.join(dir, 'steam_emu.ini')), 'the crack configuration still comes back');
});

test('a marker already back in place keeps its live copy', (t) => {
  const dir = runeFolder(t);
  switchToGbe(dir);
  fs.writeFileSync(path.join(dir, 'steam_emu.ini'), 'restored by hand');

  crackLoaderDetect.restoreSwitchedLoader([dir]);

  assert.strictEqual(fs.readFileSync(path.join(dir, 'steam_emu.ini'), 'utf8'), 'restored by hand');
});
