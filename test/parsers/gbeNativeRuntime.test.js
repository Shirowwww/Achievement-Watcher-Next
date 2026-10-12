'use strict';

/*
  A native Linux game loads libsteam_api.so, whose single name covers both architectures. The repair
  must pick the cached build from the ELF header of the file it replaces, keep the original as .bak,
  and never seed a Windows dll beside it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const gbe = require(path.join(appDir, 'parser', 'gbeInstaller.js'));
const { elfArch } = require(path.join(appDir, 'util', 'elf.js'));
const { planRuntimeInstall, installEmulatorRuntime } = require(path.join(appDir, 'util', 'gameHealthRepair.js'));

const LINUX_ONLY = { skip: process.platform === 'win32' && 'Linux-only' };
const MACHINE = { x64: 0x3e, x86: 0x03, arm64: 0xb7 };

function elfBytes(arch, label) {
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x464c457f, 0);
  head[4] = arch === 'x86' ? 1 : 2;
  head.writeUInt16LE(MACHINE[arch], 18);
  return Buffer.concat([head, Buffer.from(label)]);
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-native-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cachedBuild(root) {
  const tag = path.join(root, 'cache', 'release-1');
  fs.mkdirSync(tag, { recursive: true });
  fs.writeFileSync(path.join(tag, 'steam_api64.dll'), 'GBE-dll-x64');
  const native = {};
  for (const arch of ['x64', 'x86']) {
    native[arch] = path.join(tag, 'linux', arch, 'libsteam_api.so');
    fs.mkdirSync(path.dirname(native[arch]), { recursive: true });
    fs.writeFileSync(native[arch], elfBytes(arch, `GBE-${arch}`));
  }
  return { tag: 'release-1', dir: tag, x64: path.join(tag, 'steam_api64.dll'), x86: null, native };
}

test('elfArch reads the machine field and rejects anything that is not ELF', (t) => {
  const dir = tempDir(t);
  for (const arch of Object.keys(MACHINE)) {
    fs.writeFileSync(path.join(dir, arch), elfBytes(arch, ''));
    assert.equal(elfArch(path.join(dir, arch)), arch);
  }
  fs.writeFileSync(path.join(dir, 'pe'), Buffer.from('MZ\x90\x00 not an elf header at all'));
  assert.equal(elfArch(path.join(dir, 'pe')), null);
  assert.equal(elfArch(path.join(dir, 'missing')), null);
});

test('a libsteam_api.so is replaced by the build of its own architecture, original kept as .bak', LINUX_ONLY, (t) => {
  const root = tempDir(t);
  const dlls = cachedBuild(root);
  const game = path.join(root, 'game32');
  fs.mkdirSync(game);
  fs.writeFileSync(path.join(game, 'libsteam_api.so'), elfBytes('x86', 'valve-x86'));

  const res = gbe.installDlls({ dllDirs: [game], dlls, writeIfMissing: 'x64', ensureArch: 'x64' });

  assert.ok(fs.readFileSync(path.join(game, 'libsteam_api.so')).includes('GBE-x86'));
  assert.ok(fs.readFileSync(path.join(game, 'libsteam_api.so.bak')).includes('valve-x86'));
  assert.ok(!fs.existsSync(path.join(game, 'steam_api64.dll')), 'no Windows dll beside a native library');
  assert.equal(res.installed, 1);
  assert.equal(res.backedUp, 1);
});

test('nativeArch seeds libsteam_api.so into a folder with no runtime at all', (t) => {
  const root = tempDir(t);
  const dlls = cachedBuild(root);
  const game = path.join(root, 'empty');
  fs.mkdirSync(game);

  gbe.installDlls({ dllDirs: [game], dlls, nativeArch: 'x64' });

  assert.equal(elfArch(path.join(game, 'libsteam_api.so')), 'x64');
  assert.ok(!fs.existsSync(path.join(game, 'libsteam_api.so.bak')), 'a fresh write needs no backup');
  assert.deepEqual(fs.readdirSync(game), ['libsteam_api.so']);
});

test('the runtime folders include the one holding libsteam_api.so', () => {
  const gameDir = path.join(os.tmpdir(), 'aw-native-game');
  const libDir = path.join(gameDir, 'lib');
  const dirs = gbe.runtimeDllDirs({ gameDir, dllPaths: [path.join(libDir, 'libsteam_api.so')] });
  assert.deepEqual(dirs, [libDir]);
});

test('the Game Health plan for a native game installs libsteam_api.so and no dll', async () => {
  const calls = {};
  const stub = {
    ARCH: gbe.ARCH,
    NATIVE_LIB: gbe.NATIVE_LIB,
    runtimeDllDirs: () => ['/games/Native'],
    ensureEmulatorDlls: async () => ({ tag: 'v1', x64: 'cached/steam_api64.dll' }),
    installDlls: (args) => {
      calls.install = args;
      return { installed: 1, backedUp: 0, tag: 'v1', perDir: [] };
    },
  };
  const plan = planRuntimeInstall({ gbeInstaller: stub, gameDir: '/games/Native', arch: 'x86', native: true });
  assert.equal(plan.file, 'libsteam_api.so');
  assert.equal(plan.backup, 'libsteam_api.so.bak');

  await installEmulatorRuntime({ gbeInstaller: stub, plan, cacheDir: '/cache' });
  assert.equal(calls.install.nativeArch, 'x86');
  assert.equal(calls.install.writeIfMissing, null);
  assert.equal(calls.install.ensureArch, null);
});

test('matchesCachedDll recognises the cached native build by its architecture', (t) => {
  const root = tempDir(t);
  const dlls = cachedBuild(root);
  const cacheDir = path.dirname(dlls.dir);
  fs.writeFileSync(path.join(cacheDir, 'latest.txt'), dlls.tag);
  const game = path.join(root, 'game');
  fs.mkdirSync(game);
  const lib = path.join(game, 'libsteam_api.so');
  fs.copyFileSync(dlls.native.x64, lib);
  assert.equal(gbe.matchesCachedDll(lib, cacheDir, 'x64'), true);
  assert.equal(gbe.matchesCachedDll(lib, cacheDir, 'x86'), false);
  assert.equal(gbe.archOfSteamApiFile(lib), 'x64');
});
