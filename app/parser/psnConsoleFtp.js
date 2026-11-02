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
const PROFILE_RE = { ps3: /^\d{8}$/, ps4: /^[0-9a-f]{8}$/i };
// The account's own name, beside its folder.
const PROFILE_NAME_FILE = { ps3: 'localusername', ps4: 'username.dat' };
const MAX_NAME_BYTES = 4096;
const MAX_NAME_CHARS = 64;
const LIST_ID_RE = /^NPWR\d{5}_\d{2}$/;
const MAX_PROFILES = 16;
const MAX_SETS = 3000;
const MAX_SMALL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_MS = 10 * 60 * 1000;
// Past this many unreachable answers the archive is left alone for the rest of the import.
const MAX_ARCHIVE_FAILURES = 3;
const TROPHY_TYPE = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' };
const GRADE_TYPE = { 1: 'platinum', 2: 'gold', 3: 'silver', 4: 'bronze' };
const MIN_PLAUSIBLE_MS = Date.UTC(2005, 0, 1);
const PS4_TABLES = { flag: 'tbl_trophy_flag', title: 'tbl_trophy_title' };
const PS4_REQUIRED = ['title_id', 'trophyid', 'grade', 'unlocked', 'title', 'description', 'time_unlocked'];

const noop = () => {};

// Not an FtpError on purpose: the console answered, so trying the other console's layout is pointless.
const choiceError = (code) => Object.assign(new Error(code), { code });

// A name read from the console, fit for a log line or a dropdown.
const printable = (value) =>
  String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_NAME_CHARS);

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

// ---- Accounts ---------------------------------------------------------------------------------

// The home folder and the account folders in it, or null when this console layout is not there.
async function findHome(session, kind) {
  for (const home of kind === 'ps3' ? [PS3_HOME] : PS4_HOMES) {
    const ids = (await session.list(home)).filter((name) => PROFILE_RE[kind].test(name)).sort();
    if (ids.length) return { home, ids: ids.slice(0, MAX_PROFILES) };
  }
  return null;
}

async function readProfileName(session, home, id, kind) {
  try {
    return printable((await session.fetch(`${home}/${id}/${PROFILE_NAME_FILE[kind]}`, MAX_NAME_BYTES)).toString('utf8'));
  } catch (err) {
    if (!(err instanceof FtpError)) throw err;
    return '';
  }
}

/*
  The account to import: the one asked for, else the only one. Two accounts are never imported
  together, since both write the same lists and the second would overwrite the first one's unlocks.
*/
function pickProfile(ids, wanted) {
  if (wanted) {
    if (!ids.includes(wanted)) throw choiceError('ftp-profile-missing');
    return wanted;
  }
  if (ids.length > 1) throw choiceError('ftp-profile-needed');
  return ids[0];
}

// ---- Records ----------------------------------------------------------------------------------

function titleRecord(listId, platform, name, iconUrl) {
  return {
    npCommunicationId: listId,
    npServiceName: 'trophy',
    trophyTitleName: name,
    trophyTitlePlatform: platform,
    trophyGroupCount: 1,
    ...(iconUrl ? { trophyTitleIconUrl: iconUrl } : {}),
  };
}

// The archived list only replaces the console's texts when it holds exactly the same trophies.
function sameTrophies(archived, trophies) {
  const ids = (list, key) => list.map((t) => String(t[key])).sort().join(',');
  return Array.isArray(archived.trophies) && archived.trophies.length === trophies.length && ids(archived.trophies, 'trophyId') === ids(trophies, 'id');
}

function writeList({ listId, platform, name, trophies, consoleKind }, { profile, archived } = {}) {
  const online = archived && sameTrophies(archived, trophies) ? archived : null;
  const definitions = online || {
    trophies: trophies.map((t) => ({ trophyId: t.id, trophyType: t.type, trophyName: t.name, trophyDetail: t.detail, trophyHidden: t.hidden })),
  };
  const earned = {
    trophies: trophies.filter((t) => t.earned).map((t) => ({ trophyId: t.id, earned: true, earnedDateTime: t.earnedAt ? new Date(t.earnedAt * 1000).toISOString() : '' })),
  };
  const title = psnLibrary.cleanTitleName((online && online.trophyTitleName) || name) || listId;
  return psnLibrary.writeConsoleList({
    title: titleRecord(listId, platform, title, online && online.trophyTitleIconUrl),
    name: title,
    img: {},
    definitions,
    groups: online,
    earned,
    console: consoleKind,
    profile,
  });
}

