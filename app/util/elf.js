'use strict';

const fs = require('fs');

const ELF_MAGIC = 0x464c457f; // "\x7fELF" read little-endian
const MACHINES = { 0x3e: 'x64', 0x03: 'x86', 0xb7: 'arm64' };

// The first `length` bytes of a file, or null when it is shorter or unreadable.
function readHead(file, length) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(length);
    return fs.readSync(fd, head, 0, length, 0) < length ? null : head;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function isElf(file) {
  const head = readHead(file, 4);
  return !!head && head.readUInt32LE(0) === ELF_MAGIC;
}

// The architecture an ELF binary or library was built for, from its header: 'x64', 'x86', 'arm64' or null.
function elfArch(file) {
  const head = readHead(file, 20);
  if (!head || head.readUInt32LE(0) !== ELF_MAGIC) return null;
  // e_machine follows the file's own byte order; every target listed here is little-endian.
  return MACHINES[head.readUInt16LE(18)] || null;
}

module.exports = { isElf, elfArch };
