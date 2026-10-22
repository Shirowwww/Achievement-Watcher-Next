'use strict';

/*
  The unlock lists the recompiled games write, read into one id -> unix seconds map per game:
  ReXGlue's toml, the TSV profiles, the JSON list, Unleashed's ACH-DATA and Lost Odyssey's earned
  ini. A list a game keeps per profile is merged, each unlock at its earliest known time.
*/

const fs = require('fs');
const path = require('path');
const state = require(path.join(__dirname, 'x360RecompState.js'));

const MAX_STATE_BYTES = 1024 * 1024;
const FILETIME_UNIX_EPOCH_S = 11644473600n;
// 2000-01-01 .. 2100-01-01: anything outside is not a real unlock time.
const MIN_UNIX_S = 946684800;
const MAX_UNIX_S = 4102444800;
const plausibleUnix = (seconds) => (seconds > MIN_UNIX_S && seconds < MAX_UNIX_S ? seconds : 0);

function readSmallFile(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_STATE_BYTES) throw new Error(`'${file}' is ${size} bytes, too large for an unlock list`);
  return fs.readFileSync(file);
}

function filetimeToUnixSeconds(value) {
  let seconds;
  try {
    seconds = Number(BigInt(String(value).trim()) / 10000000n - FILETIME_UNIX_EPOCH_S);
  } catch {
    return 0;
  }
  return plausibleUnix(seconds);
}

