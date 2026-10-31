'use strict';

/*
  Recompiled ports with their own unlock files (app/parser/recompPorts.js), against files built from
  each port's source code: none of these games is installed where the tests run.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir.js');

const ENV_KEYS = ['APPDATA', 'LOCALAPPDATA', 'XDG_DATA_HOME'];

// A clean profile for each test: every host folder the ports read points into a temp folder.
function profile(t) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const roaming = makeTempDir('aw-recomp-roaming-');
  const local = makeTempDir('aw-recomp-local-');
  process.env.APPDATA = roaming;
  process.env.LOCALAPPDATA = local;
  process.env.XDG_DATA_HOME = roaming;
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  const ports = require('../../app/parser/recompPorts.js');
  ports.setDataRoot(makeTempDir('aw-recomp-data-'));
  return { ports, roaming, local };
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// The head of a PNG of the given size: what the picture code reads and checks.
function png(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

// Answers every download with `answer(url)` (bytes, or an Error to fail it) and records the urls.
function stubFetch(t, answer) {
  const real = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    const body = answer(String(url));
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(body).buffer };
  };
  t.after(() => {
    global.fetch = real;
  });
  return urls;
}

const pathOf = (url) => (url ? decodeURI(url.slice('file:///'.length)) : '');

test('Dusklight is listed from its save alone, with its counters and its bundled list', async (t) => {
  const { ports, roaming } = profile(t);
  write(
    path.join(roaming, 'TwilitRealm', 'Dusklight', 'achievements.json'),
    JSON.stringify({ hero_of_twilight: { progress: 1, unlocked: true }, princess_of_bugs: { progress: 17, unlocked: false }, gone_from_the_game: { progress: 1, unlocked: true } })
  );

  const entry = ports.knownEntries().find((candidate) => candidate.appid === 'pcports-dusklight');
  assert.ok(entry, 'found without any folder from the user');
  assert.equal(entry.source, 'PC Port');
  assert.equal(entry.data.saveFile, path.join(roaming, 'TwilitRealm', 'Dusklight', 'achievements.json'));

  const unlocks = ports.getAchievements(entry.data);
  assert.deepEqual(
    unlocks.filter((unlock) => unlock.achieved || unlock.progress).map(({ id, achieved, progress }) => [id, achieved, progress || 0]),
    [
      ['hero_of_twilight', true, 1],
      ['princess_of_bugs', false, 17],
    ],
    'an id the list does not have is dropped'
  );

  const game = await ports.getGameData(entry.data);
  assert.equal(game.achievement.total, 50);
  assert.equal(game.achievement.list.find((a) => a.name === 'princess_of_bugs').max_progress, 24);
});

test("Dusklight's older folder is read until the game moves it, and a portable install keeps its own", (t) => {
  const { ports, roaming } = profile(t);
  write(path.join(roaming, 'TwilitRealm', 'Dusk', 'achievements.json'), JSON.stringify({ hero_of_twilight: { progress: 1, unlocked: true } }));
  assert.equal(ports.saveFileFor(ports.portById('dusklight')), path.join(roaming, 'TwilitRealm', 'Dusk', 'achievements.json'));

  const install = makeTempDir('aw-recomp-dusk-');
  write(path.join(install, 'dusklight.exe'), '');
  write(path.join(install, 'data_location.json'), JSON.stringify({ version: 1, mode: 'portable' }));
  write(path.join(install, 'data', 'achievements.json'), '{}');
  const [entry] = ports.scan(install);
  assert.equal(entry.data.saveFile, path.join(install, 'data', 'achievements.json'));
  assert.equal(entry.data.root, install);
});

test('Super Mario Bros. Remastered reads one bit per achievement, portable.txt moving the file', (t) => {
  const { ports, roaming } = profile(t);
  write(path.join(roaming, 'SMB1R', 'achievements.sav'), '1000000000000000000000000001');
  const entry = ports.knownEntries().find((candidate) => candidate.data.port === 'smb1r');
  assert.deepEqual(ports.earnedIds('smb1r', entry.data.saveFile), ['SMB1_CLEAR', 'COMPLETIONIST']);

  const install = makeTempDir('aw-recomp-smb1r-');
  write(path.join(install, 'SMB1R.exe'), '');
  write(path.join(install, 'portable.txt'), '');
  assert.equal(ports.scan(install)[0].data.saveFile, path.join(install, 'config', 'achievements.sav'));

  write(path.join(roaming, 'SMB1R', 'achievements.sav'), '10z0');
  assert.equal(ports.earnedIds('smb1r', entry.data.saveFile), null, 'a damaged file takes nothing back');
});

test('Ghostship merges its save slots: unlocked in one slot is unlocked, the highest count wins', (t) => {
  const { ports } = profile(t);
  const install = makeTempDir('aw-recomp-ghostship-');
  write(path.join(install, 'Ghostship.exe'), '');
  const slot = (entries) => JSON.stringify({ version: 2, shipSaveData: { features: { achievements: true }, achievementSaveData: { cheated: false, entries } } });
  write(path.join(install, 'saves', 'save_0.json'), slot([{ id: 'Get1Star', progress: 1 }, { id: 'Jump1000Times', progress: 412 }]));
  write(path.join(install, 'saves', 'save_2.json'), slot([{ id: 'Jump1000Times', progress: 1000 }, { id: 'Talk25Times', progress: 3 }, { id: 'FromAMod', progress: 1 }]));
  write(path.join(install, 'saves', 'save_3.json'), JSON.stringify({ version: 2, shipSaveData: { features: { achievements: false } } }));

  const [entry] = ports.scan(install);
  assert.equal(entry.appid, 'pcports-ghostship');
  const unlocks = Object.fromEntries(ports.getAchievements(entry.data).map((u) => [u.id, [u.achieved, u.progress || 0]]));
  assert.deepEqual(unlocks, { Get1Star: [true, 1], Jump1000Times: [true, 1000], Talk25Times: [false, 3] });

  fs.writeFileSync(path.join(install, 'saves', 'save_2.json'), '{"version": 2, "shipSa');
  assert.equal(ports.earnedIdsFor(entry.data), null, 'one slot caught half written holds the others back');
});

test("SMS Launcher's files give Sunshine and the Eclipse mod apart, each unlock with its own date", (t) => {
  const { ports, roaming } = profile(t);
  write(path.join(roaming, 'sms-launcher', 'achievements.txt'), '1 1761170000\r\n12 1761171990\n1 1761179999\n9999 1761170001\n');
  write(path.join(roaming, 'sms-launcher', 'achievements-eclipse.txt'), '3 1761172000\n');
  const entries = ports.knownEntries();
  const sunshine = entries.find((entry) => entry.data.port === 'sms');
  const eclipse = entries.find((entry) => entry.data.port === 'smseclipse');
  assert.deepEqual(
    ports.getAchievements(sunshine.data).map(({ id, earned_time }) => [id, earned_time]),
    [
      ['1', 1761170000],
      ['12', 1761171990],
    ],
    'the first line of an id wins, an id the list does not have is dropped'
  );
  assert.deepEqual(ports.earnedIds('smseclipse', eclipse.data.saveFile), ['3']);

  const launcher = makeTempDir('aw-recomp-sms-');
  write(path.join(launcher, 'SMS-Launcher-1.4.0-win-portable.exe'), '');
  write(path.join(launcher, 'SMS-Launcher-Portable', 'achievements.txt'), '2 1761170000\n');
  const portsOf = (options) => ports.scan(launcher, options).map((entry) => [entry.data.port, entry.data.saveFile]);
  const sunshineFile = ['sms', path.join(launcher, 'SMS-Launcher-Portable', 'achievements.txt')];
  const eclipseFile = ['smseclipse', path.join(launcher, 'SMS-Launcher-Portable', 'achievements-eclipse.txt')];
  assert.deepEqual(portsOf(), [sunshineFile], 'the launcher alone does not mean the Eclipse mod is installed');
  assert.deepEqual(portsOf({ waiting: true }), [sunshineFile, eclipseFile], 'the Watchdog still waits for its first unlock');
  write(eclipseFile[1], '3 1761172000\n');
  assert.deepEqual(portsOf(), [sunshineFile, eclipseFile]);
});

test('DKR-R keeps each unlock date, counts only real counters, and portable.txt moves its file', (t) => {
  const { ports, roaming } = profile(t);
  const entry = (unlocked, when, progress) => ({ unlocked, restored: false, modded: false, when, progress });
  write(
    path.join(roaming, 'DKRPort', 'achievements', 'progress-v1.json'),
    JSON.stringify({
      schema: 1,
      catalogue: 'dkr-r-94-v1',
      entries: { 'first-balloon': entry(true, 1761170000, 1), 'balloons-39': entry(false, 0, 21), 'tt-5': entry(true, 1761171234, 3677), 'tt-3': entry(false, 0, 0) },
      preferences: { notifications: true },
    })
  );
  const found = ports.knownEntries().find((candidate) => candidate.data.port === 'dkrr');
  assert.equal(found.appid, 'pcports-dkrr');
  assert.deepEqual(
    ports.getAchievements(found.data).map(({ id, achieved, earned_time, progress }) => [id, achieved, earned_time, progress || 0]),
    [
      ['first-balloon', true, 1761170000, 0],
      ['balloons-39', false, 0, 21],
      ['tt-5', true, 1761171234, 0],
      ['tt-3', false, 0, 0],
    ],
    'a time trial keeps its target time as progress: no bar from it'
  );

  const install = makeTempDir('aw-recomp-dkrr-');
  write(path.join(install, 'DKR-R.exe'), '');
  write(path.join(install, 'portable.txt'), '');
  assert.equal(ports.scan(install)[0].data.saveFile, path.join(install, 'dkr-runtime-data', 'achievements', 'progress-v1.json'));

  write(path.join(roaming, 'DKRPort', 'achievements', 'progress-v1.json'), JSON.stringify({ schema: 2, entries: {} }));
  assert.equal(ports.earnedIdsFor(found.data), null, 'a schema it does not know reads as nothing');
});

test('a game Quiver installed is known by its repository, even under an executable name not listed', (t) => {
  const { ports, local } = profile(t);
  const root = path.join(local, 'QuiverLauncher');
  write(path.join(root, 'apps.json'), JSON.stringify({ apps: [{ name: 'Twilight Princess', repository: 'TwilitRealm/dusklight', folderName: 'TP-Dusklight' }] }));
  write(path.join(root, 'Apps', 'TP-Dusklight', 'Dusklight-v2.0.3.exe'), '');
  const entry = ports.knownEntries().find((candidate) => candidate.data.port === 'dusklight');
  assert.equal(entry.data.root, path.join(root, 'Apps', 'TP-Dusklight'));
});

test('a half-written save reads as nothing rather than as everything locked', (t) => {
  const { ports, roaming } = profile(t);
  const file = path.join(roaming, 'TwilitRealm', 'Dusklight', 'achievements.json');
  write(file, '{"hero_of_twilight": {"progress": 1, "unlo');
  assert.equal(ports.readUnlocks('dusklight', file), null);
  assert.deepEqual(ports.getAchievements({ port: 'dusklight', saveFile: file }), []);
});

test("SMS Launcher's own achievement pictures are copied into the cache, a missing one left empty", async (t) => {
  const { ports, roaming } = profile(t);
  write(path.join(roaming, 'sms-launcher', 'achievements.txt'), '1 1761170000\n');
  write(path.join(roaming, 'sms-launcher', 'achievement-icons', '1.png'), png(64, 64));
  write(path.join(roaming, 'sms-launcher', 'achievement-icons', 'eclipse', '1.png'), png(64, 64));
  const urls = stubFetch(t, () => new Error('nothing is downloaded for a launcher set'));
  const sunshine = ports.knownEntries().find((entry) => entry.data.port === 'sms');

  const list = (await ports.getGameData(sunshine.data)).achievement.list;
  const first = list.find((entry) => entry.name === '1');
  assert.match(first.icon, /^file:\/\/\/.+[\\/]recompports[\\/]sms[\\/]1\.png$/);
  assert.ok(fs.readFileSync(pathOf(first.icon)).equals(png(64, 64)));
  assert.equal(first.icongray, first.icon, 'no locked picture of its own');
  assert.equal(list.find((entry) => entry.name === '2').icon, '');
  assert.deepEqual(urls, []);
});

test("Ghostship's pictures and SMB1R's sheet come from their repository, once, at the pinned commit", async (t) => {
  const { ports } = profile(t);
  const sheet = png(128, 256);
  const urls = stubFetch(t, (url) => (url.endsWith('AchievementIcons.png') ? sheet : png(64, 64)));
  const install = makeTempDir('aw-recomp-art-');
  write(path.join(install, 'Ghostship.exe'), '');
  const [ghostship] = ports.scan(install);

  const stars = (await ports.getGameData(ghostship.data)).achievement.list.find((entry) => entry.name === 'Get1Star');
  assert.match(stars.icon, /[\\/]recompports[\\/]ghostship[\\/]stars\.1\.png$/);
  assert.ok(urls.includes('https://raw.githubusercontent.com/HarbourMasters/Ghostship/aefb89b85e7b78daff62b491ebb2669d2d9270f0/port/textures/achievements/stars.1.png'));
  const fetched = urls.length;
  await ports.getGameData(ghostship.data);
  assert.equal(urls.length, fetched, 'a picture in the cache is not asked for again');

  const peace = (await ports.getGameData({ port: 'smb1r', saveFile: '' })).achievement.list.find((entry) => entry.name === 'SMBLL_CLEAR');
  assert.match(peace.icon, /[\\/]recompports[\\/]smb1r[\\/]SMBLL_CLEAR\.svg$/);
  const svg = fs.readFileSync(pathOf(peace.icon), 'utf8');
  assert.match(svg, /viewBox="32 0 32 32"/, 'index 1 is the second cell of the first row');
  assert.match(svg, /width="128" height="256"/);
  assert.ok(svg.includes(sheet.toString('base64')));
  assert.equal(urls.filter((url) => url.endsWith('AchievementIcons.png')).length, 1, 'one sheet for every achievement');
});

test('offline, the list comes without pictures and the download is not retried at once', async (t) => {
  const { ports } = profile(t);
  const urls = stubFetch(t, () => new Error('offline'));
  const data = { port: 'smb1r', saveFile: '' };
  const list = (await ports.getGameData(data)).achievement.list;
  assert.equal(list.length, 28);
  assert.ok(list.every((entry) => entry.icon === ''));
  await ports.getGameData(data);
  assert.equal(urls.length, 1);
});

test('an unlock with no date in the file takes the moment it was first seen, once', (t) => {
  const { ports, roaming } = profile(t);
  const file = path.join(roaming, 'SMB1R', 'achievements.sav');
  write(file, '1');
  ports.recordObservedTimes('smb1r', ['SMB1_CLEAR'], 1700000000);
  ports.recordObservedTimes('smb1r', ['SMB1_CLEAR'], 1800000000);
  const [unlock] = ports.getAchievements({ port: 'smb1r', saveFile: file });
  assert.deepEqual(unlock, { id: 'SMB1_CLEAR', achieved: true, earned_time: 1700000000 });
});
