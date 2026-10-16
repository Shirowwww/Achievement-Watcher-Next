'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const ssf = require('../../app/util/steamSchemaFetch.js');

test('mapOfficialAchievements maps the full AW shape with rarity', () => {
  const entries = ssf.mapOfficialAchievements(
    {
      achievements: [
        {
          internal_name: 'ACH_FIRST',
          localized_name: 'First!',
          localized_desc: 'Do the thing.',
          hidden: true,
          icon: 'abc.jpg',
          icon_gray: 'abc_gray.jpg',
          player_percent_unlocked: '40.5',
        },
        {
          internal_name: 'ACH_SECOND',
          localized_name: 'Second',
          localized_desc: '',
          hidden: false,
          icon: 'def.jpg',
          icon_gray: 'def_gray.jpg',
          player_percent_unlocked: '2.25',
        },
      ],
    },
    440
  );

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    name: 'ACH_FIRST',
    defaultvalue: 0,
    displayName: 'First!',
    hidden: 1,
    description: 'Do the thing.',
    icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/440/abc.jpg',
    icongray: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/440/abc_gray.jpg',
    rarityPercent: 40.5,
    archived: false,
  });
  assert.equal(entries[1].hidden, 0);
  assert.equal(entries[1].rarityPercent, 2.25);
});

test('mapOfficialAchievements treats a missing array as zero achievements and guards missing icons', () => {
  assert.deepEqual(ssf.mapOfficialAchievements({ groups: [] }, 440), []);
  assert.deepEqual(ssf.mapOfficialAchievements({ achievements: [{ internal_name: 'X' }] }, 440), [
    {
      name: 'X',
      defaultvalue: 0,
      displayName: undefined,
      hidden: 0,
      description: '',
      icon: '',
      icongray: '',
      rarityPercent: null,
      archived: false,
    },
  ]);
});

// Shapes from GetGameAchievements for TF2 and PowerWash Simulator (October 2026).
test('mapOfficialAchievements names each set and flags archived achievements and sets', () => {
  const entries = ssf.mapOfficialAchievements(
    {
      groups: [
        { groupid: 0, localized_name: '', dlcappid: 0, archived: false },
        { groupid: 1, localized_name: 'PowerWash Simulator - SpongeBob SquarePants Special Pack', dlcappid: 2236950, archived: false },
        { groupid: 11, localized_name: 'Replay', dlcappid: 0, archived: false },
        { groupid: 12, localized_name: 'Gone', dlcappid: 0, archived: true },
      ],
      achievements: [
        { internal_name: 'BASE', groupid: 0, archived: false },
        { internal_name: 'DLC', groupid: 1, archived: false },
        { internal_name: 'TF_REPLAY_YOUTUBE_VIEWS_TIER1', groupid: 11, archived: true },
        { internal_name: 'IN_ARCHIVED_SET', groupid: 12, archived: false },
        { internal_name: 'NO_GROUP_FIELD' },
      ],
    },
    1290000
  );
  const by = Object.fromEntries(entries.map((entry) => [entry.name, entry]));
  assert.equal(by.BASE.category, undefined, 'the base game is not a set');
  assert.equal(by.BASE.archived, false);
  assert.equal(by.DLC.category, 'PowerWash Simulator - SpongeBob SquarePants Special Pack');
  assert.equal(by.TF_REPLAY_YOUTUBE_VIEWS_TIER1.archived, true);
  assert.equal(by.TF_REPLAY_YOUTUBE_VIEWS_TIER1.category, 'Replay');
  assert.equal(by.IN_ARCHIVED_SET.archived, true, 'an archived set archives what it holds');
  assert.equal(by.NO_GROUP_FIELD.category, undefined);
});

