'use strict';

/*
  The icon a Windows executable carries in its own resources.

  Electron's app.getFileIcon() looked like the obvious answer and is not: the Windows shell answers
  with the generic "application" glyph rather than nothing when a file has no icon of its own, so
  every game ended up being offered the same blue window picture (issue #38 follow-up). Reading the
  PE directly is what tells the two cases apart - no RT_GROUP_ICON means no icon, and the picker
  then offers no executable tile at all instead of a placeholder.

  Pure fs/Buffer parsing, no Electron, so it is unit-testable headless.

  Layout walked here: DOS header -> PE header -> section table (to map an RVA onto a file offset)
  -> the resource directory's three levels (type / name / language) -> RT_GROUP_ICON, whose entries
  name the RT_ICON resources holding the images themselves.
*/

const fs = require('fs');

const RT_ICON = 3;
const RT_GROUP_ICON = 14;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// A resource section is a few hundred KB at most; anything claiming more is a malformed header.
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
// Directory nesting is fixed at three levels; the guard is against a corrupt tree pointing at itself.
const MAX_DIRECTORY_DEPTH = 4;

function readHeader(fd, size) {
  const length = Math.min(size, 4096);
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, 0);
  return buffer;
}

/*
  Where the resource section lives, and the section table needed to turn the RVAs inside it into
  file offsets. Returns null for anything that is not a PE image (a script with an .exe name, a
  16-bit stub, a truncated download).
*/
function parsePeLayout(fd, fileSize) {
  const header = readHeader(fd, fileSize);
  if (header.length < 0x40 || header.readUInt16LE(0) !== 0x5a4d) return null; // 'MZ'
  const peOffset = header.readUInt32LE(0x3c);
  if (peOffset <= 0 || peOffset + 24 > header.length) return null;
  if (header.readUInt32LE(peOffset) !== 0x00004550) return null; // 'PE\0\0'

  const coff = peOffset + 4;
  const sectionCount = header.readUInt16LE(coff + 2);
  const optionalSize = header.readUInt16LE(coff + 16);
  const optional = coff + 20;
  if (optionalSize < 96 || optional + optionalSize > header.length) return null;

  const magic = header.readUInt16LE(optional);
  // PE32 keeps four 32-bit fields where PE32+ keeps 64-bit ones, which moves the data directories.
  const dataDirectories = optional + (magic === 0x20b ? 112 : 96);
  const resourceEntry = dataDirectories + 2 * 8; // [2] = resource table
  if (resourceEntry + 8 > header.length) return null;
  const resourceRva = header.readUInt32LE(resourceEntry);
  const resourceSize = header.readUInt32LE(resourceEntry + 4);
  if (!resourceRva || !resourceSize || resourceSize > MAX_RESOURCE_BYTES) return null;

  const sections = [];
  const sectionTable = optional + optionalSize;
  for (let i = 0; i < sectionCount; i += 1) {
    const at = sectionTable + i * 40;
    if (at + 40 > header.length) break;
    sections.push({
      virtualSize: header.readUInt32LE(at + 8),
      virtualAddress: header.readUInt32LE(at + 12),
      rawSize: header.readUInt32LE(at + 16),
      rawOffset: header.readUInt32LE(at + 20),
    });
  }
  if (sections.length === 0) return null;
  return { resourceRva, resourceSize, sections };
}

function rvaToOffset(sections, rva) {
  for (const section of sections) {
    const size = Math.max(section.virtualSize, section.rawSize);
    if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
      const delta = rva - section.virtualAddress;
      if (delta >= section.rawSize) return -1; // inside the section's zero-filled tail
      return section.rawOffset + delta;
    }
  }
  return -1;
}

// Every leaf under one directory entry, as { id, rva, size }. `id` is the entry id at the level
// asked for; deeper levels (language) are flattened onto the first leaf found, which is what an
// icon resource has anyway.
function walkDirectory(resource, offset, depth, out, currentId) {
  if (depth > MAX_DIRECTORY_DEPTH || offset + 16 > resource.length) return;
  const named = resource.readUInt16LE(offset + 12);
  const ids = resource.readUInt16LE(offset + 14);
  const total = named + ids;
  for (let i = 0; i < total; i += 1) {
    const at = offset + 16 + i * 8;
    if (at + 8 > resource.length) return;
    const name = resource.readUInt32LE(at);
    const pointer = resource.readUInt32LE(at + 4);
    const id = name & 0x80000000 ? null : name; // a named resource has no numeric id
    if (pointer & 0x80000000) {
      walkDirectory(resource, pointer & 0x7fffffff, depth + 1, out, depth === 0 ? id : currentId);
      continue;
    }
    if (pointer + 16 > resource.length) continue;
    out.push({ id: currentId, rva: resource.readUInt32LE(pointer), size: resource.readUInt32LE(pointer + 4) });
  }
}

