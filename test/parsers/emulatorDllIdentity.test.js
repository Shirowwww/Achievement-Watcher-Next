'use strict';

/*
  Which build is in the folder, and can steam_interfaces.txt still be made?

  When a repaired game still records nothing, the health report used to offer a count of steam_api
  dlls and the folders they sit in. That cannot separate a fix that landed from one that went
  somewhere the process never looks: a release that shipped its own emulator has a dll in exactly the
  same place, of exactly the same name. Naming the build settles it from a pasted report alone.

  The second half is the file AW Next cannot always produce. steam_interfaces.txt is generated from
  the game's ORIGINAL dll, and a release that overwrote it leaves nothing to read - the emulator then
  answers from its built-in interface versions, which used to be a line in the log and nothing in the
  report.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gbe = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'));
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));

// 'steam_settings' is the marker every Goldberg/GSE build carries and no Valve steam_api dll has.
const AW_BUILD = 'gbe fork steam_settings build';
const FOREIGN_EMULATOR = 'some other emu steam_settings build';
const VALVE_ORIGINAL = 'valve original steam api';

const SCHEMA = { achievement: { total: 1, list: [{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: 0 }] } };

function tmpdir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// The cache a download leaves behind: a tag in latest.txt and the build under it.
function cacheWith(prefix, content = AW_BUILD) {
  const cacheDir = tmpdir(prefix);
  write(path.join(cacheDir, 'latest.txt'), 'release-1.2.3');
  write(path.join(cacheDir, 'release-1.2.3', 'steam_api64.dll'), content);
  return cacheDir;
}

function writeSettings(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'achievements.json'),
    JSON.stringify([{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: '0', icon: '', icongray: '' }])
  );
  fs.writeFileSync(path.join(dir, 'steam_appid.txt'), '3751260');
  fs.writeFileSync(path.join(dir, 'configs.app.ini'), '[app::dlcs]\nunlock_all=1\n');
  fs.writeFileSync(path.join(dir, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\ngc_token=1\n');
  fs.writeFileSync(path.join(dir, 'configs.user.ini'), '[user::general]\naccount_name=Player\nlanguage=english\n');
  return dir;
}

test('the report names the build in the folder, not just the count of files', () => {
  const cacheDir = cacheWith('aw-dll-id-cache-');
  const ours = tmpdir('aw-dll-id-ours-');
  const theirs = tmpdir('aw-dll-id-theirs-');
  write(path.join(ours, 'steam_api64.dll'), AW_BUILD);
  writeSettings(path.join(ours, 'steam_settings'));
  write(path.join(theirs, 'steam_api64.dll'), FOREIGN_EMULATOR);

  const [installed, shipped] = gbe.describeRuntimeDlls({ dllDirs: [ours, theirs], cacheDir });

  assert.equal(installed.dir, ours);
  assert.equal(installed.emulator, true);
  assert.equal(installed.awBuild, true, 'the supported build AW Next installed');
  assert.equal(installed.settings, true);
  assert.equal(installed.interfaces, false);
  assert.ok(installed.size > 0);

  assert.equal(shipped.emulator, true);
  assert.equal(shipped.awBuild, false, 'an emulator that is not ours reads identically without this');
  assert.equal(shipped.settings, false);
});

test('a backup says whether the original is still recoverable', () => {
  const cacheDir = cacheWith('aw-dll-bak-cache-');
  const original = tmpdir('aw-dll-bak-original-');
  const overwritten = tmpdir('aw-dll-bak-overwritten-');
  write(path.join(original, 'steam_api64.dll'), AW_BUILD);
  write(path.join(original, 'steam_api64.dll.bak'), VALVE_ORIGINAL);
  write(path.join(overwritten, 'steam_api64.dll'), AW_BUILD);
  // What a repack leaves: the .bak holds the release's own emulator, not Valve's dll.
  write(path.join(overwritten, 'steam_api64.dll.bak'), FOREIGN_EMULATOR);

  const [kept, lost] = gbe.describeRuntimeDlls({ dllDirs: [original, overwritten], cacheDir });
  assert.equal(kept.backup, true);
  assert.equal(kept.backupOriginal, true);
  assert.equal(lost.backup, true);
  assert.equal(lost.backupOriginal, false, 'a backed-up emulator is not an original');
});

test('a folder with no steam_api dll contributes nothing, and the same folder twice is listed once', () => {
  const cacheDir = cacheWith('aw-dll-empty-cache-');
  const dir = tmpdir('aw-dll-empty-');
  assert.deepEqual(gbe.describeRuntimeDlls({ dllDirs: [dir, null, ''], cacheDir }), []);

  write(path.join(dir, 'steam_api64.dll'), AW_BUILD);
  assert.equal(gbe.describeRuntimeDlls({ dllDirs: [dir, dir], cacheDir }).length, 1);
});

test('the original a steam_interfaces.txt could be generated from is found, or honestly absent', () => {
  const recoverable = tmpdir('aw-iface-recoverable-');
  write(path.join(recoverable, 'steam_api64.dll'), AW_BUILD);
  write(path.join(recoverable, 'steam_api64.dll.bak'), VALVE_ORIGINAL);
  assert.equal(goldberg.originalSteamApiDll([recoverable]), path.join(recoverable, 'steam_api64.dll.bak'));

  const gone = tmpdir('aw-iface-gone-');
  write(path.join(gone, 'steam_api64.dll'), AW_BUILD);
  write(path.join(gone, 'steam_api64.dll.bak'), FOREIGN_EMULATOR);
  assert.equal(goldberg.originalSteamApiDll([gone]), '');
});

test('a missing steam_interfaces.txt is reported, and says whether a repair could supply it', () => {
  const gameDir = tmpdir('aw-iface-diagnose-');
  const settings = writeSettings(path.join(gameDir, 'steam_settings'));
  write(path.join(gameDir, 'steam_api64.dll'), AW_BUILD);
  write(path.join(gameDir, 'steam_api64.dll.bak'), VALVE_ORIGINAL);

  const withOriginal = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  const recoverable = withOriginal.issues.find((issue) => issue.code === 'NO_STEAM_INTERFACES');
  assert.ok(recoverable, 'the file is missing and can still be made');
  assert.equal(recoverable.level, 'info', 'most titles work without it, so this never repaints a game');
  assert.equal(recoverable.data.source, path.join(gameDir, 'steam_api64.dll.bak'));

  // A repack that shipped its emulator over the original and kept no copy of it anywhere.
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll.bak'), FOREIGN_EMULATOR);
  const unrecoverable = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  assert.ok(unrecoverable.issues.some((issue) => issue.code === 'NO_STEAM_INTERFACES_UNRECOVERABLE'));
  assert.ok(!unrecoverable.issues.some((issue) => issue.code === 'NO_STEAM_INTERFACES'));

  // And once it is there, neither is raised.
  fs.writeFileSync(path.join(settings, 'steam_interfaces.txt'), 'SteamUserStats012\n');
  const complete = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  assert.ok(!complete.issues.some((issue) => String(issue.code).startsWith('NO_STEAM_INTERFACES')));
});

/*
  The Blood of Dawnwalker, from the reporter's own listing: a RUNE release whose Steamworks folder
  holds the crack's runtime as steam_api64.dll (1,118,360 bytes) and the Valve dll it replaced as
  steam_api64.rne (295,336 bytes, byte-identical to the release's "_original files" copy), with no
  ini beside them. AW Next read that folder as unclaimed, wrote a GBE steam_settings next to a dll
  that never opens one, and seeded a save nothing ever wrote to again.
*/
function runeUnrealBuild(prefix) {
  const root = path.join(tmpdir(prefix), 'The.Blood.of.Dawnwalker-InsaneRamZes');
  const steamworks = path.join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv157', 'Win64');
  write(path.join(steamworks, 'steam_api64.dll'), 'scene runtime without a settings folder');
  write(path.join(steamworks, 'steam_api64.rne'), VALVE_ORIGINAL);
  const exe = write(path.join(root, 'Dawnwalker', 'Binaries', 'Win64', 'Dawnwalker.exe'), 'game');
  fs.mkdirSync(path.join(root, 'Dawnwalker', 'Content'), { recursive: true });
  return { root, steamworks, exeDir: path.dirname(exe) };
}

