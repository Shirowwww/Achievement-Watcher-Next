'use strict';

// Trophies of a jailbroken PS3 (TROPCONF.SFM + TROPUSR.DAT) or PS4 (trophy_local.db) read over FTP
// must land in the cache exactly like the PSN library's own lists.

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { makeTempDir } = require('../helpers/tempDir');
const { startFakeFtp } = require('../helpers/fakeFtpServer.js');
const psnLibrary = require('../../app/parser/psnLibrary.js');
const consoleFtp = require('../../app/parser/psnConsoleFtp.js');

const root = makeTempDir('aw-console-ftp-');
let run = 0;
let tmpRoot = '';
beforeEach(() => {
  run += 1;
  psnLibrary.setUserDataPath(path.join(root, `profile-${run}`));
  tmpRoot = path.join(root, `tmp-${run}`);
});

const RTC_EPOCH = 62135596800000000n;
const HOME_PS3 = '/dev_hdd0/home';
const SECONDS_2025 = 1757980800;

function userData(trophies) {
  const chunks = [Buffer.from('818F54AD', 'hex'), Buffer.from('0400000050', 'hex'), Buffer.from('0400000050', 'hex')];
  const records = [];
  for (const t of trophies) {
    const r = Buffer.alloc(0x50, 0);
    r.writeInt32BE(t.id, 0);
    r.writeInt32BE(t.id, 8);
    r.writeUInt32BE(0xffffffff, 16);
    records.push([Buffer.from('0400000050', 'hex'), r]);
  }
  for (const t of trophies) {
    const s = Buffer.alloc(0x60, 0);
    s.writeInt32BE(t.id, 0);
    s.writeInt32BE(t.id, 8);
    s.writeInt32BE(t.time ? 1 : 0, 12);
    if (t.time) {
      const tick = BigInt(t.time) * 1000000n + RTC_EPOCH;
      s.writeBigUInt64BE(tick, 24);
      s.writeBigUInt64BE(tick, 32);
    }
    records.push([Buffer.from('0600000060', 'hex'), s]);
  }
  records.forEach(([delim, record], i) => chunks.push(...(i > 0 ? [delim] : []), record));
  return Buffer.concat(chunks);
}

