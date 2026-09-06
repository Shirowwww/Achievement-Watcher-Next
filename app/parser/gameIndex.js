'use strict';

/*
  User-override game index (cfg/gameIndex.json), read by the watchdog playtime monitor at startup to
  match running processes to appids. steamappid/uplayId let it attribute namespaced SocialClub/Uplay
  R2 games to their Steam data; the resolved artwork fields keep synthetic/manual appids off invalid
  Steam-CDN URLs. exePath is where the scan found the binary: two games can ship an executable of
  the same name, and the folder is what tells them apart when one of them starts.
*/

const { app } = process.type === 'browser' ? require('electron') : require('@electron/remote');
const path = require('path');
const { pickBestClaim, isPlaceholderClaim } = require('../util/claimCollision.js');
const fs = require('fs');

function userFile() {
  return path.join(app.getPath('userData'), 'cfg/gameIndex.json');
}

function exeListFile() {
  return path.join(app.getPath('userData'), 'cfg/exeList.db');
}

function normalizePath(value) {
  const text = String(value || '').trim();
  return text ? path.resolve(text).replace(/[\\/]+/g, '/').toLowerCase() : '';
}

let cachedExePaths = null;
let cachedExeSignature = '';

// The launch executable per appid (cfg/exeList.db): what the library resolved, or the user picked.
function configuredExePaths() {
  const file = exeListFile();
  let signature = 'missing';
  try {
    signature = fileSignature(file);
  } catch {
    signature = 'unreadable';
  }
  if (cachedExePaths && signature === cachedExeSignature) return cachedExePaths;
  const byAppid = new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && row.exe) byAppid.set(String(row.appid), String(row.exe));
    }
  } catch {
    /* absent or unreadable: no launch paths known */
  }
  cachedExePaths = byAppid;
  cachedExeSignature = signature;
  return byAppid;
}

// Where a row's executable lives: the path the scan recorded, else the configured launch exe.
function installPathOf(entry, exeByAppid) {
  return normalizePath((entry && entry.exePath) || (exeByAppid && exeByAppid.get(String(entry && entry.appid))) || '');
}

let cachedList = null;
let cachedSignature = '';
let batchDepth = 0;
let batchDirty = false;

function fileSignature(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    throw err;
  }
}

function loadList() {
  const file = userFile();
  const signature = fileSignature(file);
  if (cachedList && (batchDepth > 0 || signature === cachedSignature)) return cachedList;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    cachedList = Array.isArray(parsed) ? parsed : [];
    cachedSignature = signature;
    return cachedList;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cachedList = [];
      cachedSignature = 'missing';
      return cachedList;
    }
    // Every caller wraps this and answers empty, so a truncated file (a crash mid-write, a full
    // disk) left playtime matching and Game Health blind for good, silently. Quarantine the bytes
    // and start over: this index is rebuilt by the next scan.
    quarantineCorruptIndex(file, err);
    cachedList = [];
    cachedSignature = fileSignature(file);
    return cachedList;
  }
}

// Keep the raw bytes for manual recovery rather than deleting them outright.
function quarantineCorruptIndex(file, err) {
  const reason = err && err.message ? err.message : String(err);
  try {
    const backup = `${file}.corrupt-${Date.now()}`;
    fs.renameSync(file, backup);
    console.warn(`[gameIndex] corrupt index ${file} (${reason}); quarantined to ${backup}, starting a fresh one`);
  } catch (renameError) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* nothing else to try - the next write replaces it */
    }
    console.warn(`[gameIndex] corrupt index ${file} (${reason}); could not quarantine (${renameError.message}), overwriting`);
  }
}

function writeList() {
  if (!cachedList) return;
  if (batchDepth > 0) {
    batchDirty = true;
    return;
  }
  const file = userFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cachedList, null, 2), 'utf8');
  cachedSignature = fileSignature(file);
  batchDirty = false;
}

module.exports.has = (appid) => {
  try {
    return loadList().some((g) => String(g.appid) === String(appid));
  } catch {
    return false;
  }
};

// The stored entry for one appid, or null. Game Health reports which binary the watchdog will
// actually match this game on, which `has` alone cannot answer.
module.exports.get = (appid) => {
  try {
    const entry = loadList().find((g) => String(g.appid) === String(appid));
    return entry ? { ...entry } : null;
  } catch {
    return null;
  }
};

// The index is durable user state, unlike the schema/name caches. Library reconstruction uses this
// title while fresh metadata is unavailable, so a cache clear or offline restart does not briefly
// turn a known game back into its appid.
module.exports.getName = (appid) => {
  const entry = module.exports.get(appid);
  const name = String((entry && entry.name) || '').trim();
  return name && name !== String(appid) ? name : '';
};

