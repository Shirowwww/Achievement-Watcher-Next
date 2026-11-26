'use strict';

/*
  PS3 ports installed by RecompLauncher (Vajra, Redgrave961/Vajra, is the first): the port folder
  holds the exe and recomplauncher.json naming the disc's title ids, everything it writes goes to
  {data} (recompdata, or the port's own folder on its own), the game path it was given is kept in a
  <data>/*_paths.ini, and its runtime (Redgrave961/ps3recomp) saves <data>/user/trophies/<set>.json
  with PS3 RTC ticks. The disc is a PS3_GAME folder or a decrypted .iso. Every file is synthetic.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const fixture = require('../helpers/ps3Recomp.js');
const { withWinePrefix, LINUX_ONLY } = require('../helpers/winePrefix.js');

const realUserData = process.env.AW_USER_DATA;
process.env.AW_USER_DATA = makeTempDir('aw-ps3launcher-userdata-');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const achievements = require('../../app/parser/achievements.js');
achievements.initDebug({ isDev: false, userDataPath: makeTempDir('aw-ps3launcher-logs-') });
const parser = require('../../app/parser/ps3Recomp.js');
parser.setDataRoot(makeTempDir('aw-ps3launcher-data-'));
test.after(() => {
  Module._load = originalLoad;
  if (realUserData === undefined) delete process.env.AW_USER_DATA;
  else process.env.AW_USER_DATA = realUserData;
});

const APPID = `ps3recomp-${fixture.NPCOMMID}`;

async function readsThrough(library, port) {
  const games = await achievements.previewWatchedFolder(library, { ps3recomp: true });
  assert.deepEqual(games.map((g) => [g.appid, g.source, g.data.type]), [[APPID, 'PS3 Recomp', 'ps3recomp']]);
  const [game] = games;
  assert.equal(game.data.titleId, fixture.TITLE_ID);
  assert.equal(game.data.exe, path.join(path.dirname(port.data), 'Game.exe'));
  assert.equal(game.data.progressFile, port.progressFile, 'the unlocks are where PS3_GAMEDATA_ROOT=<data>/user puts them');
  assert.deepEqual(parser.getAchievements(game.data), [], 'nothing unlocked before the first save');

  fixture.writeTicks(port.progressFile, [[1, 1795000000], [2, 1795000300], [77, 1795000400]]);
  assert.deepEqual(parser.getAchievements(game.data), [
    { id: '1', achieved: true, earned_time: 1795000000 },
    { id: '2', achieved: true, earned_time: 1795000300 },
  ], 'ticks read as unix seconds, a trophy off the list ignored');

  const schema = await parser.getGameData(game.data, 'english');
  assert.equal(schema.name, fixture.TITLE);
  assert.equal(schema.npCommId, fixture.NPCOMMID);
  assert.deepEqual(schema.achievement.list.map((a) => [a.name, a.displayName]), [['0', 'Platinum Odyssey'], ['1', 'First Step'], ['2', 'Secret Ending']]);
  return game;
}

test('a RecompLauncher port whose disc is a PS3_GAME folder reaches the library with its unlocks', async () => {
  const library = makeTempDir('aw-ps3launcher-folder-');
  const port = fixture.makeLauncherPort(path.join(library, 'Odyssey'));
  const game = await readsThrough(library, port);
  assert.equal(game.data.gameRoot, port.game);
  assert.equal(require('../../app/parser/portFinder.js').portFolderOf('Games/Vajra/recomplauncher.json'), 'Games/Vajra', 'Smart Find points at the port');
});

test('a RecompLauncher port whose disc is a decrypted .iso reaches the library with its unlocks', async () => {
  const library = makeTempDir('aw-ps3launcher-iso-');
  const port = fixture.makeLauncherPort(path.join(library, 'Odyssey'), { disc: 'iso' });
  const game = await readsThrough(library, port);
  assert.equal(game.data.trophyFile, port.game);
  assert.equal(game.data.gameRoot, '', 'no disc folder to take art from');
});

test('a port run on its own keeps {data} in its own folder', () => {
  const root = path.join(makeTempDir('aw-ps3launcher-alone-'), 'Odyssey');
  const port = fixture.makeLauncherPort(root, { standalone: true });
  const [game] = parser.scan(root);
  assert.equal(game.data.progressFile, path.join(root, 'user', 'trophies', `${fixture.NPCOMMID}.json`));
  assert.equal(game.data.gameRoot, port.game);
});

test('the trophy list of an installed update wins over the disc, as the runtime opens it first', async () => {
  const root = path.join(makeTempDir('aw-ps3launcher-update-'), 'Odyssey');
  const port = fixture.makeLauncherPort(root);
  const update = fixture.makeGame(path.join(port.data, 'user', 'dev_hdd0', 'game', fixture.TITLE_ID, 'x'), { title: 'Updated Odyssey' });
  const patched = path.join(port.data, 'user', 'dev_hdd0', 'game', fixture.TITLE_ID, 'TROPDIR');
  fs.cpSync(path.join(update, 'TROPDIR'), patched, { recursive: true });
  const [game] = parser.scan(root);
  assert.equal(game.data.trophyFile, path.join(patched, fixture.NPCOMMID, 'TROPHY.TRP'));
  assert.equal((await parser.getGameData(game.data, 'english')).name, 'Updated Odyssey');
});

test('nothing is guessed: a disc of another game, a non-PS3 manifest or no game path yet lists no game', () => {
  const other = path.join(makeTempDir('aw-ps3launcher-other-'), 'Odyssey');
  fixture.makeLauncherPort(other, { titleId: 'BLES09999' });
  assert.deepEqual(parser.scan(other), [], 'the disc is not one the manifest accepts');

  const xbox = path.join(makeTempDir('aw-ps3launcher-x360-'), 'Odyssey');
  fixture.makeLauncherPort(xbox, { titleIds: ['4D5307E6'] });
  assert.deepEqual(parser.scan(xbox), []);
  assert.equal(parser.isPortFolder(xbox), false, 'a launcher game for another console is not a PS3 port');

  const fresh = path.join(makeTempDir('aw-ps3launcher-fresh-'), 'Odyssey');
  fixture.makeLauncherPort(fresh, { gamePath: false });
  assert.deepEqual(parser.scan(fresh), []);
  assert.equal(parser.isPortFolder(fresh), true, 'still a port: its exe is not listed as a game of its own');
});

test('under Wine, the Windows game path the port saved is read in its prefix', LINUX_ONLY, () =>
  withWinePrefix(({ driveC }) => {
    const root = path.join(driveC, 'Games', 'Odyssey');
    const port = fixture.makeLauncherPort(root, { disc: 'iso' });
    fixture.write(path.join(port.data, 'odyssey_paths.ini'), 'game=C:\\Games\\discs\\odyssey.iso\r\n');
    const [game] = parser.scan(root);
    assert.equal(game.data.trophyFile, port.game);
    assert.equal(game.data.progressFile, port.progressFile);
  }));

test('a relock of a tick file drops that row and keeps the others byte for byte', () => {
  const source = `{\n  "trophies": [\n    { "id": 1, "tick": ${fixture.tickOf(1795000000)} },\n    { "id": 2, "tick": ${fixture.tickOf(1795000300)} }\n  ]\n}\n`;
  const { text, changed } = parser.relockUnlocks(source, 2);
  assert.equal(changed, true);
  assert.equal(text, `{\n  "trophies": [\n    { "id": 1, "tick": ${fixture.tickOf(1795000000)} }\n  ]\n}\n`);
  assert.equal(parser.isProgressName(`${fixture.NPCOMMID}.json`), true);
});
