'use strict';

// The ports whose unlock list moves with a setting, a mod, a profile or an older release, and the
// Linux builds. Fixtures are synthetic: every folder, registry value and program is made up here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const x360 = require('../../app/parser/x360Recomp.js');
const { buildXex } = require('../helpers/xex.js');

const SPA = Buffer.concat([Buffer.from('XDBF'), Buffer.alloc(60, 1)]);
const xexOf = (titleId) => buildXex({ spa: SPA, titleId: parseInt(titleId, 16) });
const FILETIME = '134329715212621157';
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const unlockedToml = (...ids) => ids.map((id) => `[unlocked.${id}]\nfiletime = ${FILETIME}\n`).join('\n');

// A library with its own Documents, APPDATA, LOCALAPPDATA, registry and Linux home.
function setup(t, { platform = 'win32', env = {}, registry = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-x360layouts-'));
  const folders = {
    library: path.join(root, 'Games'),
    documents: path.join(root, 'Docs'),
    appData: path.join(root, 'Roaming'),
    localAppData: path.join(root, 'Local'),
    home: path.join(root, 'home'),
  };
  for (const dir of Object.values(folders)) fs.mkdirSync(dir, { recursive: true });
  x360.setDataRoot(path.join(root, 'data'));
  x360.setPortFolders({
    documentsFor: () => folders.documents,
    appDataFor: () => folders.appData,
    localAppDataFor: () => folders.localAppData,
    regValue: (hive, key, name) => registry[`${hive}/${key}/${name}`] || null,
    env,
    platform,
    linux: { home: folders.home, env: {} },
  });
  t.after(() => {
    x360.setDataRoot('');
    x360.setPortFolders(null);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return folders;
}

function install(folders, name, exes, content = 'MZ') {
  const dir = path.join(folders.library, name);
  for (const exe of exes) write(path.join(dir, exe), content);
  return dir;
}

const only = (games, appid) => games.filter((g) => g.appid === appid);
const ids = (game) => x360.getAchievements(game.data).map((a) => a.id);

test('Gears of War 2 waits under LOCALAPPDATA, follows gow2_save_dir, and finds its game data', (t) => {
  const folders = setup(t, { env: { AppData: '' } });
  const dir = install(folders, 'Gears 2 PC', ['gow2.exe']);
  let [game] = only(x360.scan(folders.library), 'x360-4D53082D');
  assert.equal(game.data.file, path.join(folders.localAppData, 'GearsOfWar2PC', 'user', 'achievements', '4D53082D.toml'));
  assert.equal(game.data.pending, true);

  write(path.join(dir, 'gow2.toml'), "# settings\ngow2_save_dir = 'my saves'\n");
  [game] = only(x360.scan(folders.library), 'x360-4D53082D');
  assert.equal(game.data.file, path.join(dir, 'my saves', 'achievements', '4D53082D.toml'), 'relative to gow2.toml');

  write(path.join(dir, 'gow2.toml'), 'gow2_save_dir = "%APPDATA%\\\\Gears"\n');
  [game] = only(x360.scan(folders.library), 'x360-4D53082D');
  assert.equal(game.data.file, path.join(folders.localAppData, 'GearsOfWar2PC', 'user', 'achievements', '4D53082D.toml'), 'an unknown variable keeps the default');

  const data = path.join(folders.library, 'GoW2 disc');
  write(path.join(data, 'default.xex'), xexOf('4D53082D'));
  write(path.join(dir, 'gow2_game_path.txt'), `${data}\n`);
  [game] = only(x360.scan(folders.library), 'x360-4D53082D');
  assert.equal(game.data.xex, path.join(data, 'default.xex'));
});

test("gow2_save_dir expands the host's variables; the recompiled port and Hollow are told apart", (t) => {
  const folders = setup(t);
  x360.setPortFolders({ documentsFor: () => folders.documents, appDataFor: () => folders.appData, localAppDataFor: () => folders.localAppData, env: { appdata: folders.appData }, platform: 'win32' });
  const recomp = install(folders, 'Gears of War 2', ['gow2.exe']);
  fs.mkdirSync(path.join(recomp, 'GearGame'), { recursive: true });
  write(path.join(recomp, 'gow2.toml'), "gow2_save_dir = '%APPDATA%/Gears'\n");
  const hollow = path.join(folders.library, 'Gears of War 2 Hollow');
  write(path.join(hollow, 'Binaries', 'GearGame.exe'), 'MZ');
  fs.mkdirSync(path.join(hollow, 'GearGame'), { recursive: true });

  const games = x360.scan(folders.library);
  const [port] = only(games, 'x360-4D53082D');
  assert.equal(port.data.file, path.join(folders.appData, 'Gears', 'achievements', '4D53082D.toml'));
  assert.equal(port.data.gameDir, recomp, 'a folder with the recompiled program is not Hollow');
  const others = games.filter((g) => g !== port);
  assert.equal(others.length, 1);
  assert.equal(others[0].data.format, 'json');
  assert.equal(others[0].data.file, path.join(hollow, 'GearGame', 'SaveData', 'Achievements.json'));
});

test("Geometry Wars RE2 reads 0.1.0's Documents list and the later user_data one as one", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'GWRE2', ['geometry_wars_retro_evolved_2.exe']);
  const legacy = write(path.join(folders.documents, 'geometry_wars_retro_evolved_2', 'achievements', '584108FF.toml'), unlockedToml(1));
  let [game] = only(x360.scan(folders.library), 'x360-584108FF');
  assert.equal(game.data.pending, false, 'the old list is a real list');
  assert.equal(game.data.file, legacy);
  assert.deepEqual(ids(game), ['1']);

  const current = write(path.join(dir, 'user_data', 'achievements', '584108FF.toml'), unlockedToml(2));
  [game] = only(x360.scan(folders.library), 'x360-584108FF');
  assert.equal(game.data.file, current);
  assert.deepEqual(game.data.profileFiles, [current, legacy]);
  assert.deepEqual(ids(game), ['2', '1']);
});

test('Army of Two: the TU2 build with its launcher, the same program without it, and armyof2 by its XEX', (t) => {
  const folders = setup(t);
  const tu2 = install(folders, 'AO2 TU2', ['armyoftworecomp.exe', 'ArmyOfTwoLauncher.exe']);
  const bob = write(path.join(folders.documents, 'armyoftworecomp_profiles', 'bob', 'achievements', '4541084C.toml'), unlockedToml(3));
  const eve = write(path.join(folders.localAppData, 'armyoftworecomp_profiles', 'eve', 'achievements', '4541084C.toml'), unlockedToml(4));
  let [game] = only(x360.scan(folders.library), 'x360-4541084C');
  assert.equal(game.data.gameDir, tu2);
  assert.deepEqual(game.data.profileFiles, [path.join(folders.documents, 'armyoftworecomp_tu2', 'achievements', '4541084C.toml'), bob, eve]);
  assert.deepEqual(ids(game), ['3', '4']);

  fs.rmSync(tu2, { recursive: true });
  install(folders, 'AO2', ['armyoftworecomp.exe']);
  [game] = only(x360.scan(folders.library), 'x360-4541084C');
  assert.equal(game.data.file, path.join(folders.documents, 'armyoftworecomp', 'achievements', '4541084C.toml'));

  const other = install(folders, 'AO2 other', ['armyof2.exe']);
  assert.deepEqual(only(x360.scan(other), 'x360-454107F8'), [], 'the region is not guessed');
  write(path.join(other, 'ArmyOfTwoExtracted', 'default.xex'), xexOf('454107F8'));
  [game] = only(x360.scan(other), 'x360-454107F8');
  assert.equal(game.data.file, path.join(folders.documents, 'armyof2', 'achievements', '454107F8.toml'));
});

test("OpenJam merges every game root's list: saves.path where a root has one, Documents otherwise", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'OpenJam', ['nbajam_ofe.exe']);
  const fallback = path.join(folders.documents, 'nbajam_ofe', 'achievements', '584111EC.toml');
  let [game] = only(x360.scan(folders.library), 'x360-584111EC');
  assert.deepEqual(game.data.profileFiles, [fallback]);
  assert.equal(game.data.pending, true);

  write(path.join(dir, 'saves.path'), 'saves\r\n');
  write(path.join(dir, 'mods', 'retro', 'saves.path'), '../../saves/retro\n');
  fs.mkdirSync(path.join(dir, 'mods', 'plain'), { recursive: true });
  const base = write(path.join(dir, 'saves', 'achievements', '584111EC.toml'), unlockedToml(1));
  const retro = write(path.join(dir, 'saves', 'retro', 'achievements', '584111EC.toml'), unlockedToml(5));
  write(fallback, unlockedToml(7));
  [game] = only(x360.scan(folders.library), 'x360-584111EC');
  assert.equal(game.data.file, base);
  assert.deepEqual(new Set(game.data.profileFiles), new Set([base, retro, fallback]));
  assert.deepEqual(ids(game).sort(), ['1', '5', '7']);
});

