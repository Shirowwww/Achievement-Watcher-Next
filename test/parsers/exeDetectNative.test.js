'use strict';

// A native Linux game is an executable ELF file; libraries, scripts and non-executable files are not.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const exeDetect = require('../../app/parser/exeDetect.js');

const linuxOnly = { skip: process.platform !== 'linux' && 'Linux-only' };
const ELF_HEADER = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]);

function gameDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-native-${name}-`));
}

function writeElf(file, size = 64, mode = 0o755) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([ELF_HEADER, Buffer.alloc(size)]), { mode });
  fs.chmodSync(file, mode);
}

test('a native game binary without extension is the detected executable', linuxOnly, () => {
  const dir = gameDir('plain');
  writeElf(path.join(dir, 'awtestgame'), 200);
  writeElf(path.join(dir, 'libsteam_api.so'), 4000);
  fs.writeFileSync(path.join(dir, 'start.sh'), '#!/bin/sh\n./awtestgame\n', { mode: 0o755 });

  const detected = exeDetect.detect(dir, 'AW Test Game');
  assert.equal(detected && detected.full, path.join(dir, 'awtestgame'));
  assert.equal(exeDetect.shallowGameExe(dir), 'awtestgame');
});

test('a Unity build is found by its .x86_64 binary and matched by name', linuxOnly, () => {
  const dir = gameDir('unity');
  writeElf(path.join(dir, 'Hollow Knight.x86_64'), 100);
  writeElf(path.join(dir, 'UnityCrashHandler64'), 900);
  fs.mkdirSync(path.join(dir, 'Hollow Knight_Data'));

  const detected = exeDetect.detect(dir, 'Hollow Knight');
  assert.equal(detected && detected.name, 'Hollow Knight.x86_64');
  assert.equal(detected.confident, true);
});

test('files that are not executable ELF binaries are never candidates', linuxOnly, () => {
  const dir = gameDir('none');
  writeElf(path.join(dir, 'game'), 64, 0o644);
  fs.writeFileSync(path.join(dir, 'run'), '#!/bin/sh\n', { mode: 0o755 });
  writeElf(path.join(dir, 'chrome-sandbox'));
  writeElf(path.join(dir, 'steam'));

  assert.equal(exeDetect.detect(dir, 'Game'), null);
  assert.equal(exeDetect.shallowGameExe(dir), null);
});

test('a native game folder picked as a save folder is diagnosed as a game without unlock data', linuxOnly, async () => {
  const userDir = require('../../app/parser/userDir.js');
  const dir = gameDir('diagnose');
  writeElf(path.join(dir, 'awtestgame'));
  const diagnosis = await userDir.diagnose(dir);
  assert.equal(diagnosis.accepted, false);
  assert.equal(diagnosis.code, 'game-folder-no-data');
  assert.equal(diagnosis.evidence.executable, 'awtestgame');
});

test('on Windows only .exe files are candidates, as before', { skip: process.platform !== 'win32' && 'Windows-only' }, () => {
  const dir = gameDir('win');
  writeElf(path.join(dir, 'awtestgame'));
  assert.equal(exeDetect.detect(dir, 'AW Test Game'), null);
  writeElf(path.join(dir, 'AWTestGame.exe'));
  assert.equal(exeDetect.detect(dir, 'AW Test Game').name, 'AWTestGame.exe');
});

test('a tool known by its Windows name is recognised under its Linux name', () => {
  assert.equal(exeDetect.isKnownNonGameExe('steam'), true);
  assert.equal(exeDetect.isKnownNonGameExe('Steam.exe'), true);
  assert.equal(exeDetect.isKnownNonGameExe('awtestgame'), false);
});
