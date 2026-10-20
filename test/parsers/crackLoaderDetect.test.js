'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));

// Soft-assert harness, mirrors crackFix.test.js.
let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else failures.push(msg);
}
function eq(actual, expected, msg) {
  ok(actual === expected, `${msg} - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const tmpDirs = [];
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

{
  const dir = tmp('aw-crackloader-none-');
  fs.writeFileSync(path.join(dir, 'game.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'stub');
  eq(crackLoaderDetect.detectWorkingCrackLoader(dir), null, 'a plain (uncracked / already-Goldberg) folder has no known loader');
  eq(crackLoaderDetect.hasWorkingCrackLoader(dir), false, 'hasWorkingCrackLoader mirrors detectWorkingCrackLoader');
}

{
  const dir = tmp('aw-crackloader-onlinefix64-');
  fs.writeFileSync(path.join(dir, 'game.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'OnlineFix64.dll'), 'stub');
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'OnlineFix', 'OnlineFix64.dll in the game root is recognised as OnlineFix');
  eq(crackLoaderDetect.hasWorkingCrackLoader(dir), true, 'hasWorkingCrackLoader true for OnlineFix64.dll');
}

{
  const dir = tmp('aw-crackloader-onlinefixini-');
  fs.writeFileSync(path.join(dir, 'ONLINEFIX.INI'), 'stub');
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'OnlineFix', 'OnlineFix.ini is matched case-insensitively');
}

{
  const dir = tmp('aw-crackloader-onlinefix32-');
  fs.writeFileSync(path.join(dir, 'OnlineFix32.dll'), 'stub');
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'OnlineFix', 'OnlineFix32.dll (x86 build) is also recognised');
}

// Other installed emulator families are protected by the same automatic-write gate.
for (const [name, marker] of [
  ['TENOKE', 'tenoke.ini'],
  ['ALI213', 'ALI213.ini'],
  ['SmartSteamEmu', 'SmartSteamEmu.ini'],
  ['UniverseLAN', 'UniverseLAN.ini'],
  ['CODEX / RUNE / scene emulator', 'steam_emu.ini'],
]) {
  const dir = tmp(`aw-crackloader-${name.replace(/\W/g, '').toLowerCase()}-`);
  fs.writeFileSync(path.join(dir, marker), 'stub');
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === name, `${marker} is recognised as an existing ${name} setup`);
}

{
  const dir = tmp('aw-crackloader-nested-');
  fs.mkdirSync(path.join(dir, 'Game_Data', 'Plugins'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Game_Data', 'Plugins', 'OnlineFix64.dll'), 'stub');
  eq(crackLoaderDetect.detectWorkingCrackLoader(dir), null, 'a marker buried in a subfolder is not the loader\'s own drop point');
}

{
  eq(crackLoaderDetect.detectWorkingCrackLoader(path.join(os.tmpdir(), 'aw-crackloader-does-not-exist-xyz')), null, 'missing folder => null, no throw');
  eq(crackLoaderDetect.detectWorkingCrackLoader(null), null, 'null gameDir => null, no throw');
  eq(crackLoaderDetect.detectWorkingCrackLoader(''), null, 'empty gameDir => null, no throw');
  eq(crackLoaderDetect.detectWorkingCrackLoader(undefined), null, 'undefined gameDir => null, no throw');
}

{
  // The Jackbox Party Pack Collection: ColdClient launches the game, SteamConfig.ini is a leftover.
  const dir = tmp('aw-crackloader-coldclient-leftover-');
  fs.writeFileSync(path.join(dir, 'ColdClientLoader.ini'), '[SteamClient]\n');
  fs.writeFileSync(path.join(dir, 'SteamConfig.ini'), '[Settings]\n');
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'ColdClient', 'ColdClient wins over a leftover legacy marker');
}

{
  // GBE installed over a legacy crack: the old ini stays, but the dll it belonged to is gone.
  const dir = tmp('aw-crackloader-gbe-over-legacy-');
  fs.writeFileSync(path.join(dir, 'SteamConfig.ini'), '[Settings]\n');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), Buffer.concat([Buffer.alloc(32, 1), Buffer.from('steam_settings')]));
  eq(crackLoaderDetect.detectWorkingCrackLoader(dir), null, 'a leftover legacy ini beside a GBE dll is not a working loader');

  // The same ini beside the crack's own dll still is.
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), Buffer.alloc(64, 2));
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'Hoodlum / legacy emulator', 'the legacy loader is still recognised with its own dll');

  // A loader that is not the dll keeps its claim whatever the dll is.
  const side = tmp('aw-crackloader-onlinefix-gbe-');
  fs.writeFileSync(path.join(side, 'OnlineFix64.dll'), 'stub');
  fs.writeFileSync(path.join(side, 'steam_api64.dll'), Buffer.from('steam_settings'));
  const of = crackLoaderDetect.detectWorkingCrackLoader(side);
  ok(of && of.name === 'OnlineFix', 'OnlineFix is not dismissed by a GBE dll');
}

{
  // Achievement Enabler's layout: Valve's dll at the root, ColdClient in a folder of its own.
  const setupColdClient = (dir, folder, { steamclient = true } = {}) => {
    const loaderDir = path.join(dir, ...folder);
    fs.mkdirSync(path.join(loaderDir, 'steam_settings'), { recursive: true });
    fs.writeFileSync(path.join(loaderDir, 'ColdClientLoader.ini'), '[SteamClient]\n');
    if (steamclient) fs.writeFileSync(path.join(loaderDir, 'steamclient64.dll'), 'stub');
    return loaderDir;
  };
  const dir = tmp('aw-crackloader-coldclient-sub-');
  fs.writeFileSync(path.join(dir, 'game.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), Buffer.alloc(64, 2));
  const loaderDir = setupColdClient(dir, ['_ColdClient']);
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'ColdClient', 'a ColdClient folder one level down is recognised');
  eq(hit && hit.dir, loaderDir, 'the loader dir is the ColdClient folder, not the game root');
  eq(hit && hit.replaceable, false, 'a subfolder ColdClient is never replaceable');

  const named = tmp('aw-crackloader-coldclient-anyname-');
  setupColdClient(named, ['loader']);
  ok((crackLoaderDetect.detectWorkingCrackLoader(named) || {}).name === 'ColdClient', 'the folder name does not matter');

  const iniOnly = tmp('aw-crackloader-coldclient-inionly-');
  setupColdClient(iniOnly, ['_ColdClient'], { steamclient: false });
  eq(crackLoaderDetect.detectWorkingCrackLoader(iniOnly), null, 'an ini with no steamclient dll beside it is not a loader');

  const deep = tmp('aw-crackloader-coldclient-deep-');
  setupColdClient(deep, ['tools', '_ColdClient']);
  eq(crackLoaderDetect.detectWorkingCrackLoader(deep), null, 'a ColdClient folder two levels down is not looked for');

  const stale = tmp('aw-crackloader-coldclient-stale-');
  fs.writeFileSync(path.join(stale, 'steam_api64.dll'), Buffer.from('steam_settings'));
  setupColdClient(stale, ['_ColdClient']);
  eq(crackLoaderDetect.detectWorkingCrackLoader(stale), null, 'a GBE dll at the root outranks a leftover ColdClient folder');

  // The Jackbox Party Pack Collection: pack 2 runs ColdClient from its own root, the collection does not.
  const collection = tmp('aw-crackloader-coldclient-collection-');
  const pack = setupColdClient(collection, ['2']);
  fs.writeFileSync(path.join(pack, 'steam_api64.dll'), Buffer.alloc(64, 2));
  eq(crackLoaderDetect.detectWorkingCrackLoader(collection), null, 'a pack with its own steam_api dll is another game, not the collection\'s loader');
  ok((crackLoaderDetect.detectWorkingCrackLoader(pack) || {}).name === 'ColdClient', 'the pack itself is still ColdClient');

  eq(crackLoaderDetect.detectWorkingCrackLoader(dir, { subfolders: false }), null, 'subfolders: false skips the ColdClient folder lookup');

  const upper = tmp('aw-crackloader-coldclient-upper-');
  fs.mkdirSync(path.join(upper, 'CC'));
  fs.writeFileSync(path.join(upper, 'CC', 'COLDCLIENTLOADER.INI'), '[SteamClient]\n');
  fs.writeFileSync(path.join(upper, 'CC', 'SteamClient.dll'), 'stub');
  ok((crackLoaderDetect.detectWorkingCrackLoader(upper) || {}).name === 'ColdClient', 'names are matched case-insensitively, and the 32-bit steamclient.dll counts');

  const coldApi = tmp('aw-crackloader-coldapi-sub-');
  fs.mkdirSync(path.join(coldApi, 'bin'));
  fs.writeFileSync(path.join(coldApi, 'bin', 'ColdAPI.ini'), '[ColdAPI]\n');
  fs.writeFileSync(path.join(coldApi, 'bin', 'steamclient64.dll'), 'stub');
  eq(crackLoaderDetect.detectWorkingCrackLoader(coldApi), null, 'ColdAPI replaces steam_api, so it is not looked for in a subfolder');

  const fileNamed = tmp('aw-crackloader-coldclient-file-');
  fs.writeFileSync(path.join(fileNamed, '_ColdClient'), 'not a folder');
  eq(crackLoaderDetect.detectWorkingCrackLoader(fileNamed), null, 'a file named like the folder is skipped without throwing');

  const atRoot = tmp('aw-crackloader-coldclient-root-');
  fs.writeFileSync(path.join(atRoot, 'ColdClientLoader.ini'), '[SteamClient]\n');
  setupColdClient(atRoot, ['_ColdClient']);
  eq((crackLoaderDetect.detectWorkingCrackLoader(atRoot) || {}).dir, atRoot, 'a ColdClient at the root is still found there first');

  if (process.platform === 'win32') {
    const linked = tmp('aw-crackloader-coldclient-junction-');
    const target = setupColdClient(tmp('aw-crackloader-coldclient-target-'), ['loader']);
    fs.symlinkSync(target, path.join(linked, '_ColdClient'), 'junction');
    ok((crackLoaderDetect.detectWorkingCrackLoader(linked) || {}).name === 'ColdClient', 'a junction to the ColdClient folder is followed');
  }

  const otherFamily = tmp('aw-crackloader-sub-onlinefix-');
  fs.mkdirSync(path.join(otherFamily, 'bin'));
  fs.writeFileSync(path.join(otherFamily, 'bin', 'OnlineFix64.dll'), 'stub');
  fs.writeFileSync(path.join(otherFamily, 'bin', 'steamclient64.dll'), 'stub');
  eq(crackLoaderDetect.detectWorkingCrackLoader(otherFamily), null, 'only ColdClient is looked for in a subfolder');

  // A packaged Unreal build loads its dll from Engine/Binaries/ThirdParty/Steamworks, not the root.
  const unrealBuild = (prefix, engineDll) => {
    const root = tmp(prefix);
    const steamworks = path.join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv162', 'Win64');
    fs.mkdirSync(steamworks, { recursive: true });
    fs.writeFileSync(path.join(steamworks, 'steam_api64.dll'), engineDll);
    fs.mkdirSync(path.join(root, 'Game', 'Binaries', 'Win64'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Game', 'Content'));
    fs.writeFileSync(path.join(root, 'Game', 'Binaries', 'Win64', 'Game.exe'), 'game');
    setupColdClient(root, ['_ColdClient']);
    return { root, steamworks };
  };
  const ueValve = unrealBuild('aw-crackloader-ue-coldclient-', Buffer.alloc(64, 2));
  ok((crackLoaderDetect.detectWorkingCrackLoader(ueValve.root) || {}).name === 'ColdClient', 'an Unreal game keeping Valve\'s engine dll is still ColdClient');
  const ueGbe = unrealBuild('aw-crackloader-ue-gbe-', Buffer.from('steam_settings'));
  eq(crackLoaderDetect.detectWorkingCrackLoader(ueGbe.root), null, 'a GBE dll in the engine folder outranks a leftover ColdClient folder');
  const ueScene = unrealBuild('aw-crackloader-ue-scene-', Buffer.alloc(64, 2));
  fs.writeFileSync(path.join(ueScene.steamworks, 'steam_emu.ini'), '[Settings]\n');
  ok((crackLoaderDetect.detectWorkingCrackLoader(ueScene.root) || {}).name === 'CODEX / RUNE / scene emulator', 'a scene loader beside the engine dll wins over a ColdClient folder');

  // The tree walk of the emulator fix still finds Achievement Enabler's folder on its own.
  const { findExistingFix } = require(path.join(__dirname, '..', '..', 'app', 'util', 'emulatorFixEligibility.js'));
  const fix = findExistingFix(dir);
  ok(fix && fix.kind === 'loader' && fix.name === 'ColdClient' && fix.path === loaderDir, 'findExistingFix reports the ColdClient folder');
}

// online-fix's Ubisoft builds (The Crew Motorfest) keep Valve's steam_api64.dll untouched, ship their
// own upc_r2 loader and keep Ubisoft's original as a .ofme file, with no OnlineFix.ini at all.
{
  const dir = tmp('aw-crackloader-ofme-ubisoft-');
  for (const name of ['TheCrewMotorfest.exe', 'steam_api64.dll', 'upc_r2_loader64.dll', 'upc_r2_loader64.ofme', 'version.dll']) {
    fs.writeFileSync(path.join(dir, name), 'stub');
  }
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && hit.name === 'OnlineFix' && hit.replaceable === false, 'an online-fix Ubisoft build is recognised as OnlineFix and never replaceable');
  eq(crackLoaderDetect.servesOnlinePlay(dir), true, 'an online-fix Ubisoft build serves online play');
  eq(crackLoaderDetect.leavesStatsToSteam(hit), false, 'without OnlineFix.ini it does not hand its stats to the Steam client');
}

{
  // Any original online-fix set aside counts, whatever the game or the file it replaced.
  const dir = tmp('aw-crackloader-ofme-any-');
  fs.writeFileSync(path.join(dir, 'Game.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.OFME'), 'stub');
  ok((crackLoaderDetect.detectWorkingCrackLoader(dir) || {}).name === 'OnlineFix', 'any .ofme file marks an online-fix folder, case-insensitively');
}

{
  const dir = tmp('aw-crackloader-online-play-');
  fs.writeFileSync(path.join(dir, 'OnlineFix64.dll'), 'stub');
  eq(crackLoaderDetect.servesOnlinePlay(dir), true, 'a Steam online-fix build serves online play');
  const scene = tmp('aw-crackloader-offline-play-');
  fs.writeFileSync(path.join(scene, 'steam_emu.ini'), '[Settings]\n');
  eq(crackLoaderDetect.servesOnlinePlay(scene), false, 'a scene crack does not');
  eq(crackLoaderDetect.servesOnlinePlay(null), false, 'no folder serves nothing');
}

for (const d of tmpDirs) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} assertion(s) failed (of ${passed + failures.length}):`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`PASS: crackLoaderDetect - ${passed} assertions`);
