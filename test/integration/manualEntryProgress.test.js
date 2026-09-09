'use strict';

/*
  A game added by hand used to be the one card that could never show progress. The entry carried a
  Steam AppID, the schema loaded, the health panel went green on every row - and the unlock reader
  answered an empty object for it, unconditionally, so a finished playthrough still read 0%.

  Reported on cs.rin.ru for a RUNE release of Little Nightmares Enhanced Edition, whose save sits in
  %PUBLIC%\Documents\Steam\RUNE\<appid> like every other Steam-emulator save AW already reads.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-manual-progress-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const achievements = require('../../app/parser/achievements.js');
Module._load = originalLoad;

achievements.initDebug({ isDev: false, userDataPath: userData });
const { adoptManualSaveSources, readRecordUnlocks, NO_RECORD_TO_READ } = achievements._internal;

// What a RUNE release writes: a header section the reader skips, then one section per achievement.
function runeSave(appid) {
  const dir = path.join(tmp, 'Public', 'Documents', 'Steam', 'RUNE', String(appid));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'achievements.ini'),
    ['[SteamAchievements]', 'Count=2', '', '[ACH_CHAPTER_1]', 'Achieved=1', 'UnlockTime=1788805584', '', '[ACH_CHAPTER_2]', 'Achieved=1', 'UnlockTime=1788809999', ''].join('\n')
  );
  return dir;
}

const OPTION = { achievement: { lang: 'english', showHidden: false } };
const HELPERS = { readUplayR2Save: () => ({}), warnEmptyAchievementFileOnce: () => {} };
const SCHEMA = { achievement: { list: [{ name: 'ACH_CHAPTER_1' }, { name: 'ACH_CHAPTER_2' }], total: 2, unlocked: 0 } };

test('a manual entry reads the emulator save discovered under its Steam AppID', async () => {
  const saveDir = runeSave(2149010);
  const manual = {
    appid: 'manual-47da0fa53172',
    name: 'Little Nightmares Enhanced Edition',
    source: 'Manual',
    steamappid: '2149010',
    data: { type: 'manual', gameDir: path.join(tmp, 'game'), exe: path.join(tmp, 'game', 'lne.exe'), platform: 'PC', storeAppId: '2149010' },
  };
  const data = [{ appid: '2149010', source: 'Rune', data: { type: 'file', path: saveDir } }, manual];

  const adopted = adoptManualSaveSources(data, manual, '2149010');
  assert.equal(adopted.length, 1);

  // The card's reader is the manual record's, and it has to reach the save the entry took over.
  const unlocks = await readRecordUnlocks('manual', adopted[0], SCHEMA, OPTION, HELPERS);
  assert.notEqual(unlocks, NO_RECORD_TO_READ);
  assert.deepEqual(Object.keys(unlocks).sort(), ['ACH_CHAPTER_1', 'ACH_CHAPTER_2']);
  assert.equal(unlocks.ACH_CHAPTER_1.Achieved, '1');
});

test('the manual record itself has nothing to read and says so without failing', async () => {
  const manual = {
    appid: 'manual-deadbeef0000',
    name: 'Some Console Game',
    source: 'Manual',
    data: { type: 'manual', gameDir: path.join(tmp, 'other'), exe: path.join(tmp, 'other', 'game.exe'), platform: 'PlayStation', storeAppId: '' },
  };

  assert.equal(await readRecordUnlocks('manual', manual, SCHEMA, OPTION, HELPERS), NO_RECORD_TO_READ);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
