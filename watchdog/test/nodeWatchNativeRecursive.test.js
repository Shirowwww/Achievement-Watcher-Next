'use strict';

/*
  node-watch times a probe watch for 200 ms to decide whether fs.watch recurses natively. A Watchdog
  busy starting up missed that window, fell back to one watcher per folder, and then never saw a save
  written in the same burst as its new appid folder: a game's very first unlock went unnotified
  (found by an end-to-end run with a GBE build, 2026-10-13).
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('the save of a brand-new appid folder is seen even when the Watchdog starts busy', async (t) => {
  if (process.platform !== 'win32') return t.skip('Windows watcher behaviour');
  const watch = require('../util/nodeWatch.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-native-recursive-'));
  const events = [];
  const watcher = watch(root, { recursive: true, filter: /([0-9]+)/ }, (evt, name) => events.push(path.relative(root, name)));
  try {
    // A startup's worth of synchronous work, longer than node-watch's 200 ms probe.
    const busyUntil = Date.now() + 400;
    while (Date.now() < busyUntil) {
      /* blocked event loop */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The emulator creates the folder and writes its first save back to back, from its own process.
    const dir = path.join(root, '3357650');
    const burst = `const fs=require('fs');fs.mkdirSync(${JSON.stringify(dir)});fs.writeFileSync(${JSON.stringify(path.join(dir, 'achievements.json'))},'{}');`;
    execFileSync(process.execPath, ['-e', burst]);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    assert.ok(events.includes(path.join('3357650', 'achievements.json')), `the first save was missed; events: ${JSON.stringify(events)}`);
  } finally {
    watcher.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows is answered up front, not probed against a timer', (t) => {
  if (process.platform !== 'win32') return t.skip('Windows watcher behaviour');
  require('../util/nodeWatch.js');
  let answer;
  require('node-watch/lib/has-native-recursive')((has) => {
    answer = has;
  });
  assert.equal(answer, true, 'answered synchronously, so no startup load can turn it into a fallback');
});
