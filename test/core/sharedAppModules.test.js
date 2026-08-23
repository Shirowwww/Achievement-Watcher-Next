'use strict';

/*
  The Watchdog reaches app code through watchdog/util/sharedAppModule.js. In a packaged build that
  code lives inside resources/app.asar, which a plain `fs` read cannot open, so every module loaded
  that way has to be listed in `asarUnpack`. The failure is silent in a dev checkout - the app
  folder simply sits next to the watchdog folder there - and only shows up in an installed build,
  which is exactly the wrong place to find it. This derives the list from the source instead.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const builder = fs.readFileSync(path.join(root, 'app', 'electron-builder.yml'), 'utf8');

function watchdogSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'test') return [];
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return watchdogSources(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
}

function sharedRequests() {
  const found = new Set();
  for (const file of watchdogSources(path.join(root, 'watchdog'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/sharedAppModulePath\(\s*'([^']+)'\s*\)/g)) found.add(match[1]);
  }
  return [...found].sort();
}

function unpackedEntries() {
  const block = builder.match(/^asarUnpack:\n((?:\s+[-#].*\n)+)/m);
  assert.ok(block, 'electron-builder.yml still declares an asarUnpack list');
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

test('every app module the Watchdog loads through sharedAppModulePath is unpacked from the asar', () => {
  const requested = sharedRequests();
  assert.ok(requested.length > 0, 'the Watchdog still shares app modules');

  const unpacked = unpackedEntries();
  const covered = (rel) => unpacked.some((entry) => entry === rel || (entry.endsWith('/**') && rel.startsWith(entry.slice(0, -2))));

  const missing = requested.filter((rel) => !covered(rel));
  assert.deepEqual(missing, [], `add these to asarUnpack in app/electron-builder.yml: ${missing.join(', ')}`);
});

test('every shared module listed for the Watchdog exists and pulls in no further app code', () => {
  for (const rel of sharedRequests()) {
    const file = path.join(root, 'app', rel);
    assert.ok(fs.existsSync(file), `${rel} is required by the Watchdog but not in app/`);
    // A shared module that requires a sibling would need that sibling unpacked too, and nothing
    // states which. Keeping them dependency-free is the cheaper contract to hold.
    const relativeRequires = [...fs.readFileSync(file, 'utf8').matchAll(/require\(\s*'(\.[^']+)'\s*\)/g)].map((m) => m[1]);
    assert.deepEqual(relativeRequires, [], `${rel} requires ${relativeRequires.join(', ')}, which the packaged Watchdog cannot read`);
  }
});
