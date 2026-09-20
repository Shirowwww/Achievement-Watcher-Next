'use strict';

// Standalone test (run from app/ via: node --test "../test/parsers/appidOverride.test.js").
// Characterizes the per-install manual appid override store used by the right-click "Set AppID
// manually..." menu (app.js) and consulted by scanInstalledGoldbergGames (achievements.js) before
// the folder-name fuzzy match runs: get() is keyed by game folder (case-insensitive, path-resolved),
// persists across a fresh require of the module (simulating app restart), and an invalid/empty value
// clears the override.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const modulePath = path.join(__dirname, '..', '..', 'app', 'parser', 'appidOverride.js');
const appidOverride = require(modulePath);

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok   - ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL - ${name}\n         ${e.message}`);
    process.exitCode = 1;
  }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-appidoverride-'));
const gameDirA = path.join(temp, 'games', 'Some Game');
const gameDirB = path.join(temp, 'games', 'Some Other Game');

(async () => {
  appidOverride.setUserDataPath(temp);
  const storeFile = path.join(temp, 'cfg', 'appidOverride.json');

  try {
    await test('no override set → get() returns null', async () => {
      assert.strictEqual(appidOverride.get(gameDirA), null);
    });

    await test('set() persists and is readable', async () => {
      appidOverride.set(gameDirA, '3751950');
      assert.strictEqual(appidOverride.get(gameDirA), '3751950');
    });

    await test('get() is case-insensitive on the folder path', async () => {
      assert.strictEqual(appidOverride.get(gameDirA.toUpperCase()), '3751950');
    });

    await test('a numeric appid is coerced to a string', async () => {
      appidOverride.set(gameDirB, 242050);
      assert.strictEqual(appidOverride.get(gameDirB), '242050');
      assert.strictEqual(appidOverride.get(gameDirA), '3751950', 'unrelated folder stays intact');
    });

    await test('survives a fresh require (simulated restart)', async () => {
      delete require.cache[require.resolve(modulePath)];
      const reloaded = require(modulePath);
      reloaded.setUserDataPath(temp);
      assert.strictEqual(reloaded.get(gameDirA), '3751950');
      assert.strictEqual(reloaded.get(gameDirB), '242050');
    });

    await test('set(null) clears a previously stored override', async () => {
      appidOverride.set(gameDirA, null);
      assert.strictEqual(appidOverride.get(gameDirA), null);
      assert.strictEqual(appidOverride.get(gameDirB), '242050', 'unrelated entries stay intact');
    });

    await test('a non-numeric value is ignored (not persisted as a truthy override)', async () => {
      appidOverride.set(gameDirA, 'not-an-appid');
      assert.strictEqual(appidOverride.get(gameDirA), null);
    });

    await test('corrupt store file → get() fails safe to null instead of throwing', async () => {
      fs.writeFileSync(storeFile, '{not valid json');
      assert.strictEqual(appidOverride.get(gameDirB), null);
    });

    console.log(`PASS: appidOverride (${passed} checks)`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})();
