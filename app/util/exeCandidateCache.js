'use strict';

/*
  Memo for the executable-candidate walk in parser/exeDetect.js. Install trees dwarf the rest of
  discovery - on one library, exe detection for 16 emulator installs read 14789 directories (77%
  of every directory read in a scan), repeated on every rescan and background poll for the same
  answer. The candidate list is a pure function of the install tree, so it's memoized per game
  folder keyed by that folder's own timestamps: installing/removing a game changes the key, an
  in-place patch keeps it. The chosen exe is still verified to exist before use (exeDetect.detect).
*/

const fs = require('fs');
const path = require('path');
const { crc32 } = require('./crc32.js');

const MAX_ENTRIES = 600;

let userDataPath = null;
let store = null;
let dirty = false;

function setUserDataPath(value) {
  if (value === userDataPath) return;
  userDataPath = value;
  store = null;
}

function cacheFile() {
  return userDataPath ? path.join(userDataPath, 'cache', 'discovery', 'exeCandidates.json') : null;
}

/*
  mtime alone isn't enough on Windows (some installers restore it after writing, while ctime still
  moves - hence both). Timestamps alone aren't enough either: a file written in the same filesystem
  tick as the capture leaves the folder looking untouched. The directory listing settles that with
  no ambiguity, and it's one cheap non-recursive readdir versus the RECURSIVE walk this memo skips.
*/
/*
  The memo holds an ALREADY FILTERED candidate list, so it is a function of the install tree AND of
  the filter rules that produced it. Without the caller's rules fingerprint in the key, shipping a
  fix to those rules changed nothing for any folder a user had already scanned - the old answer was
  served until the folder itself changed. exeDetect.js passes a fingerprint of its own filters.
*/
// A function is accepted as well as a value, and resolved on the first signature() rather than at
// the caller's module scope: the fingerprint is a hash of rules that never change while the app
// runs, and computing it eagerly pulled the hashing library into every startup that never scans.
let rulesSalt = '';
let rulesSaltSource = null;
function setRulesSalt(value) {
  if (typeof value === 'function') {
    rulesSaltSource = value;
    rulesSalt = '';
    return;
  }
  rulesSaltSource = null;
  rulesSalt = String(value || '');
}

function currentRulesSalt() {
  if (rulesSaltSource) {
    rulesSalt = String(rulesSaltSource() || '');
    rulesSaltSource = null;
  }
  return rulesSalt;
}

function signature(gameDir) {
  try {
    const stat = fs.statSync(gameDir);
    if (!stat.isDirectory()) return null;
    let listing = '';
    try {
      const names = fs.readdirSync(gameDir);
      names.sort();
      listing = `${names.length}:${crc32(names.join('\u0000')).toString(16)}`;
    } catch {
      listing = 'unreadable';
    }
    return `${currentRulesSalt()}:${Math.round(stat.mtimeMs)}:${Math.round(stat.ctimeMs)}:${listing}`;
  } catch {
    return null;
  }
}

function load() {
  if (store) return store;
  store = new Map();
  const file = cacheFile();
  if (!file) return store;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
      for (const [key, entry] of Object.entries(parsed.entries)) {
        if (entry && typeof entry.sig === 'string' && Array.isArray(entry.candidates)) store.set(key, entry);
      }
    }
  } catch {
    /* missing or unreadable memo - start empty */
  }
  return store;
}

function keyFor(gameDir) {
  return path.resolve(String(gameDir)).toLowerCase();
}

function read(gameDir) {
  const sig = signature(gameDir);
  if (!sig) return null;
  const entry = load().get(keyFor(gameDir));
  if (!entry || entry.sig !== sig) return null;
  return entry.candidates.map((candidate) => ({ ...candidate }));
}

function write(gameDir, candidates) {
  const sig = signature(gameDir);
  if (!sig || !Array.isArray(candidates)) return;
  const entries = load();
  const key = keyFor(gameDir);
  // Re-insert so the newest folders survive the size cap.
  entries.delete(key);
  entries.set(key, { sig, candidates });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  dirty = true;
}

function forget(gameDir) {
  if (!gameDir) {
    if (store && store.size > 0) dirty = true;
    store = new Map();
    return;
  }
  if (load().delete(keyFor(gameDir))) dirty = true;
}

// Called once at the end of a scan: a per-game write would put a file write inside the walk.
function flush() {
  if (!dirty) return;
  const file = cacheFile();
  if (!file) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, entries: Object.fromEntries(load()) }));
  } catch {
    /* the memo is disposable - a failed write only costs the next walk */
  }
}

module.exports = { setUserDataPath, setRulesSalt, read, write, forget, flush, signature, MAX_ENTRIES };
