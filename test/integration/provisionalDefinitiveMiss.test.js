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
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

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
  return makeTempDir(`aw-${label}-`);
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

// Most owned Epic games have no achievements, and Epic saying so used to leave them provisional and
// non-definitive: 94 of them made every launch rebuild the whole library (#137).
test('an Epic game Epic answered "no achievements" for is a definitive miss, dated by that answer', (t) => {
  const epicOfficial = require('../../app/parser/epicOfficial.js');
  const userData = tempDir('epic-empty');
  epicOfficial.setUserDataPath(userData);
  t.after(() => epicOfficial.setUserDataPath(''));
  const cacheDir = path.join(userData, 'steam_cache', 'epicOfficial');
  fs.mkdirSync(cacheDir, { recursive: true });
  const write = (sandbox, locale, list, ageMs) => {
    const file = path.join(cacheDir, `${sandbox}_${locale}.json`);
    fs.writeFileSync(file, JSON.stringify({ productId: '', list }));
    const at = new Date(Date.now() - ageMs);
    fs.utimesSync(file, at, at);
    return fs.statSync(file).mtimeMs;
  };
  const answeredAt = write('emptysandbox', 'fr', [], 2 * 60 * 60 * 1000);
  write('fullsandbox', 'fr', [{ name: 'A' }], 60 * 1000);
  write('expiredsandbox', 'fr', [], 25 * 60 * 60 * 1000);
  const epicGame = (namespace) => ({ appid: namespace, source: 'epic-official', data: { type: 'epicOfficial', namespace, title: 'Some Epic game' } });

  const empty = buildProvisionalGame(epicGame('emptysandbox'), 'french');
  assert.equal(empty.provisionalDefinitive, true);
  assert.equal(empty.provisionalAt, answeredAt, 'dated by when Epic answered, so the grace period is not reset by each rebuild');

  for (const [namespace, lang, why] of [
    ['fullsandbox', 'french', 'a cached schema with achievements means this failure is something else'],
    ['expiredsandbox', 'french', 'an expired answer is due a retry'],
    ['emptysandbox', 'english', 'the answer was cached for another language'],
    ['neverasked', 'french', 'Epic never answered for this one'],
  ]) {
    assert.equal(buildProvisionalGame(epicGame(namespace), lang).provisionalDefinitive, false, why);
  }
});
