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

const SECTION_RVA = 0x1000;
const SECTION_RAW = 0x200;
const DESCRIPTOR = 20;

// A program whose import directory names `imports`, in one section: what pe.readImportNames reads.
function peWithImports(imports, { pe32 = false } = {}) {
  const sizeOptHdr = pe32 ? 224 : 240;
  const dirOff = pe32 ? 96 : 112;
  const optAt = PE_OFFSET + 24;
  const tableAt = optAt + sizeOptHdr;
  const descriptors = (imports.length + 1) * DESCRIPTOR;
  const names = imports.map((name) => Buffer.from(`${name}\0`, 'latin1'));
  const rawSize = descriptors + names.reduce((total, name) => total + name.length, 0);
  const buffer = Buffer.alloc(SECTION_RAW + rawSize);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(PE_OFFSET, 0x3c);
  buffer.writeUInt32LE(0x00004550, PE_OFFSET);
  buffer.writeUInt16LE(pe32 ? 0x014c : 0x8664, PE_OFFSET + 4);
  buffer.writeUInt16LE(1, PE_OFFSET + 6);
  buffer.writeUInt16LE(sizeOptHdr, PE_OFFSET + 20);
  buffer.writeUInt16LE(0x0022, PE_OFFSET + 22);
  buffer.writeUInt16LE(pe32 ? 0x10b : 0x20b, optAt);
  buffer.writeUInt32LE(SECTION_RVA, optAt + dirOff + 8);
  buffer.writeUInt32LE(descriptors, optAt + dirOff + 12);
  buffer.write('.idata', tableAt, 'latin1');
  buffer.writeUInt32LE(rawSize, tableAt + 8);
  buffer.writeUInt32LE(SECTION_RVA, tableAt + 12);
  buffer.writeUInt32LE(rawSize, tableAt + 16);
  buffer.writeUInt32LE(SECTION_RAW, tableAt + 20);
  let nameAt = descriptors;
  names.forEach((name, index) => {
    buffer.writeUInt32LE(SECTION_RVA + nameAt, SECTION_RAW + index * DESCRIPTOR + 12);
    name.copy(buffer, SECTION_RAW + nameAt);
    nameAt += name.length;
  });
  return buffer;
}

function writePe(file, size, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, peBytes(size, options));
}

module.exports = { peBytes, writePe, peWithImports };
