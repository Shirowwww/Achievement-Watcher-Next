'use strict';

/*
  The string constants of a PyInstaller launcher (a port shipped without its .py sources), so its
  settings folder can be found the way a source launcher's is. Only the archive's own tables are
  parsed: the CArchive table of contents behind the MEI cookie, then the PYZ table (marshal lists,
  tuples, dicts, strings and ints, whose encoding no Python 3 release changed). Code objects are
  never decoded: their strings are found by scanning the marshal bytes for string records, so any
  Python version reads the same way. Nothing is run, reads are positional and bounded.
  Synchronous and dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COOKIE = Buffer.from([0x4d, 0x45, 0x49, 0x0c, 0x0b, 0x0a, 0x0b, 0x0e]);
const COOKIE_BYTES = 88;
// A signature appended after the archive moves the cookie off the very end.
const TAIL_BYTES = 1024 * 1024;
const TOC_ENTRY_HEADER = 18;
const MAX_TOC_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_PYZ_TOC_BYTES = 4 * 1024 * 1024;
const MAX_MODULES = 48;
const MAX_INFLATED_TOTAL = 16 * 1024 * 1024;
const MAX_STRING = 512;
const MAX_NODES = 200000;
const MAX_LAUNCHERS = 16;
const MAX_EXE_BYTES = 1024 * 1024 * 1024;
const PYZ_MAGIC = Buffer.from('PYZ\0', 'latin1');
// Modules no port writes itself: their strings are never the port's folders.
const FOREIGN = new Set(['os', 'sys', 're', 'json', 'pathlib', 'subprocess', 'datetime', 'time', 'typing', 'collections', 'struct', 'shutil', 'threading', 'logging', 'tkinter', 'PySide6', 'PySide2', 'PyQt5', 'PyQt6', 'encodings', 'importlib', 'email', 'http', 'urllib', 'xml', 'ctypes', 'asyncio', 'concurrent', 'unittest', 'multiprocessing', 'zipfile', 'tarfile', 'hashlib', 'uuid', 'locale', 'argparse', 'configparser', 'platform', 'socket', 'ssl', 'enum', 'functools', 'itertools', 'textwrap', 'traceback', 'tempfile', 'glob', 'fnmatch', 'math', 'random', 'base64', 'codecs', 'io', 'inspect', 'dataclasses', 'pickle', 'copy', 'string', 'warnings', 'contextlib', 'abc', 'weakref', 'queue', 'signal', 'webbrowser', 'pyimod01_archive', 'pyimod02_importers', 'pyimod03_ctypes', 'pyimod04_pywin32']);

function readAt(fd, position, length) {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const count = fs.readSync(fd, buffer, read, length - read, position + read);
    if (count === 0) throw new Error('truncated archive');
    read += count;
  }
  return buffer;
}

// The CArchive behind the cookie: { start, entries: [{ name, offset, length, unpacked, compressed, type }] }.
function carchive(fd, size) {
  const tailStart = Math.max(0, size - TAIL_BYTES);
  const tail = readAt(fd, tailStart, size - tailStart);
  const at = tail.lastIndexOf(COOKIE);
  if (at < 0 || at + COOKIE_BYTES > tail.length) return null;
  const packageLength = tail.readUInt32BE(at + 8);
  const tocOffset = tail.readUInt32BE(at + 12);
  const tocLength = tail.readUInt32BE(at + 16);
  const start = tailStart + at + COOKIE_BYTES - packageLength;
  if (start < 0 || tocLength > MAX_TOC_BYTES || tocOffset + tocLength > packageLength) return null;
  const toc = readAt(fd, start + tocOffset, tocLength);
  const entries = [];
  for (let pos = 0; pos + TOC_ENTRY_HEADER <= toc.length; ) {
    const entryLength = toc.readUInt32BE(pos);
    if (entryLength < TOC_ENTRY_HEADER || pos + entryLength > toc.length) break;
    const entry = { offset: toc.readUInt32BE(pos + 4), length: toc.readUInt32BE(pos + 8), unpacked: toc.readUInt32BE(pos + 12), compressed: toc[pos + 16] === 1, type: String.fromCharCode(toc[pos + 17]) };
    entry.name = toc.toString('utf8', pos + TOC_ENTRY_HEADER, pos + entryLength).replace(/\0+$/, '');
    if (entry.offset + entry.length <= tocOffset) entries.push(entry);
    pos += entryLength;
  }
  return { start, entries };
}

function inflate(data, budget) {
  const limit = Math.min(MAX_ENTRY_BYTES, budget.left);
  if (limit <= 0) throw new Error('archive budget spent');
  const out = zlib.inflateSync(data, { maxOutputLength: limit });
  budget.left -= out.length;
  return out;
}

const PRINTABLE = /^[\x20-\x7e\u00a0-\uffff]+$/;
const LENGTH_TAGS = new Set(['a', 'A', 'u', 't']);

/*
  Every string record in marshal bytes: short ASCII ('z', 'Z', a length byte) and ASCII, interned or
  Unicode ('a', 'A', 't', 'u', a 32-bit length), the 0x80 reference flag ignored.
*/
function marshalStrings(buffer, into) {
  for (let i = 0; i < buffer.length - 1; i++) {
    const tag = String.fromCharCode(buffer[i] & 0x7f);
    let start = -1;
    let length = 0;
    if (tag === 'z' || tag === 'Z') {
      start = i + 2;
      length = buffer[i + 1];
    } else if (LENGTH_TAGS.has(tag) && i + 5 <= buffer.length) {
      start = i + 5;
      length = buffer.readInt32LE(i + 1);
    }
    if (start < 0 || length < 2 || length > MAX_STRING || start + length > buffer.length) continue;
    const text = buffer.toString('utf8', start, start + length);
    if (!PRINTABLE.test(text) || Buffer.byteLength(text) !== length) continue;
    into.add(text);
    i = start + length - 1;
  }
  return into;
}

