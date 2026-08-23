'use strict';

/*
  DARKSiDERS/Hoodlum/Skidrow builds configured with UserDataFolder=mydocs store their unlocks under
  <Documents>\<UserName>\<AppId>\SteamEmu[\UserStats]. This branch referenced an `ffs` helper that
  was never imported, so the whole userDir scan of such a folder threw and returned nothing.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-mydocs-'));
const documents = path.join(tmp, 'Documents');
fs.mkdirSync(documents, { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request.endsWith('util/reg') || request.endsWith('util\\reg')) {
    return { readRegistryStringAndExpand: () => documents };
  }
  return originalLoad.apply(this, arguments);
};
const modulePath = require.resolve('../../app/parser/userDir.js');
delete require.cache[modulePath];
const userDir = require(modulePath);
Module._load = originalLoad;
delete require.cache[modulePath];

function writeGame(name, iniName, appid) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, iniName), `[GameSettings]\nUserDataFolder=mydocs\nAppId=${appid}\nUserName=Player\n`);
  return dir;
}

test('a mydocs ds.ini resolves into the Documents SteamEmu tree', async () => {
  const gameDir = writeGame('ds-mydocs', 'ds.ini', '228300');
  const saveDir = path.join(documents, 'Player', '228300', 'SteamEmu', 'UserStats');
  fs.mkdirSync(saveDir, { recursive: true });

  const result = await userDir.scan(gameDir);
  assert.equal(result.length, 1);
  assert.equal(result[0].appid, '228300');
  assert.equal(result[0].source, 'DARKSiDERS');
  assert.equal(result[0].data.path, saveDir);
});

test('without a UserStats folder the SteamEmu folder itself is used', async () => {
  const gameDir = writeGame('hlm-mydocs', 'hlm.ini', '311210');
  const result = await userDir.scan(gameDir);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'Hoodlum');
  assert.equal(result[0].data.path, path.join(documents, 'Player', '311210', 'SteamEmu'));
});

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
