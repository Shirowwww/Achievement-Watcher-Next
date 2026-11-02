'use strict';

/*
  PS3Recomp ports (sp00nznet/ps3recomp): a port is found from what it declares on disk (launch.txt,
  ps3recomp.toml, the runtime sources), its trophy list comes from the original game's TROPDIR, and
  its unlocks from the runtime's gamedata/trophies/<NPWR>.json. Every file is built in the test.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const fixture = require('../helpers/ps3Recomp.js');

const parser = require('../../app/parser/ps3Recomp.js');
const trophies = require('../../app/parser/ps4RecompTrophies.js');

const dataRoot = makeTempDir('aw-ps3recomp-data-');
parser.setDataRoot(dataRoot);
const APPID = `ps3recomp-${fixture.NPCOMMID}`;
const progressOf = (root, sub = 'gamedata') => path.join(root, sub, 'trophies', 'NPWR00104.json');

test('the PS3 TRP container is read with its 64-byte header, and a broken one is refused', () => {
  const buffer = fixture.buildTrp({ 'TROP.SFM': fixture.sfm(), 'TROP000.PNG': fixture.png() });
  const files = trophies.readTrp(buffer, trophies.PS3_TRP_HEADER_SIZE);
  assert.deepEqual([...files.keys()].sort(), ['TROP.SFM', 'TROP000.PNG']);
  assert.match(files.get('TROP.SFM').toString(), /First Step/);

  const outside = Buffer.from(buffer);
  outside.writeBigUInt64BE(BigInt(buffer.length + 1), 0x40 + 32);
  assert.equal(trophies.readTrp(outside, trophies.PS3_TRP_HEADER_SIZE), null, 'an entry past the end voids it');
  assert.equal(trophies.readTrp(buffer.subarray(0, 20), trophies.PS3_TRP_HEADER_SIZE), null, 'a cut header is not one');
});

test('a port is found from installer/launch.txt, its game from the declared argument', () => {
  const root = makeTempDir('aw-ps3recomp-launch-');
  const gameRoot = fixture.makePort(root);
  const games = parser.scan(root);
  assert.equal(games.length, 1);
  const [game] = games;
  assert.equal(game.appid, APPID);
  assert.equal(game.source, 'PS3 Recomp');
  assert.equal(game.data.type, 'ps3recomp');
  assert.equal(game.data.gameRoot, gameRoot);
  assert.equal(game.data.titleId, fixture.TITLE_ID);
  assert.equal(game.data.npcommid, fixture.NPCOMMID);
  assert.equal(game.data.exe, path.join(root, 'Game.exe'), 'the launcher is the process playtime follows');
  assert.equal(game.data.gameDir, root);
  assert.equal(game.data.progressFile, progressOf(root));
});

test('PS3_GAMEDATA_ROOT declared in launch.txt moves the unlock file, relative to the declared cwd', () => {
  const root = makeTempDir('aw-ps3recomp-env-');
  fixture.makePort(root, { env: 'PS3_GAMEDATA_ROOT=saves' });
  assert.equal(parser.scan(root)[0].data.progressFile, progressOf(root, 'saves'));
});

test('ps3recomp.toml input.sfo_path names the game; the runtime sources alone find game/PS3_GAME', () => {
  const tomlRoot = makeTempDir('aw-ps3recomp-toml-');
  const gameRoot = fixture.makeGame(path.join(tomlRoot, 'disc'));
  fixture.write(path.join(tomlRoot, 'ps3recomp.toml'), '[project]\nname = "x"\n\n[input]\nsfo_path = "disc/PS3_GAME/PARAM.SFO" # the disc\n');
  assert.deepEqual(parser.scan(tomlRoot).map((g) => g.data.gameRoot), [gameRoot]);

  const sourceRoot = makeTempDir('aw-ps3recomp-src-');
  const runtimeGame = fixture.makeGame(path.join(sourceRoot, 'game'));
  fixture.write(path.join(sourceRoot, 'ps3recomp', 'libs', 'network', 'sceNpTrophy.c'), '/* runtime */');
  const [game] = parser.scan(sourceRoot);
  assert.equal(game.data.gameRoot, runtimeGame);
  assert.equal(game.data.exe, '', 'no launcher declared: the scan looks for one itself');
});

