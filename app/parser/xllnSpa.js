'use strict';

/*
  The achievement metadata of a Games for Windows LIVE title.

  A GFWL game carries its whole achievement list inside its own executable, as an RT_RCDATA resource
  named SPAFILE. That resource is an XDBF container - the same shape Xenia reads out of a GPD, but
  written by the Xbox 360 toolchain and therefore big-endian throughout:

    XACH   the achievement table: ids, gamerscore, flags and the string ids of the three texts
    XSTR   one string table per language, keyed by those string ids
    XTHD   the title header, which carries the 32-bit title id
    images PNG icons, keyed by the image id an achievement points at

  Everything below is bounds-checked against the buffer it came from: this parses an executable
  chosen because it sits next to an xlive.dll, which is not a trustworthy origin, and a malformed
  offset must produce an error rather than a read past the end.
*/

const fs = require('fs');

const XDBF_MAGIC = 'XDBF';
const HEADER_SIZE = 24;
const ENTRY_SIZE = 18;
const FREE_ENTRY_SIZE = 8;
const NAMESPACE_METADATA = 1;
const NAMESPACE_IMAGE = 2;
const NAMESPACE_STRING = 3;
const TITLE_STRING_ID = 0x8000;
const XACH_RECORD_SIZE = 36;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024;
const MAX_SPA_BYTES = 64 * 1024 * 1024;

// The language ids the Xbox 360 string tables use, mapped onto the Steam language names AW uses
// everywhere else. Anything outside this list keeps a stable synthetic name rather than being lost.
const LANGUAGE_BY_ID = Object.freeze({
  1: 'english',
  2: 'japanese',
  3: 'german',
  4: 'french',
  5: 'spanish',
  6: 'italian',
  7: 'koreana',
  8: 'tchinese',
  9: 'portuguese',
  10: 'schinese',
  11: 'polish',
  12: 'russian',
});

function need(buffer, offset, length, what) {
  if (
    !Buffer.isBuffer(buffer) ||
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > buffer.length
  ) {
    throw new Error(`${what} is outside the buffer`);
  }
}

function u16be(buffer, offset, what) {
  need(buffer, offset, 2, what);
  return buffer.readUInt16BE(offset);
}

function u32be(buffer, offset, what) {
  need(buffer, offset, 4, what);
  return buffer.readUInt32BE(offset);
}

function u16le(buffer, offset, what) {
  need(buffer, offset, 2, what);
  return buffer.readUInt16LE(offset);
}

function u32le(buffer, offset, what) {
  need(buffer, offset, 4, what);
  return buffer.readUInt32LE(offset);
}

function peSections(buffer, peOffset, optionalSize, sectionCount) {
  if (!Number.isInteger(sectionCount) || sectionCount <= 0 || sectionCount > 96) throw new Error('PE section count is implausible');
  const tableOffset = peOffset + 24 + optionalSize;
  const sections = [];
  for (let i = 0; i < sectionCount; i += 1) {
    const at = tableOffset + i * 40;
    need(buffer, at, 40, 'PE section');
    sections.push({
      virtualSize: u32le(buffer, at + 8, 'PE virtual size'),
      virtualAddress: u32le(buffer, at + 12, 'PE virtual address'),
      rawSize: u32le(buffer, at + 16, 'PE raw size'),
      rawOffset: u32le(buffer, at + 20, 'PE raw offset'),
    });
  }
  return sections;
}

function rvaToOffset(rva, sections, size) {
  for (const section of sections) {
    const span = Math.max(section.virtualSize, section.rawSize);
    if (rva < section.virtualAddress || rva >= section.virtualAddress + span) continue;
    const offset = section.rawOffset + (rva - section.virtualAddress);
    if (offset >= 0 && offset < size) return offset;
  }
  // A resource directory that maps one to one happens in small hand-built binaries.
  if (rva >= 0 && rva < size) return rva;
  throw new Error('PE resource address is outside the image');
}

function resourceName(buffer, base, value) {
  const at = base + (value & 0x7fffffff);
  const length = u16le(buffer, at, 'PE resource name length');
  need(buffer, at + 2, length * 2, 'PE resource name');
  return buffer.subarray(at + 2, at + 2 + length * 2).toString('utf16le');
}

function resourceEntries(buffer, base, directoryOffset) {
  const at = base + directoryOffset;
  need(buffer, at, 16, 'PE resource directory');
  const count = u16le(buffer, at + 12, 'PE named entry count') + u16le(buffer, at + 14, 'PE id entry count');
  if (count > 0x4000) throw new Error('PE resource directory is implausibly large');
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const entryAt = at + 16 + i * 8;
    need(buffer, entryAt, 8, 'PE resource entry');
    const name = u32le(buffer, entryAt, 'PE resource entry name');
    const data = u32le(buffer, entryAt + 4, 'PE resource entry data');
    entries.push({
      id: name & 0xffff,
      name: (name & 0x80000000) !== 0 ? resourceName(buffer, base, name) : '',
      isDirectory: (data & 0x80000000) !== 0,
      childOffset: data & 0x7fffffff,
    });
  }
  return entries;
}

