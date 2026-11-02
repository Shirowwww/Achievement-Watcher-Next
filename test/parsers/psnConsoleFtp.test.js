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

const importOptions = (server, extra = {}) => ({ host: '127.0.0.1', port: server.port, tmpRoot, timeoutMs: 1500, ...extra });

test('a PS3 import writes the lists with the PSN library shape and keeps a broken file from stopping the rest', async () => {
  const server = await ps3Server();
  try {
    const progress = [];
    const result = await consoleFtp.importFromConsole(importOptions(server, { console: 'ps3', onProgress: (p) => progress.push(p) }));
    assert.deepEqual(result, { total: 2, created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 1, rateLimited: false, console: 'ps3' });
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

// ---- Input ------------------------------------------------------------------------------------

test('bad input is refused before any connection', async () => {
  await assert.rejects(consoleFtp.importFromConsole({ host: '8.8.8.8', console: 'ps3', tmpRoot }), (err) => err.code === 'ftp-host-not-local');
  await assert.rejects(consoleFtp.importFromConsole({ host: 'a b', console: 'ps3', tmpRoot }), (err) => err.code === 'ftp-host-invalid');
  await assert.rejects(consoleFtp.importFromConsole({ host: '192.168.1.5', console: 'ps3', port: '70000', tmpRoot }), (err) => err.code === 'ftp-port-invalid');
  await assert.rejects(consoleFtp.importFromConsole({ host: '192.168.1.5', console: 'xbox', tmpRoot }), (err) => err.code === 'ftp-console-invalid');
});

after(() => fs.rmSync(root, { recursive: true, force: true }));
