'use strict';

// The network half (ensureCompatTable, ensureRelease, repair) isn't exercised here, matching the
// convention in gbeInstaller.test.js - only the pure cache-shape logic is tested offline.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const installer = require('../../app/parser/gogUniverseLanInstaller.js');

function tmpDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gog-universelan-installer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('isExtractedBuild is true once either Galaxy dll is on disk', (t) => {
  const dir = tmpDir(t);
  assert.equal(installer.isExtractedBuild(dir), false);
  fs.writeFileSync(path.join(dir, 'Galaxy64.dll'), 'x');
  assert.equal(installer.isExtractedBuild(dir), true);
});

test('listCachedBuilds only returns tag subfolders that actually contain a Galaxy dll', (t) => {
  const cacheDir = tmpDir(t);
  const tag = '1.152.6';
  fs.mkdirSync(path.join(cacheDir, tag, 'UniverseLAN-1.152.6-Build-626-x64_x86'), { recursive: true });
  fs.writeFileSync(path.join(cacheDir, tag, 'UniverseLAN-1.152.6-Build-626-x64_x86', 'Galaxy64.dll'), 'x');
  fs.mkdirSync(path.join(cacheDir, tag, 'incomplete-download'), { recursive: true }); // no dll yet

  const builds = installer.listCachedBuilds(cacheDir, tag);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].name, 'UniverseLAN-1.152.6-Build-626-x64_x86');
});

test('listCachedBuilds returns [] for a tag that was never cached', (t) => {
  assert.deepEqual(installer.listCachedBuilds(tmpDir(t), 'nope'), []);
});
