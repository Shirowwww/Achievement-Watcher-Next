'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const exophase = require('../../app/parser/exophase.js');

const FIXTURE = `
<ul>
  <li class="award">
    <div class="award-image"><img src="/img/a.png" /></div>
    <div class="award-detail">
      <div class="award-title">Kill 10 enemies</div>
      <div class="award-description"><p>Defeat ten foes</p></div>
    </div>
    <div class="award-average text-center"><span data-rarity="12.5%">12.5%</span></div>
  </li>
  <li class="award">
    <div class="award-image"><img src="/img/b.png" /></div>
    <div class="award-detail">
      <div class="award-title">Finish the game</div>
      <div class="award-description"><p>Complete the story</p></div>
    </div>
    <div class="award-average text-center"><span data-rarity="3.25%">3.25%</span></div>
  </li>
</ul>`;

test('extractAchievementsFromHtml reads the per-card rarity', () => {
  const items = exophase.extractAchievementsFromHtml(FIXTURE, 'https://www.exophase.com/game/x/');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Kill 10 enemies');
  assert.equal(items[0].rarityPct, 12.5);
  assert.equal(items[0].raritySource, 'exophase');
  assert.equal(items[1].rarityPct, 3.25);
});

test('matchExophaseRarityToAchievements maps awards back to schema ids', () => {
  const items = [
    { titles: { english: 'Kill 10 enemies' }, descriptions: { english: 'Defeat ten foes' }, rarityPct: 12.5 },
    { titles: { english: 'Finish the game' }, descriptions: { english: 'Complete the story' }, rarityPct: 3.25 },
  ];
  const achievements = [
    { name: '0', displayName: 'Kill 10 enemies', description: 'Defeat ten foes' },
    { name: '1', displayName: 'Finish the game', description: 'Complete the story' },
    { name: '2', displayName: 'Untracked', description: 'Not on Exophase' },
  ];
  const entries = exophase.matchExophaseRarityToAchievements(achievements, items);
  assert.deepEqual(entries, [
    { name: '0', percent: 12.5 },
    { name: '1', percent: 3.25 },
  ]);
});

// Astro's Playroom on Exophase spells two titles apart from the game: "1 down" / "One Down" and
// "Recognize" / "Recognise". Their descriptions are word for word the same, and say enough.
test('a title spelled differently still matches on a specific, unique description', () => {
  const items = [
    { titles: { english: 'One Down, Lots More to Go!' }, descriptions: { english: 'Got your first puzzle piece.' }, rarityPct: 99.13 },
    { titles: { english: 'I Recognise You…' }, descriptions: { english: 'Punched and looked into the lens of PS VR in PlayStation Labo.' }, rarityPct: 43.38 },
    { titles: { english: 'Race One' }, descriptions: { english: 'Win a race.' }, rarityPct: 50 },
    { titles: { english: 'Twin A' }, descriptions: { english: 'Collect every coin in the level.' }, rarityPct: 10 },
    { titles: { english: 'Twin B' }, descriptions: { english: 'Collect every coin in the level.' }, rarityPct: 20 },
  ];
  const achievements = [
    { name: '11', displayName: '1 down, lots more to go!', description: 'Got your first puzzle piece.' },
    { name: '25', displayName: 'I Recognize You…', description: 'Punched and looked into the lens of PS VR in PlayStation Labo.' },
    { name: '30', displayName: 'First Race', description: 'Win a race.' },
    { name: '31', displayName: 'Coins', description: 'Collect every coin in the level.' },
  ];
  assert.deepEqual(exophase.matchExophaseRarityToAchievements(achievements, items), [
    { name: '11', percent: 99.13 },
    { name: '25', percent: 43.38 },
  ], 'a three-word description, or one Exophase lists twice, names nothing');
});

test('rarity percent normalizer tolerates text and commas', () => {
  assert.equal(exophase.normalizeExophaseRarityPct('12,5%'), 12.5);
  assert.equal(exophase.normalizeExophaseRarityPct(' 4.2% of players '), 4.2);
  assert.equal(exophase.normalizeExophaseRarityPct('n/a'), null);
  assert.equal(exophase.normalizeExophaseRarityPct(7), 7);
});

test('slug candidates cover ps3/psn and ps4 suffixes', () => {
  const rpcs3 = exophase.buildExophaseRaritySlugCandidates('God of War III', 'rpcs3');
  assert.ok(rpcs3.includes('god-of-war-iii'));
  assert.ok(rpcs3.includes('god-of-war-iii-ps3'));
  assert.ok(rpcs3.includes('god-of-war-iii-psn'));
  const shadps4 = exophase.buildExophaseRaritySlugCandidates('Bloodborne', 'shadps4');
  assert.ok(shadps4.includes('bloodborne-ps4'));
  const xenia = exophase.buildExophaseRaritySlugCandidates('Halo 3', 'xenia');
  assert.ok(xenia.includes('halo-3'));
  assert.ok(!xenia.includes('halo-3-ps3'));
});

