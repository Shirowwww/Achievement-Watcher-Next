'use strict';

/*
  Razor1911's GTA IV Complete Edition ships no steam_api.dll, so nothing on disk names the Steam
  interfaces the game was built against, and the game only loads Steam when told to. The GBE setup
  supplies both from a table keyed on the Steam appid (12210).
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gbe = require('../../app/parser/gbeInstaller.js');

const GTA_IV = '12210';
const NO_TOOLS = { tag: 'test', interfaces: { x64: null, x86: null } };

function gameFolder(t, files = ['GTAIV.exe']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-title-setup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of files) fs.writeFileSync(path.join(dir, file), 'x');
  return dir;
}

test('a title with no Valve dll gets the interface list its table names', async (t) => {
  const dir = gameFolder(t);
  const steamSettings = path.join(dir, 'steam_settings');

  const result = await gbe.generateInterfaces({ dllPath: path.join(dir, 'steam_api.dll'), steamSettings, dlls: NO_TOOLS, appid: GTA_IV });

  assert.equal(result.generated, true);
  assert.equal(fs.readFileSync(path.join(steamSettings, 'steam_interfaces.txt'), 'utf8'), 'SteamClient020\n');
});

test('a game outside the table, or with no appid, still gets no interface list', async (t) => {
  const dir = gameFolder(t);
  const steamSettings = path.join(dir, 'steam_settings');
  const dllPath = path.join(dir, 'steam_api.dll');

  assert.equal((await gbe.generateInterfaces({ dllPath, steamSettings, dlls: NO_TOOLS, appid: '271590' })).generated, false);
  assert.equal((await gbe.generateInterfaces({ dllPath, steamSettings, dlls: NO_TOOLS })).generated, false);
  assert.equal(fs.existsSync(path.join(steamSettings, 'steam_interfaces.txt')), false);
});

test('the game folder gets the interface list and the launch switch, once, keeping what is there', (t) => {
  const dir = gameFolder(t);
  const commandline = path.join(dir, 'commandline.txt');
  const interfaces = path.join(dir, 'steam_settings', 'steam_interfaces.txt');
  fs.writeFileSync(commandline, '-norestrictions');

  assert.deepEqual(gbe.ensureTitleSetup({ appid: GTA_IV, dirs: [dir] }), [interfaces, commandline]);
  assert.deepEqual(gbe.ensureTitleSetup({ appid: GTA_IV, dirs: [dir] }), []);
  assert.equal(fs.readFileSync(commandline, 'utf8'), '-norestrictions\n-useSteam\n');
  assert.equal(fs.readFileSync(interfaces, 'utf8'), 'SteamClient020\n');
});

test('an interface list already made from a Valve dll is kept', (t) => {
  const dir = gameFolder(t);
  const interfaces = path.join(dir, 'steam_settings', 'steam_interfaces.txt');
  fs.mkdirSync(path.dirname(interfaces));
  fs.writeFileSync(interfaces, 'SteamClient018\nSteamUser020\n');

  gbe.ensureTitleSetup({ appid: GTA_IV, dirs: [dir] });

  assert.equal(fs.readFileSync(interfaces, 'utf8'), 'SteamClient018\nSteamUser020\n');
});

test('a folder that does not hold the game, or a game outside the table, is left alone', (t) => {
  const elsewhere = gameFolder(t, ['launcher.exe']);
  const gta = gameFolder(t);

  assert.deepEqual(gbe.ensureTitleSetup({ appid: GTA_IV, dirs: [elsewhere] }), []);
  assert.deepEqual(gbe.ensureTitleSetup({ appid: '271590', dirs: [gta] }), []);
  assert.deepEqual(fs.readdirSync(elsewhere), ['launcher.exe']);
  assert.deepEqual(fs.readdirSync(gta), ['GTAIV.exe']);
});