/*
  The same list in the app's language, with its icons and DLC groups, from the public archive the
  PSN library already falls back on. Offline or refused, the console's own texts stay.
*/
function makeArchive(options) {
  if (options.archive === false) return async () => null;
  const realFetch = options.fetchImpl || fetch;
  let failures = 0;
  const fetchImpl = async (...args) => {
    try {
      return await realFetch(...args);
    } catch (err) {
      failures += 1;
      throw err;
    }
  };
  const ctx = psnLibrary.publicContext({ lang: options.lang, locale: options.locale, fetchImpl });
  return async (listId) => (failures >= MAX_ARCHIVE_FAILURES ? null : psnLibrary.fetchArchivedList(ctx, listId).catch(() => null));
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
  const trophyDir = `${ctx.home}/${ctx.profile}/trophy`;
  const listIds = (await session.list(trophyDir)).filter((name) => LIST_ID_RE.test(name) && (!ctx.only || name === ctx.only)).slice(0, MAX_SETS);
  return listIds.map((listId) => ({
    listId,
    async run() {
      const remote = `${trophyDir}/${listId}`;
      const sfm = await session.fetch(`${remote}/TROPCONF.SFM`, ctx.smallFileBytes);
      const usr = await session.fetch(`${remote}/TROPUSR.DAT`, ctx.smallFileBytes);
      return [await parsePs3Set(path.join(ctx.workDir, 'ps3', ctx.profile, listId), listId, sfm, usr)];
    },
  }));
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
    // Some games leave time_unlocked at its year-0001 placeholder and only fill this one.
    const altTimeColumn = flagColumns.has('time_unlocked_uc') ? 'time_unlocked_uc' : 'NULL';
    const order = flagColumns.has('groupid') ? 'groupid, trophyid' : 'trophyid';
    const rows = query(
      `SELECT title_id, trophyid, grade, unlocked, title, description, time_unlocked, ${altTimeColumn} AS time_alt, ${hiddenColumn} AS hidden FROM ${PS4_TABLES.flag} ORDER BY title_id, ${order}`
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
        earnedAt: earned ? ps4Seconds(row.time_unlocked) || ps4Seconds(row.time_alt) : 0,
      });
    }
    return [...byTitle].map(([key, trophies]) => {
      const meta = titles.get(key) || {};
      return { listId: String(meta.npwr || '').toUpperCase(), platform: 'PS4', name: String(meta.name || ''), titleKey: key, trophies, consoleKind: 'ps4' };
    });
  } finally {
    db.close();
  }
}

async function collectPs4(session, ctx) {
  // One file holds every list: when it fails, nothing is known of any of them.
  const run = async () => {
    const remote = `${ctx.home}/${ctx.profile}/trophy/db/trophy_local.db`;
    const dir = path.join(ctx.workDir, 'ps4', ctx.profile);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'trophy_local.db');
    fs.writeFileSync(file, await session.fetch(remote, DEFAULT_MAX_FILE_BYTES));
    // Rows not yet folded into the database may sit in its write-ahead log.
    try {
      fs.writeFileSync(`${file}-wal`, await session.fetch(`${remote}-wal`, DEFAULT_MAX_FILE_BYTES));
    } catch (err) {
      if (!(err instanceof FtpError)) throw err;
    }
    const lists = readPs4Database(file);
    return ctx.only ? lists.filter((list) => list.listId === ctx.only) : lists;
  };
  return [{ listId: '', run }];
}

// ---- Connection -------------------------------------------------------------------------------

function plansFor(kind, port) {
  const plan = (which, chosen) => ({ kind: which, port: parsePort(chosen, DEFAULT_PORTS[which]) });
  if (kind === 'ps3' || kind === 'ps4') return [plan(kind, port)];
  // Without a port each console is tried on its own default; with one, both layouts share it.
  return port === undefined || port === null || port === '' ? [plan('ps3'), plan('ps4')] : [plan('ps3', port), plan('ps4', port)];
}

