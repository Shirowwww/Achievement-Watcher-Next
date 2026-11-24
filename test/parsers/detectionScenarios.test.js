'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');
const libraryDirs = require('../../app/parser/libraryDirs.js');
const { peBytes } = require('../helpers/fakePe.js');

function writeBytes(file, size = 1024) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, /\.exe$/i.test(file) ? peBytes(size) : Buffer.alloc(size, 1));
}

async function detectIn({ build, persistSmartFind = false } = {}) {
  const userData = makeTempDir('aw-scen-user-');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-scen-root-'));
  const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-scen-env-'));
  const oldEnv = {};
  for (const key of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PUBLIC', 'PROGRAMDATA', 'HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'WINEPREFIX']) {
    oldEnv[key] = process.env[key];
  }
  process.env.USERPROFILE = envRoot;
  // On Linux the real home (Wine prefixes, XDG data) is a discovery host too, so it is sandboxed as well.
  process.env.HOME = envRoot;
  for (const key of ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'WINEPREFIX']) delete process.env[key];
  process.env.APPDATA = path.join(envRoot, 'AppData', 'Roaming');
  process.env.LOCALAPPDATA = path.join(envRoot, 'AppData', 'Local');
  process.env.PUBLIC = path.join(envRoot, 'Public');
  process.env.PROGRAMDATA = path.join(envRoot, 'ProgramData');
  fs.mkdirSync(process.env.APPDATA, { recursive: true });
  fs.mkdirSync(process.env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(path.join(process.env.PUBLIC, 'Desktop'), { recursive: true });
  fs.mkdirSync(process.env.PROGRAMDATA, { recursive: true });

  achievements.initDebug({ isDev: false, userDataPath: userData });
  await libraryDirs.save([root]);
  try {
    if (build) build({ root, envRoot });
    // Smart Find is a review/persistence step now: discovery never injects invisible roots directly
    // into the achievement scan.
    if (persistSmartFind) {
      const detected = (await libraryDirs.findEntries()).filter((entry) => path.resolve(entry.path).startsWith(path.resolve(envRoot) + path.sep));
      await libraryDirs.save([{ path: root, origin: 'manual', enabled: true }, ...detected]);
    }
    return await achievements.detectInstalledAppids({
      achievement_source: { steamEmu: true },
      steam: { main: null },
    });
  } finally {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(envRoot, { recursive: true, force: true });
  }
}

function install(root, name, files = [], dirs = []) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(dir, file), 'x');
  for (const sub of dirs) fs.mkdirSync(path.join(dir, sub), { recursive: true });
}

test('official launcher games and non-game apps in a library root are never surfaced', async () => {
  const found = await detectIn({
    build: ({ root }) => {
      install(root, 'Epic Game', ['EpicGame.exe'], ['.egstore']);
      install(root, 'GOG Game', ['goggame-1423049311.info', 'GogGame.exe']);
      install(root, 'Ubi Game', ['uplay_install.state', 'UbiGame.exe']);
      install(root, 'MS Game', ['AppxManifest.xml', 'MsGame.exe']);
      install(root, 'Firefox', ['firefox.exe']);
      install(root, 'Docker', ['Docker Desktop.exe']);
      install(root, 'Office', ['winword.exe']);
      install(root, 'Cheat Engine', ['Cheat Engine.exe']);
    },
  });
  assert.deepEqual(found, []);
});

test('legit Steam-style steamapps/common subtrees are skipped', async () => {
  const found = await detectIn({
    build: ({ root }) => install(root, 'steamapps/common/Portal 2', ['portal2.exe']),
  });
  assert.deepEqual(found, []);
});

test('a Goldberg game with steam markers is promoted to its appid', async () => {
  const found = await detectIn({
    build: ({ root }) => {
      const dir = path.join(root, 'Real Game');
      fs.mkdirSync(path.join(dir, 'steam_settings'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'steam_settings', 'steam_appid.txt'), '12345');
      writeBytes(path.join(dir, 'steam_api64.dll'));
      writeBytes(path.join(dir, 'RealGame.exe'));
    },
  });
  assert.ok(found.includes('12345'));
  assert.ok(!found.some((id) => id.startsWith('local-')));
});

