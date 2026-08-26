'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const uplayR2 = require('../../app/parser/uplayR2.js');
const installer = require('../../app/parser/uplayR2Installer.js');

function fakePe(arch, text = '') {
  const buffer = Buffer.alloc(4096);
  buffer.writeUInt16LE(0x5a4d, 0);
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.writeUInt32LE(0x00004550, 0x80);
  buffer.writeUInt16LE(arch === 'x64' ? 0x8664 : 0x014c, 0x84);
  const imports = [...text.matchAll(/imports:\s*((?:uplay|upc)_r2_loader(?:64)?\.dll)/gi)].map((match) => match[1].toLowerCase());
  if (imports.length > 0) {
    const optionalSize = arch === 'x64' ? 0xf0 : 0xe0;
    const optionalOffset = 0x98;
    const directoriesOffset = optionalOffset + (arch === 'x64' ? 112 : 96);
    const sectionOffset = optionalOffset + optionalSize;
    buffer.writeUInt16LE(1, 0x86);
    buffer.writeUInt16LE(optionalSize, 0x94);
    buffer.writeUInt16LE(arch === 'x64' ? 0x20b : 0x10b, optionalOffset);
    buffer.writeUInt32LE(0x1000, directoriesOffset + 8);
    buffer.writeUInt32LE((imports.length + 1) * 20, directoriesOffset + 12);
    buffer.write('.idata\0\0', sectionOffset, 'ascii');
    buffer.writeUInt32LE(0x400, sectionOffset + 8);
    buffer.writeUInt32LE(0x1000, sectionOffset + 12);
    buffer.writeUInt32LE(0x400, sectionOffset + 16);
    buffer.writeUInt32LE(0x400, sectionOffset + 20);
    imports.forEach((name, index) => {
      const nameOffset = 0x500 + index * 64;
      buffer.writeUInt32LE(0x1000 + (nameOffset - 0x400), 0x400 + index * 20 + 12);
      buffer.write(`${name}\0`, nameOffset, 'ascii');
    });
  }
  Buffer.from(text, 'latin1').copy(buffer, 0x200);
  return buffer;
}

function writePe(file, arch, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fakePe(arch, text));
  return file;
}

function packageDir(root) {
  const dir = path.join(root, 'package');
  for (const [name, info] of Object.entries(installer.LOADER)) {
    writePe(path.join(dir, name), info.arch, `Goldberg Uplay R2 Achievements AchSaveType AchSavePath AchKeyPrefix ${name}`);
  }
  fs.writeFileSync(path.join(dir, 'uplay_r2.ini'), '[Settings]\nAchievements = 0\n');
  fs.writeFileSync(path.join(dir, 'achievements_schema_example.json'), '{}');
  return dir;
}

function schema() {
  return {
    achievement: {
      list: [{ name: 'Ach_Prologue_1', displayName: 'Prologue', description: 'Complete the Prologue' }],
    },
  };
}

test('package import keeps only validated loader binaries and is idempotent', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheDir = path.join(root, 'cache');
  const first = await installer.importPackage({ packagePath: packageDir(root), cacheDir });

  assert.deepEqual(first.imported.sort(), Object.keys(installer.LOADER).sort());
  assert.equal(first.cache.complete, true);
  assert.equal(fs.existsSync(path.join(cacheDir, 'uplay_r2.ini')), false, 'package config is never imported into the private binary cache');
  assert.equal(fs.existsSync(path.join(cacheDir, 'achievements_schema_example.json')), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(cacheDir, installer.PACKAGE_MANIFEST), 'utf8'));
  assert.equal(manifest.files.length, 4);
  assert.ok(manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));

  const second = await installer.importPackage({ packagePath: packageDir(root), cacheDir });
  assert.deepEqual(second.imported, []);
  assert.deepEqual(second.unchanged.sort(), Object.keys(installer.LOADER).sort());

  const automaticCache = path.join(root, 'automatic-cache');
  const custom = fakePe('x64', 'Achievements AchSaveType AchSavePath AchKeyPrefix newer local loader');
  fs.mkdirSync(automaticCache, { recursive: true });
  fs.writeFileSync(path.join(automaticCache, 'upc_r2_loader64.dll'), custom);
  const seeded = await installer.ensureBundledEmulatorDlls({
    cacheDir: automaticCache,
    packagePath: packageDir(root),
  });
  assert.equal(seeded.complete, true, 'the app-managed package fills every missing loader alias');
  assert.deepEqual(fs.readFileSync(path.join(automaticCache, 'upc_r2_loader64.dll')), custom, 'a valid newer loader already in the cache wins');
});

