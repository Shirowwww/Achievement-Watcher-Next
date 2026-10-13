'use strict';

// EADesktopVerbose.log grows to tens of MB. The Watchdog caches its parse for as long as it runs,
// and a value cut out of the log text by a regex can keep that whole text alive in V8.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
const vm = require('vm');

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

const { parseLog } = require('../console/eaWatch.js')._internal;

const SET = '196716_1234567_50844';
const PADDING_MB = 4;

test('the cached parse of the EA log does not keep the log text in memory', (t) => {
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ea-watch-'));
  t.after(() => fs.rmSync(logs, { recursive: true, force: true }));
  // A character outside Latin-1 makes V8 hold the text two bytes per character, as a real log does.
  const filler = `${'VERB ł padding line '.repeat(5)}\n`;
  const lines = [
    'Launched game details: titleName[Synthetic Game] offerId[Origin.OFR.50.0001234] masterTitleId[1234567]',
    filler.repeat(Math.ceil((PADDING_MB * 1024 * 1024) / filler.length)),
    `<AchievementSet Name="${SET}" GameName="Synthetic Game"><Achievement Id="1" Name="First" Count="1" GrantDate="2026-09-01T10:00:00Z" ImageId="achieve:${SET}-1"/></AchievementSet>`,
  ];
  fs.writeFileSync(path.join(logs, 'EADesktopVerbose.log'), lines.join('\n'));
  gc();
  const before = process.memoryUsage().heapUsed;

  const parsed = parseLog(logs);
  /(?:)/.exec(''); // RegExp.input keeps the last subject alive until the next match anywhere
  gc();
  const retainedMb = (process.memoryUsage().heapUsed - before) / 1048576;

  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].name, 'Synthetic Game');
  assert.equal(parsed.snapshots.get(`1234567-${SET}`).has('1'), true);
  assert.ok(retainedMb < 2, `the parse retains ${retainedMb.toFixed(1)} MB for a ${PADDING_MB} MB log`);
});
