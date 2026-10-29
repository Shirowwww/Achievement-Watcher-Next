'use strict';

/*
  A scene crack's folder where something else now sits in steam_api.dll's place. Transformers: Fall
  of Cybertron's fan multiplayer mod (2026-10-29) ships a steam_api.dll of its own, internally named
  foc_wh_steam_api_dll.dll, that answers the achievement calls without recording any: steam_emu.ini
  still named CODEX, so the panel blamed the crack and offered to replace it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const pe = require('../../app/util/pe.js');
const crackLoaderDetect = require('../../app/util/crackLoaderDetect.js');
const gameHealth = require('../../app/util/gameHealth.js');

// A DLL reduced to what the export directory's name needs: one section holding that directory.
function fakeDll(exportName, { pe64 = false } = {}) {
  const buf = Buffer.alloc(0x600, 0);
  const peOff = 0x80;
  const optSize = pe64 ? 0xf0 : 0xe0;
  const opt = peOff + 24;
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(peOff, 0x3c);
  buf.writeUInt32LE(0x00004550, peOff);
  buf.writeUInt16LE(pe64 ? 0x8664 : 0x14c, peOff + 4);
  buf.writeUInt16LE(1, peOff + 6);
  buf.writeUInt16LE(optSize, peOff + 20);
  buf.writeUInt16LE(pe64 ? 0x20b : 0x10b, opt);
  const dirs = opt + (pe64 ? 112 : 96);
  buf.writeUInt32LE(0x1000, dirs);
  buf.writeUInt32LE(0x100, dirs + 4);
  const section = opt + optSize;
  buf.write('.edata', section, 'latin1');
  buf.writeUInt32LE(0x200, section + 8);
  buf.writeUInt32LE(0x1000, section + 12);
  buf.writeUInt32LE(0x200, section + 16);
  buf.writeUInt32LE(0x400, section + 20);
  buf.writeUInt32LE(0x1028, 0x400 + 12);
  if (exportName) buf.write(`${exportName}\0`, 0x428, 'latin1');
  return buf;
}

const tmpDir = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-crack-replaced-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('a dll says the name it was built under, in 32 and 64 bits', (t) => {
  const dir = tmpDir(t);
  const file = path.join(dir, 'steam_api.dll');
  fs.writeFileSync(file, fakeDll('foc_wh_steam_api_dll.dll'));
  assert.equal(pe.readExportName(file), 'foc_wh_steam_api_dll.dll');
  fs.writeFileSync(file, fakeDll('steam_api64.dll', { pe64: true }));
  assert.equal(pe.readExportName(file), 'steam_api64.dll');
});

test('a file that is not a dll, or names nothing, has no export name', (t) => {
  const dir = tmpDir(t);
  const file = path.join(dir, 'steam_api.dll');
  for (const body of ['stub', Buffer.alloc(0), fakeDll('')]) {
    fs.writeFileSync(file, body);
    assert.equal(pe.readExportName(file), '');
  }
  assert.equal(pe.readExportName(path.join(dir, 'missing.dll')), '');
});

test('a crack folder whose steam_api dll is another program says which one', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'steam_emu.ini'), '[Settings]\nAppId=213120\n');
  fs.writeFileSync(path.join(dir, 'steam_api.dll'), fakeDll('foc_wh_steam_api_dll.dll'));
  const loader = crackLoaderDetect.detectWorkingCrackLoader(dir);
  assert.equal(loader.name, 'CODEX / RUNE / scene emulator');
  assert.equal(loader.replacedBy, 'foc_wh_steam_api_dll.dll');
});

test("the crack's own dll, or Valve's, is not reported as replaced", (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'steam_emu.ini'), '[Settings]\nAppId=213120\n');
  for (const name of ['steam_api.dll', 'STEAM_API.DLL', 'steam_api64.dll', '']) {
    fs.writeFileSync(path.join(dir, 'steam_api.dll'), fakeDll(name));
    assert.equal(crackLoaderDetect.detectWorkingCrackLoader(dir).replacedBy, undefined, name || 'packed, no name');
  }
});

const kybr = {
  appid: 213120,
  name: 'Transformers: Fall of Cybertron',
  gameDir: 'G:\\Transformers - Fall of Cybertron\\Binaries',
  gameDirExists: true,
  installed: true,
  emulated: false,
  goldberg: null,
  achievements: { total: 50, unlocked: 0 },
  playtime: { total: 4 * 3600 },
  crackLoader: { name: 'CODEX / RUNE / scene emulator', replaceable: true, replacedBy: 'foc_wh_steam_api_dll.dll' },
};

test('the panel names the replacement instead of blaming the crack', () => {
  const report = gameHealth.deriveHealth(kybr);
  const row = report.checks.find((check) => check.id === 'emulator');
  assert.equal(row.level, gameHealth.LEVEL.WARN);
  assert.equal(row.params.replacedBy, 'foc_wh_steam_api_dll.dll');
  assert.equal(report.reason, 'crack-runtime-replaced');
});
