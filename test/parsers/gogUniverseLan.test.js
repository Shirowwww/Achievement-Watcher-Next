'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const gogUniverseLan = require('../../app/parser/gogUniverseLan.js');
const emuIni = require('../../app/util/emuIni.js');

function tmpDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gog-universelan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('findGalaxyDlls finds Galaxy.dll and Galaxy64.dll but never REDGalaxy', (t) => {
  const gameDir = tmpDir(t);
  fs.mkdirSync(path.join(gameDir, 'bin', 'x64'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'Galaxy.dll'), 'x86');
  fs.writeFileSync(path.join(gameDir, 'bin', 'x64', 'Galaxy64.dll'), 'x64');
  fs.writeFileSync(path.join(gameDir, 'REDGalaxy64.dll'), 'redlauncher');
  const found = gogUniverseLan.findGalaxyDlls(gameDir);
  assert.equal(found.length, 2);
  assert.ok(found.some((f) => f.arch === 'x86' && path.basename(f.file) === 'Galaxy.dll'));
  assert.ok(found.some((f) => f.arch === 'x64' && path.basename(f.file) === 'Galaxy64.dll'));
});

test('findGalaxyDlls excludes its own backup folder', (t) => {
  const gameDir = tmpDir(t);
  fs.mkdirSync(path.join(gameDir, gogUniverseLan.BACKUP_DIR_NAME, 'snap'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, gogUniverseLan.BACKUP_DIR_NAME, 'snap', 'Galaxy64.dll'), 'backup copy');
  assert.equal(gogUniverseLan.findGalaxyDlls(gameDir).length, 0);
});

test('findGogAppId reads the id out of goggame-<id>.info', (t) => {
  const gameDir = tmpDir(t);
  fs.writeFileSync(path.join(gameDir, 'goggame-1207658930.info'), '{}');
  assert.equal(gogUniverseLan.findGogAppId(gameDir), '1207658930');
});

/*
  Cyberpunk 2077 (GOG rip, Discord 26/11/2026) keeps goggame-1256837418.info (Phantom Liberty) beside
  its own goggame-1423049311.info. UniverseLAN names its data folder after the rootGameId inside the
  first info file (MachineInfo.cxx), so AW must take the same id or it reads a folder never written.
*/
function cyberpunkRoot(t) {
  const gameDir = tmpDir(t);
  const info = (gameId, extra = {}) => JSON.stringify({ gameId, rootGameId: '1423049311', name: 'Cyberpunk 2077', ...extra });
  fs.writeFileSync(path.join(gameDir, 'goggame-1256837418.info'), info('1256837418', { name: 'Cyberpunk 2077 Phantom Liberty' }));
  fs.writeFileSync(path.join(gameDir, 'goggame-1423049311.info'), info('1423049311'));
  fs.writeFileSync(path.join(gameDir, 'goggame-1597316373.info'), info('1597316373', { name: 'REDmod' }));
  return gameDir;
}

test('findGogAppId takes the root game id UniverseLAN names its folder after, not a DLC file name', (t) => {
  assert.equal(gogUniverseLan.findGogAppId(cyberpunkRoot(t)), '1423049311');
});

test('findGogAppId falls back to gameId, then to the file name, when the info file says less', (t) => {
  const withGameId = tmpDir(t);
  fs.writeFileSync(path.join(withGameId, 'goggame-1.info'), 'not json');
  fs.writeFileSync(path.join(withGameId, 'goggame-2.info'), JSON.stringify({ gameId: 2 }));
  assert.equal(gogUniverseLan.findGogAppId(withGameId), '2');
  const unreadable = tmpDir(t);
  fs.writeFileSync(path.join(unreadable, 'goggame-77.info'), '');
  assert.equal(gogUniverseLan.findGogAppId(unreadable), '77');
});