function isWeakName(name, appid, binary) {
  const value = String(name || '').trim();
  if (!value || value === String(appid)) return true;
  const executable = path.basename(String(binary || '')).trim();
  const executableStem = executable.replace(/\.exe$/i, '');
  const lower = value.toLowerCase();
  return !!executable && (lower === executable.toLowerCase() || lower === executableStem.toLowerCase());
}

// Refreshes binary/name/icon so re-detection after a reinstall/move is picked up. Silently no-ops on
// any I/O error so a failure here never blocks the achievement scan.
module.exports.upsert = (entry) => {
  try {
    const list = loadList();
    const appid = String(entry.appid);
    const next = {
      appid,
      name: String(entry.name || ''),
      binary: String(entry.binary || ''),
      icon: String(entry.icon || ''),
      source: String(entry.source || ''),
      steamappid: String(entry.steamappid || ''),
      uplayId: String(entry.uplayId || ''),
      iconUrl: String(entry.iconUrl || ''),
      headerUrl: String(entry.headerUrl || ''),
      portraitUrl: String(entry.portraitUrl || ''),
      exePath: String(entry.exePath || ''),
    };
    if (!next.steamappid) delete next.steamappid;
    if (!next.uplayId) delete next.uplayId;
    if (!next.iconUrl) delete next.iconUrl;
    if (!next.headerUrl) delete next.headerUrl;
    if (!next.portraitUrl) delete next.portraitUrl;
    if (!next.exePath) delete next.exePath;
    const existing = list.find((g) => String(g.appid) === appid);
    if (existing) {
      // Metadata-only seeds (e.g. the Ubisoft Connect row that carries uplayId/steamappid) must
      // never wipe fields the generic exe-detection seed already filled.
      const shouldUpdateName =
        next.name && !(isWeakName(next.name, appid, next.binary) && !isWeakName(existing.name, appid, existing.binary));
      const changed =
        (next.binary && existing.binary !== next.binary) ||
        (shouldUpdateName && existing.name !== next.name) ||
        (next.icon && existing.icon !== next.icon) ||
        (next.source && String(existing.source || '') !== next.source) ||
        (next.steamappid && String(existing.steamappid || '') !== next.steamappid) ||
        (next.uplayId && String(existing.uplayId || '') !== next.uplayId) ||
        (next.iconUrl && String(existing.iconUrl || '') !== next.iconUrl) ||
        (next.headerUrl && String(existing.headerUrl || '') !== next.headerUrl) ||
        (next.portraitUrl && String(existing.portraitUrl || '') !== next.portraitUrl) ||
        (next.exePath && String(existing.exePath || '') !== next.exePath);
      if (!changed) return;
      if (next.binary) existing.binary = next.binary;
      // A partial/offline rebuild may know only the appid or executable. Keep the last resolved
      // title for every consumer of this shared index; real metadata can still enrich it later.
      if (shouldUpdateName) existing.name = next.name;
      if (next.icon) existing.icon = next.icon;
      if (next.source) existing.source = next.source;
      if (next.steamappid) existing.steamappid = next.steamappid;
      if (next.uplayId) existing.uplayId = next.uplayId;
      if (next.iconUrl) existing.iconUrl = next.iconUrl;
      if (next.headerUrl) existing.headerUrl = next.headerUrl;
      if (next.portraitUrl) existing.portraitUrl = next.portraitUrl;
      if (next.exePath) existing.exePath = next.exePath;
    } else {
      list.push(next);
    }
    writeList();
  } catch {
    /* non-fatal - playtime seeding is best-effort */
  }
};

// Back-compat alias.
module.exports.add = module.exports.upsert;

module.exports.remove = (appid) => {
  try {
    const key = String(appid);
    const list = loadList();
    const next = list.filter((g) => String(g.appid) !== key);
    const removed = list.length - next.length;
    if (removed === 0) return 0;
    cachedList = next;
    writeList();
    return removed;
  } catch {
    return 0;
  }
};

