'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

const { createClipRecorder } = require(path.join(__dirname, '..', '..', 'app', 'electron', 'clipRecorder.js'));

// A WebM stream as Chromium's MediaRecorder writes it (see webmRing.test.js): a cluster every 500 ms,
// a video keyframe every second.
const UNKNOWN_SIZE = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

function element(id, body) {
  return [...id, 0x80 | body.length, ...body];
}

function header() {
  const tracks = element([0x16, 0x54, 0xae, 0x6b], [
    ...element([0xae], [...element([0xd7], [1]), ...element([0x83], [2])]),
    ...element([0xae], [...element([0xd7], [2]), ...element([0x83], [1])]),
  ]);
  return Buffer.from([...element([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x86, 0x81, 0x01]), 0x18, 0x53, 0x80, 0x67, ...UNKNOWN_SIZE, ...tracks]);
}

function cluster(ms) {
  const block = (track, key) => element([0xa3], [0x80 | track, 0x00, 0x00, key ? 0x80 : 0x00, 1, 2]);
  return Buffer.from([0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN_SIZE, 0xe7, 0x82, ms >> 8, ms & 0xff, ...block(1, true), ...block(2, ms % 1000 === 0)]);
}

function clusterCount(file) {
  let count = 0;
  for (let at = file.indexOf(0x1f); at >= 0; at = file.indexOf(0x1f, at + 1)) {
    if (file[at + 1] === 0x43 && file[at + 2] === 0xb6 && file[at + 3] === 0x75) count += 1;
  }
  return count;
}

function recorderAt(t, settings) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const windows = [];
  class BrowserWindow {
    constructor() {
      this.webContents = Object.assign(new EventEmitter(), { send: () => {}, getOSProcessId: () => 99 });
      windows.push(this);
    }
    loadFile() {}
    isDestroyed() {
      return false;
    }
    destroy() {}
  }
  const session = { fromPartition: () => ({ setDisplayMediaRequestHandler: () => {} }) };
  const screen = { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 }, scaleFactor: 1 }) };
  const recorder = createClipRecorder({ BrowserWindow, session, desktopCapturer: {}, screen, preload: 'p.js', page: 'p.html', log: () => {} });
  recorder.start(settings, { getAppMetrics: () => [] });
  const contents = windows[0].webContents;
  contents.emit('ipc-message', {}, 'clip-recorder:started', 'test');
  contents.emit('ipc-message', {}, 'clip-recorder:chunk', header());
  let fed = 0;
  // Delivers the stream up to `ms` and lets the clock reach it.
  const playTo = (ms) => {
    for (; fed <= ms; fed += 500) contents.emit('ipc-message', {}, 'clip-recorder:chunk', cluster(fed));
    t.mock.timers.tick(ms - Date.now());
  };
  return { recorder, playTo };
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-soft-clip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a software clip keeps its seconds before the unlock, cut once the seconds after are in', (t) => {
  const dir = tempDir(t);
  const { recorder, playTo } = recorderAt(t, { clip: true, clipSeconds: 10, clipBefore: 5 });
  playTo(10000);
  const file = path.join(dir, 'Game', 'Unlock.webm');
  assert.equal(recorder.trigger(file), file);
  playTo(16000);
  // 5000 to 15000 ms, a cluster every 500 ms. Keeping only the seconds before plus two lost the
  // start of every clip.
  assert.equal(clusterCount(fs.readFileSync(file)), 21);
  recorder.stop();
});

// #215: achievements unlocked together, each with a video of its own named after it.
test('separate software clips give each close unlock its own file around it', (t) => {
  const dir = tempDir(t);
  const { recorder, playTo } = recorderAt(t, { clip: true, clipSeconds: 10, clipBefore: 5, clipCombine: 'separate' });
  playTo(10000);
  const first = path.join(dir, 'Game', 'Last one.webm');
  const second = path.join(dir, 'Game', 'Platinum.webm');
  assert.equal(recorder.trigger(first), first);
  playTo(11000);
  assert.equal(recorder.trigger(second), second, 'the second unlock keeps its own name');
  playTo(15500);
  assert.ok(fs.existsSync(first) && !fs.existsSync(second), 'each clip is written when its own seconds are in');
  playTo(17000);
  assert.equal(clusterCount(fs.readFileSync(second)), 21);
  recorder.stop();
});

test('by default a close unlock joins the clip being recorded', (t) => {
  const dir = tempDir(t);
  const { recorder, playTo } = recorderAt(t, { clip: true, clipSeconds: 10, clipBefore: 5 });
  playTo(10000);
  const first = path.join(dir, 'Game', 'First.webm');
  recorder.trigger(first);
  assert.equal(recorder.trigger(path.join(dir, 'Game', 'Second.webm')), first);
  recorder.stop();
});
