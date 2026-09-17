'use strict';

/*
  The "Progress counters" row: shown only for a save that keeps stats apart from its unlocks
  (CODEX, RUNE, OnlineFix), green when a stat -> achievement table exists, and otherwise a calm
  INFO row offering the anonymous fetch. It must never turn a working game into "needs attention".
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { deriveHealth, STATE, LEVEL, ACTION } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));
const statProgress = require(path.join(__dirname, '..', '..', 'app', 'parser', 'statProgress.js'));

function codexGame(counters) {
  return {
    appid: '1659420',
    name: 'Uncharted',
    source: 'Codex',
    gameDir: 'C:/Jeux/Uncharted',
    gameDirExists: true,
    installed: true,
    exe: 'C:/Jeux/Uncharted/u4.exe',
    exeExists: true,
    achievements: { total: 13, unlocked: 5 },
    tracking: { indexed: true, binary: 'u4.exe' },
    processTracking: true,
    counters,
  };
}

test('no stats in the save: no counters row', () => {
  const report = deriveHealth(codexGame(null));
  assert.equal(report.checks.find((c) => c.id === 'counters'), undefined);
});

test('stats with a table: OK row, no action', () => {
  const report = deriveHealth(codexGame({ stats: 20, count: 4, source: 'steam', canFetch: true }));
  const row = report.checks.find((c) => c.id === 'counters');
  assert.equal(row.level, LEVEL.OK);
  assert.equal(row.params.source, 'steam');
  assert.ok(!report.actions.includes(ACTION.FETCH_PROGRESS));
});

test('stats without a table: INFO row offering the fetch, state unchanged', () => {
  const report = deriveHealth(codexGame({ stats: 20, count: 0, source: null, canFetch: true }));
  const row = report.checks.find((c) => c.id === 'counters');
  assert.equal(row.level, LEVEL.INFO);
  assert.deepEqual(row.actions, [ACTION.FETCH_PROGRESS]);
  assert.notEqual(report.state, STATE.NOT_TRACKING);
  assert.equal(report.state, deriveHealth(codexGame(null)).state);
});

test('countSaveStats reads CODEX [UserStats] and ignores a save without stats', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-counters-'));
  try {
    assert.equal(statProgress.countSaveStats(dir), 0);
    fs.writeFileSync(path.join(dir, 'stats.ini'), '[UserStats]\r\nkill-headshot=149\r\npick-up-treasure=23\r\n');
    assert.equal(statProgress.countSaveStats(dir), 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a generate_emu_config output left in the tool folder is a saved table', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-counters-ud-'));
  try {
    const out = path.join(userData, 'cache', 'gse_emu_config', '2026_02_16', 'generate_emu_config', '_OUTPUT', '42', 'steam_settings');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, 'achievements.json'),
      JSON.stringify([
        { name: 'A', displayName: 'A' },
        { name: 'B', progress: { max_val: '10', value: { operation: 'statvalue', operand1: 'stat_b' } } },
      ])
    );
    const found = statProgress.findProgressSchema({ appid: '42', localSchema: [], steamStatsDir: null, cacheDir: userData });
    assert.equal(found.origin, 'saved');
    assert.deepEqual(found.schema.map((a) => a.name), ['B']);
    assert.equal(statProgress.findProgressSchema({ appid: '43', localSchema: [], cacheDir: userData }).origin, null);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('Steam says no achievement has a counter: OK row, no fetch offered', () => {
  const report = deriveHealth(codexGame({ stats: 20, count: 0, source: null, official: 0, canFetch: true }));
  const row = report.checks.find((c) => c.id === 'counters');
  assert.equal(row.level, LEVEL.OK);
  assert.equal(row.params.none, true);
  assert.ok(!report.actions.includes(ACTION.FETCH_PROGRESS));
});

test('Steam lists counters that are not here yet: INFO row naming how many, fetch offered', () => {
  const report = deriveHealth(codexGame({ stats: 20, count: 0, source: null, official: 8, canFetch: true }));
  const row = report.checks.find((c) => c.id === 'counters');
  assert.equal(row.level, LEVEL.INFO);
  assert.equal(row.params.official, 8);
  assert.deepEqual(row.actions, [ACTION.FETCH_PROGRESS]);
});

test('officialProgressCount counts progress_type, caches it, and keeps a failure as null', async () => {
  assert.equal(statProgress.countOfficialProgress({ achievements: [{ progress_type: 0 }, { progress_type: 1 }, { progress_type: 2 }] }), 2);
  assert.equal(statProgress.countOfficialProgress({}), null);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-counters-official-'));
  try {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => ({ response: { achievements: [{ progress_type: 1 }, { progress_type: 0 }] } }) };
    };
    assert.equal(await statProgress.officialProgressCount('1086940', { cacheDir: userData, fetchImpl }), 1);
    assert.equal(await statProgress.officialProgressCount('1086940', { cacheDir: userData, fetchImpl }), 1);
    assert.equal(calls, 1);
    assert.equal(await statProgress.officialProgressCount('7', { cacheDir: userData, fetchImpl: async () => ({ ok: false }) }), null);
    assert.equal(await statProgress.officialProgressCount('socialclub-x', { cacheDir: userData, fetchImpl }), null);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
