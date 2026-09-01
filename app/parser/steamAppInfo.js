'use strict';

// Steam's local app catalogue (appcache/appinfo.vdf): answers "is this appid a game" fully offline,
// since GetAppList/the store can be rate-limited. Binary KV, magic 0x07564427/28/29; v29 adds a string table.

const fs = require('fs');
const path = require('path');

let debug = { log() {}, warn() {}, error() {} };

// Logger handed in, not required: the Watchdog loads this file outside the asar via
// sharedAppModule.js, where a relative require can't reach siblings (test/core/sharedAppModules.test.js).
module.exports.initDebug = ({ logger }) => {
  if (logger) debug = logger;
};

const MAGIC_V27 = 0x07564427;
const MAGIC_V28 = 0x07564428;
const MAGIC_V29 = 0x07564429;

function readCString(buf, off) {
  let i = off;
  while (i < buf.length && buf[i] !== 0x00) i++;
  return { value: buf.toString('utf8', off, i), next: i + 1 };
}

function readStringTable(buf, offset) {
  const start = Number(offset);
  if (!Number.isFinite(start) || start < 0 || start + 4 > buf.length) throw new Error('string table offset outside the file');
  const count = buf.readUInt32LE(start);
  // The count comes out of the file, so a truncated or corrupt one can announce billions of entries.
  // Each entry is at least a terminator, so the remaining bytes are the real ceiling; allocating on
  // the announced figure alone hung the process before any catch could run.
  if (count > buf.length - start - 4) throw new Error(`string table announces ${count} entries, more than the file holds`);
  const table = Array.from({ length: count });
  let off = start + 4;
  for (let i = 0; i < count; i++) {
    const read = readCString(buf, off);
    table[i] = read.value;
    off = read.next;
  }
  return table;
}

// One app's KV payload. `table` is null before v29, where keys are inline C strings instead.
function parseNode(buf, offset, table, limit) {
  const obj = {};
  let off = offset;
  while (off < limit) {
    const type = buf.readUInt8(off);
    off += 1;
    if (type === 0x08) return { obj, next: off };
    let key;
    if (table) {
      key = table[buf.readUInt32LE(off)];
      off += 4;
    } else {
      const read = readCString(buf, off);
      key = read.value;
      off = read.next;
    }
    switch (type) {
      case 0x00: {
        const child = parseNode(buf, off, table, limit);
        obj[key] = child.obj;
        off = child.next;
        break;
      }
      case 0x01: {
        const read = readCString(buf, off);
        obj[key] = read.value;
        off = read.next;
        break;
      }
      case 0x02:
        obj[key] = buf.readInt32LE(off);
        off += 4;
        break;
      case 0x03:
        obj[key] = buf.readFloatLE(off);
        off += 4;
        break;
      case 0x06:
        obj[key] = buf.readInt32LE(off); // colour/pointer, unused here
        off += 4;
        break;
      case 0x07:
        obj[key] = buf.readBigUInt64LE(off).toString();
        off += 8;
        break;
      default:
        throw new Error(`unsupported KV type 0x${type.toString(16)} at ${off - 1}`);
    }
  }
  return { obj, next: off };
}

// Only the fields this module promises; the full parsed KV (4 MB of app records) is never cached.
function summarize(appid, kv) {
  const common = (kv && kv.appinfo && kv.appinfo.common) || (kv && kv.common) || null;
  if (!common) return null;
  const name = typeof common.name === 'string' ? common.name.trim() : '';
  const type = String(common.type || '').toLowerCase();
  const parent = Number((kv.appinfo && kv.appinfo.common && kv.appinfo.common.parent) || common.parent || 0) || 0;
  return { appid: String(appid), name, type, parent };
}

function parseAppInfo(buf) {
  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC_V27 && magic !== MAGIC_V28 && magic !== MAGIC_V29) {
    throw new Error(`unknown appinfo magic 0x${magic.toString(16)}`);
  }
  let off = 8; // magic + universe
  let table = null;
  if (magic === MAGIC_V29) {
    table = readStringTable(buf, buf.readBigInt64LE(off));
    off += 8;
  }
  const byAppid = new Map();
  while (off + 4 <= buf.length) {
    const appid = buf.readUInt32LE(off);
    off += 4;
    if (appid === 0) break;
    const size = buf.readUInt32LE(off);
    off += 4;
    const end = off + size;
    // Metadata between size and the KV payload is unused, so it is skipped by width rather than parsed.
    let kvStart = off + 4 + 4 + 8 + 20 + 4; // infoState, lastUpdated, picsToken, sha1 text, changeNumber
    if (magic !== MAGIC_V27) kvStart += 20; // sha1 of the binary section
    try {
      const summary = summarize(appid, parseNode(buf, kvStart, table, Math.min(end, buf.length)).obj);
      if (summary) byAppid.set(summary.appid, summary);
    } catch {
      // One unreadable record must not cost the whole catalogue: skip to the next by its size.
    }
    off = end;
  }
  return byAppid;
}

// Re-read only when Steam has rewritten the file; the ~4 MB parse is otherwise once per session.
let cache = { file: '', mtimeMs: 0, size: 0, byAppid: null };

function load(steamPath) {
  const file = path.join(String(steamPath || ''), 'appcache', 'appinfo.vdf');
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (cache.byAppid && cache.file === file && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.byAppid;
  try {
    const started = Date.now();
    const byAppid = parseAppInfo(fs.readFileSync(file));
    cache = { file, mtimeMs: stat.mtimeMs, size: stat.size, byAppid };
    debug.log(`[steam-appinfo] read ${byAppid.size} app record(s) from the local Steam cache in ${Date.now() - started}ms`);
    return byAppid;
  } catch (err) {
    // A format Steam changed under us is not a reason to fail a scan - every caller has a fallback.
    debug.log(`[steam-appinfo] could not read the local Steam app cache: ${err.message || err}`);
    cache = { file, mtimeMs: stat.mtimeMs, size: stat.size, byAppid: new Map() };
    return cache.byAppid;
  }
}

// Drop the parsed catalogue: worth keeping during a scan, but the Watchdog only asks per-appid
// and would otherwise hold the memory all session.
module.exports.releaseCache = () => {
  cache = {};
};

module.exports.load = load;
module.exports.parseAppInfo = parseAppInfo;

module.exports.lookup = (steamPath, appid) => {
  const byAppid = load(steamPath);
  return (byAppid && byAppid.get(String(appid))) || null;
};

// Steam's own type ('game'|'dlc'|'demo'|...), or '' when the appid is not in the local cache.
// Callers must treat '' as "unknown", never as "not a game".
module.exports.typeOf = (steamPath, appid) => {
  const entry = module.exports.lookup(steamPath, appid);
  return entry ? entry.type : '';
};

module.exports.nameOf = (steamPath, appid) => {
  const entry = module.exports.lookup(steamPath, appid);
  return entry && entry.name ? entry.name : '';
};

// Playable types a user expects in their library. 'beta' counts (e.g. a beta-branch app is the
// game); demos, DLC, soundtracks and tools do not.
const LIBRARY_TYPES = new Set(['game', 'beta']);
module.exports.LIBRARY_TYPES = LIBRARY_TYPES;

module.exports.isLibraryGame = (steamPath, appid) => {
  const type = module.exports.typeOf(steamPath, appid);
  if (!type) return null; // unknown: let the caller decide, do not claim it is not a game
  return LIBRARY_TYPES.has(type);
};
