'use strict';

// Ubisoft Connect file-format readers shared by the app parser (ubisoftOfficial.js) and the
// Watchdog (ubisoftWatch.js): spool protobuf, achievement archive ZIP, localization text and the
// configurations index, and where the launcher keeps them. Never the network, so the Watchdog loads it.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { hostPaths, firstExisting } = require('../util/winHosts.js');
const ubisoftRegistry = require('../util/ubisoftRegistry.js');

// Ubisoft locale file names (en-US_loc.txt …) → the Steam API language names used app-wide.
const UBISOFT_LOCALE_MAP = new Map([
  ['en-us', 'english'], ['en-gb', 'english'], ['ar-sa', 'arabic'], ['bg-bg', 'bulgarian'],
  ['zh-cn', 'schinese'], ['zh-sg', 'schinese'], ['zh-tw', 'tchinese'], ['cs-cz', 'czech'],
  ['da-dk', 'danish'], ['nl-nl', 'dutch'], ['fi-fi', 'finnish'], ['fr-fr', 'french'],
  ['de-de', 'german'], ['el-gr', 'greek'], ['hu-hu', 'hungarian'], ['id-id', 'indonesian'],
  ['it-it', 'italian'], ['ja-jp', 'japanese'], ['ko-kr', 'koreana'], ['ko-ko', 'koreana'],
  ['ko', 'koreana'], ['nb-no', 'norwegian'], ['no-no', 'norwegian'], ['pl-pl', 'polish'],
  ['pt-pt', 'portuguese'], ['pt-br', 'brazilian'], ['ro-ro', 'romanian'], ['ru-ru', 'russian'],
  ['sk-sk', 'slovak'], ['es-es', 'spanish'], ['es-mx', 'latam'], ['es-419', 'latam'],
  ['sv-se', 'swedish'],
  ['th-th', 'thai'], ['tr-tr', 'turkish'], ['uk-ua', 'ukrainian'], ['vi-vn', 'vietnamese'],
]);

function readVarint(buffer, offset, end = buffer.length) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < end) {
    const byte = buffer[cursor];
    value += (byte & 0x7f) * 2 ** shift;
    cursor += 1;
    if ((byte & 0x80) === 0) return { value, nextOffset: cursor };
    shift += 7;
    if (shift > 49) throw 'ubisoft-official: varint too large';
  }
  throw 'ubisoft-official: truncated varint';
}

function skipProtoField(buffer, offset, wireType, end = buffer.length) {
  if (wireType === 0) return readVarint(buffer, offset, end).nextOffset;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) {
    const lenInfo = readVarint(buffer, offset, end);
    return lenInfo.nextOffset + lenInfo.value;
  }
  if (wireType === 5) return offset + 4;
  throw `ubisoft-official: unsupported wire type ${wireType}`;
}

function findFirstProtoVarint(buffer, targetField, start = 0, end = buffer.length, depth = 0) {
  let offset = start;
  while (offset < end) {
    const tagInfo = readVarint(buffer, offset, end);
    const fieldNumber = tagInfo.value >> 3;
    const wireType = tagInfo.value & 0x07;
    offset = tagInfo.nextOffset;
    if (wireType === 0) {
      const valueInfo = readVarint(buffer, offset, end);
      if (fieldNumber === targetField) return valueInfo.value;
      offset = valueInfo.nextOffset;
      continue;
    }
    if (wireType === 2) {
      const lenInfo = readVarint(buffer, offset, end);
      const payloadStart = lenInfo.nextOffset;
      const payloadEnd = payloadStart + lenInfo.value;
      if (depth < 4) {
        const nested = findFirstProtoVarint(buffer, targetField, payloadStart, payloadEnd, depth + 1);
        if (nested != null) return nested;
      }
      offset = payloadEnd;
      continue;
    }
    offset = skipProtoField(buffer, offset, wireType, end);
  }
  return null;
}