test('a renamed bare exe folder yields one local entry named from PE metadata', (t) => {
  const notepad = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'notepad.exe');
  if (!fs.existsSync(notepad)) {
    t.skip('no system PE available for the metadata-naming scenario');
    return;
  }
  return detectIn({
    build: ({ root }) => {
      const dir = path.join(root, 'Game123');
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(notepad, path.join(dir, 'Game123.exe'));
    },
  }).then((found) => {
    assert.equal(found.filter((id) => id.startsWith('local-')).length, 1);
  });
});

test('Desktop\\Jeux\\<game> nested installs are found, loose Desktop folders are not', async () => {
  const found = await detectIn({
    build: ({ envRoot }) => {
      writeBytes(path.join(envRoot, 'Desktop', 'Jeux', 'Nested Game', 'NestedGame.exe'));
      writeBytes(path.join(envRoot, 'Desktop', 'Random Folder', 'random.exe'));
    },
    persistSmartFind: true,
  });
  assert.equal(found.filter((id) => id.startsWith('local-')).length, 1);
});

test('portable games under an AppData\\Games profile root are found', async () => {
  const found = await detectIn({
    build: ({ envRoot }) => {
      writeBytes(path.join(envRoot, 'AppData', 'Local', 'Games', 'Portable Game', 'PortableGame.exe'));
    },
    persistSmartFind: true,
  });
  assert.equal(found.filter((id) => id.startsWith('local-')).length, 1);
});

test('a leftover emulator save folder still maps to its appid (folder-based detection by design)', async () => {
  const found = await detectIn({
    build: ({ envRoot }) => {
      writeBytes(path.join(envRoot, 'AppData', 'Roaming', 'Goldberg SteamEmu Saves', '99999', 'achievements.ini'), 64);
    },
  });
  assert.ok(found.includes('99999'));
});

test('a cracked Uplay R2 install (markers + loader) is promoted, not skipped as official', async () => {
  const found = await detectIn({
    build: ({ root }) => {
      const dir = path.join(root, 'Completely Unrelated Repack Folder');
      fs.mkdirSync(dir, { recursive: true });
      writeBytes(path.join(dir, 'ACBlackFlag.exe'));
      fs.writeFileSync(path.join(dir, 'uplay_install.manifest'), '{}');
      fs.writeFileSync(path.join(dir, 'uplay_install.state'), "Assassin's Creed Black Flag Resynced");
      writeBytes(path.join(dir, 'upc_r2_loader64.dll'));
      fs.writeFileSync(path.join(dir, 'upc_r2.ini'), '[Settings]\nAchievements = 0\n');
    },
  });
  assert.ok(found.includes('3751950'));
  assert.ok(!found.some((id) => id.startsWith('local-')));
});

// A repack as downloaded: the installer, its split archives and the checksum verifier it ships
// (FitGirl and DODI put QuickSFV in MD5\, others another tool beside a .sfv list).
function repackFolder(dir, { verifierDir = 'MD5', verifierExe = 'QuickSFV.EXE', list = 'fitgirl-bins.md5' } = {}) {
  writeBytes(path.join(dir, 'setup.exe'));
  writeBytes(path.join(dir, 'fg-01.bin'), 64);
  writeBytes(path.join(dir, 'fg-02.bin'), 64);
  fs.writeFileSync(path.join(dir, 'Verify BIN files before installation.bat'), '@echo off\n');
  writeBytes(path.join(dir, verifierDir, verifierExe));
  fs.writeFileSync(path.join(dir, verifierDir, 'QuickSFV.ini'), '[QuickSFV]\n');
  fs.writeFileSync(path.join(dir, verifierDir, list), 'd41d8cd98f00b204e9800998ecf8427e *fg-01.bin\n');
}

