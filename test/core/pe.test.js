'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pe = require(path.join(__dirname, '..', '..', 'app', 'util', 'pe.js'));

// Minimal valid PE header with a chosen machine type (0x8664 x64, 0x014c x86).
function fakePE(machine) {
  const buf = Buffer.alloc(0x100, 0);
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(0x80, 0x3c); // e_lfanew → PE header at 0x80
  buf.writeUInt32LE(0x00004550, 0x80); // 'PE\0\0'
  buf.writeUInt16LE(machine, 0x84); // COFF Machine
  return buf;
}

// PE with a section table (to exercise SteamStub's ".bind" detection).
function fakePEWithSections(sections) {
  const buf = Buffer.alloc(0x400, 0);
  const peOff = 0x80;
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(peOff, 0x3c);
  buf.writeUInt32LE(0x00004550, peOff); // 'PE\0\0'
  buf.writeUInt16LE(0x8664, peOff + 4); // machine
  buf.writeUInt16LE(sections.length, peOff + 6); // NumberOfSections
  const sizeOpt = 0xe0;
  buf.writeUInt16LE(sizeOpt, peOff + 20); // SizeOfOptionalHeader
  const tableOff = peOff + 24 + sizeOpt;
  sections.forEach((name, i) => buf.write(name, tableOff + i * 40, 8, 'latin1'));
  return buf;
}

// A VS_VERSIONINFO block: children start on a DWORD boundary, wLength leaves out the trailing pad.
function versionBlock(key, value, wValueLength, type, children = []) {
  const pad = (buf) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  let body = pad(Buffer.concat([Buffer.alloc(6), Buffer.from(`${key}\0`, 'utf16le')]));
  body = Buffer.concat([body, value]);
  for (const child of children) body = Buffer.concat([pad(body), child]);
  body.writeUInt16LE(body.length, 0);
  body.writeUInt16LE(wValueLength, 2);
  body.writeUInt16LE(type, 4);
  return body;
}

function versionString(key, text) {
  return versionBlock(key, Buffer.from(`${text}\0`, 'utf16le'), text.length + 1, 1);
}

