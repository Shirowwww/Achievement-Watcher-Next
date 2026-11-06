'use strict';

/*
  The Watchdog reaches app code through watchdog/util/sharedAppModule.js. In a packaged build that
  code lives inside resources/app.asar, which Electron's Node reads like a folder (the scan host,
  app/parser/scanWorker.js, loads the whole parser tree from it). Only a file started as a process or a
  worker thread has to sit outside the archive.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const { sharedAppModulePath } = require(path.join(root, 'watchdog', 'util', 'sharedAppModule.js'));
const { watchdogSharedModules } = require('../helpers/watchdogShared.js');

function withResourcesPath(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process, 'resourcesPath');
  const previous = process.resourcesPath;
  process.resourcesPath = value;
  try {
    return fn();
  } finally {
    if (had) process.resourcesPath = previous;
    else delete process.resourcesPath;
  }
}

test('every app module the Watchdog loads exists in app/', () => {
  const { requested, unread } = watchdogSharedModules();
  // A path the scan cannot read (a variable, an interpolated template) is a module it never checks.
  assert.deepEqual(unread, [], 'shared app modules must be named by a literal path');
  assert.ok(requested.length > 0, 'the Watchdog still shares app modules');
  const missing = requested.filter((rel) => !fs.existsSync(path.join(root, 'app', rel)));
  assert.deepEqual(missing, []);
});

test('a packaged Watchdog loads app modules from inside app.asar', () => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-resources-'));
  try {
    fs.writeFileSync(path.join(resources, 'app.asar'), '');
    const resolved = withResourcesPath(resources, () => sharedAppModulePath('util/winHosts.js'));
    assert.equal(resolved, path.join(resources, 'app.asar', 'util/winHosts.js'));
  } finally {
    fs.rmSync(resources, { recursive: true, force: true });
  }
});

test('a dev checkout loads app modules from the app folder beside the watchdog folder', () => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dev-resources-'));
  try {
    const resolved = withResourcesPath(resources, () => sharedAppModulePath('util/winHosts.js'));
    assert.equal(resolved, path.join(root, 'app', 'util/winHosts.js'));
  } finally {
    fs.rmSync(resources, { recursive: true, force: true });
  }
});

test('files started as a process or a worker thread stay outside the asar', () => {
  const builder = fs.readFileSync(path.join(root, 'app', 'electron-builder.yml'), 'utf8');
  const block = builder.match(/^asarUnpack:\n((?:\s+[-#].*\n)+)/m);
  assert.ok(block, 'electron-builder.yml still declares an asarUnpack list');
  for (const entry of ['parser/scanWorker.js', 'parser/xexWorker.js']) {
    assert.match(block[1], new RegExp(`- ${entry.replace(/[./]/g, '\\$&')}\\n`), `${entry} must be unpacked`);
  }
});
