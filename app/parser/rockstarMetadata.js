'use strict';

/*
  Social Club's achievement list for a title, from the launcher's own copy:
  Documents\Rockstar Games\Social Club\Titles\<title>\metadata.dat. Rockstar's achievements API
  answers by number only, and the number is the position in this list, so this is what ties an
  unlock to a name. The order of the title's Steam release is not the same (Steam lists GTA V
  Enhanced by api name), which is why the Steam schema alone cannot be used.

  A string table, one per language and kind: the magic 01 00 02 00, then big-endian u32s (two
  unknown, a flag, the string count, the offset count, 0, table bytes, pool bytes), a table of u16
  offsets where each string ends, and the UTF-8 pool. The achievement tables are the ones with the
  flag set and as many offsets as strings (every other kind has one more): name, unlocked text and
  locked text for each achievement in turn, so achievement n is the n-th triple.
*/

const fs = require('fs');
const path = require('path');

const MAGIC = Buffer.from([0x01, 0x00, 0x02, 0x00]);
const HEADER_BYTES = 4 + 8 * 4;
const ACHIEVEMENT_FLAG = 1;
const STRINGS_PER_ACHIEVEMENT = 3;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
// A name used twice in a table cannot say which number it is, so matching needs most of the list
// to land on a unique name before anything is trusted.
const MIN_MATCH_RATIO = 0.9;

function readTable(buf, at) {
  if (at + HEADER_BYTES > buf.length) return null;
  const u32 = (i) => buf.readUInt32BE(at + 4 + i * 4);
  const count = u32(3);
  const tableBytes = u32(6);
  const poolBytes = u32(7);
  if (u32(2) !== ACHIEVEMENT_FLAG || count === 0 || count % STRINGS_PER_ACHIEVEMENT || u32(4) !== count || tableBytes !== count * 2) return null;
  const tableAt = at + HEADER_BYTES;
  const poolAt = tableAt + tableBytes;
  if (poolAt + poolBytes > buf.length) return null;
  const strings = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const end = buf.readUInt16BE(tableAt + i * 2);
    if (end < start || end > poolBytes) return null;
    strings.push(buf.toString('utf8', poolAt + start, poolAt + end));
    start = end;
  }
  const names = [];
  for (let i = 0; i < count; i += STRINGS_PER_ACHIEVEMENT) names.push(strings[i]);
  return names;
}

// Every language's list of achievement names, in Rockstar's order: [[name, ...], ...].
function parseMetadata(buf) {
  const tables = [];
  if (!Buffer.isBuffer(buf)) return tables;
  for (let at = buf.indexOf(MAGIC); at >= 0; at = buf.indexOf(MAGIC, at + 1)) {
    const table = readTable(buf, at);
    if (table) tables.push(table);
  }
  return tables;
}

const nameKey = (name) => String(name || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/*
  { apiName: rockstarNumber } for a schema list ([{ name, displayName }]), from the table whose names
  match it best; null when no table matches enough of it to be trusted.
*/
function numbersForSchema(tables, schemaList) {
  const list = Array.isArray(schemaList) ? schemaList.filter((a) => a && a.name && a.displayName) : [];
  if (!list.length) return null;
  let best = null;
  for (const names of tables || []) {
    const seen = new Map();
    names.forEach((name, i) => {
      const key = nameKey(name);
      seen.set(key, seen.has(key) ? -1 : i + 1);
    });
    const numbers = {};
    let matched = 0;
    for (const achievement of list) {
      const number = seen.get(nameKey(achievement.displayName));
      if (number > 0) {
        numbers[achievement.name] = number;
        matched++;
      }
    }
    if (!best || matched > best.matched) best = { matched, numbers };
  }
  return best && best.matched >= list.length * MIN_MATCH_RATIO ? best.numbers : null;
}

// The metadata.dat of every title the launcher has set up, under each Documents folder given.
function metadataFiles(documentsFolders) {
  const files = [];
  for (const documents of documentsFolders || []) {
    const titles = path.join(documents, 'Rockstar Games', 'Social Club', 'Titles');
    let entries = [];
    try {
      entries = fs.readdirSync(titles, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(titles, entry.name, 'metadata.dat');
      try {
        const size = fs.statSync(file).size;
        if (size > 0 && size <= MAX_FILE_BYTES) files.push(file);
      } catch {
        /* a title folder without its list yet */
      }
    }
  }
  return files;
}

/*
  The numbering for a game, from whichever title's metadata.dat matches it; null when none does.
  `schemaLists` are the same achievements in several languages, best first: a translation that
  differs from Rockstar's for one achievement is filled in by the next list.
*/
function numbersFromFiles(files, schemaLists) {
  for (const file of files) {
    let tables;
    try {
      tables = parseMetadata(fs.readFileSync(file));
    } catch {
      continue;
    }
    const found = (schemaLists || []).map((list) => numbersForSchema(tables, list)).filter(Boolean);
    if (found.length) return Object.assign({}, ...found.toReversed());
  }
  return null;
}

module.exports = { parseMetadata, numbersForSchema, metadataFiles, numbersFromFiles };
