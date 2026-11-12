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

// The four ports below keep their unlocks beside the game or in their own folder: laid out as each
// port's source writes them (commits pinned in recompPortTable.js).
const { hostPath } = require('../../app/util/winHosts.js');
const nativeLinux = { kind: 'linux', env: { APPDATA: '/home/u/.local/share', LOCALAPPDATA: '/home/u/.local/share', USERPROFILE: '/home/u' } };
const unix = (year, month, day, hour = 0, minute = 0, second = 0) => Math.floor(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000);
const savesOn = (ports, id, host, root = '') => ports.portById(id).saves({ root, host, hostPath });

test('Super Mario All-Stars reads achievements.ini beside the exe: local dates, a day-only date, bit-mask and count progress', (t) => {
  const { ports } = profile(t);
  const install = makeTempDir('aw-recomp-smas-');
  write(path.join(install, 'SuperMarioAllStars.exe'), '');
  write(
    path.join(install, 'achievements.ini'),
    [
      '; Super Mario All-Stars PC port: achievements earned',
      '[notice]',
      'shown=1',
      '[unlocked]',
      'smb1_toad=2026-11-06 14:58:01',
      'll_toad=2026-10-02',
      'not_in_the_list=2026-10-02 10:00:00',
      '[progress]',
      'smb1_castles=22',
      'smb1_enemies=37',
      'smb1_toad=1',
      '',
    ].join('\r\n')
  );

  const [entry] = ports.scan(install);
  assert.equal(entry.appid, 'pcports-smas');
  assert.equal(entry.data.saveFile, path.join(install, 'achievements.ini'));
  const unlocks = Object.fromEntries(ports.getAchievements(entry.data).map((u) => [u.id, u]));
  assert.equal(unlocks.smb1_toad.earned_time, unix(2026, 11, 6, 14, 58, 1), 'the game writes local time');
  assert.equal(unlocks.ll_toad.earned_time, unix(2026, 10, 2), 'an older day-only date is midnight');
  assert.equal(unlocks.smb1_castles.achieved, false);
  assert.equal(unlocks.smb1_castles.progress, 3, 'a set keeps a bit mask: 22 is three bits');
  assert.equal(unlocks.smb1_enemies.progress, 37);
  assert.equal(unlocks.smb1_toad.progress, undefined, 'only an achievement with a target shows a bar');
  assert.equal(unlocks.not_in_the_list, undefined);
});

test('Super Mario All-Stars lists 82 achievements, and on Linux the file is in the XDG data folder', async (t) => {
  const { ports } = profile(t);
  const game = await ports.getGameData({ port: 'smas', saveFile: '' });
  assert.equal(game.achievement.total, 82);
  assert.equal(game.achievement.list.find((entry) => entry.name === 'smb1_castles').max_progress, 8);
  assert.equal(game.achievement.list.find((entry) => entry.name === 'smb1_speed').hidden, 1);
  assert.deepEqual(savesOn(ports, 'smas', nativeLinux), [path.join('/home/u/.local/share', 'SuperMarioAllStars', 'achievements.ini')]);
  assert.deepEqual(savesOn(ports, 'smas', { kind: 'native', env: {} }), [], 'on Windows it is beside the exe, which a save alone cannot give');
  assert.ok(ports.portById('smas').exe.test('SuperMarioAllStars-Linux-x86_64.AppImage'));
});

test('Super Mario All-Stars reads a file caught half written as nothing', (t) => {
  const { ports } = profile(t);
  const file = path.join(makeTempDir('aw-recomp-smas-'), 'achievements.ini');
  for (const text of ['[unlocked]\nsmb1_toad=2026-11-06 14:5', '[unlocked]\nsmb1_to', '[unloc', '[progress]\nsmb1_enemies=abc\n']) {
    write(file, text);
    assert.equal(ports.readUnlocks('smas', file), null, JSON.stringify(text));
  }
});

