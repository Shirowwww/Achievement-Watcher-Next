'use strict';

/*
  steam_interfaces.txt is read out of the game's original steam_api dll, and only Valve's own dll
  holds the game's interface versions. A RELOADED crack's runtime carries no GBE marker, so it passed
  for the original on D4: Dark Dreams Don't Die and the game then closed three seconds after launch.
  An original must now be the very file Valve signed; with none, the switch is refused.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const { signedPe, peWithSections } = require('../helpers/fakePe');

const pe = require('../../app/util/pe.js');
const gbe = require('../../app/parser/gbeInstaller.js');
const gameHealthRepair = require('../../app/util/gameHealthRepair.js');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('a dll is Valve-signed only when the signature names Valve and matches its bytes', (t) => {
  const dir = makeTempDir('aw-valve-signed-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(pe.isValveSignedImage(write(path.join(dir, 'valve.dll'), signedPe())), true);
  assert.equal(pe.isValveSignedImage(write(path.join(dir, 'valve-sha1.dll'), signedPe({ digest: 'sha1' }))), true);
  assert.equal(pe.isValveSignedImage(write(path.join(dir, 'patched.dll'), signedPe({ tamper: true }))), false, 'a crack that patched a signed dll');
  assert.equal(pe.isValveSignedImage(write(path.join(dir, 'other.dll'), signedPe({ signer: 'C=UK, CN=gbe' }))), false, 'signed, not by Valve');
  assert.equal(pe.isValveSignedImage(write(path.join(dir, 'plain.dll'), 'reloaded runtime')), false, 'no signature at all');
  assert.equal(pe.isValveSignedImage(path.join(dir, 'missing.dll')), false);
});

test('Valve dlls installed on this PC are recognised, when there are any', (t) => {
  const common = 'C:/Program Files (x86)/Steam/steamapps/common/SteamVR/bin';
  const files = ['win64/steam_api64.dll', 'win32/steam_api.dll'].map((name) => path.join(common, name)).filter((file) => fs.existsSync(file));
  if (process.platform !== 'win32' || files.length === 0) return t.skip('no Steam install with SteamVR here');
  for (const file of files) assert.equal(pe.isValveSignedImage(file), true, file);
});

test('a crack runtime with no GBE marker is never the interface source', (t) => {
  const dir = makeTempDir('aw-rld-interfaces-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dll = write(path.join(dir, 'steam_api64.dll'), 'gbe steam_settings build');
  write(`${dll}.bak`, 'reloaded runtime');
  write(path.join(dir, 'steam_api.ini'), '[Settings]\r\nAppId=0000358090\r\n');
  assert.deepEqual(gbe.interfaceSourceFor(dll), { file: '', reason: 'unsigned-dll' });

  const rld = write(path.join(dir, 'fresh', 'steam_api64.dll'), 'reloaded runtime');
  assert.deepEqual(gbe.interfaceSourceFor(rld), { file: '', reason: 'unsigned-dll' }, 'before AW made any backup');

  const valve = write(path.join(dir, 'engine', 'steam_api64.dll'), signedPe());
  assert.deepEqual(gbe.interfaceSourceFor(dll, [valve]), { file: valve, reason: '' }, "Valve's copy elsewhere still serves");
});

test('an unsigned dll counts only with plain compiler sections and no crack beside it', (t) => {
  // SteamVR's own tutorial ships an unsigned steam_api.dll (2015); D4's RELOADED one adds .RLD0-2.
  const dir = makeTempDir('aw-unsigned-original-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plain = ['.text', '.rdata', '.data', '.pdata', '.idata', '.rsrc', '.reloc'];
  const clean = write(path.join(dir, 'clean', 'steam_api64.dll'), peWithSections(plain));
  assert.deepEqual(gbe.interfaceSourceFor(clean), { file: clean, reason: '' });

  const wrapped = write(path.join(dir, 'wrapped', 'steam_api64.dll'), peWithSections(['.text', '.rdata', '.data', '.pdata', '.rsrc', '.RLD0', '.RLD1', '.tls', '.RLD2', '.reloc']));
  assert.deepEqual(gbe.interfaceSourceFor(wrapped), { file: '', reason: 'unsigned-dll' }, 'a crack wrapper over the dll');

  const beside = write(path.join(dir, 'crack', 'steam_api64.dll'), peWithSections(plain));
  write(path.join(dir, 'crack', 'steam_emu.ini'), '[Settings]\r\nAppId=374320\r\n');
  assert.deepEqual(gbe.interfaceSourceFor(beside), { file: '', reason: 'unsigned-dll' }, "a crack's own runtime beside its ini");

  const switched = write(path.join(dir, 'switched', 'steam_api64.dll'), 'gbe steam_settings build');
  write(`${switched}.bak`, peWithSections(plain));
  write(path.join(dir, 'switched', 'steam_api.ini.bak'), '[Settings]\r\nAppId=358090\r\n');
  assert.deepEqual(gbe.interfaceSourceFor(switched), { file: '', reason: 'unsigned-dll' }, 'its ini set aside by a switch still names it');
});

test('a generator output with no interface version is not written', async (t) => {
  // RELOADED's wrapped dll on D4 kept its version strings encrypted: the tool found one macro name.
  const dir = makeTempDir('aw-macro-interfaces-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dll = write(path.join(dir, 'steam_api64.dll'), signedPe());
  const tool = write(path.join(dir, 'tool.js'), "require('fs').writeFileSync('steam_interfaces.txt', 'STEAMCONTROLLER_INTERFACE_VERSION\\n');\n");
  const steamSettings = path.join(dir, 'steam_settings');
  const result = await gbe.generateInterfaces({
    dllPath: dll,
    steamSettings,
    dlls: { tag: 'test', interfaces: { x64: { exe: process.execPath, args: [tool] }, x86: null } },
  });
  assert.equal(result.generated, false);
  assert.equal(result.reason, 'no-interfaces');
  assert.ok(!fs.existsSync(path.join(steamSettings, 'steam_interfaces.txt')));
});

test('a switch with no Valve dll left is refused before anything changes', async (t) => {
  const dir = makeTempDir('aw-rld-switch-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'Binaries', 'Win64');
  write(path.join(bin, 'steam_api64.dll'), 'reloaded runtime');
  write(path.join(bin, 'steam_api.ini'), '[Settings]\r\nAppId=358090\r\n');
  const before = fs.readdirSync(bin).sort();
  const stub = {
    ensureEmulatorDlls: async () => ({ tag: 'test', interfaces: {} }),
    tryGenerateInterfaces: gbe.tryGenerateInterfaces,
  };
  const ready = await gameHealthRepair.switchInterfacesReady({
    gbeInstaller: stub,
    plan: { dirs: [bin], file: 'steam_api64.dll', arch: 'x64' },
    gameDir: dir,
    appid: '358090',
    log: { log() {} },
  });
  assert.deepEqual(ready, { ready: false, reason: 'unsigned-dll' });
  assert.deepEqual(fs.readdirSync(bin).sort(), before, 'the game folder is left as it was');
});
