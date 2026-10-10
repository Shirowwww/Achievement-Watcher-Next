'use strict';

/*
  Issue #123. The emulator fix pre-created %APPDATA%\Goldberg SteamEmu Saves\<appid> next to
  GSE Saves\<appid>, yet the GBE Fork build it installs never writes to the classic Goldberg folder,
  so that one stayed empty forever. With a save folder set on the Emulator identity card, the
  GSE Saves one stayed empty too: the build writes under the chosen folder instead.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-fix-save-folder-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const achievements = require('../../app/parser/achievements.js');
const goldberg = require('../../app/parser/goldberg.js');
Module._load = originalLoad;

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// %APPDATA%\GSE Saves on Windows; on Linux the same folder in a Wine prefix or the XDG data folder.
const gseSaves = (appid) => goldberg.saveFolderFor('gbe', appid);

test('with no save folder chosen, the fix prepares GSE Saves only', () => {
  const folder = achievements.emulatorFixSaveFolder('480', { savePath: '' });
  assert.equal(folder, gseSaves('480'));
  assert.match(folder, /GSE Saves/);
  if (process.platform === 'win32') assert.equal(folder, path.join(process.env.APPDATA, 'GSE Saves', '480'));
  assert.equal(achievements.emulatorFixSaveFolder('480', undefined), folder);
});

test('with a save folder chosen on the identity card, the fix prepares that one', () => {
  const chosen = path.join(tmp, 'My Saves');
  assert.equal(achievements.emulatorFixSaveFolder('480', { savePath: chosen }), path.join(chosen, '480'));
});

test('a relative save folder is ignored, as the settings loader already does', () => {
  assert.equal(achievements.emulatorFixSaveFolder('480', { savePath: 'saves' }), gseSaves('480'));
});

test('neither fix path pre-creates the classic Goldberg save folder any more', () => {
  const root = path.join(__dirname, '..', '..', 'app');
  for (const file of ['app.js', path.join('parser', 'achievements.js')]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/mkdirSync\([^)]*Goldberg SteamEmu Saves/.test(source), `${file} creates Goldberg SteamEmu Saves`);
    assert.ok(source.includes('emulatorFixSaveFolder('), `${file} goes through emulatorFixSaveFolder`);
  }
});
