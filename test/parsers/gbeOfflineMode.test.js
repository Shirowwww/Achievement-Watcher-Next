'use strict';

/*
  [main::connectivity] offline=1 makes GBE answer "not logged on", and a game that waits for a Steam
  login before recording anything then drops every unlock (Phantom Blade Zero under ARTIFACT's
  release: Unreal's online subsystem fails its login and the game's unlock path never opens).
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const gameHealth = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));
const gameHealthRepair = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealthRepair.js'));
const awManagedConfig = require(path.join(__dirname, '..', '..', 'app', 'util', 'awManagedConfig.js'));

const APPID = '4115450';
const SCHEMA = {
  achievement: {
    total: 2,
    list: [
      { name: 'ACH_1', displayName: 'One', description: 'First' },
      { name: 'ACH_2', displayName: 'Two', description: 'Second' },
    ],
  },
};
const ARTIFACT_MAIN = '[main::general]\nnew_app_ticket=1\ngc_token=1\n\n[main::connectivity]\n; ARTIFACT ships the game offline\noffline=1\ndisable_lan_only=1\n';

function install({ main = ARTIFACT_MAIN, earned = null } = {}) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-offline-'));
  const steamSettings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(steamSettings);
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'dll');
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify(SCHEMA.achievement.list.map(({ name, displayName }) => ({ name, displayName, description: 'd', hidden: 0 }))));
  fs.writeFileSync(path.join(steamSettings, 'configs.main.ini'), main);
  const savesRoot = path.join(gameDir, 'GSE Saves');
  if (earned != null) {
    fs.mkdirSync(path.join(savesRoot, APPID), { recursive: true });
    const save = Object.fromEntries(SCHEMA.achievement.list.map(({ name }, i) => [name, { earned: i < earned, earned_time: i < earned ? 1762400000 : 0 }]));
    fs.writeFileSync(path.join(savesRoot, APPID, 'achievements.json'), JSON.stringify(save));
  }
  return { gameDir, steamSettings, savesRoots: [{ type: 'gbe', root: savesRoot }] };
}

const diagnose = ({ gameDir, savesRoots }) => goldberg.diagnose({ gameDir, appid: APPID, schema: SCHEMA, savesRoots });
const offlineIssue = (report) => report.issues.find((issue) => issue.code === 'EMULATOR_OFFLINE');
const mainConfig = (steamSettings) => fs.readFileSync(path.join(steamSettings, 'configs.main.ini'), 'utf8');

test('offline=1 with nothing recorded is flagged as a warning naming the file', () => {
  const setup = install();
  const issue = offlineIssue(diagnose(setup));
  assert.equal(issue && issue.level, 'warning');
  assert.equal(issue.data.file, path.join(setup.steamSettings, 'configs.main.ini'));
  // A save that exists but holds only locked entries (AW's own seed looks like this) proves nothing.
  assert.ok(offlineIssue(diagnose(install({ earned: 0 }))));
});

test('every spelling GBE reads as true counts, and nothing else does', () => {
  for (const value of ['true', 'YES', 'on']) {
    assert.ok(offlineIssue(diagnose(install({ main: `[main::connectivity]\noffline=${value}\n` }))), value);
  }
  for (const main of ['[main::connectivity]\noffline=0\n', '[main::connectivity]\n;offline=1\n# offline=1\n', '[main::general]\noffline=1\n', '[main::connectivity]\noffline=1\noffline=0\n']) {
    assert.equal(offlineIssue(diagnose(install({ main }))), undefined, main);
  }
});

test('one recorded unlock proves the setting does not stop this game', () => {
  assert.equal(offlineIssue(diagnose(install({ earned: 1 }))), undefined);
});

test('the main config repair keeps offline=1 unless asked to go online', () => {
  const kept = install();
  assert.equal(goldberg.writeMainConfig({ steamSettings: kept.steamSettings }).wentOnline, false);
  assert.match(mainConfig(kept.steamSettings), /^offline=1$/m, 'a release may set it on purpose');

  const fixed = install();
  const backupDir = path.join(fixed.gameDir, 'backup');
  assert.equal(goldberg.writeMainConfig({ steamSettings: fixed.steamSettings, backupDir, online: true }).wentOnline, true);
  const text = mainConfig(fixed.steamSettings);
  assert.match(text, /^offline=0$/m);
  assert.match(text, /^; ARTIFACT ships the game offline$/m, 'comments survive');
  assert.match(text, /^disable_lan_only=1$/m, 'the rest of the section survives');
  assert.match(fs.readFileSync(path.join(backupDir, 'configs.main.ini'), 'utf8'), /^offline=1$/m, 'the original is kept');
  assert.equal(offlineIssue(diagnose(fixed)), undefined);
});

test('going online never adds a key to a config that has none', () => {
  const setup = install({ main: '[main::general]\nnew_app_ticket=1\n' });
  assert.equal(goldberg.writeMainConfig({ steamSettings: setup.steamSettings, online: true }).wentOnline, false);
  assert.doesNotMatch(mainConfig(setup.steamSettings), /connectivity|offline/);
});

test('repair() turns it off only when told to', async () => {
  const silent = install();
  await goldberg.repair({ steamSettings: silent.steamSettings, appid: APPID, schema: SCHEMA, writeDlc: false });
  assert.match(mainConfig(silent.steamSettings), /^offline=1$/m, 'the bulk and silent passes never change it');

  const asked = install();
  const summary = await goldberg.repair({ steamSettings: asked.steamSettings, appid: APPID, schema: SCHEMA, writeDlc: false, online: true });
  assert.equal(summary.main.wentOnline, true);
  assert.match(mainConfig(asked.steamSettings), /^offline=0$/m);
});

test('the Game Health repair hands the request on to goldberg.repair()', async () => {
  let seen = null;
  const stub = { repair: async (args) => (seen = args) };
  await gameHealthRepair.repairAchievementData({ goldberg: stub, plan: { target: 'x' }, appid: APPID, schema: SCHEMA, online: true });
  assert.equal(seen.online, true);
  await gameHealthRepair.repairAchievementData({ goldberg: stub, plan: { target: 'x' }, appid: APPID, schema: SCHEMA });
  assert.equal(seen.online, false);
});

// The automatic fix passes the manageDlc setting (off by default); it used to be dropped here, so
// every automatic repair rewrote configs.app.ini on a game the user wanted stock.
test('the Game Health repair honours a request to leave the DLC config alone', async () => {
  let seen = null;
  const stub = { repair: async (args) => (seen = args) };
  await gameHealthRepair.repairAchievementData({ goldberg: stub, plan: { target: 'x' }, appid: APPID, schema: SCHEMA, writeDlc: false });
  assert.equal(seen.writeDlc, false);
  await gameHealthRepair.repairAchievementData({ goldberg: stub, plan: { target: 'x' }, appid: APPID, schema: SCHEMA });
  assert.equal(seen.writeDlc, true, 'the explicit panel repair keeps writing it');
});

test('Game Health names it and offers the repair', () => {
  assert.ok(gameHealth.REPAIRABLE_GOLDBERG_CODES.has('EMULATOR_OFFLINE'));
  const report = gameHealth.deriveHealth({
    appid: APPID,
    name: 'Phantom Blade Zero',
    source: 'Goldberg',
    gameDir: 'C:/Jeux/PBZ/platform/steam',
    gameDirExists: true,
    installed: true,
    exe: 'C:/Jeux/PBZ/platform/steam/PBZ.exe',
    exeExists: true,
    achievements: { total: 2, unlocked: 0 },
    emulated: true,
    goldberg: {
      emulator: 'gbe',
      steamSettings: 'C:/Jeux/PBZ/platform/steam/steam_settings',
      dllCount: 1,
      achievements: { expected: 2, found: 2, missing: [], missingIcons: [] },
      save: { exists: true, type: 'gbe', earned: 0, total: 2 },
      issues: [{ level: 'warning', code: 'EMULATOR_OFFLINE', message: 'configs.main.ini sets offline=1' }],
      ok: true,
    },
    uplay: null,
    tracking: { indexed: true, binary: 'PBZ.exe' },
    notifications: { transport: 'toast', progressMuted: false },
    playtime: { total: 7200, lastPlayed: 1762400000 },
  });
  const emulator = report.checks.find((entry) => entry.id === 'emulator');
  assert.equal(emulator.level, gameHealth.LEVEL.WARN);
  assert.deepEqual(emulator.params.topics, ['offline']);
  assert.ok(emulator.actions.includes(gameHealth.ACTION.REPAIR_DATA));
  assert.notEqual(report.state, gameHealth.STATE.READY);
  // The list itself is complete: the panel must name the offline mode, not call the list wrong.
  assert.equal(report.checks.find((entry) => entry.id === 'achievement-data').level, gameHealth.LEVEL.OK);
  assert.equal(report.reason, 'emulator-offline');
});

/*
  The release as it ships, file for file (contents are markers): Valve's dll untouched in both
  places, GBE as the steamclient coldloader points Steam at, and a steam_settings with no
  achievements.json and offline=1. One repair has to take it to Ready without touching the crack.
*/
function artifactRelease() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-artifact-')), 'PBZ');
  const put = (rel, text) => {
    const file = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  };
  put('Engine/Binaries/ThirdParty/Steamworks/Steamv165/Win64/steam_api64.dll', 'valve-original-x64');
  put('ProjectPBZ/Binaries/Win64/placeholder.txt', '');
  fs.mkdirSync(path.join(root, 'ProjectPBZ', 'Content'), { recursive: true });
  const exe = put('platform/steam/PBZ.exe', 'game');
  put('platform/steam/steam_api64.dll', 'valve-original-x64');
  for (const name of ['winmm.dll', 'artifact.dll', 'coldloader.dll']) put(`platform/steam/${name}`, `artifact ${name}`);
  put('platform/steam/artifact.json', '{}');
  put('platform/steam/steamclient64.dll', 'gbe steam_settings marker GSE Saves');
  put('platform/steam/steam_settings/configs.app.ini', '[app::dlcs]\nunlock_all=0\n5041150=Phantom Blade Zero Deluxe Edition Upgrade\n5068070=Phantom Blade Zero Pre-Purchase Bonus\n');
  put('platform/steam/steam_settings/configs.main.ini', '[main::connectivity]\noffline=1');
  put('platform/steam/steam_settings/configs.user.ini', '[user::general]\naccount_name=Artifact\naccount_steamid=76561197960287930\nlanguage=english\n');
  put('platform/steam/steam_settings/steam_appid.txt', APPID);
  put('platform/steam/steam_settings/supported_languages.txt', 'english\nfrench\n');
  const savesRoot = path.join(root, '..', 'GSE Saves');
  return { root, gameDir: path.dirname(exe), exe, savesRoots: [{ type: 'gbe', root: savesRoot }] };
}

