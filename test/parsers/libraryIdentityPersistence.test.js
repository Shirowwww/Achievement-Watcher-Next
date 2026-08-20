'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-identity-'));
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) {
    return { app: { getPath: () => userData } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');
const gameIndex = require('../../app/parser/gameIndex.js');
Module._load = originalLoad;

test('library reconstruction prefers the shared last-known identity over executable fallback data', () => {
  try {
    gameIndex.upsert({ appid: '1174180', name: 'Red Dead Redemption 2', binary: 'RDR2.exe' });

    const name = achievements._internal.resolveLocalGameName({
      appid: '1174180',
      name: 'RDR2',
      data: { gameDir: path.join('D:', 'Games', 'RDR2') },
    });

    assert.equal(name, 'Red Dead Redemption 2');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