test('GetUserAchievements rows are mapped back to apiNames, progress included', () => {
  const index = ssf.officialKeyIndex({
    achievements: [
      { internal_name: 'ZERO', internal_key: 0 },
      { internal_name: 'COUNTER', internal_key: 68098, max_progress_int: 25000 },
      { internal_name: 'LOCKED', internal_key: 7 },
      { internal_key: 8 },
    ],
  });
  assert.equal(index.size, 3, 'an entry without a name is useless for mapping');
  const rows = ssf.mapUserAchievements(
    {
      groups: [{ groupid: 0 }],
      achievements: [
        { internal_key: 0, unlocked: true, unlock_time: 1273518993 },
        { internal_key: 68098, progress_int: 14731 },
      ],
    },
    index
  );
  assert.deepEqual(rows, [
    { apiname: 'ZERO', achieved: 1, unlocktime: 1273518993 },
    { apiname: 'COUNTER', achieved: 0, unlocktime: 0, progress: 14731, max_progress: 25000 },
    { apiname: 'LOCKED', achieved: 0, unlocktime: 0 },
  ]);
  // Hidden game details: Steam answers an empty response, which is not "nothing unlocked".
  assert.equal(ssf.mapUserAchievements({}, index), null);
  assert.equal(ssf.mapUserAchievements(null, index), null);
});

test('steamCommunityAchievementsUrl asks the current page directly, with its language', () => {
  assert.equal(ssf.steamCommunityAchievementsUrl(220, 'french'), 'https://steamcommunity.com/achievements/220?l=french');
  assert.equal(ssf.steamCommunityAchievementsUrl('440'), 'https://steamcommunity.com/achievements/440?l=english');
  assert.equal(
    ssf.steamCommunityAchievementsUrl(440, 'english', '76561198001678750'),
    'https://steamcommunity.com/profiles/76561198001678750/achievements/440?l=english'
  );
});

// The page as Steam serves it since October 2026: the data sits in a react-query cache, as a JSON
// string inside the JSON of <script id="valve-ssr-data">. Values from Half-Life 2 in French.
function communityPage(queries) {
  const queryData = JSON.stringify({ mutations: [], queries });
  const ssr = JSON.stringify({ route: {}, renderContext: { queryData } });
  return `<!DOCTYPE html><html><head><script type="application/json" id="valve-ssr-data" nonce="n">${ssr}</script></head><body></body></html>`;
}

const HL2_SCHEMA = {
  appid: 220,
  language: 'french',
  groups: [
    {
      id: 0,
      name: '',
      archived: false,
      achievements: [
        {
          internal_key: 0,
          api_name: 'HL2_HIT_CANCOP_WITHCAN',
          name: 'Rebelle',
          description: 'Lancez la canette sur le policier.',
          hidden: true,
          archived: false,
          icon_achieved: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/220/hl2_hit_cancop_withcan.jpg',
          icon_unachieved: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/220/hl2_hit_cancop_withcan_bw.jpg',
          groupid: 0,
        },
      ],
    },
    {
      id: 3,
      name: 'Episode One',
      archived: true,
      achievements: [{ internal_key: 256, api_name: 'EP1_X', name: 'Old one', description: '', hidden: false, archived: false, icon_achieved: '', icon_unachieved: '', groupid: 3 }],
    },
  ],
};

test('parseSteamCommunityRows reads the React page: apiNames, hidden text, sets, archive and rarity', () => {
  const html = communityPage([
    { queryKey: ['StoreItem', 'app_220'], state: { status: 'success', data: {} } },
    { queryKey: ['achievements', 220, 'schema'], state: { status: 'success', data: HL2_SCHEMA } },
    { queryKey: ['achievements', 220, 'globalpercentages'], state: { status: 'success', data: { percentages: { 0: 33.4 } } } },
  ]);
  const rows = ssf.parseSteamCommunityRows(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    img: 'hl2_hit_cancop_withcan',
    icon: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/220/hl2_hit_cancop_withcan.jpg',
    icongray: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/220/hl2_hit_cancop_withcan_bw.jpg',
    title: 'Rebelle',
    description: 'Lancez la canette sur le policier.',
    apiName: 'HL2_HIT_CANCOP_WITHCAN',
    hidden: true,
    archived: false,
    rarityPercent: 33.4,
  });
  assert.equal(rows[1].category, 'Episode One');
  assert.equal(rows[1].archived, true);
  assert.equal(rows[1].rarityPercent, null);
  assert.ok(ssf.rowsCarryApiNames(rows));

  const entries = ssf.mapSteamCommunityRows(rows);
  assert.equal(entries[0].name, 'HL2_HIT_CANCOP_WITHCAN', 'a real apiName, not the title');
  assert.equal(entries[0].hidden, 1, 'hidden comes from the flag, its text is still there');
  assert.equal(entries[0].description, 'Lancez la canette sur le policier.');
  assert.equal(entries[1].archived, true);
  assert.equal(entries[1].category, 'Episode One');
});

