'use strict';

const fs = require('fs');

const ELF_MAGIC = 0x464c457f; // "\x7fELF" read little-endian
const MACHINES = { 0x3e: 'x64', 0x03: 'x86', 0xb7: 'arm64' };

// The architecture an ELF binary or library was built for, from its header: 'x64', 'x86', 'arm64' or null.
function elfArch(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(20);
    if (fs.readSync(fd, head, 0, head.length, 0) < head.length || head.readUInt32LE(0) !== ELF_MAGIC) return null;
    // e_machine follows the file's own byte order; every target listed here is little-endian.
    return MACHINES[head.readUInt16LE(18)] || null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

module.exports = { elfArch };
