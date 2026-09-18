'use strict';

/*
  A save exported by Playnite or PowerShell starts with a UTF-8 BOM. JSON.parse rejects it, so the
  whole game fell back to the few achievements found elsewhere (57 saved, 3 shown).
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const steam = require('../../app/parser/steam.js');

test('achievements.json with a BOM is still read', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-bom-'));
  try {
    const body = JSON.stringify({ Boss_01: { earned: true, earned_time: 1785365760 } });
    fs.writeFileSync(path.join(dir, 'achievements.json'), String.fromCharCode(0xfeff) + body);
    const result = await steam.getAchievementsFromFile(dir);
    assert.deepEqual(Object.keys(result), ['Boss_01']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
