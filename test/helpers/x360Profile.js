'use strict';

/*
  Builds a synthetic Xbox 360 profile: XDBF title GPDs packed into an STFS CON container, laid out
  as Free60 documents it for a writable package (two copies of every hash table). Nothing here comes
  from a real profile.
*/

const BLOCK = 0x1000;
const HEADER_SIZE = 0x971a;
const FIRST_TABLE = 0xa000;
const PER_TABLE = 0xaa;

function utf16be(text) {
  const body = Buffer.from(String(text), 'utf16le');
  for (let i = 0; i + 1 < body.length; i += 2) [body[i], body[i + 1]] = [body[i + 1], body[i]];
  return Buffer.concat([body, Buffer.from([0, 0])]);
}

function achievementPayload({ id, name, description = '', gamerscore = 10, earnedAt = null, imageId = 0 }) {
  const head = Buffer.alloc(0x1c);
  head.writeUInt32BE(0x1c, 0);
  head.writeUInt32BE(id, 4);
  head.writeUInt32BE(imageId, 8);
  head.writeUInt32BE(gamerscore, 0x0c);
  // 0x8: shown before unlock; 0x20000: earned.
  head.writeUInt32BE(0x8 | (earnedAt ? 0x20000 : 0), 0x10);
  if (earnedAt) head.writeBigUInt64BE(BigInt(earnedAt.getTime() + 11644473600000) * 10000n, 0x14);
  return Buffer.concat([head, utf16be(name), utf16be(description), utf16be(description)]);
}

/**
 * @param {{ title: string, achievements: Array<object> }} game
 * @returns {Buffer} an XDBF title GPD
 */
function buildGpd({ title, achievements, tile = null }) {
  const entries = [
    ...achievements.map((a) => ({ namespace: 1, id: a.id, payload: achievementPayload(a) })),
    { namespace: 5, id: 0x8000, payload: utf16be(title) },
    ...(tile ? [{ namespace: 2, id: 0x8000, payload: tile }] : []),
  ];
  const header = Buffer.alloc(0x18);
  header.write('XDBF', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(entries.length, 8);
  header.writeUInt32BE(entries.length, 0x0c);
  const table = Buffer.alloc(entries.length * 0x12);
  let offset = 0;
  entries.forEach((entry, i) => {
    table.writeUInt16BE(entry.namespace, i * 0x12);
    table.writeBigUInt64BE(BigInt(entry.id), i * 0x12 + 2);
    table.writeUInt32BE(offset, i * 0x12 + 10);
    table.writeUInt32BE(entry.payload.length, i * 0x12 + 14);
    offset += entry.payload.length;
  });
  return Buffer.concat([header, table, ...entries.map((e) => e.payload)]);
}

// Backing block of data block n, for the first two level-0 tables (n < 0x154) of a writable package.
const dataBacking = (n) => (n < PER_TABLE ? n + 2 : n + 6);
const level0Backing = (n, copy) => (n < PER_TABLE ? 0 : 0xae) + copy;
const LEVEL1_BACKING = 0xac;

/**
 * Packs files into an STFS CON package. Each file names the data blocks it occupies, in order,
 * so a test can scatter a file and make the reader follow the hash chain.
 * @param {Array<{ name: string, data: Buffer, blocks: number[], consecutive?: boolean }>} files
 * @param {{ allocated?: number, fileTableBlock?: number, secondCopies?: boolean }} [options]
 *   secondCopies puts the live hash tables in the second copy, as a console that rewrote them does.
 */
function buildStfs(files, { allocated = 8, fileTableBlock = 0, secondCopies = false } = {}) {
  const topLevel = allocated > PER_TABLE ? 1 : 0;
  const lastBlock = Math.max(fileTableBlock, ...files.flatMap((f) => f.blocks));
  const backingCount = Math.max(dataBacking(lastBlock), topLevel ? 0xaf : 1) + 1;
  const buf = Buffer.alloc(FIRST_TABLE + backingCount * BLOCK);
  buf.write('CON ', 0, 'latin1');
  buf.writeUInt32BE(HEADER_SIZE, 0x340);
  const d = 0x379;
  buf[d] = 0x24;
  buf[d + 2] = secondCopies ? 2 : 0;
  buf.writeUInt16LE(1, d + 3);
  buf.writeUIntLE(fileTableBlock, d + 5, 3);
  buf.writeUInt32BE(allocated, d + 0x1c);

  const copy = secondCopies ? 1 : 0;
  // The level-1 entry of each level-0 table says which of its two copies is live (status bit 0x40).
  if (topLevel) {
    for (const table of [0, 1]) {
      buf[FIRST_TABLE + (LEVEL1_BACKING + copy) * BLOCK + table * 0x18 + 0x14] = secondCopies ? 0x40 : 0;
    }
  }
  const writeBlock = (n, bytes) => bytes.copy(buf, FIRST_TABLE + dataBacking(n) * BLOCK);
  const linkBlock = (n, next) => {
    const at = FIRST_TABLE + level0Backing(n, copy) * BLOCK + (n % PER_TABLE) * 0x18;
    buf[at + 0x14] = 0x80;
    buf.writeUIntBE(next, at + 0x15, 3);
  };

  const fileTable = Buffer.alloc(BLOCK);
  files.forEach((file, i) => {
    const at = i * 0x40;
    fileTable.write(file.name, at, 'latin1');
    fileTable[at + 0x28] = file.name.length | (file.consecutive ? 0x40 : 0);
    fileTable.writeUIntLE(file.blocks.length, at + 0x29, 3);
    fileTable.writeUIntLE(file.blocks.length, at + 0x2c, 3);
    fileTable.writeUIntLE(file.blocks[0], at + 0x2f, 3);
    fileTable.writeInt16BE(-1, at + 0x32);
    fileTable.writeUInt32BE(file.data.length, at + 0x34);
    file.blocks.forEach((n, k) => {
      writeBlock(n, file.data.subarray(k * BLOCK, (k + 1) * BLOCK));
      linkBlock(n, k + 1 < file.blocks.length ? file.blocks[k + 1] : 0xffffff);
    });
  });
  writeBlock(fileTableBlock, fileTable);
  linkBlock(fileTableBlock, 0xffffff);
  return buf;
}

module.exports = { buildGpd, buildStfs, BLOCK };