test('EdgeOfTimeRecomp reads profiles/<name> of its install root, the TSV port still its own folder', (t) => {
  const folders = setup(t);
  const dir = install(folders, 'EoT Recomp', ['EdgeOfTimeRecomp.exe']);
  write(path.join(dir, 'game', 'Default.xex'), xexOf('415608B2'));
  let [game] = only(x360.scan(folders.library), 'x360-415608B2');
  assert.equal(game.data.file, path.join(dir, 'profiles', 'default', 'achievements', '415608B2.toml'));
  assert.equal(game.data.xex, path.join(dir, 'game', 'Default.xex'));

  const alice = write(path.join(dir, 'profiles', 'alice', 'achievements', '415608B2.toml'), unlockedToml(2));
  [game] = only(x360.scan(folders.library), 'x360-415608B2');
  assert.deepEqual(game.data.profileFiles, [alice]);
  assert.deepEqual(ids(game), ['2']);

  fs.rmSync(dir, { recursive: true });
  install(folders, 'EoT TSV', ['SpiderManEOT.exe']);
  [game] = only(x360.scan(folders.library), 'x360-415608B2');
  assert.equal(game.data.format, 'tsv');
});

test("EdgeOfTimeRecomp's installer record moves its root", (t) => {
  const elsewhere = path.join(os.tmpdir(), `aw-reeot-root-${process.pid}`);
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  const folders = setup(t, { registry: { 'HKCU/Software/reeot/Install/InstallRoot': elsewhere } });
  install(folders, 'EoT', ['reeot.exe']);
  const list = write(path.join(elsewhere, 'profiles', 'default', 'achievements', '415608B2.toml'), unlockedToml(9));
  const [game] = only(x360.scan(folders.library), 'x360-415608B2');
  assert.equal(game.data.file, list);
  assert.deepEqual(ids(game), ['9']);
});

