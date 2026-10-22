'use strict';

/*
  The trophy files of a PS4 game dump: trophy<NN>.trp, npbind.dat (each set's NP id) and param.sfo.
  ESFM is AES-128-CBC keyed by the NP id, zero padded and encrypted under the trophy key with a zero
  IV; the file's first 16 bytes are its IV. Nothing read is ever run. Synchronous and
  dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// The public retail trophy key (psdevwiki, "Trophy00.trp"); a trophy.key beside the port replaces it.
const RETAIL_TROPHY_KEY = '21F41A6BAD8A1D3ECA7AD586C101B7A9';

const TRP_MAGIC = 0xdca24d00;
const TRP_HEADER_SIZE = 0x60;
const TRP_ENTRY_MIN = 0x40;
const TRP_ENTRY_MAX = 0x1000;
const TRP_MAX_ENTRIES = 4096;
const TRP_NAME_SIZE = 32;
const NPBIND_MAGIC = 0xd294a018;
const NPBIND_HEADER_SIZE = 0x80;
const NPBIND_MAX_ENTRIES = 100;
const SFO_MAGIC = 0x46535000;
const SFO_MAX_ENTRIES = 1024;

const MAX_TRP_BYTES = 128 * 1024 * 1024;
const MAX_SMALL_BYTES = 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_ICON_SIDE = 2048;
const MAX_TROPHIES = 2048;
// A real <trophy> tag carries four short attributes.
const MAX_ATTRIBUTES_LENGTH = 512;
// A trophy icon is a 240x240 PNG of a few dozen KB; past these, a set is crafted to fill the
// memory or the icon cache.
const MAX_ICON_BYTES = 1024 * 1024;
const MAX_ICONS_TOTAL_BYTES = 64 * 1024 * 1024;

const NPCOMMID_RE = /^NPWR\d{5}_\d{2}$/;
const DOCUMENT_RE = /^TROP(?:_(\d{2}))?\.(XML|SFM|ESFM)$/i;
const ICON_RE = /^TROP(\d{3,4})\.PNG$/i;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GRADES = new Set(['P', 'G', 'S', 'B']);

// The console's system language codes (TROP_<nn>.XML) onto AW's Steam language names.
const LANGUAGE_BY_CODE = {
  '00': 'japanese', '01': 'english', '02': 'french', '03': 'spanish', '04': 'german', '05': 'italian',
  '06': 'dutch', '07': 'portuguese', '08': 'russian', '09': 'koreana', '10': 'tchinese', '11': 'schinese',
  '12': 'finnish', '13': 'swedish', '14': 'danish', '15': 'norwegian', '16': 'polish', '17': 'brazilian',
  '18': 'english', '19': 'turkish', '20': 'latam', '21': 'arabic', '22': 'french', '23': 'czech',
  '24': 'hungarian', '25': 'greek', '26': 'romanian', '27': 'thai', '28': 'vietnamese', '29': 'indonesian',
  '30': 'ukrainian',
};
// US English and France French first: the UK and Canadian files only fill what those lack.
const SECONDARY_CODES = new Set(['18', '22']);

// A regular file no larger than `max`, never through a link; null otherwise.
function readBounded(file, max) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

function entryName(buffer, at) {
  const raw = buffer.subarray(at, at + TRP_NAME_SIZE);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? TRP_NAME_SIZE : end).toString('latin1');
}

// The named entries of a trophy container, or null when it is not one; an entry out of bounds voids it.
function readTrp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < TRP_HEADER_SIZE || buffer.readUInt32BE(0) !== TRP_MAGIC) return null;
  const count = buffer.readUInt32BE(16);
  const stride = buffer.readUInt32BE(20);
  if (count > TRP_MAX_ENTRIES || stride < TRP_ENTRY_MIN || stride > TRP_ENTRY_MAX) return null;
  if (TRP_HEADER_SIZE + count * stride > buffer.length) return null;
  const files = new Map();
  for (let index = 0; index < count; index++) {
    const at = TRP_HEADER_SIZE + index * stride;
    const offset = Number(buffer.readBigUInt64BE(at + 32));
    const size = Number(buffer.readBigUInt64BE(at + 40));
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || size > MAX_ENTRY_BYTES || offset + size > buffer.length) return null;
    const name = entryName(buffer, at).toUpperCase();
    if (files.has(name)) return null;
    files.set(name, buffer.subarray(offset, offset + size));
  }
  return files;
}

function deriveKey(npcommid, keyHex) {
  const identity = Buffer.alloc(16);
  identity.write(npcommid, 'ascii');
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(keyHex, 'hex'), Buffer.alloc(16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(identity), cipher.final()]);
}

// The XML inside a TROP.ESFM, or '' when the key or the NP id is wrong.
function decryptEsfm(buffer, npcommid, keyHex = RETAIL_TROPHY_KEY) {
  if (!NPCOMMID_RE.test(String(npcommid || '')) || !/^[0-9a-f]{32}$/i.test(String(keyHex || ''))) return '';
  if (!Buffer.isBuffer(buffer) || buffer.length < 32 || buffer.length % 16 !== 0) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', deriveKey(npcommid, keyHex), buffer.subarray(0, 16));
    decipher.setAutoPadding(false);
    const text = Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString('utf8');
    const xml = text.slice(0, text.lastIndexOf('>') + 1);
    return /<trophyconf\b/.test(xml) && /<\/trophyconf\s*>/.test(xml) ? xml : '';
  } catch {
    return '';
  }
}

/*
  The NP id a set's ESFM was encrypted with, when npbind.dat cannot tell it: a dump unpacked from a
  .pkg can keep that file encrypted. Every NPWRnnnnn_00 is tried on the first block, which opens
  with an XML declaration under the right one: 0.5s at worst, so the caller caches the answer.
*/
const NPCOMMID_SEARCH_LIMIT = 100000;
const XML_OPENING = /^\s*<(?:\?xml|!--|trophyconf\b)/;

