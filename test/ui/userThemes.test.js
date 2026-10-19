'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const userThemes = require('../../app/util/userThemes.js');
const { makeTempDir } = require('../helpers/tempDir');

test('lists only .css themes from the user themes folder, sorted', () => {
  const dir = makeTempDir('aw-themes-');
  fs.mkdirSync(path.join(dir, 'themes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'themes', 'zelda.css'), 'body{}');
  fs.writeFileSync(path.join(dir, 'themes', 'aero.css'), 'body{}');
  fs.writeFileSync(path.join(dir, 'themes', 'notes.txt'), 'x');
  const list = userThemes.listUserThemes(dir);
  assert.deepEqual(list.map((t) => t.name), ['aero', 'zelda']);
  assert.ok(list[0].file.endsWith('aero.css'));
  assert.equal(userThemes.readThemeFile(list[1].file), 'body{}');
});

test('value encoding round-trips and built-ins stay null', () => {
  assert.equal(userThemes.parseValue(userThemes.valueFor('My Theme')), 'My Theme');
  assert.equal(userThemes.parseValue('default'), null);
  assert.equal(userThemes.parseValue('user:'), null); // empty name is invalid, treated as built-in
  assert.equal(userThemes.parseValue('USER:OLED'), 'OLED');
});

test('missing folder returns an empty list and empty css', () => {
  assert.deepEqual(userThemes.listUserThemes(makeTempDir('aw-empty-')), []);
  assert.equal(userThemes.readThemeFile('C:/definitely/missing.css'), '');
});
