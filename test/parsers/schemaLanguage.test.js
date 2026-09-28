'use strict';

// Issue #90: one game's achievements in another language than the rest of the library.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const schemaLanguage = require('../../app/parser/schemaLanguage.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-schema-lang-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
schemaLanguage.setUserDataPath(root);

test('a game follows the global language until it is given its own', () => {
  const option = { achievement: { lang: 'english', showHidden: true }, other: 1 };
  assert.equal(schemaLanguage.optionFor(option, '1392860'), option);

  schemaLanguage.set('1392860', 'brazilian');
  const own = schemaLanguage.optionFor(option, '1392860');
  assert.equal(own.achievement.lang, 'brazilian');
  assert.equal(own.achievement.showHidden, true);
  assert.equal(own.other, 1);
  assert.equal(option.achievement.lang, 'english', 'the shared options are never mutated');
  assert.equal(schemaLanguage.optionFor(option, '860510'), option, 'other games are unaffected');

  schemaLanguage.set('1392860', null);
  assert.equal(schemaLanguage.get('1392860'), null);
});

test('only real Steam language names are stored', () => {
  schemaLanguage.set('1', 'klingon');
  assert.equal(schemaLanguage.get('1'), null);
  fs.writeFileSync(schemaLanguage.file(), JSON.stringify({ 2: '../../x' }));
  assert.equal(schemaLanguage.get('2'), null, 'a hand-edited value cannot become a cache path');
});
