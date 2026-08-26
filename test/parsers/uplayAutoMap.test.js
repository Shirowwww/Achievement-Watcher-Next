'use strict';

/*
  Pairing a Ubisoft product with a Steam release is the one automatic decision in the Uplay path that
  cannot be allowed to be wrong. A wrong AppID does not show a wrong title and stop there: it
  generates another game's achievement list into this game's folder, so the loader looks up objective
  ids that mean something else, and the setup reports itself healthy while recording nonsense.

  So these are mostly refusals. Each one is a real pair the live Steam search returns, and the rule
  that has to reject it. What the resolver must still accept is the other half of the file: a
  catalogue's spelling slip, a storefront suffix, an edition sold on one side and not the other.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const autoMap = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayAutoMap.js'));
const fuzzyAppid = require(path.join(__dirname, '..', '..', 'app', 'util', 'fuzzyAppid.js'));

const pick = (product, candidates) => {
  const chosen = autoMap.chooseCandidate(product, candidates);
  return chosen ? Number(chosen.appid) : null;
};

test('a newer game whose name contains the older one is never taken for it', () => {
  // Steam ranks by popularity, so a search for the original returns the remaster/sequel first - and
  // often returns ONLY that, which is why "is it the top hit" and "is it the only hit" both fail.
  assert.equal(pick("Assassin's Creed III", [{ appid: 911400, name: 'Assassin’s Creed III Remastered' }]), null);
  assert.equal(pick('Far Cry', [{ appid: 371660, name: 'Far Cry Primal' }]), null);
  assert.equal(pick("Tom Clancy's Rainbow Six", [{ appid: 359550, name: "Tom Clancy's Rainbow Six Siege" }]), null);
  assert.equal(pick("Tom Clancy's Ghost Recon", [{ appid: 460930, name: "Tom Clancy's Ghost Recon® Wildlands" }]), null);
  assert.equal(pick("Tom Clancy's Splinter Cell", [{ appid: 235600, name: "Tom Clancy's Splinter Cell Blacklist" }]), null);
  assert.equal(pick('Valiant Hearts', [{ appid: 2741360, name: 'Valiant Hearts: Coming Home' }]), null);
  assert.equal(pick('Zombi', [{ appid: 2163330, name: 'Yet Another Zombie Survivors' }]), null);
});

test('an entry in a series is never taken for another entry in it', () => {
  const series = [
    { appid: 15100, name: "Assassin's Creed" },
    { appid: 33230, name: "Assassin's Creed II" },
    { appid: 208480, name: "Assassin's Creed III" },
    { appid: 911400, name: 'Assassin’s Creed III Remastered' },
  ];
  assert.equal(pick("Assassin's Creed™", series), 15100);
  assert.equal(pick("Assassin's Creed® II", series), 33230);
  assert.equal(pick("Assassin's Creed® III", series), 208480, 'the remaster must not win on being newer');
  // With the original absent from the results, the answer is "unknown", never "the remaster".
  assert.equal(pick("Assassin's Creed® III", [series[3]]), null);
});

test('a demo, beta or test build is never mapped to the game it shares a title with', () => {
  // They carry their own Ubisoft product id and can unlock none of the full game's achievements.
  const division = [{ appid: 365590, name: "Tom Clancy's The Division" }];
  assert.equal(pick("Tom Clancy's The Division Beta", division), null);
  assert.equal(pick("Tom Clancy's The Division PTS", division), null);
  assert.equal(pick('Champions of Anteria Demo', [{ appid: 374520, name: 'Champions of Anteria™' }]), null);
  assert.equal(pick('Trackmania Club Access', [{ appid: 2225070, name: 'Trackmania' }]), null);
  // And a demo on the STEAM side is not the product either.
  assert.equal(pick('Champions of Anteria', [{ appid: 999999, name: 'Champions of Anteria Demo' }]), null);
});

test("a catalogue's spelling slip still resolves", () => {
  // The point of the whole exercise: the shipped Uplay title for Avatar read "Frontier of Pandora"
  // for a while, and the community list still does. That is a typo inside a word, not a different
  // game, and refusing it would punish exactly the thing this is meant to fix.
  assert.equal(
    pick('Avatar: Frontier of Pandora (Uplay)', [{ appid: 2840770, name: 'Avatar: Frontiers of Pandora™' }]),
    2840770
  );
  assert.equal(pick('South Park™: The Fractured But Whole™', [{ appid: 488790, name: 'South Park The Fractured But Whole' }]), 488790);
  assert.equal(pick('Silent Hunter 3', [{ appid: 15210, name: 'Silent Hunter III' }]), 15210, '3 and III are one number');
});

test('a storefront or regional suffix is not part of the title', () => {
  const origins = [{ appid: 582160, name: "Assassin's Creed® Origins" }];
  for (const sku of [
    "Assassin's Creed Origins (Steam Version)",
    "Assassin's Creed Origins (Uplay)",
    "Assassin's Creed Origins (RU)",
    "Assassin's Creed Origins - Gold Edition",
  ]) {
    assert.equal(pick(sku, origins), 582160, `"${sku}" is the same game`);
  }
});

test('an edition Steam sells separately is not folded into the base game', () => {
  /*
    Ubisoft sells editions of one game; Steam publishes some of them as their own AppID with their own
    achievement list. "Anno 1404" and "Anno 1404 - History Edition" are two games as far as the fix is
    concerned, so the product's edition has to reach the release that carries it.
  */
  const anno = [
    { appid: 33250, name: 'Anno 1404' },
    { appid: 1281630, name: 'Anno 1404 - History Edition' },
  ];
  assert.equal(pick('Anno 1404', anno), 33250);
  assert.equal(pick('Anno 1404 - History Edition', anno), 1281630);

  // The release that carries the edition can be titled too differently for the stripped search term
  // to reach it. Seeing it in the results at all is enough to know the base game is the wrong answer.
  const settlers = [
    { appid: 48120, name: 'The Settlers 7: Paths to a Kingdom' },
    { appid: 965320, name: 'The Settlers® 7 : History Edition' },
  ];
  assert.equal(pick('The Settlers 7: Paths to a Kingdom - History Edition', settlers), null);
  assert.equal(pick('The Settlers 7: Paths to a Kingdom', settlers), 48120, 'without an edition, the base game is unambiguous');

  // An edition word Ubisoft uses and Steam does not is packaging, and must not block the answer.
  assert.equal(pick('Avatar: Frontiers of Pandora Complete Edition', [{ appid: 2840770, name: 'Avatar: Frontiers of Pandora™' }]), 2840770);
});

