'use strict';

/*
  The Ubisoft -> Steam pairing table used to be read once per process. A row added to it - by an
  update applied in place, or by a hand fix - then stayed invisible until the app was restarted, and
  the game it describes kept being dropped for "no Steam equivalent". The table must answer from what
  is on disk now.
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const table = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplaySteamTable.js'));
const uplayR2 = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayR2.js'));

const PROBE_ID = '999999901';
const original = fs.readFileSync(table.file, 'utf8');
const originalTimes = fs.statSync(table.file);

// Move the timestamp forward explicitly: two writes inside the same millisecond are indistinguishable
// to any mtime-keyed cache, and that is a property of the clock, not of the code under test.
function writeTable(text, offsetSeconds) {
  fs.writeFileSync(table.file, text);
  const when = new Date(Date.now() + offsetSeconds * 1000);
  fs.utimesSync(table.file, when, when);
}

try {
  const before = table.rows().length;
  assert.ok(before > 0, 'the shipped table must not be empty');
  assert.strictEqual(table.find(PROBE_ID), null, 'the probe id must not already exist');
  assert.strictEqual(uplayR2.resolveSteamMapping({ appid: `UPLAY${PROBE_ID}` }), null, 'an unknown product resolves to nothing');

  const rows = JSON.parse(original);
  rows.push({ uplay_id: PROBE_ID, steam_appid: 480, steam_name: 'Probe Game', uplay_name: 'Probe Game' });
  writeTable(JSON.stringify(rows), 2);

  assert.strictEqual(table.rows().length, before + 1, 'a row added on disk is visible without a restart');
  assert.strictEqual(table.find(PROBE_ID)?.steam_appid, 480, 'the id index is rebuilt with the file');

  const resolved = uplayR2.resolveSteamMapping({ appid: `UPLAY${PROBE_ID}` });
  assert.ok(resolved, 'the Uplay R2 reader answers from the reloaded table');
  assert.strictEqual(resolved.steam_appid, 480);
  assert.strictEqual(resolved.steam_name, 'Probe Game');

  writeTable(original, 4);
  assert.strictEqual(table.rows().length, before, 'removing the row is picked up just as fast');
  assert.strictEqual(table.find(PROBE_ID), null);

  console.log('PASS: the uplay-steam table is re-read when it changes on disk');
} finally {
  fs.writeFileSync(table.file, original);
  fs.utimesSync(table.file, originalTimes.atime, originalTimes.mtime);
  table.invalidate();
}
