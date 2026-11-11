'use strict';

const fs = require('fs');

/*
  Read-only access to a Wine prefix's registry hives (`user.reg`, `system.reg`). They are plain
  text written by wineserver, so a prefix is read without starting Wine. Only string, expandable
  string and DWORD values are decoded: that is all the save-root lookups need.
*/

// Bound the retained snapshots across all Wine prefixes without restricting reads.
const cache = new Map();
const MAX_CACHED_HIVES = 48;
const MAX_CACHED_BYTES = 96 * 1024 * 1024;
let cachedBytes = 0;
// Values map -> the key as spelled in the hive, and value -> its name as spelled, for listings
// (lookups ignore case).
const keyNames = new WeakMap();
const valueNames = new WeakMap();
const MAX_PARSED_KEYS_PER_HIVE = 96;
const MAX_SUBKEY_QUERIES_PER_HIVE = 48;

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
    if (!current) continue;
    let name;
    let rest;
    if (line.startsWith('@=')) {
      name = '';
      rest = line.slice(2);
    } else if (line.startsWith('"')) {
      const quoted = readQuoted(line, 0);
      if (!quoted || line[quoted[1]] !== '=') continue;
      name = quoted[0];
      rest = line.slice(quoted[1] + 1);
    } else continue;
    const value = parseValue(rest);
    if (value) {
      current.set(name.toLowerCase(), value);
      valueNames.set(value, name);
    }
  }
  return keys;
}