/*
  Connects to the console and hands `work` the first layout that has accounts. `kind` is 'ps3',
  'ps4' or 'auto'; `port` empty means the console's default. Rejects with an FtpError code the
  Settings card can word.
*/
async function withConsole(options, work) {
  const kind = options.console ?? 'auto';
  if (!['ps3', 'ps4', 'auto'].includes(kind)) throw new FtpError('ftp-console-invalid');
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const address = await resolveLocalHost(options.host, { allowPublic: options.allowPublic === true, lookup: options.lookup, timeoutMs });
  const plans = plansFor(kind, options.port);
  const factory = options.ftpFactory || ((opts) => new FtpClient(opts));
  let lastError = null;
  for (const plan of plans) {
    const session = makeSession(factory, address, plan.port, timeoutMs);
    try {
      await session.ensure();
      const found = await findHome(session, plan.kind);
      if (found) return await work(session, plan, found);
    } catch (err) {
      if (!(err instanceof FtpError)) throw err;
      lastError = err;
    } finally {
      await session.close();
    }
  }
  throw lastError || new FtpError('ftp-nothing-found');
}

// The console's accounts, for the Settings card to offer: [{ id, name }] with the console and port.
async function listConsoleProfiles(options = {}) {
  return withConsole(options, async (session, plan, found) => {
    const profiles = [];
    for (const id of found.ids) profiles.push({ id, name: await readProfileName(session, found.home, id, plan.kind) });
    return { console: plan.kind, port: plan.port, profiles };
  });
}

/*
  One account's trophies; `only` limits the import to one list (a game's own update). Resolves to
  the same counts as the PSN library import plus the console, port and account it read.
*/
async function importFromConsole(options = {}) {
  const only = options.only ? String(options.only).toUpperCase() : '';
  if (only && !LIST_ID_RE.test(only)) throw choiceError('ftp-list-invalid');
  const wanted = options.profile ? String(options.profile) : '';
  const root = options.tmpRoot || path.join(os.tmpdir(), 'aw-console-ftp');
  fs.mkdirSync(root, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(root, 'run-'));
  try {
    return await withConsole(options, async (session, plan, found) => {
      const profile = pickProfile(found.ids, wanted);
      const ctx = { workDir, home: found.home, profile, only, smallFileBytes: options.maxSmallFileBytes || MAX_SMALL_FILE_BYTES };
      const jobs = await (plan.kind === 'ps3' ? collectPs3 : collectPs4)(session, ctx);
      const { seen, stopped, ...result } = await runJobs(jobs, plan.kind, {
        ...options,
        log: options.log || noop,
        deadline: Date.now() + MAX_IMPORT_MS,
        profile,
        archive: makeArchive(options),
      });
      // Lists the 3.13.0-beta.1 import saved from every account at once, which this account lacks.
      const removed = only || stopped ? 0 : psnLibrary.forgetConsoleLists(plan.kind, seen);
      return { ...result, removed, port: plan.port, profile };
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function runJobs(jobs, consoleKind, { onProgress, log, deadline, profile, archive }) {
  const result = { total: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, rateLimited: false, console: consoleKind, seen: new Set(), stopped: false };
  for (let index = 0; index < jobs.length; index += 1) {
    if (Date.now() > deadline) {
      log('[psn-ftp] time limit reached, the import stops here');
      result.stopped = true;
      break;
    }
    let lists = [];
    try {
      lists = await jobs[index].run();
    } catch (err) {
      result.total += 1;
      result.failed += 1;
      // A list that could not be read is still on the console: it must not be forgotten.
      if (jobs[index].listId) result.seen.add(jobs[index].listId);
      else result.stopped = true;
      log(`[psn-ftp] a ${consoleKind} entry was skipped: ${err && (err.code || err.message || err)}`);
      continue;
    }
    for (const list of lists) {
      result.total += 1;
      onProgress?.({ current: index + 1, total: jobs.length, detail: list.name || list.listId });
      if (!LIST_ID_RE.test(list.listId)) {
        // No list id at all: trophy rows a deleted title left behind, which the console no longer shows.
        result[list.listId ? 'failed' : 'skipped'] += 1;
        log(`[psn-ftp] a ${consoleKind} title without a valid list id was skipped: "${printable(list.name)}" (row ${printable(list.titleKey)}, id "${printable(list.listId)}")`);
        continue;
      }
      result.seen.add(list.listId);
      try {
        const written = writeList(list, { profile, archived: await archive(list.listId) });
        if (!written) result.skipped += 1;
        else if (written.unchanged) result.unchanged += 1;
        else result[written.created ? 'created' : 'updated'] += 1;
      } catch (err) {
        result.failed += 1;
        log(`[psn-ftp] ${list.listId} could not be saved: ${err && (err.message || err)}`);
      }
    }
  }
  return result;
}

module.exports = { importFromConsole, listConsoleProfiles, readPs4Database, DEFAULT_PORTS };
