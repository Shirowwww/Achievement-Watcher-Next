'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { isInsideAnyFolder } = require('../../app/parser/steamLibrary.js');
const { dropHiddenLibraryGames } = require('../../app/parser/steam.js');

const external = path.resolve('/drives/external/SteamLibrary');
const main = path.resolve('/steam');

const installs = new Map([
  ['10', { name: 'Kept', gameDir: path.join(main, 'steamapps', 'common', 'Kept') }],
  ['20', { name: 'Stored away', gameDir: path.join(external, 'steamapps', 'common', 'Stored away') }],
]);

const record = (appid) => ({ appid, source: 'Steam (me)', data: { type: 'steamAPI' } });

test('a folder matches the games inside it, never a sibling that only shares its prefix', () => {
  assert.equal(isInsideAnyFolder(path.join(external, 'steamapps', 'common', 'Game'), [external]), true);
  assert.equal(isInsideAnyFolder(external, [external]), true);
  assert.equal(isInsideAnyFolder(`${external}2${path.sep}steamapps`, [external]), false);
  assert.equal(isInsideAnyFolder(path.join(main, 'steamapps'), [external]), false);
  assert.equal(isInsideAnyFolder('', [external]), false);
  assert.equal(isInsideAnyFolder(path.join(external, 'x'), []), false);
});

test('Windows folders match whatever their case or trailing separator', () => {
  assert.equal(isInsideAnyFolder('E:\\SteamLibrary\\steamapps\\common\\Game', ['e:\\steamlibrary\\'], 'win32'), true);
  assert.equal(isInsideAnyFolder('E:\\SteamLibrary2\\steamapps', ['E:\\SteamLibrary'], 'win32'), false);
});

test('games installed in a hidden Steam library leave the list, the others stay', () => {
  const { kept, hidden } = dropHiddenLibraryGames([record('10'), record('20'), record('30')], installs, [external]);

  assert.deepEqual(
    kept.map((r) => r.appid),
    ['10', '30']
  );
  assert.deepEqual([...hidden], ['20']);
});

test('no hidden library keeps every game', () => {
  const records = [record('10'), record('20')];
  const { kept, hidden } = dropHiddenLibraryGames(records, installs, []);

  assert.equal(kept.length, 2);
  assert.equal(hidden.size, 0);
});