test('a page without a schema query, or with a broken payload, falls back to the old reader', () => {
  assert.deepEqual(ssf.parseSteamCommunityRows(communityPage([{ queryKey: ['achievements', 220, 'schema'], state: { status: 'error', data: null } }])), []);
  const broken = '<script type="application/json" id="valve-ssr-data">{"renderContext":{"queryData":"{not json"}}</script>';
  assert.deepEqual(ssf.parseSteamCommunityRows(broken), []);
  assert.equal(ssf.rowsCarryApiNames([]), false);
  assert.equal(ssf.rowsCarryApiNames([{ title: 'Old page row' }]), false);
});

test('mergeSteamHuntersWithCommunity matches page rows by apiName and takes their hidden flag', () => {
  const merged = ssf.mergeSteamHuntersWithCommunity(
    [{ apiName: 'HL2_HIT_CANCOP_WITHCAN', name: 'Defiant', description: 'Hit the trashcan cop with the can.' }],
    [{ apiName: 'HL2_HIT_CANCOP_WITHCAN', title: 'Rebelle', description: 'Lancez la canette.', hidden: true, icon: 'https://cdn.example/i.jpg' }]
  );
  assert.equal(merged[0].hidden, 1);
  assert.equal(merged[0].icon, 'https://cdn.example/i.jpg');
  assert.equal(merged[0].description, 'Hit the trashcan cop with the can.');
});

test('mapSteamHuntersJson maps apiName/description/rarity and no icons', () => {
  const entries = ssf.mapSteamHuntersJson([
    {
      achievementId: 1,
      apiName: 'TF_DAMAGE',
      name: 'Iron Kurtain',
      description: 'Take damage.',
      steamPercentage: 40.2,
    },
  ]);
  assert.deepEqual(entries[0], {
    name: 'TF_DAMAGE',
    defaultvalue: 0,
    displayName: 'Iron Kurtain',
    hidden: 0,
    description: 'Take damage.',
    icon: '',
    icongray: '',
    rarityPercent: 40.2,
  });
  assert.deepEqual(ssf.mapSteamHuntersJson(null), []);
});

test('mapSteamHuntersJson falls back to estimatedSteamPercentage when Steam has no percentage yet', () => {
  const entries = ssf.mapSteamHuntersJson([
    { apiName: 'A1', name: 'New', description: 'Fresh', steamPercentage: null, estimatedSteamPercentage: 12.5 },
    { apiName: 'A2', name: 'Old', description: 'Measured', steamPercentage: 7, estimatedSteamPercentage: 99 },
  ]);
  assert.equal(entries[0].rarityPercent, 12.5);
  assert.equal(entries[1].rarityPercent, 7);
});

test('parseSteamCommunityRows extracts icon hash, full URL, title and description', () => {
  const html = `
    <div class="achieveRow">
      <div class="achieveImgHolder">
        <img src="https://shared.fastly.steamstatic.com/community_assets/images/apps/440/hash1.jpg" />
      </div>
      <div class="achieveTxt"><h3>Public One</h3><h5>Visible text.</h5></div>
    </div>
    <div class="achieveRow">
      <div class="achieveImgHolder">
        <img src="https://shared.fastly.steamstatic.com/community_assets/images/apps/440/hash2.jpg" />
      </div>
      <div class="achieveTxt"><h3>Hidden One</h3><h5>  </h5></div>
    </div>
    <div class="achieveRow">
      <div class="achieveImgHolder">
        <img src="https://shared.fastly.steamstatic.com/community_assets/images/apps/440/hash3.jpg" />
      </div>
      <div class="achieveTxt"><h5>No title, skipped</h5></div>
    </div>`;
  const rows = ssf.parseSteamCommunityRows(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].img, 'hash1');
  assert.equal(rows[0].icon, 'https://shared.fastly.steamstatic.com/community_assets/images/apps/440/hash1.jpg');
  assert.equal(rows[0].title, 'Public One');
  assert.equal(rows[0].description, 'Visible text.');
  assert.equal(rows[1].description, '');
  assert.deepEqual(ssf.parseSteamCommunityRows('<html></html>'), []);
  assert.deepEqual(ssf.parseSteamCommunityRows(''), []);
});