test('two Steam releases with the same title leave the question unanswered', () => {
  assert.equal(
    pick('Flashback', [
      { appid: 961620, name: 'Flashback' },
      { appid: 2252960, name: 'Flashback' },
    ]),
    null
  );
});

test('nothing is invented out of an empty or unusable result', () => {
  assert.equal(pick('Assassin’s Creed Origins', []), null);
  assert.equal(pick('Assassin’s Creed Origins', null), null);
  assert.equal(pick('', [{ appid: 1, name: 'Anything' }]), null);
  assert.equal(pick('Some Game', [{ appid: 'not-a-number', name: 'Some Game' }]), null);
});

test('the search term keeps the title and drops only the packaging', () => {
  // Left in, an edition suffix makes the Steam search return nothing at all, which reads as "no such
  // game" rather than "wrong search term" - that alone cost most of the coverage.
  assert.equal(autoMap.cleanProductName("Assassin's Creed Origins - Gold Edition"), "Assassin's Creed Origins");
  assert.equal(autoMap.cleanProductName('Avatar: Frontiers of Pandora Complete Edition'), 'Avatar: Frontiers of Pandora');
  assert.equal(autoMap.cleanProductName('Far Cry® 6 - Game of the Year Edition'), 'Far Cry 6');
  assert.equal(autoMap.cleanProductName("Assassin's Creed II (Uplay Connect)"), "Assassin's Creed II");
  assert.equal(autoMap.cleanProductName('Zombi'), 'Zombi', 'a title with no packaging is untouched');
});

test('a bare regional suffix is packaging too, but "HD" is not', () => {
  // Ubisoft numbers its regional releases separately and writes the region without brackets. A
  // region is the same game; it only defeated the search.
  assert.equal(autoMap.cleanProductName("Assassin's Creed Rogue Asia"), "Assassin's Creed Rogue");
  assert.equal(autoMap.cleanProductName('Far Cry 4 RU'), 'Far Cry 4');
  assert.equal(autoMap.cleanProductName('Watch Dogs Asia'), 'Watch Dogs');
  // Liberation HD and Liberation are separate releases with separate achievement lists, so "HD"
  // stays: dropping it would let one be answered with the other.
  assert.equal(autoMap.cleanProductName("Assassin's Creed® Liberation HD"), "Assassin's Creed Liberation HD");
});

test('sameTitle is the rule the resolver rests on', () => {
  // Kept here as well as in the resolver's own cases: this predicate is what separates "a spelling
  // slip" from "a different product", and every refusal above is one of its verdicts.
  assert.equal(fuzzyAppid.sameTitle('Avatar: Frontier of Pandora', 'Avatar: Frontiers of Pandora'), true);
  assert.equal(fuzzyAppid.sameTitle('Anno 1404', 'Anno 1404 - History Edition'), true);
  assert.equal(fuzzyAppid.sameTitle('Silent Hunter 3', 'Silent Hunter III'), true);
  assert.equal(fuzzyAppid.sameTitle("Assassin's Creed III", "Assassin's Creed III Remastered"), false);
  assert.equal(fuzzyAppid.sameTitle("Assassin's Creed", "Assassin's Creed II"), false);
  assert.equal(fuzzyAppid.sameTitle('Far Cry', 'Far Cry Primal'), false);
  assert.equal(fuzzyAppid.sameTitle('Starlink', 'Starlink: Battle for Atlas'), false, 'a refusal is the safe answer here');
  assert.equal(fuzzyAppid.sameTitle('', 'Anything'), false);
});