test('a RUNE .rne beside the engine dll names the crack, from the build root and from the exe folder', () => {
  const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
  const build = runeUnrealBuild('aw-rune-rne-detect-');

  for (const anchor of [build.root, build.exeDir]) {
    const loader = crackLoaderDetect.detectWorkingCrackLoader(anchor);
    assert.ok(loader, `the crack must be seen from ${anchor}`);
    assert.equal(loader.name, 'CODEX / RUNE / scene emulator');
    assert.equal(loader.replaceable, true, 'its runtime is the steam_api dll, so the swap is a complete change');
    assert.equal(loader.dir, build.steamworks);
  }
});

test("the Valve dll RUNE preserved is the interface source, not the crack's runtime in its place", () => {
  const build = runeUnrealBuild('aw-rune-rne-source-');
  const dll = path.join(build.steamworks, 'steam_api64.dll');
  const rne = path.join(build.steamworks, 'steam_api64.rne');

  // The runtime carries no emulator marker, so without the .rne it would have been read as original.
  assert.equal(gbe.interfaceSourceFor(dll).file, rne);
  assert.equal(goldberg.originalSteamApiDll([build.steamworks]), rne);
  assert.equal(gbe.archOfSteamApiFile(rne), 'x64', 'a .rne is still the 64-bit dll');
  assert.equal(gbe.archOfSteamApiFile(path.join(build.steamworks, 'steam_api.rne.bak')), 'x86');

  // Setting the crack aside renames its markers to .bak, and the original must survive that.
  fs.renameSync(rne, `${rne}.bak`);
  assert.equal(gbe.interfaceSourceFor(dll).file, `${rne}.bak`);
  assert.equal(goldberg.originalSteamApiDll([build.steamworks]), `${rne}.bak`);

  // And the GBE install that follows backs RUNE's runtime up as steam_api64.dll.bak. That file has no
  // GBE marker either, and ranking it first sent the generator to the crack (found end to end).
  fs.renameSync(dll, `${dll}.bak`);
  write(dll, AW_BUILD);
  assert.equal(gbe.interfaceSourceFor(dll).file, `${rne}.bak`);
  assert.equal(goldberg.originalSteamApiDll([build.steamworks]), `${rne}.bak`);

  // The technical dump must not call that backup an original either.
  const [described] = gbe.describeRuntimeDlls({ dllDirs: [build.steamworks], cacheDir: cacheWith('aw-rune-rne-dump-') });
  assert.equal(described.backup, true);
  assert.equal(described.backupOriginal, false);
  assert.equal(described.preservedOriginal, 'steam_api64.rne.bak');
});

test('a .rne that is itself an emulator is never taken for the original', () => {
  const dir = tmpdir('aw-rune-rne-fake-');
  write(path.join(dir, 'steam_api64.dll'), AW_BUILD);
  write(path.join(dir, 'steam_api64.rne'), FOREIGN_EMULATOR);
  assert.deepEqual(gbe.interfaceSourceFor(path.join(dir, 'steam_api64.dll')), { file: '', reason: 'emulator-dll' });
  assert.deepEqual(gbe.preservedOriginalsFor('steam_api64.bin'), [], 'only a .dll has a preserved twin');
});