test('stripHtml removes nested tags without leaving executable markup behind', () => {
  assert.equal(ssf.stripHtml('<b>Visible</b> <scrip<script>alert(1)</script>&nbsp;'), 'Visible alert(1)');
});

test('mergeSteamHuntersWithCommunity fills icons and detects hidden via matched titles', () => {
  const sh = [
    { apiName: 'A1', name: 'Public One', description: 'SH desc', steamPercentage: 10 },
    { apiName: 'A2', name: 'Hidden One', description: 'SH hidden desc', steamPercentage: 1 },
  ];
  const rows = [
    { icon: 'https://cdn.example/a1.jpg', title: 'Public One', description: 'Visible text.' },
    { icon: 'https://cdn.example/a2.jpg', title: 'Hidden One', description: '' },
  ];
  const merged = ssf.mergeSteamHuntersWithCommunity(sh, rows);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].icon, 'https://cdn.example/a1.jpg');
  assert.equal(merged[0].hidden, 0);
  // SteamHunters descriptions win; hidden desc is preserved from SH even though the page blanks it.
  assert.equal(merged[1].hidden, 1);
  assert.equal(merged[1].description, 'SH hidden desc');
  assert.equal(merged[1].icon, 'https://cdn.example/a2.jpg');
});

test('merge fallback position row only contributes an icon, never hidden/description', () => {
  const merged = ssf.mergeSteamHuntersWithCommunity(
    [{ apiName: 'A1', name: 'No Match', description: 'SH desc' }],
    [{ icon: 'https://cdn.example/x.jpg', title: 'Different Game', description: '' }]
  );
  assert.equal(merged[0].icon, 'https://cdn.example/x.jpg');
  assert.equal(merged[0].hidden, 0);
  assert.equal(merged[0].description, 'SH desc');
});

test('parseSteamHuntersGroups normalizes DLC/update groups', () => {
  const groups = ssf.parseSteamHuntersGroups({
    groupBy: 'dlcandupdate',
    groups: [
      { dlcAppId: 378649, dlcAppName: 'The Witcher 3: Wild Hunt - Hearts of Stone', achievementApiNames: ['EP1_1', 'EP1_2'] },
      { name: 'The Doomsday Heist', achievementApiNames: ['ACHGO1'] },
      { name: 'Untagged', achievementApiNames: [] },
      null,
    ],
  });
  assert.deepEqual(groups, [
    { name: 'The Witcher 3: Wild Hunt - Hearts of Stone', dlcAppId: 378649, apiNames: ['EP1_1', 'EP1_2'] },
    { name: 'The Doomsday Heist', dlcAppId: 0, apiNames: ['ACHGO1'] },
  ]);
});

test('applySteamHuntersGroups tags entries by apiName without touching others or existing categories', () => {
  const entries = [
    { name: 'ep1_1', displayName: 'Hearts of Stone One' },
    { name: 'EP1_2', displayName: 'Hearts of Stone Two' },
    { name: 'BASE_1', displayName: 'Base Game' },
    { name: 'EP1_1', displayName: 'Duplicate already tagged', category: 'Manual' },
  ];
  const tagged = ssf.applySteamHuntersGroups(entries, {
    groups: [
      { dlcAppId: 378649, dlcAppName: 'The Witcher 3: Wild Hunt - Hearts of Stone', achievementApiNames: ['EP1_1', 'EP1_2'] },
    ],
  });
  assert.equal(tagged[0].category, 'The Witcher 3: Wild Hunt - Hearts of Stone');
  assert.equal(tagged[1].category, 'The Witcher 3: Wild Hunt - Hearts of Stone');
  assert.equal(tagged[2].category, undefined);
  assert.equal(tagged[3].category, 'Manual');
  // The source entries are not mutated.
  assert.equal(entries[0].category, undefined);
});

test('applySteamHuntersGroups handles missing/empty inputs', () => {
  assert.deepEqual(ssf.applySteamHuntersGroups([{ name: 'A' }], { groups: [] }), [{ name: 'A' }]);
  assert.deepEqual(ssf.applySteamHuntersGroups(null, { groups: [] }), null);
});