test('plain bundled loaders and the recovery archive seed every validated alias', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-bundled-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // One package per emulator generation: a game loads only the generation its executable imports, so
  // each ships, caches and validates on its own.
  for (const bundle of Object.values(installer.PACKAGES)) {
    assert.equal(fs.existsSync(bundle.dir), true, `${bundle.id} resources are shipped`);
    assert.equal(fs.existsSync(path.join(bundle.dir, bundle.archive)), true, `${bundle.id} recovery archive is shipped`);
    const names = installer.loaderNamesFor(bundle.id);
    assert.equal(names.length, 4, `${bundle.id} declares its four aliases`);
    for (const name of names) {
      assert.equal(fs.existsSync(path.join(bundle.dir, name)), true, `${name} is stored as a plain app resource`);
    }
    const cache = await installer.ensureBundledEmulatorDlls({ cacheDir: path.join(root, `cache-${bundle.id}`), flavour: bundle.id });
    assert.equal(cache.complete, true, `${bundle.id} cache is complete`);
    assert.equal(cache.integrated, true, `${bundle.id} seeds from the integrated files, not a custom import`);
    for (const name of names) {
      assert.equal(installer.inspectPackageDll(cache.files[name], name).arch, installer.LOADER[name].arch);
    }
  }
  const builderConfig = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron-builder.yml'), 'utf8');
  assert.match(builderConfig, /resources\/uplayR2\/\*\*/i, 'plain DLLs and the recovery archive must stay outside app.asar');
  assert.match(builderConfig, /resources\/uplayR1\/\*\*/i, 'the R1 package must stay outside app.asar too');
});

test('a manually selected equivalent DLL needs capability and architecture, not a known hash', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-custom-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const selected = writePe(path.join(root, 'new-uplayr2.dll'), 'x64', 'Achievements AchSaveType AchSavePath AchKeyPrefix custom build');
  const imported = await installer.importPackage({ packagePath: selected, cacheDir: path.join(root, 'cache') });
  assert.deepEqual(imported.imported, ['uplay_r2_loader64.dll']);
  assert.notEqual(fs.readFileSync(selected).length, 0);
});

test('a game that resolves its loader at runtime is still placed correctly', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-dynamic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  // Two of four real installs checked name no loader in their import table: they LoadLibrary it. The
  // executable still carries the API it speaks, and the generations use disjoint entry points.
  const dynamicR2 = writePe(path.join(root, 'r2', 'game.exe'), 'x64', 'UPC_AchievementUnlock UPC_AchievementListGet upc_r2_loader64.dll');
  const dynamicR1 = writePe(path.join(root, 'r1', 'game.exe'), 'x64', 'UPLAY_ACH_EarnAchievement UPLAY_ACH_GetAchievements uplay_r1_loader64.dll');
  assert.equal(installer.flavourFromExecutableStrings(dynamicR2), 'r2');
  assert.equal(installer.flavourFromExecutableStrings(dynamicR1), 'r1');
  assert.equal(installer.detectInstallFlavour({ gameDir: path.dirname(dynamicR2) }), 'r2');
  assert.equal(installer.detectInstallFlavour({ gameDir: path.dirname(dynamicR1) }), 'r1');

  // An executable naming both APIs proves nothing, and one naming neither falls back to the
  // basename it will ask for.
  const ambiguous = writePe(path.join(root, 'both', 'game.exe'), 'x64', 'UPC_AchievementUnlock UPLAY_ACH_EarnAchievement');
  assert.equal(installer.flavourFromExecutableStrings(ambiguous), '');
  // A basename alone identifies the generation but never authorizes a write: planInstall below
  // requires an achievement entry point, which a stray mention of a filename does not carry.
  const nameOnly = writePe(path.join(root, 'name', 'game.exe'), 'x64', 'loads upc_r1_loader64.dll at runtime');
  assert.equal(installer.flavourFromExecutableStrings(nameOnly), 'r1', 'the loader basename identifies the generation');
  assert.deepEqual(installer.loaderNamesFromExecutableStrings(nameOnly, 'r1'), [], 'but it places nothing on its own');
  assert.deepEqual(
    installer.loaderNamesFromExecutableStrings(dynamicR1, 'r1'),
    ['uplay_r1_loader64.dll'],
    'an executable naming the API and the basename places exactly that alias'
  );
  const nothing = writePe(path.join(root, 'none', 'game.exe'), 'x64', 'no ubisoft anything here');
  assert.equal(installer.flavourFromExecutableStrings(nothing), '');
  assert.equal(installer.detectInstallFlavour({ gameDir: path.dirname(nothing) }), '');

  // The literal scan reads in overlapping chunks, so a match spanning a chunk boundary is still found.
  const big = path.join(root, 'big.bin');
  const padding = Buffer.alloc(8 * 1024 * 1024 - 5, 0x41);
  fs.writeFileSync(big, Buffer.concat([padding, Buffer.from('UPC_AchievementUnlock', 'ascii'), Buffer.alloc(64)]));
  assert.deepEqual([...installer.scanFileForLiterals(big, ['UPC_AchievementUnlock'])], ['UPC_AchievementUnlock']);
  assert.deepEqual([...installer.scanFileForLiterals(path.join(root, 'missing.bin'), ['x'])], [], 'an unreadable file is not evidence');
});