// A real console's file starts with a signature block before the XML.
function conf(setId, title, trophies) {
  const body = trophies
    .map((t) => `<trophy id="${t.id}" hidden="${t.hidden ? 'yes' : 'no'}" ttype="${t.type}" pid="-1"><name>${t.name}</name><detail>${t.detail}</detail></trophy>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?><trophyconf version="1.1"><npcommid>${setId}</npcommid><title-name>${title}</title-name>${body}</trophyconf>`;
  return Buffer.concat([Buffer.alloc(64, 0xa5), Buffer.from(xml)]);
}

const ASTRO = [
  { id: 0, type: 'P', name: 'Platinum', detail: 'All of them', time: SECONDS_2025 },
  { id: 1, type: 'G', name: 'Collector', detail: 'Find ten', hidden: true, time: 0 },
  { id: 2, type: 'B', name: 'First steps', detail: 'Start', time: SECONDS_2025 - 3600 },
];

function ps3Server(extra = {}) {
  const trophy = `${HOME_PS3}/00000001/trophy`;
  return startFakeFtp({
    dirs: {
      [HOME_PS3]: ['00000001', 'notaprofile', '..\\..\\evil'],
      [trophy]: ['NPWR00001_00', '_TROPSYS_', 'NPWR00002_00', 'NPWR00003_00.bak','..\\..\\x', 'npwr00004_00'],
    },
    files: {
      [`${trophy}/NPWR00001_00/TROPCONF.SFM`]: conf('NPWR00001_00', 'Astro', ASTRO),
      [`${trophy}/NPWR00001_00/TROPUSR.DAT`]: userData(ASTRO),
      [`${trophy}/NPWR00002_00/TROPCONF.SFM`]: conf('NPWR00002_00', 'Broken', ASTRO),
      [`${trophy}/NPWR00002_00/TROPUSR.DAT`]: Buffer.from('not a trophy file'),
    },
    ...extra,
  });
}

// No archive answers unless a test brings one: the suite never reaches the network.
const offline = async () => ({ ok: false, status: 404, json: async () => null });
const noExophase = { searchExophaseTrophyLists: async () => [], fetchExophaseAchievementsMultiLang: async () => ({ items: [] }) };
const importOptions = (server, extra = {}) => ({ host: '127.0.0.1', port: server.port, tmpRoot, timeoutMs: 1500, fetchImpl: offline, exophase: noExophase, ...extra });

test('a PS3 import writes the lists with the PSN library shape and keeps a broken file from stopping the rest', async () => {
  const server = await ps3Server();
  try {
    const progress = [];
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', onProgress: (p) => progress.push(p) }));
    assert.deepEqual(result, {
      total: 2,
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 1,
      rateLimited: false,
      console: 'ps3',
      removed: 0,
      port: server.port,
      profile: '00000001',
    });
    assert.ok(progress.length >= 1);

    const game = psnLibrary.getGameData('psn-NPWR00001_00');
    assert.equal(game.appid, 'psn-NPWR00001_00');
    assert.equal(game.npCommId, 'NPWR00001_00');
    assert.equal(game.name, 'Astro');
    assert.equal(game.source, psnLibrary.SOURCE);
    assert.equal(game.system, 'playstation');
    assert.equal(game.platform, 'PS3');
    assert.equal(game.achievement.total, 3);
    assert.equal(game.achievement.unlocked, 2);
    assert.deepEqual(
      game.achievement.list.map((t) => [t.name, t.type, t.hidden, t.displayName, t.Achieved, t.UnlockTime]),
      [
        ['0', 'P', 0, 'Platinum', true, SECONDS_2025],
        ['1', 'G', 1, 'Collector', false, 0],
        ['2', 'B', 0, 'First steps', true, SECONDS_2025 - 3600],
      ]
    );
    assert.deepEqual(psnLibrary.getAchievements('psn-NPWR00001_00'), {
      0: { Achieved: true, UnlockTime: SECONDS_2025 },
      2: { Achieved: true, UnlockTime: SECONDS_2025 - 3600 },
    });
    assert.deepEqual(psnLibrary.listCachedTitles(), ['psn-NPWR00001_00']);
  } finally {
    await server.close();
  }
});

test('remote names are checked before anything is fetched or written', async () => {
  const server = await ps3Server();
  try {
    await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3' }));
    const retrieved = server.log.filter((line) => line.startsWith('RETR')).map((line) => line.slice(5));
    assert.deepEqual(retrieved.sort(), [
      `${HOME_PS3}/00000001/trophy/NPWR00001_00/TROPCONF.SFM`,
      `${HOME_PS3}/00000001/trophy/NPWR00001_00/TROPUSR.DAT`,
      `${HOME_PS3}/00000001/trophy/NPWR00002_00/TROPCONF.SFM`,
      `${HOME_PS3}/00000001/trophy/NPWR00002_00/TROPUSR.DAT`,
    ]);
    const asked = server.log.filter((line) => /^(RETR|NLST|LIST) /.test(line)).join('\n');
    assert.doesNotMatch(asked, /evil|\.\.|notaprofile|_TROPSYS_|npwr00004|NPWR00003_00/);
  } finally {
    await server.close();
  }
});

test('the temporary download folder is gone after an import, even a failed one', async () => {
  const server = await ps3Server();
  try {
    await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3' }));
    assert.deepEqual(fs.existsSync(tmpRoot) ? fs.readdirSync(tmpRoot) : [], []);
  } finally {
    await server.close();
  }
  await assert.rejects(consoleFtp.importFromConsole(importOptions({ port: 1 }, { console: 'ps3', timeoutMs: 300 })), (err) => err.code === 'ftp-connect-failed');
  assert.deepEqual(fs.existsSync(tmpRoot) ? fs.readdirSync(tmpRoot) : [], []);
});

test('a file past the size cap skips its game and the import goes on', async () => {
  const server = await ps3Server();
  try {
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', maxSmallFileBytes: 400 }));
    assert.equal(result.failed, 2);
    assert.equal(result.created, 0);
  } finally {
    await server.close();
  }
});

test('a list saved by a PSN import keeps its schema and only gains the console unlocks', async () => {
  const server = await ps3Server();
  try {
    const dir = path.join(psnLibrary.cacheRoot(), 'NPWR00001_00');
    psnLibrary.writeJson(path.join(dir, 'schema.json'), {
      listId: 'NPWR00001_00',
      service: 'trophy',
      name: 'Astro Bot (PS3)',
      platform: 'PS3',
      source: psnLibrary.SOURCE,
      img: { header: 'https://img/hub.jpg' },
      achievement: {
        total: 3,
        list: ['0', '1', '2'].map((id) => ({ name: id, displayName: `T${id}`, description: '', hidden: 0, type: 'B', icon: `https://img/${id}.png`, icongray: `https://img/${id}.png` })),
      },
      meta: { lastUpdated: '2026-01-01T00:00:00Z', fetchedAt: 1 },
    });
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3' }));
    assert.equal(result.created, 0);
    assert.equal(result.updated, 1);
    const game = psnLibrary.getGameData('psn-NPWR00001_00');
    assert.equal(game.achievement.list[0].icon, 'https://img/0.png');
    assert.equal(game.img.header, 'https://img/hub.jpg');
    assert.equal(game.achievement.unlocked, 2);
  } finally {
    await server.close();
  }
});

// ---- PS4 --------------------------------------------------------------------------------------

function ps4Database(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE tbl_trophy_title (id INTEGER PRIMARY KEY, trophy_title_id TEXT, title TEXT);
    CREATE TABLE tbl_trophy_flag (title_id INTEGER, groupid INTEGER, trophyid INTEGER, grade INTEGER, hidden INTEGER, unlocked INTEGER, title TEXT, description TEXT, time_unlocked TEXT);
    INSERT INTO tbl_trophy_title VALUES (9007199254740993, 'NPWR10000_00', 'Bloodborne'), (2, 'NPWR10001_00', 'No Trophies Yet'), (3, 'bad id', 'Broken Title');
    INSERT INTO tbl_trophy_flag VALUES
      (9007199254740993, 0, 0, 1, 0, 1, 'Platinum', 'Get them all', '2025-03-13T22:17:49.00Z'),
      (9007199254740993, 0, 1, 2, 1, 0, 'Hidden gold', 'Secret', '0001-01-01T00:00:00.00Z'),
      (9007199254740993, 0, 2, 4, 0, 1, 'Bronze one', 'Begin', '2025-03-12T18:51:42.00Z'),
      (3, 0, 0, 4, 0, 1, 'Orphan', 'Ignored', '2025-03-12T18:51:42.00Z');
  `);
  db.close();
  return fs.readFileSync(file);
}

function ps4Server(dbBytes) {
  return startFakeFtp({
    dirs: { '/user/home': ['1ab2c3d4', 'zzzzzzzz'] },
    files: { '/user/home/1ab2c3d4/trophy/db/trophy_local.db': dbBytes },
  });
}

test('a PS4 import reads trophy_local.db, with large row ids, and detects the console on its own', async () => {
  const server = await ps4Server(ps4Database(path.join(makeTempDir('aw-ps4-db-'), 'trophy_local.db')));
  try {
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'auto' }));
    assert.equal(result.console, 'ps4');
    assert.equal(result.created, 1);
    assert.equal(result.failed, 1, 'the title with an invalid list id is skipped and counted');

    const game = psnLibrary.getGameData('psn-NPWR10000_00');
    assert.equal(game.name, 'Bloodborne');
    assert.equal(game.platform, 'PS4');
    assert.equal(game.source, psnLibrary.SOURCE);
    assert.deepEqual(
      game.achievement.list.map((t) => [t.name, t.type, t.hidden, t.Achieved, t.UnlockTime]),
      [
        ['0', 'P', 0, true, Date.parse('2025-03-13T22:17:49.00Z') / 1000],
        ['1', 'G', 1, false, 0],
        ['2', 'B', 0, true, Date.parse('2025-03-12T18:51:42.00Z') / 1000],
      ]
    );
  } finally {
    await server.close();
  }
});

test('a PS4 unlock time only kept in time_unlocked_uc is read there, and a skipped title is named in the log', async () => {
  const file = path.join(makeTempDir('aw-ps4-uc-'), 'trophy_local.db');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE tbl_trophy_title (id INTEGER PRIMARY KEY, trophy_title_id TEXT, title TEXT);
    CREATE TABLE tbl_trophy_flag (title_id INTEGER, trophyid INTEGER, grade INTEGER, unlocked INTEGER, title TEXT, description TEXT, time_unlocked TEXT, time_unlocked_uc TEXT);
    INSERT INTO tbl_trophy_title VALUES (1, 'NPWR09518_00', 'Manhunt');
    INSERT INTO tbl_trophy_flag VALUES
      (1, 0, 1, 1, 'Psychopath', 'Unlock all trophies.', '0001-01-01T00:00:00.00Z', '2026-07-04T02:09:43.35Z'),
      (1, 1, 4, 1, 'Seen', 'Execution', '2026-06-28T19:58:21.65Z', '2026-06-28T19:58:21.65Z'),
      (7, 0, 4, 1, 'Lost', 'No title row', '2026-06-28T19:58:21.65Z', NULL);
  `);
  db.close();
  const server = await ps4Server(fs.readFileSync(file));
  try {
    const lines = [];
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps4', log: (line) => lines.push(line) }));
    assert.equal(result.created, 1);
    // Rows left behind by a title the console deleted (RE6 in #160) are no failure.
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(
      psnLibrary.getGameData('psn-NPWR09518_00').achievement.list.map((t) => t.UnlockTime),
      [Math.floor(Date.parse('2026-07-04T02:09:43.35Z') / 1000), Math.floor(Date.parse('2026-06-28T19:58:21.65Z') / 1000)]
    );
    assert.ok(lines.some((line) => line.includes('without a valid list id') && line.includes('row 7')), lines.join('\n'));
  } finally {
    await server.close();
  }
});

