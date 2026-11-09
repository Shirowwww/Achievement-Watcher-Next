'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const exeDetect = require('../../app/parser/exeDetect.js');
const exeCandidateCache = require('../../app/util/exeCandidateCache.js');
const { isExecutableImage } = require('../../app/util/pe.js');
const { writePe } = require('../helpers/fakePe.js');

const created = [];
test.after(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpGameNamed(name) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-safety-'));
  created.push(parent);
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  return dir;
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('isExecutableImage accepts a program and refuses a dll, an empty file and plain bytes', () => {
  const dir = tmpGameNamed('pe');
  writePe(path.join(dir, 'game.exe'));
  writePe(path.join(dir, 'renamed.exe'), 128, { dll: true });
  writeText(path.join(dir, 'empty.exe'), '');
  writeText(path.join(dir, 'text.exe'), 'not a program at all, just some text');
  assert.equal(isExecutableImage(path.join(dir, 'game.exe')), true);
  assert.equal(isExecutableImage(path.join(dir, 'renamed.exe')), false);
  assert.equal(isExecutableImage(path.join(dir, 'empty.exe')), false);
  assert.equal(isExecutableImage(path.join(dir, 'text.exe')), false);
  assert.equal(isExecutableImage(path.join(dir, 'missing.exe')), false);
});

test('a .exe that is not a real program never becomes a candidate', () => {
  const gameDir = tmpGameNamed('Hollow Game');
  writePe(path.join(gameDir, 'HollowGame.exe'), 256);
  writeText(path.join(gameDir, 'Huge.exe'), 'x'.repeat(4096));
  writePe(path.join(gameDir, 'HollowGamePlugin.exe'), 8192, { dll: true });
  const ranked = exeDetect.rank(gameDir, 'Hollow Game');
  assert.deepEqual(
    ranked.candidates.map((c) => c.name),
    ['HollowGame.exe']
  );
});

test('a crack or backup folder is never searched, even when it holds the only copy', () => {
  const gameDir = tmpGameNamed('Some Game');
  writePe(path.join(gameDir, 'Crack', 'SomeGame.exe'), 4096);
  writePe(path.join(gameDir, '_Cracked Files', 'SomeGame.exe'), 4096);
  writePe(path.join(gameDir, 'Original Files', 'SomeGame.exe'), 4096);
  writePe(path.join(gameDir, 'NoDVD', 'SomeGame.exe'), 4096);
  assert.equal(exeDetect.detect(gameDir, 'Some Game'), null);

  writePe(path.join(gameDir, 'SomeGame.exe'), 1024);
  const res = exeDetect.detectConfident(gameDir, 'Some Game');
  assert.equal(res.full, path.join(gameDir, 'SomeGame.exe'));
});

test('an exe whose steam_appid.txt names another game is never chosen on its own', () => {
  const gameDir = tmpGameNamed('Pack');
  writePe(path.join(gameDir, 'First', 'First.exe'), 4096);
  writeText(path.join(gameDir, 'First', 'steam_appid.txt'), '111\n');
  writePe(path.join(gameDir, 'Second', 'Second.exe'), 1024);
  writeText(path.join(gameDir, 'Second', 'steam_appid.txt'), '222');

  const res = exeDetect.detect(gameDir, 'Pack', { steamAppId: '222' });
  assert.equal(res.name, 'Second.exe');

  const onlyForeign = tmpGameNamed('Foreign');
  writePe(path.join(onlyForeign, 'Foreign.exe'), 1024);
  writeText(path.join(onlyForeign, 'steam_appid.txt'), '999');
  const foreign = exeDetect.detect(onlyForeign, 'Foreign', { steamAppId: '222' });
  assert.equal(foreign.confident, false);
  assert.equal(foreign.confidence, 'appid-mismatch');
});

test('Spacewar (480) in steam_appid.txt is a placeholder, not another game', () => {
  const gameDir = tmpGameNamed('Placeholder');
  writePe(path.join(gameDir, 'Placeholder.exe'), 1024);
  writeText(path.join(gameDir, 'steam_appid.txt'), '480');
  const res = exeDetect.detectConfident(gameDir, 'Placeholder', { steamAppId: '222' });
  assert.equal(res.name, 'Placeholder.exe');
});

test('a ColdClientLoader.ini for another game rules the folder out of auto-selection', () => {
  const gameDir = tmpGameNamed('Cold');
  writePe(path.join(gameDir, 'Cold.exe'), 1024);
  writeText(path.join(gameDir, 'ColdClientLoader.ini'), '[SteamClient]\r\nExe=Cold.exe\r\nAppId=333\r\n');
  const mismatch = exeDetect.detect(gameDir, 'Cold', { steamAppId: '222' });
  assert.equal(mismatch.confident, false);
  const match = exeDetect.detectConfident(gameDir, 'Cold', { steamAppId: '333' });
  assert.equal(match.name, 'Cold.exe');
});

test('steam_appid.txt and ColdClientLoader.ini that disagree make no exe sure', () => {
  const gameDir = tmpGameNamed('Disagree');
  writePe(path.join(gameDir, 'Disagree.exe'), 1024);
  writeText(path.join(gameDir, 'steam_appid.txt'), '222');
  writeText(path.join(gameDir, 'ColdClientLoader.ini'), '[SteamClient]\nAppId=333\n');
  for (const steamAppId of ['222', '333']) {
    assert.equal(exeDetect.detect(gameDir, 'Disagree', { steamAppId }).confidence, 'appid-mismatch');
  }
});

test('a .exe that cannot be read right now stays a candidate', () => {
  const gameDir = tmpGameNamed('Locked');
  writePe(path.join(gameDir, 'Locked.exe'), 1024);
  const realOpen = fs.openSync;
  fs.openSync = (file, ...rest) => {
    if (String(file).endsWith('Locked.exe')) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    return realOpen(file, ...rest);
  };
  try {
    assert.equal(exeDetect.detect(gameDir, 'Locked').name, 'Locked.exe');
  } finally {
    fs.openSync = realOpen;
  }
});

test('the executable the store declares wins over a bigger exe and is confident', () => {
  const gameDir = tmpGameNamed('Codename');
  writePe(path.join(gameDir, 'Editor.exe'), 64 * 1024);
  writePe(path.join(gameDir, 'bin', 'cdx_win64.exe'), 1024);
  const res = exeDetect.detectConfident(gameDir, 'Codename', { hints: ['cdx_win64.exe'] });
  assert.equal(res.name, 'cdx_win64.exe');
  assert.equal(res.confidence, 'store-declared');
});

test('a generic declared name (game.exe) adds weight but proves nothing alone', () => {
  const gameDir = tmpGameNamed('Generic');
  writePe(path.join(gameDir, 'game.exe'), 1024);
  writePe(path.join(gameDir, 'other.exe'), 1024);
  const res = exeDetect.detect(gameDir, 'Generic', { hints: ['game.exe'] });
  assert.equal(res.name, 'game.exe');
  assert.notEqual(res.confidence, 'store-declared');
});

test('a search cut short is never confident and is not remembered', () => {
  const memo = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-safety-memo-'));
  created.push(memo);
  exeCandidateCache.setUserDataPath(memo);
  const gameDir = tmpGameNamed('Deep');
  writePe(path.join(gameDir, 'Deep.exe'), 1024);
  for (let i = 0; i < 6; i++) fs.mkdirSync(path.join(gameDir, `folder${i}`));

  const cut = exeDetect.detect(gameDir, 'Deep', { maxDirectories: 3 });
  assert.equal(cut.truncated, true);
  assert.equal(cut.confident, false);
  assert.equal(cut.confidence, 'truncated');
  assert.equal(exeCandidateCache.read(gameDir), null);

  const full = exeDetect.detect(gameDir, 'Deep');
  assert.equal(full.truncated, false);
  assert.equal(full.confident, true);
  exeCandidateCache.setUserDataPath(null);
});

test('rank lists every candidate, best first, without the ones already taken', () => {
  const gameDir = tmpGameNamed('Choice');
  writePe(path.join(gameDir, 'Alpha.exe'), 1024);
  writePe(path.join(gameDir, 'Beta.exe'), 2048);
  writePe(path.join(gameDir, 'Gamma.exe'), 512);
  const ranked = exeDetect.rank(gameDir, 'Unrelated', { taken: new Set([path.join(gameDir, 'Beta.exe')]) });
  assert.deepEqual(
    ranked.candidates.map((c) => c.name),
    ['Alpha.exe', 'Gamma.exe']
  );
  assert.equal(ranked.truncated, false);
});
