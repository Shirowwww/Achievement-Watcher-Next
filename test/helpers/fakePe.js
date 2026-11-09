'use strict';

// The smallest header app/util/pe.js accepts as a Windows program: MZ, a PE signature at e_lfanew,
// an x64 machine and the executable-image flag. `dll` sets the DLL flag; the rest is padding.
const fs = require('node:fs');
const path = require('node:path');

const PE_OFFSET = 0x40;

function peBytes(size = 128, { dll = false } = {}) {
  const buffer = Buffer.alloc(Math.max(size, PE_OFFSET + 24), 1);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(PE_OFFSET, 0x3c);
  buffer.writeUInt32LE(0x00004550, PE_OFFSET);
  buffer.writeUInt16LE(0x8664, PE_OFFSET + 4);
  buffer.writeUInt16LE(dll ? 0x2022 : 0x0022, PE_OFFSET + 22);
  return buffer;
}

function writePe(file, size, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, peBytes(size, options));
}

module.exports = { peBytes, writePe };
