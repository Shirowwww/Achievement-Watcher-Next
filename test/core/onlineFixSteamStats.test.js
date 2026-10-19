'use strict';

// OnlineFix's Friend's Pass leaves achievements to the real Steam client, which is where the
// library has to read them (Little Nightmares III, cs.rin.ru report of 2026-10-19).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectWorkingCrackLoader, leavesStatsToSteam } = require('../../app/util/crackLoaderDetect.js');

function onlineFixFolder(t, ini) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-onlinefix-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'OnlineFix64.dll'), 'stub');
  if (ini != null) fs.writeFileSync(path.join(dir, 'OnlineFix.ini'), ini);
  return detectWorkingCrackLoader(dir);
}

test('a Friend\'s Pass setup that turns off its own UserStats leaves stats to Steam', (t) => {
  const loader = onlineFixFolder(t, '[Main]\r\nRealAppId=1392860\r\n\r\n[Interfaces]\r\nApps=true\r\nUserStats=false\r\n\r\n[DLC]\r\n1=x\r\n');
  assert.equal(loader.name, 'OnlineFix');
  assert.equal(leavesStatsToSteam(loader), true);
});

test('OnlineFix keeps the stats itself when its UserStats interface is on', (t) => {
  assert.equal(leavesStatsToSteam(onlineFixFolder(t, '[Interfaces]\nUserStats=true\n')), false);
});

test('only the [Interfaces] section decides, and a missing ini decides nothing', (t) => {
  assert.equal(leavesStatsToSteam(onlineFixFolder(t, '[Main]\nUserStats=false\n[Interfaces]\nUser=false\n')), false);
  assert.equal(leavesStatsToSteam(onlineFixFolder(t, '[Interfaces]\nUserStats=false')), true, 'last section, no trailing newline');
  assert.equal(leavesStatsToSteam(onlineFixFolder(t, null)), false);
  assert.equal(leavesStatsToSteam(null), false);
  assert.equal(leavesStatsToSteam({ name: 'ALI213', dir: os.tmpdir() }), false);
});