test("Forza Horizon 2's achievements mod for Azimuth: every profile ini merged, UTC dates, counters ignored", async (t) => {
  const { ports } = profile(t);
  const install = makeTempDir('aw-recomp-fh2-');
  write(path.join(install, 'azimuth.exe'), '');
  assert.deepEqual(ports.scan(install), [], 'Azimuth without the mod has no achievements to list');
  const folder = path.join(install, 'fh2-mods', 'Achievements');
  write(
    path.join(folder, 'User_9000000000000.ini'),
    [
      '; Achievements unlocked offline (Achievements mod). Delete this file to start over.',
      '[unlocked]',
      'first_of_many=2026-11-09 14:12:53 UTC',
      'listen_to_it_roar=2026-11-11 09:05:52 UTC',
      '',
      '; Progress counted from gameplay events since the mod was installed.',
      '[counters]',
      'skill.FastAndClean=96',
      'done.car.292=4',
      '',
    ].join('\r\n')
  );
  write(path.join(folder, 'User_9000000000001.ini'), '[unlocked]\r\nphotographer=2026-11-09 17:09:10 UTC\r\nfirst_of_many=2026-11-10 10:00:00 UTC\r\n');
  write(path.join(folder, 'User_9000000000000.ini.bak'), '[unlocked]\r\nnumber_one=2026-11-09 14:12:53 UTC\r\n');

  write(
    path.join(folder, 'Achievements.txt'),
    [
      'Forza Horizon 2 achievements: 24 of 88 unlocked, 405G of 2000G',
      '',
      '== Forza Horizon 2 ==',
      '[x] First of Many                         10G  Win your first Championship race.  (unlocked 2026-11-09 14:12:53 UTC)',
      '[ ] Pink Wristband                        20G  Obtain the Pink Wristband.  [630686 / 810000 XP]',
      '[ ] Fast and Clean                        10G  Earn the Clean Racing Skill 100 times.  [96 / 100 times]',
      '[ ] Social Caterpillar                    10G  Compete in 20 Multiplayer Events.  [0 / 20 events]  (online only)',
      '',
    ].join('\r\n')
  );

  const [entry] = ports.scan(install);
  assert.equal(entry.appid, 'pcports-fh2azimuth');
  assert.equal(entry.data.saveFiles.length, 3, 'two profiles and the report; the .bak is not a profile');
  const unlocks = Object.fromEntries(ports.getAchievements(entry.data).map((u) => [u.id, u]));
  assert.deepEqual(Object.keys(unlocks).sort(), ['fast_and_clean', 'first_of_many', 'listen_to_it_roar', 'photographer', 'wristband_pink']);
  assert.equal(unlocks.first_of_many.earned_time, Date.UTC(2026, 10, 9, 14, 12, 53) / 1000, 'UTC, and the earliest profile wins');
  assert.deepEqual(unlocks.fast_and_clean, { id: 'fast_and_clean', achieved: false, earned_time: 0, progress: 96 }, 'progress from the report');
  assert.equal(unlocks.wristband_pink.progress, 630686);
  assert.deepEqual(ports.earnedIds('fh2azimuth', path.join(folder, 'Achievements.txt')), [], 'the report never unlocks');
  write(path.join(folder, 'Achievements.txt'), 'Forza Horizon');
  assert.equal(ports.readUnlocks('fh2azimuth', path.join(folder, 'Achievements.txt')), null, 'a report cut mid-write reads as nothing');

  const urls = stubFetch(t, () => png(64, 64));
  const game = await ports.getGameData(entry.data);
  assert.equal(game.achievement.total, 88);
  assert.equal(game.console, 'Xbox One');
  const list = Object.fromEntries(game.achievement.list.map((a) => [a.name, a]));
  assert.equal(list.fast_and_clean.max_progress, 100);
  assert.equal(list.wristband_pink.max_progress, 810000);
  assert.match(list.welcome_festival.icon, /[\\/]recompports[\\/]fh2azimuth[\\/]645d08\.png$/);
  assert.equal(urls.length, 88, 'one picture per achievement');
  assert.ok(urls.includes('https://m.exophase.com/xbox/awards/m/645d08.png'));
});

