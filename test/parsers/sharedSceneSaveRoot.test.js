'use strict';

/*
  %PUBLIC%\Documents\Steam holds the CODEX/RUNE saves of every scene game at once. Added as a folder,
  it was taken for the install folder of each of them: "Fix all" then wrote six games' GBE settings
  into it one after the other, and seeded GSE saves that replaced the CODEX ones (Dark Souls III
  under Wine, 2026-10-24). It is a save root, never a game's folder.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const saveRoots = require('../../app/parser/saveRoots.js');
const userDir = require('../../app/parser/userDir.js');
const goldberg = require('../../app/parser/goldberg.js');

function prefixWithCodexSave(appid) {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shared-root-'));
  const documents = path.join(prefix, 'drive_c', 'users', 'Public', 'Documents');
  const save = path.join(documents, 'Steam', 'CODEX', appid);
  fs.mkdirSync(save, { recursive: true });
  fs.writeFileSync(path.join(save, 'achievements.ini'), '[SteamAchievements]\nCount=0\n');
  return { prefix, documents, steamRoot: path.join(documents, 'Steam'), save };
}

test('a profile Documents or Documents\\Steam folder is a shared save root, a game folder is not', () => {
  assert.equal(saveRoots.isSharedSaveRoot('C:\\Users\\Public\\Documents\\Steam'), true);
  assert.equal(saveRoots.isSharedSaveRoot('C:\\Users\\Public\\Documents'), true);
  assert.equal(saveRoots.isSharedSaveRoot('C:\\Users\\Bob\\OneDrive\\Documents\\Steam\\'), true);
  assert.equal(saveRoots.isSharedSaveRoot('/home/bob/.wine/drive_c/users/Public/Documents/Steam'), true);
  assert.equal(saveRoots.isSharedSaveRoot('C:\\Users\\Bob\\AppData\\Roaming\\Steam'), true);
  assert.equal(saveRoots.isSharedSaveRoot('C:\\Users\\Bob\\Documents\\Games\\Dark Souls III'), false);
  assert.equal(saveRoots.isSharedSaveRoot('/home/bob/Games/Dark Souls 3/Game'), false);
  assert.equal(saveRoots.isSharedSaveRoot('D:\\Games\\Steam'), false);
  assert.equal(saveRoots.isSharedSaveRoot(''), false);
});

test('a CODEX save found by adding Documents\\Steam keeps its save and gets no install folder', async () => {
  const { prefix, steamRoot, save } = prefixWithCodexSave('374320');
  try {
    const records = await userDir.scan(steamRoot);
    const ds3 = records.find((record) => record.appid === '374320');
    assert.ok(ds3, 'the CODEX save is still discovered');
    assert.equal(path.resolve(ds3.data.path), path.resolve(save));
    assert.equal(ds3.data.gameDir, undefined);
  } finally {
    fs.rmSync(prefix, { recursive: true, force: true });
  }
});

test('adding the whole Documents folder does not make Documents\\Steam an install either', async () => {
  const { prefix, documents } = prefixWithCodexSave('374320');
  try {
    const records = await userDir.scan(documents);
    for (const record of records) assert.equal(record.data.gameDir, undefined, `${record.appid} got an install folder`);
  } finally {
    fs.rmSync(prefix, { recursive: true, force: true });
  }
});

test('GBE files left in Documents\\Steam by an older fix do not make it an install', () => {
  const { prefix, steamRoot } = prefixWithCodexSave('374320');
  try {
    fs.mkdirSync(path.join(steamRoot, 'steam_settings'), { recursive: true });
    fs.writeFileSync(path.join(steamRoot, 'steam_settings', 'steam_appid.txt'), '374320');
    fs.writeFileSync(path.join(steamRoot, 'steam_api64.dll'), 'MZ');
    const found = goldberg.findCompatibleGames([steamRoot]);
    assert.deepEqual(found.map((g) => g.gameDir), []);
  } finally {
    fs.rmSync(prefix, { recursive: true, force: true });
  }
});

test('a GSE save with nothing unlocked never replaces a CODEX folder, one with unlocks does', () => {
  const steam = require('../../app/parser/steam.js');
  const { prefix, save: codex } = prefixWithCodexSave('374320');
  try {
    const gse = path.join(prefix, 'GSE Saves', '374320');
    fs.mkdirSync(gse, { recursive: true });
    const write = (earned) => fs.writeFileSync(path.join(gse, 'achievements.json'), JSON.stringify({ A: { earned, earned_time: earned ? 1 : 0 }, B: { earned: false } }));
    write(false);
    assert.equal(steam.goldbergSaveWins(gse, codex), false);
    write(true);
    assert.equal(steam.goldbergSaveWins(gse, codex), true);
    assert.equal(steam.goldbergSaveWins(codex, gse), false);
  } finally {
    fs.rmSync(prefix, { recursive: true, force: true });
  }
});