const readTree = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((name) => /\.(dll|json)$/i.test(name)).map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')]));

test("ARTIFACT's release is set right in one repair, crack files untouched", async () => {
  const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
  const release = artifactRelease();
  const { gameDir } = release;
  const engineDir = path.join(release.root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv165', 'Win64');
  const crackBefore = readTree(gameDir);
  // The panel only diagnoses a folder no foreign loader serves.
  assert.equal(crackLoaderDetect.detectWorkingCrackLoader(gameDir), null);

  const health = (report) =>
    gameHealth.deriveHealth({
      appid: APPID,
      name: 'Phantom Blade Zero',
      source: 'Goldberg',
      gameDir,
      gameDirExists: true,
      installed: true,
      exe: release.exe,
      exeExists: true,
      achievements: { total: 2, unlocked: 0 },
      emulated: true,
      goldberg: { ...report, dllCount: goldberg.detectEmulator(gameDir).dll.length },
      tracking: { indexed: true, binary: 'PBZ.exe' },
      notifications: { transport: 'toast', progressMuted: false },
      playtime: { total: 9991, lastPlayed: 1762400000 },
    });

  const before = goldberg.diagnose({ gameDir, appid: APPID, schema: SCHEMA, savesRoots: release.savesRoots });
  const codesBefore = before.issues.map((issue) => issue.code);
  assert.ok(codesBefore.includes('NO_ACHIEVEMENTS_JSON') && codesBefore.includes('EMULATOR_OFFLINE'), codesBefore.join(','));
  assert.ok(!codesBefore.includes('UNREAL_ENGINE_DLL_UNCONFIGURED'));
  const healthBefore = health(before);
  assert.notEqual(healthBefore.state, gameHealth.STATE.READY);
  assert.ok(healthBefore.actions.includes(gameHealth.ACTION.REPAIR_DATA));
  // The missing list fails the row, and the offline mode the same repair clears is named beside it.
  assert.deepEqual(healthBefore.checks.find((entry) => entry.id === 'emulator').params.topics, ['schema', 'offline']);

  const plan = gameHealthRepair.planAchievementDataRepair({ steamSettings: before.steamSettings, gameDir, dllDirs: before.dllDirs, exePath: release.exe });
  assert.equal(plan.target, path.join(gameDir, 'steam_settings'));
  const summary = await gameHealthRepair.repairAchievementData({ goldberg, plan, appid: APPID, schema: SCHEMA, fillUserDefaults: true, online: codesBefore.includes('EMULATOR_OFFLINE') });
  assert.equal(summary.main.wentOnline, true);

  const after = goldberg.diagnose({ gameDir, appid: APPID, schema: SCHEMA, savesRoots: release.savesRoots });
  assert.deepEqual(after.issues.filter((issue) => issue.level !== 'info').map((issue) => issue.code), []);
  // The setup rows go green; "no progress yet" stays until the game is played again, as it should.
  const healthAfter = health(after);
  for (const id of ['emulator', 'achievement-data']) {
    assert.equal(healthAfter.checks.find((entry) => entry.id === id).level, gameHealth.LEVEL.OK, id);
  }
  assert.notEqual(healthAfter.reason, 'emulator-offline');
  assert.deepEqual(readTree(gameDir), crackBefore, 'winmm, artifact, coldloader, steamclient and Valve dll unchanged');
  assert.equal(fs.readFileSync(path.join(engineDir, 'steam_api64.dll'), 'utf8'), 'valve-original-x64');
  const settings = path.join(gameDir, 'steam_settings');
  assert.match(fs.readFileSync(path.join(settings, 'configs.user.ini'), 'utf8'), /^account_steamid=76561197960287930$/m);
  assert.equal(fs.readFileSync(path.join(settings, 'steam_appid.txt'), 'utf8'), APPID);
  assert.match(fs.readFileSync(path.join(settings, 'configs.app.ini'), 'utf8'), /^unlock_all=0$/m, 'the release keeps its own DLC list');

  // One click puts the release's offline=1 back, and the diagnosis sees it again.
  assert.equal(awManagedConfig.offlineTurnedOffByAw(settings), true);
  assert.equal(goldberg.restoreOfflineMode({ steamSettings: settings }), true);
  assert.match(mainConfig(settings), /^\[main::connectivity\]\noffline=1$/m);
  assert.doesNotMatch(mainConfig(settings), /AW Next turned/);
  assert.ok(offlineIssue(goldberg.diagnose({ gameDir, appid: APPID, schema: SCHEMA, savesRoots: release.savesRoots })));
});

// Every file under a folder, with its bytes, for a before/after comparison.
function treeOf(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full).toString('base64');
    }
  };
  walk(dir);
  return out;
}

