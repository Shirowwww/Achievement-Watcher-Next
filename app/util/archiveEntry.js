'use strict';

/*
  Every archive AW extracts comes from somewhere else: a GitHub release, a community catalogue, a
  file the user picked. 7-Zip will happily write an entry named "..\..\Windows\System32\x.dll", so
  each entry is checked before anything is unpacked. A link is refused outright - the archives this
  app handles carry ordinary files, and a link is the other way out of an extraction root.
*/
function safeArchiveEntry(entry) {
  const name = String((entry && entry.file) || '').replace(/\\/g, '/');
  if (!name || name.includes('\0') || name.includes(':') || name.startsWith('/')) return false;
  if (name.split('/').some((segment) => segment === '..')) return false;
  if (/l/i.test(String((entry && entry.attributes) || ''))) return false;
  return true;
}

// The name of the first entry that is not safe to extract, or null when every entry is.
function firstUnsafeEntry(entries) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!safeArchiveEntry(entry)) return String((entry && entry.file) || '(unnamed)');
  }
  return null;
}

module.exports = { safeArchiveEntry, firstUnsafeEntry };
