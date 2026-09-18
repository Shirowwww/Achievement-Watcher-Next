'use strict';

// Epic's public API gives no schema for some games that have achievements (Civilization VI, Rise and
// Shadow of the Tomb Raider on the Epic store). games-infos-datas is read as the last resort, in the
// user's language, and its icons are only used when the entry actually ships them.

const assert = require('node:assert/strict');

const gamesInfosDatas = require('../../app/util/gamesInfosDatas.js');
const epicOfficial = require('../../app/parser/epicOfficial.js');

const INDEX = [
  { Name: 'Civilization VI', Namespace: 'cd14dcaa4f3443f19f7169a980559c62', ApplicationId: 'Kinglet' },
  { Name: 'Shadow', Namespace: '4b5461ca8d1c488787b5200b420de066', ApplicationId: '890d9cf3' },
];
const LIST = [
  {
    AchievementId: 'ARR_ACHIEVEMENT_01',
    UnlockedDisplayName: { default: 'The Abyss Hungers', en: 'The Abyss Hungers', fr: 'Les Abysses ont faim' },
    UnlockedDescription: { default: 'Sink 10 ships', fr: 'Coulez 10 navires' },
    UnlockedIconUrl: 'ARR_ACHIEVEMENT_01',
    LockedIconUrl: 'ARR_ACHIEVEMENT_01_locked',
    IsHidden: true,
  },
];

(async () => {
  const shipsImages = new Set(['890d9cf3']);
  gamesInfosDatas.readJson = async (relPath) => (relPath === 'epic-games-index.json' ? INDEX : LIST);
  gamesInfosDatas.exists = async (relPath) => [...shipsImages].some((id) => relPath.includes(`/${id}/`));

  const civ = await epicOfficial._internal.communitySchema('CD14DCAA4F3443F19F7169A980559C62', 'fr');
  assert.equal(civ.length, 1);
  assert.equal(civ[0].name, 'ARR_ACHIEVEMENT_01');
  assert.equal(civ[0].displayName, 'Les Abysses ont faim');
  assert.equal(civ[0].description, 'Coulez 10 navires');
  assert.equal(civ[0].hidden, 1);
  assert.equal(civ[0].icon, '', 'an entry with no images must not point at files that are not there');
  console.log('PASS: the schema is read in the user language, and missing images stay blank');

  const shadow = await epicOfficial._internal.communitySchema('4b5461ca8d1c488787b5200b420de066', 'de');
  assert.equal(shadow[0].displayName, 'The Abyss Hungers', 'a missing language falls back to English');
  assert.equal(shadow[0].icon, `${gamesInfosDatas.BASE_URL}/epic/4b5461ca8d1c488787b5200b420de066/890d9cf3/achievements/achievements_images/ARR_ACHIEVEMENT_01`);
  console.log('PASS: shipped images are used, and a missing language falls back to English');

  assert.deepEqual(await epicOfficial._internal.communitySchema('calluna', 'fr'), []);
  console.log('PASS: a namespace the repository does not list gives nothing');

  // Rarity borrowed from the Steam release, only when the achievement ids prove it is the same game.
  const ipc = require('../../app/util/ipcInvoke.js');
  const rarity = require('../../app/util/rarity.js');
  const asked = [];
  const written = [];
  ipc.ipcAvailable = () => true;
  ipc.ipcInvoke = async (channel, { title }) => {
    asked.push(title);
    return title === 'Civilization VI' ? '289070' : '';
  };
  rarity.writeRarityCache = (id, entries, source) => written.push({ id, entries, source });
  rarity.fetchSteamGlobalAchievementPercentages = async () => [{ name: 'ARR_ACHIEVEMENT_01', percent: 12.5 }];

  const borrowed = await epicOfficial._internal.borrowSteamRarity('cd14dcaa4f3443f19f7169a980559c62', ['ARR_ACHIEVEMENT_01']);
  assert.deepEqual(borrowed, { count: 1, steamAppid: '289070' });
  assert.deepEqual(written, [{ id: 'cd14dcaa4f3443f19f7169a980559c62', entries: [{ name: 'ARR_ACHIEVEMENT_01', percent: 12.5 }], source: 'steam' }]);
  console.log('PASS: matching ids borrow the Steam percentages under the namespace');

  written.length = 0;
  const wrongGame = await epicOfficial._internal.borrowSteamRarity('cd14dcaa4f3443f19f7169a980559c62', ['ARR_ACHIEVEMENT_01', 'A', 'B']);
  assert.equal(wrongGame, null);
  assert.equal(written.length, 0);
  console.log('PASS: a Steam release sharing too few ids lends nothing');

  asked.length = 0;
  // The index read above is kept for the process, so a new entry is visible straight away.
  INDEX.push({ Name: 'Rise of the Tomb Raider: 20 Year Celebration', Namespace: 'rise', ApplicationId: 'x' });
  await epicOfficial._internal.borrowSteamRarity('rise', ['ARR_ACHIEVEMENT_01']);
  assert.deepEqual(asked, ['Rise of the Tomb Raider: 20 Year Celebration', 'Rise of the Tomb Raider']);
  console.log('PASS: an edition suffix is dropped for a second title search');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

