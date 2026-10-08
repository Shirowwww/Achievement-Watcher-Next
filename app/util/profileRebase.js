'use strict';

/*
  A restored file can name folders of the machine it was saved on. Two roots are known and
  rewritten: the old user data folder and the old user profile. A path elsewhere (a game on D:)
  means the same thing on the new machine or nothing at all, so it is left alone.
*/

const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const REBASED_EXTENSIONS = new Set(['.json', '.db', '.ini']);

function key(value) {
  return String(value).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

// Longest source first, so the user data folder wins over the profile folder that contains it.
function buildMappings(pairs) {
  return pairs
    .filter((p) => p && p.from && p.to && key(p.from) !== key(p.to))
    .map((p) => ({ from: String(p.from), to: String(p.to), fromKey: key(p.from) }))
    .sort((a, b) => b.fromKey.length - a.fromKey.length);
}

function rebasePath(value, mappings) {
  const probe = key(value);
  for (const map of mappings) {
    if (!probe.startsWith(map.fromKey)) continue;
    const next = probe[map.fromKey.length];
    if (next !== undefined && next !== '\\') continue;
    const rest = String(value).slice(map.fromKey.length);
    const target = map.to.replace(/[\\/]+$/, '');
    // Keep the slash style the file used.
    return value.includes('\\') || !value.includes('/') ? target.replace(/\//g, '\\') + rest : target.replace(/\\/g, '/') + rest;
  }
  return value;
}

function rebaseString(value, mappings) {
  if (typeof value !== 'string' || !mappings.length) return value;
  if (/^file:\/\//i.test(value)) {
    try {
      const moved = rebasePath(fileURLToPath(value), mappings);
      return moved === fileURLToPath(value) ? value : pathToFileURL(moved).href;
    } catch {
      return value;
    }
  }
  return /^[A-Za-z]:[\\/]/.test(value) ? rebasePath(value, mappings) : value;
}

function rebaseJson(node, mappings) {
  if (typeof node === 'string') return rebaseString(node, mappings);
  if (Array.isArray(node)) return node.map((item) => rebaseJson(item, mappings));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, rebaseJson(v, mappings)]));
  }
  return node;
}

function rebaseIni(text, mappings) {
  return text
    .split('\n')
    .map((line) => {
      const eq = line.indexOf('=');
      if (eq < 0 || /^\s*[;#]/.test(line)) return line;
      const raw = line.slice(eq + 1);
      const cr = raw.endsWith('\r') ? '\r' : '';
      const value = raw.trim();
      const moved = rebaseString(value, mappings);
      return moved === value ? line : `${line.slice(0, eq + 1)} ${moved}${cr}`;
    })
    .join('\n');
}

// Returns the new bytes, or the same buffer when nothing moved or the file is not text we understand.
function rebaseFileBytes(rel, bytes, mappings) {
  const ext = path.extname(rel).toLowerCase();
  if (!mappings.length || !REBASED_EXTENSIONS.has(ext)) return bytes;
  const text = bytes.toString('utf8');
  if (ext === '.ini') {
    const out = rebaseIni(text, mappings);
    return out === text ? bytes : Buffer.from(out, 'utf8');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return bytes;
  }
  const rebuilt = JSON.stringify(rebaseJson(parsed, mappings), null, 2);
  return JSON.stringify(parsed, null, 2) === rebuilt ? bytes : Buffer.from(rebuilt, 'utf8');
}

module.exports = { buildMappings, rebasePath, rebaseString, rebaseFileBytes };
