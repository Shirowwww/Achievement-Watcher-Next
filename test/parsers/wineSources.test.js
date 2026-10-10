'use strict';

/*
  Every source that reads a Windows profile folder or the registry finds a game that runs in a Wine
  prefix: its save file sits in <prefix>/drive_c/users/<user>/..., its registry in user.reg and
  system.reg. One throwaway prefix per test (test/helpers/winePrefix.js), nothing else on the host.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { withWinePrefix, LINUX_ONLY } = require('../helpers/winePrefix.js');
const { makeProfile } = require('../helpers/madnesspatch.js');

const app = (rel) => path.join(__dirname, '..', '..', 'app', rel);

// A key line and values as wineserver writes them: backslashes doubled.
const regKey = (key) => `[${key.split('/').join('\\\\')}] 1791978481`;
const regString = (name, value) => `"${name}"="${String(value).replace(/\\/g, '\\\\')}"`;
const regDword = (name, value) => `"${name}"=dword:${value.toString(16).padStart(8, '0')}`;

test('GBE saves in a prefix are a known root, read back, and a game inside the prefix writes there', LINUX_ONLY, () =>
  withWinePrefix(({ appData, driveC, write }) => {
    const saveRoots = require(app('parser/saveRoots.js'));
    const goldberg = require(app('parser/goldberg.js'));
    write(path.join(appData, 'GSE Saves', '400', 'achievements.json'), JSON.stringify({ LAB_RAT: { earned: true, earned_time: 1 } }));

    assert.ok(saveRoots.defaultSteamEmuSaveRoots({ existingOnly: true }).includes(path.join(appData, 'GSE Saves')));
    const state = goldberg.inspectSaveState('400');
    assert.equal(state.file, path.join(appData, 'GSE Saves', '400', 'achievements.json'));
    assert.equal(state.earned, 1);

    const gameDir = path.join(driveC, 'Games', 'Portal');
    fs.mkdirSync(gameDir, { recursive: true });
    assert.equal(goldberg.saveFolderFor('gbe', '620', gameDir), path.join(appData, 'GSE Saves', '620'));
  }));

test('Smart Find probes the Games folders of every prefix and of the home folder', LINUX_ONLY, () =>
  withWinePrefix(async ({ home, driveC }) => {
    const saveRoots = require(app('parser/saveRoots.js'));
    fs.mkdirSync(path.join(driveC, 'Games'), { recursive: true });
    fs.mkdirSync(path.join(home, 'Jeux'), { recursive: true });
    const roots = await saveRoots.discoverLibraryRoots();
    assert.ok(roots.includes(path.join(driveC, 'Games')));
    assert.ok(roots.includes(path.join(home, 'Jeux')));
  }));

test('Goldberg SocialClub, Nemirtingas and shadPS4 roots exist on the prefix host', LINUX_ONLY, () =>
  withWinePrefix(({ appData, write }) => {
    const socialclub = require(app('parser/socialclub.js'));
    const nemirtingasEpic = require(app('util/nemirtingasEpic.js'));
    const shadps4Watch = require('../../watchdog/console/shadps4Watch.js');

    assert.ok(socialclub.defaultRoots().includes(path.join(appData, 'Goldberg SocialClub Emu Saves')));

    fs.mkdirSync(path.join(appData, 'NemirtingasEpicEmu', 'Player', 'CrabTest'), { recursive: true });
    assert.equal(nemirtingasEpic.hasSavedFor('CrabTest'), true);

    write(path.join(appData, 'shadPS4', 'user', 'game_data', 'CUSA00001', 'TrophyFiles', 'trophy00', 'Xml', 'TROP.XML'), '<trophyconf/>');
    assert.deepEqual(
      shadps4Watch._internal.discover().map((target) => target.appid),
      ['CUSA00001']
    );
  }));

test('XLLN reads the per-user folder of the prefix the game sits in', LINUX_ONLY, () =>
  withWinePrefix(({ localAppData, driveC }) => {
    const xlln = require(app('parser/xlln.js'));
    const gameDir = path.join(driveC, 'Games', 'Gears');
    fs.mkdirSync(gameDir, { recursive: true });
    assert.ok(xlln.storageRoots(gameDir).includes(path.join(localAppData, 'XLiveLessNess')));
  }));

test('MarkerPatch and MadnessPatch state is read from the prefix that holds it', LINUX_ONLY, () =>
  withWinePrefix(({ localAppData, documents, write }) => {
    const markerpatch = require(app('parser/markerpatch.js'));
    const madnesspatch = require(app('parser/madnesspatch.js'));

    const settings = write(path.join(localAppData, 'EA Games', 'Dead Space 2', 'settings.txt'), 'Controls.AcL.X = 5\nControls.AcL.Y = 0\n');
    assert.equal(markerpatch.stateFilePath(), settings);
    assert.ok(markerpatch.stateFilePaths().includes(settings));
    assert.deepEqual(
      markerpatch.getAchievements({}).map((entry) => entry.id),
      ['MARKERPATCH_0', 'MARKERPATCH_2']
    );

    const checkpoint = path.join(documents, 'My Games', 'Alice Madness Returns', 'AliceGame', 'CheckPoint');
    makeProfile(checkpoint, 'Profile1', 0b11n);
    assert.ok(madnesspatch.checkpointRoots().includes(checkpoint));
    assert.deepEqual(
      madnesspatch.listProfiles().map((entry) => entry.profile),
      ['Profile1']
    );
  }));

test('a Documents folder redirected in the prefix registry is followed by every Documents source', LINUX_ONLY, () =>
  withWinePrefix(({ driveC, writeHive }) => {
    writeHive('HKCU', [
      regKey('Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders'),
      `"Personal"=str(2):"%USERPROFILE%\\\\Mes documents"`,
    ]);
    const redirected = path.join(driveC, 'users', 'player', 'Mes documents');
    const ff7 = require(app('parser/ff7.js'));
    const runeUplay = require(app('parser/runeUplay.js'));
    const x360Recomp = require(app('parser/x360Recomp.js'));
    const { documentsFor } = require(app('util/appHosts.js'));

    assert.ok(ff7.defaultRoots().includes(path.join(redirected, 'FINAL FANTASY VII')));
    assert.ok(runeUplay.defaultRoots().includes(path.join(redirected, 'RUNE', 'Ubisoft Connect')));
    assert.equal(x360Recomp.documentsRoots()[1], redirected, 'the native host comes first, then the prefix');
    assert.equal(documentsFor(path.join(driveC, 'Games', 'Darksiders')), redirected, 'a game in the prefix means its Documents');
  }));

test('an emulator installed in the prefix is found through its system.reg', LINUX_ONLY, () =>
  withWinePrefix(({ driveC, writeHive }) => {
    writeHive('HKLM', [
      regKey('Software/Microsoft/Windows/CurrentVersion/App Paths/rpcs3.exe'),
      `@="C:\\\\Emulators\\\\RPCS3\\\\rpcs3.exe"`,
    ]);
    const userDir = require(app('parser/userDir.js'));
    assert.ok(userDir._internal.emulatorRootsFromRegistry().includes(path.join(driveC, 'Emulators', 'RPCS3')));
  }));

test('GreenLuma and LumaPlay unlocks are read from the prefix user.reg', LINUX_ONLY, () =>
  withWinePrefix(async ({ writeHive }) => {
    writeHive('HKCU', [
      regKey('Software/GL2024/AppID/400'),
      regDword('SkipStatsAndAchievements', 0),
      regKey('Software/GL2024/AppID/400/Achievements'),
      regDword('LAB_RAT', 1),
      regDword('LAB_RAT_Time', 1700000000),
      regKey('Software/LumaPlay/Player/720/Achievements'),
      regDword('ACH_1', 1),
    ]);
    const greenluma = require(app('parser/greenluma.js'));
    const uplay = require(app('parser/uplay.js'));

    const [gl] = await greenluma.scan();
    assert.equal(gl.appid, '400');
    assert.deepEqual(await greenluma.getAchievements(gl.data.root, gl.data.path, gl.data.host), [{ id: 'LAB_RAT', Achieved: 1, UnlockTime: 1700000000 }]);

    const [luma] = await uplay.scan();
    assert.equal(luma.appid, 'UPLAY720');
    assert.deepEqual(uplay.getAchievementsFromLumaPlay(luma.data.root, luma.data.path, luma.data.host), [{ id: '1', Achieved: 1 }]);
  }));

test('Ubisoft Connect in a prefix: installs and the launcher folder come from system.reg', LINUX_ONLY, () =>
  withWinePrefix(({ driveC, writeHive }) => {
    const launcher = path.join(driveC, 'Program Files (x86)', 'Ubisoft', 'Ubisoft Game Launcher');
    const game = path.join(driveC, 'Program Files (x86)', 'Ubisoft', 'Games', 'Rayman Origins');
    fs.mkdirSync(game, { recursive: true });
    writeHive('HKLM', [
      regKey('Software/Wow6432Node/Ubisoft/Launcher'),
      regString('InstallDir', 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\'),
      regKey('Software/Wow6432Node/Ubisoft/Launcher/Installs/80'),
      regString('InstallDir', 'C:/Program Files (x86)/Ubisoft/Games/Rayman Origins/'),
    ]);
    const ubisoftRegistry = require(app('util/ubisoftRegistry.js'));
    const uplay = require(app('parser/uplay.js'));
    const uplayR2Installer = require(app('parser/uplayR2Installer.js'));

    assert.deepEqual(ubisoftRegistry.launcherDirs(), [launcher]);
    assert.deepEqual(ubisoftRegistry.installs(), [{ id: '80', dir: game }]);
    assert.equal(ubisoftRegistry.installDir('80'), game);
    assert.equal(uplay.isInstalled('UPLAY80'), true);
    assert.equal(uplayR2Installer.isRegisteredUbisoftInstall(path.join(game, 'bin')), true);
  }));

test('the Uplay R2 redirect is written as the prefix spells it and read back as a local path', LINUX_ONLY, () =>
  withWinePrefix(({ appData, driveC }) => {
    const uplayR2 = require(app('parser/uplayR2.js'));
    const gameDir = path.join(driveC, 'Games', 'Rayman Legends');
    fs.mkdirSync(gameDir, { recursive: true });

    const plan = uplayR2.planSettingsConfig({
      dir: gameDir,
      steamAppid: 242550,
      capabilities: { supportsAchRedirect: true, supportsAchKeyPrefix: false },
      flavour: 'r2',
    });
    assert.match(plan.files[0].next, /^AchSavePath\s*=\s*C:\\users\\player\\AppData\\Roaming\\GSE Saves\\242550$/m);

    fs.writeFileSync(plan.files[0].file, plan.files[0].next);
    const dirs = uplayR2.resolveAchievementSaveDirs({ gameDir, runtimeDir: gameDir, steamAppid: 242550 });
    assert.equal(dirs[0], path.join(appData, 'GSE Saves', '242550'));
  }));

test('the EA Desktop logs are taken from the prefix that has them', LINUX_ONLY, () =>
  withWinePrefix(({ localAppData }) => {
    const logs = path.join(localAppData, 'Electronic Arts', 'EA Desktop', 'Logs');
    fs.mkdirSync(logs, { recursive: true });
    const ea = require(app('parser/ea.js'));
    assert.equal(ea.defaultEaLogsRoot(), logs);
  }));