test('a PS4 database that is not a database is skipped without throwing', async () => {
  const server = await ps4Server(Buffer.from('this is not sqlite'));
  try {
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps4' }));
    assert.equal(result.failed, 1);
    assert.equal(result.created, 0);
  } finally {
    await server.close();
  }
});

test('a console with no trophy folder is reported, not imported as empty', async () => {
  const server = await startFakeFtp({});
  try {
    await assert.rejects(consoleFtp.importFromConsole(importOptions(server, { console: 'auto' })), (err) => err.code === 'ftp-nothing-found');
  } finally {
    await server.close();
  }
});

test('a console that stops answering is reported as unreachable, not as having no trophy folder', async () => {
  const { FtpError } = require('../../app/util/ftpClient.js');
  const ftpFactory = () => ({
    usable: true,
    connect: async () => {},
    list: async () => {
      throw new FtpError('ftp-timeout');
    },
    retrieve: async () => Buffer.alloc(0),
    close: async () => {},
  });
  await assert.rejects(consoleFtp.importFromConsole({ host: '127.0.0.1', console: 'ps3', tmpRoot, ftpFactory }), (err) => err.code === 'ftp-timeout');
});

// ---- Accounts ---------------------------------------------------------------------------------

const SHARED = [
  { id: 0, type: 'B', name: 'Mine', detail: 'Only the first account', time: SECONDS_2025 },
  { id: 1, type: 'B', name: 'Theirs', detail: 'Only the second account', time: 0 },
];

