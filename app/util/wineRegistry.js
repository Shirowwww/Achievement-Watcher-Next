'use strict';

const fs = require('fs');

/*
  Read-only access to a Wine prefix's registry hives (`user.reg`, `system.reg`). They are plain
  text written by wineserver, so a prefix is read without starting Wine. Only string, expandable
  string and DWORD values are decoded: that is all the save-root lookups need.
*/

const cache = new Map();

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
      const name = unescapeRegString(line.slice(1, end)).toLowerCase();
      current = keys.get(name) || new Map();
      keys.set(name, current);
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
    if (value) current.set(name.toLowerCase(), value);
  }
  return keys;
}

function loadHive(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    cache.delete(file);
    return null;
  }
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.keys;
  const keys = parseHive(fs.readFileSync(file, 'utf8'));
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, keys });
  return keys;
}

// `key` uses either slash, like the Windows registry helpers: 'Software/Valve/Steam'.
function readValue(hiveFile, key, name) {
  const keys = loadHive(hiveFile);
  if (!keys) return null;
  const values = keys.get(String(key).replace(/\//g, '\\').replace(/^\\+|\\+$/g, '').toLowerCase());
  if (!values) return null;
  return values.get(String(name || '').toLowerCase()) || null;
}

module.exports = { parseHive, readValue };
