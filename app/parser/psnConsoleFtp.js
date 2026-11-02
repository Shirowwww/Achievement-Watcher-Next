'use strict';

/*
  Trophies of a jailbroken PS3 (webMAN FTP) or PS4 (GoldHEN FTP), read over the home network when
  signing in to PSN is not possible. The console's files become the same cached lists as the PSN
  library's (steam_cache/psn/<NPWR id>), so the games, their rarity and their cards behave alike.

  Everything the console sends is untrusted: only known folders and files are asked for, a remote
  name is matched against a strict pattern before it is used, and downloads go to a throwaway folder
  whose paths are built from the checked names only.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FtpClient, FtpError, resolveLocalHost, parsePort, DEFAULT_MAX_FILE_BYTES, DEFAULT_TIMEOUT_MS } = require('../util/ftpClient.js');
const psnLibrary = require('./psnLibrary.js');

const DEFAULT_PORTS = { ps3: 21, ps4: 2121 };
const PS3_HOME = '/dev_hdd0/home';
// The payload exposes /user/home; some FTP servers show the sandbox mount instead.
const PS4_HOMES = ['/user/home', '/mnt/sandbox/NPXS20001_000/user/home'];
const PS3_PROFILE_RE = /^\d{8}$/;
const PS4_PROFILE_RE = /^[0-9a-f]{8}$/i;
const LIST_ID_RE = /^NPWR\d{5}_\d{2}$/;
const MAX_PROFILES = 16;
const MAX_SETS = 3000;
const MAX_SMALL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_MS = 10 * 60 * 1000;
const TROPHY_TYPE = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' };
const GRADE_TYPE = { 1: 'platinum', 2: 'gold', 3: 'silver', 4: 'bronze' };
const MIN_PLAUSIBLE_MS = Date.UTC(2005, 0, 1);
const PS4_TABLES = { flag: 'tbl_trophy_flag', title: 'tbl_trophy_title' };
const PS4_REQUIRED = ['title_id', 'trophyid', 'grade', 'unlocked', 'title', 'description', 'time_unlocked'];

const noop = () => {};

// ---- Session ----------------------------------------------------------------------------------

/*
  One logical connection: a transfer that times out or goes over its cap ends the FTP session, and
  the next request opens a new one rather than failing every game after it.
*/
function makeSession(factory, address, port, timeoutMs) {
  let client = null;
  const ensure = async () => {
    if (!client || !client.usable) {
      client = factory({ host: address, port, timeoutMs });
      await client.connect();
    }
    return client;
  };
  return {
    ensure,
    async list(dir) {
      const live = await ensure();
      try {
        return await live.list(dir);
      } catch (err) {
        // A refused path (550) is a folder this console does not have; a timeout or a drop is not.
        if (err instanceof FtpError && /^ftp-[45]\d\d$/.test(err.code)) return [];
        throw err;
      }
    },
    async fetch(remote, maxBytes) {
      return (await ensure()).retrieve(remote, maxBytes);
    },
    close: async () => (client ? client.close() : undefined),
  };
}

// ---- Records ----------------------------------------------------------------------------------

function titleRecord(listId, platform, name) {
  return {
    npCommunicationId: listId,
    npServiceName: 'trophy',
    trophyTitleName: name,
    trophyTitlePlatform: platform,
    trophyGroupCount: 1,
  };
}

function writeList({ listId, platform, name, trophies, consoleKind }) {
  const definitions = {
    trophies: trophies.map((t) => ({ trophyId: t.id, trophyType: t.type, trophyName: t.name, trophyDetail: t.detail, trophyHidden: t.hidden })),
  };
  const earned = {
    trophies: trophies.filter((t) => t.earned).map((t) => ({ trophyId: t.id, earned: true, earnedDateTime: t.earnedAt ? new Date(t.earnedAt * 1000).toISOString() : '' })),
  };
  const title = psnLibrary.cleanTitleName(name) || listId;
  return psnLibrary.writeConsoleList({ title: titleRecord(listId, platform, title), name: title, img: {}, definitions, groups: null, earned, console: consoleKind });
}

// ---- PS3 --------------------------------------------------------------------------------------

// The signature block before the XML would stop the XML parser; only the document is kept.
function xmlOnly(buffer) {
  const text = buffer.toString('utf8');
  const start = text.search(/<\?xml|<trophyconf/i);
  return start < 0 ? null : Buffer.from(text.slice(start));
}