/*
  The shape of the published ports (sp00nznet/simpsonsarcade-ps3, tornado, vf5, shadowofthecolossus):
  a CMakeLists.txt pointing at PS3RECOMP_DIR, the user's dump in vfs/PS3_GAME, the binary in build/ or
  build/Release/, started from the repository root, so the runtime writes gamedata/trophies there.
*/
test('a port built from its repository is found from CMakeLists.txt, its dump under vfs/', () => {
  const root = makeTempDir('aw-ps3recomp-cmake-');
  const gameRoot = fixture.makeGame(path.join(root, 'vfs'));
  fixture.write(path.join(root, 'CMakeLists.txt'), 'project(simpsons)\nset(PS3RECOMP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ps3recomp" CACHE PATH "ps3recomp repo root")\n');
  fixture.write(path.join(root, 'build', 'Release', 'simpsons.exe'), 'MZ');
  const [game] = parser.scan(root);
  assert.ok(game, 'the port is listed');
  assert.equal(game.data.gameRoot, gameRoot);
  assert.equal(game.data.progressFile, progressOf(root));
  assert.equal(game.data.exe, path.join(root, 'build', 'Release', 'simpsons.exe'), 'its one built binary is the executable');
});

test('a port is also found from the unlock file its runtime already wrote', () => {
  const root = makeTempDir('aw-ps3recomp-written-');
  const gameRoot = fixture.makeGame(path.join(root, 'vfs'));
  fixture.writeUnlocks(progressOf(root), [{ id: 0, timestamp: 1767225600 }]);
  assert.deepEqual(parser.scan(root).map((g) => g.data.gameRoot), [gameRoot]);
});

test('a CMakeLists.txt of another project proves nothing', () => {
  const root = makeTempDir('aw-ps3recomp-othercmake-');
  fixture.makeGame(path.join(root, 'vfs'));
  fixture.write(path.join(root, 'CMakeLists.txt'), 'project(rpcs3)\nadd_subdirectory(rpcs3)\n');
  assert.deepEqual(parser.scan(root), []);
});

test('nothing is guessed: no evidence, a bare config.toml, or two candidate games list nothing', () => {
  const bare = makeTempDir('aw-ps3recomp-bare-');
  fixture.makeGame(path.join(bare, 'game'));
  assert.deepEqual(parser.scan(bare), [], 'a PS3 disc dump alone is not a port');

  const generic = makeTempDir('aw-ps3recomp-config-');
  fixture.makeGame(path.join(generic, 'disc'));
  fixture.write(path.join(generic, 'config.toml'), '[input]\nsfo_path = "disc/PS3_GAME/PARAM.SFO"\n');
  assert.deepEqual(parser.scan(generic), [], 'config.toml is too common a name to prove anything');

  const two = makeTempDir('aw-ps3recomp-two-');
  fixture.makePort(two);
  fixture.makeGame(path.join(two, 'other'));
  fixture.write(path.join(two, 'ps3recomp.toml'), '[input]\nsfo_path = "other/PS3_GAME/PARAM.SFO"\n');
  assert.deepEqual(parser.scan(two), [], 'two declared games: neither is picked');
});

test('two trophy sets that the runtime would save to one file are both left out', () => {
  const root = makeTempDir('aw-ps3recomp-collide-');
  fixture.makePort(root, { sets: ['NPWR00104_00', 'NPWR00104_01', 'NPWR00200_00'] });
  assert.deepEqual(parser.scan(root).map((g) => g.data.npcommid), ['NPWR00200_00']);
});

