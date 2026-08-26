'use strict';

const assert = require('assert');
const path = require('path');
const fuzzy = require(path.join(__dirname, '..', '..', 'app', 'util', 'fuzzyAppid.js'));

const apps = [
  { appid: 1091500, name: 'Cyberpunk 2077' },
  { appid: 1245620, name: 'ELDEN RING' },
  { appid: 730, name: 'Counter-Strike 2' },
  { appid: 620, name: 'Portal 2' },
  { appid: 400, name: 'Portal' },
  { appid: 271590, name: 'Grand Theft Auto V' },
];

// Name cleaning strips repack/scene/version noise.
assert.strictEqual(fuzzy.cleanGameName('Cyberpunk 2077 [FitGirl Repack]').clean, 'cyberpunk 2077');
assert.strictEqual(fuzzy.cleanGameName('Elden.Ring.v1.12.3.update.5-CODEX').clean, 'elden ring');

// Repack-suffixed and versioned folder names auto-resolve (they normalize to the exact store name).
assert.strictEqual(fuzzy.bestConfidentAppid('Cyberpunk 2077 [FitGirl Repack]', apps), 1091500);
assert.strictEqual(fuzzy.bestConfidentAppid('Cyberpunk.2077.v1.6.Update.3.MULTi19', apps), 1091500);
assert.strictEqual(fuzzy.bestConfidentAppid('ELDEN RING Deluxe Edition', apps), 1245620);
assert.strictEqual(fuzzy.bestConfidentAppid('Portal 2', apps), 620);

// A typo is offered as a candidate but NEVER auto-committed (wrong AppID would corrupt steam_appid.txt).
const typo = fuzzy.rankAppidCandidates('cyberpnuk 2077', apps);
assert.ok(typo.length > 0 && typo[0].name === 'Cyberpunk 2077', 'typo should surface Cyberpunk 2077 as top candidate');
assert.strictEqual(fuzzy.bestConfidentAppid('cyberpnuk 2077', apps), null, 'fuzzy match must not auto-commit');

// Unrelated input resolves to nothing.
assert.strictEqual(fuzzy.bestConfidentAppid('Microsoft Word 2019', apps), null);
assert.strictEqual(fuzzy.rankAppidCandidates('zzzzz qqqqq wwwww', apps).length, 0);

// An ambiguous short-name subset ("Portal" ⊂ "Portal Knights", a game not in the list) stays out of auto.
assert.strictEqual(fuzzy.bestConfidentAppid('Portal Knights', apps), null, 'short-name subset is too ambiguous to auto-commit');

/*
  Release-site domains ride along in repack folder names. Left in, they push a title out of the exact
  tier into a fuzzy score, which is never auto-committed - so the game is not identified at all, shows
  its folder name and has no artwork. All three names below are real folders taken from a disk.
*/
assert.strictEqual(fuzzy.cleanGameName('Assassins Creed Origins v1.52 RexaGames.com').clean, 'assassins creed origins');
assert.strictEqual(fuzzy.cleanGameName('South.Park.The.Fractured.but.Whole.ZeiGames.com').clean, 'south park the fractured but whole');
assert.strictEqual(fuzzy.cleanGameName('Some Game [site.to]').clean, 'some game');

const ubisoft = [
  { appid: 582160, name: "Assassin's Creed® Origins" },
  { appid: 488790, name: 'South Park™: The Fractured But Whole™' },
];
assert.strictEqual(fuzzy.bestConfidentAppid('Assassins Creed Origins v1.52 RexaGames.com', ubisoft), 582160);
assert.strictEqual(fuzzy.bestConfidentAppid('South.Park.The.Fractured.but.Whole.ZeiGames.com', ubisoft), 488790);

// The rule must not reach into a real title: no dotted word here ends in a known TLD.
assert.strictEqual(fuzzy.cleanGameName('S.T.A.L.K.E.R. Shadow of Chernobyl').clean, 's t a l k e r shadow of chernobyl');
assert.strictEqual(fuzzy.bestConfidentAppid('Portal 2', [{ appid: 620, name: 'Portal 2' }]), 620);

console.log('PASS: fuzzy AppID resolution (clean + 3-tier, confident-only auto-commit)');