test('scan reads the save under the root game id for an install recorded under a DLC id', (t) => {
  const gameDir = cyberpunkRoot(t);
  const userDataPath = tmpDir(t);
  const localAppData = tmpDir(t);
  gogUniverseLan.recordInstall({ userDataPath, gameDir, gogAppId: '1256837418' });
  const ini = gogUniverseLan.achievementsIniPath({ localAppData, gogAppId: '1423049311' });
  fs.mkdirSync(path.dirname(ini), { recursive: true });
  fs.writeFileSync(ini, '[ACH_1]\nUnlocked = 1\nUnlockTime = 1764150000\n');

  const [record] = gogUniverseLan.scan({ userDataPath, localAppData });
  assert.equal(record.appid, '1423049311');
  assert.equal(record.data.gogAppId, '1423049311');
  assert.equal(record.data.recordedGogAppId, '1256837418', 'the old id is kept so the generic GOG scan skips its folder too');
  assert.equal(record.name, 'Cyberpunk 2077');
});

test('findGogAppId returns null with no marker file', (t) => {
  assert.equal(gogUniverseLan.findGogAppId(tmpDir(t)), null);
});

test('findGogInstallRoot climbs from the exe folder to the install that holds the marker', (t) => {
  // A manually added game points at its exe folder: Cyberpunk 2077 keeps goggame-<id>.info two
  // levels above bin/x64, and the GOG fix was never offered for it.
  const root = tmpDir(t);
  const exeDir = path.join(root, 'bin', 'x64');
  fs.mkdirSync(exeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'goggame-1423049311.info'), '{}');
  assert.equal(gogUniverseLan.findGogInstallRoot(exeDir), root);
  assert.equal(gogUniverseLan.findGogInstallRoot(root), root);
});

test('findGogInstallRoot gives up beyond three folders up', (t) => {
  const root = tmpDir(t);
  const deep = path.join(root, 'a', 'b', 'c', 'd');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(root, 'goggame-1.info'), '{}');
  assert.equal(gogUniverseLan.findGogInstallRoot(deep), null);
  assert.equal(gogUniverseLan.findGogInstallRoot(''), null);
});

// UniverseLAN names Galaxy SDKs with three numbers (its table and sha1_hashes.txt); a dll's fourth
// FileVersion number is only GOG's build of that SDK.
test('versionsMatch tolerates dot and comma-space separated version strings and the build number', () => {
  assert.equal(gogUniverseLan.versionsMatch('1.152.6.0', '1, 152, 6, 0'), true);
  assert.equal(gogUniverseLan.versionsMatch('1.152.6.0', '1.152.6.1'), true);
  assert.equal(gogUniverseLan.versionsMatch('1.152.6.0', '1.152.5.0'), false);
  assert.equal(gogUniverseLan.versionsMatch('1.92', '1.92.1'), false);
  assert.equal(gogUniverseLan.versionsMatch('', '1.0.0.0'), false);
});

// Seen on 2026-11-26: Cyberpunk 2077's GOG Galaxy64.dll reports 1.152.2.1, and the fix said no
// UniverseLAN build supported it although release 1.152.2 does.
test('a Galaxy dll whose FileVersion carries a build number still finds its UniverseLAN release', () => {
  const table = [
    { release: '1.152.1', sdkVersions: ['1.152.1'] },
    { release: '1.152.2', sdkVersions: ['1.152.2'] },
  ];
  assert.equal(gogUniverseLan.releaseForSdkVersion(table, '1.152.2.1'), '1.152.2');
  const builds = [{ name: 'UniverseLAN-1.152.2-Build-813-x64_x86', dir: 'C:/cache/1.152.2' }];
  assert.equal(gogUniverseLan.matchBuild({ builds, compatTable: table, sdkVersion: '1.152.2.1' }).build.dir, 'C:/cache/1.152.2');
});

test('buildVersionFromFolderName extracts the release version', () => {
  assert.equal(gogUniverseLan.buildVersionFromFolderName('UniverseLAN-1.152.6-Build-626-x64_x86'), '1.152.6');
  assert.equal(gogUniverseLan.buildVersionFromFolderName('not-a-build-folder'), null);
});

