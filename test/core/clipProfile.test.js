'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appCopy = path.join(root, 'app', 'util', 'clipProfile.js');
const watchdogCopy = path.join(root, 'watchdog', 'notification', 'clipProfile.js');
const recorderSource = fs.readFileSync(path.join(root, 'native', 'hdr-screenshot', 'src', 'bin', 'aw-next-clip', 'video.rs'), 'utf8');
const profile = require(appCopy);

test('the Settings page and the Watchdog read clip settings with the same code', () => {
  assert.equal(fs.readFileSync(appCopy, 'utf8'), fs.readFileSync(watchdogCopy, 'utf8'));
});

test('settings saved as text are read by value, and anything unknown falls back', () => {
  assert.deepEqual(profile.normalize({}), {
    clip: false,
    clipSeconds: 20,
    clipCodec: 'h264',
    clipResolution: '1080',
    clipFps: 30,
    clipQuality: 'medium',
    clipAudio: 'game',
    clipEngine: 'gpu',
    clipDir: '',
  });
  assert.equal(profile.normalize({ clipEngine: 'software' }).clipEngine, 'software');
  assert.equal(profile.normalize({ clipEngine: 'obs' }).clipEngine, 'gpu');
  assert.equal(profile.normalize({ clipDir: '  D:\\Clips ' }).clipDir, 'D:\\Clips');
  const read = profile.normalize({ clip: 'true', clipSeconds: '45', clipFps: '60', clipCodec: 'av1', clipResolution: 'native', clipAudio: 'all' });
  assert.equal(read.clip, true);
  assert.equal(read.clipSeconds, 30, 'clips are capped at 30 s');
  assert.equal(profile.normalize({ clipSeconds: '4' }).clipSeconds, 10, 'and last at least 10 s');
  assert.equal(read.clipFps, 60);
  assert.equal(read.clipCodec, 'av1');
  assert.equal(read.clipResolution, 'native');
  assert.equal(read.clipAudio, 'all');
  assert.equal(profile.normalize({ clipCodec: 'vp9', clipFps: 144, clipQuality: 'ultra' }).clipCodec, 'h264');
});

test('the unlock sits in the middle of the clip', () => {
  const args = profile.recorderArgs({ clipSeconds: 15, clipResolution: 'native', hdr: 'off' }, 99);
  const value = (name) => args[args.indexOf(name) + 1];
  assert.equal(value('--before'), '7500');
  assert.equal(value('--after'), '7500');
  assert.equal(value('--height'), '0', 'native resolution is left to the recorder');
  assert.equal(value('--pid'), '99');
  assert.equal(value('--hdr'), 'off');
});

test('the size estimate follows the resolution, frame rate, codec and length', () => {
  const screen = { width: 2560, height: 1440 };
  const base = profile.estimateMegabytes({ clipSeconds: 30 }, screen);
  assert.ok(base > 28 && base < 33, `1080p30 medium for 30 s is about 31 MB, got ${base}`);
  assert.ok(profile.estimateMegabytes({ clipSeconds: 30, clipFps: 60 }, screen) > base * 1.4);
  assert.ok(profile.estimateMegabytes({ clipSeconds: 30, clipCodec: 'av1' }, screen) < base * 0.75);
  assert.ok(profile.estimateMegabytes({ clipSeconds: 10 }, screen) < base / 2.5);
  assert.equal(
    profile.estimateMegabytes({ clipSeconds: 30, clipResolution: '2160' }, screen),
    profile.estimateMegabytes({ clipSeconds: 30, clipResolution: '1440' }, screen),
    'a clip is never recorded above the screen resolution'
  );
});

test('the screen rate is a third choice next to 30 and 60', () => {
  assert.deepEqual(profile.FRAME_RATES, [30, 60, 'unlocked']);
  assert.equal(profile.normalize({ clipFps: 'unlocked' }).clipFps, 'unlocked');
  assert.equal(profile.normalize({ clipFps: 'fast' }).clipFps, 30);
  assert.equal(profile.recorderArgs({ clipFps: 'unlocked' }).at(profile.recorderArgs({}).indexOf('--fps') + 1), 'unlocked');
  assert.equal(profile.fixedFps(profile.normalize({ clipFps: 'unlocked' })), 60, 'Linux recorders take a number');
  assert.equal(profile.fixedFps(profile.normalize({ clipFps: 30 })), 30);
  const sixty = profile.estimateMegabytes({ clipSeconds: 30, clipFps: 60 });
  const unlocked = profile.estimateMegabytes({ clipSeconds: 30, clipFps: 'unlocked' });
  assert.ok(unlocked > sixty * 1.2 && unlocked < sixty * 1.4, `unlocked is estimated at twice the 30 FPS rate, got ${unlocked} against ${sixty}`);
});

test('the estimate steps the bitrate up with the frame rate the way the recorder does', () => {
  assert.match(recorderSource, /bits \*= if fps > 60 \{\s*2\.0\s*\} else if fps > 30 \{\s*1\.5\s*\} else \{\s*1\.0\s*\};/);
  const source = fs.readFileSync(appCopy, 'utf8');
  assert.match(source, /if \(clip\.clipFps === 'unlocked'\) bits \*= 2;\s*else if \(clip\.clipFps > 30\) bits \*= 1\.5;/);
});

test('the estimate uses the bitrates the recorder encodes with', () => {
  for (const [quality, bits] of [
    ['low', '0.08'],
    ['high', '0.22'],
    ['_', '0.13'],
  ]) {
    assert.match(recorderSource, new RegExp(`"?${quality}"? => ${bits.replace('.', '\\.')},`), `${quality} must be ${bits} in video.rs`);
  }
  const source = fs.readFileSync(appCopy, 'utf8');
  assert.match(source, /low: 0\.08, medium: 0\.13, high: 0\.22/);
});
