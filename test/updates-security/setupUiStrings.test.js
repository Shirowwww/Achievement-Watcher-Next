'use strict';

/*
  The setup window's text (native/setup-ui/strings.json). build.rs quietly falls back to English for
  a missing translation so a half-translated tree still compiles; this is where that is refused, and
  where the Rust side is held to the same keys.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const crate = path.join(__dirname, '..', '..', 'native', 'setup-ui');
const strings = JSON.parse(fs.readFileSync(path.join(crate, 'strings.json'), 'utf8'));
const languages = strings._languages;
const keys = Object.keys(strings).filter((key) => !key.startsWith('_'));
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('every key is translated into every language', () => {
  for (const key of keys) {
    for (const language of languages) {
      assert.ok(String(strings[key][language] || '').trim(), `${key} is missing for ${language}`);
    }
    assert.deepEqual(Object.keys(strings[key]).sort(), [...languages].sort(), `${key} carries an unknown language`);
  }
});

test('translations keep the placeholders and the house punctuation', () => {
  for (const key of keys) {
    const expected = placeholders(strings[key].en);
    for (const language of languages) {
      const text = strings[key][language];
      assert.deepEqual(placeholders(text), expected, `${key} (${language}) changed its placeholders`);
      assert.doesNotMatch(text, /[–—]/, `${key} (${language}) uses a dash the project bans`);
    }
  }
});

test('every key the Rust side names exists, and no key goes unused', () => {
  const source = fs
    .readdirSync(path.join(crate, 'src'))
    .map((file) => fs.readFileSync(path.join(crate, 'src', file), 'utf8'))
    .join('\n');
  const used = new Set([...source.matchAll(/Text::([A-Z][A-Za-z]+)/g)].map((match) => match[1]));
  const variant = (key) => key.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  for (const key of keys) assert.ok(used.has(variant(key)), `${key} is never shown`);
});

test('the language picker of the window maps the same languages as NSIS', () => {
  const picker = fs.readFileSync(path.join(crate, 'src', 'strings.rs'), 'utf8');
  for (const language of languages) {
    if (language === 'en') continue;
    assert.ok(picker.includes(`"${language}"`), `strings.rs never selects ${language}`);
  }
});
