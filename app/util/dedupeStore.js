'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { replaceFileSync, unlinkForce } = require('./replaceFile.js');

/*
  Byte-identical files in one of AW Next's own write-once stores end up sharing a single copy on
  disk through hard links.

  Every GBE restore point copies the game's emulator DLLs again: 47 restore points held 514 MB for
  49 MB of distinct content. The theme picture folder kept each re-import of one 7.3 MB wallpaper
  until themeImages.findByContent existed, and nothing removes the old copies. A hard link keeps
  every name the indexes and themes point at, so no reference changes, and deleting one restore
  point leaves the others whole.

  Only for stores nothing ever writes into in place: a write through one name would change every
  name sharing that copy. Restore points and imported theme pictures are created, read and deleted,
  never rewritten; anything regenerated in place must be kept out with `accept`.
*/

// A smaller file still occupies a whole cluster, or sits inside its MFT record: nothing to win.
const MIN_BYTES = 4096;
// Nothing linked after this many failures: the volume cannot hard-link (FAT32, exFAT, network shares).
const GIVE_UP_AFTER = 3;

async function listFiles(root, accept) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && accept(file)) files.push(file);
    }
  }
  return files;
}

async function statFile(file) {
  try {
    return await fs.promises.stat(file, { bigint: true });
  } catch {
    return null;
  }
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Groups of names that already share one file, keyed by volume and size: only files in the same
// group can possibly be identical, so everything else is never read.
async function groupBySize(files) {
  const groups = new Map();
  for (const file of files) {
    const stat = await statFile(file);
    if (!stat || stat.size < BigInt(MIN_BYTES)) continue;
    const key = `${stat.dev}:${stat.size}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const inodes = groups.get(key);
    const ino = String(stat.ino);
    if (!inodes.has(ino)) inodes.set(ino, { ino, names: [], size: Number(stat.size) });
    inodes.get(ino).names.push(file);
  }
  return groups;
}

// The copies in one size group that hold the same bytes. Each entry lists every name of one file.
async function identicalSets(inodes) {
  const byHash = new Map();
  for (const copy of inodes.values()) {
    let digest;
    try {
      digest = await hashFile(copy.names[0]);
    } catch {
      continue;
    }
    if (!byHash.has(digest)) byHash.set(digest, []);
    byHash.get(digest).push(copy);
  }
  return [...byHash.values()].filter((copies) => copies.length > 1);
}

// Points `duplicate` at the file behind `canonical`. False when the replace had to write through
// the duplicate instead (held open elsewhere): the bytes are the same either way, only not shared.
function linkOver(canonical, duplicate) {
  const temporary = `${duplicate}.aw-link-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.linkSync(canonical, temporary);
  try {
    return replaceFileSync(temporary, duplicate) !== 'overwrite';
  } catch (err) {
    unlinkForce(temporary);
    throw err;
  }
}

async function stillSameFile(file, ino) {
  const stat = await statFile(file);
  return !!stat && String(stat.ino) === ino;
}

// Points every name of `other` at `keep`, skipping a name that changed since it was hashed.
async function relink(keep, other, log) {
  let moved = 0;
  let failed = 0;
  for (const name of other.names) {
    if (!(await stillSameFile(keep.names[0], keep.ino)) || !(await stillSameFile(name, other.ino))) continue;
    try {
      if (linkOver(keep.names[0], name)) moved++;
    } catch (err) {
      failed++;
      if (log) log.log(`[dedupe] could not link ${name} => ${err.message || err}`);
    }
  }
  return { moved, failed };
}

/*
  One pass over `root`. `accept(file)` keeps a file out of the pass when it returns false. Returns
  how many names now share a copy they did not before and the bytes that gave back. Safe to run while
  another process runs the same pass: every step replaces a name with a link to identical bytes, so
  no name is ever missing or different in between.
*/
async function dedupeTree(root, { accept = () => true, log = null } = {}) {
  const result = { linked: 0, savedBytes: 0, failed: 0 };
  const groups = await groupBySize(await listFiles(root, accept));
  for (const inodes of groups.values()) {
    if (inodes.size < 2) continue;
    for (const copies of await identicalSets(inodes)) {
      // The copy with the most names stays, so the fewest names move.
      const [keep, ...others] = [...copies].sort((a, b) => b.names.length - a.names.length);
      for (const other of others) {
        const { moved, failed } = await relink(keep, other, log);
        result.linked += moved;
        result.failed += failed;
        // The bytes come back only once no name holds the old copy any more.
        if (moved === other.names.length) result.savedBytes += other.size;
        if (result.linked === 0 && result.failed >= GIVE_UP_AFTER) return result;
      }
    }
  }
  return result;
}

module.exports = { dedupeTree, MIN_BYTES };
