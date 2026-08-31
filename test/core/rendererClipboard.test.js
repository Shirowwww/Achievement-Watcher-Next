'use strict';

/*
  Electron 44 stopped exposing the clipboard module to renderer processes: `require('electron')
  .clipboard` is undefined there, so every copy button in the game menus and the Game Health panel
  threw a TypeError instead of copying. Copying now goes over IPC, and the same release also made
  every clipboard method return a promise, so the handler has to await its write or a refusal
  becomes an unhandled rejection nobody sees.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { rendererSource } = require('../helpers/rendererSource.js');
const { mainProcessSource } = require('../helpers/mainProcessSource.js');

test('no renderer script reaches for the clipboard module Electron no longer gives it', () => {
  const renderer = rendererSource();
  // Anchored on a real declaration rather than on the word: the comment that explains the removal
  // names the module too, and a test that trips over its own explanation is one someone deletes.
  assert.doesNotMatch(
    renderer,
    /^\s*(?:const|let|var)\s*\{[^}\n]*\bclipboard\b[^}\n]*\}\s*=\s*require\('electron'\)/m,
    'a renderer script destructures clipboard from electron again'
  );
  assert.doesNotMatch(renderer, /\bclipboard\.writeText\(/, 'a renderer script writes to the clipboard directly');
});

test('the renderer copies through the main process, and the copy buttons all use it', () => {
  const renderer = rendererSource();
  assert.match(renderer, /ipcRenderer\.invoke\('clipboard:write-text'/, 'the renderer has no way to ask for a copy');
  // Four copy affordances - the Steam appid, the Ubisoft product id, the achievement data paths and
  // the Game Health technical dump - plus the helper they share.
  const calls = renderer.match(/\bcopyText\(/g) || [];
  assert.ok(calls.length >= 5, `expected the helper and its four callers, found ${calls.length} reference(s)`);
});

test('the main process answers the copy channel and awaits the write', () => {
  const main = mainProcessSource();
  const start = main.indexOf("ipcMain.handle('clipboard:write-text'");
  assert.notEqual(start, -1, 'nothing answers clipboard:write-text');
  const handler = main.slice(start, main.indexOf('\n});', start));
  assert.match(handler, /async \(/, 'the handler must be async to await the promise-based write');
  assert.match(handler, /await clipboard\.writeText\(/, 'Electron 44 clipboard writes return a promise');
});