test('the other confirmed ports: Documents, portable FIFA, and WWE All Stars one folder up', (t) => {
  const folders = setup(t);
  const cases = [
    ['AC6', 'ac6recomp.exe', '4E4D07D1', 'ac6recomp'],
    ['CoD3', 'cod3_pc.exe', '415607E1', 'cod3_pc'],
    ['Superman', 'superman_returns.exe', '454107ED', 'superman_returns'],
    ['Peggle', 'peggle.exe', '58410889', 'peggle'],
    ['Vig8', 'vig8.exe', '584108A8', 'vig8'],
    ['DBZ', 'burstlimit.exe', '424107DC', 'burstlimit'],
    ['FM4', 'fm4.exe', '4D530910', 'fm4'],
    ['FH1', 'forza.exe', '4D5309C9', 'forza'],
    ['Kameo', 'kameorepowered.exe', '4D5307D2', 'kameorepowered'],
    ['FIFA', 'fifawc14.exe', '454109D4', '2014 FIFA World Cup Brazil'],
  ];
  for (const [name, exe] of cases) install(folders, name, [exe]);
  const allStars = path.join(folders.library, 'WWE All Stars');
  write(path.join(allStars, 'game', 'wweallstars.exe'), 'MZ');
  let games = x360.scan(folders.library);
  for (const [name, , titleId, folder] of cases) {
    assert.equal(only(games, `x360-${titleId}`)[0].data.file, path.join(folders.documents, folder, 'achievements', `${titleId}.toml`), name);
  }
  assert.equal(only(games, 'x360-545107FD')[0].data.file, path.join(allStars, 'userdata', 'achievements', '545107FD.toml'));

  write(path.join(folders.library, 'FIFA', 'portable.txt'), '');
  games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-454109D4')[0].data.file, path.join(folders.library, 'FIFA', 'saves', 'achievements', '454109D4.toml'));
});

test('on Windows a Linux build is no port, and no Linux save is looked for', (t) => {
  const folders = setup(t);
  install(folders, 'Kameo', ['kameorepowered'], ELF);
  write(path.join(folders.home, '.UnleashedRecomp', 'save', 'ACH-DATA'), 'x');
  assert.deepEqual(x360.scan(folders.library), []);
  assert.deepEqual(x360.scanNativeSaves(), []);
});

