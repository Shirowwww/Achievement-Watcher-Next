'use strict';

// Recompiled Xbox 360 games: the three unlock-list shapes, where they are found, and the schema read
// from dbox.tools by title id. Fixtures are synthetic copies of the real layouts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const x360 = require('../../app/parser/x360Recomp.js');

const TITLE = '454108CF';
// 2026-09-04T04:58:41Z as a Windows FILETIME.
const FILETIME = '134329715212621157';
const FILETIME_UNIX = Date.UTC(2026, 8, 4, 4, 58, 41) / 1000;

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-x360-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const rexToml = (ids) => `# Achievement unlock state - managed by ReXGlue runtime\n\n${ids.map((id) => `[unlocked.${id}]\nfiletime = ${FILETIME}\n`).join('\n')}`;

function dboxEntry(id, { en = `Ach ${id}`, fr = `Succes ${id}`, secret = false } = {}) {
  const loc = (identifier, name) => ({ locale: { identifier }, name, description: `${name} desc`, locked_description: `${name} locked` });
  return { title_id: TITLE, achievement_id: id, gamerscore: 10, is_secret: secret, is_revoked: false, localizations: [loc('en_US', en), loc('fr_FR', fr)] };
}

function fakeFetch(achievements, { name = 'Sample Title', fail = false } = {}) {
  const calls = { schema: 0, images: [], art: [] };
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  const fetchImpl = async (url) => {
    if (fail) throw new Error('offline');
    if (url.includes('/achievements/v1/')) {
      calls.schema += 1;
      return { ok: true, status: 200, json: async () => achievements };
    }
    if (url.includes('/title_ids/')) return { ok: true, status: 200, json: async () => ({ name }) };
    if (url.includes('/marketplace/products/')) return { ok: true, status: 200, json: async () => ({ default_title: '' }) };
    if (url.includes('download.xbox.com')) calls.art.push(url);
    else calls.images.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => png };
  };
  return { fetchImpl, calls };
}

test('the ReXGlue list turns FILETIMEs into unix seconds and reads the older array form', () => {
  const unlocked = x360.parseToml(rexToml([1, 26]));
  assert.deepEqual([...unlocked.keys()], [1, 26]);
  assert.equal(unlocked.get(26), FILETIME_UNIX);
  assert.deepEqual([...x360.parseToml('unlocked = [3, 4]\n')], [[3, 0], [4, 0]]);
  assert.equal(x360.parseToml('').size, 0);
  assert.equal(x360.filetimeToUnixSeconds('12'), 0, 'a time before 2000 is not a real unlock time');
});

test('the TSV list names its title in the header and is refused without one', () => {
  const parsed = x360.parseTsv(`EOTACH1\t415608b2\tB13E07DFF9AB6772\n55\t${FILETIME}\r\n`);
  assert.equal(parsed.titleId, '415608B2');
  assert.equal(parsed.unlocked.get(55), FILETIME_UNIX);
  assert.equal(x360.parseTsv('55\t1\n'), null);
});

test('the JSON list is read in UTF-16 and a damaged one throws rather than reading as empty', () => {
  const body = JSON.stringify({ achievements: [{ id: 1, name: 'Зеленый', description: 'd', gamerscore: 10, unlocked: true }, { id: 2, name: 'b', unlocked: false }] });
  const list = x360.parseJson(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]));
  assert.equal(list[0].name, 'Зеленый');
  assert.deepEqual(list.map((e) => e.unlocked), [true, false]);
  assert.throws(() => x360.parseJson(Buffer.from('{"achievements": [')));
  assert.throws(() => x360.parseJson(Buffer.from('{}')));
});