// The TROPCONF.SFM and TROPUSR.DAT of one set, read with the readers RPCS3 games already use.
async function parsePs3Set(dir, listId, sfm, usr) {
  const xml = xmlOnly(sfm);
  if (!xml) throw new Error('TROPCONF.SFM is not XML');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'TROPCONF.SFM'), xml);
  fs.writeFileSync(path.join(dir, 'TROPUSR.DAT'), usr);
  const rpcs3 = require('./rpcs3.js');
  const schema = await rpcs3.getGameData(dir);
  const unlocks = new Map((await rpcs3.getAchievements(dir)).map((entry) => [entry.id, entry]));
  const trophies = schema.achievement.list.map((t) => {
    const mine = unlocks.get(t.name);
    return {
      id: t.name,
      type: TROPHY_TYPE[String(t.type).toUpperCase()] || 'bronze',
      name: String(t.displayName || ''),
      detail: String(t.description || ''),
      hidden: t.hidden === 1,
      earned: Boolean(mine && mine.achieved),
      earnedAt: mine && mine.achieved ? mine.earned_time : 0,
    };
  });
  return { listId, platform: 'PS3', name: String(schema.name || listId), trophies, consoleKind: 'ps3' };
}

async function collectPs3(session, ctx) {
  const profiles = (await session.list(PS3_HOME)).filter((name) => PS3_PROFILE_RE.test(name));
  if (profiles.length === 0) return null;
  const sets = [];
  for (const profile of profiles.slice(0, MAX_PROFILES)) {
    const trophyDir = `${PS3_HOME}/${profile}/trophy`;
    for (const name of await session.list(trophyDir)) {
      if (LIST_ID_RE.test(name) && sets.length < MAX_SETS) sets.push({ profile, listId: name, trophyDir });
    }
  }
  return sets.map((set) => async () => {
    const remote = `${set.trophyDir}/${set.listId}`;
    const sfm = await session.fetch(`${remote}/TROPCONF.SFM`, ctx.smallFileBytes);
    const usr = await session.fetch(`${remote}/TROPUSR.DAT`, ctx.smallFileBytes);
    return [await parsePs3Set(path.join(ctx.workDir, 'ps3', set.profile, set.listId), set.listId, sfm, usr)];
  });
}

// ---- PS4 --------------------------------------------------------------------------------------

function ps4Seconds(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS ? Math.floor(ms / 1000) : 0;
}

// node:sqlite hands large integers back inexact unless asked for BigInts, and row ids can be large.
function readPs4Database(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  try {
    const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    const flagColumns = columns(PS4_TABLES.flag);
    const missing = PS4_REQUIRED.filter((c) => !flagColumns.has(c));
    if (missing.length) throw new Error(`${PS4_TABLES.flag} lacks ${missing.join(', ')}`);
    const titleColumns = columns(PS4_TABLES.title);
    const query = (sql) => {
      const statement = db.prepare(sql);
      statement.setReadBigInts(true);
      return statement.all();
    };
    const titles = new Map();
    if (titleColumns.has('id') && titleColumns.has('trophy_title_id')) {
      const nameColumn = titleColumns.has('title') ? 'title' : 'NULL';
      for (const row of query(`SELECT id, trophy_title_id AS npwr, ${nameColumn} AS name FROM ${PS4_TABLES.title}`)) titles.set(String(row.id), row);
    }
    const hiddenColumn = flagColumns.has('hidden') ? 'hidden' : '0';
    const order = flagColumns.has('groupid') ? 'groupid, trophyid' : 'trophyid';
    const rows = query(
      `SELECT title_id, trophyid, grade, unlocked, title, description, time_unlocked, ${hiddenColumn} AS hidden FROM ${PS4_TABLES.flag} ORDER BY title_id, ${order}`
    );
    const byTitle = new Map();
    for (const row of rows) {
      const key = String(row.title_id);
      const earned = Number(row.unlocked) !== 0;
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push({
        id: Number(row.trophyid),
        type: GRADE_TYPE[Number(row.grade)] || 'bronze',
        name: String(row.title ?? ''),
        detail: String(row.description ?? ''),
        hidden: Number(row.hidden) !== 0,
        earned,
        earnedAt: earned ? ps4Seconds(row.time_unlocked) : 0,
      });
    }
    return [...byTitle].map(([key, trophies]) => {
      const meta = titles.get(key) || {};
      return { listId: String(meta.npwr || '').toUpperCase(), platform: 'PS4', name: String(meta.name || ''), trophies, consoleKind: 'ps4' };
    });
  } finally {
    db.close();
  }
}

