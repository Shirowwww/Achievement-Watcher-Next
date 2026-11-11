'use strict';

const fs = require('fs');

/*
  Read-only access to a Wine prefix's registry hives (`user.reg`, `system.reg`). They are plain
  text written by wineserver, so a prefix is read without starting Wine. Only string, expandable
  string and DWORD values are decoded: that is all the save-root lookups need.

  A hive is kept as its bytes plus the offsets of its sections, and a key is decoded when it is
  asked for. Decoding every hive whole cost 440 MiB of heap over 18 prefixes, more than the window
  has; the lookups read a few keys of each.
*/

// Hives kept between lookups, least recently used first. The byte budget counts the files' bytes.
const cache = new Map();
const cacheLimits = { hives: 48, bytes: 96 * 1024 * 1024 };
let cachedBytes = 0;
// Decoded keys and subkey listings kept per hive.
const MAX_PARSED_KEYS_PER_HIVE = 96;
const MAX_SUBKEY_QUERIES_PER_HIVE = 48;
// Values map -> the key as spelled in the hive, and value -> its name as spelled, for listings
// (lookups ignore case).
const keyNames = new WeakMap();
const valueNames = new WeakMap();

function unescapeRegString(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = text[++i];
    if (next === 'x') {
      const hex = /^[0-9a-fA-F]{1,4}/.exec(text.slice(i + 1));
      if (hex) {
        out += String.fromCharCode(parseInt(hex[0], 16));
        i += hex[0].length;
        continue;
      }
    }
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '0') out += '\0';
    else if (next !== undefined) out += next;
  }
  return out;
}

// Reads `"..."` starting at `start` (the opening quote) and returns [text, indexAfterClosingQuote].
function readQuoted(line, start) {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') i += 2;
    else if (line[i] === '"') return [unescapeRegString(line.slice(start + 1, i)), i + 1];
    else i++;
  }
  return null;
}

function parseValue(raw) {
  if (raw.startsWith('"')) {
    const quoted = readQuoted(raw, 0);
    return quoted ? { type: 'REG_SZ', value: quoted[0] } : null;
  }
  const expand = /^str\(2\):/.exec(raw);
  if (expand) {
    const quoted = readQuoted(raw, expand[0].length);
    return quoted ? { type: 'REG_EXPAND_SZ', value: quoted[0] } : null;
  }
  const dword = /^dword:([0-9a-fA-F]{1,8})/.exec(raw);
  if (dword) return { type: 'REG_DWORD', value: parseInt(dword[1], 16) };
  return null;
}

// One `"name"=value` or `@=value` line into `values`; any other line is left out.
function addValueLine(values, line) {
  let name;
  let rest;
  if (line.startsWith('@=')) {
    name = '';
    rest = line.slice(2);
  } else if (line.startsWith('"')) {
    const quoted = readQuoted(line, 0);
    if (!quoted || line[quoted[1]] !== '=') return;
    name = quoted[0];
    rest = line.slice(quoted[1] + 1);
  } else return;
  const value = parseValue(rest);
  if (!value) return;
  values.set(name.toLowerCase(), value);
  valueNames.set(value, name);
}

// Map of lower-cased key path (backslash separated, no hive) -> Map of lower-cased value name.
function parseHive(text) {
  const keys = new Map();
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('[')) {
      const end = line.lastIndexOf(']');
      if (end < 0) {
        current = null;
        continue;
      }
      const spelled = unescapeRegString(line.slice(1, end));
      const name = spelled.toLowerCase();
      current = keys.get(name) || new Map();
      keys.set(name, current);
      keyNames.set(current, spelled);
      continue;
    }
    if (current) addValueLine(current, line);
  }
  return keys;
}

const LF = 10;
const CR = 13;
const OPEN_BRACKET = 91;

/*
  The sections of a hive, without decoding them: lower-cased key -> where its header line and its
  value lines are. A key written in several sections keeps them all, in file order, and the
  spelling of the last one, as parseHive does.
*/
function indexSections(bytes) {
  const keys = new Map();
  let open = null;
  const close = (at) => {
    if (open) open.ranges[open.ranges.length - 1][1] = at;
  };
  for (let pos = 0; pos < bytes.length; ) {
    const lf = bytes.indexOf(LF, pos);
    const next = lf < 0 ? bytes.length : lf + 1;
    if (bytes[pos] === OPEN_BRACKET) {
      close(pos);
      const end = lf > pos && bytes[lf - 1] === CR ? lf - 1 : lf < 0 ? bytes.length : lf;
      const line = bytes.toString('utf8', pos, end);
      const bracket = line.lastIndexOf(']');
      if (bracket < 0) open = null;
      else {
        const name = unescapeRegString(line.slice(1, bracket)).toLowerCase();
        open = keys.get(name);
        if (!open) keys.set(name, (open = { ranges: [] }));
        open.ranges.push([next, next]);
        open.headerStart = pos;
        open.headerEnd = end;
      }
    }
    pos = next;
  }
  close(bytes.length);
  return keys;
}

