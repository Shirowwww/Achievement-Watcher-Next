'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const monitor = require('../monitor.js');

function writeTemp(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-monitorparse-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return { dir, file };
}

// State-less RLD! build: the unlock is carried by Time alone, stored as a 10-hex little-endian
// uint32 blob. Epoch 1712575690 (0x6613D4CA) is written "cad4136600".
test('monitor.parse decodes a State-less RLD! time blob instead of passing raw hex', async () => {
  const { dir, file } = writeTemp('achievements.ini', '[ACH_WIN]\nTime=cad4136600\n\n[ACH_LOCKED]\nTime=0\n');
  try {
    const achievements = await monitor.parse(file);
    const win = achievements.find((a) => a.name === 'ACH_WIN');
    assert.equal(win.UnlockTime, 1712575690);
    assert.equal(win.Achieved, true);
    const locked = achievements.find((a) => a.name === 'ACH_LOCKED');
    assert.equal(locked.Achieved, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('monitor.parse scales a truncated 7-digit CreamAPI unlocktime to epoch millis', async () => {
  const { dir, file } = writeTemp('achievements.ini', '[ACH_ONE]\nachieved=true\nunlocktime=1712253\n');
  try {
    const achievements = await monitor.parse(file);
    const one = achievements.find((a) => a.name === 'ACH_ONE');
    assert.equal(one.Achieved, true);
    assert.equal(one.UnlockTime, 1712253000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The watcher's filename filter is case-insensitive (NTFS is), so the casing that reaches parse()
// is whatever is on disk. Dispatching on the exact name sent these to ini.parse, which reads a
// RAZOR1911 file as one meaningless key and a binary stats file as nothing.
test('monitor.parse dispatches on the format, not on the casing the file happens to have', async () => {
  const { dir, file } = writeTemp('Achievement', 'ACH_WIN 1 1712575690\nACH_LOCKED 0 0\n');
  try {
    const achievements = await monitor.parse(file);
    const win = achievements.find((a) => a.name === 'ACH_WIN');
    assert.equal(win.Achieved, true);
    assert.equal(win.UnlockTime, 1712575690);
    assert.equal(achievements.find((a) => a.name === 'ACH_LOCKED').Achieved, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
