'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-benchmark-'));
const rows = Number(process.argv[2]) || 500;

try {
  const originalLoad = Module._load;
  Module._load = function loadWithUserData(request) {
    if (request === '@electron/remote') return { app: { getPath: () => root } };
    return originalLoad.apply(this, arguments);
  };
  const gameIndex = require('../app/parser/gameIndex.js');
  Module._load = originalLoad;

  let started = performance.now();
  gameIndex.beginBatch();
  for (let i = 0; i < rows; i++) {
    gameIndex.upsert({ appid: String(i), name: `Game ${i}`, binary: `game-${i}.exe`, icon: `hash-${i}`, source: 'Steam' });
  }
  gameIndex.endBatch();
  const indexWriteMs = performance.now() - started;

  started = performance.now();
  for (let i = 0; i < rows; i++) gameIndex.getName(String(i));
  const indexReadMs = performance.now() - started;

  const snapshot = require('../app/util/librarySnapshot.js');
  const config = { achievement: { lang: 'english', hideZero: false }, achievement_source: { steamEmu: true } };
  const games = Array.from({ length: rows }, (_, i) => ({
    appid: String(i),
    name: `Game ${i}`,
    img: { header: `file:///covers/${i}.jpg` },
    achievement: {
      total: 100,
      unlocked: i % 100,
      list: Array.from({ length: 100 }, (_, j) => ({
        name: `ACH_${j}`,
        displayName: `Achievement ${j}`,
        Achieved: j < i % 100 ? 1 : 0,
        UnlockTime: j,
      })),
    },
  }));
  snapshot.write(root, config, games);
  started = performance.now();
  const restored = snapshot.read(root, config);
  const snapshotReadMs = performance.now() - started;

  console.log(
    JSON.stringify(
      {
        rows,
        indexWriteMs: Number(indexWriteMs.toFixed(1)),
        indexReadMs: Number(indexReadMs.toFixed(1)),
        snapshotReadMs: Number(snapshotReadMs.toFixed(1)),
        snapshotBytes: fs.statSync(snapshot.snapshotFile(root)).size,
        restored: restored.length,
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
