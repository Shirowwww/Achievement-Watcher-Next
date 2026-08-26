'use strict';

/*
  A game served by a crack loader that supplies its own Steam emulation (ALI213, OnlineFix, TENOKE,
  SmartSteamEmu, ...) never reads a Goldberg steam_settings folder. AW Next used to write one there
  anyway, and the empty achievement list among those files then read as a fault against the game.

  Nothing writes them any more. This is the other half: taking back the ones already on disk. It is a
  deletion inside somebody's game folder, so the bar is that EVERY entry is provably one AW Next
  wrote and provably carries nothing. Anything else and the folder is left exactly as it is.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-inert-user-'));
const achievements = require('../../app/parser/achievements.js');
Module._load = originalLoad;

achievements.initDebug({ isDev: false, userDataPath: userData });
const { removeInertGoldbergSettings, declaredEmulatorAppid } = achievements._internal;

const AW_CONFIG = ['[app::dlcs]', '; Managed by AW Next - enable all DLCs for this game.', 'unlock_all=1', ''].join('\n');
// goldberg.js upserts into these two rather than owning them, so neither carries an authorship
// comment. They are recognised by their contents instead - these are byte-for-byte what it writes.
const AW_MAIN = ['[main::general]', 'new_app_ticket=1', 'gc_token=1', '', '[main::stats]', 'stat_achievement_progress_functionality=1', 'save_only_higher_stat_achievement_progress=1', ''].join('\n');
const AW_USER = ['[user::general]', 'account_name=Shirow', 'language=french', ''].join('\n');

function settingsFolder(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-settings-'));
  for (const [name, content] of Object.entries(entries)) {
    const full = path.join(dir, name);
    if (content === null) fs.mkdirSync(full, { recursive: true });
    else fs.writeFileSync(full, content);
  }
  return dir;
}

test('the folder AW Next left behind is taken back', () => {
  // Exactly what a ZOMBI install carried: an empty achievement list, AW Next's three config files
  // and the empty images folder that goes with them.
  const dir = settingsFolder({
    'achievements.json': '[]',
    'configs.app.ini': AW_CONFIG,
    'configs.main.ini': AW_MAIN,
    'configs.user.ini': AW_USER,
    images: null,
  });
  assert.equal(removeInertGoldbergSettings(dir, '339230', 'ALI213'), true);
  assert.equal(fs.existsSync(dir), false);
});

test('a folder holding anything at all is never touched', () => {
  const cases = {
    'a real achievement list': { 'achievements.json': '[{"name":"OUTBREAK"}]', 'configs.app.ini': AW_CONFIG },
    'a file AW Next did not write': { 'achievements.json': '[]', 'steam_appid.txt': '339230' },
    // A setting AW Next never writes. Note the counter-case: a config holding ONLY keys it does
    // write is indistinguishable from one it wrote, and is treated as its own.
    'a config somebody else wrote': { 'achievements.json': '[]', 'configs.app.ini': '[app::general]\nsteam_appid=339230\n' },
    'downloaded achievement icons': { 'achievements.json': '[]', images: null },
    'an unreadable achievement list': { 'achievements.json': '{ not json', 'configs.app.ini': AW_CONFIG },
  };
  for (const [label, entries] of Object.entries(cases)) {
    const dir = settingsFolder(entries);
    if (label === 'downloaded achievement icons') fs.writeFileSync(path.join(dir, 'images', '1.png'), 'png');
    assert.equal(removeInertGoldbergSettings(dir, '339230', 'ALI213'), false, label);
    assert.equal(fs.existsSync(dir), true, `${label}: the folder must survive`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a config carrying one setting AW Next did not write keeps the whole folder', () => {
  /*
    configs.main.ini and configs.user.ini have no authorship comment because goldberg.js upserts into
    them: whatever was there before survives. So a single foreign key is enough to prove the file is
    not AW Next's to delete, and the folder around it stays.
  */
  const foreign = settingsFolder({
    'achievements.json': '[]',
    'configs.app.ini': AW_CONFIG,
    'configs.main.ini': `${AW_MAIN}offline=1\n`,
    'configs.user.ini': AW_USER,
  });
  assert.equal(removeInertGoldbergSettings(foreign, '339230', 'ALI213'), false);
  assert.equal(fs.existsSync(foreign), true);
  fs.rmSync(foreign, { recursive: true, force: true });

  // A section nobody here writes counts the same way.
  const section = settingsFolder({ 'achievements.json': '[]', 'configs.main.ini': `${AW_MAIN}\n[main::connectivity]\n` });
  assert.equal(removeInertGoldbergSettings(section, '339230', 'ALI213'), false);
  fs.rmSync(section, { recursive: true, force: true });
});

test('an empty or absent folder is not something to remove', () => {
  // Nothing to take back, and an empty folder can be one another tool is about to fill.
  const empty = settingsFolder({});
  assert.equal(removeInertGoldbergSettings(empty, '339230', 'ALI213'), false);
  assert.equal(fs.existsSync(empty), true);
  assert.equal(removeInertGoldbergSettings(path.join(empty, 'nope'), '339230', 'ALI213'), false);
  fs.rmSync(empty, { recursive: true, force: true });
});

/*
  The other half of removing that folder. An unconfigured install is skipped when the folder carries
  an appid marker, and a steam_settings directory counted as one - so taking the folder away turned a
  game the library already had under its real AppID into a second, synthetic "local-..." card.

  A crack loader states the AppID it emulates in its own config, which identifies the folder just as
  well. Using it means the entry merges with the real one instead of doubling it, and a folder that
  says nothing still gets its synthetic id rather than disappearing.
*/
test('a folder whose emulator config names an AppID is not an unidentified install', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-declared-'));
  const entries = () => fs.readdirSync(dir, { withFileTypes: true });

  fs.writeFileSync(path.join(dir, 'ZOMBI.exe'), 'MZ');
  assert.equal(declaredEmulatorAppid(dir, entries()), '', 'a folder that says nothing keeps its synthetic id');

  const ini = (name, lines) => fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');

  ini('ALI213.ini', ['[Settings]', ';a comment', 'AppID = 339230', 'PlayerName = Player']);
  assert.equal(declaredEmulatorAppid(dir, entries()), '339230');

  fs.rmSync(path.join(dir, 'ALI213.ini'));
  ini('steam_emu.ini', ['[Settings]', 'AppId=730']);
  assert.equal(declaredEmulatorAppid(dir, entries()), '730', 'the scene inis spell it their own way');

  ini('steam_emu.ini', ['[Settings]', 'AppId=0']);
  assert.equal(declaredEmulatorAppid(dir, entries()), '', 'zero is not an AppID');

  ini('steam_emu.ini', ['[Settings]', '; AppId=730']);
  assert.equal(declaredEmulatorAppid(dir, entries()), '', 'a commented-out value states nothing');

  fs.rmSync(dir, { recursive: true, force: true });
});

test.after(() => fs.rmSync(userData, { recursive: true, force: true }));