test('a library folder yields every game, named after the folder holding its executable', (t) => {
  const library = tempDir(t);
  write(path.join(library, 'LEGO Dimensions', 'lego.exe'), '');
  write(path.join(library, 'LEGO Dimensions', 'content', 'achievements', '5752084B.toml'), rexToml([1]));
  write(path.join(library, 'Gears Hollow', 'gears.exe'), '');
  write(path.join(library, 'Gears Hollow', 'GearGame', 'SaveData', 'Achievements.json'), JSON.stringify({ achievements: [{ id: 1, name: 'a', unlocked: false }] }));
  write(path.join(library, 'Other', 'Achievements', '415608B2', 'B13E07DFF9AB6772.tsv'), 'EOTACH1\t415608B2\tX\n');
  write(path.join(library, 'Other', 'achievements', 'notes.toml'), '');

  const games = x360.scan(library).sort((a, b) => a.appid.localeCompare(b.appid));
  assert.deepEqual(
    games.map((g) => [g.appid, g.data.format, g.data.folder]),
    [
      ['x360-415608B2', 'tsv', 'Other'],
      ['x360-5752084B', 'toml', 'LEGO Dimensions'],
      ['x360-gears-hollow', 'json', 'Gears Hollow'],
    ]
  );
  assert.ok(games.every((g) => g.source === 'Xbox 360 Recomp' && g.data.type === 'x360recomp'));

  const lego = games.find((g) => g.appid === 'x360-5752084B');
  assert.equal(lego.data.gameDir, path.join(library, 'LEGO Dimensions'), 'the install is claimed, so no second "unconfigured" tile');
  assert.equal(lego.data.exe, path.join(library, 'LEGO Dimensions', 'lego.exe'));
  assert.equal(games.find((g) => g.appid === 'x360-415608B2').data.gameDir, undefined, 'no executable, no install');

  // Pointed at the game folder itself, the name is still the game's, not "content".
  assert.equal(x360.scan(path.join(library, 'LEGO Dimensions'))[0].data.folder, 'LEGO Dimensions');
});

test('Documents is read only where a folder holds an achievements folder', (t) => {
  const docs = tempDir(t);
  write(path.join(docs, 'dantes_inferno', 'achievements', `${TITLE}.toml`), rexToml([1]));
  write(path.join(docs, 'My Games', 'deep', 'achievements', '11111111.toml'), rexToml([1]));
  const games = x360.scanDocuments([docs]);
  assert.deepEqual(games.map((g) => g.appid), [`x360-${TITLE}`]);
  assert.equal(games[0].data.folder, 'dantes_inferno');
});

test('unlocks are merged across TSV profiles, keeping the earliest time', (t) => {
  const dir = tempDir(t);
  write(path.join(dir, 'a.tsv'), `T\t415608B2\tA\n55\t${FILETIME}\n`);
  write(path.join(dir, 'b.tsv'), `T\t415608B2\tB\n55\t134329715212621157\n56\t0\n`);
  const unlocked = x360.getAchievements({ format: 'tsv', dir });
  assert.deepEqual(unlocked, [
    { id: '55', achieved: true, earned_time: FILETIME_UNIX },
    { id: '56', achieved: true, earned_time: 0 },
  ]);
  assert.deepEqual(x360.getAchievements({ format: 'toml', file: path.join(dir, 'missing.toml') }), [], 'no list yet is a 0% game');
});

test('the schema comes from dbox.tools in the chosen language, with icons only where ids line up', async (t) => {
  const root = tempDir(t);
  x360.setDataRoot(root);
  t.after(() => x360.setDataRoot(''));

  const host = fakeFetch([dboxEntry(1, { secret: true }), dboxEntry(2)]);
  const game = await x360.getGameData({ format: 'toml', titleId: TITLE, folder: 'dantes_inferno' }, 'french', { fetchImpl: host.fetchImpl });
  assert.equal(game.name, 'Sample Title');
  assert.equal(game.appid, `x360-${TITLE}`);
  assert.equal(game.system, 'xbox');
  assert.deepEqual(game.achievement.list.map((a) => [a.name, a.displayName, a.hidden]), [['1', 'Succes 1', 1], ['2', 'Succes 2', 0]]);
  assert.equal(host.calls.images.length, 2);
  assert.ok(game.achievement.list.every((a) => a.icon.startsWith('file:///')));

  // Cached: a second load asks the site nothing.
  await x360.getGameData({ format: 'toml', titleId: TITLE }, 'german', { fetchImpl: host.fetchImpl });
  assert.equal(host.calls.schema, 1);

  // Ids 46.. do not match images numbered 1..N: no guessed pictures.
  const offset = fakeFetch([dboxEntry(46), dboxEntry(47)]);
  const shifted = await x360.getGameData({ format: 'tsv', titleId: '415608B2' }, 'english', { fetchImpl: offset.fetchImpl });
  assert.equal(offset.calls.images.length, 0);
  assert.ok(shifted.achievement.list.every((a) => a.icon === ''));
  assert.equal(shifted.achievement.list[0].displayName, 'Ach 46');
});

