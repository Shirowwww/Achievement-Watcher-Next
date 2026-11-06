'use strict';

// The library leaves out an EA game run from EA's own install folders (it is owned, and EA Desktop
// shows its unlocks); the live watcher must leave it out too, or a toast names a hidden game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readStates } = require('../console/eaWatch.js')._internal;

const SET = '196716_1234567_50844';

function logWith(t, installPath) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ea-official-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const logs = path.join(root, 'Electronic Arts', 'EA Desktop', 'Logs');
  fs.mkdirSync(logs, { recursive: true });
  const lines = [
    `{"installPath":"${installPath}","masterTitleId":"1234567","offerId":"Origin.OFR.50.0001234"}`,
    'Launched game details: titleName[Synthetic Game] offerId[Origin.OFR.50.0001234] masterTitleId[1234567]',
    `<AchievementSet Name="${SET}" GameName="Synthetic Game"><Achievement Id="1" Name="First" Count="1" GrantDate="2026-09-01T10:00:00Z" ImageId="achieve:${SET}-1"/></AchievementSet>`,
  ];
  fs.writeFileSync(path.join(logs, 'EADesktopVerbose.log'), lines.join('\n'));
  return logs;
}

test('a game installed in an EA managed folder is not watched', (t) => {
  assert.deepEqual(readStates(logWith(t, 'C:/Program Files/EA Games/Synthetic Game/')), []);
});

test('the same game installed elsewhere is watched', (t) => {
  const states = readStates(logWith(t, 'D:/Games/Synthetic Game/'));
  assert.equal(states.length, 1);
  assert.equal(states[0].entry.name, 'Synthetic Game');
});
