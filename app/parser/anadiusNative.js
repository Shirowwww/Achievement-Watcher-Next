'use strict';

/*
  anadius' LSX emulator (EA cracks) always records unlocks in its own achievement-<set>.xml, and
  writes the achievement_watcher\<steam appid>\achievements.ini export only when anadius.cfg names a
  Steam appid. This bridge writes that export from the XML, so the library and the Watchdog read it
  unchanged. The XML holds display names; the Steam schema maps them to api names.
*/

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('../util/replaceFile.js');

const MARKER = '; written by AW Next from ';
const NATIVE_FILE = /^achievement-.+\.xml$/i;
const EXPORT_DIR = 'achievement_watcher';
const EXPORT_FILE = 'achievements.ini';
const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] !== '#') return Object.hasOwn(NAMED_ENTITIES, ref.toLowerCase()) ? NAMED_ENTITIES[ref.toLowerCase()] : whole;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return whole;
    }
  });
}

function readAttributes(text) {
  const attrs = {};
  for (const match of text.matchAll(/([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = decodeEntities(match[2] ?? match[3]);
  }
  return attrs;
}

// Grant is local time without a zone; a value that carries one is read as written.
function grantSeconds(value) {
  const text = String(value || '').trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  const ms = local ? new Date(+local[1], local[2] - 1, +local[3], +local[4], +local[5], +local[6]).getTime() : Date.parse(text);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

function parseNativeXml(text) {
  if (typeof text !== 'string') return null;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const root = /<Achievements\b([^>]*)>/.exec(body);
  if (!root) return null;
  const rootAttrs = readAttributes(root[1]);
  const achievements = [];
  for (const match of body.matchAll(/<Achievement\b([^>]*?)\/?>/g)) {
    const attrs = readAttributes(match[1]);
    if (!attrs.Name && !attrs.Id) continue;
    achievements.push({
      id: attrs.Id || '',
      name: attrs.Name || '',
      grant: grantSeconds(attrs.Grant),
      count: Number(attrs.Count) || 0,
      progress: Number(attrs.Progress) || 0,
    });
  }
  return { gameName: rootAttrs.GameName || '', contentId: rootAttrs.ContentId || '', achievements };
}

// Case, spacing, trademark signs and punctuation differ between EA's and Steam's spelling of a name.
function normalizeName(name) {
  return String(name || '')
    .replace(/[™®©]/g, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// { displayName: apiName } -> { normalized: apiName }; a name two achievements share maps to neither.
function buildNameMap(displayToApi) {
  const map = {};
  const shared = new Set();
  for (const [display, api] of Object.entries(displayToApi || {})) {
    const key = normalizeName(display);
    if (!key || !api) continue;
    if (Object.hasOwn(map, key) && map[key] !== api) shared.add(key);
    map[key] = String(api);
  }
  for (const key of shared) delete map[key];
  return map;
}

// Own keys only: a name like "Constructor" must not find Object.prototype's function.
function apiFor(nameToApi, name) {
  const key = normalizeName(name);
  return nameToApi && Object.hasOwn(nameToApi, key) ? nameToApi[key] : undefined;
}

/*
  The prefix every Steam name shares before a trailing number (EA SPORTS FC: Achievement_GOSCC_<EA
  id>), so a name in another language still finds its achievement by id. Off unless every Steam
  name has that shape, at least one name match confirms the numbering and none contradicts it.
*/
function idPrefix(achievements, nameToApi) {
  const apis = Object.values(nameToApi || {});
  const shapes = apis.map((api) => /^(.*\D)(\d+)$/.exec(String(api)));
  if (apis.length < 2 || shapes.some((shape) => !shape || shape[1] !== shapes[0][1])) return null;
  const prefix = shapes[0][1];
  let confirmed = 0;
  for (const achievement of achievements) {
    const api = apiFor(nameToApi, achievement.name);
    if (!api) continue;
    if (api !== `${prefix}${Number(achievement.id)}`) return null;
    confirmed += 1;
  }
  return confirmed > 0 ? { prefix, apis: new Set(apis) } : null;
}

// An entry whose progress is short of its target is a counter on its way, not an unlock.
function exportLines(api, achievement) {
  const { count, progress } = achievement;
  if (count > 1 && progress < count) return ['', `[${api}]`, 'Achieved=0', `CurProgress=${progress}`, `MaxProgress=${count}`];
  return ['', `[${api}]`, 'Achieved=1', `UnlockTime=${achievement.grant || 0}`];
}

function apiById(fallback, id) {
  if (!fallback || !/^\d+$/.test(String(id))) return undefined;
  const api = `${fallback.prefix}${Number(id)}`;
  return fallback.apis.has(api) ? api : undefined;
}

function toExportIni(achievements, nameToApi, sourceFile) {
  const lines = [`${MARKER}${path.basename(String(sourceFile || ''))}`];
  const unmatched = [];
  const fallback = idPrefix(achievements, nameToApi);
  for (const achievement of achievements) {
    const api = apiFor(nameToApi, achievement.name) || apiById(fallback, achievement.id);
    if (!api) {
      unmatched.push(achievement.name || achievement.id);
      continue;
    }
    lines.push(...exportLines(api, achievement));
  }
  return { text: `${lines.join('\n')}\n`, unmatched };
}

function isOwnedByEmulator(existingText) {
  const text = String(existingText || '').replace(/^﻿/, '');
  return text.trim() !== '' && !text.startsWith(MARKER);
}

function exportFile(nativeDir, appid) {
  return path.join(nativeDir, EXPORT_DIR, String(appid), EXPORT_FILE);
}

// 'written', 'unchanged', or 'owned' when the emulator writes this export itself.
function writeExport(file, text) {
  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch {
    /* no export yet */
  }
  if (isOwnedByEmulator(existing)) return 'owned';
  if (existing === text) return 'unchanged';
  writeFileAtomicSync(file, text);
  return 'written';
}

function convert(xmlPath, parsed, entry) {
  const { text, unmatched } = toExportIni(parsed.achievements, entry.names || {}, xmlPath);
  const status = writeExport(exportFile(path.dirname(xmlPath), entry.appid), text);
  return { file: xmlPath, appid: entry.appid, status, unmatched };
}

function readMap(mapFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function listNativeFiles(nativeDir) {
  try {
    return fs
      .readdirSync(nativeDir, { withFileTypes: true })
      .filter((ent) => ent.isFile() && NATIVE_FILE.test(ent.name))
      .map((ent) => path.join(nativeDir, ent.name));
  } catch {
    return [];
  }
}

function readParsed(xmlPath) {
  try {
    return parseNativeXml(fs.readFileSync(xmlPath, 'utf8'));
  } catch {
    return null;
  }
}

// The map entry of one XML: the stored one while it still covers every name, else resolved again.
async function mapEntry(parsed, stored, { resolveAppid, namesFor }) {
  let entry = stored && stored.gameName === parsed.gameName && stored.appid ? stored : null;
  if (!entry) {
    const appid = parsed.gameName ? await resolveAppid(parsed.gameName) : null;
    if (!appid) return null;
    entry = { appid: String(appid), gameName: parsed.gameName, names: {} };
  }
  const names = entry.names || {};
  const missing = !Object.keys(names).length || parsed.achievements.some((a) => !apiFor(names, a.name));
  if (missing) entry = { ...entry, names: { ...names, ...buildNameMap(await namesFor(entry.appid)) } };
  return entry;
}

async function bridge({ nativeDirs, resolveAppid, namesFor, mapFile, log = () => {} }) {
  const stored = readMap(mapFile);
  const next = { ...stored };
  const results = [];
  for (const xmlPath of nativeDirs.flatMap(listNativeFiles)) {
    const key = path.basename(xmlPath);
    const parsed = readParsed(xmlPath);
    if (!parsed) {
      log(`[anadius] ${xmlPath} is not an LSX achievement file`);
      continue;
    }
    try {
      const entry = await mapEntry(parsed, next[key], { resolveAppid, namesFor });
      if (!entry) {
        log(`[anadius] no Steam appid for "${parsed.gameName}" (${key})`);
        continue;
      }
      next[key] = entry;
      const result = convert(xmlPath, parsed, entry);
      if (result.unmatched.length) log(`[anadius] ${key}: no Steam achievement named ${result.unmatched.map((n) => `"${n}"`).join(', ')}`);
      if (result.status !== 'unchanged') log(`[anadius] ${key} -> ${entry.appid}: ${result.status}`);
      results.push(result);
    } catch (err) {
      log(`[anadius] ${key} not converted: ${err && err.message ? err.message : err}`);
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(stored)) writeFileAtomicSync(mapFile, JSON.stringify(next, null, 2));
  return results;
}

// The Watchdog's side: offline, from the map the last library scan wrote.
function convertFromMap({ xmlPath, mapFile }) {
  const entry = readMap(mapFile)[path.basename(xmlPath)];
  if (!entry || !entry.appid) return { file: xmlPath, status: 'unmapped', unmatched: [] };
  const parsed = readParsed(xmlPath);
  if (!parsed) return { file: xmlPath, status: 'unreadable', unmatched: [] };
  return convert(xmlPath, parsed, entry);
}

function mapFileIn(userDataRoot) {
  return path.join(userDataRoot, 'cfg', 'anadiusNames.json');
}

module.exports = {
  NATIVE_FILE,
  parseNativeXml,
  normalizeName,
  buildNameMap,
  toExportIni,
  isOwnedByEmulator,
  exportFile,
  bridge,
  convertFromMap,
  mapFileIn,
};
