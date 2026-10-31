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

module.exports = {
  indexBits,
  keyedProgress,
  shipSlot,
  idTimeLines,
  catalogueEntries,
};
