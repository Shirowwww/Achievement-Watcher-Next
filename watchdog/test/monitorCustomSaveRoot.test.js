'use strict';

// Issue #123: a GBE save folder chosen in Settings must be watched like GSE Saves, or its unlocks
// would only show after the next library refresh.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const monitor = require('../monitor.js');

const find = (folders, dir) => folders.find((entry) => path.resolve(String(entry.dir || '')).toLowerCase() === path.resolve(dir).toLowerCase());

test('the chosen GBE save folder is watched with the GSE Saves shape', async (t) => {
  if (process.platform !== 'win32' || !process.env.APPDATA) return t.skip('Windows-only watch roots');
  const custom = 'D:\\Games\\Saves';
  const folders = await monitor.getFolders([], { emulator: { savePath: custom } });
  const entry = find(folders, custom);
  const gse = find(folders, path.join(process.env.APPDATA, 'GSE Saves'));
  assert.ok(entry, 'the chosen folder must be watched');
  assert.deepEqual(entry.options, gse.options, 'one folder per appid, the same files as GSE Saves');
});

test('no folder, or a relative one, adds nothing', async (t) => {
  if (process.platform !== 'win32' || !process.env.APPDATA) return t.skip('Windows-only watch roots');
  const base = (await monitor.getFolders([])).length;
  assert.equal((await monitor.getFolders([], { emulator: { savePath: '' } })).length, base);
  assert.equal((await monitor.getFolders([], { emulator: { savePath: 'saves' } })).length, base);
  assert.equal((await monitor.getFolders([], {})).length, base);
});

test('GBE GseSavePath set for the session is watched with the GSE Saves shape', async (t) => {
  const saves = path.resolve(path.sep, 'gse-session-saves');
  const before = process.env.GseSavePath;
  process.env.GseSavePath = saves;
  t.after(() => {
    if (before === undefined) delete process.env.GseSavePath;
    else process.env.GseSavePath = before;
  });
  const entry = find(await monitor.getFolders([]), saves);
  assert.ok(entry, 'the GseSavePath folder must be watched');
  assert.equal(entry.options.recursive, true);
});
