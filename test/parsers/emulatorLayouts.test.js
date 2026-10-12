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

// Current Canary keeps title GPDs inside the profile package, next to the dashboard's own GPD.
function canaryProfile(root) {
  const profile = path.join(root, 'content', 'E0300000DEADBEEF', 'FFFE07D1', '00010000', 'E0300000DEADBEEF');
  fs.mkdirSync(profile, { recursive: true });
  for (const name of ['FFFE07D1.gpd', '4D5307E6.gpd', 'Account']) fs.writeFileSync(path.join(profile, name), Buffer.alloc(4));
  return profile;
}

test('Xenia Canary profile-package GPDs are found from the emulator folder', async () => {
  const emulator = tmpdir('aw-xenia-canary-');
  canaryProfile(emulator);
  assert.deepEqual((await xenia.scan(emulator)).map((entry) => entry.appid), ['4D5307E6']);
});

test('the Xenia folder holding the .gpd files can be added directly', async () => {
  const profile = canaryProfile(tmpdir('aw-xenia-profile-'));
  assert.deepEqual((await xenia.scan(profile)).map((entry) => entry.appid), ['4D5307E6']);
  const diagnosis = await userDir.diagnose(profile);
  assert.equal(diagnosis.accepted, true);
  assert.equal(diagnosis.evidence.emulator, 'xenia');
});

// A host as util/winHosts.js builds it, over a hand-written registry.
function registryHost({ value, subkeys }) {
  return { regValue: value, regSubkeys: subkeys, localPath: (p) => p };
}

test('an emulator recorded by Windows is found without touching the disk', () => {
  const host = registryHost({
    value(hive, key, valueName) {
      if (hive === 'HKLM' && key.endsWith('App Paths/rpcs3.exe') && valueName === '') return 'D:\\Tools\\PS3\\rpcs3.exe';
      if (hive === 'HKLM' && key.endsWith('Uninstall/shadPS4') && valueName === 'InstallLocation') return 'C:\\PS4\\shadPS4\\';
      return null;
    },
    subkeys(hive, key) {
      if (hive === 'HKLM' && key === 'Software/Microsoft/Windows/CurrentVersion/Uninstall') {
        // A real machine holds hundreds of these; only the emulator keys may be read further.
        return ['{some-guid}', 'shadPS4', 'Notepad++'];
      }
      return [];
    },
  });

  const roots = userDir._internal.emulatorRootsFromRegistry([host]);
  // An App Paths value names the executable, an uninstall entry names the folder: both land as folders.
  assert.ok(roots.includes('D:\\Tools\\PS3'));
  assert.ok(roots.includes('C:\\PS4\\shadPS4'));
});

test('a registry with nothing in it contributes nothing instead of throwing', () => {
  const host = registryHost({
    value() {
      throw new Error('key not found');
    },
    subkeys() {
      throw new Error('key not found');
    },
  });
  assert.deepEqual(userDir._internal.emulatorRootsFromRegistry([host]), []);
});

test('a relocated RPCS3 virtual disk is accepted as a watchable folder', async () => {
  const disk = tmpdir('aw-rpcs3-disk-accept-');
  fs.mkdirSync(path.join(disk, 'home', '00000001', 'trophy', 'NPWR12345_00'), { recursive: true });

  const diagnosis = await userDir.diagnose(disk);
  assert.equal(diagnosis.accepted, true);
  assert.equal(diagnosis.code, 'emulator-data');
  assert.equal(diagnosis.evidence.emulator, 'rpcs3');
});

// shadPS4 0.19: schema in trophy/<NPWR>, unlocks in a per-user TROPCONF copy saved by pugixml.
function writeNpTrophySet(userRoot, id, { unlocked = [], userId = '1000', home = path.join(userRoot, 'home') } = {}) {
  const trophyDir = path.join(userRoot, 'trophy', id);
  fs.mkdirSync(path.join(trophyDir, 'Xml'), { recursive: true });
  fs.writeFileSync(
    path.join(trophyDir, 'Xml', 'TROP.XML'),
    `<trophyconf><title-name>Demo</title-name><trophy id="000" hidden="no" ttype="P"><name>Platinum</name><detail>All</detail></trophy><trophy id="001" hidden="no" ttype="B"><name>First</name><detail>One</detail></trophy></trophyconf>`
  );
  fs.writeFileSync(path.join(trophyDir, 'Xml', 'TROPCONF.XML'), `<trophyconf><npcommid>${id}</npcommid><trophy id="000" hidden="no" ttype="P" pid="-1" /><trophy id="001" hidden="no" ttype="B" pid="000" /></trophyconf>`);
  const state = path.join(home, userId, 'trophy', `${id}.xml`);
  fs.mkdirSync(path.dirname(state), { recursive: true });
  const trophies = ['000', '001'].map((tid) =>
    unlocked.includes(tid) ? `<trophy id="${tid}" ttype="B" unlockstate="true" timestamp="1760000000" />` : `<trophy id="${tid}" ttype="B" />`
  );
  fs.writeFileSync(state, `<?xml version="1.0"?>\n<trophyconf><npcommid>${id}</npcommid>${trophies.join('')}</trophyconf>`);
  return { trophyDir, state };
}