// The leaves of one resource type, keyed by their level-2 id (the icon/group number).
function resourcesOfType(resource, type) {
  if (resource.length < 16) return [];
  const named = resource.readUInt16LE(12);
  const ids = resource.readUInt16LE(14);
  for (let i = 0; i < named + ids; i += 1) {
    const at = 16 + i * 8;
    if (at + 8 > resource.length) return [];
    const name = resource.readUInt32LE(at);
    if (name & 0x80000000 || name !== type) continue;
    const pointer = resource.readUInt32LE(at + 4);
    if (!(pointer & 0x80000000)) return [];
    const out = [];
    // depth 0 here is the resource-id level: its entry ids are what a group icon refers to, and
    // walkDirectory only records an id at that depth.
    walkDirectory(resource, pointer & 0x7fffffff, 0, out, null);
    return out;
  }
  return [];
}

function readResourceBytes(fd, sections, leaf) {
  const offset = rvaToOffset(sections, leaf.rva);
  if (offset < 0 || leaf.size <= 0 || leaf.size > MAX_RESOURCE_BYTES) return null;
  const buffer = Buffer.alloc(leaf.size);
  const read = fs.readSync(fd, buffer, 0, leaf.size, offset);
  return read === leaf.size ? buffer : null;
}

// GRPICONDIR: reserved, type, count, then 14 bytes per image. A 0 width or height means 256.
function parseIconGroup(buffer) {
  if (!buffer || buffer.length < 6) return [];
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 14;
    if (at + 14 > buffer.length) break;
    entries.push({
      width: buffer.readUInt8(at) || 256,
      height: buffer.readUInt8(at + 1) || 256,
      colorCount: buffer.readUInt8(at + 2),
      planes: buffer.readUInt16LE(at + 4),
      bitCount: buffer.readUInt16LE(at + 6),
      bytes: buffer.readUInt32LE(at + 8),
      iconId: buffer.readUInt16LE(at + 12),
    });
  }
  return entries;
}

// A single-image .ico around one RT_ICON payload: ICONDIR + one ICONDIRENTRY + the bytes as they
// are stored. Windows image decoders (and Electron's nativeImage) read this directly.
function buildIcoFile(entry, imageBytes) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(entry.width >= 256 ? 0 : entry.width, 6);
  header.writeUInt8(entry.height >= 256 ? 0 : entry.height, 7);
  header.writeUInt8(entry.colorCount, 8);
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(entry.planes, 10);
  header.writeUInt16LE(entry.bitCount, 12);
  header.writeUInt32LE(imageBytes.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, imageBytes]);
}

/*
  The best icon an executable carries, or null when it carries none.

  "Best" is the largest image of the group Windows itself would show - the lowest-numbered
  RT_GROUP_ICON - because that is the picture the file is recognised by. A 256x256 entry is stored
  as a PNG and returned as one; smaller entries are DIBs and are wrapped in a one-image .ico, which
  is what a decoder needs to make sense of them.
*/
function extractIcon(exePath) {
  const file = String(exePath || '');
  if (!file) return null;
  let fd = null;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 0x40) return null;
    fd = fs.openSync(file, 'r');
    const layout = parsePeLayout(fd, stat.size);
    if (!layout) return null;

    const resourceOffset = rvaToOffset(layout.sections, layout.resourceRva);
    if (resourceOffset < 0) return null;
    const resource = Buffer.alloc(Math.min(layout.resourceSize, MAX_RESOURCE_BYTES));
    if (fs.readSync(fd, resource, 0, resource.length, resourceOffset) !== resource.length) return null;

    const groups = resourcesOfType(resource, RT_GROUP_ICON);
    if (groups.length === 0) return null;
    // Windows shows the group with the lowest id; matching that keeps the tile and the taskbar in
    // agreement instead of offering some secondary icon the user has never seen.
    const group = groups.slice().sort((a, b) => (a.id ?? 0xffff) - (b.id ?? 0xffff))[0];
    const entries = parseIconGroup(readResourceBytes(fd, layout.sections, group));
    if (entries.length === 0) return null;

    const icons = new Map(resourcesOfType(resource, RT_ICON).map((leaf) => [leaf.id, leaf]));
    const bySize = entries
      .filter((entry) => icons.has(entry.iconId))
      .sort((a, b) => b.width * b.height - a.width * a.height || b.bitCount - a.bitCount);
    for (const entry of bySize) {
      const bytes = readResourceBytes(fd, layout.sections, icons.get(entry.iconId));
      if (!bytes || bytes.length === 0) continue;
      if (bytes.length >= 4 && bytes.subarray(0, 4).equals(PNG_MAGIC)) {
        return { format: 'png', data: bytes, width: entry.width, height: entry.height };
      }
      return { format: 'ico', data: buildIcoFile(entry, bytes), width: entry.width, height: entry.height };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* the handle is going away with the process anyway */
      }
    }
  }
}

module.exports = { extractIcon, parseIconGroup, buildIcoFile, RT_ICON, RT_GROUP_ICON };
