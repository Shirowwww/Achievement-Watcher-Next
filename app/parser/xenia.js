'use strict';

// Xenia (Xbox 360 emulator) reader: schema, unlock state and icons all live in the binary GPD/XDBF
// file; icons are extracted to the cache and served via file://.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { userDataDir } = require('../util/userDataPath.js');

const binary = ['xenia.exe', 'xenia_canary.exe'];

const cacheRoot = path.join(userDataDir(), 'icon_cache', 'xenia');

const XDBF_HEADER_SIZE = 0x18;
const ENTRY_SIZE = 0x12;
const FREE_ENTRY_SIZE = 0x08;
const ACHIEVEMENT_NAMESPACE = 1;
const STRING_NAMESPACE = 5;
const IMAGE_NAMESPACE = 2;
const TITLE_STRING_ID = 0x8000;
const ACHIEVEMENT_EARNED_FLAG = 0x20000;
const ACHIEVEMENT_STRUCT_SIZE = 0x1c;
// Namespace-1 entries whose id is 0x100000000 / 0x200000000 are the sync lists Xenia writes next to
// the achievements; parsed as achievement structs they yield garbage that outscored the real entries.
const SYNC_ENTRY_IDS = new Set(['4294967296', '8589934592']);

const FILETIME_EPOCH_DIFF_MS = 11644473600000n; // 1601 -> 1970
const DOTNET_EPOCH_DIFF_MS = 62135596800000n; // 0001 -> 1970

function readUInt64LE(buf, offset) {
  return (BigInt(buf.readUInt32LE(offset + 4)) << 32n) | BigInt(buf.readUInt32LE(offset));
}
function readUInt64BE(buf, offset) {
  return (BigInt(buf.readUInt32BE(offset)) << 32n) | BigInt(buf.readUInt32BE(offset + 4));
}
function decodeUtf16Be(buffer) {
  if (!buffer || buffer.length === 0) return '';
  const swapped = Buffer.from(buffer);
  for (let i = 0; i + 1 < swapped.length; i += 2) {
    const tmp = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = tmp;
  }
  return swapped.toString('utf16le').replace(/\u0000+$/, '').trim();
}