test('the recorded repair is undone file for file, backups included', async () => {
  const repairJournal = require(path.join(__dirname, '..', '..', 'app', 'util', 'repairJournal.js'));
  const release = artifactRelease();
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-undo-userdata-'));
  const before = treeOf(release.root);
  const settings = path.join(release.gameDir, 'steam_settings');

  const plan = gameHealthRepair.planAchievementDataRepair({ steamSettings: settings, gameDir: release.gameDir, dllDirs: [release.gameDir], exePath: release.exe });
  const roots = repairJournal.gbeRoots({ settingsDirs: [plan.target] });
  await repairJournal.record({ userDataPath, appid: APPID, label: 'repair-data', roots }, () =>
    gameHealthRepair.repairAchievementData({ goldberg, plan, appid: APPID, schema: SCHEMA, fillUserDefaults: true, online: true })
  );
  assert.notDeepEqual(treeOf(release.root), before, 'the repair wrote something');

  const result = repairJournal.undo({ userDataPath, appid: APPID });
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(treeOf(release.root), before, 'the release is back exactly as it shipped');
});

/*
  ColdClient is GBE underneath and reads the steam_settings beside its loader, but AW Next never
  rewrites that setup: the fix there is the one line, kept and reversible.
*/
const COLDCLIENT_MAIN = '; the user\'s own notes\n[main::general]\nnew_app_ticket=0\n\n[main::connectivity]\ndisable_lan_only=1\noffline=1\n';

