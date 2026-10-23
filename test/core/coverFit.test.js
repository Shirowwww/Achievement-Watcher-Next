'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const coverFit = require('../../app/util/coverFit.js');
const { makeTempDir } = require('../helpers/tempDir');

function freshStore() {
  const file = path.join(makeTempDir('aw-cover-fit-'), 'cfg', 'coverFit.json');
  coverFit.setStoreFile(file);
  return file;
}

test('a game with no choice fills its tile', () => {
  freshStore();
  assert.equal(coverFit.get('480', 'landscape'), 'fill');
  assert.equal(coverFit.get('480', 'portrait'), 'fill');
});

test('each orientation keeps its own choice', () => {
  freshStore();
  coverFit.set('480', 'portrait', 'contain');
  coverFit.set('480', 'landscape', 'stretch');
  assert.equal(coverFit.get('480', 'portrait'), 'contain');
  assert.equal(coverFit.get('480', 'landscape'), 'stretch');
  assert.equal(coverFit.get('730', 'portrait'), 'fill');
});

test('going back to fill leaves nothing on disk for that game', () => {
  const file = freshStore();
  coverFit.set('480', 'portrait', 'contain');
  coverFit.set('480', 'portrait', 'fill');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
});

test('an unknown fit, orientation or appid is refused and changes nothing', () => {
  const file = freshStore();
  assert.equal(coverFit.set('480', 'portrait', 'zoom'), false);
  assert.equal(coverFit.set('480', 'sideways', 'contain'), false);
  assert.equal(coverFit.set('', 'portrait', 'contain'), false);
  assert.equal(fs.existsSync(file), false);
});

test('a damaged file reads as no choice at all', () => {
  const file = freshStore();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');
  assert.equal(coverFit.get('480', 'portrait'), 'fill');
  fs.writeFileSync(file, JSON.stringify({ 480: { portrait: 'explode' } }));
  assert.equal(coverFit.get('480', 'portrait'), 'fill');
});