function findNpcommid(files, keyHex = RETAIL_TROPHY_KEY) {
  if (!(files instanceof Map) || !/^[0-9a-f]{32}$/i.test(String(keyHex || ''))) return '';
  const name = [...files.keys()].find((entry) => /\.ESFM$/i.test(entry));
  const esfm = name && files.get(name);
  if (!Buffer.isBuffer(esfm) || esfm.length < 32) return '';
  const key = Buffer.from(keyHex, 'hex');
  for (let number = 0; number < NPCOMMID_SEARCH_LIMIT; number++) {
    const npcommid = `NPWR${String(number).padStart(5, '0')}_00`;
    const identity = Buffer.alloc(16);
    identity.write(npcommid, 'ascii');
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(false);
    const decipher = crypto.createDecipheriv('aes-128-cbc', cipher.update(identity), esfm.subarray(0, 16));
    decipher.setAutoPadding(false);
    if (XML_OPENING.test(decipher.update(esfm.subarray(16, 32)).toString('latin1')) && decryptEsfm(esfm, npcommid, keyHex)) return npcommid;
  }
  return '';
}

// A service label is a big-endian u32 in npbind.dat; some tools write it as ASCII digits instead.
function serviceLabel(value) {
  const text = value.toString('latin1').replace(/\0/g, '').trim();
  if (/^\d{1,2}$/.test(text)) return Number(text);
  return value.length === 4 ? value.readUInt32BE(0) : -1;
}

function readBindingEntry(buffer, start, end) {
  let at = start;
  let npcommid = '';
  let label = -1;
  while (at + 4 <= end) {
    const type = buffer.readUInt16BE(at);
    const size = buffer.readUInt16BE(at + 2);
    if (type < 0x10 || type > 0x13 || at + 4 + size > end) break;
    const value = buffer.subarray(at + 4, at + 4 + size);
    if (type === 0x10) npcommid = value.toString('latin1').replace(/\0.*$/s, '');
    if (type === 0x11) label = serviceLabel(value);
    at += 4 + size;
  }
  return NPCOMMID_RE.test(npcommid) && label >= 0 && label < 100 ? { npcommid, label } : null;
}

// trophy set slot -> NP communication id, from npbind.dat.
function readNpbind(buffer) {
  const result = new Map();
  if (!Buffer.isBuffer(buffer) || buffer.length < NPBIND_HEADER_SIZE || buffer.readUInt32BE(0) !== NPBIND_MAGIC) return result;
  const entrySize = Number(buffer.readBigUInt64BE(0x10));
  const count = Number(buffer.readBigUInt64BE(0x18));
  if (!Number.isSafeInteger(count) || count > NPBIND_MAX_ENTRIES || entrySize < 4 || entrySize > 4096) return result;
  for (let index = 0; index < count; index++) {
    const start = NPBIND_HEADER_SIZE + index * entrySize;
    if (start + entrySize > buffer.length) break;
    const binding = readBindingEntry(buffer, start, start + entrySize);
    if (binding && !result.has(binding.label)) result.set(binding.label, binding.npcommid);
  }
  return result;
}

