'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const userData = makeTempDir('aw-exelist-');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron' || request === '@electron/remote') {
    return { app: { getPath: () => userData } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const exeList = require('../../app/parser/exeList.js');
const { peBytes } = require('../helpers/fakePe.js');

function writeBytes(file, size = 128) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, peBytes(size));
}

function tmpGame(name) {
  return makeTempDir(`aw-list-${name}-`);
}

test('reconcile pre-fills confident installs and creates empty entries for ambiguous ones', async () => {
  const confidentDir = tmpGame('confident');
  writeBytes(path.join(confidentDir, 'OnlyGame.exe'));

  const ambiguousDir = tmpGame('ambiguous');
  writeBytes(path.join(ambiguousDir, 'Foo.exe'));
  writeBytes(path.join(ambiguousDir, 'Bar.exe'));

  const changed = await exeList.reconcile([
    { appid: '1001', name: 'Only Game', gameDir: confidentDir },
    { appid: '1002', name: 'Ambiguous Game', gameDir: ambiguousDir },
  ]);
  assert.ok(changed >= 2);

  const list = await exeList.list();
  const confident = list.find((e) => String(e.appid) === '1001');
  const ambiguous = list.find((e) => String(e.appid) === '1002');
  assert.ok(confident);
  assert.strictEqual(confident.exe, path.join(confidentDir, 'OnlyGame.exe'));
  assert.ok(ambiguous);
  assert.strictEqual(ambiguous.exe, '');
});

test('reconcile trusts a launcher-provided exe even without a gameDir', async () => {
  const exePath = path.join(tmpGame('authoritative'), 'LauncherKnown.exe');
  writeBytes(exePath);

  await exeList.reconcile([
    { appid: '2001', name: 'Epic Game', exe: exePath, exeConfident: true },
  ]);

  const list = await exeList.list();
  const entry = list.find((e) => String(e.appid) === '2001');
  assert.ok(entry);
  assert.strictEqual(entry.exe, exePath);
});

test('reconcile never overwrites a manually configured exe', async () => {
  const manualExe = path.join(tmpGame('manual'), 'ManualChoice.exe');
  writeBytes(manualExe);
  await exeList.add({ appid: '3001', exe: manualExe, args: '-windowed' });

  const detectedDir = tmpGame('detected');
  writeBytes(path.join(detectedDir, 'AutoDetected.exe'));

  await exeList.reconcile([
    { appid: '3001', name: 'Manual Game', gameDir: detectedDir },
  ]);

  const list = await exeList.list();
  const entry = list.find((e) => String(e.appid) === '3001');
  assert.ok(entry);
  assert.strictEqual(entry.exe, manualExe);
  assert.strictEqual(entry.args, '-windowed');
});

test('two additions started together both reach the file', async () => {
  const first = path.join(tmpGame('together-a'), 'A.exe');
  const second = path.join(tmpGame('together-b'), 'B.exe');
  await Promise.all([exeList.add({ appid: '4001', exe: first, args: '' }), exeList.add({ appid: '4002', exe: second, args: '' })]);
  const list = await exeList.list();
  assert.equal(list.find((e) => String(e.appid) === '4001').exe, first);
  assert.equal(list.find((e) => String(e.appid) === '4002').exe, second);
});

test('a detected exe never replaces one recorded in the meantime', async () => {
  const chosen = path.join(tmpGame('chosen'), 'Chosen.exe');
  const detected = path.join(tmpGame('late'), 'Detected.exe');
  await exeList.add({ appid: '5001', exe: chosen, args: '-x' });
  assert.equal(await exeList.fillIfUnchanged({ appid: '5001', exe: detected }), chosen);
  assert.equal(await exeList.fillIfUnchanged({ appid: '5002', exe: detected }), detected);
  const list = await exeList.list();
  assert.equal(list.find((e) => String(e.appid) === '5001').args, '-x');
  assert.equal(list.find((e) => String(e.appid) === '5002').exe, detected);
});

test('a detected exe replaces the vanished path the caller read', async () => {
  const vanished = path.join(tmpGame('vanished'), 'Gone.exe');
  const detected = path.join(tmpGame('found'), 'Found.exe');
  await exeList.add({ appid: '5003', exe: vanished, args: '-y' });
  assert.equal(await exeList.fillIfUnchanged({ appid: '5003', exe: detected }, vanished), detected);
  const entry = (await exeList.list()).find((e) => String(e.appid) === '5003');
  assert.deepEqual([entry.exe, entry.args], [detected, '-y']);
});

test('a corrupt list is left alone rather than overwritten', async () => {
  const file = exeList.exeListFile(userData);
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, '{broken');
  await exeList.add({ appid: '6001', exe: path.join(tmpGame('corrupt'), 'X.exe'), args: '' });
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  fs.writeFileSync(file, before);
});

test('reconcile picks the exe Steam declares over a bigger unrelated one', async () => {
  const gameDir = tmpGame('declared');
  writeBytes(path.join(gameDir, 'Editor.exe'), 64 * 1024);
  writeBytes(path.join(gameDir, 'bin', 'cdx_win64.exe'));
  const cache = path.join(userData, 'steam_cache', 'steamdb_launch', '7001.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ process_name: 'cdx_win64.exe', best_process_name: 'cdx_win64.exe' }));

  await exeList.reconcile([{ appid: '7001', name: 'Codename', gameDir }]);
  const list = await exeList.list();
  assert.equal(list.find((e) => String(e.appid) === '7001').exe, path.join(gameDir, 'bin', 'cdx_win64.exe'));
});
