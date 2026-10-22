'use strict';

const assert = require('node:assert/strict');
const { fillArt } = require('../../app/util/artFallback.js');

const SGDB = { landscape: 'sgdb/grid.jpg', portrait: 'sgdb/portrait.png', background: 'sgdb/hero.png', logo: 'sgdb/logo.png', icon: 'sgdb/icon.png' };

(() => {
  // A trophy icon put up as a header (shadPS4, Xenia) gives way to real landscape art.
  const standIn = fillArt({ header: 'TROP000.PNG', headerStandIn: true }, SGDB, 'shadps4');
  assert.equal(standIn.header, 'sgdb/grid.jpg');
  assert.equal('headerStandIn' in standIn, false, 'the mark does not outlive the choice');

  // Without landscape art the stand-in is still better than an empty card.
  assert.equal(fillArt({ header: 'TROP000.PNG', headerStandIn: true }, {}, 'shadps4').header, 'TROP000.PNG');

  // A source's own header is never replaced, only gaps are filled.
  const own = fillArt({ header: 'own/header.jpg', portrait: 'own/portrait.jpg' }, SGDB, 'rpcs3');
  assert.equal(own.header, 'own/header.jpg');
  assert.equal(own.portrait, 'own/portrait.jpg');
  assert.equal(own.logo, 'sgdb/logo.png');

  // A community hero is raw key art: the game screen veils it.
  const hero = fillArt({}, SGDB, 'manual');
  assert.equal(hero.background, 'sgdb/hero.png');
  assert.equal(hero.overlay, true);
  assert.equal(fillArt({ background: 'own/bg.jpg' }, SGDB, 'manual').overlay, undefined, "a source's own background keeps its own veil");

  // A recompiled Xbox 360 game SteamGridDB does not know keeps its marketplace background as header.
  assert.equal(fillArt({ background: 'market/bg.jpg' }, {}, 'x360recomp').header, 'market/bg.jpg');
  assert.equal(fillArt({ background: 'own/bg.jpg' }, {}, 'rpcs3').header, '');

  // The icon falls back to the logo, and the input is left as it was.
  const input = { header: 'TROP000.PNG', headerStandIn: true };
  assert.equal(fillArt(input, { logo: 'sgdb/logo.png' }, 'xenia').icon, 'sgdb/logo.png');
  assert.deepEqual(input, { header: 'TROP000.PNG', headerStandIn: true });

  // A PlayStation list takes SteamGridDB's covers first and keeps Sony's art as the fallback.
  const psn = fillArt({ header: 'psn/hub.jpg', portrait: 'psn/portrait.jpg' }, SGDB, 'psnLibrary');
  assert.equal(psn.header, 'sgdb/grid.jpg');
  assert.equal(psn.portrait, 'sgdb/portrait.png');
  const psnAlone = fillArt({ header: 'psn/hub.jpg', portrait: 'psn/portrait.jpg' }, {}, 'psnLibrary');
  assert.equal(psnAlone.header, 'psn/hub.jpg');
  assert.equal(psnAlone.portrait, 'psn/portrait.jpg');
  assert.equal(fillArt({ header: 'TROP000.PNG', headerStandIn: true }, {}, 'psnLibrary').header, 'TROP000.PNG');

  console.log('PASS: artFallback fills the gaps of a game\'s pictures');
})();
