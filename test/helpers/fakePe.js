'use strict';

// The smallest header app/util/pe.js accepts as a Windows program: MZ, a PE signature at e_lfanew,
// an x64 machine and the executable-image flag. `dll` sets the DLL flag; the rest is padding.
const crypto = require('node:crypto');
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

/*
  A dll carrying an Authenticode-shaped certificate table: the signer text and the sha256 digest of
  the image, the two things pe.isValveSignedImage looks for. `body` makes copies differ; `tamper`
  changes one byte after signing, as a crack patching a signed dll would.
*/
function signedPe({ signer = 'CN=Valve Corp.', body = 'steam_api', tamper = false, digest = 'sha256' } = {}) {
  const optAt = PE_OFFSET + 24;
  const entry = optAt + 112 + 4 * 8;
  const payload = Buffer.from(String(body), 'latin1');
  const image = Buffer.alloc(0x200 + payload.length + ((8 - ((0x200 + payload.length) % 8)) % 8));
  image.write('MZ', 0, 'latin1');
  image.writeUInt32LE(PE_OFFSET, 0x3c);
  image.writeUInt32LE(0x00004550, PE_OFFSET);
  image.writeUInt16LE(0x8664, PE_OFFSET + 4);
  image.writeUInt16LE(240, PE_OFFSET + 20);
  image.writeUInt16LE(0x2022, PE_OFFSET + 22);
  image.writeUInt16LE(0x20b, optAt);
  image.writeUInt32LE(16, optAt + 108);
  payload.copy(image, 0x200);
  const hash = crypto.createHash(digest);
  hash.update(image.subarray(0, optAt + 64));
  hash.update(image.subarray(optAt + 68, entry));
  hash.update(image.subarray(entry + 8));
  const content = Buffer.concat([Buffer.from(`0\u0082${signer}\u0000`, 'latin1'), hash.digest()]);
  const cert = Buffer.alloc(8 + content.length);
  cert.writeUInt32LE(cert.length, 0);
  cert.writeUInt16LE(0x0200, 4);
  cert.writeUInt16LE(0x0002, 6);
  content.copy(cert, 8);
  image.writeUInt32LE(image.length, entry);
  image.writeUInt32LE(cert.length, entry + 4);
  const out = Buffer.concat([image, cert]);
  if (tamper) out[0x200] ^= 0xff;
  return out;
}

// An unsigned dll whose section table lists `names` (empty sections): what pe.readSectionNames reads.
function peWithSections(names) {
  const optAt = PE_OFFSET + 24;
  const tableAt = optAt + 240;
  const buffer = Buffer.alloc(tableAt + names.length * 40 + 16);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(PE_OFFSET, 0x3c);
  buffer.writeUInt32LE(0x00004550, PE_OFFSET);
  buffer.writeUInt16LE(0x8664, PE_OFFSET + 4);
  buffer.writeUInt16LE(names.length, PE_OFFSET + 6);
  buffer.writeUInt16LE(240, PE_OFFSET + 20);
  buffer.writeUInt16LE(0x2022, PE_OFFSET + 22);
  buffer.writeUInt16LE(0x20b, optAt);
  names.forEach((name, index) => buffer.write(name, tableAt + index * 40, 8, 'latin1'));
  return buffer;
}

// A dll whose export directory names `exports`, in one '.rdata' section: what pe.readExportNames reads.
function peWithExports(exports) {
  const optAt = PE_OFFSET + 24;
  const tableAt = optAt + 240;
  const names = exports.map((name) => Buffer.from(`${name}\0`, 'latin1'));
  const pointersAt = 40;
  const namesAt = pointersAt + names.length * 4;
  const rawSize = namesAt + names.reduce((total, name) => total + name.length, 0);
  const buffer = Buffer.alloc(SECTION_RAW + rawSize);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(PE_OFFSET, 0x3c);
  buffer.writeUInt32LE(0x00004550, PE_OFFSET);
  buffer.writeUInt16LE(0x8664, PE_OFFSET + 4);
  buffer.writeUInt16LE(1, PE_OFFSET + 6);
  buffer.writeUInt16LE(240, PE_OFFSET + 20);
  buffer.writeUInt16LE(0x2022, PE_OFFSET + 22);
  buffer.writeUInt16LE(0x20b, optAt);
  buffer.writeUInt32LE(16, optAt + 108);
  buffer.writeUInt32LE(SECTION_RVA, optAt + 112);
  buffer.writeUInt32LE(rawSize, optAt + 116);
  buffer.write('.rdata', tableAt, 'latin1');
  buffer.writeUInt32LE(rawSize, tableAt + 8);
  buffer.writeUInt32LE(SECTION_RVA, tableAt + 12);
  buffer.writeUInt32LE(rawSize, tableAt + 16);
  buffer.writeUInt32LE(SECTION_RAW, tableAt + 20);
  buffer.writeUInt32LE(names.length, SECTION_RAW + 24);
  buffer.writeUInt32LE(SECTION_RVA + pointersAt, SECTION_RAW + 32);
  let nameAt = namesAt;
  names.forEach((name, index) => {
    buffer.writeUInt32LE(SECTION_RVA + nameAt, SECTION_RAW + pointersAt + index * 4);
    name.copy(buffer, SECTION_RAW + nameAt);
    nameAt += name.length;
  });
  return buffer;
}

function writeSignedPe(file, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, signedPe(options));
}

module.exports = { peBytes, writePe, peWithImports, peWithSections, peWithExports, signedPe, writeSignedPe };