function twoAccountServer() {
  const home = (id) => `${HOME_PS3}/${id}/trophy`;
  return startFakeFtp({
    dirs: {
      [HOME_PS3]: ['00000001', '00000002'],
      [home('00000001')]: ['NPWR00001_00'],
      [home('00000002')]: ['NPWR00001_00', 'NPWR00005_00'],
    },
    files: {
      [`${HOME_PS3}/00000001/localusername`]: Buffer.from('Victor\u0000\n'),
      [`${HOME_PS3}/00000002/localusername`]: Buffer.from('Sister'),
      [`${home('00000001')}/NPWR00001_00/TROPCONF.SFM`]: conf('NPWR00001_00', 'Shared', SHARED),
      [`${home('00000001')}/NPWR00001_00/TROPUSR.DAT`]: userData(SHARED),
      [`${home('00000002')}/NPWR00001_00/TROPCONF.SFM`]: conf('NPWR00001_00', 'Shared', SHARED),
      [`${home('00000002')}/NPWR00001_00/TROPUSR.DAT`]: userData(SHARED.map((t) => ({ ...t, time: t.id === 1 ? SECONDS_2025 : 0 }))),
      [`${home('00000002')}/NPWR00005_00/TROPCONF.SFM`]: conf('NPWR00005_00', 'Only hers', ASTRO),
      [`${home('00000002')}/NPWR00005_00/TROPUSR.DAT`]: userData(ASTRO),
    },
  });
}

