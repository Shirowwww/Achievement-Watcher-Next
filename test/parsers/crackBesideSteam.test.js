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
