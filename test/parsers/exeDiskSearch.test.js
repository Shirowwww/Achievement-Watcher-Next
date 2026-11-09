'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const exeDiskSearch = require('../../app/parser/exeDiskSearch.js');

function touch(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
}

const sorted = (found) => found.map((entry) => entry.full).sort();

test('the files asked for are found by name, wherever they sit and whatever their case', async () => {
  const root = makeTempDir('aw-disk-');
  touch(path.join(root, 'Games', 'Codename', 'bin', 'CDX_Win64.exe'));
  touch(path.join(root, 'Downloads', 'Other', 'cdx_win64.exe'));
  touch(path.join(root, 'Games', 'Codename', 'Unrelated.exe'));

  const result = await exeDiskSearch.findByName(['cdx_win64.exe'], { roots: [root] });
  assert.equal(result.truncated, false);
  assert.deepEqual(sorted(result.found), [path.join(root, 'Downloads', 'Other', 'cdx_win64.exe'), path.join(root, 'Games', 'Codename', 'bin', 'CDX_Win64.exe')].sort());
});

test('system, profile data, crack and backup folders are never entered', async () => {
  const root = makeTempDir('aw-disk-skip-');
  for (const folder of ['Windows', 'AppData', '$Recycle.Bin', 'Crack', 'Original Files', 'node_modules']) {
    touch(path.join(root, folder, 'Game', 'target.exe'));
  }
  touch(path.join(root, 'Kept', 'target.exe'));
  const result = await exeDiskSearch.findByName(['target.exe'], { roots: [root] });
  assert.deepEqual(sorted(result.found), [path.join(root, 'Kept', 'target.exe')]);
});

test('a junction or link is never followed', async () => {
  const root = makeTempDir('aw-disk-link-');
  const outside = makeTempDir('aw-disk-outside-');
  touch(path.join(outside, 'target.exe'));
  try {
    fs.symlinkSync(outside, path.join(root, 'link'), 'junction');
  } catch {
    return; // no right to create links here: nothing to check
  }
  const result = await exeDiskSearch.findByName(['target.exe'], { roots: [root] });
  assert.deepEqual(result.found, []);
});

test('a search past its budget says so', async () => {
  const root = makeTempDir('aw-disk-budget-');
  for (let i = 0; i < 5; i++) touch(path.join(root, `folder${i}`, 'nested', 'target.exe'));
  const result = await exeDiskSearch.findByName(['target.exe'], { roots: [root], maxDirectories: 3 });
  assert.equal(result.truncated, true);
});

test('a folderless game gets the one match exeDetect confirms, and nothing when two are confirmed', async () => {
  const solo = { appid: '1', name: 'Solo' };
  const twice = { appid: '2', name: 'Twice' };
  const generic = { appid: '3', name: 'Generic' };
  const hints = { 1: ['solo.exe'], 2: ['twice.exe'], 3: ['game.exe'] };
  const asked = [];
  const result = await exeDiskSearch.findForFolderlessGames([solo, twice, generic], {
    hintsFor: (game) => hints[game.appid],
    isGeneric: (name) => name === 'game.exe',
    search: async (names) => {
      asked.push(...names);
      return {
        found: [
          { name: 'Solo.exe', full: 'D:\\Games\\Solo\\Solo.exe' },
          { name: 'solo.exe', full: 'E:\\Backup\\solo.exe' },
          { name: 'twice.exe', full: 'D:\\A\\twice.exe' },
          { name: 'twice.exe', full: 'D:\\B\\twice.exe' },
        ],
        truncated: false,
      };
    },
    confirm: (game, exe) => (exe.startsWith('E:') ? '' : exe.replace(/\\[^\\]+$/, '')),
  });
  assert.deepEqual(asked.sort(), ['solo.exe', 'twice.exe']);
  assert.deepEqual(result.assigned, [{ game: solo, exe: 'D:\\Games\\Solo\\Solo.exe', gameDir: 'D:\\Games\\Solo' }]);
});

test('a file two games both confirm goes to neither', async () => {
  const demo = { appid: '10', name: 'Shared Demo' };
  const full = { appid: '11', name: 'Shared' };
  const result = await exeDiskSearch.findForFolderlessGames([demo, full], {
    hintsFor: () => ['shared.exe'],
    search: async () => ({ found: [{ name: 'shared.exe', full: 'D:\\Shared\\shared.exe' }], truncated: false }),
    confirm: () => 'D:\\Shared',
  });
  assert.deepEqual(result.assigned, []);
});

test('a listing that never answers ends the search as cut, at the time limit', async () => {
  const realReaddir = fs.promises.readdir;
  fs.promises.readdir = () => new Promise(() => {});
  try {
    const result = await exeDiskSearch.findByName(['target.exe'], { roots: ['X:\\offline'], timeLimitMs: 50 });
    assert.deepEqual(result, { found: [], truncated: true });
  } finally {
    fs.promises.readdir = realReaddir;
  }
});

test('a cut search assigns nothing', async () => {
  const result = await exeDiskSearch.findForFolderlessGames([{ appid: '1' }], {
    hintsFor: () => ['solo.exe'],
    search: async () => ({ found: [{ name: 'solo.exe', full: 'D:\\solo.exe' }], truncated: true }),
    confirm: () => 'D:\\',
  });
  assert.deepEqual(result, { assigned: [], truncated: true });
});

test('nothing asked, nothing walked', async () => {
  const result = await exeDiskSearch.findByName([], { roots: [makeTempDir('aw-disk-empty-')] });
  assert.deepEqual(result, { found: [], truncated: false });
});
