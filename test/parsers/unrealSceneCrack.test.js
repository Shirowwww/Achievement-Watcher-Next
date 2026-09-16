'use strict';

/*
  A packaged Unreal build keeps its whole Steam identity in Engine/Binaries/ThirdParty/Steamworks,
  seven levels below the game folder: the dll the engine loads, the steam_appid.txt that names the
  game, and - when a scene group cracked it - that crack's own ini. 3.10.6 taught AW Next where the
  dll is; the two files beside it were still invisible, with two consequences reported together for
  the Little Nightmares Enhanced Editions:

  - LN2, a GBE repack, was listed as an unidentified folder with no achievements at all, although
    its steam_appid.txt (860510) was right there beside the dll.
  - LN1, a RUNE release, had its steam_emu.ini missed by the top-level crack-loader check, so AW
    offered it a GBE setup; the steam_settings that repair wrote then made the RUNE dll count as an
    emulator dll, and the panel reported a complete 22/22 setup for a game recording nothing.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const unrealLayout = require(path.join(__dirname, '..', '..', 'app', 'util', 'unrealLayout.js'));
const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const emulatorFixEligibility = require(path.join(__dirname, '..', '..', 'app', 'util', 'emulatorFixEligibility.js'));

const SCHEMA = { achievement: { total: 1, list: [{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: 0 }] } };

// The one string every Goldberg/GSE build carries and no other steam_api dll does.
const GBE_DLL = 'gbe_fork build - reads steam_settings from its own folder';
const RUNE_DLL = 'scene steam api runtime, no settings folder of its own';

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function settings(dir, { appid = '2149010', achievements = SCHEMA.achievement.list } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  write(
    path.join(dir, 'achievements.json'),
    JSON.stringify(achievements.map((a) => ({ name: a.name, displayName: a.displayName, description: a.description, hidden: '0', icon: '', icongray: '' })))
  );
  write(path.join(dir, 'steam_appid.txt'), appid);
  write(path.join(dir, 'configs.app.ini'), '[app::dlcs]\nunlock_all=1\n');
  write(path.join(dir, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\ngc_token=1\n');
  write(path.join(dir, 'configs.user.ini'), '[user::general]\naccount_name=Player\nlanguage=english\n');
  return dir;
}

/*
  Little Nightmares' shape: a build root holding Engine/ and the launcher, the SDK folder holding
  whichever runtime the release shipped, and the identity files beside it rather than at the root.
*/
function build({ runtime = 'gbe', appidFile = true, loaderIni = '', library = false } = {}) {
  const root = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ue-scene-'))), 'Little Nightmares - Enhanced Edition');
  const steamworks = path.join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv151', 'Win64');
  write(path.join(steamworks, 'steam_api64.dll'), runtime === 'gbe' ? GBE_DLL : RUNE_DLL);
  if (appidFile) write(path.join(steamworks, 'steam_appid.txt'), '2149010');
  if (loaderIni) write(path.join(steamworks, loaderIni), '[Settings]\nAppId=2149010\n');
  const exe = write(path.join(root, 'Little_Nightmares_Enhanced.exe'), 'game');
  fs.mkdirSync(path.join(root, 'LittleNightmares', 'Content'), { recursive: true });
  return { root, steamworks, exe, library: library ? path.dirname(root) : '' };
}

test('the appid beside the engine dll identifies the install the library walk cannot reach', () => {
  const ue = build();

  assert.deepEqual(
    unrealLayout.steamworksFiles(ue.root, ['steam_appid.txt']),
    [path.join(ue.steamworks, 'steam_appid.txt')],
    'the identity file sits with the dll, not at the game root'
  );

  const [found] = goldberg.findCompatibleGames([path.dirname(ue.root)]);
  assert.ok(found, 'a packaged build whose every marker is under Engine/ must still be discovered');
  assert.equal(found.gameDir, ue.root, 'and anchored on the build root, not on an engine subfolder');
  assert.equal(found.appid, '2149010', 'listing it without its appid is what made it an "Unconfigured" folder');
});

/*
  The real RUNE release, as installed from the FitGirl repack: no steam_appid.txt anywhere, the
  original dll kept as steam_api64.rne, and the AppId stated only in steam_emu.ini beside the dll.
*/
test('a RUNE build is identified from its own ini and is not taken for a GBE setup', () => {
  const ue = build({ runtime: 'rune', appidFile: false, loaderIni: 'steam_emu.ini' });
  write(path.join(ue.steamworks, 'steam_api64.rne'), 'valve-original-x64');

  const [found] = goldberg.findCompatibleGames([path.dirname(ue.root)]);
  assert.equal(found.appid, '2149010');
  assert.equal(found.emulator, 'none', 'nothing here reads a steam_settings folder');
  assert.equal(goldberg.detectEmulator(ue.root).dll.length, 0, "RUNE's dll alone is not evidence of a Goldberg setup");
});

