'use strict';

/*
  KytyPS5 trophies: unlock files in the emulator's _Trophies folder, the trophy list read out of the
  game's own sce_sys/trophy2 package, and the launcher's Kyty.ini naming where the games are.

  The refusals matter as much as the reads: a title whose game cannot be found is left out rather
  than shown as a list of bare numbers, and a package entry pointing outside the file is refused
  instead of read past its end.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const kyty = require(path.join(__dirname, '..', '..', 'app', 'parser', 'kytyps5.js'));
const { TITLE_ID, buildUcp, samplePackage, unixToTick, makeGame, makeEmulator, writeUnlocks } = require(path.join(__dirname, '..', 'helpers', 'kytyps5.js'));

const { parseSettingsList, gameDirsFromSettings, readUcp, tickToUnixSeconds, parseUnlocks, trophyKey } = kyty._internal;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-kytyps5-'));
kyty.setIconRoot(path.join(temp, 'icons'));
// An installed launcher's Kyty.ini lives under ProgramData; keep the real one out of the fixtures.
const realProgramData = process.env.ProgramData;
process.env.ProgramData = path.join(temp, 'ProgramData');

test.after(() => {
  process.env.ProgramData = realProgramData;
  fs.rmSync(temp, { recursive: true, force: true });
});

test('Kyty.ini string lists are read the way QSettings writes them', () => {
  assert.deepEqual(parseSettingsList('C:/Games/PS5, D:/More Games'), ['C:/Games/PS5', 'D:/More Games']);
  assert.deepEqual(parseSettingsList('"C:/Games, with comma", D:/x'), ['C:/Games, with comma', 'D:/x'], 'a quoted value keeps its comma');
  assert.deepEqual(parseSettingsList('C:\\\\Games\\\\PS5'), ['C:\\Games\\PS5'], 'an escaped backslash is one backslash');
  assert.deepEqual(parseSettingsList('C:/Jeux/\\xe9t\\xe9'), ['C:/Jeux/été'], 'a \\x escape is a character');
  assert.deepEqual(parseSettingsList('@Invalid()'), [], 'an empty list is not a folder');
  assert.deepEqual(parseSettingsList(''), []);

  const ini = '[GameConfigurations]\ngame_dirs=C:/Wrong\n\n[Launcher]\r\ngame_dir=C:/Old\r\ngame_dirs=C:/New, D:/Other\r\n';
  assert.deepEqual(gameDirsFromSettings(ini), ['C:/New', 'D:/Other'], 'only the Launcher section counts, and the list wins over the old key');
  assert.deepEqual(gameDirsFromSettings('[Launcher]\ngame_dir=C:/Old\n'), ['C:/Old'], 'an older launcher kept a single folder');
  assert.deepEqual(gameDirsFromSettings('[Launcher]\n  game_dirs \t= \t C:/Spaced\n; game_dirs=C:/Comment\n'), ['C:/Spaced']);

  const started = Date.now();
  assert.deepEqual(gameDirsFromSettings(`x${' '.repeat(60000)}y\n[Launcher]\ngame_dirs=C:/After\n`), ['C:/After']);
  assert.ok(Date.now() - started < 1000, `a 60 KB line without '=' took ${Date.now() - started} ms`);
});

test('a trophy package is split into its files, and a broken one is refused', () => {
  const files = readUcp(samplePackage());
  assert.ok(files.has('tropconf.json') && files.has('tropmeta_en-US.json') && files.has('trop0000.png'));

  const bad = samplePackage();
  bad.writeUInt32BE(0xdeadbeef, 0);
  assert.equal(readUcp(bad), null, 'a wrong magic is not a trophy package');

  const outside = buildUcp({ 'a.json': '{}' });
  outside.writeBigUInt64BE(BigInt(outside.length + 10), 0x40 + 0x20 + 0x20);
  assert.equal(readUcp(outside), null, 'an entry pointing past the end is refused');
  assert.equal(readUcp(Buffer.alloc(8)), null);
  assert.equal(readUcp('nope'), null);
});

test('unlock ticks become unix seconds, and nonsense becomes no time', () => {
  assert.equal(tickToUnixSeconds(unixToTick(1700000000)), 1700000000, 'exact as a string');
  assert.equal(tickToUnixSeconds(Number(unixToTick(1700000000))), 1700000000, 'a rounded JSON number lands on the same second');
  assert.equal(tickToUnixSeconds(0), 0);
  assert.equal(tickToUnixSeconds('62135596800000000'), 0, 'the epoch itself is no time');
  assert.equal(tickToUnixSeconds('abc'), 0);

  const unlocked = parseUnlocks({ unlockedTrophies: [1, '2', -3, 'x'], unlockedAt: { 1: Number(unixToTick(1600000000)) } });
  assert.deepEqual([...unlocked], [[1, 1600000000], [2, 0]], 'invalid ids are dropped, a missing time is still an unlock');
  assert.equal(parseUnlocks({ unlockedAt: {} }), null, 'a file without the unlock list is not one');
  assert.equal(trophyKey(0, 7), '7');
  assert.equal(trophyKey(1, 7), '1-7', 'a second trophy set cannot collide with the first');
});

test('the emulator folder is found from any level a user might add', () => {
  const root = path.join(temp, 'levels');
  const emulator = makeEmulator(root);
  assert.equal(kyty.emulatorRoot(emulator), emulator);
  assert.equal(kyty.emulatorRoot(path.join(emulator, '_Trophies')), emulator);
  assert.equal(kyty.emulatorRoot(path.join(emulator, '_Trophies', TITLE_ID)), emulator);
  assert.equal(kyty.emulatorRoot(root), '', 'a folder above the emulator is not claimed');
});

test('a title is listed once its game and trophy package are found through Kyty.ini', () => {
  const root = path.join(temp, 'configured');
  const gameDir = makeGame(path.join(root, 'Games', 'PS5'));
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')] });

  const games = kyty.scan(emulator);
  assert.equal(games.length, 1);
  assert.equal(games[0].appid, TITLE_ID);
  assert.equal(games[0].source, 'KytyPS5 Emulator');
  assert.equal(games[0].data.type, 'kytyps5');
  assert.equal(games[0].data.gameDir, gameDir);
  assert.equal(games[0].data.trustedInstalled, true, 'the game folder itself was found');

  // A reset removes the unlock file but not the folder: the game stays listed, at 0%.
  fs.rmSync(path.join(emulator, '_Trophies', TITLE_ID, 'trophies_1000_0.json'));
  assert.equal(kyty.scan(emulator).length, 1, 'a reset game is still listed');
  assert.deepEqual(kyty.getAchievements(kyty.scan(emulator)[0].data), [], 'with nothing unlocked');
});

test('a game unpacked beside the emulator is found without a configured folder', () => {
  const root = path.join(temp, 'nearby');
  const emulator = makeEmulator(root);
  makeGame(path.join(emulator, 'games'));
  assert.equal(kyty.scan(emulator).length, 1);
});

test('a title whose game cannot be found is left out', () => {
  // Title ids of their own: a list saved by another test would answer for them.
  const root = path.join(temp, 'orphan');
  const emulator = makeEmulator(root, { titleId: 'PPSA00404' });
  assert.deepEqual(kyty.scan(emulator), [], 'no game, no list');

  const withoutPackage = path.join(temp, 'no-package');
  makeGame(path.join(withoutPackage, 'Games'), { withPackage: false, titleId: 'PPSA00405' });
  assert.deepEqual(kyty.scan(makeEmulator(withoutPackage, { gameDirs: [path.join(withoutPackage, 'Games')], titleId: 'PPSA00405' })), [], 'no trophy package, no list');
});

test('a game deleted after it was seen stays listed, as not installed', async () => {
  const titleId = 'PPSA00406';
  const root = path.join(temp, 'uninstalled');
  const gameDir = makeGame(path.join(root, 'Games'), { titleId });
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], titleId });
  assert.equal(kyty.scan(emulator)[0].data.trustedInstalled, true);

  fs.rmSync(gameDir, { recursive: true, force: true });
  const [game] = kyty.scan(emulator);
  assert.ok(game, 'the list kept from the last time the game was there still names the trophies');
  assert.equal(game.data.trustedInstalled, false);
  assert.equal(game.data.gameDir, '', 'no install folder is claimed');
  const schema = await kyty.getGameData(game.data, 'english');
  assert.equal(schema.name, "ASTRO's PLAYROOM");
  assert.equal(schema.achievement.total, 3);
  assert.match(schema.img.icon, /icon0\.png$/, 'its art was kept too');
  assert.equal(kyty.getAchievements(game.data).length, 1, 'and its unlocks still read');
});

// The fixture was written by Exzap's zarchive.exe from makeGame(..., { titleId: 'PPSA00407' }).
test('a game kept as a .zar dump is read out of the archive, and stays listed once deleted', async () => {
  const titleId = 'PPSA00407';
  const root = path.join(temp, 'archived');
  const archive = path.join(root, 'games', `${titleId}.zar`);
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'kytyps5-game.zar'), archive);
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'games')], titleId });

  const [game] = kyty.scan(emulator);
  assert.equal(game.appid, titleId);
  assert.equal(game.data.trustedInstalled, true, 'the archive is the installed game');
  assert.equal(game.data.gameDir, archive);
  const schema = await kyty.getGameData(game.data, 'english');
  assert.equal(schema.name, "ASTRO's PLAYROOM");
  assert.equal(schema.achievement.total, 3);
  assert.match(schema.img.icon, /icon0\.png$/);
  assert.equal(kyty.getAchievements(game.data).length, 1);

  fs.rmSync(archive);
  const [gone] = kyty.scan(emulator);
  assert.equal(gone.data.trustedInstalled, false);
  assert.equal(gone.data.gameDir, '');
  assert.equal((await kyty.getGameData(gone.data, 'english')).achievement.total, 3);
});

test('a .zar that is not a game dump is not a game', () => {
  const root = path.join(temp, 'not-a-dump');
  const games = path.join(root, 'games');
  fs.mkdirSync(games, { recursive: true });
  fs.writeFileSync(path.join(games, 'PPSA00408.zar'), 'not an archive');
  assert.deepEqual(kyty.scan(makeEmulator(root, { gameDirs: [games], titleId: 'PPSA00408' })), []);
});

test('the trophy list comes from the package, in the chosen language, with English kept for rarity', async () => {
  const root = path.join(temp, 'schema');
  makeGame(path.join(root, 'Games'));
  const [game] = kyty.scan(makeEmulator(root, { gameDirs: [path.join(root, 'Games')] }));

  const english = await kyty.getGameData(game.data, 'english');
  assert.equal(english.name, "ASTRO's PLAYROOM");
  assert.equal(english.system, 'playstation');
  assert.equal(english.achievement.total, 3);
  const [platinum, bronze, secret] = english.achievement.list;
  assert.deepEqual([platinum.name, platinum.type, platinum.displayName], ['0', 'P', 'Playroom Master']);
  assert.equal(bronze.type, 'B');
  assert.equal(secret.hidden, 1, 'a hidden trophy stays hidden');
  assert.match(platinum.icon, /^file:\/\/\/.+\/0\.png$/, 'the icon is written out of the package');
  assert.ok(fs.existsSync(decodeURI(platinum.icon.slice('file:///'.length))));
  assert.equal(secret.icon, english.img.icon, "a trophy without an icon in the package shows the game's icon");
  assert.match(english.img.icon, /icon0\.png$/, "the game's own icon is used");

  const french = await kyty.getGameData(game.data, 'french');
  assert.equal(french.name, 'ASTRO PLAYROOM FR', 'the title follows the language too');
  assert.equal(french.achievement.list[1].displayName, 'Premiers pas');
  assert.equal(french.achievement.list[1].rarityName, 'First Steps', 'Exophase matches English titles');

  const german = await kyty.getGameData(game.data, 'german');
  assert.equal(german.achievement.list[1].displayName, 'First Steps', 'a language the package lacks falls back to English');
});

test('unlocks are merged across users, keeping the earliest time', () => {
  const root = path.join(temp, 'unlocks');
  makeGame(path.join(root, 'Games'));
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], unlocks: { 1000: { 1: 1700000000, 2: 0 }, 1001: { 1: 1600000000 } } });
  writeUnlocks(emulator, TITLE_ID, { 1000: { 5: 1650000000 } }, 1);
  fs.writeFileSync(path.join(emulator, '_Trophies', TITLE_ID, 'trophies_1002_0.json'), 'not json');

  const [game] = kyty.scan(emulator);
  const byId = Object.fromEntries(kyty.getAchievements(game.data).map((entry) => [entry.id, entry]));
  assert.equal(byId['1'].earned_time, 1600000000);
  assert.equal(byId['2'].achieved, true);
  assert.equal(byId['2'].earned_time, 0);
  assert.equal(byId['1-5'].earned_time, 1650000000, 'the second trophy set keeps its own ids');
  assert.equal(Object.keys(byId).length, 3, 'an unreadable file adds nothing');
});

test('a game whose package is unreadable is refused, not published empty', async () => {
  const root = path.join(temp, 'broken');
  const gameDir = makeGame(path.join(root, 'Games'));
  fs.writeFileSync(path.join(gameDir, 'sce_sys', 'trophy2', 'trophy00.ucp'), 'garbage');
  await assert.rejects(() => kyty.getGameData({ titleId: TITLE_ID, gameDir }, 'english'));
});

function userScene(name, options) {
  const root = path.join(temp, name);
  const gameDir = makeGame(path.join(root, 'Games'));
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], unlocks: { 1000: { 1: 1700000000 }, 1001: { 2: 1700000100 } }, ...options });
  return { gameDir, emulator, ids: () => kyty.getAchievements(kyty.scan(emulator)[0].data).map((entry) => entry.id).sort() };
}

test('only the global user counts when the launcher names one', () => {
  assert.deepEqual(userScene('user-global', { globalUser: 1001 }).ids(), ['2']);
  assert.deepEqual(userScene('user-global-other', { globalUser: 1000 }).ids(), ['1']);
  assert.deepEqual(userScene('user-none', {}).ids(), ['1', '2'], 'no user setting at all keeps every user');
  assert.deepEqual(userScene('user-unknown', { globalUser: 4242 }).ids(), [], 'a user without a file has earned nothing');
});

test('a game setting of the launcher wins over the global user', () => {
  const root = path.join(temp, 'user-game');
  const gameDir = makeGame(path.join(root, 'Games'));
  const emulator = makeEmulator(root, {
    gameDirs: [path.join(root, 'Games')],
    unlocks: { 1000: { 1: 1700000000 }, 1001: { 2: 1700000100 } },
    globalUser: 1001,
    gameUsers: [{ path: gameDir, user: 1000 }],
  });
  const [game] = kyty.scan(emulator);
  assert.equal(kyty.activeUserId(game.data), '1000');
  assert.deepEqual(kyty.getAchievements(game.data).map((entry) => entry.id), ['1']);
});

test('an unreadable user setting keeps the last good one, and the first read without one keeps every user', () => {
  const scene = userScene('user-malformed', { globalUser: 1001 });
  assert.deepEqual(scene.ids(), ['2']);
  fs.writeFileSync(path.join(scene.emulator, 'Kyty.ini'), '[GlobalConfiguration]\nuser_id=oops\n[Launcher]\ngame_dirs=\n');
  assert.deepEqual(scene.ids(), ['2'], 'the last valid setting stands in');
  fs.rmSync(path.join(scene.emulator, 'Kyty.ini'));
  assert.deepEqual(scene.ids(), ['2'], 'a missing file too');

  const fresh = userScene('user-malformed-fresh', {});
  fs.writeFileSync(path.join(fresh.emulator, 'Kyty.ini'), '[GlobalConfiguration]\nuser_id=oops\n');
  assert.deepEqual(fresh.ids(), ['1', '2'], 'nothing valid was ever read: nothing is hidden');
});

test('a game the launcher knows is listed before its first unlock', async () => {
  const titleId = 'PPSA00500';
  const root = path.join(temp, 'before-trophy');
  makeGame(path.join(root, 'Games'), { titleId });
  const emulator = makeEmulator(root, { gameDirs: [path.join(root, 'Games')], unlocks: null, titleId });
  assert.equal(fs.existsSync(path.join(emulator, '_Trophies')), false);

  const [game] = kyty.scan(emulator);
  assert.equal(game.appid, titleId);
  assert.equal(game.data.installed, true);
  assert.deepEqual(kyty.getAchievements(game.data), [], 'nothing earned yet');
  assert.equal((await kyty.getGameData(game.data, 'english')).achievement.total, 3, 'the schema and icons come from the game');

  writeUnlocks(emulator, titleId, { 1000: { 1: 1700000000 } });
  assert.deepEqual(kyty.getAchievements(kyty.scan(emulator)[0].data).map((entry) => entry.id), ['1'], 'the same record once _Trophies exists');
});

test('games named only by a launcher game setting, or kept as a .zar, are listed before their first unlock', () => {
  const root = path.join(temp, 'before-trophy-settings');
  const gameDir = makeGame(path.join(root, 'elsewhere'), { titleId: 'PPSA00501' });
  const archive = path.join(root, 'zars', 'PPSA00407.zar');
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'kytyps5-game.zar'), archive);
  const emulator = makeEmulator(root, { unlocks: null, gameUsers: [{ path: gameDir, user: 1000 }, { path: archive, user: 1000 }] });

  assert.deepEqual(kyty.scan(emulator).map((game) => game.appid).sort(), ['PPSA00407', 'PPSA00501']);
});

test('a binary that never writes trophies is not an emulator folder before its first unlock', () => {
  const root = path.join(temp, 'other-fork');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'kyty_emulator.exe'), 'MZ no trophy support');
  assert.equal(kyty.emulatorRoot(root), '');
  fs.writeFileSync(path.join(root, 'kyty_emulator.exe'), 'MZ with _Trophies inside');
  assert.equal(kyty.emulatorRoot(root), root);
});
