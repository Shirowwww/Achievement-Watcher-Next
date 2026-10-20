'use strict';

/*
  The Watchdog's toast sounds play in the app, in a hidden window that never takes the focus and is
  destroyed once the sound ends, whatever happened to it.
*/

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createSoundPlayer, soundUrl, clampVolume } = require('../../app/electron/soundPlayer.js');

const SOUNDS = path.join(os.tmpdir(), 'aw-sounds');

function fakeWindowClass({ script = () => Promise.resolve('ended'), load = () => Promise.resolve(), finishLoad = true } = {}) {
  const created = [];
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.scripts = [];
      this.webContents = {
        once: (event, handler) => {
          if (event === 'did-finish-load' && finishLoad) setImmediate(handler);
        },
        executeJavaScript: (code) => {
          this.scripts.push(code);
          return script(code);
        },
      };
      created.push(this);
    }
    loadFile(page) {
      this.page = page;
      return load();
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { FakeWindow, created };
}

test('a sound plays in a hidden window that cannot take the focus, then the window is destroyed', async () => {
  const { FakeWindow, created } = fakeWindowClass();
  const player = createSoundPlayer({ BrowserWindow: FakeWindow, page: 'sound.html' });

  const file = path.join(SOUNDS, 'my unlock#1.mp3');
  assert.equal(await player.play({ file, volume: 0.25 }), 'ended');

  const [win] = created;
  assert.equal(win.options.show, false);
  assert.equal(win.options.focusable, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.page, 'sound.html');
  assert.match(win.scripts[0], /a\.volume = 0\.25/);
  assert.ok(win.scripts[0].includes(JSON.stringify(soundUrl(file))));
  assert.ok(soundUrl(file).endsWith('/my%20unlock%231.mp3'), 'spaces and # cannot cut the address short');
  assert.equal(win.destroyed, true);
});

test('a burst of unlocks plays three sounds at once, not one window each', async () => {
  const logs = [];
  const ends = [];
  const { FakeWindow, created } = fakeWindowClass({ script: () => new Promise((resolve) => ends.push(resolve)) });
  const player = createSoundPlayer({ BrowserWindow: FakeWindow, log: (line) => logs.push(line) });

  const first = [1, 2, 3].map((n) => player.play({ file: path.join(SOUNDS, `${n}.wav`) }));
  assert.equal(await player.play({ file: path.join(SOUNDS, '4.wav') }), 'busy');
  assert.equal(created.length, 3);
  assert.match(logs[0], /skipped, 3 already playing/);

  await new Promise(setImmediate);
  ends.forEach((end) => end('ended'));
  assert.deepEqual(await Promise.all(first), ['ended', 'ended', 'ended']);
  const next = player.play({ file: path.join(SOUNDS, '5.wav') });
  await new Promise(setImmediate);
  ends[3]('ended');
  assert.equal(await next, 'ended', 'a slot is free again once a sound ends');
});

test('a sound that cannot play is logged and its window still destroyed', async () => {
  const logs = [];
  const { FakeWindow, created } = fakeWindowClass({ script: () => Promise.resolve('cannot decode the file') });
  const player = createSoundPlayer({ BrowserWindow: FakeWindow, log: (line) => logs.push(line) });

  assert.equal(await player.play({ file: path.join(SOUNDS, 'broken.ogg'), volume: 1 }), 'cannot decode the file');
  assert.equal(created[0].destroyed, true);
  assert.match(logs[0], /toast sound not played \(cannot decode the file\): .*broken\.ogg$/);
});

test('a page that never loads or a sound that never ends is cut off', async () => {
  const { FakeWindow, created } = fakeWindowClass({ finishLoad: false });
  const player = createSoundPlayer({ BrowserWindow: FakeWindow, maxMs: 10 });
  assert.equal(await player.play({ file: path.join(SOUNDS, 'long.wav') }), 'timed out');
  assert.equal(created[0].destroyed, true);

  const failing = fakeWindowClass({ load: () => Promise.reject(new Error('ERR_FILE_NOT_FOUND')), finishLoad: false });
  const failingPlayer = createSoundPlayer({ BrowserWindow: failing.FakeWindow, maxMs: 1000 });
  assert.equal(await failingPlayer.play({ file: path.join(SOUNDS, 'x.wav') }), 'ERR_FILE_NOT_FOUND');
  assert.equal(failing.created[0].destroyed, true);
});

test('a request without a full path to a file opens no window', async () => {
  const { FakeWindow, created } = fakeWindowClass();
  const player = createSoundPlayer({ BrowserWindow: FakeWindow });
  for (const request of [undefined, {}, { file: 42 }, { file: '' }, { file: 'sounds/relative.wav' }]) {
    assert.equal(await player.play(request), 'no file');
  }
  assert.equal(created.length, 0);
});

test('bundled sounds are read from app.asar.unpacked and the volume stays between 0 and 1', () => {
  const resources = path.join(os.tmpdir(), 'AW', 'resources');
  const unpacked = soundUrl(path.join(resources, 'app.asar.unpacked', 'sounds', 'a.wav'));
  assert.equal(soundUrl(path.join(resources, 'app.asar', 'sounds', 'a.wav')), unpacked);
  assert.ok(unpacked.startsWith('file:///') && unpacked.endsWith('/resources/app.asar.unpacked/sounds/a.wav'), unpacked);
  assert.deepEqual([clampVolume(2), clampVolume(-1), clampVolume('0.3'), clampVolume('x')], [1, 0, 0.3, 0.5]);
});