test('Linux builds: XDG data for ReXGlue, user_data beside an AppImage, $HOME/.config for Unleashed', (t) => {
  const folders = setup(t, { platform: 'linux' });
  const xdgData = path.join(folders.home, '.local', 'share');
  install(folders, 'Kameo', ['kameorepowered'], ELF);
  install(folders, 'Fake', ['crackdown'], 'MZ');
  const crackdown = install(folders, 'Crackdown', ['CrackdownRecompiled-x86_64.AppImage'], ELF);
  const unleashed = install(folders, 'Unleashed', ['UnleashedRecomp'], ELF);
  write(path.join(unleashed, 'patched', 'default.xex'), xexOf('53450812'));
  const games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-4D5307D2')[0].data.file, path.join(xdgData, 'kameorepowered', 'achievements', '4D5307D2.toml'));
  const crackdowns = only(games, 'x360-4D5307DC');
  assert.equal(crackdowns.length, 1, 'a file that is not an ELF program is no Linux build');
  assert.equal(crackdowns[0].data.file, path.join(crackdown, 'user_data', 'achievements', '4D5307DC.toml'));
  const [sonic] = only(games, 'x360-53450812');
  assert.deepEqual(sonic.data.profileFiles, [path.join(folders.home, '.config', 'UnleashedRecomp', 'save', 'ACH-DATA'), path.join(folders.home, '.UnleashedRecomp', 'save', 'ACH-DATA')]);
});

test('Linux Lost Odyssey: an AppImage waits in XDG data, a Flatpak list is read from its sandbox', (t) => {
  const folders = setup(t, { platform: 'linux' });
  install(folders, 'LO', ['LostOdysseyRecomp-x86_64.AppImage'], ELF);
  const xdgList = path.join(folders.home, '.local', 'share', 'lost-odyssey-recomp', 'profile', 'achievements.ini');
  let [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.file, xdgList);
  assert.equal(game.data.pending, true);

  const sandbox = write(path.join(folders.home, '.var', 'app', 'io.github.freefrank.LostOdysseyRecomp', 'data', 'profile', 'achievements.ini'), '# Achievements earned: id=unix time\n4=1767312000\n');
  [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.file, sandbox);
  assert.deepEqual(ids(game), ['4']);
});

test('Linux saves outside any game folder: a played Unleashed, an installed Marathon Flatpak', (t) => {
  const folders = setup(t, { platform: 'linux' });
  const head = Buffer.alloc(16);
  head.write('ACH ', 0, 'ascii');
  head.writeUInt32LE(1, 4);
  write(path.join(folders.home, '.UnleashedRecomp', 'save', 'ACH-DATA'), Buffer.concat([head, Buffer.alloc(16 * 50)]));
  fs.mkdirSync(path.join(folders.home, '.var', 'app', 'io.github.sonicnext_dev.marathonrecomp'), { recursive: true });
  const games = x360.scanNativeSaves();
  const [unleashed] = only(games, 'x360-53450812');
  assert.equal(unleashed.data.pending, false);
  assert.deepEqual(x360.getAchievements(unleashed.data), []);
  const [marathon] = only(games, 'x360-534507D6');
  assert.equal(marathon.data.pending, true);
  assert.equal(marathon.data.file, path.join(folders.home, '.var', 'app', 'io.github.sonicnext_dev.marathonrecomp', 'config', 'MarathonRecomp', 'save', 'SonicNextAchievementData.bin'));
  assert.equal(marathon.data.records, 23);
  assert.equal(only(games, 'x360-4D5307FA').length, 0, 'Lost Odyssey is neither played nor installed');
});

