'use strict';

/*
  The string constants of a frozen (PyInstaller) port launcher, read from the archive's own tables
  without decoding any code object, so any Python version reads the same way.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const reader = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4RecompPyInstaller.js'));
const { buildLauncher } = require(path.join(__dirname, '..', 'helpers', 'pyinstallerArchive.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pyinstaller-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function exe(name, bytes) {
  const file = path.join(temp, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

const MODULES = {
  tlg_settings: ['tlg-launcher', 'settings.json', 'tlg_paths'],
  tlg_paths: ['out', 'boot-linked.bin'],
  json: ['evil-launcher'],
  unused_module: ['other-launcher'],
};

for (const asDict of [false, true]) {
  test(`the entry script and the modules it names are read, the PYZ table as a ${asDict ? 'dict' : 'list'}`, () => {
    const file = exe(`launcher-${asDict}.exe`, buildLauncher({ script: ['tlg_settings', 'json', 'main'], modules: MODULES, asDict }));
    const strings = reader.launcherStrings(file);
    for (const wanted of ['main', 'tlg-launcher', 'settings.json', 'boot-linked.bin']) assert.ok(strings.includes(wanted), wanted);
    assert.ok(!strings.includes('evil-launcher'), 'a standard library module is not followed');
    assert.ok(!strings.includes('other-launcher'), 'a module nothing names is not read');
    assert.ok(!strings.includes('ignored-launcher'), "PyInstaller's own bootstrap scripts are skipped");
  });
}

test('an exe that is no PyInstaller archive, or lies about its sizes, gives nothing and does not throw', () => {
  assert.deepEqual(reader.launcherStrings(exe('plain.exe', Buffer.from('MZ just a game'))), []);
  const good = buildLauncher({ script: ['tlg_settings'], modules: MODULES });
  const lying = Buffer.from(good);
  lying.writeUInt32BE(0x7fffffff, lying.length - 88 + 8);
  assert.deepEqual(reader.launcherStrings(exe('lying.exe', lying)), []);
  assert.deepEqual(reader.launcherStrings(exe('cut.exe', good.subarray(0, good.length - 200))), []);
  assert.deepEqual(reader.launcherStrings(path.join(temp, 'missing.exe')), []);
});

test('only the executables directly in the port folder are read', () => {
  const root = path.join(temp, 'port');
  exe(path.join('port', 'TLG Launcher.exe'), buildLauncher({ script: ['tlg_settings'], modules: MODULES }));
  exe(path.join('port', 'bin', 'deep.exe'), buildLauncher({ script: ['deep-launcher'] }));
  const strings = reader.compiledLauncherStrings(root);
  assert.ok(strings.includes('tlg-launcher'));
  assert.ok(!strings.includes('deep-launcher'));
});

test('the marshal table reader takes containers, strings and ints and refuses code', () => {
  const list = Buffer.concat([Buffer.from('[\x02\x00\x00\x00', 'latin1'), Buffer.from([0xfa, 2]), Buffer.from('ab'), Buffer.from('r\x00\x00\x00\x00', 'latin1')]);
  assert.deepEqual(reader.readMarshal(list), ['ab', 'ab'], 'a reference repeats the flagged value');
  assert.throws(() => reader.readMarshal(Buffer.from('c\x00\x00\x00\x00', 'latin1')));
  assert.throws(() => reader.readMarshal(Buffer.from('[\xff\xff\xff\x7f', 'latin1')));
});
