'use strict';

/*
  Both of this parser's entry points threw a ReferenceError on every call: `remote` was never
  required, and the reg.js export is `ListRegistryAllValues`, not `listRegistryAllValues`. The
  discovery layer catches everything a source throws, so each LumaPlay game simply vanished from the
  library with nothing logged. These tests call the real exports, which is what nothing did before.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const appDir = path.join(__dirname, '..', '..', 'app');
const uplayPath = path.join(appDir, 'parser', 'uplay.js');
const regPath = path.join(appDir, 'util', 'reg.js');

// The registry is the machine's, so stand in for reg.js with a fixed key layout.
function loadUplayWithRegistry(values) {
  for (const target of [uplayPath, regPath]) delete require.cache[require.resolve(target)];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../util/reg' && parent && parent.filename === uplayPath) {
      return {
        ListRegistryAllValues: (hive, key) => Object.keys(values[`${hive}\\${key}`] || {}),
        listRegistryAllSubkeys: () => [],
        readRegistryString: () => null,
        readRegistryInteger: (hive, key, name) => values[`${hive}\\${key}`]?.[name] ?? null,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(uplayPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('LumaPlay unlocks are read out of the registry', () => {
  const uplay = loadUplayWithRegistry({
    'HKCU\\SOFTWARE/LumaPlay/user/720/Achievements': { ACH_1: 1, ACH_2: 0 },
  });

  const result = uplay.getAchievementsFromLumaPlay('HKCU', 'SOFTWARE/LumaPlay/user/720/Achievements');
  assert.deepEqual(result, [
    { id: '1', Achieved: 1 },
    { id: '2', Achieved: 0 },
  ]);
});

test('a key with no values is reported, not returned empty', () => {
  const uplay = loadUplayWithRegistry({});
  assert.throws(() => uplay.getAchievementsFromLumaPlay('HKCU', 'SOFTWARE/LumaPlay/user/720/Achievements'));
});

test('the schema cache is read from the configured user data folder, not through @electron/remote', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-lumaplay-'));
  try {
    const uplay = loadUplayWithRegistry({});
    uplay.setUserDataPath(dir);

    const cacheFile = path.join(dir, 'uplay_cache/schema', '720.db');
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        name: 'Cached game',
        appid: 'UPLAY720',
        achievement: { total: 1, list: { english: [{ name: '1' }], french: [{ name: 'un' }] } },
      })
    );

    const schema = await uplay.getGameData('UPLAY720', 'french');
    assert.equal(schema.name, 'Cached game');
    assert.deepEqual(schema.achievement.list, [{ name: 'un' }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nothing in this parser talks to the retired third-party schema server', () => {
  const source = fs.readFileSync(uplayPath, 'utf8');
  assert.doesNotMatch(source, /xan105/, 'the host is gone, and it was being sent every generated schema');
  assert.doesNotMatch(source, /x-hello/, 'no upload token belongs in a public repository');
});
