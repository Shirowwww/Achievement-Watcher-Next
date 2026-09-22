'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { binaryMatchesProcess, buildBinaryIndex } = require('../playtime/seed.js');
const {
  getTrackableGameMatches,
  isOfficialSteamLibraryGame,
  filterGamesByAchievementSources,
  isInterpreterProcess,
  findGameForInterpreterChild,
  candidateConfigDirs,
  relatedToFolder,
} = require('../playtime/monitor.js');

function legacyTrackableMatches(gameIndex, process, isIgnored) {
  return gameIndex.filter(
    (game) => binaryMatchesProcess(game.binary, process) && !isIgnored(game.appid) && !String(game.name || '').toLowerCase().includes('demo')
  );
}

test('indexed live matches preserve Unreal aliases, collisions, and game-index order', () => {
  const gameIndex = [
    { appid: 'first', name: 'First', binary: 'shared.exe' },
    { appid: 'second', name: 'Second', binary: 'shared.exe' },
    { appid: 'unreal-base', name: 'Unreal base', binary: 'unreal.exe' },
    { appid: 'unreal-shipping', name: 'Unreal shipping', binary: 'unreal-Win64-Shipping.exe' },
    { appid: 'portable', name: 'Portable', binary: 'portable-game' },
    { appid: 'trimmed', name: 'Trimmed', binary: ' padded.exe ' },
  ];
  const index = buildBinaryIndex(gameIndex);
  const neverIgnored = () => false;

  assert.deepEqual(getTrackableGameMatches(index, 'shared.exe', neverIgnored).map((game) => game.appid), ['first', 'second']);
  assert.deepEqual(getTrackableGameMatches(index, 'unreal-Win64-Shipping.exe', neverIgnored).map((game) => game.appid), ['unreal-base', 'unreal-shipping']);
  assert.deepEqual(getTrackableGameMatches(index, 'portable-game', neverIgnored).map((game) => game.appid), ['portable']);
  assert.deepEqual(getTrackableGameMatches(index, 'padded.exe', neverIgnored).map((game) => game.appid), ['trimmed']);
});

test('indexed live matches remain equivalent to the legacy scan while filters change', () => {
  const binaries = ['alpha.exe', 'beta.exe', 'unreal.exe', 'portable-game', ' spaced.exe ', 'alpha-Win64-Shipping.exe', null, ''];
  const gameIndex = Array.from({ length: 128 }, (_, index) => ({
    appid: String(index),
    name: index % 13 === 0 ? `Demo ${index}` : `Game ${index}`,
    binary: binaries[index % binaries.length],
  }));
  const binaryIndex = buildBinaryIndex(gameIndex);
  const processes = [
    'alpha.exe',
    'ALPHA.EXE',
    'alpha-Win64-Shipping.exe',
    'unreal-Win64-Shipping.exe',
    'portable-game',
    'spaced.exe',
    ' spaced.exe',
    'unknown.exe',
    '',
    null,
  ];
  const ignored = new Set(['1', '3', '7']);
  const isIgnored = (appid) => ignored.has(String(appid));

  for (const process of processes) {
    assert.deepEqual(
      getTrackableGameMatches(binaryIndex, process, isIgnored).map((game) => game.appid),
      legacyTrackableMatches(gameIndex, process, isIgnored).map((game) => game.appid),
      `matches ${String(process)}`
    );
  }

  // The index intentionally contains only binary candidates. Exclusions are evaluated on each
  // event, so a changed exclusion list takes effect without an index rebuild.
  ignored.add('0');
  ignored.add('8');
  assert.deepEqual(
    getTrackableGameMatches(binaryIndex, 'alpha.exe', isIgnored).map((game) => game.appid),
    legacyTrackableMatches(gameIndex, 'alpha.exe', isIgnored).map((game) => game.appid)
  );
});

test('disabled official Steam games are excluded from the playtime index while emulator entries remain trackable', () => {
  const games = [
    { appid: '1812620', name: 'DSX', binary: 'DSX.exe', source: 'Steam (Shirow)' },
    { appid: 'goldberg', name: 'Emulated game', binary: 'game.exe', source: 'Goldberg' },
  ];

  assert.equal(isOfficialSteamLibraryGame(games[0]), true);
  assert.equal(isOfficialSteamLibraryGame(games[1]), false);
  assert.deepEqual(
    filterGamesByAchievementSources(games, { achievement_source: { legitSteam: 0 } }).map((game) => game.appid),
    ['goldberg']
  );
  assert.deepEqual(
    filterGamesByAchievementSources(games, { achievement_source: { legitSteam: 1 } }).map((game) => game.appid),
    ['1812620', 'goldberg']
  );
});

// A Java game's launcher spawns javaw.exe and exits; the process name never matches gameIndexByBinary
// (java.exe/javaw.exe are excluded from exe-detection on purpose), so the install folder is what has
// to identify it instead.
test('a bundled JRE is attributed to the known game whose install folder contains it', () => {
  const gameIndex = [
    { appid: '111', name: "Lenna's Inception", exePath: path.join('C:', 'Games', 'Lenna', 'LennaLauncher.exe') },
    { appid: '222', name: 'Unrelated', exePath: path.join('C:', 'Games', 'Other', 'Other.exe') },
  ];
  const javaw = path.join('C:', 'Games', 'Lenna', 'jre', 'bin', 'javaw.exe');

  assert.equal(isInterpreterProcess('javaw.exe'), true);
  assert.equal(isInterpreterProcess('java.exe'), true);
  assert.equal(isInterpreterProcess('notepad.exe'), false);

  const match = findGameForInterpreterChild('javaw.exe', javaw, gameIndex);
  assert.equal(match && match.appid, '111');

  // A non-interpreter process is never matched this way, even from inside the same folder.
  assert.equal(findGameForInterpreterChild('somehelper.exe', javaw, gameIndex), null);

  // A JRE outside every known game's folder (a system-wide install) matches nothing here.
  const systemJavaw = path.join('C:', 'Program Files', 'Java', 'bin', 'javaw.exe');
  assert.equal(findGameForInterpreterChild('javaw.exe', systemJavaw, gameIndex), null);
});

test('candidateConfigDirs climbs above a bundled interpreter but never above an ordinary exe', () => {
  const jreBin = path.join('C:', 'Games', 'Foo', 'jre', 'bin');
  const dirs = candidateConfigDirs(jreBin, 'javaw.exe');
  assert.ok(dirs.includes(jreBin));
  assert.ok(dirs.includes(path.join('C:', 'Games', 'Foo')), 'must climb up to the install root');
  assert.ok(dirs.length > 1);

  assert.deepEqual(candidateConfigDirs(jreBin, 'FooLauncher.exe'), [jreBin]);
});

// steam_cache/schema/gameIndex.json is a stale, uncurated catalogue: a single hit from it alone must
// not hijack a game just because it happens to share an exe name.
test('relatedToFolder rejects an unrelated legacy-catalogue title but accepts a matching one', () => {
  const khazanPath = path.join('C:', 'Games', 'Khazan', 'Khazan.exe');
  assert.equal(relatedToFolder('Waifu BBQ Simulator', khazanPath), false, 'a catalogue-only match with no folder relation must not be trusted');
  assert.equal(relatedToFolder('Khazan', khazanPath), true);
  assert.equal(relatedToFolder('The First Berserker: Khazan', khazanPath), true);
});
