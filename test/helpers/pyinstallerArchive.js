'use strict';

/*
  A PyInstaller one-file executable as its bootloader reads it: a CArchive (entries, table of
  contents, MEI cookie) appended to an exe, with a PYZ of modules. Module bodies are marshal-like
  byte strings holding string records, which is all the reader looks at.
*/
const zlib = require('node:zlib');

const COOKIE = Buffer.from([0x4d, 0x45, 0x49, 0x0c, 0x0b, 0x0a, 0x0b, 0x0e]);

const int32 = (value) => {
  const out = Buffer.alloc(4);
  out.writeInt32LE(value);
  return out;
};
const be32 = (value) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
};

// marshal: short ASCII ('z'), interned with the reference flag ('Z' | 0x80), or Unicode ('u').
function str(text, tag = 'z') {
  const body = Buffer.from(text, 'utf8');
  if (tag === 'u') return Buffer.concat([Buffer.from('u'), int32(body.length), body]);
  return Buffer.concat([Buffer.from([tag === 'Z' ? 0xda : 0x7a, body.length]), body]);
}

// A code-object-like blob: noise around the strings, as compiled code has.
function code(strings) {
  return Buffer.concat([Buffer.from([0xe3, 0, 0, 0, 0]), ...strings.map((text, index) => Buffer.concat([str(text, index % 2 ? 'Z' : 'z'), Buffer.from([0x4e, 0x29, 0x00])]))]);
}

// The PYZ table: a list of (name, (typecode, position, length)), or a dict of name -> that tuple.
function pyzToc(rows, asDict) {
  const value = (row) => Buffer.concat([Buffer.from([0x29, 3]), Buffer.from('i'), int32(0), Buffer.from('i'), int32(row.position), Buffer.from('i'), int32(row.length)]);
  if (asDict) return Buffer.concat([Buffer.from('{'), ...rows.map((row) => Buffer.concat([str(row.name), value(row)])), Buffer.from('0')]);
  return Buffer.concat([Buffer.from('['), int32(rows.length), ...rows.map((row) => Buffer.concat([Buffer.from([0x29, 2]), str(row.name), value(row)]))]);
}

function pyz(modules, asDict) {
  const parts = [];
  const rows = [];
  let position = 12;
  for (const [name, strings] of Object.entries(modules)) {
    const body = zlib.deflateSync(code(strings));
    rows.push({ name, position, length: body.length });
    parts.push(body);
    position += body.length;
  }
  return Buffer.concat([Buffer.from('PYZ\0', 'latin1'), Buffer.from([0xcb, 0x0d, 0x0d, 0x0a]), be32(position), ...parts, pyzToc(rows, asDict)]);
}

function tocEntry(offset, length, unpacked, compressed, type, name) {
  const raw = Buffer.from(`${name}\0`, 'utf8');
  const padded = Buffer.concat([raw, Buffer.alloc((16 - ((18 + raw.length) % 16)) % 16)]);
  return Buffer.concat([be32(18 + padded.length), be32(offset), be32(length), be32(unpacked), Buffer.from([compressed ? 1 : 0, type.charCodeAt(0)]), padded]);
}

// { script: [strings], modules: { name: [strings] }, asDict } -> the exe bytes.
function buildLauncher({ script, modules = {}, asDict = false, prefix = Buffer.from('MZ fake bootloader') }) {
  const entries = [
    { name: 'pyiboot01_bootstrap', type: 's', data: code(['ignored-launcher']) },
    { name: 'launcher', type: 's', data: code(script) },
    { name: 'PYZ-00.pyz', type: 'z', data: pyz(modules, asDict), stored: true },
  ];
  const parts = [];
  const toc = [];
  let offset = 0;
  for (const entry of entries) {
    const body = entry.stored ? entry.data : zlib.deflateSync(entry.data);
    toc.push(tocEntry(offset, body.length, entry.data.length, !entry.stored, entry.type, entry.name));
    parts.push(body);
    offset += body.length;
  }
  const tocBytes = Buffer.concat(toc);
  const packageLength = offset + tocBytes.length + 88;
  const cookie = Buffer.concat([COOKIE, be32(packageLength), be32(offset), be32(tocBytes.length), be32(312), Buffer.alloc(64)]);
  return Buffer.concat([prefix, ...parts, tocBytes, cookie]);
}

module.exports = { buildLauncher };
