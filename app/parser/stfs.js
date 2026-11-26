'use strict';

/*
  Read-only reader for Xbox 360 STFS packages (CON, LIVE, PIRS), the container a console profile
  is stored in. Layout from the Free60 wiki and Velocity's StfsPackage: a header, then 4 KiB data
  blocks interleaved with hash tables; each hash entry carries the next block of a file. Only what
  listing and extracting files needs is read; nothing is ever verified or written.
*/

const BLOCK_SIZE = 0x1000;
const HASH_ENTRY_SIZE = 0x18;
const BLOCKS_PER_TABLE = 0xaa;
const BLOCKS_PER_L1 = 0x70e4;
const FILE_ENTRY_SIZE = 0x40;
const NO_BLOCK = 0xffffff;
const MAGICS = new Set(['CON ', 'LIVE', 'PIRS']);
const STFS_DESCRIPTOR_SIZE = 0x24;

const int24le = (buf, at) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
const int24be = (buf, at) => (buf[at] << 16) | (buf[at + 1] << 8) | buf[at + 2];

function readHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 0x3a0) return null;
  if (!MAGICS.has(buf.toString('latin1', 0, 4))) return null;
  const headerSize = buf.readUInt32BE(0x340);
  const d = 0x379;
  // An SVOD descriptor (games on demand) has another size and layout; only STFS is read here.
  if (buf[d] !== STFS_DESCRIPTOR_SIZE) return null;
  const blockSeparation = buf[d + 2];
  const allocated = buf.readUInt32BE(d + 0x1c);
  // Read-only packages keep one copy of each hash table; writable ones (profiles) keep two.
  const sex = ~blockSeparation & 1;
  const header = {
    blockSeparation,
    sex,
    fileTableBlockCount: buf.readUInt16LE(d + 3),
    fileTableBlock: int24le(buf, d + 5),
    allocated,
    firstTable: (headerSize + 0xfff) & ~0xfff,
    step0: sex ? 0xac : 0xab,
    step1: sex ? 0x723a : 0x718f,
    topLevel: allocated <= BLOCKS_PER_TABLE ? 0 : allocated <= BLOCKS_PER_L1 ? 1 : 2,
  };
  return header.firstTable < buf.length ? header : null;
}

function dataBlockNumber(h, block) {
  const base = (((block + BLOCKS_PER_TABLE) / BLOCKS_PER_TABLE | 0) << h.sex) + block;
  if (block < BLOCKS_PER_TABLE) return base;
  const withL1 = base + (((block + BLOCKS_PER_L1) / BLOCKS_PER_L1 | 0) << h.sex);
  return block < BLOCKS_PER_L1 ? withL1 : withL1 + (1 << h.sex);
}

function level0TableBlock(h, block) {
  if (block < BLOCKS_PER_TABLE) return 0;
  const num = (block / BLOCKS_PER_TABLE | 0) * h.step0 + (((block / BLOCKS_PER_L1 | 0) + 1) << h.sex);
  return (block / BLOCKS_PER_L1 | 0) === 0 ? num : num + (1 << h.sex);
}

function level1TableBlock(h, block) {
  return block < BLOCKS_PER_L1 ? h.step0 : (1 << h.sex) + (block / BLOCKS_PER_L1 | 0) * h.step1;
}

const blockOffset = (h, block) => dataBlockNumber(h, block) * BLOCK_SIZE + h.firstTable;
const tableOffset = (h, tableBlock) => tableBlock * BLOCK_SIZE + h.firstTable;

// Which of the two copies of a level-0 table is current is told by the table above it.
function hashEntryOffset(buf, h, block) {
  const at = tableOffset(h, level0TableBlock(h, block)) + (block % BLOCKS_PER_TABLE) * HASH_ENTRY_SIZE;
  if (h.topLevel === 0) return at + ((h.blockSeparation & 2) << 0xb);
  const topCopy = (h.blockSeparation & 2) << 0xb;
  if (h.topLevel === 1) {
    const l1 = tableOffset(h, level1TableBlock(h, 0)) + topCopy + (block / BLOCKS_PER_TABLE | 0) * HASH_ENTRY_SIZE;
    return l1 + 0x14 < buf.length ? at + ((buf[l1 + 0x14] & 0x40) << 6) : -1;
  }
  return -1; // shortcut: level-2 trees (packages over 115 MB) are not read; profiles never get there.
}

function nextBlock(buf, h, block) {
  const at = hashEntryOffset(buf, h, block);
  if (at < 0 || at + HASH_ENTRY_SIZE > buf.length) return NO_BLOCK;
  return int24be(buf, at + 0x15);
}

// The blocks of a chain, stopping at a loop, an end marker or a block outside the package.
function blockChain(buf, h, start, count, consecutive) {
  const blocks = [];
  let block = start;
  const seen = new Set();
  while (blocks.length < count && block < h.allocated && !seen.has(block)) {
    seen.add(block);
    blocks.push(block);
    block = consecutive ? block + 1 : nextBlock(buf, h, block);
  }
  return blocks;
}

function readBlocks(buf, h, blocks, size) {
  const out = Buffer.alloc(size);
  let written = 0;
  for (const block of blocks) {
    if (written >= size) break;
    const at = blockOffset(h, block);
    const take = Math.min(BLOCK_SIZE, size - written, Math.max(0, buf.length - at));
    if (take <= 0) break;
    buf.copy(out, written, at, at + take);
    written += take;
  }
  return written === size ? out : null;
}

function parseEntry(table, at, index) {
  const flags = table[at + 0x28];
  const nameLength = flags & 0x3f;
  if (!nameLength) return null;
  return {
    index,
    name: table.toString('latin1', at, at + Math.min(nameLength, 0x28)),
    directory: (flags & 0x80) !== 0,
    consecutive: (flags & 0x40) !== 0,
    blockCount: int24le(table, at + 0x29),
    startBlock: int24le(table, at + 0x2f),
    parent: table.readInt16BE(at + 0x32),
    size: table.readUInt32BE(at + 0x34),
  };
}

function readFileTable(buf, h) {
  const blocks = blockChain(buf, h, h.fileTableBlock, h.fileTableBlockCount, false);
  const table = readBlocks(buf, h, blocks, blocks.length * BLOCK_SIZE);
  if (!table) return [];
  const entries = [];
  for (let i = 0; i * FILE_ENTRY_SIZE < table.length; i += 1) {
    const entry = parseEntry(table, i * FILE_ENTRY_SIZE, i);
    if (entry) entries.push(entry);
  }
  return entries;
}

function entryPath(entry, byIndex) {
  const parts = [entry.name];
  let parent = entry.parent;
  for (let depth = 0; parent >= 0 && depth < 32; depth += 1) {
    const dir = byIndex.get(parent);
    if (!dir) break;
    parts.unshift(dir.name);
    parent = dir.parent;
  }
  return parts.join('/');
}

/**
 * Lists the files of an STFS package and gives a reader for each.
 * @param {Buffer} buf the whole package
 * @returns {{ files: Array<{ path: string, size: number, read: () => (Buffer|null) }> } | null}
 */
function openPackage(buf) {
  const h = readHeader(buf);
  if (!h) return null;
  const entries = readFileTable(buf, h);
  const byIndex = new Map(entries.map((e) => [e.index, e]));
  const files = entries.filter((e) => !e.directory).map((e) => ({
    path: entryPath(e, byIndex),
    size: e.size,
    read: () => readBlocks(buf, h, blockChain(buf, h, e.startBlock, e.blockCount, e.consecutive), e.size),
  }));
  return { files };
}

module.exports = { openPackage };
