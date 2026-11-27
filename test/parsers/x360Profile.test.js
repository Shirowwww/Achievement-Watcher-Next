'use strict';

// Xbox 360 profiles copied off a modded console: STFS container, title GPDs inside, and where a
// profile may sit under a folder of the folder list. Every file here is synthetic.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

// The icon cache lives under the user data folder: never the real one.
process.env.AW_USER_DATA = makeTempDir('aw-x360-profile-data-');
const { buildGpd, buildStfs, BLOCK } = require('../helpers/x360Profile');
const stfs = require('../../app/parser/stfs.js');
const x360Profile = require('../../app/parser/x360Profile.js');
const { classifySources } = require('../../app/util/achievementResetTargets.js');
const { isInstalled } = require('../../app/parser/installState.js');
const { libraryBadgeOf, isLaunchable } = require('../../app/util/sourceIdentity.js');
const { portGameCounts } = require('../../app/util/portSources.js');

const PROFILE_ID = 'E00001234ABCDEF0';
const EARNED = new Date('2015-08-30T11:11:32Z');

const TILE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const racing = buildGpd({
  title: 'Synthetic Racing',
  tile: TILE,
  achievements: [
    { id: 1, name: 'First Lap', description: 'Finish a race', gamerscore: 10, earnedAt: EARNED },
    { id: 2, name: 'Podium', description: 'Finish third or better', gamerscore: 20 },
  ],
});
const empty = buildGpd({ title: 'Some App', achievements: [] });
const dashboard = buildGpd({ title: 'Dashboard', achievements: [{ id: 9, name: 'Not a game', earnedAt: EARNED }] });

function profile(files, options) {
  return buildStfs(files, options);
}

const simpleProfile = () =>
  profile([
    { name: 'FFFE07D1.gpd', data: dashboard, blocks: [1] },
    { name: '4D5307E6.gpd', data: racing, blocks: [2] },
    { name: '584D07D1.gpd', data: empty, blocks: [3] },
  ]);

