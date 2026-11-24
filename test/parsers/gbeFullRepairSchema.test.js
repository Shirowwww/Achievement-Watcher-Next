'use strict';

/*
  The full emulator fix (goldberg.repair: right-click, automatic, fix-all) and the Game Health
  runtime switch, after #194/#196: the same schema rule as the rewrite button, the same identity
  rule as the settings step, and a switch that never leaves GBE without its steam_settings.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-full-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
process.env.APPDATA = path.join(tmp, 'AppData');

const goldberg = require('../../app/parser/goldberg.js');
const gameHealthRepair = require('../../app/util/gameHealthRepair.js');
const repairJournal = require('../../app/util/repairJournal.js');

let n = 0;
function install(files = {}) {
  const gameDir = path.join(tmp, `game-${++n}`);
  const steamSettings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(path.join(steamSettings, 'img'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), Buffer.alloc(16, 1));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(steamSettings, name), body);
  return { gameDir, steamSettings };
}

const generated = [
  { name: 'ACH_A', hidden: 1, displayName: { english: 'A', polish: 'A pl' }, description: { english: 'a', polish: 'a pl' }, icon: 'img/a.jpg', icon_gray: 'img/a_g.jpg' },
];
const schema = { achievement: { list: [{ name: 'ACH_A', displayName: 'A', description: 'a', hidden: 1, icon: 'https://x/a.jpg', icongray: 'https://x/a_g.jpg' }] } };

test('the full fix keeps a generated multilingual schema and its img/ folder', async () => {
  const { steamSettings } = install({ 'achievements.json': JSON.stringify(generated, null, 2) });
  fs.writeFileSync(path.join(steamSettings, 'img', 'a.jpg'), 'on');
  fs.writeFileSync(path.join(steamSettings, 'img', 'a_g.jpg'), 'off');
  const before = fs.readFileSync(path.join(steamSettings, 'achievements.json'));
  let downloads = 0;
  const summary = await goldberg.repair({ steamSettings, appid: '3751260', schema, writeDlc: false, downloadIcon: async () => ++downloads && null });
  assert.ok(fs.readFileSync(path.join(steamSettings, 'achievements.json')).equals(before));
  assert.equal(summary.preservedRichSchema, true);
  assert.equal(downloads, 0);
  assert.equal(fs.existsSync(path.join(steamSettings, 'images')), false);
  assert.equal(fs.existsSync(path.join(steamSettings, 'configs.app.ini')), false, 'manageDlc off: no DLC file');
});

test('the full fix never replaces a per-game identity without consent', async () => {
  const local = '[user::general]\naccount_name=SaveOwner\naccount_steamid=76561197960265729\nlanguage=polish\n';
  const { steamSettings } = install({ 'configs.user.ini': local });
  await goldberg.repair({ steamSettings, appid: '2322010', schema, writeDlc: false, accountName: 'Me', language: 'english', accountSteamId: '76561197960287930' });
  assert.equal(fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8'), local);

  await goldberg.repair({ steamSettings, appid: '2322010', schema, writeDlc: false, accountSteamId: '76561197960287930', replaceIdentity: true });
  assert.match(fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8'), /^account_steamid=76561197960287930$/m, 'replaced once agreed');
});

test('the full fix does not copy a global identity into the game', async () => {
  const global = path.join(process.env.APPDATA, 'GSE Saves', 'settings');
  fs.mkdirSync(global, { recursive: true });
  fs.writeFileSync(path.join(global, 'configs.user.ini'), '[user::general]\naccount_name=Global\nlanguage=polish\n');
  try {
    const { steamSettings } = install();
    // The same name as the global one, and the defaults: neither may shadow the global settings.
    await goldberg.repair({ steamSettings, appid: '1551980', schema, writeDlc: false, fillUserDefaults: true, accountName: 'Global' });
    assert.equal(fs.existsSync(path.join(steamSettings, 'configs.user.ini')), false);
    // A different name Settings explicitly asks for is the user's choice.
    await goldberg.repair({ steamSettings, appid: '1551980', schema, writeDlc: false, accountName: 'Me' });
    assert.match(fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8'), /^account_name=Me$/m);
  } finally {
    fs.rmSync(global, { recursive: true, force: true });
  }
});

// A stand-in for gbeInstaller: the dll lands, then whatever the test asks for.
function fakeInstaller({ failInterfaces = false } = {}) {
  return {
    installDlls: ({ dllDirs }) => {
      for (const dir of dllDirs) fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'GBE');
      return { installed: dllDirs.length, backedUp: false, tag: 'test' };
    },
    generateInterfaces: async () => {
      if (failInterfaces) throw new Error('boom');
      return { generated: false };
    },
    ensureTitleSetup: () => [],
  };
}

function runeGame() {
  const gameDir = path.join(tmp, `rune-${++n}`);
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'RUNE');
  fs.writeFileSync(path.join(gameDir, 'steam_emu.ini'), '[Settings]\nAppId=1903340\n');
  return gameDir;
}

test('switching emulators writes the dll and a minimal steam_settings together', async () => {
  const gameDir = runeGame();
  const plan = { dirs: [gameDir], file: 'steam_api64.dll', arch: 'x64', native: false };
  const result = await gameHealthRepair.switchToSupportedRuntime({ goldberg, gbeInstaller: fakeInstaller(), plan, appid: '1903340', schema, dlls: {}, sideline: () => [] });
  const steamSettings = path.join(gameDir, 'steam_settings');
  assert.equal(result.steamSettings, steamSettings);
  assert.equal(fs.readFileSync(path.join(steamSettings, 'steam_appid.txt'), 'utf8'), '1903340', 'GBE never starts without its appid');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(steamSettings, 'achievements.json'), 'utf8')).map((e) => e.name), ['ACH_A']);
  assert.equal(fs.readFileSync(path.join(gameDir, 'steam_api64.dll'), 'utf8'), 'GBE');
});

// A Unity game switched to the exe's folder before: that steam_settings is not where the dll now goes.
test('a switch writes steam_settings beside the dll it installs, not into a folder left elsewhere', async () => {
  const gameDir = runeGame();
  const plugins = path.join(gameDir, 'Game_Data', 'Plugins', 'x86_64');
  fs.mkdirSync(plugins, { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'steam_settings'), { recursive: true });
  const plan = { dirs: [plugins], file: 'steam_api64.dll', arch: 'x64', native: false };
  const stale = path.join(gameDir, 'steam_settings');
  assert.equal(gameHealthRepair.switchSettingsDir(plan, stale), path.join(plugins, 'steam_settings'));
  const result = await gameHealthRepair.switchToSupportedRuntime({ goldberg, gbeInstaller: fakeInstaller(), plan, steamSettings: stale, appid: '1903340', schema, dlls: {}, sideline: () => [] });
  assert.equal(result.steamSettings, path.join(plugins, 'steam_settings'));
  assert.equal(fs.readFileSync(path.join(plugins, 'steam_settings', 'steam_appid.txt'), 'utf8'), '1903340');
  // One beside a dll of the plan is the setup's own and stays.
  const own = path.join(plugins, 'steam_settings');
  assert.equal(gameHealthRepair.switchSettingsDir(plan, own), own);
  // A plan with no target leaves the switch's own guard to refuse it, instead of a TypeError here.
  assert.equal(gameHealthRepair.switchSettingsDir({ dirs: [] }, own), own);
  assert.equal(gameHealthRepair.switchSettingsDir(null, null), null);
});

test('a switch that fails half way puts every file back', async () => {
  const gameDir = runeGame();
  const userDataPath = path.join(tmp, 'userdata');
  const plan = { dirs: [gameDir], file: 'steam_api64.dll', arch: 'x64', native: false };
  const brokenSchema = { achievement: { list: schema.achievement.list } };
  const roots = repairJournal.gbeRoots({ runtimeDirs: [gameDir], settingsDirs: [path.join(gameDir, 'steam_settings')] });
  const installer = fakeInstaller();
  const failing = { ...installer, installDlls: (args) => installer.installDlls(args) };
  // The schema write fails after the dll went in: nothing of the switch may stay.
  const realWrite = fs.writeFileSync;
  await assert.rejects(
    repairJournal.record({ userDataPath, appid: '1903340', label: 'switch-runtime', roots }, async () => {
      fs.writeFileSync = (file, ...rest) => {
        if (String(file).endsWith('achievements.json')) throw new Error('disk full');
        return realWrite(file, ...rest);
      };
      try {
        return await gameHealthRepair.switchToSupportedRuntime({ goldberg, gbeInstaller: failing, plan, appid: '1903340', schema: brokenSchema, dlls: {}, sideline: () => [] });
      } finally {
        fs.writeFileSync = realWrite;
      }
    }),
    /disk full/
  );
  assert.equal(fs.readFileSync(path.join(gameDir, 'steam_api64.dll'), 'utf8'), 'RUNE', 'the crack dll is back');
  assert.equal(fs.existsSync(path.join(gameDir, 'steam_settings', 'steam_appid.txt')), false, 'no half-made steam_settings is left');
});

test('a switch without a Steam appid changes nothing', async () => {
  const gameDir = runeGame();
  const plan = { dirs: [gameDir], file: 'steam_api64.dll', arch: 'x64', native: false };
  let sidelined = false;
  await assert.rejects(
    gameHealthRepair.switchToSupportedRuntime({ goldberg, gbeInstaller: fakeInstaller(), plan, appid: null, schema, dlls: {}, sideline: () => {
      sidelined = true;
      return [];
    } }),
    /appid/
  );
  assert.equal(sidelined, false);
  assert.equal(fs.readFileSync(path.join(gameDir, 'steam_api64.dll'), 'utf8'), 'RUNE');
});
