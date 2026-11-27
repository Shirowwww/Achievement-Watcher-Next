'use strict';

// The library and the Watchdog both re-check one cached list (app/util/achievementListRecheck.js).
// The Watchdog keeps its copy in memory, and the app may write the file while Steam is being asked.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');
const { recheckCachedList } = require('../../app/util/achievementListRecheck.js');

const BASE = { name: 'ACH_1', displayName: 'One', description: 'First.', hidden: 0 };
const DLC = { name: 'DLC_1', displayName: 'Expansion', description: 'From the DLC.', hidden: 0 };

function cacheFile(record) {
  const file = path.join(makeTempDir('aw-list-recheck-'), '620.db');
  fs.writeFileSync(file, JSON.stringify({ name: 'Portal 2', appid: '620', achievement: { total: 1, list: [{ ...BASE }] }, ...record }));
  return file;
}

test('a list kept in memory picks up what the cached file already has, even inside the daily limit', async () => {
  const filePath = cacheFile({ achievement: { total: 2, list: [{ ...BASE }, { ...DLC }] }, unknownCheckedAt: Date.now() });
  const live = [{ ...BASE }];
  let asked = 0;
  const fetchSchema = async () => {
    asked += 1;
    return [{ ...BASE }, { ...DLC }];
  };

  assert.equal(await recheckCachedList({ filePath, list: live, fetchSchema }), 1);
  assert.equal(asked, 0, 'checked today, so Steam is not asked again');
  assert.deepEqual(
    live.map((entry) => entry.name),
    ['ACH_1', 'DLC_1']
  );
});

test('a write to the cached file made while Steam is being asked is kept', async () => {
  const filePath = cacheFile();
  const fetchSchema = async () => {
    const meanwhile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    meanwhile.img = { header: 'written by the app meanwhile' };
    fs.writeFileSync(filePath, JSON.stringify(meanwhile));
    return [{ ...BASE }, { ...DLC }];
  };

  assert.equal(await recheckCachedList({ filePath, list: [{ ...BASE }], fetchSchema }), 1);
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.deepEqual(saved.img, { header: 'written by the app meanwhile' });
  assert.deepEqual(
    saved.achievement.list.map((entry) => entry.name),
    ['ACH_1', 'DLC_1']
  );
});
