'use strict';

// A provisional game steam.js has already confirmed has no Steam data (the negative cache) must
// not force a full network rescan of the WHOLE library forever - see libraryReuse.test.js for the
// reuse-side rule. This checks the other half: buildProvisionalGame() carries the negative cache's
// own stable timestamp, not Date.now(), so the grace period libraryReuse.js applies is not reset by
// every rescan that rebuilds this same provisional entry.

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const steam = require('../../app/parser/steam.js');
const achievements = require('../../app/parser/achievements.js');
const { buildProvisionalGame } = achievements._internal;

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-${label}-`));
}

// Runs first: the negative cache is loaded once per process (see steam.js loadNegativeCache), so the
// userData path must be set before anything else in this file touches it.
test('a confirmed Steam miss carries its first-seen time into the provisional entry', () => {
  const userData = tempDir('unresolved');
  const unresolvedFile = path.join(userData, 'steam_cache', 'unresolved.json');
  fs.mkdirSync(path.dirname(unresolvedFile), { recursive: true });
  const firstSeenAt = Date.now() - 60 * 60 * 1000; // confirmed an hour ago
  fs.writeFileSync(unresolvedFile, JSON.stringify({ 999999001: firstSeenAt }));
  steam.setUserDataPath(userData);

  const saveDir = tempDir('unresolved-save');
  fs.writeFileSync(path.join(saveDir, 'achievements.ini'), '[SOME_ACH]\nAchieved=1\n');
  const entry = buildProvisionalGame({ appid: '999999001', source: 'Goldberg', data: { path: saveDir } });

  assert.ok(entry);
  assert.equal(entry.provisionalDefinitive, true, 'the negative cache already has this appid');
  assert.equal(entry.provisionalAt, firstSeenAt, 'the stable first-seen time, not the rebuild time');
});

test('a game with no recorded miss is provisional but not flagged definitive', () => {
  const saveDir = tempDir('unrecorded-save');
  fs.writeFileSync(path.join(saveDir, 'achievements.ini'), '[SOME_ACH]\nAchieved=1\n');
  const before = Date.now();
  const entry = buildProvisionalGame({ appid: '999999002', source: 'Goldberg', data: { path: saveDir } });

  assert.ok(entry);
  assert.equal(entry.provisionalDefinitive, false, 'not in the negative cache seeded above');
  assert.ok(entry.provisionalAt >= before, 'falls back to the rebuild time, not a remembered one');
});
