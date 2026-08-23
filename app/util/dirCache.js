'use strict';

/*
  Scan-scoped directory-listing memo. One discovery pass reads the same folders repeatedly
  (goldberg's walk, appid search, exeDetect, detectEmulator's dll search each call readdirSync
  separately) - on a 16-emulator library that was 7618 readdirSync calls for 1544 distinct
  directories, all on the renderer's thread. Off unless a scope is open, so nothing outside
  discovery ever serves a stale listing (emulator repairs must keep seeing the real folder).
*/

const fs = require('fs');

let depth = 0;
let entriesCache = null;
let namesCache = null;
let visitedDirs = null;

function beginScope() {
  depth += 1;
  if (depth === 1) {
    entriesCache = new Map();
    namesCache = new Map();
    visitedDirs = [];
  }
}

function endScope() {
  if (depth === 0) return;
  depth -= 1;
  if (depth === 0) {
    entriesCache = null;
    namesCache = null;
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
  const key = String(dir).toLowerCase();
  if (entriesCache && entriesCache.has(key)) return entriesCache.get(key);
  let result;
  try {
    result = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    result = null;
  }
  if (entriesCache) {
    entriesCache.set(key, result);
    if (result && track) visitedDirs.push(String(dir));
  }
  return result;
}

function readdirNames(dir) {
  const key = String(dir).toLowerCase();
  if (namesCache && namesCache.has(key)) return namesCache.get(key);
  let result;
  const entries = readdir(dir);
  result = entries ? entries.map((entry) => entry.name) : null;
  if (namesCache) namesCache.set(key, result);
  return result;
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

module.exports = { beginScope, endScope, isActive, lastVisitedDirs, readdir, readdirNames, withScope };
