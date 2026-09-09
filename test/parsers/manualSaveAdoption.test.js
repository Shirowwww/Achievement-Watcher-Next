'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
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

const { adoptManualSaveSources } = achievements._internal;

function manualRecord(storeAppId) {
  return {
    appid: 'manual-47da0fa53172',
    name: 'Little Nightmares Enhanced Edition',
    source: 'Manual',
    steamappid: storeAppId || undefined,
    data: {
      type: 'manual',
      gameDir: 'D:\\Games\\Little Nightmares',
      exe: 'D:\\Games\\Little Nightmares\\Little_Nightmares_Enhanced.exe',
      exeAuthoritative: true,
      platform: 'PC',
      storeAppId: storeAppId || '',
    },
  };
}

test('a manual entry takes over the emulator save folders found under its Steam AppID', () => {
  const manual = manualRecord('2149010');
  const data = [
    { appid: '2149010', source: 'Rune', data: { type: 'file', path: 'C:\\Users\\Public\\Documents\\Steam\\RUNE\\2149010' } },
    { appid: '480', source: 'Goldberg', data: { type: 'file', path: 'C:\\saves\\480' } },
    manual,
  ];

  const adopted = adoptManualSaveSources(data, manual, '2149010');

  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].appid, 'manual-47da0fa53172');
  assert.equal(adopted[0].steamappid, '2149010');
  assert.equal(adopted[0].data.path, 'C:\\Users\\Public\\Documents\\Steam\\RUNE\\2149010');
  assert.equal(adopted[0].source, 'Rune');
  // The card the save folder used to produce on its own is gone, so the library shows one game.
  assert.deepEqual(
    data.map((record) => String(record.appid)),
    ['480', 'manual-47da0fa53172', 'manual-47da0fa53172']
  );
  // The manual record stays the first one seen, so it keeps deciding the card's identity.
  assert.equal(data[1], manual);
});

test('every save source of one AppID is taken over, not just the first', () => {
  const manual = manualRecord('2149010');
  const data = [
    { appid: '2149010', source: 'Rune', data: { type: 'file', path: 'C:\\Public\\RUNE\\2149010' } },
    { appid: '2149010', source: 'Goldberg', data: { type: 'file', path: 'C:\\GSE Saves\\2149010' } },
    { appid: '2149010', source: 'OnlineFix', data: { type: 'file', path: 'C:\\Public\\OnlineFix\\2149010' } },
    manual,
  ];

  const adopted = adoptManualSaveSources(data, manual, '2149010');

  assert.deepEqual(
    adopted.map((record) => record.data.path),
    ['C:\\Public\\RUNE\\2149010', 'C:\\GSE Saves\\2149010', 'C:\\Public\\OnlineFix\\2149010']
  );
  assert.equal(data.length, 4);
  assert.ok(data.every((record) => String(record.appid) === 'manual-47da0fa53172'));
});

test('records answering to a reader of their own keep their identity', () => {
  const manual = manualRecord('2149010');
  const official = { appid: '2149010', source: 'Steam', data: { type: 'steamAPI', userID: '7656', cachePath: 'C:\\cache' } };
  const gog = { appid: '2149010', source: 'GOG', data: { type: 'gogOfficial', title: 'Little Nightmares' } };
  const uplay = { appid: '2149010', source: 'Goldberg Uplay', data: { type: 'uplayR2', path: 'C:\\Uplay\\2149010' } };
  const greenluma = { appid: '2149010', source: 'Steam', data: { type: 'reg', root: 'HKCU', path: 'Software/AW' } };
  const data = [official, gog, uplay, greenluma, manual];

  assert.deepEqual(adoptManualSaveSources(data, manual, '2149010'), []);
  assert.deepEqual(data, [official, gog, uplay, greenluma, manual]);
});

test('nothing is taken over without a numeric Steam AppID', () => {
  const manual = manualRecord('');
  const save = { appid: '2149010', source: 'Rune', data: { type: 'file', path: 'C:\\Public\\RUNE\\2149010' } };
  const data = [save, manual];

  assert.deepEqual(adoptManualSaveSources(data, manual, ''), []);
  assert.deepEqual(adoptManualSaveSources(data, manual, 'not-an-appid'), []);
  assert.deepEqual(data, [save, manual]);
});