test('Diablo III (SanctuaryPort) reads user/trophies.txt: one id per line, no date, a line still being written left out', async (t) => {
  const { ports } = profile(t);
  const install = makeTempDir('aw-recomp-d3-');
  write(path.join(install, 'SanctuaryPort.exe'), '');
  const file = path.join(install, 'user', 'trophies.txt');
  write(file, '47\r\n3\n999\n47\n1');

  const [entry] = ports.scan(install);
  assert.equal(entry.appid, 'pcports-sanctuary');
  assert.equal(entry.data.saveFile, file);
  assert.deepEqual(ports.earnedIds('sanctuary', file), ['47', '3'], 'an unknown id and a repeat are dropped, the cut "1" waits');
  assert.deepEqual(
    ports.getAchievements(entry.data).map((u) => u.earned_time),
    [0, 0],
    'the file keeps no date'
  );
  write(file, '47\nabc\n');
  assert.equal(ports.readUnlocks('sanctuary', file), null);

  const urls = stubFetch(t, () => png(64, 64));
  const game = await ports.getGameData(entry.data);
  assert.equal(game.achievement.total, 54);
  assert.equal(game.console, 'PlayStation 4');
  assert.equal(game.achievement.list.find((a) => a.name === '47').displayName, 'Bone Skewer');
  assert.equal(urls.length, 54, 'one picture per trophy');
});

test('Road Rash 64 reads one RetroAchievements id per line, from LOCALAPPDATA or beside the exe with portable.txt', (t) => {
  const { ports, local } = profile(t);
  const file = path.join(local, 'RoadRash64Recompiled', 'achievements.txt');
  write(file, '# Road Rash 64 Recompiled local achievements v1\n157994\n158004\n999999\n');
  const entry = ports.knownEntries().find((candidate) => candidate.data.port === 'rr64');
  assert.equal(entry.data.saveFile, file);
  assert.deepEqual(ports.earnedIds('rr64', file), ['157994', '158004'], 'an id the list does not have is dropped');
  assert.deepEqual(
    ports.getAchievements(entry.data).map((u) => u.earned_time),
    [0, 0],
    'the file keeps no date'
  );

  const install = makeTempDir('aw-recomp-rr64-');
  write(path.join(install, 'RoadRash64Recompiled.exe'), '');
  assert.equal(ports.scan(install)[0].data.saveFile, file, 'no portable.txt: the profile folder');
  write(path.join(install, 'portable.txt'), '');
  assert.equal(ports.scan(install)[0].data.saveFile, path.join(install, 'achievements.txt'));
  assert.deepEqual(savesOn(ports, 'rr64', nativeLinux), [path.join('/home/u', '.config', 'RoadRash64Recompiled', 'achievements.txt')]);
});

test('Road Rash 64 takes a truncated or header-less file for unreadable, never for everything locked', (t) => {
  const { ports } = profile(t);
  const file = path.join(makeTempDir('aw-recomp-rr64-'), 'achievements.txt');
  for (const text of ['', '# Road Rash 64 Recompiled local achievements v1\n15799', '# Road Rash 64 Recompiled local achievements v1\n157994\nx\n']) {
    write(file, text);
    assert.equal(ports.readUnlocks('rr64', file), null, JSON.stringify(text));
  }
  write(file, '# Road Rash 64 Recompiled local achievements v1\n');
  assert.deepEqual(ports.earnedIds('rr64', file), [], 'a whole file with no unlock is just empty');
});

test("Road Rash 64's list has its 52 achievements and the pictures come from the repository at the pinned commit", async (t) => {
  const { ports } = profile(t);
  const urls = stubFetch(t, () => png(64, 64));
  const game = await ports.getGameData({ port: 'rr64', saveFile: '' });
  assert.equal(game.achievement.total, 52);
  assert.ok(urls.includes('https://raw.githubusercontent.com/linkssy2/RoadRash64Recompiled/37e33d4f832857a60a34f1369b83b32afe00d25d/native/assets/achievements/157994.png'));
  assert.match(game.achievement.list[0].icon, /[\\/]recompports[\\/]rr64[\\/]157994\.png$/);
});

test('G-Diffuser reads unlock=<id> <unix time> from saves/achievements.txt and ignores the playtime line', (t) => {
  const { ports } = profile(t);
  const install = makeTempDir('aw-recomp-gdx-');
  write(path.join(install, 'G-Diffuser.exe'), '');
  write(path.join(install, 'saves', 'achievements.txt'), 'version=1\nplaytime_seconds=4021\nunlock=gp.jack.clear 1762400000\nunlock=playtime.1h 1762403600\nunlock=gone.from.game 1762403601\n');

  const [entry] = ports.scan(install);
  assert.equal(entry.appid, 'pcports-gdiffuser');
  assert.equal(entry.data.saveFile, path.join(install, 'saves', 'achievements.txt'));
  assert.deepEqual(
    ports.getAchievements(entry.data).map(({ id, achieved, earned_time }) => [id, achieved, earned_time]),
    [
      ['gp.jack.clear', true, 1762400000],
      ['playtime.1h', true, 1762403600],
    ]
  );
  assert.ok(ports.portById('gdiffuser').exe.test('G-Diffuser'), 'the Linux build has no extension');
  assert.equal(ports.portById('gdiffuser').exe.test('G-Diffuser-Companion.exe'), false);
});