test('the accounts of a console are listed with their names, and two are never imported together', async () => {
  const server = await twoAccountServer();
  try {
    const found = await consoleFtp.listConsoleProfiles(importOptions(server, { console: 'ps3' }));
    assert.equal(found.console, 'ps3');
    assert.deepEqual(found.profiles, [
      { id: '00000001', name: 'Victor' },
      { id: '00000002', name: 'Sister' },
    ]);
    await assert.rejects(consoleFtp.importFromConsole(importOptions(server, { console: 'ps3' })), (err) => err.code === 'ftp-profile-needed');
    await assert.rejects(consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', profile: '00000009' })), (err) => err.code === 'ftp-profile-missing');
    assert.deepEqual(psnLibrary.listCachedTitles(), []);

    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', profile: '00000001' }));
    assert.equal(result.created, 1);
    assert.deepEqual(psnLibrary.listCachedTitles(), ['psn-NPWR00001_00']);
    assert.deepEqual(Object.keys(psnLibrary.getAchievements('psn-NPWR00001_00')), ['0']);
    const asked = server.log.filter((line) => line.startsWith('RETR') && line.includes('/trophy/')).join('\n');
    assert.doesNotMatch(asked, /00000002/);
  } finally {
    await server.close();
  }
});

test("a list re-read from the console takes the account's unlocks as they are, and an unchanged one is counted as such", async () => {
  const server = await twoAccountServer();
  try {
    const options = importOptions(server, { console: 'ps3', profile: '00000001' });
    await consoleFtp.importFromConsole(options);
    const again = await consoleFtp.importFromConsole(options);
    assert.equal(again.unchanged, 1);
    assert.equal(again.updated, 0);

    // The second account's import replaces the unlocks rather than adding them to the first one's.
    const hers = await consoleFtp.importFromConsole({ ...options, profile: '00000002' });
    assert.equal(hers.updated, 1);
    assert.deepEqual(Object.keys(psnLibrary.getAchievements('psn-NPWR00001_00')), ['1']);
  } finally {
    await server.close();
  }
});

test('lists an import saved from every account at once are forgotten, those named on an account are kept', async () => {
  const server = await twoAccountServer();
  try {
    const seed = (listId, meta) =>
      psnLibrary.writeJson(path.join(psnLibrary.cacheRoot(), listId, 'schema.json'), {
        listId,
        name: listId,
        platform: 'PS3',
        source: psnLibrary.SOURCE,
        img: {},
        achievement: { total: 1, list: [{ name: '0', displayName: 'T', description: '', hidden: 0, type: 'B' }] },
        meta,
      });
    seed('NPWR00005_00', { console: 'ps3' });
    seed('NPWR00006_00', { console: 'ps3', profile: '00000002' });
    seed('NPWR00007_00', { console: 'ps4' });
    seed('NPWR00008_00', { lastUpdated: 'x' });
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', profile: '00000001' }));
    assert.equal(result.removed, 1);
    assert.deepEqual(psnLibrary.listCachedTitles(), ['psn-NPWR00001_00', 'psn-NPWR00006_00', 'psn-NPWR00007_00', 'psn-NPWR00008_00']);

    // A single game's update never forgets the others.
    seed('NPWR00005_00', { console: 'ps3' });
    const one = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', profile: '00000001', only: 'NPWR00001_00' }));
    assert.equal(one.removed, 0);
    assert.ok(psnLibrary.listCachedTitles().includes('psn-NPWR00005_00'));
  } finally {
    await server.close();
  }
});

test("one game's update reads that list only", async () => {
  const server = await twoAccountServer();
  try {
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', profile: '00000002', only: 'npwr00005_00' }));
    assert.equal(result.total, 1);
    assert.deepEqual(psnLibrary.listCachedTitles(), ['psn-NPWR00005_00']);
    const asked = server.log.filter((line) => line.startsWith('RETR') && line.includes('/trophy/')).join('\n');
    assert.doesNotMatch(asked, /NPWR00001_00/);
    await assert.rejects(consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', profile: '00000002', only: '../x' })), (err) => err.code === 'ftp-list-invalid');
  } finally {
    await server.close();
  }
});

// ---- Archive ----------------------------------------------------------------------------------

function archiveFetch(lists) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    const match = String(url).match(/\/trophies\/([a-z-]+)\/(NPWR\d{5}_\d{2})\.json$/);
    const body = match && lists[`${match[1]}/${match[2]}`];
    return body ? { ok: true, json: async () => body } : { ok: false, status: 404, json: async () => null };
  };
  return { fetchImpl, asked };
}

