'use strict';

/*
  app/assets/uplay-steam.json is a snapshot: it cannot name a game released after it was written.
  This is the live half - Ubisoft's own public product catalogue plus the community id list - and the
  store the automatic resolver writes what it learns into.

  Two properties matter more than coverage: a failed refresh must never empty a working catalogue,
  and a learned mapping must never outrank the curated table.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-catalogue-'));
fs.mkdirSync(path.join(tmp, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => tmp } };
  return originalLoad.apply(this, arguments);
};
const uplayCatalogue = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayCatalogue.js'));
const uplayR2 = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayR2.js'));
Module._load = originalLoad;

uplayCatalogue.setUserDataPath(tmp);
uplayR2.setUserDataPath(tmp);

test('the community list is read as ids and titles, and nothing else', () => {
  const parsed = uplayCatalogue._internal.parseCommunityList(
    [
      '# UPLAY_GAME_ID',
      'List of GAME ID s in Uplay by Ubisoft',
      "# Assassin's Creed Franchise",
      "4 - Assassin's Creed II  ",
      '1653 - ZOMBI (Uplay)',
      '',
      'not a row at all',
      '- 12 missing the id',
      '99999999999 - an id no product could have',
      "4 - Assassin's Creed II duplicated",
    ].join('\n')
  );
  assert.equal(parsed.get('4').name, "Assassin's Creed II", 'trailing spaces are not part of a title');
  assert.equal(parsed.get('1653').name, 'ZOMBI (Uplay)');
  assert.equal(parsed.has('99999999999'), false, 'an id outside the plausible range is a typo, not a product');
  assert.equal(parsed.size, 2, 'headings, prose and a repeated id add nothing');
});

test('an unreadable cache answers nothing rather than throwing', () => {
  fs.mkdirSync(path.join(tmp, 'cache'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'cache', 'uplay-catalogue.json'), '{ this is not json');
  uplayCatalogue.setUserDataPath(tmp + path.sep); // force a reload
  uplayCatalogue.setUserDataPath(tmp);
  assert.equal(uplayCatalogue.nameFor('1653'), '');
  assert.equal(uplayCatalogue.artworkFor('1653'), null);
  assert.equal(uplayCatalogue.spaceIdFor('1653'), '');
});

test('a cached catalogue answers names, artwork and space ids', () => {
  fs.writeFileSync(
    path.join(tmp, 'cache', 'uplay-catalogue.json'),
    JSON.stringify({
      format: 1,
      fetchedAt: Date.now(),
      products: {
        1653: { name: 'Zombi', spaceId: 'eb593d45-4aba-46cf-90e9-2c5cd00bc278', cover: 'https://cdn/zombi.jpg', official: true },
        3539: { name: "Assassin's Creed Origins", official: false },
      },
    })
  );
  uplayCatalogue.setUserDataPath(tmp + path.sep);
  uplayCatalogue.setUserDataPath(tmp);
  assert.equal(uplayCatalogue.nameFor('1653'), 'Zombi');
  assert.deepEqual(uplayCatalogue.artworkFor('1653'), { cover: 'https://cdn/zombi.jpg', background: '' });
  assert.equal(uplayCatalogue.spaceIdFor('1653'), 'eb593d45-4aba-46cf-90e9-2c5cd00bc278');
  assert.equal(uplayCatalogue.artworkFor('3539'), null, 'a product with no artwork says so');
  assert.equal(uplayCatalogue.nameFor('404040'), '', 'an unknown product is unknown');
  assert.equal(uplayCatalogue.nameFor(''), '');
});

test('a learned mapping is remembered, and the shipped table still outranks it', () => {
  /*
    The table is a curated record of decisions a name match cannot make - which Assassin's Creed III
    is the original, which Rainbow Six is the 1998 one. A learned answer fills gaps in it and must
    never overrule one of those decisions.
  */
  assert.equal(uplayR2.findProductMapping('999001'), null, 'nothing is learned yet');
  assert.equal(uplayR2.saveProductMapping({ uplayId: '999001', steamAppid: '424242', steamName: 'A New Ubisoft Game' }), true);

  const learned = uplayR2.findProductMapping('999001');
  assert.equal(learned.steam_appid, 424242);
  assert.equal(learned.steam_name, 'A New Ubisoft Game');
  assert.equal(learned.automatic, true, 'the UI must be able to say this was resolved, not chosen');

  assert.equal(uplayR2.resolveSteamMapping({ appid: 'UPLAY999001' }).steam_appid, 424242, 'a product the table omits uses it');

  // 3539 IS in the shipped table (Assassin's Creed Origins). A learned row must not displace it.
  uplayR2.saveProductMapping({ uplayId: '3539', steamAppid: '111111', steamName: 'Something Else' });
  assert.equal(uplayR2.resolveSteamMapping({ appid: 'UPLAY3539' }).steam_appid, 582160, 'the curated row wins');
});

test('garbage is never written to the learned store', () => {
  assert.equal(uplayR2.saveProductMapping({ uplayId: 'abc', steamAppid: '1' }), false);
  assert.equal(uplayR2.saveProductMapping({ uplayId: '1', steamAppid: 'not-an-appid' }), false);
  assert.equal(uplayR2.saveProductMapping({}), false);
  assert.equal(uplayR2.findProductMapping('abc'), null);
});

test('products a scan could not resolve are queued once and handed over once', () => {
  uplayR2.takeUnresolvedProducts(); // drain anything an earlier test left
  uplayR2.noteUnresolvedProduct('4740');
  uplayR2.noteUnresolvedProduct('4740');
  uplayR2.noteUnresolvedProduct('not-an-id');
  uplayR2.noteUnresolvedProduct('');
  assert.deepEqual(uplayR2.takeUnresolvedProducts(), ['4740']);
  assert.deepEqual(uplayR2.takeUnresolvedProducts(), [], 'taking the queue empties it, so a pass never repeats itself');
});

/*
  Some Ubisoft products deliberately have NO Steam release: Rayman 3, the Settlers History Editions,
  Might & Magic VIII and IX, Prince of Persia, the Discovery Tours. The shipped table says so with an
  empty AppID, which is NOT the same answer as "this product is unknown" - and reading it as one
  produced a library card whose appid was the string "null" and whose name was nothing at all.
*/
test('a product with no Steam release still resolves, and says so', () => {
  const mapping = uplayR2.resolveSteamMapping({ appid: 'UPLAY276' });
  assert.ok(mapping, 'the product is known: the shipped table has a row for it');
  assert.equal(mapping.uplay_id, '276');
  assert.equal(/^[0-9]+$/.test(String(mapping.steam_appid || '')), false, 'there is no Steam AppID to give');
  assert.equal(mapping.uplay_name, 'Prince of Persia', 'the Ubisoft title is the only name it has, so it must be carried');
});

test('every product the shipped table lists resolves to something', () => {
  // The number that decides whether a game can appear at all: a product that resolves to nothing is
  // a save folder discovery drops on the floor.
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'assets', 'uplay-steam.json'), 'utf8'));
  const unresolved = rows.filter((row) => !uplayR2.resolveSteamMapping({ appid: `UPLAY${row.uplay_id}` })).map((row) => row.uplay_id);
  assert.deepEqual(unresolved, [], 'no listed product may be unresolvable');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
