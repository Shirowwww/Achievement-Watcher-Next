'use strict';

/*
  RACiT (#210): a ps3recomp port that installs each trophy set the way a console does, in its
  launcher's data/dev_hdd0/home/<user>/trophy/<NPWR>_00, and keeps the unlocks there in
  trophies.txt. A second game sits in <launcher>/nexus with the same layout. Every file is built here.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const fixture = require('../helpers/ps3Recomp.js');

const parser = require('../../app/parser/ps3Recomp.js');
const relock = require('../../app/parser/achievementRelock.js');
const achievementReset = require('../../app/parser/achievementReset.js');
const manualUnlock = require('../../app/parser/manualUnlock.js');
const portFinder = require('../../app/parser/portFinder.js');

parser.setDataRoot(makeTempDir('aw-ps3recomp-installed-data-'));
const SECOND = 'NPWR04695_00';

test('a RACiT launcher lists its game and the one in nexus/, each from its own data/dev_hdd0', () => {
  const library = makeTempDir('aw-racit-library-');
  const root = path.join(library, 'RACiT');
  const first = fixture.makeInstalledSet(root, { unlocks: [[1, 1795094976]] });
  const second = fixture.makeInstalledSet(path.join(root, 'nexus'), { npcommid: SECOND });
  fixture.write(path.join(root, 'RaCACiT Launcher.exe'), 'MZ');

  const games = parser.scan(root);
  assert.deepEqual(games.map((g) => g.appid), [`ps3recomp-${fixture.NPCOMMID}`, `ps3recomp-${SECOND}`]);
  assert.equal(games[0].source, 'PS3 Recomp');
  assert.equal(games[0].data.gameDir, root);
  assert.equal(games[0].data.progressFile, path.join(first, 'trophies.txt'));
  assert.equal(games[0].data.path, first, 'the folder a reset or relock walks is the set itself');
  assert.equal(games[1].data.gameDir, path.join(root, 'nexus'));
  assert.equal(games[1].data.progressFile, path.join(second, 'trophies.txt'), 'listed before its first unlock');
  assert.equal(parser.isPortFolder(root), true, 'the unconfigured scan leaves the launcher to this source');
  assert.deepEqual(parser.discover(library).map((g) => g.appid), games.map((g) => g.appid), 'found from the library above it');
  assert.equal(portFinder.portFolderOf('Games/RACiT/RaCACiT Launcher.exe'), 'Games/RACiT');
});

test("RPCS3's sets and a bare dev_hdd0 are not this source's", () => {
  const rpcs3 = makeTempDir('aw-racit-rpcs3-');
  const dir = fixture.makeInstalledSet(rpcs3);
  fixture.write(path.join(dir, 'TROPUSR.DAT'), Buffer.alloc(16));
  assert.deepEqual(parser.scan(rpcs3), [], 'TROPUSR.DAT is an RPCS3 set');

  const bare = makeTempDir('aw-racit-bare-');
  const moved = fixture.makeInstalledSet(bare);
  fs.renameSync(path.join(bare, 'data', 'dev_hdd0'), path.join(bare, 'dev_hdd0'));
  assert.equal(fs.existsSync(moved), false);
  assert.deepEqual(parser.scan(bare), [], 'a dev_hdd0 at the top is the RPCS3 layout');
});

test('the trophy list comes from TROP.SFM and its icons; the unpacked disc lends its title', async () => {
  const root = makeTempDir('aw-racit-list-');
  fixture.makeInstalledSet(root, { title: 'Set Title' });
  const [game] = parser.scan(root);
  const data = await parser.getGameData(game.data, 'english');
  assert.equal(data.name, 'Set Title');
  assert.equal(data.achievement.total, fixture.TROPHIES.length);
  const secret = data.achievement.list.find((entry) => entry.name === '2');
  assert.equal(secret.displayName, 'Secret Ending');
  assert.equal(secret.type, 'G');
  assert.equal(secret.hidden, 1);
  assert.match(secret.icon, /^file:\/\/\/.+2\.png$/);

  fixture.makeGame(path.join(root, 'game'), { title: 'Disc Title' });
  const [withDisc] = parser.scan(root);
  assert.equal(withDisc.data.titleId, fixture.TITLE_ID);
  assert.equal(withDisc.data.title, 'Disc Title');
});

test('unlocks come from trophies.txt with their times; comments, unknown ids and repeats are skipped', () => {
  const root = makeTempDir('aw-racit-unlocks-');
  const dir = fixture.makeInstalledSet(root);
  const [game] = parser.scan(root);
  assert.deepEqual(parser.getAchievements(game.data), [], 'no file yet: nothing unlocked');

  fixture.write(path.join(dir, 'trophies.txt'), '# header 12 34\n2 1793205807 Secret Ending\r\n77 1793205808 Unknown\n2 5 again\n0\nx 1 y\n');
  assert.deepEqual(parser.getAchievements(game.data), [
    { id: '2', achieved: true, earned_time: 1793205807 },
    { id: '0', achieved: true, earned_time: 0 },
  ]);
});

test('an empty or cut trophies.txt is one being written: unstable, never everything relocked', () => {
  const root = makeTempDir('aw-racit-cut-');
  const dir = fixture.makeInstalledSet(root, { unlocks: [[1, 1795094976]] });
  const [game] = parser.scan(root);
  for (const text of ['', '# RACiT trophies\n1 17950']) {
    fixture.write(path.join(dir, 'trophies.txt'), text);
    assert.equal(parser.readUnlocks(game.data).unstable, true);
    assert.doesNotThrow(() => parser.getAchievements(game.data));
  }
});

test("a relock drops the trophy's line and keeps the rest of trophies.txt as RACiT wrote it", (t) => {
  const root = makeTempDir('aw-racit-relock-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  achievementReset.setUserDataPath(root);
  manualUnlock.setUserDataPath(root);
  const dir = fixture.makeInstalledSet(path.join(root, 'RACiT'), { unlocks: [[1, 1795094976], [2, 1795095428]] });
  const file = path.join(dir, 'trophies.txt');
  const before = fs.readFileSync(file, 'utf8');
  const game = { appid: `ps3recomp-${fixture.NPCOMMID}`, name: fixture.TITLE, source: 'PS3 Recomp', dataPath: dir, dataPaths: [{ source: 'PS3 Recomp', path: dir }] };

  const plan = relock.plan(game, '1', { gameRunning: false });
  assert.equal(plan.refusal || null, null, JSON.stringify(plan.refusal));
  assert.deepEqual(relock.run(plan, { gameRunning: false }).errors, []);
  assert.equal(fs.readFileSync(file, 'utf8'), before.replace('1 1795094976 First Step\n', ''));
  assert.equal(relock.plan(game, '0', { gameRunning: false }).refusal.reason, 'nothing');
  assert.throws(() => parser.relockInstalledUnlocks('# x\n2 17', 2), /cut/);
});
