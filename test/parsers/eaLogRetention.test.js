'use strict';

// EADesktopVerbose.log grows to tens of MB. The parsed result is cached for the life of the process,
// and a value cut out of the log text by a regex can keep that whole text alive in V8, so this
// checks what the cache costs once the log has been read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
const vm = require('vm');

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

const ea = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ea.js'));

const SET = '196716_1234567_50844';
const PADDING_MB = 4;

function writeLog(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ea-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const logs = path.join(root, 'Electronic Arts', 'EA Desktop', 'Logs');
  fs.mkdirSync(logs, { recursive: true });
  // A character outside Latin-1 makes V8 hold the text two bytes per character, as a real log does.
  const filler = `${'VERB ł padding line '.repeat(5)}\n`;
  const lines = [
    'Launched game details: titleName[Synthetic Game] offerId[Origin.OFR.50.0001234] masterTitleId[1234567]',
    filler.repeat(Math.ceil((PADDING_MB * 1024 * 1024) / filler.length)),
    `<AchievementSet Name="${SET}" GameName="Synthetic Game"><Achievement Id="1" Name="First" Count="1" GrantDate="2026-09-01T10:00:00Z" ImageId="achieve:${SET}-1"/></AchievementSet>`,
  ];
  fs.writeFileSync(path.join(logs, ea.EA_VERBOSE_LOG_NAME), lines.join('\n'));
  return logs;
}

test('the cached parse of the EA log does not keep the log text in memory', (t) => {
  const logs = writeLog(t);
  gc();
  const before = process.memoryUsage().heapUsed;

  const parsed = ea.readEaDesktopVerboseLog(logs);
  /(?:)/.exec(''); // RegExp.input keeps the last subject alive until the next match anywhere
  gc();
  const retainedMb = (process.memoryUsage().heapUsed - before) / 1048576;

  const set = parsed.achievementSets.get(SET);
  assert.equal(set.gameName, 'Synthetic Game');
  assert.equal(set.offerId, 'Origin.OFR.50.0001234');
  assert.equal(set.achievements[0].earned, true);
  assert.ok(retainedMb < 2, `the parse retains ${retainedMb.toFixed(1)} MB for a ${PADDING_MB} MB log`);
});