async function collectPs4(session, ctx) {
  let home = '';
  let profiles = [];
  for (const candidate of PS4_HOMES) {
    profiles = (await session.list(candidate)).filter((name) => PS4_PROFILE_RE.test(name));
    if (profiles.length) {
      home = candidate;
      break;
    }
  }
  if (!home) return null;
  return profiles.slice(0, MAX_PROFILES).map((profile) => async () => {
    const remote = `${home}/${profile}/trophy/db/trophy_local.db`;
    const dir = path.join(ctx.workDir, 'ps4', profile);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'trophy_local.db');
    fs.writeFileSync(file, await session.fetch(remote, DEFAULT_MAX_FILE_BYTES));
    // Rows not yet folded into the database may sit in its write-ahead log.
    try {
      fs.writeFileSync(`${file}-wal`, await session.fetch(`${remote}-wal`, DEFAULT_MAX_FILE_BYTES));
    } catch (err) {
      if (!(err instanceof FtpError)) throw err;
    }
    return readPs4Database(file);
  });
}

// ---- Import -----------------------------------------------------------------------------------

function plansFor(kind, port) {
  const plan = (which, chosen) => ({ kind: which, port: parsePort(chosen, DEFAULT_PORTS[which]) });
  if (kind === 'ps3' || kind === 'ps4') return [plan(kind, port)];
  // Without a port each console is tried on its own default; with one, both layouts share it.
  return port === undefined || port === null || port === '' ? [plan('ps3'), plan('ps4')] : [plan('ps3', port), plan('ps4', port)];
}

/*
  `kind` is 'ps3', 'ps4' or 'auto'; `port` empty means the console's default. Resolves to the same
  counts as the PSN library import, and rejects with an FtpError code the Settings card can word.
*/
async function importFromConsole(options = {}) {
  const kind = options.console ?? 'auto';
  if (!['ps3', 'ps4', 'auto'].includes(kind)) throw new FtpError('ftp-console-invalid');
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const log = options.log || noop;
  const address = await resolveLocalHost(options.host, { allowPublic: options.allowPublic === true, lookup: options.lookup, timeoutMs });
  const plans = plansFor(kind, options.port);
  const factory = options.ftpFactory || ((opts) => new FtpClient(opts));
  const root = options.tmpRoot || path.join(os.tmpdir(), 'aw-console-ftp');
  fs.mkdirSync(root, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(root, 'run-'));
  const ctx = { workDir, smallFileBytes: options.maxSmallFileBytes || MAX_SMALL_FILE_BYTES };
  const deadline = Date.now() + MAX_IMPORT_MS;
  let lastError = null;
  try {
    for (const plan of plans) {
      const session = makeSession(factory, address, plan.port, timeoutMs);
      try {
        await session.ensure();
        const jobs = await (plan.kind === 'ps3' ? collectPs3 : collectPs4)(session, ctx);
        if (!jobs || jobs.length === 0) continue;
        return await runJobs(jobs, plan.kind, { ...options, log, deadline });
      } catch (err) {
        if (!(err instanceof FtpError)) throw err;
        lastError = err;
      } finally {
        await session.close();
      }
    }
    throw lastError || new FtpError('ftp-nothing-found');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function runJobs(jobs, consoleKind, { onProgress, log, deadline }) {
  const result = { total: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, rateLimited: false, console: consoleKind };
  for (let index = 0; index < jobs.length; index += 1) {
    if (Date.now() > deadline) {
      log('[psn-ftp] time limit reached, the import stops here');
      break;
    }
    let lists = [];
    try {
      lists = await jobs[index]();
    } catch (err) {
      result.total += 1;
      result.failed += 1;
      log(`[psn-ftp] a ${consoleKind} entry was skipped: ${err && (err.code || err.message || err)}`);
      continue;
    }
    for (const list of lists) {
      result.total += 1;
      onProgress?.({ current: index + 1, total: jobs.length, detail: list.name || list.listId });
      if (!LIST_ID_RE.test(list.listId)) {
        result.failed += 1;
        log(`[psn-ftp] a ${consoleKind} title without a valid list id was skipped`);
        continue;
      }
      try {
        const written = writeList(list);
        if (!written) result.skipped += 1;
        else result[written.created ? 'created' : 'updated'] += 1;
      } catch (err) {
        result.failed += 1;
        log(`[psn-ftp] ${list.listId} could not be saved: ${err && (err.message || err)}`);
      }
    }
  }
  return result;
}

module.exports = { importFromConsole, readPs4Database, DEFAULT_PORTS };
