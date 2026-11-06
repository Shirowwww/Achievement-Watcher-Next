'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  signatureWatchEntries,
  getStrictRootProfile,
  isAppIdName,
  shouldIgnoreDiscoveredId,
  discoverRpcs3TrophyDirsUnder,
} = require('../util/rootCascade.js');

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rootcascade-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeGogInfo(dir) {
  fs.writeFileSync(
    path.join(dir, 'goggame-1421404671.info'),
    JSON.stringify({ gameId: 1421404671, rootGameId: 1421404671, name: 'My GOG Game', playTasks: [{ path: 'bin/game.exe', isPrimary: true }] })
  );
}

test('a goggame .info folder is watched at the .info folder under its root game id', async (t) => {
  const dir = fixture();
  t.after(() => cleanup(dir));
  writeGogInfo(dir);
  const [entry, ...rest] = await signatureWatchEntries(dir);
  assert.equal(rest.length, 0);
  assert.equal(entry.dir, fs.realpathSync(dir));
  assert.equal(entry.options.appid, '1421404671');
  assert.ok(entry.options.file.includes('achievements.json'), 'the generic save names are watched there');
});

test('a DLC .info points at the root game, not at itself', async (t) => {
  const dir = fixture();
  t.after(() => cleanup(dir));
  fs.writeFileSync(path.join(dir, 'goggame-2000.info'), JSON.stringify({ gameId: '2000', rootGameId: '1000' }));
  const [entry] = await signatureWatchEntries(dir);
  assert.equal(entry.options.appid, '1000');
});

test('UniverseLAN.ini is watched in its UniverseLANData folder with the appid from GameSettings', async (t) => {
  const dir = fixture();
  t.after(() => cleanup(dir));
  fs.writeFileSync(path.join(dir, 'UniverseLAN.ini'), '[GameSettings]\nAppID = 4242\n');
  const [entry] = await signatureWatchEntries(dir);
  assert.equal(entry.options.appid, '4242');
  assert.equal(path.basename(entry.dir), 'UniverseLANData');
});

test('a folder claimed by an earlier signature gets no GOG or UniverseLAN watch', async (t) => {
  const dir = fixture();
  t.after(() => cleanup(dir));
  // Numeric appid folders come before UniverseLAN; a Steam stats root before GOG.
  fs.mkdirSync(path.join(dir, 'ulan', '12345'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ulan', 'UniverseLAN.ini'), '[GameSettings]\nAppID = 4242\n');
  assert.deepEqual(await signatureWatchEntries(path.join(dir, 'ulan')), []);

  const stats = path.join(dir, 'Steam', 'appcache', 'stats');
  fs.mkdirSync(stats, { recursive: true });
  fs.writeFileSync(path.join(stats, 'UserGameStatsSchema_480.bin'), 'x');
  writeGogInfo(stats);
  assert.deepEqual(await signatureWatchEntries(stats), []);

  // TENOKE comes before UniverseLAN too.
  const tenoke = path.join(dir, 'tenoke');
  fs.mkdirSync(tenoke);
  fs.writeFileSync(path.join(tenoke, 'tenoke.ini'), '[TENOKE]\nid = 98765\n');
  fs.writeFileSync(path.join(tenoke, 'UniverseLAN.ini'), '[GameSettings]\nAppID = 4242\n');
  assert.deepEqual(await signatureWatchEntries(tenoke), []);
});

test('a missing folder and a strict emulator save root get nothing', async (t) => {
  const dir = fixture();
  t.after(() => cleanup(dir));
  assert.deepEqual(await signatureWatchEntries(path.join(dir, 'missing')), []);
  const codex = path.join(dir, 'Steam', 'CODEX');
  fs.mkdirSync(codex, { recursive: true });
  writeGogInfo(codex);
  assert.deepEqual(await signatureWatchEntries(codex), []);
});

test('strict root profile matches RLD! and CODEX save roots', () => {
  assert.equal(getStrictRootProfile('C:\\Public\\Documents\\Steam\\RLD!').key, 'steam-rld');
  assert.equal(getStrictRootProfile('C:\\Public\\Documents\\Steam\\CODEX').key, 'steam-codex');
});

test('RPCS3 trophy folders are found among files, nested, and through a linked folder', async (t) => {
  const dir = fixture();
  const outside = fixture();
  t.after(() => {
    cleanup(dir);
    cleanup(outside);
  });
  const trophyDir = (base) => {
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'TROPCONF.SFM'), '<trophyconf/>');
    fs.writeFileSync(path.join(base, 'TROPUSR.DAT'), 'x');
  };
  trophyDir(path.join(dir, 'home', '00000001', 'trophy', 'NPWR00001_00'));
  trophyDir(path.join(dir, 'home', '00000001', 'trophy', 'NPWR00002_00'));
  // Half a set is not a trophy folder; nor is a file wearing a folder's name.
  fs.mkdirSync(path.join(dir, 'home', '00000001', 'trophy', 'NPWR00003_00'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'home', '00000001', 'trophy', 'NPWR00003_00', 'TROPCONF.SFM'), '<trophyconf/>');
  fs.writeFileSync(path.join(dir, 'home', 'NPWR00004_00'), 'not a folder');
  for (let i = 0; i < 50; i++) fs.writeFileSync(path.join(dir, 'home', `noise${i}.bin`), '');
  // Found sets are not searched further.
  trophyDir(path.join(dir, 'home', '00000001', 'trophy', 'NPWR00001_00', 'NPWR00009_00'));
  trophyDir(path.join(outside, 'NPWR00005_00'));
  fs.symlinkSync(path.join(outside, 'NPWR00005_00'), path.join(dir, 'home', 'NPWR00005_00'), 'junction');

  const found = (await discoverRpcs3TrophyDirsUnder(dir, { maxDepth: 6 })).map((full) => path.basename(full)).sort();
  assert.deepEqual(found, ['NPWR00001_00', 'NPWR00002_00', 'NPWR00005_00']);
});

test('appid validation rejects padding and user ids', () => {
  assert.equal(isAppIdName('0000123'), false); // 4+ leading zeros
  assert.equal(isAppIdName('1'), false); // single character
  assert.equal(isAppIdName('12345'), true);
  assert.equal(shouldIgnoreDiscoveredId('76561198000000000'), true); // SteamID64
});