// `terminated` separates "an empty description" (a NUL right away, which is normal and common) from
// "the payload ran out mid-string", which only happens when the read started at the wrong offset.
function readUtf16BeNullTerminated(buffer, offset) {
  if (!buffer || offset >= buffer.length) return { text: '', nextOffset: offset, terminated: false };
  const bytes = [];
  let cursor = offset;
  let terminated = false;
  while (cursor + 1 < buffer.length) {
    const code = buffer.readUInt16BE(cursor);
    cursor += 2;
    if (code === 0) {
      terminated = true;
      break;
    }
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return { text: decodeUtf16Be(Buffer.from(bytes)), nextOffset: cursor, terminated };
}

function normalizeUnlockTime(raw) {
  if (raw === null || raw === undefined) return 0;
  const value = typeof raw === 'bigint' ? raw : BigInt(raw);
  if (value <= 0n) return 0;
  const filetimeMs = value / 10000n - FILETIME_EPOCH_DIFF_MS;
  if (filetimeMs > 946684800000n && filetimeMs < 4102444800000n) return Number(filetimeMs);
  const dotnetMs = value / 10000n - DOTNET_EPOCH_DIFF_MS;
  if (dotnetMs > 946684800000n && dotnetMs < 4102444800000n) return Number(dotnetMs);
  return Number(filetimeMs);
}

function parseHeader(buffer) {
  if (buffer.length < XDBF_HEADER_SIZE) return null;
  if (buffer.slice(0, 4).toString('ascii') !== 'XDBF') return null;
  const be = {
    version: buffer.readUInt32BE(0x04), entryTableLength: buffer.readUInt32BE(0x08),
    entryCount: buffer.readUInt32BE(0x0c), freeTableLength: buffer.readUInt32BE(0x10),
    freeCount: buffer.readUInt32BE(0x14), endian: 'be',
  };
  const le = {
    version: buffer.readUInt32LE(0x04), entryTableLength: buffer.readUInt32LE(0x08),
    entryCount: buffer.readUInt32LE(0x0c), freeTableLength: buffer.readUInt32LE(0x10),
    freeCount: buffer.readUInt32LE(0x14), endian: 'le',
  };
  const beOk = be.version >= 0x00010000 && be.version <= 0x00020000;
  const leOk = le.version >= 0x00010000 && le.version <= 0x00020000;
  if (beOk && !leOk) return be;
  if (leOk && !beOk) return le;
  return beOk ? be : le;
}

function resolveTableSizes(header, fileSize) {
  let entryEntries = header.entryTableLength;
  let freeEntries = header.freeTableLength;
  if (header.endian === 'be') {
    const baseData = XDBF_HEADER_SIZE + entryEntries * ENTRY_SIZE + freeEntries * FREE_ENTRY_SIZE;
    if (baseData > fileSize || header.entryCount > entryEntries) {
      if (header.entryTableLength % ENTRY_SIZE === 0) entryEntries = header.entryTableLength / ENTRY_SIZE;
      if (header.freeTableLength % FREE_ENTRY_SIZE === 0) freeEntries = header.freeTableLength / FREE_ENTRY_SIZE;
    }
  } else {
    const entryIsBytes =
      header.entryTableLength % ENTRY_SIZE === 0 && header.entryCount > 0 &&
      header.entryTableLength >= header.entryCount * ENTRY_SIZE;
    const freeIsBytes =
      header.freeTableLength % FREE_ENTRY_SIZE === 0 && header.freeCount > 0 &&
      header.freeTableLength >= header.freeCount * FREE_ENTRY_SIZE;
    entryEntries = entryIsBytes ? header.entryTableLength / ENTRY_SIZE : header.entryTableLength;
    freeEntries = freeIsBytes ? header.freeTableLength / FREE_ENTRY_SIZE : header.freeTableLength;
  }
  const baseData = XDBF_HEADER_SIZE + entryEntries * ENTRY_SIZE + freeEntries * FREE_ENTRY_SIZE;
  return { entryEntries, freeEntries, baseData };
}

function parseXdbfEntries(buffer) {
  if (buffer.length < XDBF_HEADER_SIZE) return [];
  const header = parseHeader(buffer);
  if (!header) return [];
  const { entryEntries, baseData } = resolveTableSizes(header, buffer.length);
  const totalEntries =
    header.entryCount > 0 && header.entryCount <= entryEntries ? header.entryCount : entryEntries;

  const entries = [];
  const readU16 = header.endian === 'be' ? 'readUInt16BE' : 'readUInt16LE';
  const readU32 = header.endian === 'be' ? 'readUInt32BE' : 'readUInt32LE';
  for (let i = 0; i < totalEntries; i += 1) {
    const base = XDBF_HEADER_SIZE + i * ENTRY_SIZE;
    if (base + ENTRY_SIZE > buffer.length) break;
    const namespace = buffer[readU16](base);
    const id = header.endian === 'be' ? readUInt64BE(buffer, base + 2) : readUInt64LE(buffer, base + 2);
    const offset = buffer[readU32](base + 10);
    const length = buffer[readU32](base + 14);
    if (!length) continue;
    const absoluteOffset = baseData + offset;
    if (absoluteOffset < 0 || absoluteOffset + length > buffer.length) continue;
    entries.push({ namespace, id, offset: absoluteOffset, length });
  }
  entries.__endian = header.endian;
  return entries;
}

/*
  XACHIEVEMENT is a fixed 0x1c header followed by three UTF-16BE strings, in this order: label, the
  description shown once earned, then the one shown while still locked. Reading them the other way
  round swapped every pair of descriptions, and trusting the header's own structSize as the string
  start meant one wrong byte pushed the read past the label and lost the achievement entirely.
*/
function parseAchievementPayload(buffer, endian = 'be', entryId = null) {
  if (!buffer || buffer.length < ACHIEVEMENT_STRUCT_SIZE) return null;
  const readU32 = endian === 'be' ? 'readUInt32BE' : 'readUInt32LE';
  const nameRes = readUtf16BeNullTerminated(buffer, ACHIEVEMENT_STRUCT_SIZE);
  const unlockedRes = readUtf16BeNullTerminated(buffer, nameRes.nextOffset);
  const lockedRes = readUtf16BeNullTerminated(buffer, unlockedRes.nextOffset);
  return {
    structSize: buffer[readU32](0x00),
    payloadLength: buffer.length,
    entryId: entryId === null || entryId === undefined ? null : String(entryId),
    achievementId: buffer[readU32](0x04),
    imageId: buffer[readU32](0x08),
    gamerscore: buffer[readU32](0x0c),
    flags: buffer[readU32](0x10),
    unlockRaw: endian === 'be' ? readUInt64BE(buffer, 0x14) : readUInt64LE(buffer, 0x14),
    name: nameRes.text, lockedDescription: lockedRes.text, unlockedDescription: unlockedRes.text,
    stringsTerminated: nameRes.terminated && unlockedRes.terminated && lockedRes.terminated,
  };
}

function parseGpdBuffer(raw, filePath) {
  const entries = parseXdbfEntries(raw);
  const endian = entries.__endian || 'le';
  const achievements = [];
  const imagesById = new Map();
  let title = '';
  for (const entry of entries) {
    const payload = raw.slice(entry.offset, entry.offset + entry.length);
    if (entry.namespace === ACHIEVEMENT_NAMESPACE) {
      // The two sync entries share the achievement namespace but hold a sync list, not a struct.
      if (SYNC_ENTRY_IDS.has(String(entry.id))) continue;
      const parsed = parseAchievementPayload(payload, endian, entry.id);
      if (parsed) achievements.push(parsed);
    } else if (entry.namespace === IMAGE_NAMESPACE) {
      imagesById.set(String(entry.id), Buffer.from(payload));
    } else if (entry.namespace === STRING_NAMESPACE && Number(entry.id) === TITLE_STRING_ID) {
      title = decodeUtf16Be(payload);
    }
  }
  return { filePath, title: title || path.basename(filePath, path.extname(filePath)), achievements, imagesById };
}

const txt = (v) => String(v || '').trim();
const uint32 = (v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 0xffffffff;

/*
  Validated on structure, not on content. Requiring all three strings to be non-empty and every
  numeric field to be non-zero dropped legitimate achievements: a locked description is routinely
  empty, and a 0-gamerscore or unflagged achievement is perfectly valid. What actually separates a
  real struct from a misread one is its header (a 0x1c size that fits the payload), strings that all
  terminate inside it, and an entry id that repeats the achievement id.
*/
function isValidAchievement(a) {
  if (!a || typeof a !== 'object') return false;
  if (!uint32(a.achievementId) || !uint32(a.imageId) || !uint32(a.gamerscore) || !uint32(a.flags)) return false;
  if (a.stringsTerminated === false) return false;
  if (a.structSize !== undefined) {
    const structSize = Number(a.structSize);
    const payloadLength = Number(a.payloadLength);
    if (structSize !== ACHIEVEMENT_STRUCT_SIZE) return false;
    if (Number.isFinite(payloadLength) && structSize > payloadLength) return false;
  }
  if (a.entryId === null || a.entryId === undefined) return true;
  try {
    return BigInt(a.entryId) === BigInt(a.achievementId);
  } catch {
    return false;
  }
}

function score(a) {
  return (
    txt(a?.name).length + txt(a?.lockedDescription).length + txt(a?.unlockedDescription).length +
    (Number(a?.flags || 0) > 0 ? 1000 : 0) + (Number(a?.imageId || 0) > 0 ? 1000 : 0) +
    ((Number(a?.flags || 0) & ACHIEVEMENT_EARNED_FLAG) !== 0 ? 10 : 0)
  );
}

function validAchievements(parsed) {
  const byId = new Map();
  for (const a of parsed?.achievements || []) {
    if (!isValidAchievement(a)) continue;
    const key = String(a.achievementId ?? '').trim();
    if (!key) continue;
    const existing = byId.get(key);
    if (!existing || score(a) > score(existing)) byId.set(key, a);
  }
  return [...byId.values()];
}

const titleIdFromPath = (gpdPath) => path.basename(path.dirname(path.dirname(gpdPath))); // .../<titleID>/00000001/<file>.gpd

/*
  Xenia writes its config beside the binary and lets the user move the profile/content tree with
  `storage_root` / `content_root`. Reading those two keys is what makes a relocated tree findable:
  the old assumption of <dir>/content was simply wrong for anyone who set them, and the scan came
  back empty with nothing to explain why. Values are read from any xenia*.config.toml in the folder,
  since the stable and canary builds use different file names.
*/
function tomlString(text, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(".*?"|'.*?')\\s*$`, 'm').exec(String(text || ''));
  if (!match) return '';
  const raw = match[1].slice(1, -1).trim();
  // The TOML basic string escapes a Windows separator; a literal string does not.
  return match[1][0] === '"' ? raw.replace(/\\\\/g, '\\') : raw;
}

async function configuredStorageRoots(dir) {
  let names;
  try {
    names = (await fsp.readdir(dir)).filter((name) => /^xenia.*\.config\.toml$/i.test(name));
  } catch {
    return [];
  }
  const roots = [];
  for (const name of names) {
    let text;
    try {
      text = await fsp.readFile(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const key of ['content_root', 'storage_root']) {
      const value = tomlString(text, key);
      if (!value) continue;
      // storage_root holds the whole profile tree; the GPDs live in its content/ subfolder.
      const resolved = path.resolve(dir, value);
      roots.push(key === 'storage_root' ? path.join(resolved, 'content') : resolved);
    }
  }
  return roots;
}

module.exports.scan = async (dir) => {
  // Lazy-require fast-glob to keep parity with the other parsers (already a dependency).
  const glob = require('fast-glob');
  const data = [];
  const seen = new Set();

  const contentRoots = [];
  const pushRoot = (root) => {
    if (!root || contentRoots.some((existing) => existing.toLowerCase() === root.toLowerCase())) return;
    contentRoots.push(root);
  };
  for (const root of await configuredStorageRoots(dir)) {
    if (await exists(root)) pushRoot(root);
  }
  if (await exists(path.join(dir, 'content'))) pushRoot(path.join(dir, 'content'));
  if (path.basename(dir).toLowerCase() === 'content') pushRoot(dir);
  if (contentRoots.length === 0) return data;

  for (const content of contentRoots) {
    let gpds;
    try {
      // <XUID>/<titleID>/00000001/<file>.gpd
      gpds = await glob('*/*/00000001/*.{gpd,GPD}', { cwd: content, onlyFiles: true, absolute: true, suppressErrors: true });
    } catch {
      continue;
    }
    for (const gpd of gpds) {
      const titleId = titleIdFromPath(gpd);
      const stem = path.basename(gpd, path.extname(gpd));
      // The per-title achievement GPD is named after its titleID; skip the dashboard/profile GPDs.
      if (stem.toLowerCase() !== titleId.toLowerCase()) continue;
      if (seen.has(titleId)) continue;
      seen.add(titleId);
      data.push({ appid: titleId, source: 'Xenia Emulator', data: { type: 'xenia', path: gpd } });
    }
  }

  return data;
};

function exists(p) {
  return fsp.access(p).then(() => true).catch(() => false);
}

module.exports.getGameData = async (gpdPath) => {
  const raw = await fsp.readFile(gpdPath);
  const parsed = parseGpdBuffer(raw, gpdPath);
  const titleId = titleIdFromPath(gpdPath);
  const valid = validAchievements(parsed);

  // Extract embedded achievement icons to the cache so the UI can render them via file:///.
  const iconDir = path.join(cacheRoot, titleId);
  let iconsWritten = false;
  try {
    await fsp.mkdir(iconDir, { recursive: true });
    iconsWritten = true;
  } catch {
    /* fall back to no icons */
  }

  const list = [];
  for (const a of valid) {
    const locked = txt(a.lockedDescription);
    const unlocked = txt(a.unlockedDescription) || locked;
    const hidden = (a.flags & 0x8) === 0 ? 1 : 0;
    let icon = '';
    const buf = parsed.imagesById.get(String(a.imageId));
    if (iconsWritten && buf && buf.length > 0) {
      const iconPath = path.join(iconDir, `${a.imageId}.png`);
      try {
        if (!fs.existsSync(iconPath)) await fsp.writeFile(iconPath, buf);
        icon = 'file:///' + iconPath.replace(/\\/g, '/');
      } catch {
        /* leave icon empty */
      }
    }
    list.push({
      name: String(a.achievementId),
      displayName: txt(a.name) || String(a.achievementId),
      description: unlocked,
      hidden,
      gamerscore: a.gamerscore,
      icon,
      icongray: icon,
    });
  }

  return {
    name: parsed.title || titleId,
    appid: titleId,
    system: 'xbox',
    img: { header: list.find((x) => x.icon)?.icon },
    achievement: {
      total: list.length,
      list,
    },
  };
};

module.exports.getAchievements = async (gpdPath) => {
  const raw = await fsp.readFile(gpdPath);
  const parsed = parseGpdBuffer(raw, gpdPath);
  return validAchievements(parsed).map((a) => {
    const earned = (a.flags & ACHIEVEMENT_EARNED_FLAG) !== 0;
    return {
      id: String(a.achievementId),
      achieved: earned,
      earned_time: earned ? Math.floor(normalizeUnlockTime(a.unlockRaw) / 1000) : 0, // ms -> unix seconds
    };
  });
};

/*
  Relock every achievement in a GPD in place: deleting the file would lose the whole achievement list
  (same file holds both), so each payload is edited where it lies (flags bit 0x10 cleared, timestamp
  zeroed) with no length change, keeping the entry/free tables and strings valid. Returns the buffer
  and how many were earned before.
*/
function clearGpdBuffer(raw) {
  if (!Buffer.isBuffer(raw)) return { buffer: raw, cleared: 0 };
  const entries = parseXdbfEntries(raw);
  if (!entries.length) return { buffer: raw, cleared: 0 };
  const endian = entries.__endian || 'le';
  const readU32 = endian === 'be' ? 'readUInt32BE' : 'readUInt32LE';
  const writeU32 = endian === 'be' ? 'writeUInt32BE' : 'writeUInt32LE';

  const buffer = Buffer.from(raw);
  let cleared = 0;
  for (const entry of entries) {
    if (entry.namespace !== ACHIEVEMENT_NAMESPACE) continue;
    // Sync entries share the namespace but are not achievement structs: zeroing bytes 0x14-0x1c of
    // one would corrupt the sync list instead of relocking anything.
    if (SYNC_ENTRY_IDS.has(String(entry.id))) continue;
    // 0x1c is the smallest payload that still carries flags and the unlock time.
    if (entry.length < ACHIEVEMENT_STRUCT_SIZE || entry.offset + ACHIEVEMENT_STRUCT_SIZE > buffer.length) continue;
    const flagsAt = entry.offset + 0x10;
    const flags = buffer[readU32](flagsAt);
    if ((flags & ACHIEVEMENT_EARNED_FLAG) !== 0) cleared += 1;
    buffer[writeU32](flags & ~ACHIEVEMENT_EARNED_FLAG, flagsAt);
    buffer.fill(0, entry.offset + 0x14, entry.offset + ACHIEVEMENT_STRUCT_SIZE);
  }
  return { buffer, cleared };
}

module.exports.clearGpdBuffer = clearGpdBuffer;

// Exposed for unit testing the pure binary parser.
module.exports._internal = {
  parseGpdBuffer,
  validAchievements,
  normalizeUnlockTime,
  parseXdbfEntries,
  configuredStorageRoots,
  tomlString,
  ACHIEVEMENT_EARNED_FLAG,
};
