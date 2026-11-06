'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const progressMute = require('../../app/parser/progressMute.js');

test('a toggle is seen at once by the process that made it, and lands in cfg/progressMute.json', () => {
  const userData = makeTempDir('aw-progress-mute-');
  progressMute.setUserDataPath(userData);

  assert.equal(progressMute.isMuted('480'), false);
  assert.equal(progressMute.toggle('480'), true);
  assert.equal(progressMute.isMuted('480'), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'cfg', 'progressMute.json'), 'utf8')), ['480']);
  assert.equal(progressMute.toggle('480'), false);
  assert.equal(progressMute.isMuted('480'), false);
});

test('the Watchdog reads the file the app wrote, and an empty appid is never muted', () => {
  const userData = makeTempDir('aw-progress-mute-read-');
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'cfg', 'progressMute.json'), JSON.stringify([1245620]));
  progressMute.setUserDataPath(userData);

  assert.equal(progressMute.isMuted(1245620), true);
  assert.equal(progressMute.isMuted(''), false);
  assert.equal(progressMute.isMuted(undefined), false);
});