test('G-Diffuser reads a file with no version line, no final newline or a bad unlock as unreadable', (t) => {
  const { ports } = profile(t);
  const file = path.join(makeTempDir('aw-recomp-gdx-'), 'achievements.txt');
  const halves = ['', 'playtime_seconds=1\n', 'version=1\nplaytime_seconds=12', 'version=1\nunlock=gp.jack.clear 17624\nunlock=gp.queen.cl', 'version=1\nunlock=gp.jack.clear\n', 'version=2\n'];
  for (const text of halves) {
    write(file, text);
    assert.equal(ports.readUnlocks('gdiffuser', file), null, JSON.stringify(text));
  }
  write(file, 'version=1\nplaytime_seconds=12\n');
  assert.deepEqual(ports.earnedIds('gdiffuser', file), []);
});

test('Open Nectar keeps Pikmin 1 and Pikmin 2 apart, each with its own file beside its exe and no dates', (t) => {
  const { ports } = profile(t);
  const install = makeTempDir('aw-recomp-nectar-');
  write(path.join(install, 'nectar.exe'), '');
  write(path.join(install, 'pikmin_achievements.txt'), '# Open Nectar achievements (unlocked ids)\r\n0\r\n33\r\n43\r\n99\r\n');
  write(path.join(install, 'pikmin2', 'pikmin2_pc.exe'), '');
  write(path.join(install, 'pikmin2', 'pikmin2_achievements.txt'), '# Nectar (Pikmin 2) achievements (unlocked ids)\n5\n');

  // The install folder alone gives both: Pikmin 2 sits in the pikmin2 folder Open Nectar ships.
  const [pikmin1, pikmin2, ...others] = ports.scan(install);
  const [alone, ...more] = ports.scan(path.join(install, 'pikmin2'));
  assert.deepEqual([pikmin1.data.port, pikmin2.data.port, alone.data.port, others.length, more.length], ['nectar', 'nectar2', 'nectar2', 0, 0]);
  assert.equal(pikmin1.data.saveFile, path.join(install, 'pikmin_achievements.txt'));
  assert.equal(pikmin2.data.saveFile, path.join(install, 'pikmin2', 'pikmin2_achievements.txt'));
  assert.deepEqual(ports.earnedIdsFor(pikmin1.data), ['0', '33', '43'], 'id 99 is not in the list');
  assert.deepEqual(ports.earnedIdsFor(pikmin2.data), ['5']);
  assert.deepEqual(ports.getAchievements(pikmin2.data), [{ id: '5', achieved: true, earned_time: 0 }]);
});

test('Open Nectar lists 44 and 17 achievements, matches only its own exes, and reads a half-written file as nothing', async (t) => {
  const { ports } = profile(t);
  assert.equal((await ports.getGameData({ port: 'nectar', saveFile: '' })).achievement.total, 44);
  assert.equal((await ports.getGameData({ port: 'nectar2', saveFile: '' })).achievement.total, 17);
  const file = path.join(makeTempDir('aw-recomp-nectar-'), 'pikmin_achievements.txt');
  for (const text of ['# Open Nectar achiev', '# Open Nectar achievements (unlocked ids)\n0\n3', '']) {
    write(file, text);
    assert.equal(ports.readUnlocks('nectar', file), null, JSON.stringify(text));
  }
  for (const [exe, expected] of [['nectar.exe', ['nectar']], ['nectar-pal', ['nectar']], ['nectar-launcher.exe', []], ['nectar2.exe', ['nectar2']], ['pikmin2_pc-usa', ['nectar2']]]) {
    assert.deepEqual(['nectar', 'nectar2'].filter((id) => ports.portById(id).exe.test(exe)), expected, exe);
  }
});