test('an unreachable site throws when nothing is cached, and a stale copy answers otherwise', async (t) => {
  const root = tempDir(t);
  x360.setDataRoot(root);
  t.after(() => x360.setDataRoot(''));

  const offline = fakeFetch([], { fail: true });
  await assert.rejects(x360.getGameData({ format: 'toml', titleId: TITLE }, 'english', { fetchImpl: offline.fetchImpl }));

  write(path.join(root, 'steam_cache', 'x360recomp', `${TITLE}.json`), JSON.stringify({ fetchedAt: 0, name: 'Old', achievements: [dboxEntry(1)] }));
  const game = await x360.getGameData({ format: 'toml', titleId: TITLE }, 'english', { fetchImpl: offline.fetchImpl });
  assert.equal(game.name, 'Old');
  assert.equal(game.achievement.total, 1);
});

test('the JSON shape needs no network and keeps its own texts', async (t) => {
  const dir = tempDir(t);
  const file = write(path.join(dir, 'Achievements.json'), JSON.stringify({ achievements: [{ id: 1, name: 'One', description: 'd', gamerscore: 5, unlocked: true }] }));
  const game = await x360.getGameData({ format: 'json', file, folder: 'Gears Hollow' }, 'english', { fetchImpl: () => assert.fail('no request') });
  assert.equal(game.name, 'Gears Hollow');
  assert.deepEqual(game.achievement.list.map((a) => [a.displayName, a.gamerscore]), [['One', 5]]);
  assert.deepEqual(x360.getAchievements({ format: 'json', file }), [{ id: '1', achieved: true, earned_time: 0 }]);
});

test('a regional subtitle is dropped when the folder already names the game without it', () => {
  assert.equal(x360.gameName("Dante's Inferno: Shinkyoku Jigoku-hen", 'dantes_inferno'), "Dante's Inferno");
  assert.equal(x360.gameName('Spider-Man: Edge of Time', 'spider_man_edge_of_time'), 'Spider-Man: Edge of Time');
  assert.equal(x360.gameName('Midnight Club: Los Angeles', ''), 'Midnight Club: Los Angeles');
});

const { xach, xstr, xthd, xdbf, PNG } = require('../helpers/xlln.js');
const { buildXex } = require('../helpers/xex.js');

// A SPA as the game ships it: one visible achievement (flag 0x8) with its picture, one secret.
function gameSpa(titleId) {
  return xdbf([
    { namespace: 1, id: 1, data: xthd(titleId) },
    {
      namespace: 1,
      id: 2,
      data: xach([
        { id: 1, titleStringId: 10, unlockedDescriptionId: 11, lockedDescriptionId: 12, imageId: 7, gamerscore: 20, flags: 0x9 },
        { id: 2, titleStringId: 20, unlockedDescriptionId: 21, lockedDescriptionId: 22, imageId: 8, gamerscore: 50, flags: 0x1 },
      ]),
    },
    { namespace: 3, id: 1, data: xstr(new Map([[0x8000, 'Short Name'], [10, 'Bridge'], [11, 'Crossed it.'], [20, 'Hidden'], [21, 'Found it.']])) },
    { namespace: 3, id: 4, data: xstr(new Map([[10, 'Pont'], [11, 'Traverse.']])) },
    { namespace: 2, id: 7, data: PNG },
  ]);
}

