'use strict';

// games-infos-datas fills the stat table for a CODEX/RUNE save no Steam client ever cached. Every
// read goes through util/gamesInfosDatas.js, which remembers a missing file and retries an outage.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gamesInfosDatas = require('../../app/util/gamesInfosDatas.js');
const { applyLocalStatProgress, fetchCommunityProgressSchema, resolveProgressSchema } = require('../../app/parser/statProgress.js');

// Portal's shape, as the repository publishes it.
const PORTAL = [
  { name: 'PORTAL_BEAT_GAME', hidden: false },
  { name: 'PORTAL_TRANSMISSION_RECEIVED', hidden: false, stats_thresholds: [{ stat_name: 'PORTAL_TRANSMISSION_RECEIVED_STAT', min_val: 0, max_val: 26 }] },
  { name: 'BROKEN', stats_thresholds: [{ stat_name: 'X', min_val: 0, max_val: 0 }] },
];

const notFound = async () => {
  throw { code: 404 };
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-community-progress-'));
  try {
    const entries = await fetchCommunityProgressSchema('400', { cacheDir: tmp, getJson: async () => PORTAL });
    assert.deepEqual(entries, [
      {
        name: 'PORTAL_TRANSMISSION_RECEIVED',
        progress: { min_val: 0, max_val: 26, value: { operation: 'statvalue', operand1: 'PORTAL_TRANSMISSION_RECEIVED_STAT' } },
      },
    ]);
    console.log('PASS: only rows with a stat and a goal become progress entries');

    const cached = resolveProgressSchema({ appid: '400', localSchema: [], steamStatsDir: null, cacheDir: tmp });
    const root = { PORTAL_TRANSMISSION_RECEIVED_STAT: '30' };
    assert.equal(applyLocalStatProgress(root, cached), 1);
    assert.equal(root.PORTAL_TRANSMISSION_RECEIVED.CurProgress, 26);
    assert.equal(root.PORTAL_TRANSMISSION_RECEIVED.MaxProgress, 26);
    console.log('PASS: the fetched table is cached and maps a stats.ini value');

    let calls = 0;
    const missing = async () => {
      calls++;
      return notFound();
    };
    assert.deepEqual(await fetchCommunityProgressSchema('3748520', { cacheDir: tmp, getJson: missing }), []);
    assert.deepEqual(await fetchCommunityProgressSchema('3748520', { cacheDir: tmp, getJson: missing }), []);
    assert.equal(calls, 1);
    let noCounterCalls = 0;
    const plain = async () => {
      noCounterCalls++;
      return [{ name: 'A' }];
    };
    await fetchCommunityProgressSchema('620', { cacheDir: tmp, getJson: plain });
    await fetchCommunityProgressSchema('620', { cacheDir: tmp, getJson: plain });
    assert.equal(noCounterCalls, 1);
    console.log('PASS: a game missing there, or with no counter, is not asked for again');

    let outage = 0;
    const down = async () => {
      outage++;
      throw { code: 'ETIMEOUT' };
    };
    await fetchCommunityProgressSchema('570', { cacheDir: tmp, getJson: down });
    await fetchCommunityProgressSchema('570', { cacheDir: tmp, getJson: down });
    assert.equal(outage, 2);
    console.log('PASS: an outage is retried later, not recorded as a miss');

    assert.deepEqual(await gamesInfosDatas.readJson('steam/400/achievements_db.json', { getJson: async () => `${String.fromCharCode(0xfeff)}[{"Name":"X"}]` }), [{ Name: 'X' }]);
    console.log('PASS: a BOM-prefixed file parses');

    assert.deepEqual(await fetchCommunityProgressSchema('local-1a2b', { cacheDir: tmp, getJson: async () => PORTAL }), []);
    console.log('PASS: a non-Steam id is never looked up');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

