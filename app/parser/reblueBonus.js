'use strict';

/*
  re:Blue (Blue Dragon recompiled) adds achievements of its own, ids from 0x10001, saved in the same
  per-profile list as the game's. Their texts are re:Blue's src/engine/achievements/achievements.cpp
  (https://github.com/zolaware/reblue, BSD 3-Clause, Copyright (c) 2026, rexglue); their pictures are
  read from reblue.exe, which embeds each under achievements/0x<id>.png, else fetched from that release.
*/
const fs = require('fs');
const path = require('path');
const { isImageBuffer } = require(path.join(__dirname, '..', 'util', 'imageSniff.js'));

const TITLE_ID = '4D5307DF';
const EXE = 'reblue.exe';
const RELEASE_ICONS = 'https://raw.githubusercontent.com/zolaware/reblue/v1.3.1/res/embed/achievements';
const MAX_SECTION_BYTES = 64 * 1024 * 1024;
const MAX_ICON_BYTES = 1024 * 1024;
const CACHE_FILE = 'reblue-icons.json';

const BONUS = Object.freeze([
  { id: 0x10001, name: 'Where is the bathroom?', description: 'Where does Zola sh**? (Dedicated to InfernoZotza)', points: 69 },
  { id: 0x10002, name: 'Le WOooAH', description: 'Use a Corporeal attack. (Dedicated to wolfaeterni)', points: 50 },
  { id: 0x10003, name: 'Shuffle Baus', description: 'Enter the shuffle dungeon. (Dedicated to baus.98)', points: 50 },
  { id: 0x10004, name: 'The Fungus Collector', description: 'Collect 27 Nothings. (Dedicated to Fungus, the king of Nothings)', points: 50 },
  { id: 0x10005, name: 'The Cashman', description: 'Obtain 666 gold. (Dedicated to griever666)', points: 50 },
  { id: 0x10006, name: 'Cloaca Maxima', description: 'Slay a Poo Snake and purge the Great Sewer. (Dedicated to rcold)', points: 420 },
  { id: 0x10007, name: 'y u do dis', description: 'Landshark... y u do dis (Dedicated to Graine25)', points: 50 },
  { id: 0x10008, name: 'Please Stop Shaving Me', description: 'Where did the bald people use to be? (Dedicated to crack - by rcold)', points: 7 },
]);

const iconName = (id) => `0x${id.toString(16)}.png`;
const iconPath = (iconDir, id) => path.join(iconDir, iconName(id));

function readAt(fd, length, position) {
  const buffer = Buffer.alloc(length);
  return buffer.subarray(0, fs.readSync(fd, buffer, 0, length, position));
}

