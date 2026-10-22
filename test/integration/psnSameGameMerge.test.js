'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('module');
const test = require('node:test');

// Read before achievements.js resolves its data folder, so the scan never sees the real one.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-psn-merge-'));
process.env.AW_USER_DATA = temp;
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');

function saveList(listId, { name, platform, titles, earned = [] }) {
  const dir = path.join(temp, 'steam_cache', 'psn', listId);
  fs.mkdirSync(dir, { recursive: true });
  const list = titles.map((displayName, id) => ({ name: String(id), displayName }));
  fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify({ listId, name, platform, achievement: { total: list.length, list } }));
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(Object.fromEntries(earned.map((id) => [String(id), { earned: true, earned_time: 1000 + id }]))));
}

const GTA = ['Welcome to Los Santos', 'A Friendship Resurrected', "A Fair Day's Pay", 'The Moment of Truth'];
saveList('NPWR06221_00', { name: 'Grand Theft Auto V (PlayStation®5) (PS4)', platform: 'PS4', titles: GTA, earned: [0, 1] });
saveList('NPWR21647_00', { name: 'Grand Theft Auto V (PlayStation®5) (PS5)', platform: 'PS5', titles: GTA.toReversed(), earned: [3] });
saveList('NPWR99999_00', { name: 'ASTRO BOT', platform: 'PS5', titles: ['Platinum'] });

const record = (listId) => ({ appid: `psn-${listId}`, source: 'PlayStation Network', data: { type: 'psnLibrary' } });
const records = ['NPWR21647_00', 'NPWR06221_00', 'NPWR99999_00'].map(record);

test('the PlayStation lists of one game on two consoles make one card, whatever the order', () => {
  for (const list of [records, records.toReversed()]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.deepEqual(merged.map((g) => g.appid).sort(), ['psn-NPWR06221_00', 'psn-NPWR99999_00']);
    const card = merged.find((g) => g.appid === 'psn-NPWR06221_00');
    assert.deepEqual(card._sources.map((s) => s.appid).sort(), ['psn-NPWR06221_00', 'psn-NPWR21647_00']);
  }
});

test("a hidden card keeps the game's list from the other console hidden too", () => {
  // Hidden games are filtered out before the merge, so the card's own list is simply missing here.
  const withoutCard = records.filter((g) => g.appid !== 'psn-NPWR06221_00');
  const merged = achievements._internal.mergeCrossSourceDuplicates(withoutCard);
  assert.deepEqual(merged.map((g) => g.appid), ['psn-NPWR99999_00']);
});

test("the joined list's unlocks land on the card's own trophies", async () => {
  const game = { appid: 'psn-NPWR06221_00', achievement: { list: GTA.map((displayName, id) => ({ name: String(id), displayName })) } };
  const read = (listId) => achievements._internal.readRecordUnlocks('psnLibrary', record(listId), game, { achievement: {} }, {});
  // The PS5 trophy 3 is the PS4 trophy 0.
  assert.deepEqual(Object.keys(await read('NPWR21647_00')), ['0']);
  assert.deepEqual(Object.keys(await read('NPWR06221_00')).sort(), ['0', '1']);
});
