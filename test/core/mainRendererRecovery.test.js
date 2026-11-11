'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recovery = require('../../app/electron/mainRendererRecovery.js');

const init = fs.readFileSync(path.join(__dirname, '../../app/electron/init.js'), 'utf8');
const NOW = 1_000_000_000;

test('a crashed main window is reloaded the first time', () => {
  assert.equal(recovery.decide({ reason: 'crashed' }, 0, NOW), 'reload');
  assert.equal(recovery.decide({ reason: 'oom' }, 0, NOW), 'reload');
});

test('a window closed or released on purpose is left alone', () => {
  assert.equal(recovery.decide({ reason: 'clean-exit' }, 0, NOW), 'ignore');
  assert.equal(recovery.decide(undefined, 0, NOW), 'ignore');
});

test('a second loss soon after a reload closes the window instead of looping', () => {
  assert.equal(recovery.decide({ reason: 'crashed' }, NOW - 30_000, NOW), 'close');
  // Long after the last reload, a new loss is a new incident and is reloaded again.
  assert.equal(recovery.decide({ reason: 'crashed' }, NOW - recovery.RELOAD_AGAIN_AFTER_MS - 1, NOW), 'reload');
});

test('the main window acts on a lost renderer instead of staying an invisible frame', () => {
  assert.match(init, /getRemoteMain\(\)\.enable\(MainWin\.webContents\);\s*watchMainRenderer\(MainWin\);/);
  assert.match(init, /function watchMainRenderer\(win\) \{\s*win\.webContents\.on\('render-process-gone'/);
  // Reopening from the tray over a dead page makes a new window rather than showing the dead one.
  assert.match(init, /MainWin\.webContents\.isCrashed\(\)\) \{[\s\S]{0,120}?MainWin\.once\('closed', \(\) => createMainWindow\(\)\);\s*MainWin\.destroy\(\);/);
  // The status poller no longer writes to a frame that is gone (the reporter's terminal spam).
  assert.match(init, /const sendWatchdogStatus = \(state\) => \{\s*if \(!MainWin \|\| MainWin\.isDestroyed\(\) \|\| MainWin\.webContents\.isCrashed\(\)\) return;/);
});
