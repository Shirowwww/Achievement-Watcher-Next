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

test('a repeated modifier is not emitted twice', () => {
  assert.equal(toAccelerator('Ctrl + Control + K'), 'Control+K');
});

test('a hotkey without exactly one primary key is rejected', () => {
  assert.throws(() => toAccelerator('Ctrl+Shift'), /no non-modifier key/);
  assert.throws(() => toAccelerator('Ctrl+A+B'), /exactly one non-modifier key/);
  assert.throws(() => toAccelerator('Ctrl+F25'), /Unsupported hotkey key/);
});