function sameFile(a, b) {
  return Boolean(a && b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.dev === b.dev && a.ino === b.ino;
}

/*
  Wineserver replaces a hive while its prefix runs. A read is kept only when the file was the same
  before, after, and under its name; it is tried twice. A hive still moving is answered from the
  last read and not kept, so a running game is read rather than refused.
*/
function readHive(file) {
  let hive;
  for (let attempt = 0; attempt < 2; attempt++) {
    const fd = fs.openSync(file, 'r');
    let before;
    let bytes;
    let after;
    try {
      before = fs.fstatSync(fd);
      bytes = fs.readFileSync(fd);
      after = fs.fstatSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const settled = sameFile(before, after) && sameFile(after, fs.statSync(file));
    hive = { stat: after, bytes, keys: indexSections(bytes), values: new Map(), subkeys: new Map(), settled };
    if (settled) break;
  }
  return hive;
}

function forget(file) {
  const hive = cache.get(file);
  if (!hive) return;
  cachedBytes -= hive.bytes.length;
  cache.delete(file);
}

function loadHive(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    forget(file);
    return null;
  }
  const cached = cache.get(file);
  if (cached && sameFile(cached.stat, stat)) {
    // Most recently used goes last.
    cache.delete(file);
    cache.set(file, cached);
    return cached;
  }
  forget(file);
  const hive = readHive(file);
  if (hive.settled && hive.bytes.length <= cacheLimits.bytes) {
    cache.set(file, hive);
    cachedBytes += hive.bytes.length;
    while (cache.size > cacheLimits.hives || cachedBytes > cacheLimits.bytes) forget(cache.keys().next().value);
  }
  return hive;
}

// Sets `key` as the most recent entry of a map that keeps `capacity` of them.
function remember(map, key, value, capacity) {
  map.delete(key);
  map.set(key, value);
  if (map.size > capacity) map.delete(map.keys().next().value);
  return value;
}

// `key` uses either slash, like the Windows registry helpers: 'Software/Valve/Steam'.
function keyPath(key) {
  return String(key).replace(/\//g, '\\').replace(/^\\+|\\+$/g, '').toLowerCase();
}

// The values of one key, decoded on first use.
function valuesOf(hive, name) {
  const known = hive.values.get(name);
  if (known) return remember(hive.values, name, known, MAX_PARSED_KEYS_PER_HIVE);
  const section = hive.keys.get(name);
  if (!section) return null;
  const values = new Map();
  for (const [start, end] of section.ranges) {
    for (const line of hive.bytes.toString('utf8', start, end).split(/\r?\n/)) addValueLine(values, line);
  }
  return remember(hive.values, name, values, MAX_PARSED_KEYS_PER_HIVE);
}

function readValue(hiveFile, key, name) {
  const hive = loadHive(hiveFile);
  const values = hive && valuesOf(hive, keyPath(key));
  if (!values) return null;
  return values.get(String(name || '').toLowerCase()) || null;
}

// Immediate subkeys as spelled in the hive. Wine writes only keys that hold values, so a parent
// is known through its descendants.
function listSubkeys(hiveFile, key) {
  const hive = loadHive(hiveFile);
  if (!hive) return [];
  const parent = keyPath(key);
  const known = hive.subkeys.get(parent);
  if (known) return [...remember(hive.subkeys, parent, known, MAX_SUBKEY_QUERIES_PER_HIVE)];
  const depth = parent ? parent.split('\\').length : 0;
  const children = new Map();
  for (const [name, section] of hive.keys) {
    if (parent && !name.startsWith(`${parent}\\`)) continue;
    const header = hive.bytes.toString('utf8', section.headerStart, section.headerEnd);
    const child = unescapeRegString(header.slice(1, header.lastIndexOf(']'))).split('\\')[depth];
    if (child && !children.has(child.toLowerCase())) children.set(child.toLowerCase(), child);
  }
  return [...remember(hive.subkeys, parent, [...children.values()], MAX_SUBKEY_QUERIES_PER_HIVE)];
}

// The names of a key's values as spelled in the hive ('' for the default value).
function listValueNames(hiveFile, key) {
  const hive = loadHive(hiveFile);
  const values = hive && valuesOf(hive, keyPath(key));
  if (!values) return [];
  return [...values.entries()].map(([name, value]) => (valueNames.has(value) ? valueNames.get(value) : name));
}

// cacheLimits is exported for the tests, which lower it rather than write 100 MiB of hives.
module.exports = { parseHive, readValue, listSubkeys, listValueNames, cacheLimits };