// TITLE, TITLE_ID and CONTENT_ID from param.sfo; {} when it is not one.
function readSfo(buffer) {
  const result = {};
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.readUInt32LE(0) !== SFO_MAGIC) return result;
  const keys = buffer.readUInt32LE(8);
  const values = buffer.readUInt32LE(12);
  const count = buffer.readUInt32LE(16);
  if (count > SFO_MAX_ENTRIES || 20 + count * 16 > buffer.length) return result;
  for (let index = 0; index < count; index++) {
    const at = 20 + index * 16;
    const keyAt = keys + buffer.readUInt16LE(at);
    const length = buffer.readUInt32LE(at + 4);
    const valueAt = values + buffer.readUInt32LE(at + 12);
    if (keyAt >= buffer.length || valueAt + length > buffer.length) return {};
    const keyEnd = buffer.indexOf(0, keyAt);
    if (keyEnd < 0 || keyEnd - keyAt > 64) return {};
    const key = buffer.subarray(keyAt, keyEnd).toString('latin1');
    if (key === 'TITLE' || key === 'TITLE_ID' || key === 'CONTENT_ID') {
      result[key] = buffer.subarray(valueAt, valueAt + length).toString('utf8').replace(/\0.*$/s, '').trim();
    }
  }
  return result;
}

// A PNG whose header says it is one, of a size a trophy icon can be.
function isTrophyPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.length > MAX_ENTRY_BYTES) return false;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.readUInt32BE(8) !== 13 || buffer.toString('latin1', 12, 16) !== 'IHDR') return false;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 && width <= MAX_ICON_SIDE && height <= MAX_ICON_SIDE;
}

// CDATA sections unwrapped by an index scan: a lazy regex rescans to the end for every unclosed one.
function unwrapCdata(text) {
  let out = '';
  let at = 0;
  for (;;) {
    const start = text.indexOf('<![CDATA[', at);
    const end = start < 0 ? -1 : text.indexOf(']]>', start + 9);
    if (end < 0) return out + text.slice(at);
    out += text.slice(at, start) + text.slice(start + 9, end);
    at = end + 3;
  }
}

function decodeXml(text) {
  return unwrapCdata(String(text || ''))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function safeCodePoint(value) {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
}

function attribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

// The text of the first <tag>, found by two forward searches so a crafted file costs linear time.
function childText(body, tag) {
  const open = new RegExp(`<${tag}>`, 'i').exec(body);
  if (!open) return '';
  const start = open.index + open[0].length;
  const close = new RegExp(`</${tag}>`, 'gi');
  close.lastIndex = start;
  const end = close.exec(body);
  return end ? decodeXml(body.slice(start, end.index)) : '';
}

/*
  One TROPCONF document as { title, npcommid, trophies: [{ id, grade, hidden, name, detail }] }, or
  null. A document declaring a DTD or an entity is refused outright: nothing here expands one.
*/
function parseTrophyXml(text) {
  const xml = String(text || '');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/<trophyconf\b/i.test(xml)) return null;
  const trophies = [];
  const seen = new Set();
  // Each element is found by forward searches only; `[^<>]` keeps an unclosed tag from being
  // rescanned to the end of the file once per later tag.
  const open = /<trophy\b([^<>]*)>/gi;
  const close = /<\/trophy>/gi;
  let match;
  while ((match = open.exec(xml)) && trophies.length < MAX_TROPHIES) {
    close.lastIndex = open.lastIndex;
    const end = close.exec(xml);
    if (!end) break;
    const attrs = match[1];
    const body = xml.slice(open.lastIndex, end.index);
    open.lastIndex = close.lastIndex;
    if (attrs.length > MAX_ATTRIBUTES_LENGTH) continue;
    const rawId = attribute(attrs, 'id');
    const grade = attribute(attrs, 'ttype').toUpperCase();
    if (!/^\d{1,4}$/.test(rawId) || !GRADES.has(grade)) continue;
    const id = String(Number(rawId));
    if (seen.has(id)) continue;
    seen.add(id);
    trophies.push({ id, grade, hidden: /^yes$/i.test(attribute(attrs, 'hidden')), name: childText(body, 'name'), detail: childText(body, 'detail') });
  }
  if (trophies.length === 0) return null;
  return { title: childText(xml, 'title-name'), npcommid: childText(xml, 'npcommid'), trophies };
}

