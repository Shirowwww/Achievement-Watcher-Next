'use strict';

/*
  RUNE's Ubisoft Connect emulator keeps one KeyValues text file per user and product:

    <Documents>\RUNE\Ubisoft Connect\achievements\<userId>\<uplayAppId>\achievements.cfg

  with one block per numeric Ubisoft achievement id holding `earned` and `time`. This module only
  reads that layout. It is shared with the Watchdog (see watchdog/console/runeUplayWatch.js), so it
  requires nothing from app/ beyond util/reg.js, which is unpacked for the same reason.
*/

const fs = require('fs');
const path = require('path');

const SOURCE = 'RUNE Uplay';
const CFG_NAME = 'achievements.cfg';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOKENS = 100000;
const MAX_DEPTH = 16;
const MAX_USERS = 200;
const MAX_PRODUCTS = 2000;

class CfgError extends Error {}

function tokenize(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
    } else if (char === '{' || char === '}') {
      tokens.push({ brace: char });
      index += 1;
    } else if (char === '"') {
      index += 1;
      let value = '';
      let closed = false;
      while (index < text.length) {
        const current = text[index++];
        if (current === '"') {
          closed = true;
          break;
        }
        if (current === '\\' && index < text.length) {
          const escaped = text[index++];
          value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        } else {
          value += current;
        }
      }
      if (!closed) throw new CfgError('unterminated-string');
      tokens.push({ text: value });
    } else {
      throw new CfgError('unexpected-token');
    }
    if (tokens.length > MAX_TOKENS) throw new CfgError('too-many-tokens');
  }
  return tokens;
}

// Objects are built on a null prototype so a key named __proto__ is data, not a setter.
function buildObject(tokens, state, depth) {
  if (depth > MAX_DEPTH) throw new CfgError('max-depth');
  const result = Object.create(null);
  while (state.index < tokens.length) {
    const key = tokens[state.index++];
    if (key.brace === '}') {
      if (depth === 0) throw new CfgError('unexpected-close-brace');
      return result;
    }
    if (key.brace) throw new CfgError('unexpected-open-brace');
    if (state.index >= tokens.length) throw new CfgError('missing-value');
    const next = tokens[state.index++];
    if (next.brace === '{') result[key.text] = buildObject(tokens, state, depth + 1);
    else if (next.brace === '}') throw new CfgError('unexpected-close-brace');
    else result[key.text] = next.text;
  }
  if (depth > 0) throw new CfgError('missing-close-brace');
  return result;
}

// { ok, value } or { ok: false, reason }. Never throws: the file is written by a game, not by us.
function parseKeyValues(rawText) {
  try {
    const text = String(rawText == null ? '' : rawText).replace(/^﻿/, '');
    return { ok: true, value: buildObject(tokenize(text), { index: 0 }, 0) };
  } catch (err) {
    return { ok: false, reason: err instanceof CfgError ? err.message : 'parse-failed' };
  }
}

function normalizeEpochSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric >= 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function isEarned(value) {
  return ['1', 'true', 'yes'].includes(String(value == null ? '' : value).trim().toLowerCase());
}

// Ids are compared as plain decimals everywhere else, so "007" and "7" are one achievement.
function normalizeAchievementId(raw) {
  const id = String(raw == null ? '' : raw).trim();
  return /^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, '') : '';
}

// { valid, reason, snapshot: { id: { earned, earned_time } } }. Locked entries are kept as earned:false.
function parseAchievementsCfg(rawText) {
  const parsed = parseKeyValues(rawText);
  if (!parsed.ok) return { valid: false, reason: parsed.reason, snapshot: {} };
  const root = parsed.value.achievements;
  if (!root || typeof root !== 'object') return { valid: false, reason: 'missing-achievements-root', snapshot: {} };

  const snapshot = {};
  for (const [rawId, entry] of Object.entries(root)) {
    const id = normalizeAchievementId(rawId);
    if (!id || !entry || typeof entry !== 'object') continue;
    const earned = isEarned(entry.earned);
    const time = entry.time != null ? entry.time : entry.earned_time;
    snapshot[id] = { earned, earned_time: earned ? normalizeEpochSeconds(time) : 0 };
  }
  return { valid: true, reason: null, snapshot };
}

