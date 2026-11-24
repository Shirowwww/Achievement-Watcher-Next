'use strict';

// A Unity game loads steam_api from <Game>_Data/Plugins first. A GBE dll beside the exe with a
// Valve (or unknown) dll left in Plugins is never loaded, yet it made the diagnosis say "Setup
// looks valid" while nothing was ever saved (Probably Stolen, Discord help forum).

const path = require('path');
const fs = require('fs');
const os = require('os');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else failures.push(msg);
}

const tmpDirs = [];
const VALVE_DLL = Buffer.from('MZ valve steam api, no emulator marker');
const GBE_DLL = Buffer.from('MZ gbe build ... steam_settings ... GSE Saves');
const APPID = '4348910';
const PLUGINS = 'Game_Data/Plugins/x86_64';

function release(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unity-plugin-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(layout)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

function settings(prefix) {
  return {
    [`${prefix}steam_settings/steam_appid.txt`]: APPID,
    [`${prefix}steam_settings/configs.user.ini`]: '[user::general]\naccount_name=x\nlanguage=english\n',
    [`${prefix}steam_settings/achievements.json`]: JSON.stringify([
      { name: 'ACH_1', displayName: 'One', description: 'd', hidden: '0', icon: '', icongray: '' },
    ]),
  };
}

function diagnose(layout) {
  const dir = release(layout);
  const report = goldberg.diagnose({ gameDir: dir, appid: APPID, schema: null, savesRoots: [], shortcutExes: () => [] });
  return { dir, report, issue: report.issues.find((i) => i.code === 'RUNTIME_DLL_NOT_EMULATOR') };
}

{
  // The reported layout: GBE and steam_settings at the root, a non-emulator dll in Plugins.
  const { dir, report, issue } = diagnose({
    'Game.exe': 'stub',
    'steam_api64.dll': GBE_DLL,
    ...settings(''),
    [`${PLUGINS}/steam_api64.dll`]: VALVE_DLL,
    ...settings(`${PLUGINS}/`),
  });
  ok(!!issue, `the Plugins dll the game loads is flagged (got ${report.issues.map((i) => i.code).join(' ')})`);
  ok(issue && issue.level === 'error', 'it is an error, the setup cannot record anything');
  ok(issue && issue.data.dllDirs.some((d) => path.relative(dir, d) === path.join(...PLUGINS.split('/'))), 'the issue names the Plugins folder');
  ok(report.foreignRuntimeDirs.some((d) => path.relative(dir, d) === path.join(...PLUGINS.split('/'))), 'the Plugins folder is listed as a foreign runtime');
}

{
  // GBE in Plugins is the working setup, whatever sits at the root.
  const { report, issue } = diagnose({
    'Game.exe': 'stub',
    [`${PLUGINS}/steam_api64.dll`]: GBE_DLL,
    ...settings(`${PLUGINS}/`),
  });
  ok(!issue, `GBE in Plugins is not flagged (got ${report.issues.map((i) => i.code).join(' ')})`);
}

{
  // A Denuvo release (#167) keeps Valve's dll in Plugins and runs GBE's steamclient beside the exe.
  const { report, issue } = diagnose({
    'Game.exe': 'stub',
    'steamclient64.dll': GBE_DLL,
    'version.dll': 'MZ loader',
    ...settings(''),
    [`${PLUGINS}/steam_api64.dll`]: VALVE_DLL,
  });
  ok(!issue, `a steamclient side-loaded beside the exe still works (got ${report.issues.map((i) => i.code).join(' ')})`);
}

{
  // A game that is not Unity is untouched by the check.
  const { issue } = diagnose({ 'Game.exe': 'stub', 'steam_api64.dll': GBE_DLL, ...settings('') });
  ok(!issue, 'a root-only GBE setup is not flagged');
}

{
  // Switching a RUNE release to GBE: the dll goes where Unity loads it, and RUNE's files there are set aside.
  const gbe = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'));
  const crack = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
  const dir = release({
    'Probably Stolen.exe': 'stub',
    [`${PLUGINS}/steam_api64.dll`]: 'MZ rune runtime',
    [`${PLUGINS}/steam_api64.rne`]: VALVE_DLL,
    [`${PLUGINS}/steam_emu.ini`]: '[Settings]\n',
  });
  const plugins = path.join(dir, ...PLUGINS.split('/'));
  const dirs = gbe.runtimeDllDirs({ gameDir: dir, exePath: path.join(dir, 'Probably Stolen.exe') });
  ok(dirs.length === 1 && dirs[0] === plugins, `the runtime goes to Plugins, not beside the exe (got ${dirs.map((d) => path.relative(dir, d)).join(', ')})`);
  const sidelined = crack.disableLoaderMarkers([dir, ...dirs]);
  ok(sidelined.length === 2, `RUNE's ini and .rne beside the Plugins dll are set aside (got ${sidelined.length})`);
  fs.writeFileSync(path.join(plugins, 'steam_api64.dll'), GBE_DLL);
  ok(crack.detectWorkingCrackLoader(dir) === null, 'once switched, the game no longer reads as RUNE');
}

{
  // After switches that went beside the exe: GBE and a full steam_settings left at the root, the new
  // GBE in Plugins. Unity loads Plugins, so its folder is the one AW reads and repairs.
  const dir = release({
    'Game.exe': 'stub',
    'steam_api64.dll': GBE_DLL,
    ...settings(''),
    [`${PLUGINS}/steam_api64.dll`]: GBE_DLL,
    [`${PLUGINS}/steam_settings/steam_appid.txt`]: APPID,
  });
  const found = goldberg.findSteamSettings(dir);
  ok(found && path.relative(dir, found) === path.join(...PLUGINS.split('/'), 'steam_settings'), `the Plugins steam_settings wins over a leftover at the root (got ${found && path.relative(dir, found)})`);
}

{
  // The same leftover, with the root dll also among the switch's targets: settings follow the dll Unity loads.
  const repair = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealthRepair.js'));
  const plugins = path.join('C:/Game', ...PLUGINS.split('/'));
  const target = repair.switchSettingsDir({ dirs: [plugins, 'C:/Game'] }, path.join('C:/Game', 'steam_settings'));
  ok(target === path.join(plugins, 'steam_settings'), `a switch writes settings beside the first target, the dll the game loads (got ${target})`);
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
console.log(`PASS: unityPluginDll - ${passed} assertions`);
