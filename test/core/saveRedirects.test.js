'use strict';

// cfg/saveRedirects.json hands the Watchdog the save folders GBE installs redirect to, which it
// cannot find on its own because it never reads steam_settings.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const saveRedirects = require('../../app/util/saveRedirects.js');

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-redirects-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settingsA = path.join(dir, 'GameA', 'steam_settings');
  const settingsB = path.join(dir, 'GameB', 'steam_settings');
  fs.mkdirSync(settingsA, { recursive: true });
  fs.mkdirSync(settingsB, { recursive: true });
  return { file: saveRedirects.redirectsFile(dir), settingsA, settingsB, dir };
}

test('a scan records each redirect and the Watchdog reads the folders back', (t) => {
  const { file, settingsA, settingsB, dir } = sandbox(t);
  const savesA = path.join(dir, 'GameA', 'saves');
  assert.equal(saveRedirects.update(file, new Map([[settingsA, savesA], [settingsB, '']])), true);
  assert.deepEqual(saveRedirects.roots(file), [savesA]);
  assert.equal(saveRedirects.update(file, new Map([[settingsA, savesA]])), false, 'no change, no write');
});

test('a scoped scan keeps the games it did not see, and a removed redirect is dropped', (t) => {
  const { file, settingsA, settingsB, dir } = sandbox(t);
  const savesA = path.join(dir, 'GameA', 'saves');
  const savesB = path.join(dir, 'GameB', 'saves');
  saveRedirects.update(file, new Map([[settingsA, savesA], [settingsB, savesB]]));
  saveRedirects.update(file, new Map([[settingsB, savesB]]));
  assert.deepEqual(saveRedirects.roots(file).sort(), [savesA, savesB].sort());
  saveRedirects.update(file, new Map([[settingsA, '']]));
  assert.deepEqual(saveRedirects.roots(file), [savesB]);
});

test('an uninstalled game stops being watched', (t) => {
  const { file, settingsA, dir } = sandbox(t);
  saveRedirects.update(file, new Map([[settingsA, path.join(dir, 'GameA', 'saves')]]));
  fs.rmSync(path.dirname(settingsA), { recursive: true, force: true });
  saveRedirects.update(file, new Map());
  assert.deepEqual(saveRedirects.roots(file), []);
});

test('a missing or broken file means no redirect', (t) => {
  const { file } = sandbox(t);
  assert.deepEqual(saveRedirects.roots(file), []);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(saveRedirects.roots(file), []);
});
