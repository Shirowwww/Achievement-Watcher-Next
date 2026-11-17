'use strict';

/*
  A scan never swaps a Uplay loader that is in place (#166). Assassin's Creed Valhalla from an
  EMPRESS repack qualifies for the automatic Ubisoft fix (mapped product, prefixed Steam names), and
  the scan replaced EMPRESS's loader with AW Next's, which does not answer the game the way EMPRESS's
  did: the game looped on "Ubisoft services are unavailable". It happened again after the user put
  EMPRESS's loader back (Restore, or a copy by hand) in a folder AW Next had repaired once, so a
  backup no longer licenses the swap either: only a folder with no loader at all gets one unasked.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const uplayR2 = require('../../app/parser/uplayR2.js');
const installer = require('../../app/parser/uplayR2Installer.js');

function release() {
  const dir = makeTempDir('aw-uplay-unattended-');
  const loader = path.join(dir, 'upc_r2_loader64.dll');
  fs.writeFileSync(loader, 'MZ release loader');
  fs.writeFileSync(path.join(dir, 'ACValhalla.exe'), 'MZ');
  return { dir, loader };
}

test("a release's own loader is never replaced by a scan when AW Next never repaired the folder", () => {
  const { dir, loader } = release();
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), false);
});

test('a folder AW Next repaired before keeps the loader a repack update put back', () => {
  const { dir, loader } = release();
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), false);
});

test('a scan leaves the loader alone once the user restored the release setup', () => {
  // mr_robot_a, Valhalla EMPRESS: Restore put EMPRESS's loader back, and the next refresh swapped
  // it out again because a backup existed, so the game kept failing on Ubisoft's online service.
  const { dir, loader } = release();
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  fs.writeFileSync(loader, 'MZ AW Next loader');
  uplayR2.restoreConfigBackup({ dir });
  assert.equal(fs.readFileSync(loader, 'utf8'), 'MZ release loader');
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), false);
});

test('a loader the user copied back by hand is left alone too', () => {
  // The same user also restored his own copy of the two files, which leaves no trace AW Next sees.
  const { dir, loader } = release();
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  fs.writeFileSync(loader, 'MZ AW Next loader');
  fs.writeFileSync(loader, 'MZ release loader');
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), false);
});

test('Restore removes the files the repair added and puts the loader back', () => {
  const { dir, loader } = release();
  const ini = path.join(dir, 'upc_r2.ini');
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader, ini] });
  fs.writeFileSync(loader, 'MZ AW Next loader');
  fs.writeFileSync(ini, '[Settings]');
  const result = uplayR2.restoreConfigBackup({ dir });
  assert.equal(fs.readFileSync(loader, 'utf8'), 'MZ release loader');
  assert.equal(fs.existsSync(ini), false);
  assert.deepEqual(result.removed, ['upc_r2.ini']);
});

test('a folder with no loader at all has nothing of the release to lose', () => {
  const { dir } = release();
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [] }), true);
});
