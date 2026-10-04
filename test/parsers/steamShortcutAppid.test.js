'use strict';

/*
  The Blood of Dawnwalker, again: achievements unlocked when the game was started from AW Next and
  never when it was started from a Steam shortcut (added for Steam Input). gbe_fork reads SteamAppId
  and SteamGameId before its own steam_appid.txt, and for a non-Steam shortcut Steam fills those from
  a steam_appid.txt beside the exe, or with a generated id when there is none. The unlocks then went
  to GSE Saves\<that id>. AW now writes the file where Steam reads it, and says so when it is missing.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const steamLibrary = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steamLibrary.js'));
const awManagedConfig = require(path.join(__dirname, '..', '..', 'app', 'util', 'awManagedConfig.js'));
const gameHealth = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shortcut-appid-'));
const SCHEMA = { achievement: { total: 1, list: [{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: 0 }] } };

// Steam's binary KeyValues, as shortcuts.vdf stores them.
const map = (key, body) => Buffer.concat([Buffer.from([0x00]), Buffer.from(`${key}\0`), body, Buffer.from([0x08])]);
const str = (key, value) => Buffer.concat([Buffer.from([0x01]), Buffer.from(`${key}\0${value}\0`)]);
const int = (key, value) => {
  const number = Buffer.alloc(4);
  number.writeInt32LE(value);
  return Buffer.concat([Buffer.from([0x02]), Buffer.from(`${key}\0`), number]);
};

function shortcutsVdf(exes) {
  const entries = exes.map((exe, index) =>
    map(String(index), Buffer.concat([int('appid', -1441195210 + index), str('AppName', `Game ${index}`), str('Exe', `"${exe}"`), str('StartDir', `"${path.dirname(exe)}"`), map('tags', Buffer.alloc(0))]))
  );
  return Buffer.concat([map('shortcuts', Buffer.concat(entries)), Buffer.from([0x08])]);
}

function gbeGame(name) {
  const gameDir = path.join(tmp, name);
  const steamSettings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(steamSettings, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'emu');
  fs.writeFileSync(path.join(gameDir, `${name}.exe`), 'MZ');
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify([{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: '0', icon: '', icongray: '' }]));
  fs.writeFileSync(path.join(steamSettings, 'steam_appid.txt'), '3751260');
  return { gameDir, steamSettings, exe: path.join(gameDir, `${name}.exe`) };
}

test("Steam's shortcuts are read from every account's shortcuts.vdf", () => {
  const client = path.join(tmp, 'Steam');
  const config = path.join(client, 'userdata', '274782616', 'config');
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(config, 'shortcuts.vdf'), shortcutsVdf(['D:\\Games\\Dawnwalker\\Dawnwalker.exe', 'D:\\Emus\\Ryujinx.exe']));
  // An account whose file Steam is halfway through rewriting must not hide the others.
  fs.mkdirSync(path.join(client, 'userdata', '1', 'config'), { recursive: true });
  fs.writeFileSync(path.join(client, 'userdata', '1', 'config', 'shortcuts.vdf'), Buffer.from([0x00, 0x73]));

  assert.deepEqual(steamLibrary.shortcutExecutables({ clientDir: client }), ['D:\\Games\\Dawnwalker\\Dawnwalker.exe', 'D:\\Emus\\Ryujinx.exe']);
  assert.deepEqual(steamLibrary.shortcutExecutables({ clientDir: path.join(tmp, 'no-steam') }), []);
});

test('a Steam shortcut with no steam_appid.txt beside its exe is a repairable warning', () => {
  const game = gbeGame('Dawnwalker');
  const report = goldberg.diagnose({ gameDir: game.gameDir, appid: '3751260', schema: SCHEMA, shortcutExes: () => [game.exe, 'D:\\Elsewhere\\Other.exe'] });
  const issue = report.issues.find((entry) => entry.code === 'STEAM_SHORTCUT_NO_APPID');
  assert.ok(issue, 'the missing file is reported');
  assert.equal(issue.level, 'warning');
  assert.deepEqual(report.launchDirs, [game.gameDir], 'only shortcuts into this game count');
  assert.ok(gameHealth.REPAIRABLE_GOLDBERG_CODES.has('STEAM_SHORTCUT_NO_APPID'), 'the repair button covers it');

  const quiet = goldberg.diagnose({ gameDir: game.gameDir, appid: '3751260', schema: SCHEMA, shortcutExes: () => [] });
  assert.equal(quiet.issues.some((entry) => entry.code === 'STEAM_SHORTCUT_NO_APPID'), false, 'no shortcut, nothing to say');
});

test('a steam_appid.txt beside the shortcut exe naming another game is an appid mismatch', () => {
  const game = gbeGame('Spacewar Repack');
  fs.writeFileSync(path.join(game.gameDir, 'steam_appid.txt'), '480');
  const report = goldberg.diagnose({ gameDir: game.gameDir, appid: '3751260', schema: SCHEMA, shortcutExes: () => [game.exe] });
  const mismatch = report.issues.find((entry) => entry.code === 'APPID_MISMATCH');
  assert.ok(mismatch);
  assert.equal(mismatch.data.onDisk, '480');
  assert.equal(mismatch.data.expected, '3751260');

  const fixed = goldberg.writeSteamAppId({ steamSettings: game.steamSettings, appid: '3751260', launchDirs: report.launchDirs });
  assert.equal(fixed.changed, true);
  assert.equal(fs.readFileSync(path.join(game.gameDir, 'steam_appid.txt'), 'utf8'), '3751260');
  assert.ok(fixed.backupDir && fs.readdirSync(fixed.backupDir).length === 1, 'the old value is kept');
});

test('repair writes steam_appid.txt where Steam reads it, never over an existing one, and can take it back', async () => {
  const game = gbeGame('Fresh');
  const launcher = path.join(game.gameDir, 'Launcher');
  fs.mkdirSync(launcher);
  fs.writeFileSync(path.join(launcher, 'steam_appid.txt'), '999');

  const summary = await goldberg.repair({ steamSettings: game.steamSettings, appid: '3751260', schema: SCHEMA, writeDlc: false, writeMain: false, launchDirs: [game.gameDir, launcher] });
  assert.deepEqual(summary.launchAppIds, [path.join(game.gameDir, 'steam_appid.txt')]);
  assert.equal(fs.readFileSync(path.join(game.gameDir, 'steam_appid.txt'), 'utf8'), '3751260');
  assert.equal(fs.readFileSync(path.join(launcher, 'steam_appid.txt'), 'utf8'), '999', "somebody else's file is left alone");

  const cleaned = awManagedConfig.strip(game.steamSettings, { includeIdentity: false });
  assert.ok(cleaned.removed.some((entry) => entry.file === path.join(game.gameDir, 'steam_appid.txt')));
  assert.equal(fs.existsSync(path.join(game.gameDir, 'steam_appid.txt')), false, 'taking AW back out removes what it wrote');
  assert.equal(fs.existsSync(path.join(launcher, 'steam_appid.txt')), true);
});

test('a dll folder without an exe gets no extra file', async () => {
  const gameDir = path.join(tmp, 'Unreal');
  const engine = path.join(gameDir, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv153', 'Win64');
  fs.mkdirSync(path.join(engine, 'steam_settings'), { recursive: true });
  fs.writeFileSync(path.join(engine, 'steam_api64.dll'), 'emu');
  const summary = await goldberg.repair({ steamSettings: path.join(engine, 'steam_settings'), appid: '3751260', schema: SCHEMA, writeDlc: false, writeMain: false });
  assert.deepEqual(summary.launchAppIds, []);
  assert.equal(fs.existsSync(path.join(engine, 'steam_appid.txt')), false);
});