function readAchievementsFile(filePath) {
  try {
    if (!filePath) return { valid: false, reason: 'missing', snapshot: {} };
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { valid: false, reason: 'not-file', snapshot: {} };
    if (stat.size > MAX_FILE_BYTES) return { valid: false, reason: 'too-large', snapshot: {} };
    return parseAchievementsCfg(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { valid: false, reason: err && err.code === 'ENOENT' ? 'missing' : 'unreadable', snapshot: {} };
  }
}

function documentsFolders() {
  const folders = [];
  const add = (dir) => {
    if (dir && !folders.some((known) => known.toLowerCase() === dir.toLowerCase())) folders.push(dir);
  };
  // Documents is often redirected (OneDrive), so the shell folder comes first.
  try {
    const { readRegistryStringAndExpand } = require(path.join(__dirname, '..', 'util', 'reg.js'));
    add(readRegistryStringAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal'));
  } catch {
    /* unknown location: fall back to the profile guesses below */
  }
  if (process.env.USERPROFILE) add(path.join(process.env.USERPROFILE, 'Documents'));
  if (process.env.OneDrive) add(path.join(process.env.OneDrive, 'Documents'));
  return folders;
}

// Default roots, existing or not: the Watchdog arms the ones that appear later.
function defaultRoots(documents = documentsFolders()) {
  return documents.map((dir) => path.join(dir, 'RUNE', 'Ubisoft Connect'));
}

// Accepts the `RUNE\Ubisoft Connect` folder or its `achievements` child, in any casing.
function resolveAchievementsRoot(rootPath) {
  const resolved = rootPath ? path.resolve(String(rootPath)) : '';
  if (!resolved) return '';
  const parts = resolved.toLowerCase().split(/[\\/]+/).filter(Boolean);
  const tail = parts.slice(-3);
  if (tail.length === 3 && tail[0] === 'rune' && tail[1] === 'ubisoft connect' && tail[2] === 'achievements') return resolved;
  if (tail.length >= 2 && tail[tail.length - 2] === 'rune' && tail[tail.length - 1] === 'ubisoft connect') {
    return path.join(resolved, 'achievements');
  }
  return '';
}

function listDirectories(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return [];
  }
}

// Every <user>\<product>\achievements.cfg under the given roots, bounded.
function discoverFiles(roots = defaultRoots()) {
  const found = [];
  const seen = new Set();
  for (const root of roots) {
    const achievementsRoot = resolveAchievementsRoot(root);
    if (!achievementsRoot) continue;
    for (const user of listDirectories(achievementsRoot).slice(0, MAX_USERS)) {
      const userDir = path.join(achievementsRoot, user.name);
      for (const product of listDirectories(userDir)) {
        if (!/^\d+$/.test(product.name)) continue;
        const file = path.join(userDir, product.name, CFG_NAME);
        let mtimeMs = 0;
        try {
          const stat = fs.statSync(file);
          if (!stat.isFile()) continue;
          mtimeMs = stat.mtimeMs;
        } catch {
          continue;
        }
        const key = file.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ uplayId: normalizeAchievementId(product.name), userId: user.name, file, mtimeMs });
        if (found.length >= MAX_PRODUCTS) return found;
      }
    }
  }
  return found;
}

// One discovery record per product; several users of one product are read together.
function scan(roots = defaultRoots()) {
  const byProduct = new Map();
  for (const entry of discoverFiles(roots)) {
    const known = byProduct.get(entry.uplayId);
    if (known) known.files.push(entry);
    else byProduct.set(entry.uplayId, { uplayId: entry.uplayId, files: [entry] });
  }
  return [...byProduct.values()].map(({ uplayId, files }) => {
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return {
      appid: `uplay-${uplayId}`,
      source: 'RUNE Uplay',
      data: {
        type: 'runeUplay',
        uplayId,
        path: path.dirname(files[0].file),
        files: files.map((entry) => entry.file),
        userId: files[0].userId,
      },
    };
  });
}

// Earned entries only, the earliest time winning when several users unlocked the same one.
function getAchievements(data) {
  const files = data && Array.isArray(data.files) ? data.files : data && data.path ? [path.join(data.path, CFG_NAME)] : [];
  const merged = {};
  for (const file of files) {
    for (const [id, entry] of Object.entries(readAchievementsFile(file).snapshot)) {
      if (!entry.earned) continue;
      const known = merged[id];
      if (!known || (entry.earned_time && (!known.earned_time || entry.earned_time < known.earned_time))) merged[id] = entry;
    }
  }
  return merged;
}

module.exports = {
  SOURCE,
  CFG_NAME,
  MAX_FILE_BYTES,
  parseKeyValues,
  parseAchievementsCfg,
  readAchievementsFile,
  normalizeAchievementId,
  documentsFolders,
  defaultRoots,
  resolveAchievementsRoot,
  discoverFiles,
  scan,
  getAchievements,
};
