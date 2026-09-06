'use strict';

/*
  A packaged Unreal Engine build loads steam_api by explicit path from
  Engine/Binaries/ThirdParty/Steamworks/Steamv<version>/Win64, six levels below the build root and,
  when the library anchored the game on its project folder, outside the game folder entirely. Every
  emulator walk stopped at four levels, so that dll was never counted, never replaced and never got
  a steam_settings beside it: the GBE fix validated perfectly on screen while the process kept
  loading an untouched dll and recorded nothing.

  Reported for The Blood of Dawnwalker (46/46 in the schema, no GSE save at all after two hours) and
  STAR WARS Zero Company (dllCount 1 while two steam_api64.dll were on disk), both UE5 repacks.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const unrealLayout = require(path.join(__dirname, '..', '..', 'app', 'util', 'unrealLayout.js'));
const exeDetect = require(path.join(__dirname, '..', '..', 'app', 'parser', 'exeDetect.js'));
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const gbe = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'));
const emulatorFixEligibility = require(path.join(__dirname, '..', '..', 'app', 'util', 'emulatorFixEligibility.js'));
const { planAchievementDataRepair } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealthRepair.js'));

const SCHEMA = { achievement: { total: 1, list: [{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: 0 }] } };

function tmpdir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function writeSettings(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'achievements.json'),
    JSON.stringify([{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: '0', icon: '', icongray: '' }])
  );
  fs.writeFileSync(path.join(dir, 'steam_appid.txt'), '3751260');
  fs.writeFileSync(path.join(dir, 'configs.app.ini'), '[app::dlcs]\nunlock_all=1\n');
  fs.writeFileSync(path.join(dir, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\n');
  fs.writeFileSync(path.join(dir, 'configs.user.ini'), '[user::general]\naccount_name=Player\n');
  return dir;
}

/*
  The Blood of Dawnwalker's layout, verbatim from the report: the repack root holds Engine/ and the
  launcher shim, the project folder holds the executable the library indexed.
*/
function packagedBuild(prefix, { project = 'Dawnwalker', sdk = 'Steamv162', win32 = false, engineEmulated = false } = {}) {
  const root = path.join(tmpdir(prefix), 'The.Blood.of.Dawnwalker-InsaneRamZes');
  const steamworks = path.join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', sdk, 'Win64');
  // 'steam_settings' is the marker every Goldberg/GSE build carries and no Valve steam_api dll has.
  write(path.join(steamworks, 'steam_api64.dll'), engineEmulated ? 'gbe steam_settings marker' : 'valve-original-x64');
  if (win32) {
    write(path.join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', sdk, 'Win32', 'steam_api.dll'), 'valve-original-x86');
  }
  const exe = write(path.join(root, project, 'Binaries', 'Win64', `${project}.exe`), 'game');
  fs.mkdirSync(path.join(root, project, 'Content'), { recursive: true });
  write(path.join(root, `${project}.exe`), 'shim');
  return { root, projectDir: path.join(root, project), steamworks, exe };
}

test('the build root, not the project folder, is what an Unreal executable proves', () => {
  const build = packagedBuild('aw-ue-anchor-');

  assert.equal(exeDetect.gameDirForExe(build.exe), build.root);
  assert.equal(unrealLayout.buildRootFor(build.projectDir), build.root);
  assert.deepEqual(unrealLayout.steamworksDllDirs(build.projectDir), [build.steamworks]);
});

test('an emulated engine dll is found from the build root and from the project folder alike', () => {
  const build = packagedBuild('aw-ue-detect-', { engineEmulated: true });
  const engineDll = path.join(build.steamworks, 'steam_api64.dll');

  // Both are real gameDir values: the second is what libraries recorded before the anchor changed.
  assert.deepEqual(goldberg.detectEmulator(build.root).dll, [engineDll]);
  assert.deepEqual(goldberg.detectEmulator(build.projectDir).dll, [engineDll]);
});

test('the stock Steamworks SDK dll is not mistaken for a setup', () => {
  // Every packaged Unreal build ships Valve's own dll there. Counting it would report a legitimately
  // installed Unreal game as emulated and put a Goldberg diagnosis on it.
  const build = packagedBuild('aw-ue-stock-');

  const emu = goldberg.detectEmulator(build.root);
  assert.deepEqual(emu.dll, []);
  assert.equal(emu.type, 'none');
  assert.equal(emu.steamSettings, null);
});

test('a steam_settings beside the engine dll makes it evidence, whatever the dll itself is', () => {
  const build = packagedBuild('aw-ue-engine-settings-');
  writeSettings(path.join(build.steamworks, 'steam_settings'));

  assert.deepEqual(goldberg.detectEmulator(build.root).dll, [path.join(build.steamworks, 'steam_api64.dll')]);
});

test('the newest SDK folder leads, and a Win32 folder is listed as its own target', () => {
  const build = packagedBuild('aw-ue-sdk-', { win32: true });
  const older = path.join(build.root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv157', 'Win64');
  write(path.join(older, 'steam_api64.dll'), 'valve-original-x64');

  const dirs = unrealLayout.steamworksDllDirs(build.root);
  assert.equal(dirs[0], build.steamworks, 'Steamv162 outranks Steamv157');
  assert.ok(dirs.includes(older));
  assert.equal(unrealLayout.archOfSteamworksDir(build.steamworks), 'x64');
  assert.equal(unrealLayout.archOfSteamworksDir(path.join(path.dirname(build.steamworks), 'Win32')), 'x86');
  assert.equal(unrealLayout.archOfSteamworksDir(path.join(build.projectDir, 'Binaries', 'Win64')), '');
});

test('steam_settings beside the engine dll is the one resolved, from either anchor', () => {
  const build = packagedBuild('aw-ue-settings-');
  writeSettings(path.join(build.steamworks, 'steam_settings'));
  // The decoy is the layout the fix used to produce: complete, and read by nothing.
  writeSettings(path.join(build.root, 'steam_settings'));
  write(path.join(build.root, 'steam_api64.dll'), 'emu');

  assert.equal(goldberg.findSteamSettings(build.root), path.join(build.steamworks, 'steam_settings'));
  assert.equal(goldberg.findSteamSettings(build.projectDir), path.join(build.steamworks, 'steam_settings'));
});

test('a setup at the game root of an Unreal build is diagnosed as read by nothing', () => {
  // STAR WARS Zero Company's report: a dll and a complete steam_settings at the root, the engine's
  // own dll untouched, and every schema check passing while no unlock is ever written.
  const build = packagedBuild('aw-ue-diagnose-');
  writeSettings(path.join(build.root, 'steam_settings'));
  write(path.join(build.root, 'steam_api64.dll'), 'emu');

  const report = goldberg.diagnose({ gameDir: build.root, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  const issue = report.issues.find((entry) => entry.code === 'UNREAL_ENGINE_DLL_UNCONFIGURED');

  assert.ok(issue, 'the engine dll folder must be reported');
  assert.equal(issue.level, 'warning');
  assert.deepEqual(issue.data.engineDllDirs, [build.steamworks]);
  assert.deepEqual(report.engineDllDirs, [build.steamworks]);
  assert.equal(report.achievements.found, 1, 'the schema itself is genuinely fine, which is why this was invisible');
});

test('once the engine folder is configured the diagnosis is quiet', () => {
  const build = packagedBuild('aw-ue-quiet-');
  writeSettings(path.join(build.steamworks, 'steam_settings'));

  const report = goldberg.diagnose({ gameDir: build.root, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  assert.ok(!report.issues.some((entry) => entry.code === 'UNREAL_ENGINE_DLL_UNCONFIGURED'));
  assert.ok(!report.issues.some((entry) => entry.code === 'SETTINGS_NOT_BESIDE_DLL'));
});

test('a game that is not a packaged Unreal build is diagnosed exactly as before', () => {
  const gameDir = path.join(tmpdir('aw-flat-'), 'Flat Game');
  writeSettings(path.join(gameDir, 'steam_settings'));
  write(path.join(gameDir, 'steam_api64.dll'), 'emu');

  const report = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  assert.deepEqual(report.engineDllDirs, []);
  assert.ok(!report.issues.some((entry) => entry.code === 'UNREAL_ENGINE_DLL_UNCONFIGURED'));
  assert.equal(goldberg.findSteamSettings(gameDir), path.join(gameDir, 'steam_settings'));
});

test('the engine folder leads the install targets and the repair writes into it', () => {
  const build = packagedBuild('aw-ue-target-');
  write(path.join(build.root, 'steam_api64.dll'), 'emu');

  const dirs = gbe.runtimeDllDirs({
    gameDir: build.root,
    dllPaths: goldberg.detectEmulator(build.root).dll,
    exePath: build.exe,
    steamSettings: path.join(build.root, 'steam_settings'),
  });
  assert.equal(dirs[0], build.steamworks, 'the folder the engine loads from comes first');
  assert.ok(dirs.some((dir) => path.resolve(dir).toLowerCase() === path.resolve(build.root).toLowerCase()));

  const plan = planAchievementDataRepair({
    steamSettings: path.join(build.root, 'steam_settings'),
    gameDir: build.root,
    dllDirs: dirs,
    exePath: build.exe,
  });
  assert.equal(plan.target, path.join(build.steamworks, 'steam_settings'));
  assert.equal(plan.relocatedFrom, path.join(build.root, 'steam_settings'), 'the move is announced before it happens');
});

test('installing replaces the engine dll, keeps one .bak, and never seeds the wrong arch there', () => {
  const build = packagedBuild('aw-ue-install-', { win32: true });
  const cache = tmpdir('aw-ue-cache-');
  const dlls = {
    tag: 'test-build',
    x64: write(path.join(cache, 'steam_api64.dll'), 'gbe-x64'),
    x86: write(path.join(cache, 'steam_api.dll'), 'gbe-x86'),
  };
  const win32Dir = path.join(path.dirname(build.steamworks), 'Win32');

  gbe.installDlls({ dllDirs: [build.steamworks, win32Dir], dlls, writeIfMissing: 'x64', ensureArch: 'x64' });

  assert.equal(fs.readFileSync(path.join(build.steamworks, 'steam_api64.dll'), 'utf8'), 'gbe-x64');
  assert.equal(fs.readFileSync(path.join(build.steamworks, 'steam_api64.dll.bak'), 'utf8'), 'valve-original-x64');
  assert.equal(fs.readFileSync(path.join(win32Dir, 'steam_api.dll'), 'utf8'), 'gbe-x86', 'the arch present is replaced');
  assert.ok(!fs.existsSync(path.join(win32Dir, 'steam_api64.dll')), 'a Win32 folder never receives the 64-bit dll');
});

test('a build is only "already fixed" once every target folder holds the supported dll', () => {
  /*
    The state both reports were in: AW had replaced the dll at the game root, so the game read as
    done, while the one the engine loads was still Valve's own and nothing was ever recorded.
  */
  const build = packagedBuild('aw-ue-stale-');
  const cache = tmpdir('aw-ue-stale-cache-');
  fs.writeFileSync(path.join(cache, 'latest.txt'), 'test-build');
  const cached = write(path.join(cache, 'test-build', 'steam_api64.dll'), 'gbe steam_settings marker');
  write(path.join(build.root, 'steam_api64.dll'), fs.readFileSync(cached, 'utf8'));

  const dirs = [build.root, build.steamworks];
  const stale = gbe.runtimeDllState({ dllDirs: dirs, arch: 'x64', cacheDir: cache });
  assert.equal(stale.ready, false, 'the engine copy is still the original');
  assert.equal(stale.stale, path.join(build.steamworks, 'steam_api64.dll'));

  gbe.installDlls({ dllDirs: dirs, dlls: { tag: 'test-build', x64: cached, x86: null }, writeIfMissing: 'x64' });
  const fixed = gbe.runtimeDllState({ dllDirs: dirs, arch: 'x64', cacheDir: cache });
  assert.equal(fixed.ready, true);
  assert.equal(fixed.stale, null);
  assert.equal(fixed.targets.length, 2);
});

test('steam_interfaces.txt is never generated from a dll that is itself an emulator', () => {
  const dir = tmpdir('aw-ue-interfaces-');
  // The marker every Goldberg/GSE build carries and no Valve steam_api does.
  const emu = write(path.join(dir, 'root', 'steam_api64.dll'), 'gbe steam_settings marker');
  const original = write(path.join(dir, 'engine', 'steam_api64.dll'), 'valve-original-x64');

  assert.deepEqual(gbe.interfaceSourceFor(emu), { file: '', reason: 'emulator-dll' });
  assert.deepEqual(gbe.interfaceSourceFor(emu, [original]), { file: original, reason: '' }, 'an intact copy elsewhere is used instead');

  const bak = write(`${emu}.bak`, 'valve-original-x64');
  assert.deepEqual(gbe.interfaceSourceFor(emu, [original]), { file: bak, reason: '' }, "AW's own backup still wins");
  assert.deepEqual(gbe.interfaceSourceFor(path.join(dir, 'missing', 'steam_api64.dll')), { file: '', reason: 'missing-dll' });
});

test('the fix gate sees the engine dll and an engine-side setup it must not overwrite', () => {
  const build = packagedBuild('aw-ue-gate-');

  assert.equal(emulatorFixEligibility.hasSteamApiDll(build.root), true);
  assert.equal(emulatorFixEligibility.findExistingFix(build.root), null);

  writeSettings(path.join(build.steamworks, 'steam_settings'));
  const existing = emulatorFixEligibility.findExistingFix(build.root);
  assert.equal(existing && existing.kind, 'steam-settings');
  assert.equal(existing && existing.path, path.join(build.steamworks, 'steam_settings'));
});
