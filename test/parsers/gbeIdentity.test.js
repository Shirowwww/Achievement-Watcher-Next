'use strict';

/*
  Issue #123: the GBE Fork settings had no way to set the Steam ID or the save folder, so people
  kept Steam Auto Crack around just for those two lines of configs.user.ini. Both now come from
  Settings: the identity behind "Write account name and language", the save folder whenever chosen.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require('../../app/parser/goldberg.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-identity-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function settingsDir(name, userIni) {
  const dir = path.join(tmp, name, 'steam_settings');
  fs.mkdirSync(dir, { recursive: true });
  if (userIni !== undefined) fs.writeFileSync(path.join(dir, 'configs.user.ini'), userIni);
  return dir;
}

test('only a real individual SteamID64 is accepted', () => {
  assert.equal(goldberg.isSteamId64('76561197960287930'), true);
  assert.equal(goldberg.isSteamId64(' 76561197960287930 '), true, 'surrounding spaces from a paste are fine');
  assert.equal(goldberg.isSteamId64('7656119796028793'), false, 'one digit short');
  assert.equal(goldberg.isSteamId64('76561197960265728'), false, 'below the first individual account');
  assert.equal(goldberg.isSteamId64('76561202255233024'), false, 'past the last individual account');
  assert.equal(goldberg.isSteamId64('12345678901234567'), false, 'not a Steam id at all');
  assert.equal(goldberg.isSteamId64(''), false);
  assert.equal(goldberg.isSteamId64(undefined), false);
});

test('a random Steam ID is always a valid one, across the whole range', () => {
  const { randomSteamId64 } = require('../../app/util/steamId64.js');
  assert.equal(randomSteamId64(() => 0), '76561197960265729', 'the lowest draw is the first individual account');
  assert.equal(randomSteamId64((max) => max - 1), '76561202255233023', 'the highest draw is the last one');
  for (let i = 0; i < 500; i++) assert.equal(goldberg.isSteamId64(randomSteamId64()), true);
});

test('the Steam ID and the save folder land in configs.user.ini, keeping every other key', () => {
  const steamSettings = settingsDir('stamp', '[user::general]\naccount_name=voices38\nip_country=FR\n');
  const saves = path.join(tmp, 'My Saves');
  const result = goldberg.writeUserConfig({ steamSettings, accountSteamId: '76561197960287930', localSavePath: saves });
  const text = fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8');
  assert.equal(result.changed, true);
  assert.match(text, /^account_steamid=76561197960287930$/m);
  assert.match(text, /^\[user::saves\]$/m);
  assert.ok(text.includes(`local_save_path=${saves}`), 'the chosen folder is written as given');
  assert.match(text, /^account_name=voices38$/m, 'a name nobody asked to change stays');
  assert.match(text, /^ip_country=FR$/m);
});

test('an invalid Steam ID is never written', () => {
  const steamSettings = settingsDir('typo', '[user::general]\naccount_steamid=76561197960285355\n');
  goldberg.writeUserConfig({ steamSettings, accountSteamId: '7656119796028793' });
  assert.match(fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8'), /^account_steamid=76561197960285355$/m);
});

test('the save folder written is the one the reader follows', () => {
  const steamSettings = settingsDir('follow', '');
  const saves = path.join(tmp, 'Follow Saves');
  goldberg.writeUserConfig({ steamSettings, localSavePath: saves });
  fs.mkdirSync(path.join(saves, '480'), { recursive: true });
  fs.writeFileSync(path.join(saves, '480', 'achievements.json'), '{}');
  assert.equal(goldberg.resolveLocalSaveDir({ steamSettings, appid: '480' }), path.join(saves, '480'));
});

test('Settings decide what a fix stamps', () => {
  const options = (emulator) => ({ general: { username: 'Shirow' }, emulator });
  const off = goldberg.userIdentity(options({ stampIdentity: false, accountName: 'Pierre', accountSteamId: '76561197960287930', savePath: 'D:\\Saves' }), 'french');
  assert.deepEqual(off, { accountName: undefined, language: undefined, accountSteamId: undefined, localSavePath: 'D:\\Saves' }, 'identity waits for its switch, the folder does not');

  const on = goldberg.userIdentity(options({ stampIdentity: true, accountName: '', accountSteamId: '76561197960287930', savePath: '' }), 'french');
  assert.deepEqual(on, { accountName: 'Shirow', language: 'french', accountSteamId: '76561197960287930', localSavePath: undefined }, 'an empty name falls back to the profile');

  const named = goldberg.userIdentity(options({ stampIdentity: true, accountName: ' Pierre ' }), 'english');
  assert.equal(named.accountName, 'Pierre');

  const explicit = goldberg.userIdentity(options({ stampIdentity: false, accountSteamId: '76561197960287930' }), 'english', { explicit: true });
  assert.equal(explicit.accountName, 'Shirow', 'an explicit repair keeps stamping the name, as before');
  assert.equal(explicit.accountSteamId, undefined, 'but the Steam ID still follows the switch');

  assert.equal(goldberg.userIdentity(options({ savePath: 'relative\\saves' })).localSavePath, undefined, 'a relative folder is refused');
});

test('a repair carries the Steam ID and the save folder through, backing the file up first', async () => {
  const steamSettings = settingsDir('repair', '[user::general]\naccount_name=voices38\n');
  const saves = path.join(tmp, 'Repair Saves');
  const summary = await goldberg.repair({
    steamSettings,
    appid: '480',
    schema: { achievement: { list: [{ name: 'ACH_ONE', displayName: 'One', description: '', hidden: 0, icon: '', icongray: '' }] } },
    writeDlc: false,
    accountSteamId: '76561197960287930',
    localSavePath: saves,
  });
  const text = fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8');
  assert.match(text, /^account_steamid=76561197960287930$/m);
  assert.ok(text.includes(`local_save_path=${saves}`));
  assert.ok(summary.backupDir && fs.existsSync(path.join(summary.backupDir, 'configs.user.ini')), 'the original is kept');
});