// One install per row, scanned alone (several share a title id): its program inside it, the title it
// plays and the folder holding its list, from the install and the setup's folders.
const NEW_PORTS = [
  ['GoldenEye 007 (runtime)', 'resources/runtime/GoldenEye 007.exe', '584108A9', (dir) => path.join(dir, 'resources', 'userdata')],
  ['Aegis Wing', 'resources/runtime/Aegis Wing.exe', '5841083C', (dir) => path.join(dir, 'resources', 'userdata')],
  ['Fuse', 'fuserecomp.exe', '4541096E', (dir, f) => path.join(f.documents, 'fuserecomp')],
  ['SST ReMatch', 'sst_rematch.exe', '534507F5', (dir, f) => path.join(f.documents, 'sst_rematch')],
  ['Outpost Kaloki X', 'outpost_kaloki_x.exe', '584107DB', (dir, f) => path.join(f.documents, 'outpost_kaloki_x')],
  ['South Park TR', 'south_park_tr.exe', '58410B80', (dir, f) => path.join(f.documents, 'south_park_tr')],
  ['South Park TD', 'south_park_td.exe', '58410931', (dir, f) => path.join(f.documents, 'south_park_td')],
  ['3 on 3 NHL', 'nhl3on3.exe', '58410975', (dir, f) => path.join(f.documents, 'nhl3on3')],
  ['WET (Supermedo)', 'wet.exe', '425307DB', (dir, f) => path.join(f.documents, 'wet')],
  ['Tenchu Z', 'tenchuz.exe', '465307D7', (dir, f) => path.join(f.documents, 'tenchuz')],
  ['NCAA 14', 'ncaafootball14.exe', '454109B6', (dir, f) => path.join(f.localAppData, 'ncaafootball14')],
  ['Naruto', 'Naruto The Broken Bond PC.exe', '55530825', (dir) => path.join(dir, 'hdd')],
  ['The Bigs 2', 'thebigs2.exe', '54540830', (dir) => path.join(dir, 'saves')],
  ['Skate 2', 'skate2.exe', '4541087F', (dir, f) => path.join(f.documents, 'skate2')],
  ['DBZ3', 'dbz3.exe', '4E4D0856', (dir) => path.join(dir, 'user_data', 'dbz3')],
  ['SvR 2007', 'svr2007.exe', '545107E0', (dir) => path.join(dir, 'userdata')],
  ['SvR 2007 Vulkan', 'svr2007_vulkan.exe', '545107E0', (dir) => path.join(dir, 'userdata')],
  ['SvR 2008', 'svr2008.exe', '5451080B', (dir) => path.join(dir, 'userdata')],
  ['SvR 2008 Vulkan', 'svr2008_vulkan.exe', '5451080B', (dir) => path.join(dir, 'userdata')],
  ['SvR 2009', 'svr2009.exe', '54510826', (dir) => path.join(dir, 'userdata')],
  ['SvR 2009 Vulkan', 'svr2009_vulkan.exe', '54510826', (dir) => path.join(dir, 'userdata')],
  ['NHL 14', 'bardown.exe', '454109BE', (dir) => path.join(dir, 'userdata')],
  ['Forza 3', 'forza3.exe', '4D53084D', (dir) => path.join(dir, 'userdata')],
  ['Burnout Revenge', 'burnoutrevenge.exe', '454107DC', (dir) => path.join(dir, 'user-data')],
  ['Banjo-Tooie', 'banjotooie.exe', '58410955', (dir) => path.join(dir, 'user-data')],
  ['PvZ Console Edition', 'build/pvz-console-edition.exe', '584109FF', (dir) => path.join(dir, 'runtime-data', 'user')],
  ['Pinyon Shift', 'out/build/win-amd64-release/pinyon_shift.exe', '4D5309C9', (dir) => path.join(dir, '.local', 'preview', 'user')],
  ['The Darkness (Estacado)', 'TheDarkness.exe', '545407EE', (dir) => path.join(dir, 'runtime_data', 'content')],
  ['The Darkness (recomp)', 'thedarknessrecomp.exe', '545407EE', (dir, f) => path.join(f.documents, 'thedarknessrecomp')],
];

test('every newly confirmed port resolves to its title and the folder its list will appear in', (t) => {
  const folders = setup(t);
  for (const [label, exe, titleId, listRoot] of NEW_PORTS) {
    const dir = path.join(folders.library, label);
    write(path.join(dir, ...exe.split('/')), 'MZ');
    const games = only(x360.scan(dir), `x360-${titleId}`);
    assert.equal(games.length, 1, label);
    assert.equal(games[0].data.file, path.join(listRoot(dir, folders), 'achievements', `${titleId}.toml`), label);
    assert.equal(games[0].data.pending, true, label);
  }
});

