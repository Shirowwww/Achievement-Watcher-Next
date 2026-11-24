'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toAccelerator } = require('../../app/util/hotkeyAccelerator.js');

test('the default overlay shortcut becomes an Electron accelerator', () => {
  assert.equal(toAccelerator('Ctrl+Shift+K'), 'Control+Shift+K');
  assert.equal(toAccelerator('Ctrl + Shift + K'), 'Control+Shift+K');
});

test('Windows, function and navigation keys keep working', () => {
  assert.equal(toAccelerator('Win + F12'), 'Super+F12');
  assert.equal(toAccelerator('Alt + ArrowUp'), 'Alt+Up');
  assert.equal(toAccelerator('Ctrl + Escape'), 'Control+Escape');
  assert.equal(toAccelerator('Ctrl + Enter'), 'Control+Return');
  assert.equal(toAccelerator('Alt + ='), 'Alt+Plus');
  assert.equal(toAccelerator('Ctrl + ,'), 'Control+,');
});

// A Spanish keyboard records "º"; Electron only knows US key names, so it went unregistered.
test('a key of another layout is registered by the physical key Windows maps it to', () => {
  const spanish = { º: 0xdc, ª: 0xdc, Ñ: 0xc0, Ç: 0xbf, '<': 0xe2 };
  const vkForChar = (char) => spanish[char] ?? null;
  assert.equal(toAccelerator('Ctrl + Shift + º', { vkForChar }), 'Control+Shift+\\');
  assert.equal(toAccelerator('Alt + Ñ', { vkForChar }), 'Alt+`');
  assert.equal(toAccelerator('Alt + Ç', { vkForChar }), 'Alt+/');
  assert.throws(() => toAccelerator('Ctrl + <', { vkForChar }), /Unsupported hotkey key/);
  assert.throws(() => toAccelerator('Ctrl + º'), /Unsupported hotkey key/);
});

test('an upper-case letter with no key of its own falls back to its lower case', () => {
  const french = { ù: 0xc0 };
  assert.equal(toAccelerator('Ctrl + Ù', { vkForChar: (char) => french[char] ?? null }), 'Control+`');
});

test('Windows itself says which key types a character', { skip: process.platform !== 'win32' }, () => {
  const { vkForChar } = require('../../app/util/keyboardLayout.js');
  assert.equal(vkForChar('k'), 0x4b);
  assert.equal(vkForChar('\u{1F600}'), null);
});

test('a repeated modifier is not emitted twice', () => {
  assert.equal(toAccelerator('Ctrl + Control + K'), 'Control+K');
});

test('a hotkey without exactly one primary key is rejected', () => {
  assert.throws(() => toAccelerator('Ctrl+Shift'), /no non-modifier key/);
  assert.throws(() => toAccelerator('Ctrl+A+B'), /exactly one non-modifier key/);
  assert.throws(() => toAccelerator('Ctrl+F25'), /Unsupported hotkey key/);
});
