'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const monitor = require('../monitor.js');

// RAZOR1911 stores a plain-text `achievement` file: "<apiname> <0|1> <epoch seconds>" per line.
test('monitor.parse reads a RAZOR1911 achievement file', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-razor-parse-'));
  try {
    const file = path.join(tmp, 'achievement');
    fs.writeFileSync(file, 'ACH_FIRST 1 1712253396\nACH_SECOND 0 0\ngarbage line without numbers\n', 'utf8');

    const achievements = await monitor.parse(file);
    const first = achievements.find((a) => a.name === 'ACH_FIRST');
    const second = achievements.find((a) => a.name === 'ACH_SECOND');
    assert.ok(first, 'unlocked entry is parsed');
    assert.equal(first.Achieved, true);
    assert.equal(first.UnlockTime, 1712253396);
    assert.ok(second, 'locked entry is parsed');
    assert.equal(second.Achieved, false);
    assert.equal(achievements.some((a) => String(a.name).startsWith('garbage')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