// Pull the SPAFILE resource out of a PE image. Throws with a reason when there is none.
function extractSpaFromPe(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 0x100) throw new Error('file is too small to be an executable');
  if (buffer.subarray(0, 2).toString('ascii') !== 'MZ') throw new Error('not a PE executable');
  const peOffset = u32le(buffer, 0x3c, 'PE header offset');
  need(buffer, peOffset, 24, 'PE header');
  if (buffer.readUInt32LE(peOffset) !== 0x00004550) throw new Error('invalid PE signature');

  const sectionCount = u16le(buffer, peOffset + 6, 'PE section count');
  const optionalSize = u16le(buffer, peOffset + 20, 'PE optional header size');
  const optionalAt = peOffset + 24;
  need(buffer, optionalAt, optionalSize, 'PE optional header');
  const magic = u16le(buffer, optionalAt, 'PE optional header magic');
  // PE32 keeps the data directories at +96, PE32+ at +112.
  const directoriesAt = magic === 0x10b ? optionalAt + 96 : magic === 0x20b ? optionalAt + 112 : 0;
  if (!directoriesAt) throw new Error('unsupported PE optional header');

  const resourceRva = u32le(buffer, directoriesAt + 16, 'PE resource directory address');
  const resourceSize = u32le(buffer, directoriesAt + 20, 'PE resource directory size');
  if (!resourceRva || !resourceSize) throw new Error('executable has no resources');

  const sections = peSections(buffer, peOffset, optionalSize, sectionCount);
  const base = rvaToOffset(resourceRva, sections, buffer.length);

  const rcData = resourceEntries(buffer, base, 0).find((entry) => entry.isDirectory && entry.id === 10);
  if (!rcData) throw new Error('executable has no RT_RCDATA resources');
  const spa = resourceEntries(buffer, base, rcData.childOffset).find(
    (entry) => entry.isDirectory && entry.name.replace(/^#/, '').trim().toUpperCase() === 'SPAFILE'
  );
  if (!spa) throw new Error('executable has no SPAFILE resource');
  const language = resourceEntries(buffer, base, spa.childOffset).find((entry) => !entry.isDirectory);
  if (!language) throw new Error('SPAFILE resource has no data entry');

  const dataAt = base + language.childOffset;
  need(buffer, dataAt, 16, 'SPAFILE data entry');
  const size = u32le(buffer, dataAt + 4, 'SPAFILE size');
  if (!size || size > MAX_SPA_BYTES) throw new Error('SPAFILE has an implausible size');
  const offset = rvaToOffset(u32le(buffer, dataAt, 'SPAFILE address'), sections, buffer.length);
  need(buffer, offset, size, 'SPAFILE data');

  const result = Buffer.from(buffer.subarray(offset, offset + size));
  if (result.subarray(0, 4).toString('ascii') !== XDBF_MAGIC) throw new Error('SPAFILE resource is not an XDBF container');
  return result;
}

// Accepts an executable path, an executable buffer, or an already extracted .spa file.
function extractSpa(source) {
  let buffer;
  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else {
    const file = String(source || '');
    if (!file) throw new Error('no executable given');
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('not a file');
    if (stat.size > MAX_EXECUTABLE_BYTES) throw new Error('executable is too large to inspect');
    buffer = fs.readFileSync(file);
  }
  if (buffer.subarray(0, 4).toString('ascii') === XDBF_MAGIC) return Buffer.from(buffer);
  return extractSpaFromPe(buffer);
}

function parseXdbf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_SIZE) throw new Error('XDBF container is too small');
  if (buffer.subarray(0, 4).toString('ascii') !== XDBF_MAGIC) throw new Error('invalid XDBF magic');

  const entryTableLength = u32be(buffer, 8, 'XDBF entry table length');
  const entryCount = u32be(buffer, 12, 'XDBF entry count');
  const freeTableLength = u32be(buffer, 16, 'XDBF free table length');
  const freeCount = u32be(buffer, 20, 'XDBF free count');
  if (entryCount > entryTableLength || freeCount > freeTableLength || entryTableLength > 65536 || freeTableLength > 65536) {
    throw new Error('XDBF table counts are inconsistent');
  }

  const dataOffset = HEADER_SIZE + entryTableLength * ENTRY_SIZE + freeTableLength * FREE_ENTRY_SIZE;
  if (!Number.isSafeInteger(dataOffset) || dataOffset > buffer.length) throw new Error('XDBF data area is outside the file');

  const entries = [];
  for (let i = 0; i < entryCount; i += 1) {
    const at = HEADER_SIZE + i * ENTRY_SIZE;
    const namespace = u16be(buffer, at, 'XDBF namespace');
    // The id is 64 bits wide. Every id these files use fits in its low half, which is what the
    // string tables and the image references are keyed by.
    const id = u32be(buffer, at + 6, 'XDBF id');
    const offset = dataOffset + u32be(buffer, at + 10, 'XDBF entry offset');
    const length = u32be(buffer, at + 14, 'XDBF entry length');
    if (!length) continue;
    need(buffer, offset, length, 'XDBF entry data');
    entries.push({ namespace, id, data: buffer.subarray(offset, offset + length) });
  }
  return entries;
}