function write(root, rel, data) {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

test('a file scattered across blocks is read by following the live copy of the hash tables', () => {
  // Bigger than one block, split over the end of the first hash table and back, in a package past
  // 0xAA blocks whose live tables are the second copies: the shape of a real console profile.
  const big = Buffer.alloc(BLOCK * 2 + 100);
  for (let i = 0; i < big.length; i += 1) big[i] = i % 251;
  const pkg = stfs.openPackage(
    profile([{ name: 'big.bin', data: big, blocks: [0xa9, 0xaa, 3] }], { allocated: 0xb0, fileTableBlock: 5, secondCopies: true })
  );
  assert.ok(pkg);
  assert.deepEqual(pkg.files.map((f) => f.path), ['big.bin']);
  assert.ok(pkg.files[0].read().equals(big));
});

test('a file marked consecutive is read without its hash entries', () => {
  const data = Buffer.alloc(BLOCK + 10, 7);
  const buf = profile([{ name: 'run.bin', data, blocks: [2, 3], consecutive: true }]);
  // Wipe both copies of the hash table: a consecutive file must not need its chain.
  buf.fill(0, 0xa000, 0xa000 + 2 * BLOCK);
  const pkg = stfs.openPackage(buf);
  assert.ok(pkg.files[0].read().equals(data));
});

test('anything that is not an STFS package is refused', () => {
  assert.equal(stfs.openPackage(Buffer.alloc(0x400)), null);
  assert.equal(stfs.openPackage(Buffer.from('CON ')), null);
  const svod = simpleProfile();
  svod[0x379] = 0x24 - 1;
  assert.equal(stfs.openPackage(svod), null);
});

test('a profile lists each game with achievements, its unlocks and their dates', () => {
  const root = makeTempDir('aw-x360-profile-');
  const file = write(root, PROFILE_ID, simpleProfile());
  const titles = x360Profile.readProfile(file);
  assert.deepEqual(titles.map((t) => [t.titleId, t.title]), [['4D5307E6', 'Synthetic Racing']]);
  const [first, second] = titles[0].list;
  assert.deepEqual([first.displayName, first.achieved, first.time, first.gamerscore], ['First Lap', true, EARNED.getTime() / 1000, 10]);
  assert.deepEqual([second.displayName, second.achieved, second.time], ['Podium', false, 0]);
});

test('a profile is found from the folder holding it up to the console tree above it', () => {
  const layouts = [
    PROFILE_ID,
    // A folder named after the profile, holding the file Horizon extracted (27/11/2026).
    `${PROFILE_ID}/${PROFILE_ID}`,
    `00010000/${PROFILE_ID}`,
    `FFFE07D1/00010000/${PROFILE_ID}`,
    `${PROFILE_ID}/FFFE07D1/00010000/${PROFILE_ID}`,
    `0000000000000000/${PROFILE_ID}/FFFE07D1/00010000/${PROFILE_ID}`,
    `Content/0000000000000000/${PROFILE_ID}/FFFE07D1/00010000/${PROFILE_ID}`,
  ];
  for (const rel of layouts) {
    const root = makeTempDir('aw-x360-profile-');
    const file = write(root, rel, simpleProfile());
    assert.deepEqual(x360Profile.findProfiles(root), [file], rel);
  }
});

test('files named like a profile that are not one are left alone', () => {
  const root = makeTempDir('aw-x360-profile-');
  write(root, PROFILE_ID, Buffer.from('LIVE not a profile'));
  write(root, 'notes.txt', simpleProfile());
  assert.deepEqual(x360Profile.findProfiles(root), []);
  assert.deepEqual(x360Profile.scan(root), []);
});

test('a scan gives one record per game, read back as its list and unlocks', async () => {
  const root = makeTempDir('aw-x360-profile-');
  const file = write(root, `FFFE07D1/00010000/${PROFILE_ID}`, simpleProfile());
  const records = x360Profile.scan(root);
  assert.deepEqual(records, [{ appid: '4D5307E6', source: 'Xbox 360 Profile', data: { type: 'x360profile', path: file, titleId: '4D5307E6' } }]);

  const game = await x360Profile.getGameData(records[0].data, 'english', { fetchImpl: async () => ({ ok: false }) });
  assert.equal(game.name, 'Synthetic Racing');
  assert.equal(game.appid, '4D5307E6');
  assert.equal(game.achievement.total, 2);
  // The game's own tile is its icon, and stands in for the header until SteamGridDB's art comes.
  assert.ok(game.img.icon.endsWith('/32768.png'), game.img.icon);
  assert.equal(game.img.header, game.img.icon);
  assert.equal(game.img.headerStandIn, true);
  assert.ok(fs.readFileSync(new URL(game.img.icon)).equals(TILE));
  const unlocks = await x360Profile.getAchievements(records[0].data);
  assert.deepEqual(unlocks, [
    { id: '1', achieved: true, earned_time: EARNED.getTime() / 1000 },
    { id: '2', achieved: false, earned_time: 0 },
  ]);
});

test('with two profiles, a game shared by both is read from the one written last', () => {
  const root = makeTempDir('aw-x360-profile-');
  const older = write(root, 'E000000000000001', simpleProfile());
  const newer = write(root, 'E000000000000002', simpleProfile());
  fs.utimesSync(older, new Date('2020-01-01'), new Date('2020-01-01'));
  fs.utimesSync(newer, new Date('2021-01-01'), new Date('2021-01-01'));
  assert.deepEqual(x360Profile.scan(root).map((r) => r.data.path), [newer]);
});

test('a console profile is an Xbox game the library keeps and a reset never writes to', () => {
  assert.equal(libraryBadgeOf('Xbox 360 Profile'), 'xbox');
  assert.equal(isLaunchable('Xbox 360 Profile'), false);
  assert.equal(isInstalled({ dataType: 'x360profile' }), true);
  assert.equal(portGameCounts([{ appid: '4D5307E6', source: 'Xbox 360 Profile' }]).xenia, 1, 'counted under the Xenia switch it follows');
  const { resettable, blocked } = classifySources([{ source: 'Xbox 360 Profile', path: 'C:\\copy\\E00001234ABCDEF0' }]);
  assert.deepEqual(resettable, []);
  assert.equal(blocked.length, 1);
});
