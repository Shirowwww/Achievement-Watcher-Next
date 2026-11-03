'use strict';

// Denuvo releases of Unity and Unreal games (#167): GBE's steamclient64.dll and the version.dll or
// winmm.dll that loads it sit beside the game exe with steam_settings, while Valve's steam_api64.dll
// stays untouched in the engine's own folder. That setup works, and nothing may be moved or replaced.

const path = require('path');
const fs = require('fs');
const os = require('os');
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
const VALVE_DLL = Buffer.from('MZ valve steam api, no emulator marker');
const GBE_DLL = Buffer.from('MZ gbe build ... steam_settings ... GSE Saves');
const APPID = '2801400';

function write(root, rel, content) {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function release(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-client-beside-exe-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(layout)) write(dir, rel, content);
  return dir;
}

function gbeSetup(prefix, loader = 'version.dll') {
  return {
    [`${prefix}steamclient64.dll`]: GBE_DLL,
    [`${prefix}${loader}`]: 'MZ loader',
    [`${prefix}steam_settings/steam_appid.txt`]: APPID,
    [`${prefix}steam_settings/configs.user.ini`]: '[user::general]\naccount_name=x\nlanguage=english\n',
    [`${prefix}steam_settings/achievements.json`]: JSON.stringify([
      { name: 'ACH_1', displayName: 'One', description: 'd', hidden: '0', icon: '', icongray: '' },
    ]),
  };
}

const unity = (loader) => ({ 'Game.exe': 'stub', 'Game_Data/Plugins/x86_64/steam_api64.dll': VALVE_DLL, ...gbeSetup('', loader) });
const UNREAL_ENGINE_DLL = 'Engine/Binaries/ThirdParty/Steamworks/Steamv157/Win64/steam_api64.dll';
const unreal = () => ({
  'Union.exe': 'stub',
  'Union/Binaries/Win64/Union-Win64-Shipping.exe': 'stub',
  [UNREAL_ENGINE_DLL]: VALVE_DLL,
  ...gbeSetup('Union/Binaries/Win64/'),
});

const LOCATION_CODES = ['SETTINGS_NOT_BESIDE_DLL', 'UNREAL_ENGINE_DLL_UNCONFIGURED', 'RUNTIME_DLL_NOT_EMULATOR'];

function check(label, dir, settingsRel) {
  const report = goldberg.diagnose({ gameDir: dir, appid: APPID, schema: null, savesRoots: [], shortcutExes: () => [] });
  const codes = report.issues.map((issue) => issue.code);
  eq(path.relative(dir, report.steamSettings || ''), settingsRel, `${label}: the steam_settings beside the GBE steamclient is the one read`);
  for (const code of LOCATION_CODES) ok(!codes.includes(code), `${label}: no ${code}, the emulator does read that folder (got ${codes.join(' ')})`);
  ok(report.proxiedRuntimes.some((r) => path.basename(r.runtime) === 'steamclient64.dll'), `${label}: the report names the steamclient runtime`);

  const health = gameHealth.deriveHealth({
    gameDir: dir,
    gameDirExists: true,
    emulated: true,
    goldberg: { ...report, dllCount: 1 },
    achievements: { total: 1, unlocked: 0 },
  });
  ok(!health.actions.includes(gameHealth.ACTION.INSTALL_RUNTIME), `${label}: Game Health never offers to replace Valve's dll`);
  ok(!health.actions.includes(gameHealth.ACTION.SWITCH_RUNTIME), `${label}: nor to switch the runtime`);

  eq(emulatorFixEligibility.inspect({ gameDir: dir }).eligible, false, `${label}: the automatic fix leaves the release alone`);
}

check('Unity, version.dll', release(unity('version.dll')), 'steam_settings');
check('Unity, winmm.dll', release(unity('winmm.dll')), 'steam_settings');
check('Unreal, Binaries/Win64', release(unreal()), path.join('Union', 'Binaries', 'Win64', 'steam_settings'));

{
  // An earlier repair wrote a folder beside the engine's Valve dll. The game never reads it.
  const dir = release({ ...unreal(), [UNREAL_ENGINE_DLL.replace('steam_api64.dll', 'steam_settings/steam_appid.txt')]: APPID });
  eq(
    path.relative(dir, goldberg.findSteamSettings(dir) || ''),
    path.join('Union', 'Binaries', 'Win64', 'steam_settings'),
    'the folder beside the running GBE wins over one beside Valve\'s dll'
  );
}

{
  // Whatever path reaches the installer, Valve's dll in the engine folder is never replaced.
  const cached = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-client-beside-exe-cache-'));
  tmpDirs.push(cached);
  fs.writeFileSync(path.join(cached, 'steam_api64.dll'), GBE_DLL);
  const dlls = { x64: path.join(cached, 'steam_api64.dll') };
  const install = (dir, rel) => {
    const summary = gbeInstaller.installDlls({ dllDirs: [path.join(dir, ...path.dirname(rel).split('/'))], dlls });
    return { installed: summary.installed, kept: fs.readFileSync(path.join(dir, ...rel.split('/'))).equals(VALVE_DLL) };
  };
  const unityDll = 'Game_Data/Plugins/x86_64/steam_api64.dll';

  const unityGame = install(release(unity('version.dll')), unityDll);
  eq(unityGame.installed, 0, 'Unity: the installer leaves Valve\'s dll alone when GBE runs beside the exe');
  ok(unityGame.kept, 'Unity: Valve\'s dll is still the one on disk');

  const unrealGame = install(release(unreal()), UNREAL_ENGINE_DLL);
  eq(unrealGame.installed, 0, 'Unreal: the installer leaves the engine\'s Valve dll alone when GBE runs in Binaries/Win64');
  ok(unrealGame.kept, 'Unreal: the engine\'s Valve dll is still the one on disk');

  // No emulator anywhere: installing GBE is still the fix, as before.
  const plainUnity = install(release({ 'Game.exe': 'stub', [unityDll]: VALVE_DLL }), unityDll);
  eq(plainUnity.installed, 1, 'a Unity game with no emulator still gets GBE installed');
  const plainUnreal = install(release({ 'Union.exe': 'stub', 'Union/Binaries/Win64/Union-Win64-Shipping.exe': 'stub', [UNREAL_ENGINE_DLL]: VALVE_DLL }), UNREAL_ENGINE_DLL);
  eq(plainUnreal.installed, 1, 'an Unreal game with no emulator still gets GBE installed');
}

{
  // Valve's own steamclient in the exe folder runs nothing: the usual warning stays.
  const layout = unity('version.dll');
  layout['steamclient64.dll'] = VALVE_DLL;
  const report = goldberg.diagnose({ gameDir: release(layout), appid: APPID, schema: null, savesRoots: [], shortcutExes: () => [] });
  ok(report.issues.some((issue) => issue.code === 'SETTINGS_NOT_BESIDE_DLL'), 'a Valve steamclient beside the exe is no emulator');
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
console.log(`PASS: clientBesideExe - ${passed} assertions`);
