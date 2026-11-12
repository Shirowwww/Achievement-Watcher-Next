'use strict';

/*
  The unlock files of the ports in recompPortTable.js, one reader per format. Each takes the file's
  text and the port's bundled list and returns Map(achievement name -> { achieved, time, progress }),
  time in unix seconds (0 when the file keeps none). A reader throws on a file it cannot read whole:
  a write caught half way must not look like achievements being taken back.
*/

const byIndex = (schema) => new Map(schema.achievements.map((entry) => [Number(entry.index), String(entry.name)]));

// Super Mario Bros. Remastered: one '0' or '1' per achievement index, nothing else.
function indexBits(text, schema) {
  const bits = String(text).trim();
  if (!/^[01]{1,512}$/.test(bits)) throw new Error('not a string of 0 and 1');
  const names = byIndex(schema);
  const unlocks = new Map();
  for (let index = 0; index < bits.length; index++) {
    const name = names.get(index);
    if (name) unlocks.set(name, { achieved: bits[index] === '1', time: 0, progress: 0 });
  }
  return unlocks;
}

// Dusklight: { "<key>": { "progress": n, "unlocked": bool } }, every achievement written each time.
function keyedProgress(text, schema) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object of achievements');
  const known = new Set(schema.achievements.map((entry) => String(entry.name)));
  const unlocks = new Map();
  for (const [key, value] of Object.entries(parsed)) {
    if (!known.has(key) || !value || typeof value !== 'object') continue;
    const progress = Number(value.progress);
    unlocks.set(key, { achieved: value.unlocked === true, time: 0, progress: Number.isFinite(progress) && progress > 0 ? progress : 0 });
  }
  return unlocks;
}

/*
  Ghostship (libultraship): one save per slot, its achievements under
  shipSaveData.achievementSaveData.entries as [{ id, progress }], unlocked once progress reaches the
  goal (1 for a plain one). A slot played with achievements off has no such block.
*/
function shipSlot(text, schema) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a save slot');
  const block = parsed.shipSaveData && parsed.shipSaveData.achievementSaveData;
  const unlocks = new Map();
  if (!block || !Array.isArray(block.entries)) return unlocks;
  const goals = new Map(schema.achievements.map((entry) => [String(entry.name), Number(entry.goal) > 1 ? Number(entry.goal) : 1]));
  for (const entry of block.entries) {
    const id = entry && String(entry.id);
    if (!goals.has(id)) continue;
    const progress = Number(entry.progress) > 0 ? Number(entry.progress) : 0;
    unlocks.set(id, { achieved: progress >= goals.get(id), time: 0, progress });
  }
  return unlocks;
}

// SMS Launcher: the game appends "<id> <unix seconds>" per unlock; the first line of an id wins.
function idTimeLines(text, schema) {
  const known = new Set(schema.achievements.map((entry) => String(entry.name)));
  const unlocks = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const match = /^\s*(\d{1,9})\s+(\d{1,12})\s*$/.exec(raw);
    if (!match) throw new Error('not an "<id> <time>" line');
    if (known.has(match[1]) && !unlocks.has(match[1])) unlocks.set(match[1], { achieved: true, time: Number(match[2]), progress: 0 });
  }
  return unlocks;
}

/*
  DKR-R: { schema: 1, entries: { "<id>": { unlocked, when, progress } } }, every achievement written
  each time, `when` in unix seconds. A time trial keeps its target time in `progress`: only an
  achievement the list gives a goal counts toward a bar.
*/
function catalogueEntries(text, schema) {
  const parsed = JSON.parse(text);
  const entries = parsed && parsed.schema === 1 ? parsed.entries : null;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('not a schema 1 progress file');
  const goals = new Map(schema.achievements.map((entry) => [String(entry.name), Number(entry.goal) > 1 ? Number(entry.goal) : 0]));
  const unlocks = new Map();
  for (const [key, value] of Object.entries(entries)) {
    if (!goals.has(key) || !value || typeof value !== 'object') continue;
    const when = Number(value.when);
    const progress = Number(value.progress);
    const goal = goals.get(key);
    unlocks.set(key, {
      achieved: value.unlocked === true,
      time: Number.isSafeInteger(when) && when > 0 ? when : 0,
      progress: goal && Number.isFinite(progress) && progress > 0 ? Math.min(progress, goal) : 0,
    });
  }
  return unlocks;
}

const INI_DATE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?( UTC)?$/;
const MAX_MASK_BITS = 31;