test('GoldenEye 007 and Aegis Wing: the release root launcher and the runtime program share one list', (t) => {
  const folders = setup(t);
  const dir = path.join(folders.library, 'GoldenEye 007');
  const list = path.join(dir, 'resources', 'userdata', 'achievements', '584108A9.toml');
  write(path.join(dir, 'GoldenEye 007.exe'), 'MZ');
  fs.mkdirSync(path.join(dir, 'resources'), { recursive: true });
  let games = only(x360.scan(folders.library), 'x360-584108A9');
  assert.equal(games[0].data.file, list, 'the launcher alone points inside the release');

  write(path.join(dir, 'resources', 'runtime', 'GoldenEye 007.exe'), 'MZ');
  games = only(x360.scan(folders.library), 'x360-584108A9');
  assert.equal(games.length, 1);
  assert.equal(games[0].data.file, list);
  assert.deepEqual(games[0].data.profileFiles || [list], [list]);

  write(list, unlockedToml(4));
  games = only(x360.scan(folders.library), 'x360-584108A9');
  assert.deepEqual(ids(games[0]), ['4']);

  const dev = path.join(folders.library, 'Dev build');
  write(path.join(dev, 'Aegis Wing.exe'), 'MZ');
  assert.equal(only(x360.scan(dev), 'x360-5841083C')[0].data.file, path.join(dev, 'userdata', 'achievements', '5841083C.toml'), 'a build without a resources folder keeps userdata beside itself');
});

test('The Bigs 2, DBZ3 and NHL 14 also read the folder they fall back on when theirs is not writable', (t) => {
  const folders = setup(t);
  const cases = [
    ['Bigs', 'thebigs2.exe', '54540830', path.join(folders.documents, 'thebigs2'), ['saves']],
    ['DBZ', 'dbz3.exe', '4E4D0856', path.join(folders.documents, 'dbz3'), ['user_data', 'dbz3']],
    ['NHL', 'bardown.exe', '454109BE', path.join(folders.localAppData, 'bardown', 'userdata'), ['userdata']],
  ];
  for (const [name, exe, titleId, fallbackRoot, own] of cases) {
    const dir = install(folders, name, [exe]);
    const main = path.join(dir, ...own, 'achievements', `${titleId}.toml`);
    const fallback = path.join(fallbackRoot, 'achievements', `${titleId}.toml`);
    let [game] = only(x360.scan(dir), `x360-${titleId}`);
    assert.deepEqual(game.data.profileFiles, [main, fallback], name);
    write(fallback, unlockedToml(6));
    [game] = only(x360.scan(dir), `x360-${titleId}`);
    assert.equal(game.data.file, fallback, `${name}: the fallback list that exists is the one read`);
    assert.deepEqual(ids(game), ['6'], name);
  }
});

test('Skate 2 keeps Documents unless portable.txt keeps its saves beside it', (t) => {
  const folders = setup(t);
  const dir = install(folders, 'Skate2', ['skate2.exe']);
  assert.equal(only(x360.scan(dir), 'x360-4541087F')[0].data.file, path.join(folders.documents, 'skate2', 'achievements', '4541087F.toml'));
  write(path.join(dir, 'portable.txt'), '');
  assert.equal(only(x360.scan(dir), 'x360-4541087F')[0].data.file, path.join(dir, 'userdata', 'achievements', '4541087F.toml'));
});

test("NCAA Football 14 reads every mod's userdata under LOCALAPPDATA beside its own list", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'NCAA', ['ncaafootball14.exe']);
  const root = path.join(folders.localAppData, 'ncaafootball14');
  const base = path.join(root, 'achievements', '454109B6.toml');
  const revamped = write(path.join(root, 'mods', 'revamped', 'userdata', 'achievements', '454109B6.toml'), unlockedToml(2));
  fs.mkdirSync(path.join(root, 'mods', 'empty'), { recursive: true });
  const [game] = only(x360.scan(dir), 'x360-454109B6');
  assert.equal(game.data.file, revamped);
  assert.equal(game.data.profileFiles[0], base);
  assert.deepEqual(new Set(game.data.profileFiles), new Set([base, revamped, path.join(root, 'mods', 'empty', 'userdata', 'achievements', '454109B6.toml')]));
  assert.deepEqual(ids(game), ['2']);
});

