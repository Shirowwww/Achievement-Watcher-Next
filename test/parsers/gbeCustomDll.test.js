'use strict';

/*
  The imported steam_api dll: what a user drops in by hand replaces the downloaded GBE Fork build for
  its own architecture, and only for that one. The download half of ensureEmulatorDlls is not
  exercised here; every case below seeds a fresh release cache so no request is made.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const gbe = require('../../app/parser/gbeInstaller.js');

// Enough of a PE for pe.exeArch(), plus the string that tells an emulator from Valve's own dll.
function fakeDll(arch, marker = 'steam_settings') {
  const buffer = Buffer.alloc(2048);
  buffer.writeUInt16LE(0x5a4d, 0);
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.writeUInt32LE(0x00004550, 0x80);
  buffer.writeUInt16LE(arch === 'x64' ? 0x8664 : 0x014c, 0x84);
  buffer.write(marker, 0x200, 'ascii');
  return buffer;
}

function writeDll(file, arch, marker) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fakeDll(arch, marker));
  return file;
}

// A cached release the daily check considers fresh, so ensureEmulatorDlls never reaches GitHub.
function seedRelease(cacheDir, tag = 'release-2026_01_01') {
  const dir = path.join(cacheDir, tag);
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'release-x64');
  fs.writeFileSync(path.join(dir, 'steam_api.dll'), 'release-x86');
  fs.writeFileSync(path.join(dir, 'tools', 'generate_interfaces_x64.exe'), 'tool-x64');
  fs.writeFileSync(path.join(cacheDir, 'latest.txt'), tag);
  fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
  return tag;
}

async function withTemp(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-custom-'));
  try {
    await run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('an imported dll replaces its own architecture and leaves the other one to the release', async () => {
  await withTemp(async (root) => {
    const cacheDir = path.join(root, 'cache');
    const tag = seedRelease(cacheDir);
    const picked = writeDll(path.join(root, 'picked', 'steam_api64.dll'), 'x64');

    const imported = await gbe.importCustomDlls({ packagePath: picked, cacheDir });
    assert.deepEqual(imported.imported, ['steam_api64.dll']);

    const dlls = await gbe.ensureEmulatorDlls({ cacheDir });
    assert.equal(dlls.x64, path.join(cacheDir, 'custom', 'steam_api64.dll'));
    assert.equal(dlls.x86, path.join(cacheDir, tag, 'steam_api.dll'), 'the arch nobody imported still comes from the release');
    assert.ok(dlls.interfaces && dlls.interfaces.x64, 'generate_interfaces stays version-coupled to the release');
    assert.equal(dlls.tag, `${tag}+custom`, 'the tag has to say a repair is not installing the official build');
    assert.deepEqual(dlls.custom, ['steam_api64.dll']);
  });
});

test('a game repaired with the imported dll is not seen as untouched', async () => {
  await withTemp(async (root) => {
    const cacheDir = path.join(root, 'cache');
    seedRelease(cacheDir);
    const picked = writeDll(path.join(root, 'picked', 'steam_api64.dll'), 'x64');
    await gbe.importCustomDlls({ packagePath: picked, cacheDir });

    const installed = writeDll(path.join(root, 'game', 'steam_api64.dll'), 'x64');
    assert.equal(gbe.matchesCachedDll(installed, cacheDir, 'x64'), true);

    const foreign = writeDll(path.join(root, 'other', 'steam_api64.dll'), 'x64', 'steam_settings and something else');
    assert.equal(gbe.matchesCachedDll(foreign, cacheDir, 'x64'), false);
  });
});

test('the official build comes back once the imported dll is dropped', async () => {
  await withTemp(async (root) => {
    const cacheDir = path.join(root, 'cache');
    const tag = seedRelease(cacheDir);
    await gbe.importCustomDlls({ packagePath: writeDll(path.join(root, 'picked', 'steam_api64.dll'), 'x64'), cacheDir });

    assert.deepEqual(gbe.clearCustomDlls({ cacheDir }), ['steam_api64.dll']);
    const dlls = await gbe.ensureEmulatorDlls({ cacheDir });
    assert.equal(dlls.x64, path.join(cacheDir, tag, 'steam_api64.dll'));
    assert.equal(dlls.tag, tag);
    assert.equal(gbe.describeCache(cacheDir).custom.length, 0);
  });
});

test('a dll that is not an emulator, or not the architecture its name promises, is refused', async () => {
  await withTemp(async (root) => {
    const cacheDir = path.join(root, 'cache');
    seedRelease(cacheDir);

    // Valve's own steam_api64.dll: importing it would be installed into every repaired game.
    const genuine = writeDll(path.join(root, 'valve', 'steam_api64.dll'), 'x64', 'SteamAPI_Init');
    await assert.rejects(() => gbe.importCustomDlls({ packagePath: genuine, cacheDir }), /NOT_AN_EMULATOR_DLL/);

    const wrongArch = writeDll(path.join(root, 'mismatch', 'steam_api64.dll'), 'x86');
    await assert.rejects(() => gbe.importCustomDlls({ packagePath: wrongArch, cacheDir }), /ARCH_MISMATCH/);

    const notPe = path.join(root, 'garbage', 'steam_api64.dll');
    fs.mkdirSync(path.dirname(notPe), { recursive: true });
    fs.writeFileSync(notPe, 'not a dll at all');
    await assert.rejects(() => gbe.importCustomDlls({ packagePath: notPe, cacheDir }), /NOT_PE/);

    assert.equal(gbe.customDlls(cacheDir).names.length, 0, 'nothing refused may reach the folder a repair reads');
  });
});

test('a file dropped into the custom folder by hand still has to pass the same checks', async () => {
  await withTemp(async (root) => {
    const cacheDir = path.join(root, 'cache');
    seedRelease(cacheDir);
    writeDll(path.join(cacheDir, gbe.CUSTOM_DIR, 'steam_api64.dll'), 'x86');

    const custom = gbe.customDlls(cacheDir);
    assert.deepEqual(custom.names, []);
    assert.equal(custom.invalid[0].error, 'ARCH_MISMATCH');
    const dlls = await gbe.ensureEmulatorDlls({ cacheDir });
    assert.equal(dlls.x64, path.join(cacheDir, 'release-2026_01_01', 'steam_api64.dll'));
  });
});

test('a folder holding both architectures imports both', async () => {
  await withTemp(async (root) => {
    const cacheDir = path.join(root, 'cache');
    seedRelease(cacheDir);
    const picked = path.join(root, 'picked');
    writeDll(path.join(picked, 'release', 'regular', 'x64', 'steam_api64.dll'), 'x64');
    writeDll(path.join(picked, 'release', 'regular', 'x32', 'steam_api.dll'), 'x86');

    const imported = await gbe.importCustomDlls({ packagePath: picked, cacheDir });
    assert.deepEqual(imported.imported.sort(), ['steam_api.dll', 'steam_api64.dll']);

    const dlls = await gbe.ensureEmulatorDlls({ cacheDir });
    assert.equal(dlls.x64, path.join(cacheDir, 'custom', 'steam_api64.dll'));
    assert.equal(dlls.x86, path.join(cacheDir, 'custom', 'steam_api.dll'));

    // Importing the same files again is a no-op, not a rewrite.
    const again = await gbe.importCustomDlls({ packagePath: picked, cacheDir });
    assert.deepEqual(again.imported, []);
    assert.deepEqual(again.unchanged.sort(), ['steam_api.dll', 'steam_api64.dll']);
  });
});