// The .rdata section of a 64-bit executable and the address it is loaded at, or null.
function readRdata(exe) {
  const fd = fs.openSync(exe, 'r');
  try {
    const dos = readAt(fd, 64, 0);
    if (dos.length < 64 || dos.toString('latin1', 0, 2) !== 'MZ') return null;
    const pe = dos.readUInt32LE(0x3c);
    const header = readAt(fd, 24 + 240, pe);
    if (header.length < 24 + 240 || header.readUInt32LE(0) !== 0x4550 || header.readUInt16LE(24) !== 0x20b) return null;
    const sections = readAt(fd, header.readUInt16LE(6) * 40, pe + 24 + header.readUInt16LE(20));
    for (let at = 0; at + 40 <= sections.length; at += 40) {
      if (sections.toString('latin1', at, at + 8).replace(/\0+$/, '') !== '.rdata') continue;
      const size = sections.readUInt32LE(at + 16);
      if (size > MAX_SECTION_BYTES) return null;
      const base = Number(header.readBigUInt64LE(24 + 24)) + sections.readUInt32LE(at + 12);
      return { base, bytes: readAt(fd, size, sections.readUInt32LE(at + 20)) };
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/*
  Each embedded file is a 32-byte record in .rdata: a pointer to its name, the name's length, a
  pointer to its bytes and their size. A record that does not lead to a picture is skipped.
*/
function embeddedIcons(exe) {
  const rdata = readRdata(exe);
  const icons = new Map();
  if (!rdata) return icons;
  const { base, bytes } = rdata;
  const text = bytes.toString('latin1');
  const names = /achievements\/0x(1[0-9a-f]{4})\.png/g;
  for (let match; (match = names.exec(text)); ) {
    const record = Buffer.alloc(16);
    record.writeBigUInt64LE(BigInt(base + match.index), 0);
    record.writeBigUInt64LE(BigInt(match[0].length), 8);
    const at = bytes.indexOf(record);
    if (at < 0 || at + 32 > bytes.length) continue;
    const start = Number(bytes.readBigUInt64LE(at + 16)) - base;
    const size = Number(bytes.readBigUInt64LE(at + 24));
    if (start < 0 || size > MAX_ICON_BYTES || start + size > bytes.length) continue;
    const picture = bytes.subarray(start, start + size);
    if (isImageBuffer(picture)) icons.set(parseInt(match[1], 16), Buffer.from(picture));
  }
  return icons;
}

// The bonus ids an executable embeds, their pictures written to iconDir; read once per build of it.
function iconsFromExe(exe, iconDir) {
  const { size, mtimeMs } = fs.statSync(exe);
  const cacheFile = path.join(iconDir, CACHE_FILE);
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const pictures = Array.isArray(cached.ids) && cached.ids.every((id) => fs.existsSync(iconPath(iconDir, id)));
    if (cached.size === size && cached.mtimeMs === mtimeMs && pictures) return cached.ids;
  } catch {
    /* not read yet, or read from another build */
  }
  const icons = embeddedIcons(exe);
  fs.mkdirSync(iconDir, { recursive: true });
  for (const [id, picture] of icons) fs.writeFileSync(iconPath(iconDir, id), picture);
  fs.writeFileSync(cacheFile, JSON.stringify({ size, mtimeMs, ids: [...icons.keys()] }));
  return [...icons.keys()];
}

// Once per process: offline, a scan would otherwise try every download again.
let fetchTried = false;
async function fetchMissingIcons(ids, iconDir, fetchImpl) {
  const missing = ids.filter((id) => !fs.existsSync(iconPath(iconDir, id)));
  if (!missing.length || fetchTried) return;
  fetchTried = true;
  fs.mkdirSync(iconDir, { recursive: true });
  for (const id of missing) {
    try {
      const response = await fetchImpl(`${RELEASE_ICONS}/${iconName(id)}`);
      if (!response.ok) continue;
      const picture = Buffer.from(await response.arrayBuffer());
      if (picture.length <= MAX_ICON_BYTES && isImageBuffer(picture)) fs.writeFileSync(iconPath(iconDir, id), picture);
    } catch {
      /* listed without its picture */
    }
  }
}

const isReblue = ({ gameDir, file } = {}) => (gameDir && fs.existsSync(path.join(gameDir, EXE))) || /[\\/]profiles[\\/][^\\/]+[\\/]achievements[\\/]/i.test(String(file || ''));

/*
  The bonus achievements of a re:Blue install, shaped like the game's own, or [] for anything else.
  One the executable embeds but this table does not know (a later re:Blue) still lists, by its id.
*/
async function bonusAchievements(info, iconDir, { fetchImpl, log = () => {} } = {}) {
  if (String(info.titleId || '').toUpperCase() !== TITLE_ID || !isReblue(info)) return [];
  let ids = BONUS.map((entry) => entry.id);
  try {
    const exe = info.gameDir ? path.join(info.gameDir, EXE) : '';
    const embedded = exe && fs.existsSync(exe) ? iconsFromExe(exe, iconDir) : [];
    if (embedded.length) ids = [...new Set([...ids, ...embedded])].sort((a, b) => a - b);
    else if (fetchImpl) await fetchMissingIcons(ids, iconDir, fetchImpl);
  } catch (err) {
    log(`re:Blue bonus pictures unavailable: ${err.message || err}`);
  }
  const known = new Map(BONUS.map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = known.get(id);
    const file = iconPath(iconDir, id);
    const icon = fs.existsSync(file) ? 'file:///' + file.replace(/\\/g, '/') : '';
    return {
      name: String(id),
      displayName: entry ? entry.name : `re:Blue bonus 0x${id.toString(16)}`,
      description: entry ? entry.description : '',
      // re:Blue shows "???" until each is earned.
      hidden: 1,
      gamerscore: entry ? entry.points : 0,
      icon,
      icongray: icon,
    };
  });
}

module.exports = { TITLE_ID, BONUS, embeddedIcons, bonusAchievements };
