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

test('a folder with no loader at all has nothing of the release to lose', () => {
  const { dir } = release();
  assert.equal(installer.mayReplaceLoaderUnattended({ gameDir: dir, loaderPaths: [] }), true);
});