test('parseCompatTable reads the markdown compatibility table', () => {
  const readme = [
    'intro text',
    '| UniverseLAN Release | Galaxy SDK Versions |',
    '|---|---|',
    '| 1.152.6 | 1.152.6.0<br>1.152.5.0? |',
    '| - | 1.100.0.0 |',
    'after the table',
  ].join('\n');
  const table = gogUniverseLan.parseCompatTable(readme);
  assert.equal(table.length, 2);
  assert.deepEqual(table[0], { release: '1.152.6', sdkVersions: ['1.152.6.0', '1.152.5.0?'] });
});

test('releaseForSdkVersion strips a trailing "?" and matches numerically', () => {
  const table = [{ release: '1.152.6', sdkVersions: ['1.152.5.0?'] }];
  assert.equal(gogUniverseLan.releaseForSdkVersion(table, '1.152.5.0'), '1.152.6');
  assert.equal(gogUniverseLan.releaseForSdkVersion(table, '9.9.9.9'), null);
});

test('matchBuild prefers the compat table over the folder-name fallback', () => {
  const builds = [
    { name: 'UniverseLAN-1.140.0-Build-500-x64_x86', dir: '/cache/500' },
    { name: 'UniverseLAN-1.152.6-Build-626-x64_x86', dir: '/cache/626' },
  ];
  const compatTable = [{ release: '1.152.6', sdkVersions: ['1.152.5.0'] }];
  const picked = gogUniverseLan.matchBuild({ builds, compatTable, sdkVersion: '1.152.5.0' });
  assert.equal(picked.tier, 'compat-table');
  assert.equal(picked.build.dir, '/cache/626');
});

test('matchBuild falls back to a folder labeled with the exact SDK version', () => {
  const builds = [{ name: 'UniverseLAN-1.160.0-Build-700-x64_x86', dir: '/cache/700' }];
  const picked = gogUniverseLan.matchBuild({ builds, compatTable: [], sdkVersion: '1.160.0' });
  assert.equal(picked.tier, 'folder-name');
  assert.equal(picked.build.dir, '/cache/700');
});

test('matchBuild returns null when nothing covers the SDK version - caller must leave the dll alone', () => {
  const builds = [{ name: 'UniverseLAN-1.140.0-Build-500-x64_x86', dir: '/cache/500' }];
  assert.equal(gogUniverseLan.matchBuild({ builds, compatTable: [], sdkVersion: '9.9.9.9' }), null);
});

test('writeUniverseLanIniIfMissing creates the ini once and never overwrites it again', (t) => {
  const root = tmpDir(t);
  const buildDir = path.join(root, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'UniverseLAN.ini'), '[Settings]\nLanguage = english\n');
  const localAppData = path.join(root, 'LocalAppData');

  const first = gogUniverseLan.writeUniverseLanIniIfMissing({ buildDir, localAppData });
  assert.equal(first.wrote, true);

  fs.writeFileSync(first.dest, '[Settings]\nCustomPersonaName = MyName\n');
  const second = gogUniverseLan.writeUniverseLanIniIfMissing({ buildDir, localAppData });
  assert.equal(second.wrote, false);
  assert.match(fs.readFileSync(first.dest, 'utf8'), /MyName/);
});

test('mergeDataFolders copies template files but never clobbers an existing Achievements.ini', (t) => {
  const root = tmpDir(t);
  const buildDir = path.join(root, 'build');
  fs.mkdirSync(path.join(buildDir, 'UniverseLANData'), { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'UniverseLANData', 'Achievements.ini'), '[TemplateAch]\nUnlocked = 0\n');
  fs.writeFileSync(path.join(buildDir, 'UniverseLANData', 'Config.ini'), '[Settings]\n');
  const localAppData = path.join(root, 'LocalAppData');
  const gogAppId = '1207658930';

  const appRoot = path.join(localAppData, 'UniverseLAN', gogAppId);
  fs.mkdirSync(path.join(appRoot, 'UniverseLANData'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'UniverseLANData', 'Achievements.ini'), '[RealAch]\nUnlocked = 1\nUnlockTime = 123\n');

  const result = gogUniverseLan.mergeDataFolders({ buildDir, localAppData, gogAppId });
  assert.ok(result.copied.some((rel) => rel.endsWith('Config.ini')));
  assert.ok(result.skipped.some((rel) => rel.endsWith('Achievements.ini')));
  const preserved = fs.readFileSync(path.join(appRoot, 'UniverseLANData', 'Achievements.ini'), 'utf8');
  assert.match(preserved, /RealAch/);
  assert.doesNotMatch(preserved, /TemplateAch/);
});