function parseXach(buffer) {
  if (buffer.subarray(0, 4).toString('ascii') !== 'XACH') throw new Error('invalid XACH magic');
  const count = u16be(buffer, 12, 'XACH count');
  if (count > 10000) throw new Error('XACH count is implausible');
  need(buffer, 14, count * XACH_RECORD_SIZE, 'XACH records');
  const achievements = [];
  for (let i = 0; i < count; i += 1) {
    const at = 14 + i * XACH_RECORD_SIZE;
    achievements.push({
      id: buffer.readUInt16BE(at),
      titleStringId: buffer.readUInt16BE(at + 2),
      unlockedDescriptionId: buffer.readUInt16BE(at + 4),
      lockedDescriptionId: buffer.readUInt16BE(at + 6),
      imageId: buffer.readUInt32BE(at + 8),
      gamerscore: buffer.readUInt16BE(at + 12),
      flags: buffer.readUInt32BE(at + 16),
    });
  }
  return achievements;
}

function parseXstr(buffer) {
  if (buffer.subarray(0, 4).toString('ascii') !== 'XSTR') throw new Error('invalid XSTR magic');
  const count = u16be(buffer, 12, 'XSTR count');
  if (count > 10000) throw new Error('XSTR count is implausible');
  const strings = new Map();
  let at = 14;
  for (let i = 0; i < count; i += 1) {
    const id = u16be(buffer, at, 'XSTR string id');
    const length = u16be(buffer, at + 2, 'XSTR string length');
    at += 4;
    need(buffer, at, length, 'XSTR string');
    strings.set(id, buffer.subarray(at, at + length).toString('utf8').replace(/\0+$/, ''));
    at += length;
  }
  return strings;
}

function magicOf(data) {
  return data.length >= 4 ? data.subarray(0, 4).toString('ascii') : '';
}

function parseSpa(spaBuffer) {
  const entries = parseXdbf(spaBuffer);

  const xach = entries.find((entry) => entry.namespace === NAMESPACE_METADATA && entry.data.length >= 14 && magicOf(entry.data) === 'XACH');
  if (!xach) throw new Error('SPAFILE carries no achievement table');
  const achievements = parseXach(xach.data);

  const xthd = entries.find((entry) => entry.namespace === NAMESPACE_METADATA && entry.data.length >= 16 && magicOf(entry.data) === 'XTHD');
  const titleId = xthd ? u32be(xthd.data, 12, 'XTHD title id') : null;

  const stringsByLanguage = new Map();
  const images = new Map();
  for (const entry of entries) {
    if (entry.namespace === NAMESPACE_STRING && entry.data.length >= 14 && magicOf(entry.data) === 'XSTR') {
      try {
        stringsByLanguage.set(entry.id, parseXstr(entry.data));
      } catch {
        /* one unreadable language must not cost the others */
      }
    } else if (
      entry.namespace === NAMESPACE_IMAGE &&
      entry.data.length > PNG_MAGIC.length &&
      entry.data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
    ) {
      images.set(entry.id, Buffer.from(entry.data));
    }
  }
  if (stringsByLanguage.size === 0) throw new Error('SPAFILE carries no string table');

  return { titleId, achievements, stringsByLanguage, images };
}

function languageName(id) {
  return LANGUAGE_BY_ID[id] || `xbox-language-${id}`;
}

// The language table to read texts from: the requested one, English, then whatever exists.
function pickLanguage(parsed, preferred = 'english') {
  const wanted = String(preferred || '').trim().toLowerCase();
  const available = [...parsed.stringsByLanguage.keys()].filter((id) => parsed.stringsByLanguage.get(id)?.size).sort((a, b) => a - b);
  if (available.length === 0) return null;
  const byName = available.find((id) => languageName(id) === wanted);
  const english = available.find((id) => languageName(id) === 'english');
  return byName ?? english ?? available[0];
}

function titleName(parsed, preferred = 'english') {
  const languageId = pickLanguage(parsed, preferred);
  if (languageId == null) return '';
  const own = String(parsed.stringsByLanguage.get(languageId)?.get(TITLE_STRING_ID) || '').trim();
  if (own) return own;
  for (const strings of parsed.stringsByLanguage.values()) {
    const fallback = String(strings.get(TITLE_STRING_ID) || '').trim();
    if (fallback) return fallback;
  }
  return '';
}

module.exports = {
  LANGUAGE_BY_ID,
  TITLE_STRING_ID,
  extractSpa,
  extractSpaFromPe,
  parseSpa,
  parseXdbf,
  parseXach,
  parseXstr,
  pickLanguage,
  languageName,
  titleName,
};
