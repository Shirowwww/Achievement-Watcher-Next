'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { listCaptures, captureFolders, knownCapture } = require('../../app/electron/achievementCaptures.js');
const captureIndex = require('../../app/util/captureIndex.js');

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-captures-ipc-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('the folders come from the settings file, with the default folders kept beside them', (t) => {
  const userData = sandbox(t);
  fs.mkdirSync(path.join(userData, 'cfg'));
  fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), '[souvenir]\ndir=D:\\Shots\nclipDir=\n');

  const folders = captureFolders(userData);

  assert.equal(folders.screenshot[0], 'D:\\Shots');
  assert.equal(folders.screenshot.length, 2);
  assert.equal(folders.clip.length, 1);
});

test('the viewer gets file links, names and kinds, never more than it asked for', async (t) => {
  const userData = sandbox(t);
  const shot = path.join(userData, 'shots', 'a.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  fs.writeFileSync(shot, 'png');
  captureIndex.record(userData, { appid: '10', name: 'A', kind: 'screenshot', file: shot });

  const found = await listCaptures({ appid: '10', gameTitles: [], titles: { A: 'A' } }, { userData });

  assert.deepEqual(Object.keys(found), ['A']);
  assert.equal(found.A[0].url, pathToFileURL(shot).href);
  assert.equal(found.A[0].name, 'a.png');
  assert.equal(found.A[0].kind, 'screenshot');
});

test('"Show in folder" opens only a capture the viewer could have listed', (t) => {
  const userData = sandbox(t);
  const shots = path.join(userData, 'shots');
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), `[souvenir]\ndir=${shots}\n`);
  const inFolder = path.join(shots, 'Game', 'A - 2026-01-02 03-04-05.png');
  const indexed = path.join(userData, 'elsewhere', 'clip.mp4');
  const stranger = path.join(userData, 'elsewhere', 'other.png');
  const notMedia = path.join(shots, 'Game', 'notes.txt');
  for (const file of [inFolder, indexed, stranger, notMedia]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
  }
  captureIndex.record(userData, { appid: '1', name: 'A', kind: 'clip', file: indexed });

  assert.equal(knownCapture(pathToFileURL(inFolder).href, { userData }), inFolder);
  assert.equal(knownCapture(pathToFileURL(indexed).href, { userData }), indexed);
  assert.equal(knownCapture(pathToFileURL(stranger).href, { userData }), null);
  assert.equal(knownCapture(pathToFileURL(notMedia).href, { userData }), null);
  assert.equal(knownCapture('https://example.com/a.png', { userData }), null);
  assert.equal(knownCapture(pathToFileURL(path.join(shots, 'gone.png')).href, { userData }), null);
});

test('a request without a game, or with strange names, answers nothing rather than failing', async (t) => {
  const userData = sandbox(t);
  assert.deepEqual(Object.keys(await listCaptures(null, { userData })), []);
  assert.deepEqual(Object.keys(await listCaptures({ appid: 7 }, { userData })), []);
  const odd = await listCaptures({ appid: '1', gameTitles: [42, '..'], titles: JSON.parse('{"__proto__":"x","b":5}') }, { userData });
  assert.deepEqual(Object.keys(odd), []);
});
