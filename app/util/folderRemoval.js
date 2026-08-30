'use strict';

/*
  Windows recycles through IFileOperation, and every refusal comes back as the same single line
  ("Failed to perform delete operation") whatever the cause. That is a dead end for whoever clicked:
  a game folder is usually refused because something still holds a file open, and the folder itself
  can say which one. This inspects it after a failure so the app can name the blocker instead of
  repeating the Windows sentence.
*/

const fs = require('fs');
const path = require('path');

// ERROR_SHARING_VIOLATION reaches Node as EBUSY, which is the one code that proves another process
// holds the file. EACCES/EPERM only mean "this account cannot write it", so they are reported apart.
const BUSY_CODES = new Set(['EBUSY', 'ETXTBSY']);
const DENIED_CODES = new Set(['EACCES', 'EPERM']);
// A running game holds its own binaries, so those are probed first and the walk can stop early.
const BINARY_RE = /\.(exe|dll|asi|ocx|sys|bin|node)$/i;
const DEFAULT_LIMIT = 4000;

function collectFiles(dir, limit) {
  const files = [];
  const stack = [dir];
  while (stack.length && files.length < limit) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

// A read-only file is not a permission problem: the Recycle Bin takes it, and a permanent delete
// clears the attribute itself. Only a real ACL denial is worth reporting.
function isReadOnlyAttribute(file) {
  try {
    return (fs.statSync(file).mode & 0o200) === 0;
  } catch {
    return false;
  }
}

function probe(file) {
  let handle;
  try {
    handle = fs.openSync(file, 'r+');
    return null;
  } catch (err) {
    const code = err && err.code;
    if (BUSY_CODES.has(code)) return 'busy';
    if (DENIED_CODES.has(code)) return isReadOnlyAttribute(file) ? null : 'denied';
    return null;
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        /* the probe is best effort; a handle that will not close tells us nothing */
      }
    }
  }
}

/**
 * First file of `dir` another process holds open, and the first one this account cannot write.
 * Both are null when nothing in the folder explains a failed removal.
 */
function findRemovalBlocker(dir, { limit = DEFAULT_LIMIT } = {}) {
  const result = { busy: null, denied: null };
  if (!dir || typeof dir !== 'string') return result;
  const files = collectFiles(path.resolve(dir), limit);
  const ordered = [...files.filter((file) => BINARY_RE.test(file)), ...files.filter((file) => !BINARY_RE.test(file))];
  for (const file of ordered) {
    const state = probe(file);
    if (state === 'busy') {
      result.busy = file;
      return result;
    }
    if (state === 'denied' && !result.denied) result.denied = file;
  }
  return result;
}

module.exports = { findRemovalBlocker };
