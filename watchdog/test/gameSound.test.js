'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-game-sound-'));
process.env.AW_USER_DATA = USER_DATA;

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

require(path.join(__dirname, '..', 'util', 'userData.js')).resetCache();
const gameSound = require(path.join(__dirname, '..', 'util', 'gameSound.js'));

function writeStore(value) {
  fs.mkdirSync(path.dirname(gameSound.file()), { recursive: true });
  fs.writeFileSync(gameSound.file(), typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
}

beforeEach(() => {
  gameSound._reset();
  fs.rmSync(gameSound.file(), { force: true });
});

after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

test('reads the sound the app saved for a game, whatever kind of id the game has', () => {
  writeStore({
    480: { sound: 'Xbox Classic.wav', preset: 'Steam' },
    'ra-1446': { sound: '__none__' },
    'xlln-4D5307E6': { sound: '__random__' },
  });
  assert.equal(gameSound.soundFor('480'), 'Xbox Classic.wav');
  assert.equal(gameSound.soundFor(480), 'Xbox Classic.wav');
  assert.equal(gameSound.soundFor('ra-1446'), gameSound.SOUND_NONE);
  assert.equal(gameSound.soundFor('xlln-4D5307E6'), gameSound.SOUND_RANDOM);
});

test('a game with only a preset or position override has no sound of its own', () => {
  writeStore({ 480: { preset: 'Steam', position: 'top-left' } });
  assert.equal(gameSound.soundFor('480'), '');
  assert.equal(gameSound.soundFor('999'), '');
  assert.equal(gameSound.soundFor(''), '');
});

test('a sound name that is a path or not an audio file is ignored', () => {
  writeStore({ 1: { sound: '..\\..\\evil.wav' }, 2: { sound: 'C:/x.mp3' }, 3: { sound: 'notes.txt' } });
  assert.equal(gameSound.soundFor('1'), '');
  assert.equal(gameSound.soundFor('2'), '');
  assert.equal(gameSound.soundFor('3'), '');
});

test('a missing or corrupt store means every game uses the global sound', () => {
  assert.equal(gameSound.soundFor('480'), '');
  gameSound._reset();
  writeStore('{ not json');
  assert.equal(gameSound.soundFor('480'), '');
});
