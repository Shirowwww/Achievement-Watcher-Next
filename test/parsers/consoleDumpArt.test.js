'use strict';

/*
  A console dump's background picture (PS4 sce_sys/pic1.png, PS3 PIC1.PNG, PS5 sce_sys/pic0.png) can be
  a studio logo on black: Driveclub's tile showed Evolution Studios' (#226). It stays the page
  background, but only stands in for the tile until SteamGridDB has the game's cover.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const ps4Schema = require('../../app/parser/ps4RecompSchema.js');
const ps3Recomp = require('../../app/parser/ps3Recomp.js');
const kytyps5 = require('../../app/parser/kytyps5.js');
const { fillArt } = require('../../app/util/artFallback.js');

const SGDB = { landscape: 'sgdb/landscape.jpg', portrait: 'sgdb/portrait.jpg' };

function picture(dir, ...parts) {
  const file = path.join(dir, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'png');
  return file;
}

test('a PS4 dump background only stands in for the tile, and stays the page background', () => {
  const dumpDir = makeTempDir('aw-ps4-art-');
  picture(dumpDir, 'sce_sys', 'pic1.png');
  const art = ps4Schema.gameArt({ dumpDir }, { icon0: null }, makeTempDir('aw-ps4-icons-'));
  assert.equal(art.headerStandIn, true);
  const shown = fillArt(art, SGDB, 'ps4recomp');
  assert.equal(shown.header, 'sgdb/landscape.jpg');
  assert.match(shown.background, /pic1\.png$/);
  assert.match(fillArt(art, {}, 'ps4recomp').header, /pic1\.png$/, 'with no cover anywhere, the dump picture stays');
});

test('a PS3 disc background and a PS5 key art only stand in for the tile too', () => {
  const disc = makeTempDir('aw-ps3-art-');
  picture(disc, 'PIC1.PNG');
  const ps3 = ps3Recomp._internal.gameArt(disc, { icon0: null }, makeTempDir('aw-ps3-icons-'));
  assert.equal(ps3.headerStandIn, true);
  assert.equal(fillArt(ps3, SGDB, 'ps3recomp').header, 'sgdb/landscape.jpg');

  const game = makeTempDir('aw-ps5-art-');
  picture(game, 'sce_sys', 'pic0.png');
  const ps5 = kytyps5._internal.gameArt(game);
  assert.equal(ps5.headerStandIn, true);
  assert.equal(fillArt(ps5, SGDB, 'kytyps5').header, 'sgdb/landscape.jpg');
});