test('readAchievementsIni parses Unlocked/UnlockTime per achievement section', () => {
  const text = [
    '[FirstBlood]',
    'Description = Draw first blood',
    'Unlocked = 1',
    'UnlockTime = 1700000000',
    'Visible = 1',
    '',
    '[Untouched]',
    'Description = Not earned yet',
    'Unlocked = 0',
    'UnlockTime = 0',
  ].join('\n');
  const parsed = gogUniverseLan.readAchievementsIni(text);
  assert.deepEqual(parsed.FirstBlood, { earned: true, earned_time: 1700000000 });
  assert.deepEqual(parsed.Untouched, { earned: false, earned_time: 0 });
});

// UniverseLAN saves the flag with SimpleIni's SetBoolValue, which writes true/false (IniData.cxx).
test('readAchievementsIni reads the true/false flag UniverseLAN itself writes', () => {
  const parsed = gogUniverseLan.readAchievementsIni('[Act1]\nUnlocked = true\nUnlockTime = 0\n\n[Act2]\nUnlocked = false\nUnlockTime = 0\n');
  assert.deepEqual(parsed.Act1, { earned: true, earned_time: 0 });
  assert.deepEqual(parsed.Act2, { earned: false, earned_time: 0 });
});

test('readAchievements returns null when no save exists yet, and reads it once it does', (t) => {
  const root = tmpDir(t);
  const localAppData = path.join(root, 'LocalAppData');
  const gogAppId = '1207658930';
  assert.equal(gogUniverseLan.readAchievements({ localAppData, gogAppId }), null);

  const iniPath = gogUniverseLan.achievementsIniPath({ localAppData, gogAppId });
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(iniPath, '[Ach1]\nUnlocked = 1\nUnlockTime = 42\n');
  const read = gogUniverseLan.readAchievements({ localAppData, gogAppId });
  assert.deepEqual(read.Ach1, { earned: true, earned_time: 42 });
});

test('repairInstallation installs a matched build, writes the ini, merges data and reports unmatched dlls', (t) => {
  const root = tmpDir(t);
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'goggame-1207658930.info'), '{}');
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'original galaxy sdk dll');

  const buildDir = path.join(root, 'cache', 'UniverseLAN-1.152.6-Build-626-x64_x86');
  fs.mkdirSync(path.join(buildDir, 'UniverseLANData'), { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'Galaxy64.dll'), 'universelan galaxy64 replacement');
  fs.writeFileSync(path.join(buildDir, 'UniverseLANServer64.exe'), 'server');
  fs.writeFileSync(path.join(buildDir, 'UniverseLAN.ini'), '[Settings]\n');
  fs.writeFileSync(path.join(buildDir, 'UniverseLANData', 'Achievements.ini'), '[TemplateAch]\nUnlocked = 0\n');

  const localAppData = path.join(root, 'LocalAppData');
  const builds = { list: [{ name: path.basename(buildDir), dir: buildDir }], sdkVersionOf: () => '1.152.5.0' };
  const compatTable = [{ release: '1.152.6', sdkVersions: ['1.152.5.0'] }];

  const result = gogUniverseLan.repairInstallation({ gameDir, builds, compatTable, localAppData });

  assert.equal(result.gogAppId, '1207658930');
  assert.equal(result.unmatched.length, 0);
  assert.equal(fs.readFileSync(path.join(gameDir, 'Galaxy64.dll'), 'utf8'), 'universelan galaxy64 replacement');
  assert.equal(fs.readFileSync(path.join(gameDir, 'Galaxy64.dll.BAK'), 'utf8'), 'original galaxy sdk dll');
  assert.ok(fs.existsSync(path.join(gameDir, 'UniverseLANServer64.exe')));
  assert.ok(fs.existsSync(path.join(localAppData, 'UniverseLAN', 'UniverseLAN.ini')));
  assert.ok(fs.existsSync(path.join(localAppData, 'UniverseLAN', '1207658930', 'UniverseLANData', 'Achievements.ini')));
});

