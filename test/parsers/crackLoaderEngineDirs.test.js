'use strict';

/*
  A crack serves a game from the folder the engine loads steam_api from: <Game>_Data/Plugins for
  Unity, Engine/Binaries/ThirdParty/Steamworks for a packaged Unreal build. Found there, it is the
  game's runtime even when a GBE dll or an AW Next steam_settings sits somewhere else in the folder
  (a TENOKE Unity release with an earlier AW Next fix at its root, Discord help forum).
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const crackLoaderDetect = require(path.join(appDir, 'util', 'crackLoaderDetect.js'));
const goldberg = require(path.join(appDir, 'parser', 'goldberg.js'));
const gameHealth = require(path.join(appDir, 'util', 'gameHealth.js'));
const userDir = require(path.join(appDir, 'parser', 'userDir.js'));

const VALVE_DLL = Buffer.from('MZ valve steam api, no emulator marker');
const TENOKE_DLL = Buffer.from('MZ tenoke runtime, its own saves');
const GBE_DLL = Buffer.from('MZ gbe build ... steam_settings ... GSE Saves');
const APPID = '4348910';
const PLUGINS = ['Game_Data', 'Plugins', 'x86_64'];
const UNREAL_ENGINE = ['Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv157', 'Win64'];
const tmpDirs = [];

function release(layout, root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-crack-engine-'))) {
  tmpDirs.push(root);
  for (const [rel, content] of Object.entries(layout)) {
    const file = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

const gbeSettings = (prefix) => ({
  [`${prefix}steam_settings/steam_appid.txt`]: APPID,
  [`${prefix}steam_settings/configs.user.ini`]: '[user::general]\naccount_name=x\nlanguage=english\n',
  [`${prefix}steam_settings/achievements.json`]: JSON.stringify([{ name: 'ACH_1', displayName: 'One', description: 'd', hidden: '0', icon: '', icongray: '' }]),
});
const tenoke = (prefix) => ({
  [`${prefix}steam_api64.dll`]: TENOKE_DLL,
  [`${prefix}tenoke.ini`]: `[TENOKE]\nid = ${APPID} # Probably Stolen\n`,
  [`${prefix}SteamData/user_stats.ini`]: '[ACHIEVEMENTS]\n"ACH_1" = {unlocked = true, time = 1793982110}\n',
});
// What the reporter had: TENOKE back in Plugins, AW Next's earlier GBE fix left at the root.
const unityTenokeOverOldFix = () => ({ 'Game.exe': 'stub', 'steam_api64.dll': GBE_DLL, ...gbeSettings(''), ...tenoke(`${PLUGINS.join('/')}/`) });
const codesOf = (report) => report.issues.map((issue) => issue.code);
const diagnose = (dir) => goldberg.diagnose({ gameDir: dir, appid: APPID, schema: null, savesRoots: [], shortcutExes: () => [] });

test('a crack in a Unity build\'s Plugins folder is found', () => {
  const dir = release({ 'Game.exe': 'stub', ...tenoke(`${PLUGINS.join('/')}/`) });
  const loader = crackLoaderDetect.detectWorkingCrackLoader(dir);
  assert.equal(loader && loader.name, 'TENOKE');
  assert.equal(loader.dir, path.join(dir, ...PLUGINS));
});

test('the crack the Unity player loads serves the game, whatever GBE sits at the root', () => {
  const report = diagnose(release(unityTenokeOverOldFix()));
  const codes = codesOf(report);
  assert.ok(codes.includes('SERVED_BY_LOADER'), `served by TENOKE (got ${codes.join(' ')})`);
  assert.ok(codes.includes('UNUSED_STEAM_SETTINGS'), 'the leftover GBE configuration is named as unused');
  assert.ok(!codes.includes('RUNTIME_DLL_NOT_EMULATOR'), 'a working crack is not an error');
  assert.equal(report.loader, 'TENOKE');
  assert.equal(report.ok, true);
});

test('Game Health keeps a crack-served game out of the "no progress" warning', () => {
  const dir = release(unityTenokeOverOldFix());
  const health = gameHealth.deriveHealth({
    gameDir: dir,
    gameDirExists: true,
    emulated: true,
    goldberg: { ...diagnose(dir), dllCount: 2 },
    achievements: { total: 21, unlocked: 0 },
    playtime: { total: 444, lastPlayed: 1 },
  });
  const level = (id) => (health.checks.find((c) => c.id === id) || {}).level;
  assert.equal(level('emulator'), 'ok');
  assert.notEqual(level('progress'), 'warn', 'the empty GBE save is not where TENOKE writes');
});

test('once GBE replaces the crack\'s dll in Plugins, GBE is the runtime again', () => {
  const layout = { 'Game.exe': 'stub', ...tenoke(`${PLUGINS.join('/')}/`), ...gbeSettings(`${PLUGINS.join('/')}/`) };
  layout[`${PLUGINS.join('/')}/steam_api64.dll`] = GBE_DLL;
  const report = diagnose(release(layout));
  assert.ok(!codesOf(report).includes('SERVED_BY_LOADER'), `the leftover tenoke.ini is not the runtime (got ${codesOf(report).join(' ')})`);
});

test('a crack at the root keeps the game when steam_settings sits beside it', () => {
  const report = diagnose(release({ 'Game.exe': 'stub', ...tenoke(''), ...gbeSettings('') }));
  const codes = codesOf(report);
  assert.ok(codes.includes('SERVED_BY_LOADER'), `served by TENOKE (got ${codes.join(' ')})`);
  assert.ok(!codes.includes('RUNTIME_DLL_NOT_EMULATOR'));
});

test('GBE at the root of a plain game still wins over a crack ini left beside it', () => {
  const layout = { 'Game.exe': 'stub', ...tenoke(''), ...gbeSettings('') };
  layout['steam_api64.dll'] = GBE_DLL;
  assert.ok(!codesOf(diagnose(release(layout))).includes('SERVED_BY_LOADER'));
});

test('an Unreal build served from its Steamworks folder ignores a GBE dll at the root', () => {
  const engine = `${UNREAL_ENGINE.join('/')}/`;
  const report = diagnose(release({ 'Game.exe': 'stub', 'Game/Binaries/Win64/Game-Win64-Shipping.exe': 'stub', 'steam_api64.dll': GBE_DLL, ...gbeSettings(''), ...tenoke(engine) }));
  assert.ok(codesOf(report).includes('SERVED_BY_LOADER'), `served by TENOKE (got ${codesOf(report).join(' ')})`);
});

test('a Valve dll in Plugins with no crack beside it is still reported (no loader to credit)', () => {
  const report = diagnose(release({ 'Game.exe': 'stub', 'steam_api64.dll': GBE_DLL, ...gbeSettings(''), [`${PLUGINS.join('/')}/steam_api64.dll`]: VALVE_DLL }));
  assert.ok(codesOf(report).includes('RUNTIME_DLL_NOT_EMULATOR'));
});

test('a library root finds the TENOKE saves of a Unity game in its Plugins folder', async () => {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-crack-library-'));
  release(unityTenokeOverOldFix(), path.join(library, '_Probably Stolen 26284217 v1.0.0.2'));
  tmpDirs.push(library);
  const records = await userDir.scan(library);
  const record = records.find((entry) => entry.source === 'TENOKE');
  assert.ok(record, `a TENOKE record (got ${records.map((entry) => entry.source).join(', ')})`);
  assert.equal(String(record.appid), APPID);
  assert.equal(record.data.path, path.join(library, '_Probably Stolen 26284217 v1.0.0.2', ...PLUGINS, 'SteamData'));
});

test.after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});