const archivedAstro = (overrides = {}) => ({
  npCommunicationId: 'NPWR00001_00',
  trophyTitleName: 'Trophies for Astro Bot',
  trophyTitleIconUrl: 'https://image.api.playstation.com/trophy/np/astro.png',
  trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'Astro Bot' }],
  trophies: [0, 1, 2].map((id) => ({
    trophyId: id,
    trophyHidden: false,
    trophyType: ['platinum', 'gold', 'bronze'][id],
    trophyName: `Archive ${id}`,
    trophyDetail: `Detail ${id}`,
    trophyIconUrl: `https://image.api.playstation.com/trophy/np/${id}.png`,
    trophyGroupId: 'default',
  })),
  ...overrides,
});

test("the archive's list in the app's language gives the texts, icons and the game's name, the console its unlocks", async () => {
  const server = await ps3Server();
  try {
    const archive = archiveFetch({ 'fr/NPWR00001_00': archivedAstro() });
    await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', lang: 'french', fetchImpl: archive.fetchImpl }));
    const game = psnLibrary.getGameData('psn-NPWR00001_00');
    assert.equal(game.name, 'Astro Bot');
    assert.equal(game.img.icon, 'https://image.api.playstation.com/trophy/np/astro.png');
    assert.equal(game.psnConsole, 'ps3');
    assert.deepEqual(
      game.achievement.list.map((t) => [t.name, t.displayName, t.icon, t.Achieved]),
      [
        ['0', 'Archive 0', 'https://image.api.playstation.com/trophy/np/0.png', true],
        ['1', 'Archive 1', 'https://image.api.playstation.com/trophy/np/1.png', false],
        ['2', 'Archive 2', 'https://image.api.playstation.com/trophy/np/2.png', true],
      ]
    );
    assert.ok(archive.asked.some((url) => url.includes('/fr/NPWR00001_00.json')));
  } finally {
    await server.close();
  }
});

test("another version of the list in the archive lends the texts of the trophies both share, the console keeps its own count", async () => {
  const server = await ps3Server();
  try {
    // The console holds three trophies, the archive two of them plus one the console does not have.
    const other = archivedAstro({ trophies: [...archivedAstro().trophies.slice(0, 2), { ...archivedAstro().trophies[0], trophyId: 9, trophyName: 'Archive 9' }] });
    await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', fetchImpl: archiveFetch({ 'en/NPWR00001_00': other }).fetchImpl }));
    const game = psnLibrary.getGameData('psn-NPWR00001_00');
    assert.deepEqual(
      game.achievement.list.map((t) => [t.name, t.displayName]),
      [
        ['0', 'Archive 0'],
        ['1', 'Archive 1'],
        ['2', 'First steps'],
      ]
    );
  } finally {
    await server.close();
  }
});

