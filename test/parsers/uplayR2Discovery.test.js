'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcRenderer: {
        sendSync: () => false,
        invoke: async () => null,
      },
    };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');
const libraryDirs = require('../../app/parser/libraryDirs.js');
const steam = require('../../app/parser/steam.js');

test('Ubisoft install without Steam markers is promoted through the Uplay R2 mapping', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplayr2-discovery-user-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplayr2-discovery-root-'));
  const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplayr2-discovery-env-'));
  const gameDir = path.join(root, 'Completely Unrelated Repack Folder');
  const oldEnv = {
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    PUBLIC: process.env.PUBLIC,
    PROGRAMDATA: process.env.PROGRAMDATA,
  };

  process.env.APPDATA = path.join(envRoot, 'AppData');
  process.env.LOCALAPPDATA = path.join(envRoot, 'LocalAppData');
  process.env.PUBLIC = path.join(envRoot, 'Public');
  process.env.PROGRAMDATA = path.join(envRoot, 'ProgramData');

  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'ACBlackFlag.exe'), Buffer.alloc(1024, 1));
  fs.writeFileSync(path.join(gameDir, 'uplay_install.manifest'), '{}');
  fs.writeFileSync(
    path.join(gameDir, 'uplay_install.state'),
    Buffer.concat([Buffer.from([0x0a, 0x24]), Buffer.from("Assassin's Creed Black Flag Resynced"), Buffer.from([0x10, 0x01])])
  );
  fs.writeFileSync(path.join(gameDir, 'upc_r2_loader64.dll'), Buffer.alloc(1024, 2));
  fs.writeFileSync(path.join(gameDir, 'upc_r2.ini'), '[Settings]\nAchievements = 0\n');

  achievements.initDebug({ isDev: false, userDataPath: userData });
  await libraryDirs.save([root]);
  // Keep the scan isolated to the sandbox: the automatic smart-find (libraryDirs.find) would
  // otherwise merge the developer machine's real game libraries into this discovery run.
  const originalFind = libraryDirs.find;
  const originalFindAppidByName = steam.findAppidByName;
  libraryDirs.find = async () => [];
  steam.findAppidByName = async (name) => (name === 'Catalog Only Ubisoft Game' ? '7654321' : null);

  const catalogGameDir = path.join(root, 'Catalog Only Ubisoft Game');
  fs.mkdirSync(catalogGameDir, { recursive: true });
  fs.writeFileSync(path.join(catalogGameDir, 'CatalogGame.exe'), Buffer.alloc(1024, 1));
  fs.writeFileSync(path.join(catalogGameDir, 'uplay_install.manifest'), '{}');
  fs.writeFileSync(path.join(catalogGameDir, 'upc_r2_loader64.dll'), Buffer.alloc(1024, 2));
  fs.writeFileSync(path.join(catalogGameDir, 'upc_r2.ini'), '[Settings]\nAchievements = 0\n');

  t.after(() => {
    Module._load = originalLoad;
    libraryDirs.find = originalFind;
    steam.findAppidByName = originalFindAppidByName;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(envRoot, { recursive: true, force: true });
  });

  const found = await achievements.detectInstalledAppids({
    achievement_source: { steamEmu: true },
    steam: { main: null },
  });

  assert.ok(found.includes('3751950'), 'the renamed Ubisoft install should use its internal title and mapped Steam AppID');
  assert.ok(found.includes('7654321'), 'a game absent from uplay-steam.json should reuse the existing automatic Steam catalog resolver');
  assert.ok(!found.some((appid) => appid.startsWith('local-')), 'the mapped install must not remain a local fallback entry');
});

/*
  A Ubisoft product can be known AND have no Steam release: Rayman 3, the Settlers History Editions,
  Might & Magic VIII and IX, Prince of Persia, the Discovery Tours. The shipped table records that
  with an empty AppID, which the discovery read as if it were a Steam AppID - so the save folder
  produced a card whose appid was the literal string "null" and whose name was nothing at all.
*/
test('a Ubisoft product with no Steam release keeps its own identity instead of becoming "null"', async () => {
  const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-nosteam-'));
  const oldAppData = process.env.APPDATA;
  process.env.APPDATA = path.join(envRoot, 'AppData');

  const save = (root, id) => {
    const dir = path.join(process.env.APPDATA, root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'achievements.json'), JSON.stringify({ 1: { earned: true } }));
  };
  save('Goldberg UplayEmu Saves', '276'); // Prince of Persia - no Steam release
  save('Goldberg UplayEmu Saves', '4740'); // Avatar - has one
  save('R1 UplayEmu Saves', '3088'); // South Park - has one, R1 generation

  try {
    const found = (await steam.scan()).filter((game) => String(game.source || '').includes('Uplay'));
    const byAppid = new Map(found.map((game) => [String(game.appid), game]));

    const orphan = byAppid.get('uplay-276');
    assert.ok(orphan, 'the product must still be discovered, under its Ubisoft identity');
    assert.equal(orphan.name, 'Prince of Persia', 'the Ubisoft title is the only name it has');
    assert.equal(orphan.data.uplayId, '276', 'the product id still names the folder to watch');

    assert.equal(byAppid.has('null'), false, 'no card may ever be built on the string "null"');
    assert.equal(
      found.every((game) => game.name),
      true,
      'every discovered Uplay game must have a name'
    );

    // The products that DO have a Steam release are untouched by the branch above.
    assert.equal(byAppid.get('2840770') && byAppid.get('2840770').data.uplayId, '4740');
    assert.equal(byAppid.get('488790') && byAppid.get('488790').data.uplayId, '3088');
  } finally {
    if (oldAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = oldAppData;
    fs.rmSync(envRoot, { recursive: true, force: true });
  }
});
