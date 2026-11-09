'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { compareBundledAssets } = require('../../app/build/verifyBundledAssets.js');

function tree(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-bundled-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

const SOURCES = {
  'presets/Default Presets/Steam/index.html': '<p>steam</p>',
  'presets/Default Presets/Steam/README.md': 'kept out of builds',
  'sounds/xbox.wav': 'RIFF',
};

test('a build that ships the sources file for file passes', (t) => {
  const source = tree(t, SOURCES);
  const shipped = tree(t, { 'presets/Default Presets/Steam/index.html': '<p>steam</p>', 'sounds/xbox.wav': 'RIFF' });
  assert.deepEqual(compareBundledAssets(source, shipped), []);
});

test('a stale, missing or extra preset or sound fails the build', (t) => {
  const source = tree(t, SOURCES);
  const shipped = tree(t, { 'presets/Default Presets/Steam/index.html': '<p>old</p>', 'sounds/extra.wav': 'RIFF' });
  assert.deepEqual(compareBundledAssets(source, shipped), [
    'presets/Default Presets/Steam/index.html: differs from the sources',
    'sounds/xbox.wav: missing from the build',
    'sounds/extra.wav: not in the sources',
  ]);
});

test('a folder the build lost entirely is reported once', (t) => {
  const source = tree(t, SOURCES);
  const shipped = tree(t, { 'presets/Default Presets/Steam/index.html': '<p>steam</p>' });
  assert.deepEqual(compareBundledAssets(source, shipped), ['sounds: missing from the build']);
});