test('the game executable is the schema: its languages, its secret flag and its own pictures', async (t) => {
  const root = tempDir(t);
  x360.setDataRoot(path.join(root, 'data'));
  t.after(() => x360.setDataRoot(''));
  const game = path.join(root, 'Games', 'Sample');
  write(path.join(game, 'sample.exe'), '');
  write(path.join(game, 'assets', 'default.xex'), buildXex({ spa: gameSpa(0x415608b2), titleId: 0x415608b2 }));
  write(path.join(game, 'content', 'achievements', '415608B2.toml'), rexToml([1]));

  const [record] = x360.scan(path.join(root, 'Games'));
  assert.equal(record.data.xex, path.join(game, 'assets', 'default.xex'));
  // dbox.tools knows a DLC achievement the executable does not.
  const host = fakeFetch([dboxEntry(1), dboxEntry(2), dboxEntry(3, { fr: 'DLC' })], { name: 'Full Title Name' });
  const data = await x360.getGameData(record.data, 'french', { fetchImpl: host.fetchImpl });

  assert.equal(data.name, 'Full Title Name');
  // The marketplace's own box, background and tile, kept on disk (the host is plain http).
  for (const [slot, file] of [['portrait', 'boxartlg.jpg'], ['background', 'background.jpg'], ['icon', 'tile.png']]) {
    assert.ok(data.img[slot].startsWith('file:///') && data.img[slot].endsWith(`/art/${file}`), slot);
  }
  assert.equal(data.img.header, undefined, 'never an achievement picture as the header');
  assert.deepEqual(data.rarityTitles, ['Full Title Name', 'Short Name'], 'Exophase may file it under either');
  assert.equal(data.achievement.list[0].rarityName, 'Bridge', 'the English text rides along for the rarity lookup');
  assert.deepEqual(
    data.achievement.list.map((a) => [a.name, a.displayName, a.hidden, Boolean(a.icon)]),
    [
      ['1', 'Pont', 0, true],
      ['2', 'Hidden', 1, false],
      ['3', 'DLC', 0, false],
    ]
  );
  assert.equal(host.calls.images.length, 0, 'image ids 7/8 prove ids are not image ids, so the DLC gets no guessed picture');
});

test('a list under Documents finds its executable through the watched folders, and keeps it once read', async (t) => {
  const root = tempDir(t);
  x360.setDataRoot(path.join(root, 'data'));
  t.after(() => x360.setDataRoot(''));
  const xexFile = write(path.join(root, 'Games', 'Sample', 'default.xex'), buildXex({ spa: gameSpa(0x454108cf), titleId: 0x454108cf }));
  write(path.join(root, 'Docs', 'sample_game', 'achievements', `${TITLE}.toml`), rexToml([1]));

  assert.deepEqual(x360.scan(path.join(root, 'Games')), [], 'an executable alone is not a library entry');
  const [record] = x360.scanDocuments([path.join(root, 'Docs')]);
  assert.equal(record.data.gameDir, undefined, 'a default.xex with no executable beside it names no install');
  write(path.join(root, 'Games', 'Sample', 'sample.exe'), '');
  assert.equal(x360.scanDocuments([path.join(root, 'Docs')])[0].data.gameDir, path.join(root, 'Games', 'Sample'), 'the executable found by title id names the install');
  const offline = fakeFetch([], { fail: true });
  const first = await x360.getGameData(record.data, 'english', { fetchImpl: offline.fetchImpl });
  assert.equal(first.name, 'Short Name', 'offline, the executable names the game');
  assert.equal(first.achievement.list[0].displayName, 'Bridge');

  fs.rmSync(xexFile);
  const again = await x360.getGameData(record.data, 'english', { fetchImpl: offline.fetchImpl });
  assert.equal(again.achievement.total, 2, 'the extracted list outlives the executable');
});