// The shape of a real trophy page (bloodborne-ps4): the rate sits on the card itself and the grade
// is the trophy icon's class.
const trophyCard = (title, description, average, grade) => `
  <li class="col-12 locked t0 award secret" data-award-id="1" data-average="${average}">
    <div class="award-left"><img class="award-image trophy-image" src="/a.png" /></div>
    <div class="award-details snippet">
      <div class="award-title"><a href="#">${title}</a></div>
      <div class="award-description"><p>${description}</p></div>
    </div>
    <div class="award-points text-center"><i class="exo-icon icon-collection-trophies exo-icon-trophy-${grade}"></i></div>
    <div class="award-average text-center"><span class="tippy" data-tippy-content="Uncommon (114.00 EXP)">${average}% (114.00)</span></div>
  </li>`;

test('a trophy card gives its own rate and its grade', () => {
  const html = `<ul>${trophyCard('Bloodborne', 'All trophies acquired. Hats off!', '36.11', 'platinum')}${trophyCard('Cainhurst', 'Visit Cainhurst.', '62.60', 'silver')}</ul>`;
  const items = exophase.extractAchievementsFromHtml(html, 'https://www.exophase.com/game/bloodborne-ps4/trophies/');
  assert.deepEqual(
    items.map((item) => [item.title, item.rarityPct, item.grade]),
    [
      ['Bloodborne', 36.11, 'P'],
      ['Cainhurst', 62.6, 'S'],
    ]
  );
});

test('a card without a rate has none, whatever numbers its text holds', () => {
  const html = `<ul><li class="award"><div class="award-detail"><div class="award-title">Hunter</div><div class="award-description"><p>Defeat 3 bosses in 12 minutes</p></div></div></li></ul>`;
  const [item] = exophase.extractAchievementsFromHtml(html, 'https://www.exophase.com/game/x/');
  assert.equal(item.rarityPct, null);
  assert.equal(item.raritySource, '');
});

// Bloodborne in French: only the trophies whose name is the same in both languages match by name.
const frenchSet = [
  { name: 0, type: 'P', displayName: 'Bloodborne', description: 'Tous les trophées obtenus.' },
  { name: 1, type: 'G', displayName: 'Aube de Yharnam', description: 'Vous avez survécu à la chasse.' },
  { name: 2, type: 'S', displayName: 'Cainhurst', description: 'Vous avez visité Cainhurst.' },
  { name: 3, type: 'B', displayName: 'Père Gascoigne', description: 'Vous avez vaincu le père Gascoigne.' },
];
const englishPage = [
  { index: 1, grade: 'P', titles: { english: 'Bloodborne' }, descriptions: { english: 'All trophies acquired. Hats off!' }, rarityPct: 36.11 },
  { index: 2, grade: 'G', titles: { english: 'Yharnam Sunrise' }, descriptions: { english: 'You lived through the hunt.' }, rarityPct: 45.12 },
  { index: 3, grade: 'S', titles: { english: 'Cainhurst' }, descriptions: { english: 'Visited Cainhurst.' }, rarityPct: 62.6 },
  { index: 4, grade: 'B', titles: { english: 'Father Gascoigne' }, descriptions: { english: 'Defeated Father Gascoigne.' }, rarityPct: 92.38 },
];

test('a trophy list in the same order with the same grades is matched trophy by trophy', () => {
  assert.deepEqual(exophase.matchExophaseRarityToAchievements(frenchSet, englishPage), [
    { name: '0', percent: 36.11 },
    { name: '1', percent: 45.12 },
    { name: '2', percent: 62.6 },
    { name: '3', percent: 92.38 },
  ]);
});

test('the order is not trusted when a grade differs, a trophy is missing or a name points elsewhere', () => {
  const byName = [
    { name: '0', percent: 36.11 },
    { name: '2', percent: 62.6 },
  ];
  const regraded = englishPage.map((item, at) => (at === 3 ? { ...item, grade: 'S' } : item));
  assert.deepEqual(exophase.matchExophaseRarityToAchievements(frenchSet, regraded), byName, 'one grade apart');
  assert.deepEqual(exophase.matchExophaseRarityToAchievements(frenchSet, englishPage.slice(0, 3)), byName, 'one award short');
  const swapped = [englishPage[0], englishPage[2], englishPage[1], englishPage[3]].map((item, at) => ({ ...item, grade: englishPage[at].grade }));
  assert.deepEqual(exophase.matchExophaseRarityToAchievements(frenchSet, swapped), byName, 'Cainhurst is the second award by name, the third by order');
});
