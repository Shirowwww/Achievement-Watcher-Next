'use strict';

/*
  A scan never swaps a release's own Uplay loader on its own (#166). Assassin's Creed Valhalla from
  an EMPRESS repack qualifies for the automatic Ubisoft fix (mapped product, prefixed Steam names),
  and the scan replaced EMPRESS's loader with AW Next's, which does not answer the game the way
  EMPRESS's did: the game looped on "Ubisoft services are unavailable". A folder AW Next already
  repaired, whose setup a repack update wiped, is still put back without asking.
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

test('a folder AW Next repaired before gets its setup back after a repack update', () => {
  const { dir, loader } = release();
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), true);
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

test('the rollback of a failed repair is not taken for the user choosing the release setup', () => {
  const { dir, loader } = release();
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  uplayR2.restoreConfigBackup({ dir, rollback: true });
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), true);
});

test('a repair made after a restore lets the scan keep the setup again', () => {
  const { dir, loader } = release();
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  uplayR2.restoreConfigBackup({ dir });
  // Dated an hour back so the repair below is the newer snapshot even within one millisecond.
  const [restored] = uplayR2.listConfigBackups(dir);
  const manifestFile = path.join(restored.dir, uplayR2.BACKUP_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, createdAt: new Date(Date.now() - 3600e3).toISOString() }));
  uplayR2.createSetupBackup({ gameDir: dir, files: [loader] });
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [loader] }), true);
});

test('a folder with no loader at all has nothing of the release to lose', () => {
  const { dir } = release();
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [] }), true);
});
