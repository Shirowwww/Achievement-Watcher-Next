'use strict';

// Playtime skips what the library blacklist hides: its built-in utility appids and cfg/exclusion.db.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-playtime-exclusions-'));
process.env.AW_USER_DATA = temp;
after(() => fs.rmSync(temp, { recursive: true, force: true }));
require('../util/userData.js').resetCache();

const { buildBinaryIndex } = require('../playtime/seed.js');
const { getTrackableGameMatches } = require('../playtime/monitor.js');
const blacklist = require('../../app/parser/blacklist.js');

const index = (appids) => buildBinaryIndex(appids.map((appid) => ({ appid, name: `Game ${appid}`, binary: 'game.exe' })));
const tracked = (appids) => getTrackableGameMatches(index(appids), 'game.exe').map((game) => game.appid);

test('the built-in blacklist of the library is never tracked for playtime', () => {
  for (const appid of blacklist.builtin) assert.deepEqual(tracked([String(appid)]), [], `${appid} is a Steam utility`);
  assert.deepEqual(tracked(['1091500']), ['1091500']);
});

test('an id the user hid in the library stops being tracked', () => {
  const file = blacklist.exclusionFileIn(temp);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify([1091500]));
  assert.deepEqual(tracked(['1091500', '70']), ['70']);
});