test('recovery archives reject traversal, absolute paths, links, and NTFS streams', () => {
  assert.equal(installer.safeArchiveEntry({ file: 'loaders/upc_r2_loader64.dll', attributes: '....A' }), true);
  assert.equal(installer.safeArchiveEntry({ file: '../upc_r2_loader64.dll', attributes: '....A' }), false);
  assert.equal(installer.safeArchiveEntry({ file: 'C:/temp/upc_r2_loader64.dll', attributes: '....A' }), false);
  assert.equal(installer.safeArchiveEntry({ file: 'loader.dll:payload', attributes: '....A' }), false);
  assert.equal(installer.safeArchiveEntry({ file: 'loader-link', attributes: 'lrwxrwxrwx' }), false);
});

test('installation requires an exact executable import and matching PE architecture', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = (await installer.importPackage({ packagePath: packageDir(root), cacheDir: path.join(root, 'cache') })).cache;
  const gameDir = path.join(root, 'unknown-game');
  fs.mkdirSync(gameDir, { recursive: true });

  const untrusted = installer.planInstall({ gameDir, dlls: cache });
  assert.equal(untrusted.safe, false);
  assert.ok(untrusted.issues.some((issue) => issue.code === 'UNVERIFIED_UPLAY_R2_INSTALL'));
  const unknown = installer.planInstall({ gameDir, dlls: cache, trustedInstall: true });
  assert.equal(unknown.safe, false);
  assert.ok(unknown.issues.some((issue) => issue.code === 'NO_RUNTIME_TARGET'));

  const x64Game = path.join(root, 'x64-game');
  const x64Exe = writePe(path.join(x64Game, 'Binaries', 'Win64', 'Game.exe'), 'x64', 'imports: upc_r2_loader64.dll');
  const x64 = installer.planInstall({ gameDir: x64Game, dlls: cache, exePath: x64Exe, trustedInstall: true });
  assert.equal(x64.safe, true);
  assert.deepEqual(x64.architectures, ['x64']);
  assert.equal(x64.targets[0].name, 'upc_r2_loader64.dll');
  assert.equal(x64.targets[0].dir, path.dirname(x64Exe));

  const mismatchGame = path.join(root, 'mismatch-game');
  const badExe = writePe(path.join(mismatchGame, 'Bad64.exe'), 'x64', 'imports: uplay_r2_loader.dll');
  const mismatch = installer.planInstall({ gameDir: mismatchGame, dlls: cache, exePath: badExe, trustedInstall: true });
  assert.equal(mismatch.safe, false);
  assert.ok(mismatch.issues.some((issue) => issue.code === 'EXE_IMPORT_ARCH_MISMATCH'));

  const corruptExistingGame = path.join(root, 'corrupt-existing-game');
  const corruptLoader = writePe(path.join(corruptExistingGame, 'uplay_r2_loader64.dll'), 'x86', 'Achievements but misleading architecture');
  const unverifiedExisting = installer.planInstall({ gameDir: corruptExistingGame, dlls: cache, loaderPaths: [corruptLoader], trustedInstall: true });
  assert.equal(unverifiedExisting.safe, false, 'a bad existing suffix is not enough architecture evidence');
  assert.ok(unverifiedExisting.issues.some((issue) => issue.code === 'EXISTING_LOADER_ARCH_UNVERIFIED'));
  const repairExe = writePe(path.join(corruptExistingGame, 'Game.exe'), 'x64', 'imports: uplay_r2_loader64.dll');
  const verifiedExisting = installer.planInstall({ gameDir: corruptExistingGame, dlls: cache, loaderPaths: [corruptLoader], exePath: repairExe, trustedInstall: true });
  assert.equal(verifiedExisting.safe, true, 'an exact same-directory x64 import makes the x64 replacement deterministic');
  assert.equal(verifiedExisting.targets[0].evidence, 'pe-import-repair');

  const strayGame = path.join(root, 'stray-string-game');
  const strayExe = writePe(path.join(strayGame, 'Game.exe'), 'x64', 'log text mentions upc_r2_loader64.dll but does not import it');
  const stray = installer.planInstall({ gameDir: strayGame, dlls: cache, exePath: strayExe, trustedInstall: true });
  assert.equal(stray.safe, false, 'a filename string outside the PE import table is not installation evidence');

  const x86Game = path.join(root, 'x86-game');
  const x86Exe = writePe(path.join(x86Game, 'Win32', 'Game32.exe'), 'x86', 'imports: uplay_r2_loader.dll');
  const x86 = installer.planInstall({ gameDir: x86Game, dlls: cache, exePath: x86Exe, trustedInstall: true });
  assert.equal(x86.safe, true);
  assert.deepEqual(x86.architectures, ['x86']);
  assert.equal(x86.targets[0].name, 'uplay_r2_loader.dll');
});

