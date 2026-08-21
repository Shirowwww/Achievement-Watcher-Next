'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { BUNDLED_LOCALE_COUNT } = require('../helpers/locales.js');

const repoLocaleDir = path.join(__dirname, '..', '..', 'app', 'locale', 'lang');
const watchdogLocaleFile = path.join(__dirname, '..', '..', 'watchdog', 'locale.json');

test('watchdog locale.json mirrors the app locale watchdog section', () => {
  const english = JSON.parse(fs.readFileSync(path.join(repoLocaleDir, 'english.json'), 'utf8')).watchdog || {};
  const watchdog = JSON.parse(fs.readFileSync(watchdogLocaleFile, 'utf8'));
  const expectedKeys = Object.keys(english).sort();
  assert.ok(expectedKeys.length >= 8, 'the app locale must define the watchdog section');
  const files = fs.readdirSync(repoLocaleDir).filter((file) => file.endsWith('.json')).sort();
  assert.strictEqual(files.length, BUNDLED_LOCALE_COUNT);
  for (const file of files) {
    const lang = file.replace(/\.json$/, '');
    const section = watchdog[lang] || {};
    assert.deepStrictEqual(Object.keys(section).sort(), expectedKeys, `${lang} watchdog strings must match English keys`);
    for (const key of expectedKeys) {
      assert.ok(String(section[key] || '').trim(), `${lang}: watchdog.${key} must be translated`);
    }
  }
});

/*
  Key parity alone let the mirror keep the *wrong words*: Hungarian and Italian notifications said
  "Eredmeny" and "Risultato" long after the app had settled on "Teljesitmeny" and "Obiettivo",
  because both files had the same sixteen keys. The mirror is generated now, so compare the file to
  what the generator produces rather than to its own shape.
*/
test('watchdog locale.json is what tools/sync-watchdog-locale.js generates', () => {
  const sync = require(path.join(__dirname, '..', '..', 'tools', 'sync-watchdog-locale.js'));
  assert.equal(
    fs.readFileSync(watchdogLocaleFile, 'utf8'),
    sync.build(),
    'run "node tools/sync-watchdog-locale.js" to refresh the Watchdog mirror'
  );
});
