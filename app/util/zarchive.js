'use strict';

/*
  Read-only reader for ZArchive (.zar, https://github.com/Exzap/ZArchive), the format KytyPS5 runs
  game dumps from without extracting them: 64 KiB blocks compressed with zstd, then a file tree and
  a name table, all located by a footer at the end of the file. Big-endian throughout.

  Synchronous and dependency-free on purpose: the Watchdog loads it through sharedAppModule.
*/

const fs = require('fs');
const zlib = require('zlib');

const BLOCK_SIZE = 64 * 1024;
const BLOCKS_PER_RECORD = 16;
const RECORD_SIZE = 8 + 2 * BLOCKS_PER_RECORD;
const ENTRY_SIZE = 16;
const FOOTER_SIZE = 6 * 16 + 32 + 8 + 4 + 4;
const MAGIC = 0x169f52d6;
const VERSION_1 = 0x61bf3a01;
const NO_NAME = 0x7fffffff;
// The tree and name table are read whole: a few MB for a full game, so anything past this is not one.
const MAX_TABLE_BYTES = 64 * 1024 * 1024;

function readAt(fd, offset, length) {
  const buffer = Buffer.alloc(length);
  if (fs.readSync(fd, buffer, 0, length, offset) !== length) throw new Error('truncated archive');
  return buffer;
}

// Section i of the footer as { offset, size }, refused when it points past the file or is too large to load.
function section(footer, index, fileSize, maxSize = Infinity) {
  const offset = Number(footer.readBigUInt64BE(index * 16));
  const size = Number(footer.readBigUInt64BE(index * 16 + 8));
  if (offset + size > fileSize || size > maxSize) throw new Error('bad archive section');
  return { offset, size };
}

function readArchive(fd) {
  const fileSize = fs.fstatSync(fd).size;
  if (fileSize <= FOOTER_SIZE) return null;
  const footer = readAt(fd, fileSize - FOOTER_SIZE, FOOTER_SIZE);
  if (footer.readUInt32BE(FOOTER_SIZE - 4) !== MAGIC || footer.readUInt32BE(FOOTER_SIZE - 8) !== VERSION_1) return null;
  if (Number(footer.readBigUInt64BE(FOOTER_SIZE - 16)) !== fileSize) return null;

  const data = section(footer, 0, fileSize);
  const recordsSection = section(footer, 1, fileSize, MAX_TABLE_BYTES);
  const namesSection = section(footer, 2, fileSize, MAX_TABLE_BYTES);
  const treeSection = section(footer, 3, fileSize, MAX_TABLE_BYTES);
  if (recordsSection.size === 0 || recordsSection.size % RECORD_SIZE || treeSection.size === 0 || treeSection.size % ENTRY_SIZE) return null;
  const records = readAt(fd, recordsSection.offset, recordsSection.size);
  const names = readAt(fd, namesSection.offset, namesSection.size);
  const tree = readAt(fd, treeSection.offset, treeSection.size);
  const nodeCount = tree.length / ENTRY_SIZE;

  const node = (index) => {
    const at = index * ENTRY_SIZE;
    const head = tree.readUInt32BE(at);
    const low = tree.readUInt32BE(at + 4);
    const second = tree.readUInt32BE(at + 8);
    const high = tree.readUInt32BE(at + 12);
    return {
      isFile: head >>> 31 === 1,
      nameOffset: head & NO_NAME,
      // A file: offset and size, each with 16 more bits in `high`. A folder: its first child and count.
      offset: low + (high & 0xffff) * 2 ** 32,
      size: second + (high >>> 16) * 2 ** 32,
      first: low,
      count: second,
    };
  };

  const nameOf = (offset) => {
    if (offset === NO_NAME || offset >= names.length) return '';
    let length = names[offset] & 0x7f;
    let start = offset + 1;
    if (names[offset] & 0x80) {
      if (offset + 1 >= names.length) return '';
      length |= names[offset + 1] << 7;
      start = offset + 2;
    }
    return start + length > names.length ? '' : names.toString('utf8', start, start + length);
  };

  const children = (dir) => {
    if (dir.isFile || dir.first + dir.count > nodeCount) return [];
    const list = [];
    for (let i = dir.first; i < dir.first + dir.count; i++) list.push(node(i));
    return list;
  };

  // Names compare without case, as the archive's own lookup does.
  const lookup = (innerPath) => {
    let current = node(0);
    for (const part of String(innerPath || '').split(/[\\/]+/).filter(Boolean)) {
      const wanted = part.toLowerCase();
      current = children(current).find((child) => nameOf(child.nameOffset).toLowerCase() === wanted);
      if (!current) return null;
    }
    return current;
  };

  let cached = { index: -1, block: null };
  const block = (index) => {
    if (cached.index === index) return cached.block;
    const record = Math.floor(index / BLOCKS_PER_RECORD);
    if (record * RECORD_SIZE >= records.length) throw new Error('block out of range');
    const at = record * RECORD_SIZE;
    let offset = Number(records.readBigUInt64BE(at));
    for (let i = 0; i < index % BLOCKS_PER_RECORD; i++) offset += records.readUInt16BE(at + 8 + i * 2) + 1;
    const compressed = records.readUInt16BE(at + 8 + (index % BLOCKS_PER_RECORD) * 2) + 1;
    if (offset + compressed > data.size) throw new Error('block out of range');
    const raw = readAt(fd, data.offset + offset, compressed);
    // A block that would not shrink is stored as it is.
    const decoded = compressed === BLOCK_SIZE ? raw : zlib.zstdDecompressSync(raw, { maxOutputLength: BLOCK_SIZE });
    if (decoded.length !== BLOCK_SIZE) throw new Error('bad block');
    cached = { index, block: decoded };
    return decoded;
  };

  return {
    // [{ name, isFile, size }] for the folder at innerPath, [] when it is missing or a file.
    entries(innerPath) {
      const dir = lookup(innerPath);
      if (!dir || dir.isFile) return [];
      return children(dir).map((child) => ({ name: nameOf(child.nameOffset), isFile: child.isFile, size: child.isFile ? child.size : 0 }));
    },
    isFile(innerPath) {
      const entry = lookup(innerPath);
      return !!entry && entry.isFile;
    },
    // The file's bytes, or null when it is missing, a folder or larger than maxBytes.
    read(innerPath, maxBytes) {
      const entry = lookup(innerPath);
      if (!entry || !entry.isFile || entry.size > maxBytes) return null;
      const out = Buffer.alloc(entry.size);
      for (let done = 0; done < entry.size; ) {
        const raw = entry.offset + done;
        const within = raw % BLOCK_SIZE;
        const step = Math.min(entry.size - done, BLOCK_SIZE - within);
        block(Math.floor(raw / BLOCK_SIZE)).copy(out, done, within, within + step);
        done += step;
      }
      return out;
    },
  };
}

/*
  Runs use(archive) on the archive at `file` and returns its result, or null when the file is not a
  readable ZArchive. A damaged archive costs only itself.
*/
function withArchive(file, use) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const archive = readArchive(fd);
    return archive ? use(archive) : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { withArchive };