test('Pinyon Shift: the launcher state of its release source, the variable, mods and a bare program', (t) => {
  const env = {};
  const folders = setup(t, { env });
  const source = path.join(folders.library, 'PinyonShift');
  write(path.join(source, 'out', 'build', 'win-amd64-release', 'pinyon_shift.exe'), 'MZ');
  const state = path.join(source, '.local', 'preview');
  const listIn = (root) => path.join(root, 'achievements', '4D5309C9.toml');
  let [game] = only(x360.scan(source), 'x360-4D5309C9');
  assert.deepEqual(game.data.profileFiles, [listIn(path.join(state, 'user'))]);

  const modded = write(listIn(path.join(state, 'user-modded')), unlockedToml(3));
  const named = write(listIn(path.join(state, 'user-xe')), unlockedToml(5));
  fs.mkdirSync(path.join(state, 'cache'), { recursive: true });
  [game] = only(x360.scan(source), 'x360-4D5309C9');
  assert.deepEqual(new Set(game.data.profileFiles), new Set([listIn(path.join(state, 'user')), modded, named]));
  assert.deepEqual(ids(game).sort(), ['3', '5']);

  env.PINYON_SHIFT_STATE_ROOT = path.join(folders.library, 'elsewhere');
  [game] = only(x360.scan(source), 'x360-4D5309C9');
  assert.equal(game.data.profileFiles[0], listIn(path.join(env.PINYON_SHIFT_STATE_ROOT, 'user')), 'the variable comes first');
  assert.ok(game.data.profileFiles.includes(modded), 'the launcher state is still read');

  env.PINYON_SHIFT_STATE_ROOT = 'relative';
  const bare = path.join(folders.library, 'Bare');
  write(path.join(bare, 'pinyon_shift.exe'), 'MZ');
  [game] = only(x360.scan(bare), 'x360-4D5309C9');
  assert.deepEqual(game.data.profileFiles, [listIn(path.join(bare, 'pinyon_shift_state', 'user'))], 'a relative variable is ignored; without a launcher the state sits beside the program');
});

test('Pinyon Shift on Linux: the native program in the release source finds the launcher state', (t) => {
  const folders = setup(t, { platform: 'linux' });
  const source = path.join(folders.library, 'PinyonShift');
  write(path.join(source, 'out', 'build', 'linux-amd64-release', 'pinyon_shift'), ELF);
  const [game] = only(x360.scan(source), 'x360-4D5309C9');
  assert.equal(game.data.file, path.join(source, '.local', 'preview', 'user', 'achievements', '4D5309C9.toml'));
});

test('The Darkness (Estacado): Saved Games, with the game folder for portable.txt, no profile and old saves', (t) => {
  const env = {};
  const folders = setup(t, { env });
  const dir = install(folders, 'Estacado', ['TheDarkness.exe', 'TheDarknessSettings.exe']);
  const inGame = path.join(dir, 'runtime_data', 'content', 'achievements', '545407EE.toml');
  const saved = path.join(folders.home, 'Saved Games', 'Estacado', 'content', 'achievements', '545407EE.toml');
  assert.equal(only(x360.scan(dir), 'x360-545407EE')[0].data.file, inGame, 'no profile folder is known');

  env.USERPROFILE = folders.home;
  let [game] = only(x360.scan(dir), 'x360-545407EE');
  assert.deepEqual(game.data.profileFiles, [saved, inGame]);
  write(saved, unlockedToml(8));
  [game] = only(x360.scan(dir), 'x360-545407EE');
  assert.equal(game.data.file, saved);
  assert.deepEqual(ids(game), ['8']);

  write(path.join(dir, 'portable.txt'), '');
  [game] = only(x360.scan(dir), 'x360-545407EE');
  assert.deepEqual(game.data.profileFiles || [game.data.file], [inGame], 'portable.txt keeps the game folder alone');
});

test('Linux: the Outpost Kaloki X AppImage and the reGH2 binary save in XDG data', (t) => {
  const folders = setup(t, { platform: 'linux' });
  const xdgData = path.join(folders.home, '.local', 'share');
  install(folders, 'Outpost', ['OutpostKalokiX-v1.1.0-linux-x86_64.AppImage'], ELF);
  install(folders, 'GH2', ['gh2'], ELF);
  const games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-584107DB')[0].data.file, path.join(xdgData, 'outpost_kaloki_x', 'achievements', '584107DB.toml'));
  assert.equal(only(games, 'x360-415607E7')[0].data.file, path.join(xdgData, 'gh2', 'achievements', '415607E7.toml'));
});
