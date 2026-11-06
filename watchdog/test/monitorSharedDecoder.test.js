'use strict';

// The Watchdog reads a save with the library's decoder (app/parser/emuSave.js), so a save the
// library reads one way is never announced another way.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const monitor = require('../monitor.js');
const winHosts = require('../../app/util/winHosts.js');

function writeTemp(t, name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shareddecoder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

const byName = (list) => Object.fromEntries(list.map((a) => [a.name, a]));

test('a GBE achievements.json written with a UTF-8 BOM is read, as the library reads it', async (t) => {
  const file = writeTemp(t, 'achievements.json', '﻿' + JSON.stringify({ ACH_WIN: { earned: true, earned_time: 1712575690 } }));
  const parsed = byName(await monitor.parse(file));
  assert.equal(parsed.ACH_WIN.Achieved, true);
  assert.equal(parsed.ACH_WIN.UnlockTime, 1712575690);
});

test('a 3DM save missing one Time entry keeps its other unlocks', async (t) => {
  const file = writeTemp(t, 'achievements.ini', '[State]\nACH_A=0101\nACH_B=0101\n\n[Time]\nACH_A=d01a156600\n');
  const parsed = byName(await monitor.parse(file));
  assert.equal(parsed.ACH_A.Achieved, true);
  assert.equal(parsed.ACH_A.UnlockTime, 0x66151ad0);
  assert.equal(parsed.ACH_B.Achieved, true, 'the unlock counts even without its date');
});

test('an explicit Unlocked=false is not overridden by a stray timestamp', async (t) => {
  const file = writeTemp(t, 'Achievements.ini', '[ACH_LOCKED]\nUnlocked=false\nUnlockTime=1712575690\n');
  const parsed = byName(await monitor.parse(file));
  assert.equal(parsed.ACH_LOCKED.Achieved, false);
});

test('TENOKE progress written inline on the achievement reaches the Watchdog', async (t) => {
  const file = writeTemp(t, 'user_stats.ini', '[ACHIEVEMENTS]\n"ACH_RUN" = "{unlocked=false, time=0, progress=7}"\n');
  const parsed = byName(await monitor.parse(file));
  assert.equal(parsed.ACH_RUN.Achieved, false);
  assert.equal(parsed.ACH_RUN.CurProgress, 7);
});

test('%APPDATA%\\Steam\\RUNE is watched on every host, as the library scans it', async () => {
  const folders = await monitor.getFolders([]);
  const dirs = new Set(folders.map((entry) => winHosts.pathKey(entry.dir)));
  const expected = winHosts.hostPaths('APPDATA', 'Steam', 'RUNE');
  assert.ok(expected.length > 0);
  for (const dir of expected) assert.ok(dirs.has(winHosts.pathKey(dir)), `${dir} must be watched`);
});
