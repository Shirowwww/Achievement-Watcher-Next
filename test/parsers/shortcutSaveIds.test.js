'use strict';

/*
  A game started from a non-Steam shortcut (added for Steam Input) gets SteamAppId/SteamGameId = the
  shortcut's own generated id from Steam, and gbe_fork writes the unlocks to GSE Saves\<that id>.
  AW reads that folder as one more save of the game the shortcut starts, instead of writing a
  steam_appid.txt that makes Steam stop tracking the play time.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const shortcutSaveIds = require(path.join(__dirname, '..', '..', 'app', 'util', 'shortcutSaveIds.js'));
const steamLibrary = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steamLibrary.js'));
const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));

const tmp = makeTempDir('aw-shortcut-save-ids-');

const map = (key, body) => Buffer.concat([Buffer.from([0x00]), Buffer.from(`${key}\0`), body, Buffer.from([0x08])]);
const str = (key, value) => Buffer.concat([Buffer.from([0x01]), Buffer.from(`${key}\0${value}\0`)]);
const int = (key, value) => {
  const number = Buffer.alloc(4);
  number.writeInt32LE(value);
  return Buffer.concat([Buffer.from([0x02]), Buffer.from(`${key}\0`), number]);
};
const entry = (index, appid, exe, startDir) =>
  map(String(index), Buffer.concat([int('appid', appid), str('AppName', `Game ${index}`), str('Exe', `"${exe}"`), str('StartDir', `"${startDir}"`)]));

// The generated id as a signed int32, the way shortcuts.vdf stores it; GBE names the folder with the unsigned one.
const SIGNED = -1441195210;
const UNSIGNED = '2853772086';

test('shortcuts.vdf gives each shortcut its id as the unsigned number the emulator names its folder with', () => {
  const client = path.join(tmp, 'Steam');
  const config = path.join(client, 'userdata', '1', 'config');
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(config, 'shortcuts.vdf'), Buffer.concat([map('shortcuts', Buffer.concat([entry(0, SIGNED, 'D:\\G\\A\\a.exe', 'D:\\G\\A'), entry(1, 5, 'D:\\G\\B\\b.exe', 'D:\\G\\B')])), Buffer.from([0x08])]));
  const entries = steamLibrary.shortcutEntries({ clientDir: client });
  assert.deepEqual(entries.map((e) => e.id), [UNSIGNED, '5']);
  assert.equal(entries[0].exe, 'D:\\G\\A\\a.exe');
  assert.equal(entries[0].startDir, 'D:\\G\\A');
  assert.deepEqual(steamLibrary.shortcutLaunches({ clientDir: client })[0], { exe: 'D:\\G\\A\\a.exe', startDir: 'D:\\G\\A' }, 'the older view is unchanged');
});

test('a shortcut belongs to a game when its exe or its start folder is inside the game folder', () => {
  const gameDir = path.join(tmp, 'Games', 'LEGO');
  const outside = path.join(tmp, 'Tools', 'launcher.exe');
  const entries = [
    { id: '111', exe: path.join(gameDir, 'Binaries', 'Win64', 'game.exe'), startDir: path.join(gameDir, 'Binaries', 'Win64') },
    { id: '222', exe: outside, startDir: gameDir }, // a launcher elsewhere that starts in the game folder
    { id: '333', exe: path.join(gameDir, 'x.exe'), startDir: path.join(tmp, 'Elsewhere') }, // exe inside, started from outside
    { id: '444', exe: outside, startDir: path.join(tmp, 'Tools') }, // not this game
    { id: '555', exe: path.join(tmp, 'Games', 'LEGO Two', 'g.exe'), startDir: path.join(tmp, 'Games', 'LEGO Two') }, // a folder sharing the prefix
  ];
  assert.deepEqual(shortcutSaveIds.linkedIds(gameDir, entries), ['111', '222', '333']);
  assert.deepEqual(shortcutSaveIds.linkedIds('', entries), []);
});

test('the link file is read back, pruned to live shortcuts, and written only on a change', () => {
  const file = path.join(tmp, 'cfg', 'shortcutSaveIds.json');
  assert.deepEqual(shortcutSaveIds.read(file), {});
  assert.equal(shortcutSaveIds.update(file, new Map([['2215200', ['111', '222']]]), new Set(['111', '222'])), true);
  assert.deepEqual(shortcutSaveIds.read(file), { 111: '2215200', 222: '2215200' });
  assert.equal(shortcutSaveIds.update(file, new Map([['2215200', ['111', '222']]]), new Set(['111', '222'])), false, 'no rewrite when nothing changed');
  // A scan that saw only another game keeps the first one's links while its shortcuts still exist...
  shortcutSaveIds.update(file, new Map([['3751260', ['999']]]), new Set(['111', '222', '999']));
  assert.deepEqual(shortcutSaveIds.read(file), { 111: '2215200', 222: '2215200', 999: '3751260' });
  // ...and drops them once the shortcut is deleted in Steam.
  shortcutSaveIds.update(file, new Map(), new Set(['999']));
  assert.deepEqual(shortcutSaveIds.read(file), { 999: '3751260' });
  assert.equal(shortcutSaveIds.appidFor(shortcutSaveIds.read(file), '999'), '3751260');
  assert.equal(shortcutSaveIds.appidFor(shortcutSaveIds.read(file), '730'), null);
  assert.deepEqual(shortcutSaveIds.idsFor(shortcutSaveIds.read(file), '3751260'), ['999']);
});

test('the scan folds a shortcut-id save folder into its game and drops the stray game it would have been', () => {
  const gameDir = path.join(tmp, 'Games', 'Batman');
  const savesRoot = path.join(tmp, 'AppData', 'GSE Saves');
  fs.mkdirSync(path.join(savesRoot, UNSIGNED), { recursive: true });
  const data = [
    { appid: '2215200', source: 'Goldberg', data: { type: 'file', path: path.join(savesRoot, '2215200') } },
    { appid: UNSIGNED, source: 'Goldberg', data: { type: 'file', path: path.join(savesRoot, UNSIGNED) } },
    { appid: '730', source: 'Goldberg', data: { type: 'file', path: path.join(savesRoot, '730') } },
  ];
  const entries = [{ id: UNSIGNED, exe: path.join(gameDir, 'Batman.exe'), startDir: gameDir }];
  const folderFor = (id) => path.join(savesRoot, id);
  const result = shortcutSaveIds.foldAliasSaves({ data, games: [{ appid: '2215200', gameDir }], entries, folderFor });

  assert.deepEqual(data.map((g) => g.appid), ['2215200', '730'], 'the shortcut id is no game of its own');
  assert.deepEqual(result.links.get('2215200'), [UNSIGNED]);
  assert.deepEqual(result.aliasPaths.get('2215200'), [path.join(savesRoot, UNSIGNED)]);
  assert.equal(result.links.has('730'), false, 'a game with no shortcut is untouched');
});

test('a shortcut whose exe is outside the game folder is not linked, and its stray folder is left alone', () => {
  const gameDir = path.join(tmp, 'Games', 'Elsewhere');
  const savesRoot = path.join(tmp, 'AppData2', 'GSE Saves');
  fs.mkdirSync(path.join(savesRoot, UNSIGNED), { recursive: true });
  const data = [{ appid: UNSIGNED, source: 'Goldberg', data: { type: 'file', path: path.join(savesRoot, UNSIGNED) } }];
  const entries = [{ id: UNSIGNED, exe: path.join(tmp, 'Tools', 'run.exe'), startDir: path.join(tmp, 'Tools') }];
  const result = shortcutSaveIds.foldAliasSaves({ data, games: [{ appid: '2215200', gameDir }], entries, folderFor: (id) => path.join(savesRoot, id) });
  assert.equal(result.links.size, 0);
  assert.equal(data.length, 1, 'not guessed: it stays what it was');
});

test('a game with no save under the shortcut id keeps just its own folder', () => {
  const gameDir = path.join(tmp, 'Games', 'Quiet');
  const entries = [{ id: UNSIGNED, exe: path.join(gameDir, 'q.exe'), startDir: gameDir }];
  const result = shortcutSaveIds.foldAliasSaves({ data: [], games: [{ appid: '1', gameDir }], entries, folderFor: (id) => path.join(tmp, 'nowhere', id) });
  assert.deepEqual(result.links.get('1'), [UNSIGNED], 'the link is still recorded for the Watchdog');
  assert.equal(result.aliasPaths.has('1'), false);
});

function writeSave(dir, achievements) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'achievements.json'), JSON.stringify(achievements));
}
const earnedOf = (entry) => entry && entry.earned === true;
const timeOf = (entry) => (entry && entry.earned_time) || 0;

test('two save folders of one game merge by achievement name, oldest unlock kept, nothing twice', async () => {
  const own = path.join(tmp, 'saves', '2215200');
  const alias = path.join(tmp, 'saves', UNSIGNED);
  writeSave(own, { A: { earned: true, earned_time: 2000 }, B: { earned: false, earned_time: 0 }, C: { earned: true, earned_time: 500 } });
  writeSave(alias, { A: { earned: true, earned_time: 1000 }, B: { earned: true, earned_time: 3000 }, D: { earned: true, earned_time: 4000 }, E: { earned: false, earned_time: 0 } });

  const merged = await shortcutSaveIds.readMergedSaves(steam.getAchievementsFromFile, [own, alias], { isEarned: earnedOf, timeOf });
  assert.deepEqual(Object.keys(merged).sort(), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(merged.A.earned_time, 1000, 'the earlier of two unlock dates');
  assert.equal(merged.B.earned, true, 'earned in either folder counts');
  assert.equal(merged.B.earned_time, 3000);
  assert.equal(merged.C.earned_time, 500);
  assert.equal(merged.E.earned, false);
});

test('a missing or unreadable second folder never costs the first one its unlocks', async () => {
  const own = path.join(tmp, 'saves2', '1');
  writeSave(own, { A: { earned: true, earned_time: 7 } });
  const merged = await shortcutSaveIds.readMergedSaves(steam.getAchievementsFromFile, [own, path.join(tmp, 'saves2', 'gone')], { isEarned: earnedOf, timeOf });
  assert.equal(merged.A.earned_time, 7);
  // The only folder with a save being the shortcut one is fine too.
  const onlyAlias = path.join(tmp, 'saves2', '2');
  writeSave(onlyAlias, { Z: { earned: true, earned_time: 9 } });
  const second = await shortcutSaveIds.readMergedSaves(steam.getAchievementsFromFile, [path.join(tmp, 'saves2', 'none'), onlyAlias], { isEarned: earnedOf, timeOf });
  assert.equal(second.Z.earned_time, 9);
  // Nothing readable anywhere keeps the reader's own error.
  await assert.rejects(shortcutSaveIds.readMergedSaves(steam.getAchievementsFromFile, [path.join(tmp, 'saves2', 'a'), path.join(tmp, 'saves2', 'b')], { isEarned: earnedOf, timeOf }));
});

test('the Watchdog merges the parsed lists of the twin folders without repeating a name', () => {
  const merged = shortcutSaveIds.mergeParsedLists([
    [{ name: 'A', Achieved: true, UnlockTime: 2000, CurProgress: 0, MaxProgress: 0 }, { name: 'B', Achieved: false, UnlockTime: 0, CurProgress: 1, MaxProgress: 5 }],
    [{ name: 'A', Achieved: true, UnlockTime: 1000, CurProgress: 0, MaxProgress: 0 }, { name: 'B', Achieved: true, UnlockTime: 3000, CurProgress: 5, MaxProgress: 5 }, { name: 'C', Achieved: false, UnlockTime: 0 }],
  ]);
  assert.deepEqual(merged.map((a) => a.name).sort(), ['A', 'B', 'C']);
  assert.equal(merged.find((a) => a.name === 'A').UnlockTime, 1000);
  assert.equal(merged.find((a) => a.name === 'B').Achieved, true);
  assert.equal(merged.find((a) => a.name === 'B').UnlockTime, 3000);
});

test('a folder name is mapped to its game only for a shortcut id, and a twin is found beside it', () => {
  const links = { [UNSIGNED]: '2215200', 77: '2215200' };
  const root = path.join(tmp, 'GSE Saves');
  assert.equal(shortcutSaveIds.appidFor(links, UNSIGNED), '2215200');
  const twins = (name) => shortcutSaveIds.twinFolders(links, path.join(root, name)).sort();
  assert.deepEqual(twins(UNSIGNED), [path.join(root, '2215200'), path.join(root, '77')].sort());
  assert.deepEqual(twins('2215200'), [path.join(root, UNSIGNED), path.join(root, '77')].sort());
  assert.deepEqual(twins('730'), []);
});