/*
  UniverseLAN answers a DLC that DLC.ini does not switch on as not owned, so Cyberpunk 2077 called every
  Phantom Liberty save damaged once its Galaxy services were back (Discord 27/11/2026). The DLC whose
  goggame-<id>.info is in the folder are switched on; any other id keeps what the file says.
*/
function cyberpunkRepair(t, existingDlcIni) {
  const root = tmpDir(t);
  const gameDir = cyberpunkRoot(t);
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'original galaxy sdk dll');
  const buildDir = path.join(root, 'UniverseLAN-1.152.6-Build-626-x64_x86');
  fs.mkdirSync(path.join(buildDir, 'UniverseLANData'), { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'Galaxy64.dll'), 'universelan galaxy64 replacement');
  fs.writeFileSync(path.join(buildDir, 'UniverseLANData', 'DLC.ini'), '[DLC]\n0 = 1 ; basegame\n');
  const localAppData = path.join(root, 'LocalAppData');
  const dlcIni = path.join(localAppData, 'UniverseLAN', '1423049311', 'UniverseLANData', 'DLC.ini');
  if (existingDlcIni) {
    fs.mkdirSync(path.dirname(dlcIni), { recursive: true });
    fs.writeFileSync(dlcIni, existingDlcIni);
  }
  const builds = { list: [{ name: path.basename(buildDir), dir: buildDir }], sdkVersionOf: () => '1.152.5.0' };
  const result = gogUniverseLan.repairInstallation({ gameDir, builds, compatTable: [{ release: '1.152.6', sdkVersions: ['1.152.5.0'] }], localAppData });
  return { result, dlc: emuIni.readIniSectionValues(emuIni.parseIni(fs.readFileSync(dlcIni, 'utf8')), 'DLC') };
}

test('repairInstallation switches on the DLC installed in the folder on a first setup', (t) => {
  const { result, dlc } = cyberpunkRepair(t, null);
  assert.deepEqual(result.dlc.enabled, ['1256837418', '1597316373']);
  assert.equal(dlc['1256837418'], 'true');
  assert.equal(dlc['1597316373'], 'true');
  assert.equal(dlc['1423049311'], undefined, 'the base game is not one of its DLC');
  assert.equal(dlc['0'], '1 ; basegame');
});

test('repairInstallation applied again matches the original dll kept in .BAK, not the installed shim', (t) => {
  const root = tmpDir(t);
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'goggame-1207658930.info'), '{}');
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'universelan galaxy64 replacement');
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll.BAK'), 'original galaxy sdk dll');
  const buildDir = path.join(root, 'UniverseLAN-1.152.6-Build-626-x64_x86');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'Galaxy64.dll'), 'universelan galaxy64 replacement');
  const versions = { 'Galaxy64.dll': '0.0.0.1', 'Galaxy64.dll.BAK': '1.152.5.0' };
  const builds = { list: [{ name: path.basename(buildDir), dir: buildDir }], sdkVersionOf: (file) => versions[path.basename(file)] };
  const localAppData = path.join(root, 'LocalAppData');
  const result = gogUniverseLan.repairInstallation({ gameDir, builds, compatTable: [{ release: '1.152.6', sdkVersions: ['1.152.5.0'] }], localAppData });
  assert.equal(result.installed.length, 1);
  assert.equal(fs.readFileSync(path.join(gameDir, 'Galaxy64.dll.BAK'), 'utf8'), 'original galaxy sdk dll');
});

