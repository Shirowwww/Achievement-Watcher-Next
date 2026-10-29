'use strict';

/*
  Scan-scoped directory-listing memo. One discovery pass reads the same folders repeatedly
  (goldberg's walk, appid search, exeDetect, detectEmulator's dll search each call readdirSync
  separately) - on a 16-emulator library that was 7618 readdirSync calls for 1544 distinct
  directories. Off unless a scope is open, so nothing outside discovery ever serves a stale
  listing (emulator repairs must keep seeing the real folder).
*/

const fs = require('fs');
const path = require('path');
const { pathKey } = require(path.join(__dirname, 'winHosts.js'));

// Case-insensitive on Windows only: on Linux, Game and game are two folders with two listings.
const keyOf = (dir) => (dir ? pathKey(dir) : '');

let depth = 0;
let entriesCache = null;
let namesCache = null;
let visitedDirs = null;
// Keys already in visitedDirs: a folder an untracked reader listed first is still recorded when a
// tracked walk asks for it from the memo, and recorded once.
let trackedKeys = null;
// Listings read ahead of the walk by prefetch(). Kept apart from entriesCache so that readdir()
// still records each one as visited when the walk asks for it, and only then.
let prefetched = null;

function beginScope() {
  depth += 1;
  if (depth === 1) {
    entriesCache = new Map();
    namesCache = new Map();
    visitedDirs = [];
    trackedKeys = new Set();
    prefetched = new Map();
  }
}

function endScope() {
  if (depth === 0) return;
  depth -= 1;
  if (depth === 0) {
    entriesCache = null;
    namesCache = null;
    trackedKeys = null;
    prefetched = null;
    // visitedDirs is deliberately kept: the caller reads it after the scope closes.
  }
}

function isActive() {
  return depth > 0;
}

// Tracked directories read during the last scope, in visit order. Used to fingerprint what a scan
// looked at.
function lastVisitedDirs() {
  return visitedDirs || [];
}

/*
  Dirent[] for a readable directory, null otherwise (callers distinguish "empty" from "gone").
  `track: false` excludes a dir from lastVisitedDirs() without skipping the memo: the executable
  search walks whole game trees, which can't tell a new game appeared (that shows up in the
  library/save root, which the discovery walk visits itself).
*/
function readdir(dir, { track = true } = {}) {
  const key = keyOf(dir);
  let result;
  if (entriesCache && entriesCache.has(key)) result = entriesCache.get(key);
  else {
    if (prefetched && prefetched.has(key)) {
      result = prefetched.get(key);
      prefetched.delete(key);
    } else {
      try {
        result = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        result = null;
      }
    }
    if (entriesCache) entriesCache.set(key, result);
  }
  if (entriesCache && result && track && !trackedKeys.has(key)) {
    trackedKeys.add(key);
    visitedDirs.push(String(dir));
  }
  return result;
}

function readdirNames(dir) {
  const key = keyOf(dir);
  if (namesCache && namesCache.has(key)) return namesCache.get(key);
  let result;
  const entries = readdir(dir);
  result = entries ? entries.map((entry) => entry.name) : null;
  if (namesCache) namesCache.set(key, result);
  return result;
}

/*
  Reads `dirs` concurrently, ahead of a walk that will ask for them one by one. Each synchronous
  readdir pays the whole round trip through the filesystem filters alone, so the walk spent seconds
  on listings it could have had in parallel; the previous scan's folders are the ones it will read.
  Inside an open scope only. Resolves to how many listings were read.
*/
async function prefetch(dirs, { concurrency = 32 } = {}) {
  const cache = entriesCache;
  const ahead = prefetched;
  if (!cache || !ahead || !Array.isArray(dirs)) return 0;
  const queue = [...new Set(dirs.map(String))].filter((dir) => dir && !cache.has(keyOf(dir)) && !ahead.has(keyOf(dir)));
  let next = 0;
  const worker = async () => {
    while (next < queue.length && prefetched === ahead) {
      const dir = queue[next++];
      let result;
      try {
        result = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        result = null;
      }
      // The scope may have closed while this read was in flight: then the walk is over.
      if (prefetched === ahead) ahead.set(keyOf(dir), result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return queue.length;
}

// Run `fn` with the memo open. Nested scopes share one cache and only the outermost clears it.
async function withScope(fn) {
  beginScope();
  try {
    return await fn();
  } finally {
    endScope();
  }
}

module.exports = { beginScope, endScope, isActive, lastVisitedDirs, prefetch, readdir, readdirNames, withScope };