test('a PS4 list the archive lacks takes its icons from the Exophase page named like it, never its texts (#160)', async () => {
  const icon = (n) => `https://m.exophase.com/psn/awards/s/b${n}.png`;
  // Exophase counts from 1 where the console counts from 0.
  const page = (grades) => ({ items: grades.map((grade, at) => ({ index: at + 1, grade, titles: { english: `Exophase ${at}` }, icon_url: icon(at) })) });
  const exophase = (grades, title = 'Bloodborne') => ({
    searchExophaseTrophyLists: async () => [{ title: 'Bloodborne', platform: 'ps5', slug: 'other' }, { title, platform: 'ps4', slug: 'bloodborne-psn' }],
    fetchExophaseAchievementsMultiLang: async ({ slug }) => (slug === 'bloodborne-psn' ? page(grades) : { items: [] }),
  });
  const imported = async (stub) => {
    const server = await ps4Server(ps4Database(path.join(makeTempDir('aw-ps4-exo-'), 'trophy_local.db')));
    try {
      await consoleFtp.importFromConsole(importOptions(server, { console: 'ps4', exophase: stub }));
      return psnLibrary.getGameData('psn-NPWR10000_00').achievement.list;
    } finally {
      await server.close();
    }
  };

  const list = await imported(exophase(['P', 'G', 'B']));
  assert.deepEqual(list.map((t) => t.icon), [0, 1, 2].map((n) => icon(n).replace('/awards/s/', '/awards/l/')));
  assert.ok(list.every((t) => !t.displayName.startsWith('Exophase')), 'the console keeps its own texts');
  assert.equal((await imported(exophase(['P', 'B', 'B'])))[0].icon, '', 'a page with other grades is another list');
  assert.equal((await imported(exophase(['P', 'G', 'B'], 'Bloodborne 2')))[0].icon, '', 'and so is a page named otherwise');
});

test('an archived list with other grades, or an archive that cannot be reached, leaves the console texts', async () => {
  const server = await ps3Server();
  try {
    const regraded = archivedAstro({ trophies: archivedAstro().trophies.map((t) => ({ ...t, trophyType: 'bronze' })) });
    await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', fetchImpl: archiveFetch({ 'en/NPWR00001_00': regraded }).fetchImpl }));
    assert.equal(psnLibrary.getGameData('psn-NPWR00001_00').achievement.list[0].displayName, 'Platinum');

    let calls = 0;
    const down = async () => {
      calls += 1;
      throw new Error('ENOTFOUND');
    };
    await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', fetchImpl: down }));
    assert.equal(psnLibrary.getGameData('psn-NPWR00001_00').achievement.list[0].displayName, 'Platinum');
    assert.ok(calls <= 3, `the archive was asked ${calls} times while unreachable`);
  } finally {
    await server.close();
  }
});

// ---- Input ------------------------------------------------------------------------------------

test('bad input is refused before any connection', async () => {
  await assert.rejects(consoleFtp.importFromConsole({ host: '8.8.8.8', console: 'ps3', tmpRoot }), (err) => err.code === 'ftp-host-not-local');
  await assert.rejects(consoleFtp.importFromConsole({ host: 'a b', console: 'ps3', tmpRoot }), (err) => err.code === 'ftp-host-invalid');
  await assert.rejects(consoleFtp.importFromConsole({ host: '192.168.1.5', console: 'ps3', port: '70000', tmpRoot }), (err) => err.code === 'ftp-port-invalid');
  await assert.rejects(consoleFtp.importFromConsole({ host: '192.168.1.5', console: 'xbox', tmpRoot }), (err) => err.code === 'ftp-console-invalid');
});

after(() => fs.rmSync(root, { recursive: true, force: true }));