function coldClientSettings(main = COLDCLIENT_MAIN) {
  const steamSettings = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-coldclient-')), 'steam_settings');
  fs.mkdirSync(steamSettings);
  fs.writeFileSync(path.join(steamSettings, 'configs.main.ini'), main);
  return steamSettings;
}

test('turning offline mode off changes that line only, keeps the file and can be undone', () => {
  const steamSettings = coldClientSettings();
  assert.equal(goldberg.offlineModeIn(steamSettings), true);

  const result = goldberg.turnOfflineModeOff({ steamSettings });
  assert.equal(result.changed, true);
  assert.equal(fs.readFileSync(path.join(result.backupDir, 'configs.main.ini'), 'utf8'), COLDCLIENT_MAIN, 'the original is kept');
  const changed = mainConfig(steamSettings);
  assert.match(changed, /^new_app_ticket=0$/m, 'nothing else is rewritten');
  assert.match(changed, /^offline=0$/m);
  assert.equal(goldberg.offlineModeIn(steamSettings), false);
  assert.equal(goldberg.turnOfflineModeOff({ steamSettings }).changed, false, 'a second click has nothing to do');

  assert.equal(goldberg.restoreOfflineMode({ steamSettings }), true);
  assert.equal(mainConfig(steamSettings), COLDCLIENT_MAIN, 'the undo gives the file back as it was');
  assert.equal(goldberg.restoreOfflineMode({ steamSettings }), false);
});

