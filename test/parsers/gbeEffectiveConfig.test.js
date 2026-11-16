'use strict';

/*
  #196: Game Health said NO_USER_CONFIG whenever steam_settings had no configs.user.ini, even with
  a valid %APPDATA%\GSE Saves\settings\configs.user.ini, and the old rewrite then copied the global
  identity into the game - or replaced a per-game Steam ID that owned existing saves. The precedence
  tested here is GBE Fork release-2026_09_27's settings_parser.cpp load_all_config_settings().
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-effective-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
// Every host this run sees: one APPDATA, inside the scratch folder, never this machine's.
const appdata = path.join(tmp, 'AppData', 'Roaming');
process.env.APPDATA = appdata;

const gbeEffectiveConfig = require('../../app/parser/gbeEffectiveConfig.js');
const gbeSettingsStep = require('../../app/parser/gbeSettingsStep.js');
const goldberg = require('../../app/parser/goldberg.js');

const hosts = [{ env: { APPDATA: appdata } }];
const globalDir = path.join(appdata, 'GSE Saves', 'settings');
let counter = 0;

function game({ local = {}, global = {} } = {}) {
  const gameDir = path.join(tmp, `game-${++counter}`);
  const steamSettings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(steamSettings, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), Buffer.alloc(32, 1));
  fs.writeFileSync(path.join(steamSettings, 'steam_appid.txt'), '480');
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify([{ name: 'A', displayName: 'A', description: 'a' }]));
  for (const [file, text] of Object.entries(local)) fs.writeFileSync(path.join(steamSettings, file), text);
  fs.rmSync(globalDir, { recursive: true, force: true });
  fs.mkdirSync(globalDir, { recursive: true });
  for (const [file, text] of Object.entries(global)) fs.writeFileSync(path.join(globalDir, file), text);
  return { gameDir, steamSettings };
}

const codesOf = (setup) => goldberg.diagnose({ gameDir: setup.gameDir, appid: '480', schema: { achievement: { list: [{ name: 'A' }] } }, savesRoots: [] }).issues.map((i) => i.code);
const USER = '[user::general]\naccount_name=GlobalName\nlanguage=polish\naccount_steamid=76561197960287930\n';

test('a valid global user config is not a missing one', () => {
  const setup = game({ global: { 'configs.user.ini': USER } });
  const codes = codesOf(setup);
  assert.ok(!codes.includes('NO_USER_CONFIG'), codes.join(' '));
  assert.ok(!codes.includes('BAD_USER_CONFIG'));
  assert.ok(codes.includes('USER_CONFIG_GLOBAL'), 'said as information');
});

test('nothing anywhere is still reported', () => {
  assert.ok(codesOf(game()).includes('NO_USER_CONFIG'));
});

test('the local file wins key by key, and the global one fills the rest', () => {
  const setup = game({ local: { 'configs.user.ini': '[user::general]\naccount_name=LocalName\n' }, global: { 'configs.user.ini': USER } });
  const effective = gbeEffectiveConfig.resolve({ steamSettings: setup.steamSettings, hosts });
  assert.equal(effective.lookup('user::general', 'account_name').value, 'LocalName');
  assert.equal(effective.lookup('user::general', 'account_name').scope, 'local');
  assert.equal(effective.lookup('user::general', 'language').value, 'polish');
  assert.equal(effective.lookup('user::general', 'language').scope, 'global');
  assert.ok(!codesOf(setup).includes('BAD_USER_CONFIG'));
});

test('a local save folder replaces the global settings entirely, as GBE does', () => {
  const saves = path.join(tmp, 'portable-saves');
  fs.mkdirSync(path.join(saves, 'settings'), { recursive: true });
  fs.writeFileSync(path.join(saves, 'settings', 'configs.user.ini'), '[user::general]\naccount_name=SaveFolderName\n');
  const setup = game({ local: { 'configs.user.ini': `[user::general]\naccount_name=LocalName\n[user::saves]\nlocal_save_path=${saves}\n` }, global: { 'configs.user.ini': USER } });
  const effective = gbeEffectiveConfig.resolve({ steamSettings: setup.steamSettings, hosts });
  assert.equal(effective.lookup('user::general', 'account_name').value, 'SaveFolderName', 'the save folder settings override');
  assert.equal(effective.lookup('user::general', 'language'), null, 'the global folder is not read at all');
  assert.ok(!codesOf(setup).includes('USER_CONFIG_GLOBAL'), 'a save folder of its own is not shared by every game');
});

test('a renamed saves folder moves the global settings with it', () => {
  const renamed = path.join(appdata, 'My Saves', 'settings');
  fs.mkdirSync(renamed, { recursive: true });
  fs.writeFileSync(path.join(renamed, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\ngc_token=1\n');
  const setup = game({ local: { 'configs.user.ini': '[user::saves]\nsaves_folder_name=My Saves\n' } });
  const effective = gbeEffectiveConfig.resolve({ steamSettings: setup.steamSettings, hosts });
  assert.equal(effective.lookup('main::general', 'gc_token').value, '1');
});

test('global main and app settings count too', () => {
  const setup = game({ global: { 'configs.main.ini': '[main::general]\nnew_app_ticket=1\ngc_token=1\n[main::stats]\nallow_unknown_stats=1\n', 'configs.app.ini': '[app::dlcs]\nunlock_all=1\n' } });
  const codes = codesOf(setup);
  for (const code of ['NO_MAIN_CONFIG', 'NO_NEW_APP_TICKET', 'NO_GC_TOKEN', 'UNKNOWN_STATS_REJECTED', 'NO_DLC_CONFIG', 'BAD_DLC_CONFIG']) assert.ok(!codes.includes(code), `${code}: ${codes.join(' ')}`);
});

test('classic Goldberg reads its identity from the settings .txt files', () => {
  const setup = game();
  const classic = path.join(appdata, 'Goldberg SteamEmu Saves', 'settings');
  fs.mkdirSync(classic, { recursive: true });
  fs.writeFileSync(path.join(classic, 'account_name.txt'), 'ClassicName\n');
  const effective = gbeEffectiveConfig.resolve({ steamSettings: setup.steamSettings, emulator: 'goldberg', hosts });
  assert.equal(effective.lookup('user::general', 'account_name').value, 'ClassicName');
});

test('the settings step never copies a global identity into the game', () => {
  const setup = game({ global: { 'configs.user.ini': USER } });
  const plan = gbeSettingsStep.plan({ steamSettings: setup.steamSettings, gameDir: setup.gameDir, codes: ['NO_MAIN_CONFIG'], identity: { accountName: 'SettingsName', language: 'french' }, hosts });
  assert.deepEqual(plan.user.fill, {});
  assert.ok(!plan.writes.includes('configs.user.ini'));
});

test('a per-game identity is kept unless the user agrees to replace it', async () => {
  const local = '[user::general]\naccount_name=SaveOwner\naccount_steamid=76561197960265729\nlanguage=polish\nip_country=PL\n';
  const identity = { accountName: 'SettingsName', language: 'english', accountSteamId: '76561197960287930' };

  const off = game({ local: { 'configs.user.ini': local } });
  const quiet = gbeSettingsStep.plan({ steamSettings: off.steamSettings, gameDir: off.gameDir, codes: ['NO_MAIN_CONFIG'], identity, stamp: false, hosts });
  assert.deepEqual(quiet.conflicts, [], 'with "Write account name and language" off nothing is even proposed');

  const on = game({ local: { 'configs.user.ini': local } });
  const asked = gbeSettingsStep.plan({ steamSettings: on.steamSettings, gameDir: on.gameDir, codes: ['NO_MAIN_CONFIG'], identity, stamp: true, hosts });
  assert.deepEqual(asked.conflicts.map((c) => c.key).sort(), ['account_name', 'account_steamid', 'language']);
  const kept = await gbeSettingsStep.apply({ plan: asked, appid: '480', replaceIdentity: false });
  assert.equal(fs.readFileSync(path.join(on.steamSettings, 'configs.user.ini'), 'utf8'), local, 'declined: byte for byte the same');
  assert.deepEqual(kept.written, ['configs.main.ini']);
  assert.deepEqual(kept.created, ['configs.main.ini']);

  await gbeSettingsStep.apply({ plan: asked, appid: '480', replaceIdentity: true });
  const replaced = fs.readFileSync(path.join(on.steamSettings, 'configs.user.ini'), 'utf8');
  assert.match(replaced, /^account_steamid=76561197960287930$/m);
  assert.match(replaced, /^ip_country=PL$/m, 'every other key stays');
});

test('the settings step backs up what it changes and records what it creates', async () => {
  const setup = game({ local: { 'configs.user.ini': '[user::general]\naccount_name=Me\n', 'supported_languages.txt': 'english\n' } });
  const plan = gbeSettingsStep.plan({ steamSettings: setup.steamSettings, gameDir: setup.gameDir, codes: ['BAD_USER_CONFIG', 'NO_MAIN_CONFIG'], identity: { language: 'polish' }, hosts });
  assert.deepEqual(plan.user.fill, { language: 'polish' });
  const result = await gbeSettingsStep.apply({ plan, appid: '480' });
  assert.equal(fs.readFileSync(path.join(result.backupDir, 'configs.user.ini'), 'utf8'), '[user::general]\naccount_name=Me\n');
  assert.equal(fs.readFileSync(path.join(result.backupDir, 'supported_languages.txt'), 'utf8'), 'english\n', 'the languages file it extends is kept too');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.backupDir, 'created.json'), 'utf8')), ['configs.main.ini']);
  assert.equal(fs.existsSync(path.join(result.backupDir, 'steam_appid.txt')), false, 'an untouched file is not copied');
});