test('a repair transaction validates, becomes a no-op, and restores a first install exactly', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-transaction-'));
  const savedAppData = process.env.APPDATA;
  process.env.APPDATA = path.join(root, 'AppData');
  t.after(() => {
    if (savedAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = savedAppData;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const cache = (await installer.importPackage({ packagePath: packageDir(root), cacheDir: path.join(root, 'cache') })).cache;
  const gameDir = path.join(root, 'game');
  const exe = writePe(path.join(gameDir, 'Game.exe'), 'x64', 'imports: uplay_r2_loader64.dll');
  const plan = installer.planInstall({ gameDir, dlls: cache, exePath: exe, trustedInstall: true });
  const first = installer.repairInstallation({
    gameDir,
    installPlan: plan,
    steamAppid: 33230,
    uplayId: '4',
    name: "Assassin's Creed II",
    schema: schema(),
    prefix: 'Ach_Prologue_',
  });

  assert.equal(first.changed, true);
  assert.equal(first.install.installed, 1);
  assert.ok(first.backupDir);
  assert.ok(first.validation.every((entry) => entry.ok));
  const loader = path.join(gameDir, 'uplay_r2_loader64.dll');
  assert.equal(uplayR2.inspectLoader(loader).arch, 'x64');

  const currentLoaders = uplayR2.detectEmulator(gameDir).dll;
  const noOpPlan = installer.planInstall({ gameDir, dlls: cache, loaderPaths: currentLoaders, exePath: exe, trustedInstall: true });
  const second = installer.repairInstallation({
    gameDir,
    installPlan: noOpPlan,
    loaderPaths: currentLoaders,
    steamAppid: 33230,
    uplayId: '4',
    name: "Assassin's Creed II",
    schema: schema(),
    prefix: 'Ach_Prologue_',
  });
  assert.equal(second.changed, false, 'an identical repair must not create another snapshot or rewrite files');
  assert.equal(second.backupDir, null);
  assert.equal(second.install.skipped, 1);

  const backup = uplayR2.listConfigBackups(gameDir).find((entry) => entry.dir === first.backupDir);
  const restored = uplayR2.restoreConfigBackup({ dir: gameDir, backup });
  assert.ok(restored.removed.includes('uplay_r2_loader64.dll'));
  assert.equal(fs.existsSync(loader), false);
  assert.equal(fs.existsSync(path.join(gameDir, uplayR2.ACH_SCHEMA_FILE)), false);
  for (const name of uplayR2.INI_NAMES) assert.equal(fs.existsSync(path.join(gameDir, name)), false);
});

test('failed post-write validation rolls the whole installation back', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-rollback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = (await installer.importPackage({ packagePath: packageDir(root), cacheDir: path.join(root, 'cache') })).cache;
  const gameDir = path.join(root, 'game');
  const exe = writePe(path.join(gameDir, 'Game.exe'), 'x86', 'imports: upc_r2_loader.dll');
  const plan = installer.planInstall({ gameDir, dlls: cache, exePath: exe, trustedInstall: true });

  assert.throws(
    () =>
      installer.repairInstallation({
        gameDir,
        installPlan: plan,
        steamAppid: 33230,
        uplayId: '999999999',
        name: 'Not A Real Game Xyzzy',
        schema: schema(),
        prefix: 'Ach_Prologue_',
      }),
    (error) => error.rolledBack === true && /validation failed/.test(error.message)
  );
  assert.equal(fs.existsSync(path.join(gameDir, 'upc_r2_loader.dll')), false);
  assert.equal(fs.existsSync(path.join(gameDir, uplayR2.ACH_SCHEMA_FILE)), false);
  for (const name of uplayR2.INI_NAMES) assert.equal(fs.existsSync(path.join(gameDir, name)), false);
});

test('a user-confirmed mapping validates a new catalog entry before it is persisted', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-manual-mapping-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = (await installer.importPackage({ packagePath: packageDir(root), cacheDir: path.join(root, 'cache') })).cache;
  const gameDir = path.join(root, 'new-game');
  const exe = writePe(path.join(gameDir, 'Game.exe'), 'x64', 'imports: upc_r2_loader64.dll');
  const plan = installer.planInstall({ gameDir, dlls: cache, exePath: exe, trustedInstall: true });
  const mapping = {
    uplay_id: '999001',
    steam_appid: 1234567,
    steam_name: 'A New Ubisoft Game',
    manual: true,
  };
  const result = installer.repairInstallation({
    gameDir,
    installPlan: plan,
    steamAppid: mapping.steam_appid,
    uplayId: mapping.uplay_id,
    name: mapping.steam_name,
    mapping,
    schema: schema(),
    prefix: 'Ach_Prologue_',
  });

  assert.equal(result.validation.length, 1);
  assert.equal(result.validation[0].ok, true);
  assert.equal(result.validation[0].issues.some((issue) => issue.code === 'NO_STEAM_MAPPING'), false);
});