test('a file with Windows line endings comes back byte for byte', () => {
  const crlf = COLDCLIENT_MAIN.replace(/\n/g, '\r\n');
  const steamSettings = coldClientSettings(crlf);
  goldberg.turnOfflineModeOff({ steamSettings });
  assert.match(mainConfig(steamSettings), /\r\noffline=0\r\n/);
  goldberg.restoreOfflineMode({ steamSettings });
  assert.equal(mainConfig(steamSettings), crlf);
});

test('a value set back by hand leaves nothing to undo', () => {
  const steamSettings = coldClientSettings();
  goldberg.turnOfflineModeOff({ steamSettings });
  fs.writeFileSync(path.join(steamSettings, 'configs.main.ini'), mainConfig(steamSettings).replace(/^offline=0$/m, 'offline=1'));
  assert.equal(awManagedConfig.offlineTurnedOffByAw(steamSettings), false);
});

test("removing AW Next's configuration puts offline=1 back too", () => {
  const steamSettings = coldClientSettings();
  goldberg.turnOfflineModeOff({ steamSettings });
  assert.ok(awManagedConfig.inspect(steamSettings).files.some((entry) => entry.reason === 'main::connectivity.offline'));
  const preview = awManagedConfig.strip(steamSettings, { dryRun: true });
  assert.ok(preview.removed.some((entry) => entry.file.endsWith('configs.main.ini')));
  assert.match(mainConfig(steamSettings), /^offline=0$/m, 'a preview changes nothing');
  awManagedConfig.strip(steamSettings);
  assert.equal(mainConfig(steamSettings), COLDCLIENT_MAIN);
});

test('Game Health offers the one-line fix on a ColdClient game that has recorded nothing', () => {
  const report = (unlocked) =>
    gameHealth.deriveHealth({
      appid: APPID,
      name: 'Some Game',
      source: 'Goldberg',
      gameDir: 'C:/Games/Some Game',
      gameDirExists: true,
      installed: true,
      exe: 'C:/Games/Some Game/game.exe',
      exeExists: true,
      achievements: { total: 2, unlocked },
      emulated: false,
      goldberg: null,
      crackLoader: { name: 'ColdClient', replaceable: false, offline: true },
      tracking: { indexed: true, binary: 'game.exe' },
      notifications: { transport: 'toast', progressMuted: false },
      playtime: { total: 7200, lastPlayed: 1762400000 },
    });
  const stuck = report(0);
  const row = stuck.checks.find((entry) => entry.id === 'emulator');
  assert.equal(row.level, gameHealth.LEVEL.WARN);
  assert.deepEqual(row.actions, [gameHealth.ACTION.SET_ONLINE]);
  assert.equal(stuck.reason, 'emulator-offline', 'named before the vaguer "this crack records nothing"');
  assert.ok(!stuck.actions.includes(gameHealth.ACTION.REPAIR_DATA), 'the ColdClient setup is never rewritten');

  const working = report(1).checks.find((entry) => entry.id === 'emulator');
  assert.equal(working.level, gameHealth.LEVEL.INFO, 'one recorded unlock proves the setting is harmless');
  assert.deepEqual(working.actions, []);
});
