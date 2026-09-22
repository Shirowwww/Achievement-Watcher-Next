'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const gogUniverseLan = require('../../app/parser/gogUniverseLan.js');

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

test('findGogAppId returns null with no marker file', (t) => {
  assert.equal(gogUniverseLan.findGogAppId(tmpDir(t)), null);
});

test('versionsMatch tolerates dot and comma-space separated version strings', () => {
  assert.equal(gogUniverseLan.versionsMatch('1.152.6.0', '1, 152, 6, 0'), true);
  assert.equal(gogUniverseLan.versionsMatch('1.152.6.0', '1.152.6.1'), false);
  assert.equal(gogUniverseLan.versionsMatch('', '1.0.0.0'), false);
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

test('repairInstallation leaves an unmatched dll untouched and reports it', (t) => {
  const root = tmpDir(t);
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'goggame-42.info'), '{}');
  fs.writeFileSync(path.join(gameDir, 'Galaxy64.dll'), 'original');

  const builds = { list: [], sdkVersionOf: () => '9.9.9.9' };
  const result = gogUniverseLan.repairInstallation({ gameDir, builds, compatTable: [], localAppData: path.join(root, 'LocalAppData') });

  assert.equal(result.unmatched.length, 1);
  assert.equal(fs.readFileSync(path.join(gameDir, 'Galaxy64.dll'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(gameDir, 'Galaxy64.dll.BAK')), false);
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
  assert.equal(found[0].source, 'GOG Galaxy');
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