test('repack installers and their checksum verifiers are never surfaced as games', async () => {
  const found = await detectIn({
    build: ({ root }) => {
      repackFolder(path.join(root, 'Repacks', 'Dead Space 2 [FitGirl Repack]'));
      repackFolder(path.join(root, 'Repacks', 'Control'), { verifierDir: 'Verify', verifierExe: 'HashCheck.exe', list: 'control.sfv' });
      // ElAmigos: an installer and its archives only, nothing to descend into.
      const elamigos = path.join(root, 'Repacks', 'Some Game ElAmigos');
      writeBytes(path.join(elamigos, 'setup.exe'));
      fs.writeFileSync(path.join(elamigos, 'autorun.inf'), '[autorun]\nopen=setup.exe\n');
      writeBytes(path.join(elamigos, 'data1.bin'), 64);
    },
  });
  assert.deepEqual(found, []);
});

test('a real game is still found beside a setup.exe, a checksum list or its own repack files', async () => {
  const found = await detectIn({
    build: ({ root }) => {
      // An old game whose install keeps its own setup tool and a checksum list.
      const old = path.join(root, 'Old Game');
      writeBytes(path.join(old, 'OldGame.exe'));
      writeBytes(path.join(old, 'setup.exe'));
      writeBytes(path.join(old, 'binkw32.dll'), 64);
      fs.writeFileSync(path.join(old, 'checksums.md5'), 'x *OldGame.exe\n');
      // A repack installed into a folder inside its own download.
      const repack = path.join(root, 'Repacks', 'Nine Sols');
      repackFolder(repack);
      writeBytes(path.join(repack, 'Nine Sols', 'NineSols.exe'));
      writeBytes(path.join(repack, 'Nine Sols', 'UnityPlayer.dll'), 64);
    },
  });
  assert.equal(found.filter((id) => id.startsWith('local-')).length, 2, `found: ${found.join(', ')}`);
});

// The id achievements.js mints for an unconfigured install folder.
const { crc32 } = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'crc'));
const localId = (dir) => 'local-' + (crc32(path.resolve(dir).toLowerCase()) >>> 0).toString(16);

test('an overlay injector folder and an emulator a game ships are not games of their own', async () => {
  const dirs = {};
  const found = await detectIn({
    build: ({ root }) => {
      // Mass Effect Legendary Edition: EA's overlay injector beside Valve's dll, in a __ tool folder.
      dirs.overlay = path.join(root, 'Mass Effect Legendary Edition', '__overlay');
      writeBytes(path.join(dirs.overlay, 'overlayinjector.exe'));
      writeBytes(path.join(dirs.overlay, 'steam_api.dll'), 64);
      // A port shipped as the console game plus the emulator that runs it (Bayonetta 2 with Cemu).
      dirs.port = path.join(root, 'Bayonetta 2');
      dirs.cemu = path.join(dirs.port, 'cemu');
      writeBytes(path.join(dirs.cemu, 'Cemu.exe'));
      writeBytes(path.join(dirs.port, 'code', 'rpx.bin'), 64);
      // An emulator installed on its own is a tool, not a game.
      writeBytes(path.join(root, 'Ryujinx', 'Ryujinx.exe'));
    },
  });
  assert.ok(!found.includes(localId(dirs.overlay)), 'the overlay injector folder');
  assert.ok(!found.includes(localId(dirs.cemu)), 'the emulator folder itself');
  assert.ok(found.includes(localId(dirs.port)), `the game the emulator runs is listed (found: ${found.join(', ')})`);
  assert.equal(found.filter((id) => id.startsWith('local-')).length, 1, `found: ${found.join(', ')}`);
});