// A marshal reader for the PYZ table only: containers, strings and ints, nothing executable.
function readMarshal(buffer) {
  let at = 0;
  let nodes = 0;
  const refs = [];
  const int32 = () => {
    const value = buffer.readInt32LE(at);
    at += 4;
    return value;
  };
  const take = (length) => {
    if (length < 0 || at + length > buffer.length) throw new Error('marshal out of bounds');
    at += length;
    return buffer.subarray(at - length, at);
  };
  const read = (depth) => {
    if (depth > 16 || ++nodes > MAX_NODES) throw new Error('marshal too deep');
    const code = take(1)[0];
    const type = String.fromCharCode(code & 0x7f);
    const slot = code & 0x80 ? refs.push(null) - 1 : -1;
    const value = readValue(type, depth, { int32, take, read, refs });
    if (slot >= 0) refs[slot] = value;
    return value;
  };
  return read(0);
}

function readValue(type, depth, io) {
  if (type === 'N') return null;
  if (type === 'T') return true;
  if (type === 'F') return false;
  if (type === 'i') return io.int32();
  if (type === 'r') return io.refs[io.int32()] ?? null;
  if (type === 'z' || type === 'Z') return io.take(io.take(1)[0]).toString('utf8');
  if ('aAtus'.includes(type)) return io.take(io.int32()).toString(type === 's' ? 'latin1' : 'utf8');
  if (type === 'l') {
    const digits = io.int32();
    let value = 0;
    for (let i = 0; i < Math.min(Math.abs(digits), 4); i++) value += io.take(2).readUInt16LE() * 2 ** (15 * i);
    if (Math.abs(digits) > 4) io.take(2 * (Math.abs(digits) - 4));
    return digits < 0 ? -value : value;
  }
  if (type === '(' || type === '[' || type === ')' || type === '<' || type === '>') {
    const count = type === ')' ? io.take(1)[0] : io.int32();
    if (count < 0 || count > MAX_NODES) throw new Error('marshal container too large');
    return Array.from({ length: count }, () => io.read(depth + 1));
  }
  if (type === '{') {
    const pairs = [];
    for (let key = io.read(depth + 1); key !== '\u0000END'; key = io.read(depth + 1)) pairs.push([key, io.read(depth + 1)]);
    return pairs;
  }
  if (type === '0') return '\u0000END';
  throw new Error(`marshal type ${JSON.stringify(type)} is not a table`);
}