test('repairInstallation switches on a DLC the game already asked for, and leaves the other ids alone', (t) => {
  const { dlc } = cyberpunkRepair(t, '[DLC]\n0 = 1 ; basegame\n1256837418 = false\n2000000001 = false\n');
  assert.equal(dlc['1256837418'], 'true');
  assert.equal(dlc['1597316373'], 'true');
  assert.equal(dlc['2000000001'], 'false');
});

/*
  Cyberpunk 2077's Galaxy SDK is in the 1.149.x range UniverseLAN lists with no release. Nothing was
  installed, yet the fix said "applied" and recorded the game (Discord 26/11/2026): it must fail
  instead, naming the version, and leave the game as it was.
*/
test('repairInstallation fails, naming the SDK version, when no dll has a UniverseLAN build', (t) => {
  const root = tmpDir(t);
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'goggame-42.info'), '{}');
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'original');
  const localAppData = path.join(root, 'LocalAppData');

  const builds = { list: [{ name: 'UniverseLAN-1.149.0-Build-813-x64_x86', dir: root }], sdkVersionOf: () => '1.149.17.0' };
  const compatTable = gogUniverseLan.parseCompatTable('| UniverseLAN Release | Galaxy SDK |\n|---|---|\n| 1.149.0 | 1.149.0 |\n| - | 1.149.12 <br> 1.149.16 |\n');
  assert.throws(
    () => gogUniverseLan.repairInstallation({ gameDir, builds, compatTable, localAppData }),
    (err) => /1\.149\.17\.0/.test(err.message) && err.unmatched.length === 1
  );

  assert.equal(fs.readFileSync(path.join(gameDir, 'Galaxy64.dll'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(gameDir, 'Galaxy64.dll.BAK')), false);
  assert.equal(fs.existsSync(path.join(gameDir, gogUniverseLan.BACKUP_DIR_NAME)), false);
  assert.equal(fs.existsSync(localAppData), false, 'no ini and no data folder written');
});

test('repairInstallation still installs the dlls that match and reports the others', (t) => {
  const root = tmpDir(t);
  const gameDir = path.join(root, 'game');
  const buildDir = path.join(root, 'UniverseLAN-1.152.11-Build-813-x64_x86');
  fs.mkdirSync(path.join(gameDir, 'x86'), { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'Galaxy64.dll'), 'universelan');
  fs.writeFileSync(path.join(gameDir, 'goggame-42.info'), '{}');
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'original');
  fs.writeFileSync(path.join(gameDir, 'x86', 'Galaxy.dll'), 'original x86');

  const builds = { list: [{ name: path.basename(buildDir), dir: buildDir }], sdkVersionOf: (file) => (/Galaxy64/.test(file) ? '1.152.11.0' : '1.149.17.0') };
  const result = gogUniverseLan.repairInstallation({ gameDir, builds, compatTable: [], localAppData: path.join(root, 'LocalAppData') });

  assert.equal(result.installed.length, 1);
  assert.deepEqual(result.unmatched.map((entry) => entry.sdkVersion), ['1.149.17.0']);
  assert.equal(fs.readFileSync(path.join(gameDir, 'x86', 'Galaxy.dll'), 'utf8'), 'original x86');
});

test('repairInstallation rejects a folder with no goggame-<id>.info', (t) => {
  const gameDir = tmpDir(t);
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'x');
  assert.throws(
    () => gogUniverseLan.repairInstallation({ gameDir, builds: { list: [] }, compatTable: [], localAppData: path.join(gameDir, 'lad') }),
    /goggame/
  );
});