/*
  The trophies.tsv a port's runtime writes itself: "#key<TAB>value" header lines (#title), then one
  "id<TAB>grade<TAB>hidden<TAB>name<TAB>detail" line per trophy. Same shape as parseTrophyXml.
*/
function parseTrophyTsv(text) {
  const trophies = [];
  const seen = new Set();
  let title = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const fields = line.split('\t');
    if (fields[0] === '#title') title = (fields[1] || '').trim();
    if (fields.length < 4 || !/^\d{1,4}$/.test(fields[0]) || trophies.length >= MAX_TROPHIES) continue;
    const id = String(Number(fields[0]));
    const grade = fields[1].trim().toUpperCase();
    if (!GRADES.has(grade) || seen.has(id)) continue;
    seen.add(id);
    trophies.push({ id, grade, hidden: /^(?:1|yes|true)$/i.test(fields[2].trim()), name: fields[3].trim(), detail: (fields[4] || '').trim() });
  }
  return trophies.length > 0 ? { title, npcommid: '', trophies } : null;
}

// The language a TROP document is written in: '' for the set's default (TROP.XML), else AW's name.
function languageOfDocument(name) {
  const match = DOCUMENT_RE.exec(String(name || ''));
  if (!match) return null;
  return match[1] ? LANGUAGE_BY_CODE[match[1]] || null : '';
}

function documentText(name, body, npcommid, keyHex) {
  if (/\.ESFM$/i.test(name)) return decryptEsfm(body, npcommid, keyHex);
  const text = body.toString('utf8');
  return text.slice(0, text.lastIndexOf('>') + 1);
}

/*
  The documents and icons of one container. Documents are keyed by language ('' = the default),
  secondary regional files only filling a language the primary one left out.
*/
function readContainer(files, npcommid, keyHex) {
  const documents = new Map();
  const icons = new Map();
  let iconBytes = 0;
  const names = [...files.keys()].sort((a, b) => Number(isSecondary(a)) - Number(isSecondary(b)));
  for (const name of names) {
    const icon = ICON_RE.exec(name);
    if (icon) {
      const image = files.get(name);
      if (!isTrophyPng(image) || image.length > MAX_ICON_BYTES || iconBytes + image.length > MAX_ICONS_TOTAL_BYTES) continue;
      iconBytes += image.length;
      icons.set(String(Number(icon[1])), image);
      continue;
    }
    const language = languageOfDocument(name);
    if (language === null || documents.has(language)) continue;
    const parsed = parseTrophyXml(documentText(name, files.get(name), npcommid, keyHex));
    if (parsed) documents.set(language, parsed);
  }
  const icon0 = files.get('ICON0.PNG');
  return { documents, icons, icon0: isTrophyPng(icon0) ? icon0 : null };
}

function isSecondary(name) {
  const match = DOCUMENT_RE.exec(name);
  return !!(match && match[1] && SECONDARY_CODES.has(match[1]));
}

// A decrypted export: <dir>/Xml/TROP*.XML|SFM and <dir>/Icons/TROP<nnn>.PNG, read as a container.
function readExportFolder(dir) {
  const files = new Map();
  let iconBytes = 0;
  for (const [sub, pattern, max] of [['Xml', DOCUMENT_RE, MAX_ENTRY_BYTES], ['Icons', ICON_RE, MAX_ICON_BYTES]]) {
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(dir, sub), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.slice(0, TRP_MAX_ENTRIES)) {
      if (!entry.isFile() || !pattern.test(entry.name) || /\.ESFM$/i.test(entry.name)) continue;
      if (sub === 'Icons' && iconBytes >= MAX_ICONS_TOTAL_BYTES) break;
      const body = readBounded(path.join(dir, sub, entry.name), max);
      if (!body) continue;
      if (sub === 'Icons') iconBytes += body.length;
      files.set(entry.name.toUpperCase(), body);
    }
  }
  return files.size > 0 ? files : null;
}

function readKeyFile(file) {
  const raw = readBounded(file, 256);
  const key = raw ? raw.toString('utf8').trim() : '';
  return /^[0-9a-f]{32}$/i.test(key) ? key : '';
}

module.exports = {
  RETAIL_TROPHY_KEY,
  MAX_TRP_BYTES,
  MAX_SMALL_BYTES,
  LANGUAGE_BY_CODE,
  readBounded,
  readTrp,
  decryptEsfm,
  findNpcommid,
  readNpbind,
  readSfo,
  isTrophyPng,
  parseTrophyXml,
  parseTrophyTsv,
  languageOfDocument,
  readContainer,
  readExportFolder,
  readKeyFile,
};
