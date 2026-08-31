'use strict';

/*
  Every channel the renderer speaks on has to be answered somewhere in the main process.

  A renderer that invokes a channel nobody handles rejects at runtime, and one that sends on a dead
  channel is dropped in silence - neither shows up in a unit test, because the renderer files are
  never loaded outside Electron. So this reads the sources instead: literal channel names on both
  sides, compared.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const app = (...parts) => path.join(root, 'app', ...parts);

/*
  Where the main process registers handlers, and what runs in a renderer. Both lists are derived
  rather than written out: init.js and app.js are split across several files and go on being split,
  and a file left off a hand-written list is a channel this test stops checking without saying so.
*/
const { mainProcessFiles } = require('../helpers/mainProcessSource.js');
const { rendererScriptFiles } = require('../helpers/rendererSource.js');

const MAIN = mainProcessFiles();

const RENDERERS = [
  ...rendererScriptFiles().map((file) => app(...file.split('/'))),
  app('settings.js'),
  app('notificationPreload.js'),
  app('overlayPreload.js'),
  // The title bar is a renderer too: its shadow DOM owns the window controls and the update chip's
  // Cancel, and a dead channel behind either of those is silent at runtime.
  app('components', 'titleBar', 'titleBar.js'),
].filter((file) => fs.existsSync(file));

/*
  Presets call window.api.notificationRenderReady(), which sends this, and nothing listens - the
  main process stopped needing the signal and the bridge stayed. Sending into the void is harmless
  (Electron drops it), and the bridge cannot be removed without breaking presets already on disk
  that call it, so it is recorded here rather than fixed.
*/
const UNANSWERED = new Set(['notification-render-ready']);

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function handledChannels() {
  const out = new Set();
  for (const file of MAIN) {
    for (const match of read(file).matchAll(/ipcMain\.(?:handle|handleOnce|on|once)\(\s*'([^']+)'/g)) out.add(match[1]);
  }
  return out;
}

function rendererChannels() {
  const out = new Map();
  for (const file of RENDERERS) {
    for (const match of read(file).matchAll(/ipcRenderer\.(?:invoke|send|sendSync)\(\s*'([^']+)'/g)) {
      if (!out.has(match[1])) out.set(match[1], []);
      out.get(match[1]).push(path.relative(root, file));
    }
  }
  return out;
}

test('every channel a renderer speaks on is answered by the main process', () => {
  const handled = handledChannels();
  assert.ok(handled.size > 50, `expected the main process to register its handlers, found ${handled.size}`);

  const unanswered = [];
  for (const [channel, callers] of rendererChannels()) {
    if (handled.has(channel) || UNANSWERED.has(channel)) continue;
    unanswered.push(`${channel} (from ${[...new Set(callers)].join(', ')})`);
  }
  assert.deepEqual(unanswered, [], 'these channels have no handler in app/electron/');
});

test('the recorded exception is still exactly one dead channel, and still dead', () => {
  const handled = handledChannels();
  for (const channel of UNANSWERED) {
    assert.ok(!handled.has(channel), `${channel} is handled now, so it should not be listed as unanswered`);
  }
  // The bridge is what presets already installed call, so it has to stay reachable.
  assert.match(read(app('notificationPreload.js')), /notificationRenderReady:/);
});
