'use strict';

// crc checksums are only built for the emulators that key achievements by crc32 of the api name.
const crc = require('./lazyRequire.js').lazyRequire('crc');

function normalizeName(value) {
  return String(value == null ? '' : value).toUpperCase();
}

// Building these indexes once per scan avoids walking the whole schema and prior cache per
// achievement, while keeping Array.find's "first matching entry wins" behaviour for duplicates.
function buildSchemaIndex(entries, { includeCrc = false } = {}) {
  const byName = new Map();
  const crcEntries = [];

  for (const achievement of Array.isArray(entries) ? entries : []) {
    if (!achievement || achievement.name == null) continue;
    const name = String(achievement.name);
    const normalized = normalizeName(name);
    if (!byName.has(normalized)) byName.set(normalized, achievement);
    if (includeCrc) crcEntries.push({ checksum: crc.crc32(name).toString(16), achievement });
  }

  return { byName, crcEntries };
}

function findSchemaAchievement(index, parsedAchievement) {
  if (!index || !parsedAchievement) return undefined;

  if (parsedAchievement.crc) {
    const crcValues = parsedAchievement.crc;
    return index.crcEntries.find(({ checksum }) => crcValues.includes(checksum))?.achievement;
  }

  return index.byName.get(normalizeName(parsedAchievement.name));
}

function buildPreviousAchievementIndex(entries) {
  const byName = new Map();

  for (const achievement of Array.isArray(entries) ? entries : []) {
    if (!achievement) continue;
    // Array.find returned the first duplicate, so keep the first map entry as well.
    if (!byName.has(achievement.name)) byName.set(achievement.name, achievement);
  }

  return { byName };
}

// The schema names (upper-cased) of the `limit` most recent unlocks. A crc-keyed record (SmartSteamEmu)
// is named by its index until the schema resolves it, so it is resolved here first.
function seedPreviewNames(unlocked, schemaIndex, limit) {
  return new Set(
    unlocked
      .slice()
      .sort((a, b) => Number(b.UnlockTime || 0) - Number(a.UnlockTime || 0))
      .slice(0, limit)
      .map((a) => normalizeName((findSchemaAchievement(schemaIndex, a) || a).name))
  );
}

/*
  What 100% means: Steam no longer counts an archived achievement for players who never earned it,
  nor one it removed. `inScope` (app/util/platinumScope.js) narrows it to what the platinum waits
  for, the base game's by default; without it the whole list counts.
*/
const counts = (achievement, inScope) => !achievement.archived && !achievement.removed && (!inScope || inScope(achievement));

function requiredCount(schemaEntries, inScope = null) {
  return (Array.isArray(schemaEntries) ? schemaEntries : []).filter((achievement) => achievement && counts(achievement, inScope)).length;
}

function requiredUnlockedCount(entries, schemaIndex, inScope = null) {
  let count = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.Achieved != 1) continue;
    const schema = findSchemaAchievement(schemaIndex, entry);
    // A save entry the schema does not know counts only when the whole list does.
    if (schema ? counts(schema, inScope) : !inScope) count += 1;
  }
  return count;
}

// The indexes of one read in the order to notify them: the save's own, with the game's platinum
// (any of `lastNames`) moved after the rest, as PlayStation pops it after the trophy that earns it.
function platinumLastOrder(entries, schemaIndex, lastNames) {
  const last = new Set((lastNames || []).filter(Boolean).map(normalizeName));
  const list = Array.isArray(entries) ? entries : [];
  const isLast = (entry) => {
    if (last.size === 0 || !entry) return false;
    return last.has(normalizeName((findSchemaAchievement(schemaIndex, entry) || entry).name));
  };
  const order = list.map((_, i) => i);
  return [...order.filter((i) => !isLast(list[i])), ...order.filter((i) => isLast(list[i]))];
}

module.exports = {
  buildSchemaIndex,
  findSchemaAchievement,
  buildPreviousAchievementIndex,
  seedPreviewNames,
  requiredCount,
  requiredUnlockedCount,
  platinumLastOrder,
};