test('a JSON list is tied to its Xbox 360 title only when every id and gamerscore match', async (t) => {
  const root = tempDir(t);
  x360.setDataRoot(path.join(root, 'data'));
  t.after(() => x360.setDataRoot(''));
  const entries = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Local ${id}`, description: 'local', gamerscore: id * 10, unlocked: id === 1 }));
  const file = write(path.join(root, 'Hollow Build', 'GearGame', 'SaveData', 'Achievements.json'), JSON.stringify({ achievements: entries }));
  const entry = (titleId, id, gamerscore) => ({ ...dboxEntry(id, { fr: `Titre ${id}` }), title_id: titleId, gamerscore });
  const lists = {
    AAAA0001: [1, 2, 3, 4, 5].map((id) => entry('AAAA0001', id, id === 5 ? 99 : id * 10)), // one gamerscore off
    AAAA0002: [1, 2, 3, 4, 5, 6].map((id) => entry('AAAA0002', id, id * 10)),
  };
  const asked = [];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url.includes('/title_ids/?name=')) return { ok: true, status: 200, json: async () => ({ items: [{ title_id: 'AAAA0001' }, { title_id: 'AAAA0002' }] }) };
    const listMatch = /achievements\/v1\/(\w+)/.exec(url);
    if (listMatch) return { ok: true, status: 200, json: async () => lists[listMatch[1]] || [] };
    if (url.includes('/title_ids/')) return { ok: true, status: 200, json: async () => ({ name: 'Retail Name' }) };
    return { ok: true, status: 200, arrayBuffer: async () => png };
  };

  const data = await x360.getGameData({ format: 'json', file, folder: 'Hollow Build' }, 'french', { fetchImpl });
  assert.equal(data.name, 'Hollow Build', 'the build keeps its own name');
  assert.equal(data.achievement.total, 5, 'the game can only earn its own list: no extra entries from the retail title');
  assert.equal(data.achievement.list[0].displayName, 'Titre 1', 'texts come in the player language from the identified title');
  assert.ok(data.achievement.list.every((a) => a.icon.startsWith('file:///')));
  assert.ok(data.img.portrait, 'marketplace art of the identified title');
  assert.deepEqual(data.rarityTitles, ['Retail Name', 'Hollow Build']);

  // The answer is kept: no second search.
  const searches = asked.filter((url) => url.includes('?name=')).length;
  await x360.getGameData({ format: 'json', file, folder: 'Hollow Build' }, 'english', { fetchImpl });
  assert.equal(asked.filter((url) => url.includes('?name=')).length, searches);

  // Too short a list proves nothing and is never looked up.
  const tiny = write(path.join(root, 'Tiny', 'SaveData', 'Achievements.json'), JSON.stringify({ achievements: entries.slice(0, 2) }));
  const before = asked.length;
  const small = await x360.getGameData({ format: 'json', file: tiny, folder: 'Tiny' }, 'english', { fetchImpl });
  assert.equal(asked.length, before);
  assert.equal(small.achievement.list[0].displayName, 'Local 1');
});

test('a dbox locale that only repeats another locale is not taken for a translation', async (t) => {
  const root = tempDir(t);
  x360.setDataRoot(root);
  t.after(() => x360.setDataRoot(''));
  const loc = (identifier, name) => ({ locale: { identifier }, name, description: `${name} desc` });
  const entry = { achievement_id: 1, gamerscore: 10, localizations: [loc('en_US', 'Rampage'), loc('ja_JP', 'ランページ'), loc('ru_RU', 'ランページ'), loc('fr_FR', 'Fureur')] };
  const host = fakeFetch([entry]);
  const russian = await x360.getGameData({ format: 'toml', titleId: '5841089D' }, 'russian', { fetchImpl: host.fetchImpl });
  assert.equal(russian.achievement.list[0].displayName, 'Rampage', 'Russian readers get English, not the Japanese copy');
  const japanese = await x360.getGameData({ format: 'toml', titleId: '5841089D' }, 'japanese', { fetchImpl: host.fetchImpl });
  assert.equal(japanese.achievement.list[0].displayName, 'ランページ');
  const french = await x360.getGameData({ format: 'toml', titleId: '5841089D' }, 'french', { fetchImpl: host.fetchImpl });
  assert.equal(french.achievement.list[0].displayName, 'Fureur');
});

test('a PC game that keeps a file of the same name is not taken for an Xbox 360 game', (t) => {
  const library = tempDir(t);
  write(path.join(library, 'Unity Game', 'game.exe'), '');
  write(path.join(library, 'Unity Game', 'SaveData', 'achievements.json'), JSON.stringify({ unlockedAchievements: ['ACH_WIN'] }));
  write(path.join(library, 'Other Game', 'SaveData', 'Achievements.json'), JSON.stringify({ achievements: [{ id: 'ACH_WIN', achieved: true }] }));
  write(path.join(library, 'Mod', 'achievements', 'ABCDEF01', 'readme.tsv'), 'name\tvalue\nfoo\t1\n');
  assert.deepEqual(x360.scan(library), []);
});