// #228: emulator builds kept in folders of their own were listed as games, one per build.
test('an emulator build in a folder of its own is not a game, whatever exe sorts first', async () => {
  const dirs = {};
  const found = await detectIn({
    build: ({ root }) => {
      // yuzu-cmd.exe sorts before yuzu.exe, and the build sits one level down.
      dirs.yuzu = path.join(root, '_Yuzu');
      for (const exe of ['yuzu-cmd.exe', 'yuzu-room.exe', 'yuzu.exe']) writeBytes(path.join(dirs.yuzu, 'yuzu-windows-msvc', exe));
      // A Ryujinx release unzipped as is: <zip name>\publish\Ryujinx.exe.
      dirs.ryujinx = path.join(root, 'ryujinx-1.1.1403-win_x64');
      writeBytes(path.join(dirs.ryujinx, 'publish', 'Ryujinx.exe'));
      // The game a shipped emulator runs is still a game.
      dirs.port = path.join(root, 'Bayonetta 2');
      writeBytes(path.join(dirs.port, 'cemu', 'Cemu.exe'));
      // So is a game whose own program sits beside the emulator.
      dirs.beside = path.join(root, 'Zelda Pack');
      writeBytes(path.join(dirs.beside, 'Play Zelda.exe'));
      writeBytes(path.join(dirs.beside, 'yuzu.exe'));
    },
  });
  assert.ok(found.includes(localId(dirs.beside)), `a game beside its emulator is listed (found: ${found.join(', ')})`);
  assert.ok(!found.includes(localId(dirs.yuzu)), 'the yuzu folder');
  assert.ok(!found.includes(localId(path.join(dirs.yuzu, 'yuzu-windows-msvc'))), 'the yuzu build');
  assert.ok(!found.includes(localId(dirs.ryujinx)), 'the Ryujinx release');
  assert.ok(found.includes(localId(dirs.port)), `the game is listed (found: ${found.join(', ')})`);
  assert.equal(found.filter((id) => id.startsWith('local-')).length, 2, `found: ${found.join(', ')}`);
});

test('a tool whose version resource says what it is never becomes a game', () => {
  const isTool = achievements._internal.isNonGameProduct;
  for (const product of ['Python', 'QtWebEngine internal process', 'RTPatch Executable', 'Blake3 Hasher']) assert.equal(isTool(product), true, product);
  for (const product of ['Hollow Knight', 'Carbon', 'Python Adventure', '']) assert.equal(isTool(product), false, product);
  // Unreal's root stub names the engine, not the game: the folder does better.
  assert.equal(achievements._internal.unconfiguredDisplayName('Hollow Game', 'HollowGame.exe', 'BootstrapPackagedGame'), 'Hollow Game');
});

test('a version resource that names a tool never becomes the game title', () => {
  const name = achievements._internal.unconfiguredDisplayName;
  assert.equal(name('Need For Speed Carbon Remastered', 'NFSC.exe', 'CDKey'), 'Need For Speed Carbon Remastered');
  assert.equal(name('Bayonetta 2', 'Cemu.exe', 'Wii U emulator'), 'Bayonetta 2');
  assert.equal(name('Batman', 'QuickSFV.EXE', 'QuickSFV Application'), 'Batman');
  assert.equal(name('Some Game', 'Trainer.exe', 'Some Game Trainer'), 'Some Game');
  // A renamed repack folder keeps taking the exe's real product name.
  assert.equal(name('Game123', 'hk.exe', 'Hollow Knight'), 'Hollow Knight');
  assert.equal(name('0x1f3a', 'g.exe', 'Overlord: Raising Hell'), 'Overlord: Raising Hell');
  assert.equal(name('Patchwork Game', 'pw.exe', 'Patchwork'), 'Patchwork');
});

test('a real game in a folder named like a tool word is still found', async () => {
  const found = await detectIn({
    build: ({ root }) => {
      writeBytes(path.join(root, 'Overlord', 'Overlord.exe'));
      writeBytes(path.join(root, 'Overlord', 'binkw32.dll'), 64);
      writeBytes(path.join(root, 'Overcooked', 'Overcooked.exe'));
    },
  });
  assert.equal(found.filter((id) => id.startsWith('local-')).length, 2, `found: ${found.join(', ')}`);
});