test('shadPS4 0.19 trophies are read from trophy/ and the unlocks from the user home', async () => {
  const userRoot = tmpdir('aw-shadps4-019-');
  const { trophyDir, state } = writeNpTrophySet(userRoot, 'NPWR12345_00', { unlocked: ['001'] });

  const found = await shadps4.scan(userRoot);
  assert.equal(found.length, 1);
  assert.equal(found[0].appid, 'NPWR12345_00');
  assert.equal(found[0].data.path, trophyDir);
  assert.equal(found[0].data.statePath, state);

  const game = await shadps4.getGameData(found[0].data.path, 'english');
  assert.equal(game.appid, 'NPWR12345_00');
  assert.equal(game.achievement.total, 2);
  const unlocks = await shadps4.getAchievements(found[0].data.path, found[0].data.statePath);
  assert.deepEqual(
    unlocks.map((t) => [t.id, t.achieved, t.earned_time]),
    [
      [0, false, 0],
      [1, true, 1760000000],
    ]
  );
});

test('a game moved to the 0.19 layout is listed once, from the new layout', async () => {
  const userRoot = tmpdir('aw-shadps4-both-');
  writeNpTrophySet(userRoot, 'NPWR12345_00');
  const old = path.join(userRoot, 'game_data', 'CUSA12345', 'TrophyFiles', 'trophy00', 'Xml');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'TROP.XML'), '<trophyconf></trophyconf>');
  fs.writeFileSync(path.join(old, 'TROPCONF.XML'), '<trophyconf><npcommid>NPWR12345_00</npcommid></trophyconf>');

  assert.deepEqual(
    (await shadps4.scan(userRoot)).map((entry) => entry.appid),
    ['NPWR12345_00']
  );
});

test('shadPS4 0.19 config.json gives the install folders and the moved home folder', async () => {
  const userRoot = tmpdir('aw-shadps4-json-');
  const games = tmpdir('aw-shadps4-games-');
  const home = tmpdir('aw-shadps4-home-');
  const sceSys = path.join(games, 'CUSA12345', 'sce_sys');
  fs.mkdirSync(sceSys, { recursive: true });
  fs.writeFileSync(path.join(games, 'CUSA12345', 'eboot.bin'), 'x');
  fs.writeFileSync(path.join(sceSys, 'param.sfo'), 'PSF\0CUSA12345\0');
  fs.writeFileSync(path.join(sceSys, 'npbind.dat'), 'NPBD\0NPWR12345_00\0');
  fs.writeFileSync(
    path.join(userRoot, 'config.json'),
    JSON.stringify({ General: { install_dirs: [{ path: games, enabled: true }], home_dir: home } })
  );
  const { state } = writeNpTrophySet(userRoot, 'NPWR12345_00', { home });

  const [entry] = await shadps4.scan(userRoot);
  assert.equal(entry.data.trustedInstalled, true);
  assert.equal(entry.data.gameDir, path.join(games, 'CUSA12345'));
  assert.equal(entry.data.statePath, state);
});

test('the newest per-user copy wins when several shadPS4 users played the game', async () => {
  const userRoot = tmpdir('aw-shadps4-users-');
  writeNpTrophySet(userRoot, 'NPWR12345_00', { userId: '1000' });
  const { state } = writeNpTrophySet(userRoot, 'NPWR12345_00', { userId: '1001', unlocked: ['000'] });
  fs.utimesSync(path.join(userRoot, 'home', '1000', 'trophy', 'NPWR12345_00.xml'), new Date(2020, 0, 1), new Date(2020, 0, 1));

  const [entry] = await shadps4.scan(userRoot);
  assert.equal(entry.data.statePath, state);
});

test('a shadPS4 0.19 data folder is accepted from its root or its trophy folder', async () => {
  const userRoot = tmpdir('aw-shadps4-accept-');
  writeNpTrophySet(userRoot, 'NPWR12345_00');
  for (const dir of [userRoot, path.join(userRoot, 'trophy')]) {
    const diagnosis = await userDir.diagnose(dir);
    assert.equal(diagnosis.accepted, true, dir);
    assert.equal(diagnosis.evidence.emulator, 'shadps4');
  }
});

test('Xenia without portable.txt is found under Documents\\Xenia', { skip: process.platform !== 'win32' && 'Windows-only' }, async (t) => {
  const profile = tmpdir('aw-xenia-docs-');
  const xeniaDir = path.join(profile, 'Documents', 'Xenia');
  fs.mkdirSync(path.join(xeniaDir, 'content'), { recursive: true });
  const saved = process.env.USERPROFILE;
  process.env.USERPROFILE = profile;
  t.after(() => {
    process.env.USERPROFILE = saved;
  });

  assert.ok((await userDir.findEntries()).some((entry) => entry.path === xeniaDir));
});

test('a shadPS4 data folder with no binary in it is accepted too', async () => {
  const appdata = tmpdir('aw-shadps4-appdata-');
  fs.mkdirSync(path.join(appdata, 'user', 'game_data', 'CUSA00001'), { recursive: true });

  const diagnosis = await userDir.diagnose(appdata);
  assert.equal(diagnosis.accepted, true);
  assert.equal(diagnosis.evidence.emulator, 'shadps4');
});

test('a KytyPS5 folder is accepted from the emulator, its _Trophies or one title inside it', async () => {
  const root = tmpdir('aw-kytyps5-accept-');
  const title = path.join(root, '_Trophies', 'PPSA01325');
  fs.mkdirSync(title, { recursive: true });
  fs.writeFileSync(path.join(title, 'trophies_1000_0.json'), '{"unlockedTrophies":[]}');

  for (const level of [root, path.join(root, '_Trophies'), title]) {
    const diagnosis = await userDir.diagnose(level);
    assert.equal(diagnosis.accepted, true, level);
    assert.equal(diagnosis.evidence.emulator, 'kytyps5');
    assert.deepEqual(diagnosis.evidence.roots, [root]);
  }
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
