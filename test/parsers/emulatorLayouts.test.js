'use strict';

/*
  The emulator layouts that are supported settings rather than exotic setups: shadPS4 moving its
  user data under `user/` and into %APPDATA%, Xenia relocating its content tree with
  storage_root/content_root, and the registry route to an emulator installed under a folder name
  no heuristic would probe. Each of these used to end in an empty scan with nothing to explain it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const shadps4 = require('../../app/parser/shadps4.js');
const xenia = require('../../app/parser/xenia.js');
const userDir = require('../../app/parser/userDir.js');
const saveRoots = require('../../app/parser/saveRoots.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('shadPS4 climbs out of its own trophy tree, from whichever level was added', () => {
  const emulator = path.resolve('D:', 'Emulators', 'shadPS4');
  const candidates = shadps4._internal.gameDataRootCandidates(path.join(emulator, 'user'));

  // Most specific first: the level the user actually pointed at.
  assert.equal(candidates[0], path.join(emulator, 'user', 'game_data'));
  assert.ok(candidates.includes(path.join(emulator, 'game_data')), 'the emulator folder itself must still be reachable');
  assert.equal(new Set(candidates).size, candidates.length, 'candidates must not repeat');

  // A guide names the CUSA folder more often than the root, and that is four levels deep.
  const deep = shadps4._internal.gameDataRootCandidates(path.join(emulator, 'game_data', 'CUSA12345', 'TrophyFiles', 'trophy00'));
  assert.ok(deep.includes(path.join(emulator, 'game_data')));
});

test('a folder that is not part of the tree does not borrow the trophies above it', () => {
  // Caught against the real install on the development machine: a blind walk up made
  // %APPDATA%\shadPS4\log - and every other sibling of game_data - report the emulator's games.
  const emulator = path.resolve('D:', 'Emulators', 'shadPS4');
  for (const sibling of ['log', 'savedata', 'shader', 'Some Game']) {
    const candidates = shadps4._internal.gameDataRootCandidates(path.join(emulator, sibling));
    assert.ok(
      !candidates.some((candidate) => candidate === path.join(emulator, 'game_data')),
      `${sibling} must not resolve to the emulator's game_data`
    );
    const configs = shadps4._internal.configFileCandidates(path.join(emulator, sibling));
    assert.ok(!configs.includes(path.join(emulator, 'config.toml')), `${sibling} must not read the emulator's config.toml`);
  }
});

test('shadPS4 accepts the game_data folder itself, which is what people copy out of a guide', () => {
  const gameData = path.resolve('C:', 'shadPS4', 'user', 'game_data');
  assert.equal(shadps4._internal.gameDataRootCandidates(gameData)[0], gameData);
});

test('shadPS4 finds config.toml beside the binary or under user/', () => {
  const emulator = path.resolve('D:', 'shadPS4');
  const files = shadps4._internal.configFileCandidates(path.join(emulator, 'user', 'game_data'));
  assert.ok(files.includes(path.join(emulator, 'user', 'game_data', 'config.toml')));
  assert.ok(files.includes(path.join(emulator, 'user', 'config.toml')));
  assert.ok(files.includes(path.join(emulator, 'config.toml')));
});

test('a shadPS4 trophy tree under user/ is discovered', async () => {
  const emulator = tmpdir('aw-shadps4-user-');
  const trophyDir = path.join(emulator, 'user', 'game_data', 'CUSA12345', 'TrophyFiles', 'trophy00');
  fs.mkdirSync(path.join(trophyDir, 'Xml'), { recursive: true });
  fs.writeFileSync(path.join(trophyDir, 'Xml', 'TROP.XML'), '<trophyconf></trophyconf>', 'utf8');

  const found = await shadps4.scan(emulator);
  assert.equal(found.length, 1);
  assert.equal(found[0].appid, 'CUSA12345');
  assert.equal(found[0].source, 'ShadPS4 Emulator');
  // No config.toml means nothing proves the PS4 game is still installed.
  assert.equal(found[0].data.trustedInstalled, false);
});

test('a Xenia config that relocates the content tree is followed', () => {
  assert.equal(xenia._internal.tomlString('content_root = "D:\\\\Xenia\\\\content"', 'content_root'), 'D:\\Xenia\\content');
  assert.equal(xenia._internal.tomlString("storage_root = 'E:/XeniaData'", 'storage_root'), 'E:/XeniaData');
  assert.equal(xenia._internal.tomlString('storage_root = ""', 'storage_root'), '', 'the default empty value must not be treated as a path');
  assert.equal(xenia._internal.tomlString('other = "x"', 'content_root'), '');
});

test('Xenia scans the configured content root, not only <dir>/content', async () => {
  const emulator = tmpdir('aw-xenia-config-');
  const storage = tmpdir('aw-xenia-storage-');
  fs.writeFileSync(path.join(emulator, 'xenia-canary.config.toml'), `[Storage]\nstorage_root = "${storage.replace(/\\/g, '\\\\')}"\n`, 'utf8');
  fs.mkdirSync(path.join(storage, 'content'), { recursive: true });

  const roots = await xenia._internal.configuredStorageRoots(emulator);
  assert.deepEqual(roots, [path.join(path.resolve(storage), 'content')]);

  // A GPD whose name matches its titleID folder is the per-title achievement file.
  const gpdDir = path.join(storage, 'content', '0009041500000000', '4D5308ED', '00000001');
  fs.mkdirSync(gpdDir, { recursive: true });
  fs.writeFileSync(path.join(gpdDir, '4D5308ED.gpd'), Buffer.alloc(4));

  const found = await xenia.scan(emulator);
  assert.deepEqual(found.map((entry) => entry.appid), ['4D5308ED']);
});

test('Xenia still works with no config file at all', async () => {
  const emulator = tmpdir('aw-xenia-plain-');
  const gpdDir = path.join(emulator, 'content', '0009041500000000', 'ABCD1234', '00000001');
  fs.mkdirSync(gpdDir, { recursive: true });
  fs.writeFileSync(path.join(gpdDir, 'ABCD1234.gpd'), Buffer.alloc(4));

  assert.deepEqual((await xenia.scan(emulator)).map((entry) => entry.appid), ['ABCD1234']);
});

test('an emulator recorded by Windows is found without touching the disk', () => {
  const registry = {
    readRegistryStringAndExpand(hive, key, valueName) {
      if (hive === 'HKLM' && key.endsWith('App Paths/rpcs3.exe') && valueName === '') return 'D:\\Tools\\PS3\\rpcs3.exe';
      if (hive === 'HKLM' && /Uninstall\/shadPS4$/.test(key) && valueName === 'InstallLocation') return 'C:\\PS4\\shadPS4\\';
      return null;
    },
    listRegistryAllSubkeys(hive, key) {
      if (hive === 'HKLM' && key === 'Software/Microsoft/Windows/CurrentVersion/Uninstall') {
        // A real machine holds hundreds of these; only the emulator keys may be read further.
        return ['{some-guid}', 'shadPS4', 'Notepad++'];
      }
      return [];
    },
  };

  const roots = userDir._internal.emulatorRootsFromRegistry(registry);
  // An App Paths value names the executable, an uninstall entry names the folder: both land as folders.
  assert.ok(roots.includes('D:\\Tools\\PS3'));
  assert.ok(roots.includes('C:\\PS4\\shadPS4'));
});

test('a registry with nothing in it contributes nothing instead of throwing', () => {
  const registry = {
    readRegistryStringAndExpand() {
      throw new Error('key not found');
    },
    listRegistryAllSubkeys() {
      throw new Error('key not found');
    },
  };
  assert.deepEqual(userDir._internal.emulatorRootsFromRegistry(registry), []);
});

test('a relocated RPCS3 virtual disk is accepted as a watchable folder', async () => {
  const disk = tmpdir('aw-rpcs3-disk-accept-');
  fs.mkdirSync(path.join(disk, 'home', '00000001', 'trophy', 'NPWR12345_00'), { recursive: true });

  const diagnosis = await userDir.diagnose(disk);
  assert.equal(diagnosis.accepted, true);
  assert.equal(diagnosis.code, 'emulator-data');
  assert.equal(diagnosis.evidence.emulator, 'rpcs3');
});

test('a shadPS4 data folder with no binary in it is accepted too', async () => {
  const appdata = tmpdir('aw-shadps4-appdata-');
  fs.mkdirSync(path.join(appdata, 'user', 'game_data', 'CUSA00001'), { recursive: true });

  const diagnosis = await userDir.diagnose(appdata);
  assert.equal(diagnosis.accepted, true);
  assert.equal(diagnosis.evidence.emulator, 'shadps4');
});

test('an unrelated folder is still refused, with its reason', async () => {
  const empty = tmpdir('aw-emulator-unrelated-');
  const diagnosis = await userDir.diagnose(empty);
  assert.equal(diagnosis.accepted, false);
  assert.equal(diagnosis.code, 'no-marker');
});

test('the emulator folder allowlist is separate from the game-library one', () => {
  // A portable RPCS3 never sits in a folder called "Games", which is why the binary search kept
  // missing it; the two lists must not be merged back together.
  assert.ok(saveRoots.EMULATOR_LIBRARY_FOLDER_NAMES.includes('Emulators'));
  assert.ok(saveRoots.EMULATOR_LIBRARY_FOLDER_NAMES.includes('Emulation'));
  for (const name of saveRoots.EMULATOR_LIBRARY_FOLDER_NAMES) {
    assert.ok(!saveRoots.GAME_LIBRARY_FOLDER_NAMES.includes(name), `${name} is in both lists`);
  }
});

test('emulator folders are probed on drives and under the profile, and only if they exist', async () => {
  const roots = await saveRoots.discoverEmulatorRoots();
  assert.ok(Array.isArray(roots));
  for (const root of roots) assert.ok(fs.existsSync(root), `${root} was reported but does not exist`);
});