/*
  Several appids claiming one binary filename. Evidence settles it before names do: a row whose game
  is not in the library any more is a stale guess and loses to one that is; rows found in different
  install folders are different games and all keep the name, since the Watchdog tells them apart by
  path when one starts; only rows with nothing but a name to go on (or the same folder) compete on
  how well the title matches the file name, e.g. two Forza titles sharing an exe. Losers keep their
  identity row - dropping it instead made the next scan re-seed it, and the pair churned forever.
  Returns how many assignments were cleared.
*/
module.exports.reconcile = (games) => {
  try {
    const exeDetect = require(path.join(__dirname, 'exeDetect.js'));
    let list = loadList();
    if (list.length < 2) return 0;
    const library = Array.isArray(games) ? games : [];
    const nameByAppid = new Map(library.map((g) => [String(g.appid), g.name]));
    const exeByAppid = configuredExePaths();
    for (const g of library) if (g && g.exe && g.exeConfident && !exeByAppid.has(String(g.appid))) exeByAppid.set(String(g.appid), String(g.exe));

    const groups = new Map();
    for (const e of list) {
      const key = String(e.binary || '').toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const losers = new Set();
    const nameOf = (e) => nameByAppid.get(String(e.appid)) || e.name || '';
    for (const [, entries] of groups) {
      if (entries.length < 2) continue;
      const base = String(entries[0].binary).replace(/\.exe$/i, '');

      // An empty library means the scan found nothing, not that every game is gone.
      let contenders = entries;
      if (library.length > 0) {
        const present = entries.filter((e) => nameByAppid.has(String(e.appid)));
        if (present.length > 0 && present.length < entries.length) {
          for (const e of entries) if (!present.includes(e)) losers.add(e);
          contenders = present;
        }
      }
      if (contenders.length < 2) continue;

      const byFolder = new Map();
      const unplaced = [];
      for (const e of contenders) {
        const install = installPathOf(e, exeByAppid);
        if (!install) unplaced.push(e);
        else byFolder.set(install, (byFolder.get(install) || []).concat(e));
      }
      if (byFolder.size > 0) {
        for (const e of unplaced) losers.add(e);
        for (const same of byFolder.values()) {
          if (same.length < 2) continue;
          const best = pickBestClaim(same, base, nameOf, exeDetect.nameSimilarity);
          for (const e of same) if (e !== best) losers.add(e);
        }
      } else {
        const best = pickBestClaim(contenders, base, nameOf, exeDetect.nameSimilarity);
        for (const e of contenders) if (e !== best) losers.add(e);
      }
    }
    if (losers.size === 0) return 0;
    for (const e of losers) {
      e.binary = '';
      delete e.exePath;
    }
    cachedList = list;
    writeList();
    return losers.size;
  } catch {
    return 0;
  }
};

/*
  True when another appid already holds this binary and would keep it through reconcile(), so the
  scan never writes a losing claim for reconcile() to clear again. `exePath` is where this scan found
  the binary; a rival that launches from another folder is a different game, and both keep the name.
*/
module.exports.binaryClaimedByBetterMatch = (appid, name, binary, exePath = '') => {
  try {
    const key = String(binary || '').toLowerCase();
    if (!key) return false;
    const rivals = loadList().filter((g) => String(g.appid) !== String(appid) && String(g.binary || '').toLowerCase() === key);
    if (rivals.length === 0) return false;
    const exeByAppid = configuredExePaths();
    const mine = normalizePath(exePath);
    const exeDetect = require(path.join(__dirname, 'exeDetect.js'));
    const base = String(binary).replace(/\.exe$/i, '');
    // Any rival that would keep the binary is enough to refuse the claim.
    return rivals.some((rival) => {
      /*
        A synthetic "local-…" row is what an earlier scan wrote when it could not identify the folder
        at all. Once the same install resolves to a real Steam AppID, that placeholder is the same
        game under a worse name - it must hand the binary over instead of holding it on an equal name
        score, which is what left an identified game with no binary and therefore no playtime and no
        live process match (seen on ZOMBI, held by a "local-…" row of the identical name).
      */
      if (isPlaceholderClaim(rival.appid, rival.source) && /^\d+$/.test(String(appid))) return false;
      const theirs = installPathOf(rival, exeByAppid);
      if (mine && theirs) return mine === theirs && exeDetect.nameSimilarity(rival.name || '', base) >= exeDetect.nameSimilarity(String(name || ''), base);
      if (mine) return false; // found on disk, against a row that is only a name
      if (theirs) return true;
      return exeDetect.nameSimilarity(rival.name || '', base) >= exeDetect.nameSimilarity(String(name || ''), base);
    });
  } catch {
    return false;
  }
};

// A library scan can seed hundreds of rows. Keep those updates in memory and persist once when the
// scan finishes, while one-off UI actions retain their immediate write-through behavior.
module.exports.beginBatch = () => {
  loadList();
  batchDepth += 1;
};

module.exports.endBatch = () => {
  if (batchDepth === 0) return;
  batchDepth -= 1;
  if (batchDepth === 0 && batchDirty) writeList();
};

module.exports.withBatch = async (operation) => {
  module.exports.beginBatch();
  try {
    return await operation();
  } finally {
    module.exports.endBatch();
  }
};
