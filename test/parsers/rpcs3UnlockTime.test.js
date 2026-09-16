'use strict';

// RPCS3 trophies used to come back with no unlock time at all: the reader looked at trophy_pid
// (always FFFFFFFF) instead of the state record's tick, under a key the merge never read.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// achievements.js pulls in the Electron renderer bridge on require (same stub as rldTimeOnlyUnlock.test.js).
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const rpcs3 = require('../../app/parser/rpcs3.js');
const achievements = require('../../app/parser/achievements.js');

const { RTC_TICK_UNIX_EPOCH } = rpcs3._internal;

// Real layout: header, two header delimiters, trophy records (type 4), then state records (type 6).
function buildUserData(trophies) {
  const chunks = [Buffer.from('818F54AD', 'hex'), Buffer.from('0400000050', 'hex'), Buffer.from('0400000050', 'hex')];
  const records = [];
  for (const t of trophies) {
    const r = Buffer.alloc(0x50, 0);
    r.writeInt32BE(t.id, 0);
    r.writeInt32BE(t.id, 8);
    r.writeUInt32BE(0xffffffff, 16);
    records.push([Buffer.from('0400000050', 'hex'), r]);
  }
  for (const t of trophies) {
    const s = Buffer.alloc(0x60, 0);
    s.writeInt32BE(t.id, 0);
    s.writeInt32BE(t.id, 8);
    s.writeInt32BE(t.time ? 1 : 0, 12);
    if (t.time) {
      const tick = BigInt(t.time) * 1000000n + RTC_TICK_UNIX_EPOCH + 123456n;
      s.writeBigUInt64BE(tick, 24);
      s.writeBigUInt64BE(tick, 32);
    }
    records.push([Buffer.from('0600000060', 'hex'), s]);
  }
  records.forEach(([delim, record], i) => chunks.push(...(i > 0 ? [delim] : []), record));
  return Buffer.concat(chunks);
}

test('an RPCS3 unlock carries its real time, a locked trophy none', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rpcs3-time-'));
  fs.writeFileSync(path.join(dir, 'TROPUSR.DAT'), buildUserData([{ id: 0, time: 0 }, { id: 1, time: 1757980800 }]));

  const list = await rpcs3.getAchievements(dir);
  assert.deepEqual(
    list.map((t) => [t.id, t.achieved, t.earned_time]),
    [
      [0, false, 0],
      [1, true, 1757980800],
    ]
  );
});

test('the shared merge reads the RPCS3 unlock time', () => {
  const { normalizeSaveEntry } = achievements._internal;
  assert.equal(normalizeSaveEntry({ id: 1, achieved: true, earned_time: 1757980800 }, 'RPCS3 Emulator').UnlockTime, 1757980800);
});
