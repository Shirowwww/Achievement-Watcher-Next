'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { withPlatformText } = require(path.join(__dirname, '..', '..', 'app', 'locale', 'platformText.js'));

const localeDir = path.join(__dirname, '..', '..', 'app', 'locale', 'lang');

function bundle() {
  return {
    settings: { general: { startup: { name: 'Launch at startup', description: 'Starts with Windows.' } } },
    help: { quick: ['First', 'Data in %APPDATA%', 'Last'] },
    platform: {
      linux: {
        settings: { general: { startup: { description: 'Starts with your desktop session.' } } },
        help: { quick: { 1: 'Data in ~/.config' } },
      },
    },
  };
}

test('Windows keeps the reference text and loses only the platform block', () => {
  const source = bundle();
  const result = withPlatformText(source, 'win32');
  assert.equal(result.settings.general.startup.description, 'Starts with Windows.');
  assert.deepEqual(result.help.quick, ['First', 'Data in %APPDATA%', 'Last']);
  assert.equal(result.platform, undefined);
});

test('Linux replaces the overridden values and keeps the others', () => {
  const result = withPlatformText(bundle(), 'linux');
  assert.equal(result.settings.general.startup.description, 'Starts with your desktop session.');
  assert.equal(result.settings.general.startup.name, 'Launch at startup');
});

test('an index-keyed override replaces one line of a list without dropping the rest', () => {
  const result = withPlatformText(bundle(), 'linux');
  assert.deepEqual(result.help.quick, ['First', 'Data in ~/.config', 'Last']);
});

test('the source bundle is left untouched', () => {
  const source = bundle();
  const before = JSON.stringify(source);
  withPlatformText(source, 'linux');
  assert.equal(JSON.stringify(source), before);
});

test('an empty override keeps the reference text', () => {
  const source = bundle();
  source.platform.linux.settings.general.startup.description = '';
  const result = withPlatformText(source, 'linux');
  assert.equal(result.settings.general.startup.description, 'Starts with Windows.');
});

test('a bundle without a platform block comes back unchanged', () => {
  const source = { a: { b: 'c' } };
  assert.deepEqual(withPlatformText(source, 'linux'), { a: { b: 'c' } });
});

test('every Linux override in the bundled locales targets an existing string', () => {
  const english = JSON.parse(fs.readFileSync(path.join(localeDir, 'english.json'), 'utf8'));
  const missing = [];
  const walk = (override, target, at) => {
    for (const [key, value] of Object.entries(override)) {
      const where = `${at}.${key}`;
      const current = target == null ? undefined : target[key];
      if (value && typeof value === 'object') walk(value, current, where);
      else if (typeof current !== 'string') missing.push(where);
    }
  };
  walk(english.platform.linux, english, 'platform.linux');
  assert.deepEqual(missing, []);
});
