'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { chooseSound, NO_SOUND, RANDOM_SOUND } = require(path.join(__dirname, '..', '..', 'app', 'util', 'notificationSounds.js'));

// Every name resolves to "<name>" except the ones listed as gone; a random pick is "random.wav".
function pick(choice, { gone = [] } = {}) {
  return chooseSound(choice, {
    resolve: (name) => (gone.includes(name) ? '' : `<${name}>`),
    pickRandom: () => 'random.wav',
  });
}

test('a silent event or a game set to no sound plays nothing, whatever else is picked', () => {
  assert.equal(pick({ silent: true, mainSound: 'main.wav' }), '');
  assert.equal(pick({ gameSound: NO_SOUND, tier: 'rare.wav', progress: true, mainSound: 'main.wav' }), '');
});

test('the main sound is the emulator one, else a random one, else the preset one, else the main one', () => {
  assert.equal(pick({ emulator: 'xenia.wav', random: true, presetSound: 'preset.wav', mainSound: 'main.wav' }), '<xenia.wav>');
  assert.equal(pick({ random: true, presetSound: 'preset.wav', mainSound: 'main.wav' }), 'random.wav');
  assert.equal(pick({ presetSound: 'preset.wav', mainSound: 'main.wav' }), '<preset.wav>');
  assert.equal(pick({ mainSound: 'main.wav' }), '<main.wav>');
  assert.equal(pick({ emulator: NO_SOUND, mainSound: 'main.wav' }), '');
});

test('a rare or 100% sound wins over the main one, but a game\'s own sound wins over it', () => {
  assert.equal(pick({ tier: 'rare.wav', mainSound: 'main.wav' }), '<rare.wav>');
  assert.equal(pick({ tier: NO_SOUND, mainSound: 'main.wav' }), '');
  assert.equal(pick({ gameSound: 'game.wav', tier: 'rare.wav', mainSound: 'main.wav' }), '<game.wav>');
  assert.equal(pick({ gameSound: 'game.wav', tier: NO_SOUND, mainSound: 'main.wav' }), '<game.wav>');
});

test('the progress sound wins over a game\'s own sound', () => {
  assert.equal(pick({ gameSound: 'game.wav', tier: 'progress.wav', progress: true, mainSound: 'main.wav' }), '<progress.wav>');
  assert.equal(pick({ gameSound: 'game.wav', tier: NO_SOUND, progress: true, mainSound: 'main.wav' }), '');
  assert.equal(pick({ gameSound: 'game.wav', progress: true, mainSound: 'main.wav' }), '<game.wav>');
});

test('a game set to random draws a fresh sound', () => {
  assert.equal(pick({ gameSound: RANDOM_SOUND, mainSound: 'main.wav' }), 'random.wav');
});

test('a picked file that is gone falls back to the main sound', () => {
  assert.equal(pick({ gameSound: 'gone.wav', mainSound: 'main.wav' }, { gone: ['gone.wav'] }), '<main.wav>');
  assert.equal(pick({ tier: 'gone.wav', emulator: 'xenia.wav', mainSound: 'main.wav' }, { gone: ['gone.wav', 'xenia.wav'] }), '<main.wav>');
  assert.equal(pick({ mainSound: 'gone.wav' }, { gone: ['gone.wav'] }), '');
});
