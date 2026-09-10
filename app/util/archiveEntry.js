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

/*
  Writing one archive entry out, without letting the zip library touch the filesystem.

  adm-zip's own `extractAllTo`/`extractEntryTo` follow a symbolic link that already exists at the
  destination and write through it, so an attacker who can plant a link in the target folder gets an
  arbitrary file overwritten (CVE-2026-76845, GHSA-vwc7-r8mq-g2x9). There is no fixed release: the
  advisory covers every version from 0.5.9 to 0.6.0, which is the latest published.

  So nothing here asks the library to write. It hands back the entry's bytes, the destination is
  resolved and proven to stay inside the extraction root, and anything already sitting at that path -
  a link included - is removed before the write rather than followed. `fs.rmSync` unlinks the link
  itself, never its target.

  Returns the path written, or '' when the entry was refused.
*/
function writeArchiveEntry(fs, path, { name, data, root }) {
  const relative = String(name || '').replace(/\\/g, '/');
  if (!relative || relative.includes('\0') || relative.includes(':') || relative.startsWith('/')) return '';
  if (relative.split('/').some((segment) => segment === '..')) return '';
  if (!root || !Buffer.isBuffer(data)) return '';

  const destination = path.resolve(root, relative);
  const base = path.resolve(root);
  const inside = destination === base || destination.startsWith(base + path.sep);
  if (!inside) return '';

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Not an overwrite: the existing entry is unlinked first, so a link planted here is destroyed
  // rather than written through.
  fs.rmSync(destination, { force: true, recursive: false });
  fs.writeFileSync(destination, data);
  return destination;
}

module.exports = { safeArchiveEntry, firstUnsafeEntry, writeArchiveEntry };
