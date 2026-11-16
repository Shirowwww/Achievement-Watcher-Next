'use strict';

/*
  Two installs from a 2026-10-19 report. Call of Duty MW4 keeps a Steam launcher (cod.exe, Valve's
  dll) above its GBE build in sp26\, and was listed twice; AW then wrote a steam_settings beside the
  launcher that hid the real install. Little Nightmares III runs OnlineFix's Friend's Pass, whose
  unlocks only Steam's own stats file holds.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-crack-steam-profile-'));
const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const achievements = require('../../app/parser/achievements.js');
const { _internal } = achievements;
achievements.initDebug({ isDev: false, userDataPath: userData });
const steam = require('../../app/parser/steam.js');
Module._load = originalLoad;
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-crack-steam-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a launcher folder above an install the scan already found is not a game of its own', () => {
  const root = path.resolve(os.tmpdir(), 'Call of Duty - Modern Warfare 4');
  const claimed = new Set([path.join(root, 'sp26').toLowerCase()]);
  assert.equal(_internal.holdsClaimedInstall(root, claimed), true);
  assert.equal(_internal.holdsClaimedInstall(path.join(root, 'sp26'), claimed), false, 'the install itself');
  assert.equal(_internal.holdsClaimedInstall(root + ' Remastered', claimed), false, 'a sibling sharing the name prefix');
});

test('runtime configs never create a steam_settings beside Valve\'s own dll', (t) => {
  const dir = sandbox(t);
  const settings = path.join(dir, 'steam_settings');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'Valve runtime');
  assert.equal(_internal.emulatorReadsSettings(settings), false);

  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'GBE reads steam_settings');
  assert.equal(_internal.emulatorReadsSettings(settings), true, 'a GBE dll opens the folder once written');

  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'Valve runtime');
  fs.mkdirSync(settings);
  assert.equal(_internal.emulatorReadsSettings(settings), true, 'an existing folder is kept up to date');
});

test('a freshly installed emulator gets its runtime configs in the same scan', async (t) => {
  const dir = sandbox(t);
  const settings = path.join(dir, 'steam_settings');
  fs.mkdirSync(settings);
  const option = { emulator: { manageDlc: false, stampIdentity: false }, achievement: { lang: 'english' } };
  await _internal.writeRuntimeConfigs({ appid: '480', steamSettings: settings, option, exePresent: () => true });
  assert.match(fs.readFileSync(path.join(settings, 'configs.main.ini'), 'utf8'), /new_app_ticket=1/);
  assert.equal(fs.existsSync(path.join(settings, 'configs.app.ini')), false, 'DLC ownership keeps its own switch');
});

test('a game Steam keeps stats for is read through the account those stats belong to', async (t) => {
  const steamPath = sandbox(t);
  const stats = path.join(steamPath, 'appcache', 'stats');
  fs.mkdirSync(stats, { recursive: true });
  fs.writeFileSync(path.join(stats, 'UserGameStats_274782616_1392860.bin'), '');
  const user = { user: '274782616', name: 'Shirow' };
  const options = { readSteamPath: async () => steamPath, readUsers: async () => [{ user: '1', name: 'Other' }, user] };

  const record = await steam.steamStatsRecord('1392860', options);
  assert.deepEqual(record, {
    appid: '1392860',
    source: 'Steam (Shirow)',
    data: { type: 'steamAPI', userID: user, cachePath: path.join(steamPath, 'appcache/stats'), installed: true },
  });
  assert.equal(await steam.steamStatsRecord('480', options), null, 'no stats file for that game');
  assert.equal(await steam.steamStatsRecord('1392860', { ...options, readUsers: async () => [] }), null, 'stats of an account not on this PC');
  assert.equal(await steam.steamStatsRecord('1392860', { readSteamPath: async () => Promise.reject(new Error('no Steam')) }), null);
});

/*
  LuaTools and SteamTools add a game the account does not own to the real Steam client through a
  script in config/stplug-in/<appid>.lua. Steam runs it, shows its own popups and keeps the unlocks
  in appcache/stats, but with official Steam games switched off AW listed nothing for it (Raft, Discord).
*/
test('the games LuaTools or SteamTools added to Steam are listed from config/stplug-in', async (t) => {
  const steamPath = sandbox(t);
  const plugins = path.join(steamPath, 'config', 'stplug-in');
  fs.mkdirSync(plugins, { recursive: true });
  for (const name of ['648800.lua', '1091500.LUA', 'notes.txt', 'Steamtools.lua', '480.lua.bak']) fs.writeFileSync(path.join(plugins, name), 'addappid(1)\n');
  fs.mkdirSync(path.join(plugins, '123.lua'));
  const stats = path.join(steamPath, 'appcache', 'stats');
  fs.mkdirSync(stats, { recursive: true });
  for (const appid of ['648800', '1091500', '480', '123']) fs.writeFileSync(path.join(stats, `UserGameStats_274782616_${appid}.bin`), '');
  fs.writeFileSync(path.join(plugins, '700.lua'), 'addappid(700)\n'); // added, never played: nothing to read
  // SteamTools keeps every game in one steamtools.lua, depots (no stats file) included.
  fs.writeFileSync(path.join(stats, 'UserGameStats_274782616_1245620.bin'), '');
  fs.writeFileSync(path.join(plugins, 'Steamtools.lua'), 'addappid(1245620)\naddappid(1245621, 1, "abcdef")\nsetManifestid(1245621, "123")\n');

  assert.deepEqual((await steam.luaAddedAppids({ readSteamPath: async () => steamPath })).sort(), ['1091500', '1245620', '648800']);
  assert.deepEqual(await steam.luaAddedAppids({ readSteamPath: async () => sandbox(t) }), [], 'no stplug-in folder');
  assert.deepEqual(await steam.luaAddedAppids({ readSteamPath: async () => Promise.reject(new Error('no Steam')) }), []);
});

test('a LuaTools game is read from the Steam client stats whatever the official-games setting', async () => {
  const steamRecord = (appid) => ({ appid, source: 'Steam (Player)', data: { type: 'steamAPI', installed: true } });
  const asked = [];
  const statsRecord = async (appid) => {
    asked.push(appid);
    return appid === '999' ? null : steamRecord(appid);
  };
  const data = [steamRecord('1091500'), { appid: '2000', source: 'Goldberg', data: { type: 'file', path: 'x' } }];

  const out = await _internal.addSteamStatsForLuaGames(data, { luaAppids: async () => ['648800', '1091500', '999', '2000'], statsRecord });

  assert.deepEqual(asked.sort(), ['2000', '648800', '999'], 'an appid that already has a Steam record is not asked again');
  assert.deepEqual(
    out.filter((r) => r.data.type === 'steamAPI').map((r) => r.appid).sort(),
    ['1091500', '2000', '648800'],
    'stats were added for the lua games Steam keeps stats for, a crack record of the same game included'
  );
  assert.equal(out.length, 4, 'no record for a lua game with no stats yet');
  assert.equal(await _internal.addSteamStatsForLuaGames(data, { luaAppids: async () => [], statsRecord }), data);
});