test('a watched library finds ports below it, within its depth bound, skipping tool folders', () => {
  const library = makeTempDir('aw-ps3recomp-lib-');
  fixture.makePort(path.join(library, 'PS3', 'Odyssey'));
  fixture.makePort(path.join(library, 'node_modules', 'Ignored'));
  fixture.makePort(path.join(library, 'a', 'b', 'c', 'TooDeep'));
  assert.deepEqual(parser.scan(library).map((g) => g.data.installRoot), [path.join(library, 'PS3', 'Odyssey')]);
  assert.equal(parser.isPortFolder(path.join(library, 'PS3', 'Odyssey')), true);
  assert.equal(parser.isPortFolder(library), false);
});

test('the trophy list comes from TROPHY.TRP: grades, hidden flags, languages, icons and the NP id', async () => {
  const root = makeTempDir('aw-ps3recomp-schema-');
  fixture.makePort(root);
  const [game] = parser.scan(root);
  const english = await parser.getGameData(game.data, 'english');
  assert.equal(english.name, fixture.TITLE);
  assert.equal(english.npCommId, fixture.NPCOMMID, 'the NP id reaches the official PSN rarity');
  assert.equal(english.system, 'playstation');
  assert.deepEqual(
    english.achievement.list.map((a) => [a.name, a.type, a.hidden, a.displayName]),
    [['0', 'P', 0, 'Platinum Odyssey'], ['1', 'B', 0, 'First Step'], ['2', 'G', 1, 'Secret Ending']]
  );
  assert.match(english.achievement.list[1].icon, /^file:\/\/\//);
  assert.ok(fs.existsSync(path.join(dataRoot, 'icon_cache', 'ps3recomp', APPID, '1.png')));

  const french = await parser.getGameData(game.data, 'french');
  assert.equal(french.achievement.list[1].displayName, 'Premier pas');
  assert.equal(french.achievement.list[1].rarityName, 'First Step', 'Exophase still matches the English text');
});

test('a malformed or oversized TRP is refused with an error, never a crash', async () => {
  const root = makeTempDir('aw-ps3recomp-badtrp-');
  fixture.makePort(root, { trp: Buffer.from('not a trophy file at all, just text that is long enough') });
  const [game] = parser.scan(root);
  await assert.rejects(() => parser.getGameData(game.data, 'english'), /PS3 Recomp/);
  assert.deepEqual(parser.getAchievements(game.data), [], 'no list, so no unlock can be told apart');
});

test('unlocks come from the runtime JSON with their times; unknown ids and bad rows are ignored', () => {
  const root = makeTempDir('aw-ps3recomp-unlocks-');
  fixture.makePort(root);
  const [game] = parser.scan(root);
  assert.deepEqual(parser.getAchievements(game.data), [], 'no file yet: nothing unlocked');

  fixture.writeUnlocks(progressOf(root), [
    { id: 1, timestamp: 1793000000 },
    { id: 2, timestamp: 0 },
    { id: 99, timestamp: 1793000001 },
    { id: 1, timestamp: 1 },
    { id: -3, timestamp: 5 },
    { id: 'x', timestamp: 5 },
    null,
  ]);
  assert.deepEqual(parser.getAchievements(game.data), [
    { id: '1', achieved: true, earned_time: 1793000000 },
    { id: '2', achieved: true, earned_time: 0 },
  ]);
});

test('a malformed or half-written unlock file never throws and is reported as unstable', () => {
  const root = makeTempDir('aw-ps3recomp-badjson-');
  fixture.makePort(root);
  const [game] = parser.scan(root);
  for (const text of ['{"trophies": [ { "id": 1, "time', '[]', '{"trophies": 5}', '\u0000\u0001']) {
    fixture.write(progressOf(root), text);
    assert.doesNotThrow(() => parser.getAchievements(game.data));
    assert.deepEqual(parser.getAchievements(game.data), []);
  }
  fixture.write(progressOf(root), '{"trophies": [ { "id": 1, "time');
  assert.equal(parser.readUnlocks(game.data).unstable, true, 'a file cut by the writer is read again, not taken as empty');
  fixture.write(progressOf(root), '');
  assert.equal(parser.readUnlocks(game.data).unstable, true, 'an empty file is one being rewritten');
});