// The PYZ table as name -> { position, length }, from a list of pairs or a dict.
function pyzTable(fd, base, entry) {
  const header = readAt(fd, base, 12);
  if (!header.subarray(0, 4).equals(PYZ_MAGIC)) return null;
  const tocPosition = header.readUInt32BE(8);
  if (tocPosition < 12 || tocPosition >= entry.length || entry.length - tocPosition > MAX_PYZ_TOC_BYTES) return null;
  const rows = readMarshal(readAt(fd, base + tocPosition, entry.length - tocPosition));
  const table = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const [name, info] = Array.isArray(row) ? row : [];
    if (typeof name !== 'string' || !Array.isArray(info) || info.length < 3) continue;
    const [, position, length] = info;
    if (Number.isInteger(position) && Number.isInteger(length) && position >= 12 && length >= 0 && position + length <= tocPosition) table.set(name, { position, length });
  }
  return table;
}

const foreign = (name) => FOREIGN.has(name.split('.')[0]);

// Entry scripts first, then the PYZ modules they name (and those modules name), within the budgets.
function archiveStrings(fd, size) {
  const archive = carchive(fd, size);
  if (!archive) return null;
  const strings = new Set();
  const budget = { left: MAX_INFLATED_TOTAL };
  const body = (entry) => {
    if (entry.length > MAX_ENTRY_BYTES) throw new Error('archive entry too large');
    const data = readAt(fd, archive.start + entry.offset, entry.length);
    return entry.compressed ? inflate(data, budget) : data;
  };
  for (const entry of archive.entries) if (entry.type === 's' && !entry.name.startsWith('pyi')) marshalStrings(body(entry), strings);
  const pyz = archive.entries.find((entry) => entry.type === 'z' || entry.type === 'Z');
  const table = pyz ? pyzTable(fd, archive.start + pyz.offset, pyz) : null;
  const done = new Set();
  for (let pass = 0; table && pass < MAX_MODULES; pass++) {
    const next = [...strings].find((name) => table.has(name) && !done.has(name) && !foreign(name));
    if (!next || budget.left <= 0) break;
    done.add(next);
    const row = table.get(next);
    if (row.length > MAX_ENTRY_BYTES) continue;
    marshalStrings(inflate(readAt(fd, archive.start + pyz.offset + row.position, row.length), budget), strings);
  }
  return strings;
}

// The archive's strings kept per file while it is unchanged.
const cache = new Map();

function launcherStrings(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return [];
  }
  if (!stat.isFile() || stat.size < COOKIE_BYTES || stat.size > MAX_EXE_BYTES) return [];
  const stamp = `${file}|${stat.size}|${stat.mtimeMs}`;
  if (!cache.has(stamp)) {
    let fd;
    let strings = null;
    try {
      fd = fs.openSync(file, 'r');
      strings = archiveStrings(fd, stat.size);
    } catch {
      strings = null;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    cache.set(stamp, strings ? [...strings] : []);
  }
  return cache.get(stamp);
}

// The strings of every PyInstaller executable directly in `root`.
function compiledLauncherStrings(root) {
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name)).map((entry) => entry.name);
  } catch {
    return [];
  }
  return names.slice(0, MAX_LAUNCHERS).flatMap((name) => launcherStrings(path.join(root, name)));
}

module.exports = { launcherStrings, compiledLauncherStrings, readMarshal };