function keyPath(key) {
  return String(key).replace(/\//g, '\\').replace(/^\\+|\\+$/g, '').toLowerCase();
}


// A raw-byte snapshot and an index of sections. Values are only decoded on demand.
function indexHive(bytes, stat) {
  const keys = new Map();
  let current = null;
  // The common case is one section per key: two offsets, not a nested array.
  for (let pos = 0; pos < bytes.length;) {
    const lf = bytes.indexOf(10, pos);
    const next = lf < 0 ? bytes.length : lf + 1;
    let end = lf < 0 ? bytes.length : lf;
    if (lf >= 0 && end > pos && bytes[end - 1] === 13) end--;
    if (bytes[pos] === 91) {
      if (current) {
        if (current.extra) current.extra[current.extra.length - 1][1] = pos;
        else current.end = pos;
      }
      const line = bytes.toString('utf8', pos, end);
      const close = line.lastIndexOf(']');
      if (close < 0) current = null;
      else {
        const normalized = unescapeRegString(line.slice(1, close)).toLowerCase();
        current = keys.get(normalized);
        if (!current) {
          current = { start: next, end: -1, headerStart: pos, headerEnd: end };
          keys.set(normalized, current);
        } else {
          if (!current.extra) current.extra = [[current.start, current.end]];
          current.extra.push([next, -1]);
          current.headerStart = pos; // Last spelling wins; original insertion order remains.
          current.headerEnd = end;
        }
      }
    }
    pos = next;
  }
  if (current) {
    if (current.extra) current.extra[current.extra.length - 1][1] = bytes.length;
    else current.end = bytes.length;
  }
  return {
    keys, bytes, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, size: stat.size,
    dev: stat.dev, ino: stat.ino,
    values: new Map(), subkeys: new Map(),
  };
}

function sameFileStamp(a, b) {
  return a && b && a.size === b.size && a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs && a.dev === b.dev && a.ino === b.ino;
}

function readStableSnapshot(file) {
  // Wine may replace a hive during a read. The descriptor and its name must both
  // identify the same unchanged file; otherwise retry before indexing.
  for (let attempt = 0; attempt < 2; attempt++) {
    const fd = fs.openSync(file, 'r');
    let before, bytes, after;
    try {
      before = fs.fstatSync(fd);
      bytes = fs.readFileSync(fd);
      after = fs.fstatSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const named = fs.statSync(file);
    if (sameFileStamp(before, after) && sameFileStamp(after, named)) {
      return indexHive(bytes, after);
    }
  }
  const error = new Error('Wine registry was modified during a read: ' + file);
  error.code = 'WINE_REGISTRY_CHANGED';
  throw error;
}

function dropCachedHive(file) {
  const hit = cache.get(file);
  if (!hit) return;
  cachedBytes -= hit.bytes.length;
  cache.delete(file);
}

function loadHive(file) {
  let stat;
  try { stat = fs.statSync(file); } catch { dropCachedHive(file); return null; }
  const hit = cache.get(file);
  if (sameFileStamp(hit, stat)) {
    // Update recency without changing the memory budget.
    cache.delete(file);
    cache.set(file, hit);
    return hit;
  }
  dropCachedHive(file);
  const fresh = readStableSnapshot(file);
  if (fresh.bytes.length <= MAX_CACHED_BYTES) {
    cache.set(file, fresh);
    cachedBytes += fresh.bytes.length;
    while (cache.size > MAX_CACHED_HIVES || cachedBytes > MAX_CACHED_BYTES) {
      dropCachedHive(cache.keys().next().value);
    }
  }
  return fresh;
}

function putBounded(map, key, value, capacity) {
  map.delete(key);
  map.set(key, value);
  if (map.size > capacity) map.delete(map.keys().next().value);
  return value;
}

function valuesOf(hive, name) {
  if (hive.values.has(name)) return putBounded(hive.values, name, hive.values.get(name), MAX_PARSED_KEYS_PER_HIVE);
  const descriptor = hive.keys.get(name);
  if (!descriptor) return null;
  const values = new Map();
  const sections = descriptor.extra || [[descriptor.start, descriptor.end]];
  for (const [start, end] of sections) {
    // Repeated sections are merged in file order, exactly as parseHive does.
    for (const line of hive.bytes.toString('utf8', start, end).split(/\r?\n/)) {
      let spelled;
      let raw;
      if (line.startsWith('@=')) { spelled = ''; raw = line.slice(2); }
      else if (line.startsWith('"')) {
        const quoted = readQuoted(line, 0);
        if (!quoted || line[quoted[1]] !== '=') continue;
        spelled = quoted[0]; raw = line.slice(quoted[1] + 1);
      } else continue;
      const value = parseValue(raw);
      if (value) {
        values.set(spelled.toLowerCase(), value);
        valueNames.set(value, spelled);
      }
    }
  }
  return putBounded(hive.values, name, values, MAX_PARSED_KEYS_PER_HIVE);
}

function readValue(file, key, name) {
  const hive = loadHive(file);
  if (!hive) return null;
  const values = valuesOf(hive, keyPath(key));
  return values ? values.get(String(name || '').toLowerCase()) || null : null;
}

function listSubkeys(file, key) {
  const hive = loadHive(file);
  if (!hive) return [];
  const parent = keyPath(key);
  if (hive.subkeys.has(parent)) {
    return putBounded(hive.subkeys, parent, hive.subkeys.get(parent), MAX_SUBKEY_QUERIES_PER_HIVE).slice();
  }
  const depth = parent ? parent.split('\\').length : 0;
  const children = new Map();
  for (const [name, descriptor] of hive.keys) {
    if (parent && !name.startsWith(parent + '\\')) continue;
    const header = hive.bytes.toString('utf8', descriptor.headerStart, descriptor.headerEnd);
    const spelled = unescapeRegString(header.slice(1, header.lastIndexOf(']')));
    const child = spelled.split('\\')[depth];
    if (child && !children.has(child.toLowerCase())) children.set(child.toLowerCase(), child);
  }
  const result = [...children.values()];
  putBounded(hive.subkeys, parent, result, MAX_SUBKEY_QUERIES_PER_HIVE);
  return result.slice();
}

function listValueNames(file, key) {
  const hive = loadHive(file);
  const values = hive && valuesOf(hive, keyPath(key));
  if (!values) return [];
  return [...values.entries()].map(([name, value]) => valueNames.has(value) ? valueNames.get(value) : name);
}

module.exports = { parseHive, readValue, listSubkeys, listValueNames };