test('mapSteamCommunityRows is the degraded fallback: title as name, blank desc means hidden', () => {
  const rows = [
    { icon: 'https://cdn.example/a.jpg', title: 'Visible', description: 'Text' },
    { icon: 'https://cdn.example/b.jpg', title: 'Secret', description: '' },
  ];
  const entries = ssf.mapSteamCommunityRows(rows);
  assert.deepEqual(entries[0], {
    name: 'Visible',
    defaultvalue: 0,
    displayName: 'Visible',
    hidden: 0,
    description: 'Text',
    icon: 'https://cdn.example/a.jpg',
    icongray: '',
  });
  assert.equal(entries[1].hidden, 1);
});

test('iconKey extracts a stable hash from a full URL or bare filename', () => {
  assert.equal(ssf.iconKey('https://cdn.example/apps/440/abc123.jpg'), 'abc123');
  assert.equal(ssf.iconKey('https://cdn.example/apps/440/abc123.png'), 'abc123');
  assert.equal(ssf.iconKey('abc123'), 'abc123');
  assert.equal(ssf.iconKey(''), '');
  assert.equal(ssf.iconKey(null), '');
});

test('buildApiNameIndex keys apiNames by both icon and icongray hash', () => {
  const index = ssf.buildApiNameIndex([
    { name: 'ACH_FIRST', icon: 'https://cdn.example/a.jpg', icongray: 'https://cdn.example/a_gray.jpg' },
    { name: 'ACH_SECOND', icon: 'https://cdn.example/b.jpg', icongray: '' },
    { name: 'ACH_NO_ICON' },
  ]);
  assert.deepEqual(index, {
    a: 'ACH_FIRST',
    a_gray: 'ACH_FIRST',
    b: 'ACH_SECOND',
  });
});

test('buildApiNameIndex drops a hash shared by two different achievements instead of guessing', () => {
  // Cheap/low-effort games sometimes reuse one generic icon for several achievements. Picking either
  // name would be a coin flip that can mislabel a real unlock, so neither is kept.
  const index = ssf.buildApiNameIndex([
    { name: 'ACH_A', icon: 'https://cdn.example/shared.jpg' },
    { name: 'ACH_B', icon: 'https://cdn.example/shared.jpg' },
    { name: 'ACH_C', icon: 'https://cdn.example/unique.jpg' },
  ]);
  assert.deepEqual(index, { unique: 'ACH_C' });
});

test('buildApiNameIndex tolerates the same achievement listed twice (harmless, not ambiguous)', () => {
  const index = ssf.buildApiNameIndex([
    { name: 'ACH_A', icon: 'https://cdn.example/a.jpg' },
    { name: 'ACH_A', icon: 'https://cdn.example/a.jpg' },
  ]);
  assert.deepEqual(index, { a: 'ACH_A' });
});

test('buildApiNameIndex tolerates non-array input', () => {
  assert.deepEqual(ssf.buildApiNameIndex(null), {});
  assert.deepEqual(ssf.buildApiNameIndex(undefined), {});
});

test('applyApiNameIndex recovers real apiNames for the degraded SteamCommunity-only fallback', () => {
  const degraded = ssf.mapSteamCommunityRows([
    { icon: 'https://cdn.example/a.jpg', title: 'Public One', description: 'Text' },
    { icon: 'https://cdn.example/unknown.jpg', title: 'Never Resolved Before', description: '' },
  ]);
  const index = { a: 'ACH_FIRST' };
  const recovered = ssf.applyApiNameIndex(degraded, index);
  assert.equal(recovered[0].name, 'ACH_FIRST');
  // Unindexed entries keep their title-based placeholder name unchanged, not worse than before.
  assert.equal(recovered[1].name, 'Never Resolved Before');
  // Original entries are not mutated.
  assert.equal(degraded[0].name, 'Public One');
});

test('applyApiNameIndex is a no-op when there is no index yet', () => {
  const degraded = ssf.mapSteamCommunityRows([{ icon: 'https://cdn.example/a.jpg', title: 'X', description: '' }]);
  assert.deepEqual(ssf.applyApiNameIndex(degraded, null), degraded);
  assert.deepEqual(ssf.applyApiNameIndex(degraded, {}), degraded);
});

test('toRarityPercent handles numeric strings, numbers and blanks', () => {
  assert.equal(ssf.toRarityPercent('12.5'), 12.5);
  assert.equal(ssf.toRarityPercent(7), 7);
  assert.equal(ssf.toRarityPercent(''), null);
  assert.equal(ssf.toRarityPercent(undefined), null);
  assert.equal(ssf.toRarityPercent('nope'), null);
});