test('recordInstall/readInstalls/removeInstall round-trip through the cfg registry', (t) => {
  const root = tmpDir(t);
  const userDataPath = path.join(root, 'userData');
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(gameDir, { recursive: true });

  assert.deepEqual(gogUniverseLan.readInstalls(userDataPath), []);
  assert.equal(gogUniverseLan.recordInstall({ userDataPath, gameDir, gogAppId: '1423049311' }), true);
  let installs = gogUniverseLan.readInstalls(userDataPath);
  assert.equal(installs.length, 1);
  assert.equal(installs[0].gogAppId, '1423049311');

  // Recording again for the same folder replaces, never duplicates, the entry.
  gogUniverseLan.recordInstall({ userDataPath, gameDir, gogAppId: '1423049311' });
  assert.equal(gogUniverseLan.readInstalls(userDataPath).length, 1);

  assert.equal(gogUniverseLan.removeInstall({ userDataPath, gameDir }), true);
  assert.deepEqual(gogUniverseLan.readInstalls(userDataPath), []);
});

test('scan lists only recorded installs whose game folder and save both still exist', (t) => {
  const root = tmpDir(t);
  const userDataPath = path.join(root, 'userData');
  const localAppData = path.join(root, 'LocalAppData');
  const liveDir = path.join(root, 'live-game');
  const goneDir = path.join(root, 'uninstalled-game');
  fs.mkdirSync(liveDir, { recursive: true });
  fs.mkdirSync(goneDir, { recursive: true });

  gogUniverseLan.recordInstall({ userDataPath, gameDir: liveDir, gogAppId: '111' });
  gogUniverseLan.recordInstall({ userDataPath, gameDir: goneDir, gogAppId: '222' });
  fs.rmSync(goneDir, { recursive: true, force: true }); // simulate the game having been uninstalled

  // No save written yet for '111' either - a repair recorded the install but never actually wrote
  // an Achievements.ini (or it was deleted), so it must not produce a tile with no data behind it.
  assert.deepEqual(gogUniverseLan.scan({ userDataPath, localAppData }), []);

  const iniPath = gogUniverseLan.achievementsIniPath({ localAppData, gogAppId: '111' });
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(iniPath, '[Ach1]\nUnlocked = 1\nUnlockTime = 1\n');

  const found = gogUniverseLan.scan({ userDataPath, localAppData });
  assert.equal(found.length, 1);
  assert.equal(found[0].appid, '111');
  assert.equal(found[0].source, 'gog', 'a repaired install is labelled like any UniverseLAN save, not as a Galaxy-owned copy');
  assert.equal(found[0].data.type, 'gogUniverseLan');
  assert.equal(found[0].data.gameDir, liveDir);
});

test('getGameData builds a schema from Achievements.ini and falls back to "GOG <id>" with no title', (t) => {
  const root = tmpDir(t);
  const localAppData = path.join(root, 'LocalAppData');
  const gogAppId = '1423049311';
  const iniPath = gogUniverseLan.achievementsIniPath({ localAppData, gogAppId });
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(
    iniPath,
    ['[FirstBlood]', 'Description = Draw first blood', 'Unlocked = 1', 'UnlockTime = 1', 'VisibleWhileLocked = 1', '', '[Hidden1]', 'Description = A secret', 'Unlocked = 0', 'VisibleWhileLocked = 0'].join('\n')
  );

  const game = gogUniverseLan.getGameData({ appid: gogAppId, data: { gogAppId, localAppData, gameDir: root } });
  assert.equal(game.name, `GOG ${gogAppId}`);
  assert.equal(game.achievement.total, 2);
  const hidden = game.achievement.list.find((a) => a.name === 'Hidden1');
  assert.equal(hidden.hidden, 1);
  assert.equal(hidden.description, 'A secret');
  const visible = game.achievement.list.find((a) => a.name === 'FirstBlood');
  assert.equal(visible.hidden, 0);
});