test('a replaced loader restores exactly and backup DLLs are never detected as runtimes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-replace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = (await installer.importPackage({ packagePath: packageDir(root), cacheDir: path.join(root, 'cache') })).cache;
  const gameDir = path.join(root, 'game');
  const loader = path.join(gameDir, 'uplay_r2_loader64.dll');
  const original = fakePe('x64', 'Goldberg Uplay R2 Achievements AchSaveType AchSavePath AchKeyPrefix original');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(loader, original);

  const loaderPaths = uplayR2.detectEmulator(gameDir).dll;
  const plan = installer.planInstall({ gameDir, dlls: cache, loaderPaths, trustedInstall: true });
  const repaired = installer.repairInstallation({
    gameDir,
    installPlan: plan,
    loaderPaths,
    steamAppid: 33230,
    uplayId: '4',
    name: "Assassin's Creed II",
    schema: schema(),
    prefix: 'Ach_Prologue_',
  });
  assert.equal(repaired.install.installed, 1);
  assert.equal(uplayR2.detectEmulator(gameDir).dll.length, 1, 'the snapshot copy is not a second active runtime');

  const backup = uplayR2.listConfigBackups(gameDir).find((entry) => entry.dir === repaired.backupDir);
  const restored = uplayR2.restoreConfigBackup({ dir: gameDir, backup });
  assert.ok(restored.restored.includes('uplay_r2_loader64.dll'));
  assert.deepEqual(fs.readFileSync(loader), original);
});

test('each runtime directory is configured and validated against its own loader capabilities', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-multi-runtime-'));
  const savedAppData = process.env.APPDATA;
  process.env.APPDATA = path.join(root, 'AppData');
  t.after(() => {
    if (savedAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = savedAppData;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const gameDir = path.join(root, 'game');
  const modernDir = path.join(gameDir, 'Win64');
  const legacyDir = path.join(gameDir, 'Win32');
  const modern = writePe(path.join(modernDir, 'uplay_r2_loader64.dll'), 'x64', 'Achievements AchSaveType AchSavePath AchKeyPrefix');
  const legacy = writePe(path.join(legacyDir, 'uplay_r2_loader.dll'), 'x86', 'Achievements SaveType SavePath');
  const result = installer.repairInstallation({
    gameDir,
    loaderPaths: [modern, legacy],
    steamAppid: 33230,
    uplayId: '4',
    name: "Assassin's Creed II",
    schema: schema(),
    prefix: 'Ach_Prologue_',
  });

  assert.equal(result.validation.length, 2);
  assert.ok(result.validation.every((entry) => entry.ok));
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(modernDir, uplayR2.ACH_SCHEMA_FILE), 'utf8'))), ['Ach_Prologue_1']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(legacyDir, uplayR2.ACH_SCHEMA_FILE), 'utf8'))), ['1']);
});
