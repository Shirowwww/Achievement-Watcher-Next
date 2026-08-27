'use strict';

/*
  Measures the install-folder walk that dominates a library scan.

  Usage: node tools/benchmark-discovery-walk.js <library-root> [<library-root> ...]

  Reports three passes over the same roots:
    plain     - no directory memo, no executable memo (what the walk costs from nothing)
    memoized  - both memos, cold (one scan on a machine that has never run one)
    warm      - both memos, second scan
    restarted - the executable memo reloaded from disk, as the next app launch sees it

  The detected executables are compared across passes: a memo that returns a different answer is a
  bug, not a speed-up.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');

const roots = process.argv.slice(2).filter((dir) => fs.existsSync(dir));
if (roots.length === 0) {
  console.log('benchmark-discovery-walk: pass one or more existing library roots, e.g. node tools/benchmark-discovery-walk.js C:Games');
  process.exit(0);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-discovery-benchmark-'));
const originalLoad = Module._load;
Module._load = function loadWithUserData(request) {
  if (request === '@electron/remote') return { app: { getPath: () => scratch } };
  return originalLoad.apply(this, arguments);
};
const goldberg = require('../app/parser/goldberg.js');
const dirCache = require('../app/util/dirCache.js');
const exeCandidateCache = require('../app/util/exeCandidateCache.js');
Module._load = originalLoad;

let readdirCalls = 0;
const realReaddirSync = fs.readdirSync;
fs.readdirSync = function countingReaddirSync(...args) {
  readdirCalls += 1;
  return realReaddirSync.apply(fs, args);
};

function pass(label, { memo }) {
  exeCandidateCache.setUserDataPath(memo ? scratch : null);
  if (memo) dirCache.beginScope();
  readdirCalls = 0;
  const started = performance.now();
  const found = goldberg.findCompatibleGames(roots);
  const executables = found.map((game) => {
    if (!game.gameDir) return null;
    const emulator = goldberg.detectEmulator(game.gameDir);
    const exe = goldberg.findGameExe(game.gameDir, emulator.dll);
    return exe ? exe.full : null;
  });
  const elapsed = performance.now() - started;
  if (memo) dirCache.endScope();
  exeCandidateCache.flush();
  console.log(`${label.padEnd(10)} ${elapsed.toFixed(0).padStart(6)}ms  readdirSync=${String(readdirCalls).padStart(6)}  installs=${found.length}`);
  return executables;
}

try {
  goldberg.findCompatibleGames(roots); // warm the OS directory cache so the first pass is not the outlier
  const plain = pass('plain', { memo: false });
  const cold = pass('memoized', { memo: true });
  const warm = pass('warm', { memo: true });
  // Drop the in-memory store, keeping the file, the way the next app launch starts.
  exeCandidateCache.setUserDataPath(null);
  const restarted = pass('restarted', { memo: true });

  const reference = JSON.stringify(plain);
  for (const [label, result] of [
    ['memoized', cold],
    ['warm', warm],
    ['restarted', restarted],
  ]) {
    if (JSON.stringify(result) !== reference) {
      console.error(`FAIL: ${label} detected different executables than the plain walk`);
      process.exitCode = 1;
    }
  }
  if (process.exitCode !== 1) console.log('every pass detected the same executables');
} finally {
  fs.readdirSync = realReaddirSync;
  fs.rmSync(scratch, { recursive: true, force: true });
}