function writeDishonoredSave(t) {
  const root = tmpDir(t);
  const localAppData = path.join(root, 'LocalAppData');
  const gogAppId = '1701063787';
  const iniPath = gogUniverseLan.achievementsIniPath({ localAppData, gogAppId });
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  // What UniverseLAN holds after one unlock: its template's example entry and the unlock, no names.
  fs.writeFileSync(
    iniPath,
    ['[ExampleAchievement001Name]', 'Description = Describes the achievement nr 1', 'Unlocked = 0', '', '[ACHIEVEMENT_23]', 'Unlocked = 1', 'UnlockTime = 1763722320'].join('\n')
  );
  return { appid: gogAppId, data: { type: 'gogUniverseLan', title: 'Dishonored: Definitive Edition', gogAppId, localAppData, gameDir: root } };
}

const steamDishonored = {
  appid: '217980',
  name: 'Dishonored',
  img: { header: 'header.jpg' },
  achievement: {
    total: 2,
    list: [
      { name: 'ACHIEVEMENT_23', displayName: 'Ghost', description: 'Complete the game without being detected', icon: 'a.jpg', icongray: 'b.jpg' },
      { name: 'ACHIEVEMENT_24', displayName: 'Clean Hands', description: 'Complete the game without killing anyone', icon: 'c.jpg', icongray: 'd.jpg' },
    ],
  },
};

test('getSchema takes the Steam release schema of a repaired GOG game, under its GOG id and title', async (t) => {
  const record = writeDishonoredSave(t);
  let asked;
  const game = await gogUniverseLan.getSchema(record, {
    steamIdForGogId: async (gogId) => (gogId === '1701063787' ? '217980' : undefined),
    readSteamSchema: async (steamRecord) => {
      asked = steamRecord;
      return steamDishonored;
    },
  });
  assert.equal(asked.appid, '217980');
  assert.equal(game.appid, '1701063787', 'the tile stays the GOG game');
  assert.equal(game.name, 'Dishonored: Definitive Edition');
  assert.equal(game.steamappid, '217980');
  assert.deepEqual(
    game.achievement.list.map((a) => a.displayName),
    ['Ghost', 'Clean Hands']
  );
});

test('getSchema keeps the Achievements.ini list for a GOG-only game or an unreadable Steam schema', async (t) => {
  const record = writeDishonoredSave(t);
  const gogOnly = await gogUniverseLan.getSchema(record, { steamIdForGogId: async () => undefined, readSteamSchema: async () => steamDishonored });
  assert.deepEqual(
    gogOnly.achievement.list.map((a) => a.name),
    ['ACHIEVEMENT_23']
  );
  const offline = await gogUniverseLan.getSchema(record, {
    steamIdForGogId: async () => '217980',
    readSteamSchema: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(offline.achievement.total, 1);
  const lookupFailed = await gogUniverseLan.getSchema(record, {
    steamIdForGogId: async () => {
      throw new Error('gamesdb down');
    },
    readSteamSchema: async () => steamDishonored,
  });
  assert.equal(lookupFailed.achievement.total, 1);
});

test('getGameData leaves out the example entry of UniverseLAN template', (t) => {
  const record = writeDishonoredSave(t);
  const game = gogUniverseLan.getGameData(record);
  assert.deepEqual(
    game.achievement.list.map((a) => a.name),
    ['ACHIEVEMENT_23']
  );
});

test('getGameData throws when no UniverseLAN save exists yet', () => {
  assert.throws(() => gogUniverseLan.getGameData({ appid: '1', data: { gogAppId: '1', localAppData: 'C:\\nope' } }));
});

test('hasGalaxyDll finds a nested Galaxy dll, ignores REDGalaxy, and caches its answer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ulan-probe-'));
  try {
    fs.writeFileSync(path.join(root, 'REDGalaxy64.dll'), '');
    assert.equal(gogUniverseLan.hasGalaxyDll(root, 1000), false);
    fs.mkdirSync(path.join(root, 'bin', 'x64'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bin', 'x64', 'Galaxy64.dll'), '');
    assert.equal(gogUniverseLan.hasGalaxyDll(root, 2000), false, 'the cached answer holds within the TTL');
    assert.equal(gogUniverseLan.hasGalaxyDll(root, 1000 + 11 * 60 * 1000), true, 'a stale answer is recomputed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