// id -> unix seconds. The runtime's older `unlocked = [1, 2]` form carries no time at all.
function parseToml(text) {
  const unlocked = new Map();
  const source = String(text || '');
  const table = /^\s*\[unlocked\.(\d+)\]\s*$/gm;
  let match;
  while ((match = table.exec(source))) {
    const rest = source.slice(table.lastIndex);
    const next = rest.search(/^\s*\[/m);
    const body = next === -1 ? rest : rest.slice(0, next);
    const time = /^\s*filetime\s*=\s*(\d+)\s*$/m.exec(body);
    unlocked.set(Number(match[1]), time ? filetimeToUnixSeconds(time[1]) : 0);
  }
  const legacy = /^\s*unlocked\s*=\s*\[([\d\s,]*)\]/m.exec(source);
  if (legacy) {
    for (const id of legacy[1].split(',').map((v) => Number(v.trim())).filter((v) => v > 0)) {
      if (!unlocked.has(id)) unlocked.set(id, 0);
    }
  }
  return unlocked;
}

/*
  Unleashed Recompiled's ACH-DATA: a 16-byte header ("ACH ", version, a byte-wise XOR of the
  records), then 50 packed records (23 for Marathon Recompiled) of a u16 id and a signed 64-bit
  time_t, zero ids after the last. Anything else, a half-written file included, throws rather than
  read as fewer unlocks.
*/
const UNLEASHED_RECORDS = 50;
function parseUnleashed(buffer, records = UNLEASHED_RECORDS) {
  const size = 16 + records * 16;
  if (buffer.length !== size) throw new Error(`ACH-DATA has the wrong size (${buffer.length} bytes, not ${size})`);
  if (buffer.toString('latin1', 0, 4) !== 'ACH ' || buffer.readUInt32LE(4) > 1) throw new Error('ACH-DATA has an unknown header');
  let checksum = 0;
  for (let at = 16; at < buffer.length; at += 1) checksum ^= buffer[at];
  if (checksum !== buffer.readUInt32LE(8)) throw new Error('ACH-DATA fails its checksum');
  const unlocked = new Map();
  let ended = false;
  for (let at = 16; at < buffer.length; at += 16) {
    const id = buffer.readUInt16LE(at);
    if (!id) {
      ended = true;
      continue;
    }
    if (ended || unlocked.has(id)) throw new Error(`ACH-DATA has a misplaced or repeated record for ${id}`);
    const seconds = buffer.readBigInt64LE(at + 2);
    unlocked.set(id, plausibleUnix(Number(seconds)));
  }
  return unlocked;
}

/*
  Lost Odyssey's profile/achievements.ini: the comment "# Achievements earned: id=unix time", then
  one `id=unixseconds` line per unlock. Strict like ACH-DATA: no header, a torn line or a repeated
  id throws, since a half-written list read as shorter would replay unlocks later.
*/
const EARNED_INI_HEADER = /^\s*#\s*Achievements earned:\s*id=unix time\s*$/im;
function parseEarnedIni(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  if (!EARNED_INI_HEADER.test(source)) throw new Error('earned list has no header');
  const unlocked = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || /^\s*[#;]/.test(line)) continue;
    const row = /^\s*(\d{1,5})\s*=\s*(\d{1,12})\s*$/.exec(line);
    const id = row ? Number(row[1]) : 0;
    if (id < 1 || id > 0xffff) throw new Error('earned list has an incomplete entry');
    if (unlocked.has(id)) throw new Error(`earned list has a repeated id ${id}`);
    unlocked.set(id, plausibleUnix(Number(row[2])));
  }
  return unlocked;
}

// { titleId, unlocked } or null when the header is not "<tag>\t<TITLEID>\t<XUID>".
function parseTsv(text) {
  const lines = String(text || '').split(/\r?\n/);
  const header = lines[0].split('\t');
  if (header.length < 2 || !state.TITLE_ID_RE.test(header[1].trim())) return null;
  const unlocked = new Map();
  for (const line of lines.slice(1)) {
    const row = /^(\d+)\t(\d+)\s*$/.exec(line);
    if (row) unlocked.set(Number(row[1]), filetimeToUnixSeconds(row[2]));
  }
  return { titleId: header[1].trim().toUpperCase(), unlocked };
}

const UTF16_BOM = Buffer.from([0xff, 0xfe]);
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
// The byte-order mark a list opens with, or null.
const bomOf = (buffer) => [UTF16_BOM, UTF8_BOM].find((bom) => buffer.subarray(0, bom.length).equals(bom)) || null;

function decodeText(buffer) {
  const bom = bomOf(buffer);
  if (bom === UTF16_BOM) return buffer.subarray(bom.length).toString('utf16le');
  return buffer.subarray(bom ? bom.length : 0).toString('utf8');
}

// An achievement id as the games write it: a whole number, or its digits as text.
const isWholeId = (id) => Number.isInteger(id) || (typeof id === 'string' && /^\d+$/.test(id));

// Throws on a file that is not the expected list: read half-written, it would relock everything.
function parseJson(buffer) {
  const parsed = JSON.parse(decodeText(buffer));
  const list = parsed && Array.isArray(parsed.achievements) ? parsed.achievements : null;
  if (!list) throw new Error('no achievements array');
  return list
    .filter((entry) => entry && isWholeId(entry.id))
    .map((entry) => ({
      id: Number(entry.id),
      name: String(entry.name || '').trim(),
      description: String(entry.description || '').trim(),
      gamerscore: Number(entry.gamerscore) || 0,
      unlocked: entry.unlocked === true,
    }));
}

/*
  The JSON list with every unlocked flag cleared, written back in the encoding it came in (the game
  writes UTF-16 with a byte-order mark). Refuses a file it cannot parse rather than overwrite it.
*/
function clearJsonBuffer(buffer) {
  const bom = bomOf(buffer);
  const parsed = JSON.parse(decodeText(buffer));
  if (!parsed || !Array.isArray(parsed.achievements)) throw new Error('no achievements array');
  let cleared = 0;
  for (const entry of parsed.achievements) {
    if (entry && entry.unlocked === true) cleared += 1;
    if (entry && typeof entry === 'object') entry.unlocked = false;
  }
  const body = Buffer.from(JSON.stringify(parsed, null, 2), bom === UTF16_BOM ? 'utf16le' : 'utf8');
  return { buffer: bom ? Buffer.concat([bom, body]) : body, cleared };
}

// The shapes are checked, not just the names: the JSON must be a list of { id, unlocked } entries
// and the TSV must open on its tag / title id / XUID header.
function isAchievementJson(file) {
  try {
    const parsed = JSON.parse(decodeText(readSmallFile(file)));
    const list = parsed && parsed.achievements;
    return Array.isArray(list) && list.length > 0 && list.every((entry) => entry && isWholeId(entry.id) && typeof entry.unlocked === 'boolean');
  } catch {
    return false;
  }
}

function isUnlockTsv(file) {
  try {
    return parseTsv(readSmallFile(file).toString('utf8')) !== null;
  } catch {
    return false;
  }
}

// Several profiles' unlocks as one: earned anywhere, at the earliest known time.
function mergeUnlocked(lists) {
  const unlocked = new Map();
  for (const list of lists) {
    for (const [id, time] of list) {
      const previous = unlocked.get(id);
      if (previous === undefined || previous === 0 || (time > 0 && time < previous)) unlocked.set(id, time);
    }
  }
  return unlocked;
}

// Several ports keep one list per profile; a game played under two profiles is still one entry.
function profileUnlocks(info, parse) {
  const files = Array.isArray(info.profileFiles) && info.profileFiles.length ? info.profileFiles : [info.file];
  const present = files.filter((file) => file && fs.existsSync(file));
  if (present.length < 2) return mergeUnlocked(present.map((file) => parse(readSmallFile(file))));
  // With several profiles, one broken list must not hide the others: it is skipped and logged.
  const lists = [];
  for (const file of present) {
    try {
      lists.push(parse(readSmallFile(file)));
    } catch (err) {
      state.debug.warn(`[x360recomp] profile list skipped: ${err.message}`);
    }
  }
  return mergeUnlocked(lists);
}

const unlockedInJson = (buffer) => new Map(parseJson(buffer).filter((entry) => entry.unlocked).map((entry) => [entry.id, 0]));

// A port may store an achievement under another id than the game's (Hard Corps: Uprising's 0).
function applyIdAliases(unlocked, aliases) {
  if (!aliases) return unlocked;
  return mergeUnlocked([[...unlocked].map(([id, time]) => [Object.hasOwn(aliases, id) ? aliases[id] : id, time])]);
}

// A TSV profile's list, or null when the file went away since its folder was listed.
function readTsv(file) {
  try {
    return parseTsv(readSmallFile(file).toString('utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

// One file per profile, all of the title the folder is named after; a game played under two
// profiles is still one entry.
function tsvUnlocks(dir) {
  const folderTitle = path.basename(String(dir || '')).toUpperCase();
  const named = state.TITLE_ID_RE.test(folderTitle);
  const lists = [];
  for (const entry of state.readDirectory(dir)) {
    if (!entry.isFile() || !/\.tsv$/i.test(entry.name)) continue;
    const parsed = readTsv(path.join(dir, entry.name));
    if (parsed && (!named || parsed.titleId === folderTitle)) lists.push(parsed.unlocked);
  }
  return mergeUnlocked(lists);
}

// Unlocked achievements only, as { id, achieved, earned_time } like the other console sources.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  let unlocked = new Map();
  if (info.format === 'toml') {
    unlocked = profileUnlocks(info, (buffer) => parseToml(buffer.toString('utf8')));
  } else if (info.format === 'ini-earned') {
    unlocked = profileUnlocks(info, (buffer) => parseEarnedIni(buffer.toString('utf8')));
  } else if (info.format === 'tsv') {
    unlocked = tsvUnlocks(info.dir);
  } else if (info.format === 'unleashed') {
    unlocked = profileUnlocks(info, (buffer) => parseUnleashed(buffer, info.records));
  } else if (info.format === 'json') {
    unlocked = profileUnlocks(info, unlockedInJson);
  }
  return [...applyIdAliases(unlocked, info.idAliases)].map(([id, earned_time]) => ({ id: String(id), achieved: true, earned_time }));
}

module.exports = {
  readSmallFile,
  filetimeToUnixSeconds,
  parseToml,
  parseUnleashed,
  parseEarnedIni,
  parseTsv,
  decodeText,
  parseJson,
  clearJsonBuffer,
  isAchievementJson,
  isUnlockTsv,
  mergeUnlocked,
  profileUnlocks,
  applyIdAliases,
  getAchievements,
};