function normalizeEpochSeconds(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric >= 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

// Parse one <productId>.spool: repeated outer field-1 messages holding {1: achievementId, 2: time}.
function readUbisoftSpoolFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const records = [];
  const seen = new Set();
  let offset = 0;
  while (offset < buffer.length) {
    const tagInfo = readVarint(buffer, offset, buffer.length);
    const fieldNumber = tagInfo.value >> 3;
    const wireType = tagInfo.value & 0x07;
    offset = tagInfo.nextOffset;
    if (fieldNumber === 1 && wireType === 2) {
      const lenInfo = readVarint(buffer, offset, buffer.length);
      const payloadStart = lenInfo.nextOffset;
      const payloadEnd = payloadStart + lenInfo.value;
      const achievementId = findFirstProtoVarint(buffer, 1, payloadStart, payloadEnd);
      const earnedTime = findFirstProtoVarint(buffer, 2, payloadStart, payloadEnd);
      if (Number(achievementId) > 0 && Number(earnedTime) > 0) {
        const record = { achievementId: Number(achievementId), earned_time: normalizeEpochSeconds(earnedTime) };
        const dedupeKey = `${record.achievementId}:${record.earned_time}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          records.push(record);
        }
      }
      offset = payloadEnd;
      continue;
    }
    offset = skipProtoField(buffer, offset, wireType, buffer.length);
  }
  records.sort((a, b) => a.earned_time - b.earned_time);
  return { appid: path.basename(filePath, path.extname(filePath)), filePath, records };
}

let configurationsCache = { path: '', mtimeMs: 0, blocks: [] };

function normalizeQuotedText(value) {
  // The index quotes values with either kind of quote ("Watch Dogs: Legion" / 'Watch Dogs: Legion').
  return String(value || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function normalizeAchievementsSpec(value) {
  const raw = String(value || '').trim().replace(/^"+|"+$/g, '').replace(/[\\/]+/g, '/');
  if (!raw) return '';
  let base = path.posix.basename(raw).toLowerCase();
  if (base.endsWith('.zip')) base = base.slice(0, -4);
  const prefixed = base.match(/^\d+_(.+)$/);
  return prefixed ? prefixed[1] : base;
}

// The configurations index can name the LAUNCHER ("Steam", "Ubisoft Connect") instead of the game -
// treat known launcher names as "no title" so the real title wins.
const LAUNCHER_TITLE_BLOCKLIST = new Set([
  'steam',
  'uplay',
  'ubisoft',
  'ubisoft connect',
  'epic',
  'epic games',
  'epic games launcher',
  'ea',
  'ea app',
  'ea desktop',
  'origin',
  'rockstar',
  'rockstar games',
  'rockstar games launcher',
  'rockstar launcher',
  'social club',
  'gog',
  'galaxy',
]);

function isLauncherTitle(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[™®©]/g, '');
  return !v || LAUNCHER_TITLE_BLOCKLIST.has(v);
}

// `root.name` is very often an UNRESOLVED localization key rather than a name - real values seen in
// the index include "l1", "NAME", "RELATED_GAMENAME_116", "THUMBIMAGE". Using one as a title puts
// gibberish in the library; using one as a Steam search term produces a wrong match, which is worse.
const PLACEHOLDER_TITLES = new Set(['name', 'gamename', 'title', 'displayname', 'null', 'none']);
function isPlaceholderTitle(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (/^l\d+$/i.test(v)) return true; // localization slot ("l1")
  if (PLACEHOLDER_TITLES.has(v.toLowerCase())) return true;
  // SCREAMING_SNAKE placeholders. Plain all-caps titles ("UNO") have no underscore and are kept.
  return /_/.test(v) && v === v.toUpperCase() && !/[a-z]/.test(v);
}

function cleanTitle(value) {
  if (isLauncherTitle(value) || isPlaceholderTitle(value)) return '';
  return String(value || '').trim();
}

// A title distributed on several stores gets SEVERAL configuration blocks sharing one achievements
// spec: the real game block, plus one per storefront whose only name is the storefront itself
// ("root: name: Steam"). Picking the first match is a coin flip; merge them instead and take the
// first usable value per field, so a storefront-only block can only ever fill gaps.
function mergeConfigBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  if (!list.length) return null;

  const firstUsable = (field) => {
    for (const block of list) {
      const value = cleanTitle(block[field]);
      if (value) return value;
    }
    return '';
  };
  const firstRaw = (field) => {
    for (const block of list) {
      const value = String(block[field] || '').trim();
      if (value) return value;
    }
    return '';
  };

  const merged = {
    achievementsSpec: list[0].achievementsSpec,
    normalizedAchievementsSpec: list[0].normalizedAchievementsSpec,
    gameIdentifier: firstUsable('gameIdentifier'),
    displayName: firstUsable('displayName'),
    rootName: firstUsable('rootName'),
    sortString: firstUsable('sortString'),
    backgroundImage: firstRaw('backgroundImage'),
    logoImage: firstRaw('logoImage'),
    iconImage: firstRaw('iconImage'),
    // Which storefronts this spec appeared under. Not a title, but it does say "this product is
    // also sold on Steam", which is exactly the case the identity resolution has to handle.
    // `third_party_platform.name` states the same thing outright, so both signals feed one list.
    storefronts: [
      ...new Set(
        list
          .flatMap((b) => [b.rootName, b.thirdPartyPlatform])
          .map((n) => String(n || '').trim().toLowerCase())
          .filter((n) => LAUNCHER_TITLE_BLOCKLIST.has(n))
      ),
    ],
  };
  merged.title = merged.gameIdentifier || merged.displayName || merged.rootName || '';
  return merged;
}

function readConfigurationBlocks(configurationsPath) {
  const filePath = String(configurationsPath || '').trim();
  if (!filePath || !fs.existsSync(filePath)) return [];
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return [];
  }
  if (configurationsCache.path === filePath && configurationsCache.mtimeMs === Number(stat.mtimeMs || 0)) {
    return configurationsCache.blocks;
  }

  let text = '';
  try {
    // The file is binary-framed with UTF-8 text payloads. Decoding it as latin1 mangled every
    // accented character in a title ("Assassin's Creed® Mirage" → "Assassin's CreedÂ® Mirage");
    // decoding as UTF-8 keeps titles correct and only produces replacement characters inside the
    // binary framing between blocks, which this parser never reads.
    text = fs.readFileSync(filePath).toString('utf8').replace(/\0/g, '');
  } catch {
    return [];
  }

  const blockRegex = /version:\s*[^\r\n]+\r?\nroot:\s*[\s\S]*?(?=(?:version:\s*[^\r\n]+\r?\nroot:)|$)/g;
  const blocks = [];
  let match = null;
  while ((match = blockRegex.exec(text))) {
    const block = String(match[0] || '');
    const achievementsSpec = normalizeQuotedText(block.match(/^\s*achievements:\s*([^\r\n]+)/m)?.[1] || '');
    if (!achievementsSpec) continue;
    const gameIdentifier = normalizeQuotedText(block.match(/^\s*game_identifier:\s*([^\r\n]+)/m)?.[1] || '');
    const displayName = normalizeQuotedText(block.match(/^\s*display_name:\s*([^\r\n]+)/m)?.[1] || '');
    // `root.name` is frequently a localization key ("l1", "NAME", "RELATED_GAMENAME_116") or the
    // storefront's own name, so it ranks below the installer's game_identifier and display_name.
    const rootName = normalizeQuotedText(block.match(/root:\s*[\s\S]*?\n\s+name:\s*([^\r\n]+)/m)?.[1] || '');
    // sort_string is a shelf-ordering key ("Assassin's Creed 05.1"); captured for completeness, but
    // not used as a name candidate (buildNameCandidates deliberately excludes it - franchise stems
    // like "Assassin's Creed" resolve to the wrong game).
    const sortString = normalizeQuotedText(block.match(/^\s*sort_string:\s*([^\r\n]+)/m)?.[1] || '');
    // The store the copy was actually bought from, stated by the block itself:
    //   third_party_platform:
    //     name: Steam
    // A Steam purchase that merely launches through Ubisoft Connect is still an owned Steam title,
    // and the library filter for those has to be able to see it.
    const thirdPartyPlatform = normalizeQuotedText(block.match(/^\s*third_party_platform:\s*\r?\n\s*name:\s*([^\r\n]+)/m)?.[1] || '');
    const backgroundImage = normalizeQuotedText(block.match(/^\s*background_image:\s*([^\r\n]+)/m)?.[1] || '');
    const logoImage = normalizeQuotedText(block.match(/^\s*logo_image:\s*([^\r\n]+)/m)?.[1] || '');
    const iconImage = normalizeQuotedText(block.match(/^\s*icon_image:\s*([^\r\n]+)/m)?.[1] || '');
    blocks.push({
      achievementsSpec,
      normalizedAchievementsSpec: normalizeAchievementsSpec(achievementsSpec),
      gameIdentifier,
      displayName,
      rootName,
      sortString,
      thirdPartyPlatform,
      backgroundImage,
      logoImage,
      iconImage,
      title: cleanTitle(gameIdentifier) || cleanTitle(displayName) || cleanTitle(rootName) || '',
    });
  }

  configurationsCache = { path: filePath, mtimeMs: Number(stat.mtimeMs || 0), blocks };
  return blocks;
}

// Minimal stored/deflate ZIP reader - the archives are plain ZIPs but carry no .zip extension, so
// going through the central directory directly avoids adm-zip's extension assumptions.
function readZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw 'ubisoft-official: zip EOCD not found';
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralEnd = centralDirectoryOffset + centralDirectorySize;
  const entries = new Map();
  let offset = centralDirectoryOffset;
  while (offset < centralEnd) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw 'ubisoft-official: invalid zip central entry';
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);
    entries.set(fileName, { compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  const readEntry = (entryName) => {
    const entry = entries.get(entryName);
    if (!entry) return null;
    const localOffset = entry.localHeaderOffset;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw 'ubisoft-official: invalid zip local entry';
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.compressionMethod === 0) return Buffer.from(compressed);
    if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);
    throw `ubisoft-official: unsupported zip compression ${entry.compressionMethod}`;
  };

  return { entries, readEntry };
}

function parseLocalizationText(buffer) {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const rawId = String(parts[0] || '').trim();
    if (!/^\d+$/.test(rawId)) continue;
    out.set(rawId.replace(/^0+(?=\d)/, ''), {
      displayName: String(parts[1] || '').trim(),
      description: parts.slice(2).join('\t').trim(),
    });
  }
  return out;
}

// Read one archive: per-locale id→{displayName, description} maps + id→png buffers.
function collectSchemaData(archivePath) {
  const zip = readZipEntries(archivePath);
  const localizations = new Map();
  const imageBuffers = new Map();

  for (const entryName of zip.entries.keys()) {
    const lower = entryName.toLowerCase();
    const locMatch = lower.match(/^([a-z]{2}(?:-[a-z]{2,4})?)_loc\.txt$/i);
    if (locMatch) {
      const localeKey = UBISOFT_LOCALE_MAP.get(locMatch[1]) || locMatch[1].replace(/[^a-z]/g, '');
      if (localeKey) localizations.set(localeKey, parseLocalizationText(zip.readEntry(entryName)));
      continue;
    }
    const pngMatch = lower.match(/^(\d+)\.png$/);
    if (pngMatch) imageBuffers.set(String(Number(pngMatch[1])), zip.readEntry(entryName));
  }

  const ids = new Set();
  for (const map of localizations.values()) for (const id of map.keys()) ids.add(id);
  if (!ids.size) for (const id of imageBuffers.keys()) ids.add(id);

  return {
    ids: Array.from(ids).sort((a, b) => Number(a) - Number(b)),
    localizations,
    imageBuffers,
  };
}

// The text for one achievement id: the wanted language, then English, then any locale that has it.
function pickLocalizedText(schema, language, id, field) {
  for (const key of [language, 'english']) {
    const entry = schema.localizations.get(key)?.get(id);
    if (entry && entry[field]) return entry[field];
  }
  for (const map of schema.localizations.values()) {
    const entry = map.get(id);
    if (entry && entry[field]) return entry[field];
  }
  return '';
}

// The launcher is installed once, in whichever host holds it (a Wine prefix on Linux).
const defaultSpoolRoot = () => firstExisting(hostPaths('LOCALAPPDATA', 'Ubisoft Game Launcher', 'spool'));
const defaultConfigurationsPath = () =>
  firstExisting(hostPaths('LOCALAPPDATA', 'Ubisoft Game Launcher', 'cache', 'configuration', 'configurations'));
/*
  Ubisoft Connect keeps the achievement archives under its OWN install folder, which the user chooses
  at install time - not under %ProgramData%, where only `cache\statistics` lives. Reading one fixed
  path made every archive invisible on a default install ("no cached achievements archive" for a
  product whose archive was on disk), so resolve the launcher from the registry first and keep the
  other known locations as fallbacks.
*/
let achievementsRootsCache = null;
function achievementsRoots(userDataRoot) {
  // The registry lookup can fall back to spawning reg.exe, and a scan asks for one product after
  // another; the launcher does not move mid-session.
  if (achievementsRootsCache) return achievementsRootsCache;
  const roots = [];
  const add = (dir) => {
    if (!dir) return;
    const full = path.join(String(dir).trim(), 'cache', 'achievements');
    if (!roots.some((entry) => entry.toLowerCase() === full.toLowerCase())) roots.push(full);
  };
  for (const dir of ubisoftRegistry.launcherDirs()) add(dir);
  for (const dir of hostPaths('PROGRAMDATA', 'Ubisoft', 'Ubisoft Game Launcher')) add(dir);
  for (const dir of [...hostPaths('PROGRAMFILES_X86', 'Ubisoft', 'Ubisoft Game Launcher'), ...hostPaths('PROGRAMFILES', 'Ubisoft', 'Ubisoft Game Launcher')]) add(dir);
  // Archives AW Next fetched itself live here, and are searched like any other root.
  if (userDataRoot) {
    const own = path.join(userDataRoot, 'cache', 'ubisoftAchievements');
    if (!roots.some((entry) => entry.toLowerCase() === own.toLowerCase())) roots.push(own);
  }
  achievementsRootsCache = roots;
  return roots;
}

// The roots are memoised and one of them is derived from the user data path.
function resetAchievementsRoots() {
  achievementsRootsCache = null;
}

// The local archive holding one product's achievements among `roots`: the one the launcher's
// configurations describe, else the newest. Throws when there is none.
function findAchievementsArchive(appid, { roots = [], configurationsPath } = {}) {
  const prefix = `${String(appid || '').trim()}_`;
  const existing = roots.filter((root) => root && fs.existsSync(root));
  if (!existing.length) throw 'ubisoft-official: achievements cache missing';
  const candidateFiles = [];
  for (const root of existing) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.startsWith(prefix)) candidateFiles.push(path.join(root, entry.name));
      }
    } catch {
      /* an unreadable root must not hide the others */
    }
  }
  if (!candidateFiles.length) throw 'ubisoft-official: archive missing';

  const blocks = readConfigurationBlocks(configurationsPath || defaultConfigurationsPath());
  let best = null;
  for (const filePath of candidateFiles) {
    const rawSpec = path.basename(filePath).slice(prefix.length);
    const normalizedSpec = normalizeAchievementsSpec(rawSpec);
    const metadata = mergeConfigBlocks(blocks.filter((block) => block.normalizedAchievementsSpec === normalizedSpec));
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {}
    const score = metadata ? 2 : 1;
    if (!best || score > best.score || (score === best.score && mtimeMs > best.mtimeMs)) {
      best = { archivePath: filePath, spec: rawSpec, metadata, score, mtimeMs };
    }
  }
  return { archivePath: best.archivePath, spec: best.spec || '', title: best.metadata?.title || '', metadata: best.metadata || null };
}

module.exports = {
  findAchievementsArchive,
  defaultSpoolRoot,
  defaultConfigurationsPath,
  achievementsRoots,
  resetAchievementsRoots,
  UBISOFT_LOCALE_MAP,
  LAUNCHER_TITLE_BLOCKLIST,
  readVarint,
  skipProtoField,
  findFirstProtoVarint,
  normalizeEpochSeconds,
  readUbisoftSpoolFile,
  normalizeQuotedText,
  normalizeAchievementsSpec,
  isLauncherTitle,
  isPlaceholderTitle,
  cleanTitle,
  mergeConfigBlocks,
  readConfigurationBlocks,
  readZipEntries,
  parseLocalizationText,
  collectSchemaData,
  pickLocalizedText,
};