/*
  The real Little Nightmares II Enhanced Edition repack keeps steam_appid.txt inside the engine's
  steam_settings, not beside the dll. An earlier scan had also left a steam_settings at the build
  root, named after a name-matched stranger (The Witcher: Enhanced Edition); that folder is read by
  nothing and must not be taken for the game's setup.
*/
test('a GBE repack with its appid inside steam_settings is identified, and a stray root folder ignored', () => {
  const ue = build({ runtime: 'gbe', appidFile: false });
  write(path.join(ue.steamworks, 'steam_settings', 'steam_appid.txt'), '860510');
  write(path.join(ue.steamworks, 'steam_settings', 'configs.user.ini'), '[user::saves]\nlocal_save_path=./path/relative/to/dll\n');
  write(path.join(ue.root, 'steam_settings', 'configs.app.ini'), '[app::dlcs]\nunlock_all=1\n1229370=The Witcher: Enhanced Edition Soundtrack\n');

  const [found] = goldberg.findCompatibleGames([path.dirname(ue.root)]);
  assert.equal(found.appid, '860510');
  assert.equal(found.steamSettings, path.join(ue.steamworks, 'steam_settings'), 'the root folder is one the engine never opens');
});

test('a build with no identity file at all is still not claimed under a made-up appid', () => {
  const ue = build({ appidFile: false });
  const [found] = goldberg.findCompatibleGames([path.dirname(ue.root)]);
  assert.equal(found, undefined, 'nothing here names a game, so nothing may be reported as one');
});

test("a scene crack's ini beside the engine dll is found, and says the runtime can be replaced", () => {
  const ue = build({ runtime: 'rune', loaderIni: 'steam_emu.ini' });

  const loader = crackLoaderDetect.detectWorkingCrackLoader(ue.root);
  assert.ok(loader, 'a top-level-only check never sees a marker seven levels down');
  assert.match(loader.name, /RUNE/);
  assert.equal(loader.replaceable, true, 'this family IS the steam_api dll, so swapping that one file is the whole change');
  assert.equal(loader.dir, ue.steamworks);

  // ...and the fix gate has to refuse it, or the scan offers a GBE setup over a working crack.
  const gate = emulatorFixEligibility.inspect({ gameDir: ue.root, source: 'Rune' });
  assert.equal(gate.eligible, false);
});

test('a loader that emulates from a side channel is named but never offered a runtime swap', () => {
  const ue = build({ runtime: 'rune' });
  write(path.join(ue.root, 'OnlineFix64.dll'), 'proxy');

  const loader = crackLoaderDetect.detectWorkingCrackLoader(ue.root);
  assert.equal(loader.name, 'OnlineFix');
  assert.equal(loader.replaceable, false, 'replacing steam_api leaves half of an OnlineFix setup behind');
});

test('a steam_settings beside a dll that reads no settings is reported, not counted as a setup', () => {
  const ue = build({ runtime: 'rune', loaderIni: 'steam_emu.ini' });
  settings(path.join(ue.steamworks, 'steam_settings'));

  const report = goldberg.diagnose({ gameDir: ue.root, appid: '2149010', schema: SCHEMA });
  const codes = report.issues.map((issue) => issue.code);
  assert.ok(codes.includes('RUNTIME_DLL_NOT_EMULATOR'), 'a complete schema no dll will ever open is the false green this fixes');
  assert.equal(report.issues.find((issue) => issue.code === 'RUNTIME_DLL_NOT_EMULATOR').level, 'error');
  assert.deepEqual(report.foreignRuntimeDirs, [ue.steamworks]);
  assert.equal(report.achievements.found, 1, 'the schema itself is genuinely complete - that was never the problem');
});

test('the same setup over a real GBE runtime raises nothing', () => {
  const ue = build({ runtime: 'gbe' });
  settings(path.join(ue.steamworks, 'steam_settings'));

  const report = goldberg.diagnose({ gameDir: ue.root, appid: '2149010', schema: SCHEMA });
  assert.deepEqual(report.foreignRuntimeDirs, []);
  assert.ok(!report.issues.some((issue) => issue.code === 'RUNTIME_DLL_NOT_EMULATOR'));
});

test("a replaceable loader's configuration is set aside by renaming, never by deleting", () => {
  const ue = build({ runtime: 'rune', loaderIni: 'steam_emu.ini' });
  const ini = path.join(ue.steamworks, 'steam_emu.ini');

  const moved = crackLoaderDetect.disableLoaderMarkers([ue.root, ue.steamworks]);
  assert.deepEqual(moved, [`${ini}.bak`]);
  assert.equal(fs.existsSync(ini), false, 'while it is there the folder keeps reading as crack-served');
  assert.equal(fs.existsSync(`${ini}.bak`), true, 'and the swap has to stay undoable by hand');
  assert.equal(crackLoaderDetect.detectWorkingCrackLoader(ue.root), null);
});

test('a loader that cannot be replaced keeps every file it has', () => {
  const ue = build({ runtime: 'rune' });
  const ini = write(path.join(ue.root, 'OnlineFix.ini'), '[OnlineFix]\n');

  assert.deepEqual(crackLoaderDetect.disableLoaderMarkers([ue.root]), []);
  assert.equal(fs.existsSync(ini), true);
});
