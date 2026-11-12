'use strict';

/*
  A game's achievements split into the base game and its DLC, as Steam's sets and PlayStation's
  trophy groups file them: an achievement with no `category` belongs to the base game. Pure data,
  shared by the achievement page (one section per group) and the library filters.
*/

const BASE = '';

// Groups in the order the list meets them, the base game always first: [{ key, unlocked, total }].
function achievementGroups(list, categoryOf = (achievement) => achievement && achievement.category) {
  const groups = new Map([[BASE, { key: BASE, unlocked: 0, total: 0 }]]);
  for (const achievement of Array.isArray(list) ? list : []) {
    if (!achievement) continue;
    const key = String(categoryOf(achievement) || '').trim();
    if (!groups.has(key)) groups.set(key, { key, unlocked: 0, total: 0 });
    const group = groups.get(key);
    group.total += 1;
    if (achievement.Achieved) group.unlocked += 1;
  }
  return [...groups.values()].filter((group) => group.total > 0);
}

// Sections are only worth drawing when the game has DLC achievements at all.
const hasDlc = (groups) => groups.some((group) => group.key !== BASE);

// The base game's own counts; a game without DLC is all base game.
function baseProgress(list, categoryOf) {
  const base = achievementGroups(list, categoryOf).find((group) => group.key === BASE);
  return base ? { unlocked: base.unlocked, total: base.total } : { unlocked: 0, total: 0 };
}

module.exports = { BASE, achievementGroups, hasDlc, baseProgress };
