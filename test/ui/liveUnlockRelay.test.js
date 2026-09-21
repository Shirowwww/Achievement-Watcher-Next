'use strict';

// An unlock has to move the open library's tile, not only pop a notification. The renderer handler
// outlived its only sender in the Electron 42 rewrite, so for months a tile moved only on a restart
// (Little Nightmares II: the health panel said 26/35 while the tile still said 11%). These pin the
// three hops, Watchdog -> main -> renderer, so one of them cannot silently go missing again.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { rendererSource } = require('../helpers/rendererSource.js');
const { mainProcessSource } = require('../helpers/mainProcessSource.js');
const init = mainProcessSource();
const renderer = rendererSource();
const watchdog = fs.readFileSync(path.join(__dirname, '..', '..', 'watchdog', 'watchdog.js'), 'utf8');

function sliceFunction(source, signature, end = '\n}') {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  const body = source.slice(start);
  return body.slice(0, body.indexOf(end));
}

test('the Watchdog reports every new unlock, before the gates that only decide the notification', () => {
  const report = sliceFunction(watchdog, 'function reportUnlockToApp(game, name, unlockTime) {');
  assert.match(report, /process\.send\(\{\s*achievementUnlocked: \{/);
  assert.match(report, /steamappid: String\(game\.steamappid \|\| ''\)/);

  const seedGate = watchdog.indexOf('if (seedOnly && !seedPreview) continue;');
  const call = watchdog.indexOf('reportUnlockToApp(game, ach.name, achievements[i].UnlockTime);');
  const timestampGate = watchdog.indexOf('options.disableCheckTimestamp', seedGate);
  const dedupGate = watchdog.indexOf('notificationDedup.shouldNotify', seedGate);
  assert.ok(seedGate !== -1 && call > seedGate, 'baseline seeding must not report old unlocks as new');
  assert.ok(call < timestampGate, 'an unlock too old to toast still has to reach the library');
  assert.ok(call < dedupGate, 'a suppressed duplicate toast is still a counted unlock');
});

test('the main process forwards it to the window, hidden or not', () => {
  const handler = sliceFunction(init, 'function handleMonitorMessage(msg) {');
  assert.match(handler, /msg\.achievementUnlocked\) forwardUnlockToLibrary\(msg\.achievementUnlocked\)/);

  const forward = sliceFunction(init, 'function forwardUnlockToLibrary(unlock) {');
  assert.match(forward, /MainWin\.webContents\.send\('achievement-unlock', \{/);
  assert.doesNotMatch(forward, /isVisible\(\)/, 'closing to the tray keeps the page, so a hidden one must be updated too');
});

test('the renderer matches either appid and moves both the tile and the profile header', () => {
  const start = renderer.indexOf("ipcRenderer.on('achievement-unlock',");
  assert.notEqual(start, -1);
  const handler = renderer.slice(start, renderer.indexOf('\n});', start));
  assert.match(handler, /const ids = \[appid, steamappid\]/);
  assert.match(handler, /updateGameBox\(game\.appid,/);
  assert.match(handler, /refreshProfileStats\(\)/);
  assert.match(handler, /UnlockTime = Number\(ach_data\.UnlockTime\) \|\| Date\.now\(\) \/ 1000/);
});
