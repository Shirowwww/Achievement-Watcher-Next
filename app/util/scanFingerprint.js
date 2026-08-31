'use strict';

/*
  "Is the library on disk still exactly what the last scan built?"

  A full scan costs seconds per launch (discovery walk plus one metadata/unlock load per game), and
  almost every launch rebuilds a library that did not change. This answers the same question with a
  handful of stat() calls: the directories the discovery walk visited, plus the achievement data
  files each listed game was parsed from.

  Two halves, because a directory mtime and a file mtime prove different things:
    - dirs  - a game installed or removed moves the mtime of the folder holding it, so the dir half
              answers "did the set of games change?".
    - files - writing an unlock rewrites the save file in place and leaves its folder untouched, so
              the file half answers "did any progress change while we were away?".

  Blind to sources with no file behind them: Xbox PC and the official Epic library answer from a
  service, and Steam progress made on another PC lands in no local file either. (Ubisoft Connect is
  NOT one of them - ubisoftOfficial reports the folder holding its spool file, which is covered
  above.) A caller must therefore still cap how long it trusts a match - see LIBRARY_REUSE_TTL_MS
  in app.js.
*/

const fs = require('fs');
const path = require('path');

const MISSING = -1;

// Every file a directory-shaped data path holds, one level deep: emulator saves put the unlock file
// straight in the folder, and a deeper walk would cost more than the scan this avoids.
function filesInDirectory(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

// [path, mtimeMs] for each file, MISSING for one that is not there: a file that appears later (the
// first unlock of a game that had none) has to read as a change, so absence is recorded, not skipped.
function captureFiles(files) {
  const seen = new Set();
  const entries = [];
  for (const file of files || []) {
    const key = String(file).toLowerCase();
    if (!file || seen.has(key)) continue;
    seen.add(key);
    let stats = null;
    try {
      stats = fs.statSync(file);
    } catch {
      entries.push([String(file), MISSING]);
      continue;
    }
    if (stats.isDirectory()) {
      for (const inner of filesInDirectory(file)) {
        const innerKey = inner.toLowerCase();
        if (seen.has(innerKey)) continue;
        seen.add(innerKey);
        try {
          entries.push([inner, fs.statSync(inner).mtimeMs]);
        } catch {
          entries.push([inner, MISSING]);
        }
      }
      // The folder itself too: a save file deleted between runs shows up here and nowhere else.
      entries.push([String(file), stats.mtimeMs]);
      continue;
    }
    entries.push([String(file), stats.mtimeMs]);
  }
  return entries;
}

// Directories, in the shape dirFingerprint.capture() produces. A directory that is gone is dropped
// rather than recorded: unlike a save file, a folder that disappears has nothing to compare against.
function captureDirs(dirs) {
  const entries = [];
  for (const dir of dirs || []) {
    try {
      entries.push([String(dir), fs.statSync(dir).mtimeMs]);
    } catch {
      // Gone already: nothing to compare it against next time.
    }
  }
  return entries;
}

function capture({ dirs, files } = {}) {
  return { dirs: captureDirs(dirs), files: captureFiles(files) };
}

function entriesMatch(entries) {
  for (const [target, recorded] of entries) {
    let current;
    try {
      current = fs.statSync(target).mtimeMs;
    } catch {
      current = MISSING;
    }
    if (current !== recorded) return false;
  }
  return true;
}

// False as soon as one entry differs, so the sweep stops at the first difference. An empty or
// malformed fingerprint proves nothing and therefore never matches.
function matches(fingerprint) {
  if (!fingerprint || !Array.isArray(fingerprint.dirs) || !Array.isArray(fingerprint.files)) return false;
  if (fingerprint.dirs.length === 0) return false;
  return entriesMatch(fingerprint.dirs) && entriesMatch(fingerprint.files);
}

function size(fingerprint) {
  if (!fingerprint) return 0;
  return (fingerprint.dirs || []).length + (fingerprint.files || []).length;
}

module.exports = { MISSING, capture, captureDirs, captureFiles, matches, size };
