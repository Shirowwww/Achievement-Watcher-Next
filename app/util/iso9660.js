'use strict';

/*
  A read-only ISO 9660 reader for the few small files a game is recognised by (PARAM.SFO, a
  TROPHY.TRP) inside a disc image. It opens the image, reads only the sectors it needs and never
  writes. Names are matched without case and without the ';1' version; a file split over several
  extents (over 4 GiB) is not read. Dependency-free: the Watchdog loads it through sharedAppModule.
*/

const fs = require('fs');

const SECTOR = 2048;
const DESCRIPTORS_AT = 16;
const MAX_DESCRIPTORS = 32;
const MAGIC = 'CD001';
const PRIMARY = 1;
const TERMINATOR = 255;
const ROOT_RECORD_AT = 156;
const MIN_RECORD = 34;
const DIRECTORY_FLAG = 0x02;
const MULTI_EXTENT_FLAG = 0x80;
const MAX_DIRECTORY_BYTES = 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_DEPTH = 8;

function readAt(fd, offset, length) {
  const buffer = Buffer.alloc(length);
  const read = fs.readSync(fd, buffer, 0, length, offset);
  return read === length ? buffer : null;
}

// The root directory of the primary volume descriptor, or null when the image is not ISO 9660.
function rootOf(fd, size) {
  for (let index = 0; index < MAX_DESCRIPTORS; index++) {
    const descriptor = readAt(fd, (DESCRIPTORS_AT + index) * SECTOR, SECTOR);
    if (!descriptor || descriptor.toString('latin1', 1, 6) !== MAGIC) return null;
    if (descriptor[0] === TERMINATOR) return null;
    if (descriptor[0] !== PRIMARY) continue;
    const blockSize = descriptor.readUInt16LE(128);
    if (blockSize !== SECTOR) return null;
    const root = recordAt(descriptor, ROOT_RECORD_AT, size);
    return root && root.isDirectory ? root : null;
  }
  return null;
}

// One directory record, or null when it is cut, points outside the image, or names nothing.
function recordAt(buffer, at, size) {
  const length = buffer[at];
  if (length < MIN_RECORD || at + length > buffer.length) return null;
  const nameLength = buffer[at + 32];
  if (33 + nameLength > length) return null;
  const extent = buffer.readUInt32LE(at + 2);
  const bytes = buffer.readUInt32LE(at + 10);
  if (extent * SECTOR + bytes > size) return null;
  const flags = buffer[at + 25];
  const raw = buffer.toString('latin1', at + 33, at + 33 + nameLength);
  return { name: raw.replace(/;\d+$/, '').replace(/\.$/, ''), raw, extent, bytes, isDirectory: (flags & DIRECTORY_FLAG) !== 0, split: (flags & MULTI_EXTENT_FLAG) !== 0, length };
}

// The entries of a directory, '.' and '..' left out. A record never crosses a sector: a zero length pads to the next.
function entriesOf(fd, directory, size) {
  if (directory.bytes > MAX_DIRECTORY_BYTES) return [];
  const body = readAt(fd, directory.extent * SECTOR, directory.bytes);
  if (!body) return [];
  const entries = [];
  let at = 0;
  while (at < body.length && entries.length < MAX_ENTRIES) {
    if (body[at] === 0) {
      at = (Math.floor(at / SECTOR) + 1) * SECTOR;
      continue;
    }
    const record = recordAt(body, at, size);
    if (!record) break;
    if (record.raw !== '\0' && record.raw !== '\x01') entries.push(record);
    at += record.length;
  }
  return entries;
}

// The record at `inner` ('PS3_GAME/TROPDIR'), or null when a part is missing.
function find(fd, size, inner) {
  const parts = String(inner || '')
    .split(/[\\/]+/)
    .filter(Boolean);
  if (parts.length > MAX_DEPTH) return null;
  let current = rootOf(fd, size);
  for (const part of parts) {
    if (!current || !current.isDirectory) return null;
    const wanted = part.toUpperCase();
    current = entriesOf(fd, current, size).find((entry) => entry.name.toUpperCase() === wanted) || null;
  }
  return current;
}

// Runs `read(fd, size)` on a regular file (never a link); null when it cannot be opened.
function withImage(image, read) {
  let fd = null;
  try {
    const stat = fs.lstatSync(image);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    fd = fs.openSync(image, 'r');
    return read(fd, stat.size);
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

// [{ name, isDirectory, bytes }] of the folder at `inner`, or null when the image or the folder is not there.
function listDirectory(image, inner) {
  return withImage(image, (fd, size) => {
    const directory = find(fd, size, inner);
    if (!directory || !directory.isDirectory) return null;
    return entriesOf(fd, directory, size).map(({ name, isDirectory, bytes }) => ({ name, isDirectory, bytes }));
  });
}

// The bytes of the file at `inner`, or null when it is missing, a folder, split, or over `max` bytes.
function readFile(image, inner, max) {
  return withImage(image, (fd, size) => {
    const file = find(fd, size, inner);
    if (!file || file.isDirectory || file.split || file.bytes > max) return null;
    return readAt(fd, file.extent * SECTOR, file.bytes);
  });
}

module.exports = { listDirectory, readFile, SECTOR };
