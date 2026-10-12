'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..', 'app');
const { createScreenshotTaker, desktopSize } = require(path.join(root, 'electron', 'screenCapture.js'));
const { createClipRecorder, recordingPlan } = require(path.join(root, 'electron', 'clipRecorder.js'));
const { findGsr } = require(path.join(root, 'electron', 'souvenirLinux.js'));

const screen = {
  getAllDisplays: () => [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, scaleFactor: 1 },
  ],
  getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 }, scaleFactor: 1 }),
};

// A PNG signature and an IHDR chunk header, which is all the taker reads.
function png(width, height) {
  const data = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(data);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function image(data) {
  return { isEmpty: () => !data, toPNG: () => data };
}

test('on X11 a screenshot covers every screen and lands under its final name only once written', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(desktopSize(screen), { width: 3200, height: 1080 });

  const asked = [];
  const desktopCapturer = { getSources: async (options) => (asked.push(options), [{ thumbnail: image(png(3200, 1080)) }]) };
  const logs = [];
  const take = createScreenshotTaker({ desktopCapturer, screen, log: (m) => logs.push(m), wayland: false });
  const file = path.join(dir, 'Game', '2026-10-14 12-00-00 - First Blood.png');
  assert.equal(await take({ file }), file);
  assert.deepEqual(asked[0], { types: ['screen'], thumbnailSize: { width: 3200, height: 1080 } });
  assert.ok(fs.readFileSync(file).equals(png(3200, 1080)));
  assert.equal(fs.existsSync(file + '.tmp'), false);
  assert.match(logs[0], /saved .* \(3200x1080, X11\)/);
});

test('on Wayland the Screenshot portal takes the shot, and the screen-sharing dialog is only a fallback', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const portalFile = path.join(dir, 'Screenshot from portal.png');
  const asked = [];
  const desktopCapturer = { getSources: async () => (asked.push('screencast'), [{ thumbnail: image(png(1600, 900)) }]) };
  const logs = [];
  let portalWorks = true;
  const takePortalShot = async () => {
    if (!portalWorks) throw new Error('no portal');
    fs.writeFileSync(portalFile, png(2560, 1440));
    return portalFile;
  };
  const take = createScreenshotTaker({ desktopCapturer, screen, log: (m) => logs.push(m), wayland: true, takePortalShot });

  const file = path.join(dir, 'Game', 'shot.png');
  assert.equal(await take({ file }), file);
  assert.equal(fs.existsSync(portalFile), false, "the portal's copy is moved, not left in the user's folder");
  assert.deepEqual(asked, []);
  assert.match(logs.at(-1), /\(2560x1440, Screenshot portal\)/);

  portalWorks = false;
  assert.equal(await take({ file: path.join(dir, 'Game', 'second.png') }), path.join(dir, 'Game', 'second.png'));
  assert.deepEqual(asked, ['screencast']);
  assert.match(logs.at(-1), /ScreenCast portal/);
});

test('while the software recorder runs, its stream gives the screenshot and no desktop is asked', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const asked = [];
  const logs = [];
  const take = createScreenshotTaker({
    desktopCapturer: { getSources: async () => (asked.push('capturer'), []) },
    screen,
    log: (m) => logs.push(m),
    wayland: true,
    takePortalShot: async () => (asked.push('portal'), ''),
    grabFrame: async () => png(1920, 1080),
  });
  const file = path.join(dir, 'Game', 'shot.png');
  assert.equal(await take({ file }), file);
  assert.deepEqual(asked, []);
  assert.match(logs.at(-1), /\(1920x1080, clip recorder stream\)/);
});

test('a refused or empty capture writes nothing, and only absolute PNG paths are taken', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logs = [];
  const empty = createScreenshotTaker({ desktopCapturer: { getSources: async () => [{ thumbnail: image(null) }] }, screen, log: (m) => logs.push(m), wayland: false });
  assert.equal(await empty({ file: path.join(dir, 'a.png') }), null);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(await empty({ file: 'relative.png' }), null);
  assert.equal(await empty({ file: path.join(dir, 'a.sh') }), null);
  assert.match(logs.join('\n'), /refused screenshot path/);
});

test('the software recorder asks for the clip size, frame rate and a bitrate it can hold', () => {
  const plan = recordingPlan({ clipResolution: '1080', clipFps: 30, clipQuality: 'medium' }, 1440);
  assert.deepEqual(plan.video, { frameRate: 30, height: 1080 });
  assert.equal(plan.mimeType, 'video/webm;codecs=vp8,opus');
  assert.equal(plan.keyframeMs, 1000);
  assert.ok(plan.videoBitsPerSecond > 1e6 && plan.videoBitsPerSecond < 40e6);
  assert.equal(recordingPlan({ clipResolution: 'native', clipFps: 60, clipQuality: 'low' }, 900).video.height, 900);
});

function fakeElectron() {
  const windows = [];
  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), { sent: [], send: (...args) => this.webContents.sent.push(args), getOSProcessId: () => 99 });
      windows.push(this);
    }
    loadFile(page) {
      this.page = page;
      this.webContents.emit('did-finish-load');
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const session = { fromPartition: () => ({ setDisplayMediaRequestHandler: () => {} }) };
  return { BrowserWindow, session, windows };
}

test('the recorder window starts hidden and sandboxed, and stopping it writes nothing without an unlock', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const electron = fakeElectron();
  const recorder = createClipRecorder({ ...electron, desktopCapturer: {}, screen, preload: 'preload.js', page: 'page.html', log: () => {} });
  recorder.start({ clipSeconds: 20, clipResolution: '1080', clipFps: 30, clipQuality: 'medium' }, { getAppMetrics: () => [] });
  const [win] = electron.windows;
  assert.equal(win.options.show, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.webContents.sent[0][0], 'clip-recorder:start');
  assert.equal(recorder.trigger('relative.webm'), null, 'only absolute .webm paths');
  recorder.stop();
  assert.equal(win.destroyed, true);
  assert.equal(recorder.running(), false);
});

test('gpu-screen-recorder is found on PATH or as an installed Flathub app', { skip: process.platform === 'win32' && 'Linux-only' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gsr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(findGsr({ env: { PATH: dir }, flatpakApps: [dir] }), null);
  fs.mkdirSync(path.join(dir, 'com.dec05eba.gpu_screen_recorder'));
  assert.equal(findGsr({ env: { PATH: dir }, flatpakApps: [dir] }), 'flatpak');
  fs.writeFileSync(path.join(dir, 'gpu-screen-recorder'), '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(findGsr({ env: { PATH: dir }, flatpakApps: [dir] }), 'path');
});