// A PE32+ whose only section is .rsrc, holding RT_VERSION id 1 in language 1033.
function fakePEWithVersion(strings) {
  const fixed = Buffer.alloc(52);
  fixed.writeUInt32LE(0xfeef04bd, 0);
  const table = versionBlock('040904b0', Buffer.alloc(0), 0, 1, strings.map(([k, v]) => versionString(k, v)));
  const info = versionBlock('VS_VERSION_INFO', fixed, 52, 0, [versionBlock('StringFileInfo', Buffer.alloc(0), 0, 1, [table])]);

  const rsrcRva = 0x1000;
  const rsrc = Buffer.alloc(0x60 + info.length);
  const dirEntry = (at, id, target) => {
    rsrc.writeUInt16LE(1, at + 14);
    rsrc.writeUInt32LE(id, at + 16);
    rsrc.writeUInt32LE(target, at + 20);
  };
  dirEntry(0x00, 16, (0x80000000 | 0x18) >>> 0);
  dirEntry(0x18, 1, (0x80000000 | 0x30) >>> 0);
  dirEntry(0x30, 1033, 0x48);
  rsrc.writeUInt32LE(rsrcRva + 0x60, 0x48);
  rsrc.writeUInt32LE(info.length, 0x4c);
  info.copy(rsrc, 0x60);

  const peOff = 0x80;
  const sizeOpt = 0xf0;
  const rawPtr = 0x400;
  const buf = Buffer.alloc(rawPtr + rsrc.length);
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(peOff, 0x3c);
  buf.writeUInt32LE(0x00004550, peOff);
  buf.writeUInt16LE(0x8664, peOff + 4);
  buf.writeUInt16LE(1, peOff + 6);
  buf.writeUInt16LE(sizeOpt, peOff + 20);
  buf.writeUInt16LE(0x20b, peOff + 24);
  buf.writeUInt32LE(rsrcRva, peOff + 24 + 112 + 16);
  buf.writeUInt32LE(rsrc.length, peOff + 24 + 112 + 20);
  const section = peOff + 24 + sizeOpt;
  buf.write('.rsrc', section, 8, 'latin1');
  buf.writeUInt32LE(rsrc.length, section + 8);
  buf.writeUInt32LE(rsrcRva, section + 12);
  buf.writeUInt32LE(rsrc.length, section + 16);
  buf.writeUInt32LE(rawPtr, section + 20);
  rsrc.copy(buf, rawPtr);
  return buf;
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pe-'));
try {
  // exeArch reads the PE machine type.
  const x64exe = path.join(temp, 'g64.exe');
  const x86exe = path.join(temp, 'g86.exe');
  fs.writeFileSync(x64exe, fakePE(0x8664));
  fs.writeFileSync(x86exe, fakePE(0x014c));
  fs.writeFileSync(path.join(temp, 'notpe.txt'), 'hello');
  assert.strictEqual(pe.exeArch(x64exe), 'x64', 'x64 machine type detected');
  assert.strictEqual(pe.exeArch(x86exe), 'x86', 'x86 machine type detected');
  assert.strictEqual(pe.exeArch(path.join(temp, 'notpe.txt')), null, 'non-PE → null');
  assert.strictEqual(pe.exeArch(path.join(temp, 'does-not-exist.exe')), null, 'missing file → null');

  // SteamStub DRM detection via the ".bind" section.
  const stubExe = path.join(temp, 'stub.exe');
  const cleanExe = path.join(temp, 'clean.exe');
  fs.writeFileSync(stubExe, fakePEWithSections(['.text', '.rdata', '.bind']));
  fs.writeFileSync(cleanExe, fakePEWithSections(['.text', '.rdata', '.data']));
  assert.strictEqual(pe.detectSteamStub(stubExe), true, 'SteamStub (.bind) detected');
  assert.strictEqual(pe.detectSteamStub(cleanExe), false, 'no false positive on a clean exe');
  assert.strictEqual(pe.detectSteamStub(path.join(temp, 'notpe.txt')), false, 'non-PE → false');
  assert.strictEqual(pe.detectSteamStub(path.join(temp, 'does-not-exist.exe')), false, 'missing file → false');

  // readExeProductName parses the VS_VERSIONINFO resource of real PEs.
  const realExes = [
    process.env['WINDIR'] ? path.join(process.env['WINDIR'], 'System32', 'notepad.exe') : '',
    process.env['WINDIR'] ? path.join(process.env['WINDIR'], 'explorer.exe') : '',
    path.join(__dirname, '..', '..', 'app', 'dist', 'win-unpacked', 'Achievement Watcher.exe'),
  ].filter((p) => p && fs.existsSync(p));
  for (const exe of realExes) {
    const product = pe.readExeProductName(exe);
    if (!product) throw new Error(`readExeProductName returned empty for ${exe}`);
  }
  assert.strictEqual(pe.readExeProductName(path.join(temp, 'notpe.txt')), '');
  assert.strictEqual(pe.readExeProductName(path.join(temp, 'does-not-exist.exe')), '');

  // "Activision" is 11 UTF-16 units with its null, so CompanyName ends off a DWORD boundary and the
  // next string starts after two bytes of padding (Modern Warfare 4's sp26-cod.exe).
  const padded = path.join(temp, 'padded.exe');
  fs.writeFileSync(padded, fakePEWithVersion([['CompanyName', 'Activision'], ['FileDescription', 'Call of Duty: Modern Warfare 4 SP']]));
  assert.strictEqual(pe.readExeProductName(padded), 'Call of Duty: Modern Warfare 4 SP', 'strings after a padded one are still read');

  // readExeFileVersion parses the VS_FIXEDFILEINFO numeric quad of real PEs (used to match a GOG
  // Galaxy SDK dll against a UniverseLAN release - see gogUniverseLan.js).
  for (const exe of realExes) {
    const version = pe.readExeFileVersion(exe);
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error(`readExeFileVersion returned "${version}" for ${exe}`);
  }
  assert.strictEqual(pe.readExeFileVersion(path.join(temp, 'notpe.txt')), '');
  assert.strictEqual(pe.readExeFileVersion(path.join(temp, 'does-not-exist.exe')), '');

  console.log('PASS: pe util (exeArch machine type + SteamStub .bind detection)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