// Seconds of "YYYY-MM-DD[ HH:MM:SS][ UTC]": local time unless marked UTC (FH2's mod), a day alone is midnight.
function localSeconds(text) {
  const match = INI_DATE.exec(text);
  if (!match) throw new Error(`not a date: ${text}`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((part) => Number(part || 0));
  const date = match[7] ? new Date(Date.UTC(year, month - 1, day, hour, minute, second)) : new Date(year, month - 1, day, hour, minute, second);
  const [gotMonth, gotDay] = match[7] ? [date.getUTCMonth(), date.getUTCDate()] : [date.getMonth(), date.getDate()];
  if (gotMonth !== month - 1 || gotDay !== day) throw new Error(`not a date: ${text}`);
  return Math.floor(date.getTime() / 1000);
}

const countBits = (value) => Array.from({ length: MAX_MASK_BITS }, (_, bit) => (value >>> bit) & 1).reduce((sum, bit) => sum + bit, 0);

/*
  Super Mario All-Stars: achievements.ini with [unlocked] id=date and [progress] id=int, [notice]
  ignored. An entry with `mask` keeps a bit mask of what is done: its progress is the bits set.
*/
function iniUnlocked(text, schema) {
  const known = new Map(schema.achievements.map((entry) => [String(entry.name), { goal: Number(entry.goal) > 0 ? Number(entry.goal) : 0, mask: entry.mask === true }]));
  const unlocks = new Map();
  const counts = new Map();
  let section = '';
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith(';')) continue;
    const header = /^\[(\w+)\]$/.exec(raw);
    if (header) {
      section = header[1];
      continue;
    }
    const pair = /^([^=[\]\s]+)=(.*)$/.exec(raw);
    if (!pair) throw new Error('not a section, a key=value line or a comment');
    const [, key, value] = pair;
    if (section === 'unlocked') {
      const time = localSeconds(value);
      if (known.has(key) && !unlocks.has(key)) unlocks.set(key, { achieved: true, time, progress: 0 });
    } else if (section === 'progress') {
      if (!/^-?\d{1,10}$/.test(value)) throw new Error(`not a number: ${value}`);
      if (known.has(key)) counts.set(key, Number(value));
    }
  }
  for (const [key, count] of counts) {
    const { goal, mask } = known.get(key);
    const progress = goal > 0 ? Math.min(mask ? countBits(count) : count, goal) : 0;
    const state = unlocks.get(key);
    if (state) state.progress = goal > 0 ? goal : 0;
    else if (progress > 0) unlocks.set(key, { achieved: false, time: 0, progress });
  }
  return unlocks;
}

/*
  Road Rash 64 and Open Nectar: a "#" header line, then one achievement number per line, no dates.
  The header and the closing newline are always written: a file without either was caught mid-write.
*/
function idList(text, schema) {
  const body = String(text);
  if (!body.startsWith('#') || !body.endsWith('\n')) throw new Error('no header, or the last line is cut');
  const known = new Set(schema.achievements.map((entry) => String(entry.name)));
  const unlocks = new Map();
  for (const raw of body.split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    if (!/^\d{1,9}$/.test(raw.trim())) throw new Error('not an achievement number');
    const id = String(Number(raw.trim()));
    if (known.has(id) && !unlocks.has(id)) unlocks.set(id, { achieved: true, time: 0, progress: 0 });
  }
  return unlocks;
}

/*
  G-Diffuser: "version=1", "playtime_seconds=<n>", then "unlock=<id> <unix seconds>" per unlock. The
  game skips lines it does not know; so does this, as long as they are "name=value".
*/
function unlockPairs(text, schema) {
  const body = String(text);
  const lines = body.split(/\r?\n/);
  if (lines[0] !== 'version=1' || !body.endsWith('\n')) throw new Error('not a version 1 file, or the last line is cut');
  const known = new Set(schema.achievements.map((entry) => String(entry.name)));
  const unlocks = new Map();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const unlock = /^unlock=(\S{1,64}) (\d{1,12})$/.exec(line);
    if (unlock) {
      if (known.has(unlock[1]) && !unlocks.has(unlock[1])) unlocks.set(unlock[1], { achieved: true, time: Number(unlock[2]), progress: 0 });
    } else if (!/^[a-z_]+=[^\s]*$/.test(line) || line.startsWith('unlock=')) throw new Error('not a "name=value" line');
  }
  return unlocks;
}

/*
  Forza Horizon 2's achievements mod: a profile's User_<id>.ini is the iniUnlocked layout with UTC
  dates; its Achievements.txt report gives a locked achievement's progress as "[have / need unit]"
  after its title. The report never unlocks anything: the profile files do.
*/
const FH2_REPORT_HEAD = /^Forza Horizon 2 achievements: \d+ of \d+ unlocked/;
const FH2_REPORT_ROW = /^\[ \] (.+?) {2,}\d+G {2}.*?\[(\d+) \/ (\d+)[^\]]*\]/;
function fh2Mod(text, schema) {
  const body = String(text).replace(/^﻿/, '');
  if (!body.startsWith('Forza Horizon 2 achievements')) return iniUnlocked(body, schema);
  if (!FH2_REPORT_HEAD.test(body)) throw new Error('not the mod report, or its first line is cut');
  const byTitle = new Map(schema.achievements.filter((entry) => Number(entry.goal) > 1).map((entry) => [entry.displayName, entry]));
  const unlocks = new Map();
  for (const line of body.split(/\r?\n/)) {
    const row = FH2_REPORT_ROW.exec(line);
    const entry = row && byTitle.get(row[1].trim());
    if (!entry) continue;
    const progress = Math.min(Number(row[2]), Number(entry.goal));
    if (progress > 0) unlocks.set(String(entry.name), { achieved: false, time: 0, progress });
  }
  return unlocks;
}

/*
  SanctuaryPort (Diablo III): user/trophies.txt, one trophy id per line appended at each unlock, no
  header and no date. A last line without its newline is still being written and is left out.
*/
function trophyIdLines(text, schema) {
  const body = String(text);
  const lines = body.split(/\r?\n/);
  if (!body.endsWith('\n')) lines.pop();
  const known = new Set(schema.achievements.map((entry) => String(entry.name)));
  const unlocks = new Map();
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (!/^\d{1,3}$/.test(raw.trim())) throw new Error('not a trophy number');
    const id = String(Number(raw.trim()));
    if (known.has(id) && !unlocks.has(id)) unlocks.set(id, { achieved: true, time: 0, progress: 0 });
  }
  return unlocks;
}

module.exports = {
  fh2Mod,
  trophyIdLines,
  iniUnlocked,
  idList,
  unlockPairs,
  indexBits,
  keyedProgress,
  shipSlot,
  idTimeLines,
  catalogueEntries,
};
