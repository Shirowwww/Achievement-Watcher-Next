'use strict';

// A release that keeps Valve's steam_api dll and loads a renamed GBE runtime through a proxy dll of
// its own (VOICES38: dstorage.dll -> steam_api64.v38) is a working GBE setup, not "another crack".

const path = require('path');
const fs = require('fs');
const os = require('os');
const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const gameHealth = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));
const emulatorFixEligibility = require(path.join(__dirname, '..', '..', 'app', 'util', 'emulatorFixEligibility.js'));
const gbeInstaller = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'));

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

const VALVE_DLL = Buffer.from('MZ valve steam api, no emulator marker');
const GBE_DLL = Buffer.from('MZ gbe build ... steam_settings ... GSE Saves');

function voicesRelease({ proxyNamesRuntime = true, runtimeIsGbe = true, runtimeName = 'steam_api64.v38' } = {}) {
  const dir = tmp('aw-proxy-runtime-');
  fs.writeFileSync(path.join(dir, 'PRAGMATA.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), VALVE_DLL);
  fs.writeFileSync(path.join(dir, runtimeName), runtimeIsGbe ? GBE_DLL : VALVE_DLL);
  fs.writeFileSync(path.join(dir, 'dstorage.v38'), 'real dstorage');
  fs.writeFileSync(path.join(dir, 'voices38.v38'), 'payload');
  fs.writeFileSync(path.join(dir, 'dstorage.dll'), Buffer.from(`MZ proxy \\dstorage.v38 ${proxyNamesRuntime ? runtimeName : 'nothing'} voices38.v38`));
  const settings = path.join(dir, 'steam_settings');
  fs.mkdirSync(settings);
  fs.writeFileSync(path.join(settings, 'steam_appid.txt'), '3357650');
  fs.writeFileSync(path.join(settings, 'configs.user.ini'), '[user::general]\naccount_name=voices38\nlanguage=english\n');
  fs.writeFileSync(
    path.join(settings, 'achievements.json'),
    JSON.stringify([{ name: 'ACH_1', displayName: 'One', description: 'd', hidden: '0', icon: 'a.jpg', icongray: 'b.jpg' }])
  );
  return dir;
}

function codesOf(report) {
  return (report.issues || []).map((issue) => issue.code);
}

{
  const dir = voicesRelease();
  const hit = crackLoaderDetect.proxyLoadedRuntime(dir);
  ok(hit && path.basename(hit.runtime) === 'steam_api64.v38', 'the renamed GBE runtime is found');
  ok(hit && path.basename(hit.loadedBy) === 'dstorage.dll', 'the proxy that names it is reported as its loader');

  const report = goldberg.diagnose({ gameDir: dir, appid: '3357650', schema: null, savesRoots: [] });
  const codes = codesOf(report);
  ok(!codes.includes('RUNTIME_DLL_NOT_EMULATOR'), 'a proxy-loaded GBE runtime is not "another crack"');
  eq(report.foreignRuntimeDirs.length, 0, 'no folder is reported as served by a foreign runtime');
  ok(Array.isArray(report.proxiedRuntimes) && report.proxiedRuntimes.length === 1, 'the report names the proxied runtime');
  ok(!codes.includes('NO_STEAM_INTERFACES'), 'steam_interfaces.txt is not offered through a runtime reinstall');
  ok(codes.includes('NO_STEAM_INTERFACES_PROXIED'), 'the missing interfaces list is explained for a proxied runtime');

  const health = gameHealth.deriveHealth({
    gameDir: dir,
    gameDirExists: true,
    emulated: true,
    goldberg: { ...report, dllCount: 1 },
    achievements: { total: 1, unlocked: 0 },
  });
  ok(!health.actions.includes(gameHealth.ACTION.INSTALL_RUNTIME), 'Game Health never offers to replace Valve\'s dll here');
  ok(!health.actions.includes(gameHealth.ACTION.SWITCH_RUNTIME), 'nor to switch the runtime');
  ok(health.reason !== 'emulator-runtime-foreign', `the foreign-runtime sentence is gone (got ${health.reason})`);

  const existing = emulatorFixEligibility.findExistingFix(dir);
  eq(existing && existing.kind, 'proxied-runtime', 'the existing setup is named as the release\'s own runtime, so no dll swap is offered');
  eq(emulatorFixEligibility.inspect({ gameDir: dir }).eligible, false, 'the automatic fix leaves the release alone');
}

{
  const dir = voicesRelease({ proxyNamesRuntime: false });
  eq(crackLoaderDetect.proxyLoadedRuntime(dir), null, 'a GBE file nothing loads is not a runtime');
  const report = goldberg.diagnose({ gameDir: dir, appid: '3357650', schema: null, savesRoots: [] });
  ok(codesOf(report).includes('RUNTIME_DLL_NOT_EMULATOR'), 'an orphan renamed GBE copy still leaves the folder foreign');
}

{
  const dir = voicesRelease({ runtimeIsGbe: false, runtimeName: 'steam_api64.rne' });
  eq(crackLoaderDetect.proxyLoadedRuntime(dir), null, 'a renamed Valve original is never taken for a runtime, even when named');
}

// ARTIFACT's Phantom Blade Zero (#153): GBE's steamclient build beside Valve's steam_api64.dll,
// pointed at by a loader whose name AW Next does not know. The GBE marker is the only evidence used.
function steamclientRelease({ clientIsGbe = true } = {}) {
  const dir = tmp('aw-proxy-steamclient-');
  fs.writeFileSync(path.join(dir, 'PBZ.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), VALVE_DLL);
  fs.writeFileSync(path.join(dir, 'steamclient64.dll'), clientIsGbe ? GBE_DLL : VALVE_DLL);
  fs.writeFileSync(path.join(dir, 'some_new_loader.dll'), 'MZ loader');
  const settings = path.join(dir, 'steam_settings');
  fs.mkdirSync(settings);
  fs.writeFileSync(path.join(settings, 'steam_appid.txt'), '4115450');
  fs.writeFileSync(path.join(settings, 'configs.user.ini'), '[user::general]\naccount_name=Artifact\naccount_steamid=76561197960287930\nlanguage=english\n');
  return dir;
}

{
  const dir = steamclientRelease();
  const hit = crackLoaderDetect.proxyLoadedRuntime(dir);
  eq(hit && path.basename(hit.runtime), 'steamclient64.dll', 'a GBE steamclient beside Valve\'s dll is the runtime, whatever loads it');

  const report = goldberg.diagnose({ gameDir: dir, appid: '4115450', schema: null, savesRoots: [] });
  const codes = codesOf(report);
  ok(!codes.includes('RUNTIME_DLL_NOT_EMULATOR'), 'Valve\'s dll there is not "another runtime"');
  ok(codes.includes('NO_ACHIEVEMENTS_JSON'), 'the missing achievement list is what the report asks for');

  const health = gameHealth.deriveHealth({
    gameDir: dir,
    gameDirExists: true,
    emulated: true,
    goldberg: { ...report, dllCount: 1 },
    achievements: { total: 66, unlocked: 0 },
  });
  ok(health.actions.includes(gameHealth.ACTION.REPAIR_DATA), 'Game Health offers to write the achievement list');
  ok(!health.actions.includes(gameHealth.ACTION.INSTALL_RUNTIME), 'and never to replace Valve\'s dll');

  const cached = tmp('aw-proxy-steamclient-cache-');
  fs.writeFileSync(path.join(cached, 'steam_api64.dll'), GBE_DLL);
  const summary = gbeInstaller.installDlls({ dllDirs: [dir], dlls: { x64: path.join(cached, 'steam_api64.dll') } });
  eq(summary.installed, 0, 'any fix that reaches the installer leaves that folder\'s dll alone');
  ok(fs.readFileSync(path.join(dir, 'steam_api64.dll')).equals(VALVE_DLL), 'Valve\'s dll is still the one on disk');

  // The release keeps Valve's dll on purpose, so the engine's own copy of it stays too.
  const engine = tmp('aw-proxy-steamclient-engine-');
  fs.writeFileSync(path.join(engine, 'steam_api64.dll'), VALVE_DLL);
  const both = gbeInstaller.installDlls({ dllDirs: [engine, dir], dlls: { x64: path.join(cached, 'steam_api64.dll') } });
  eq(both.installed, 0, 'no Valve dll of that game is replaced, in any of its folders');

  goldberg.writeUserConfig({ steamSettings: path.join(dir, 'steam_settings'), accountName: 'Shirow', accountSteamId: '76561198000000001' });
  const user = fs.readFileSync(path.join(dir, 'steam_settings', 'configs.user.ini'), 'utf8');
  ok(user.includes('account_steamid=76561197960287930'), 'the release\'s account id, which its Denuvo token is bound to, is kept');
  ok(user.includes('account_name=Shirow'), 'the display name is still the app\'s');
}

{
  // A release shipping both GBE files: its steam_api is already GBE, so updating it is still a fix.
  const dir = steamclientRelease();
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), GBE_DLL);
  const cached = tmp('aw-proxy-steamclient-cache-');
  fs.writeFileSync(path.join(cached, 'steam_api64.dll'), Buffer.from('MZ newer gbe ... steam_settings'));
  const summary = gbeInstaller.installDlls({ dllDirs: [dir], dlls: { x64: path.join(cached, 'steam_api64.dll') } });
  eq(summary.installed, 1, 'a GBE steam_api beside a GBE steamclient is updated as usual');
}

{
  const dir = steamclientRelease({ clientIsGbe: false });
  eq(crackLoaderDetect.proxyLoadedRuntime(dir), null, 'Valve\'s own steamclient beside its steam_api is no emulator');
}

{
  const dir = tmp('aw-proxy-runtime-plain-');
  fs.writeFileSync(path.join(dir, 'game.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), VALVE_DLL);
  eq(crackLoaderDetect.proxyLoadedRuntime(dir), null, 'an ordinary folder has no proxied runtime');
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
console.log(`PASS: proxyLoadedRuntime - ${passed} assertions`);
