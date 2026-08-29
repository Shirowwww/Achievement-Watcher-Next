'use strict';

/*
  Moving one source's unlocks onto another source's achievement list.

  A game owned on a store and also installed from a crack is one game with two achievement lists,
  and the two share no key: Steam names an achievement `ACH_WELCOME`, Xbox numbers it `1`, Epic
  calls it `mnj_achievement_0`. Only the title the player reads is the same on both, because both
  come from the publisher.

  So a merged game unions what each source knows by matching titles. A title that appears twice in
  one list is dropped rather than guessed at, and an unlock with no counterpart is left behind
  instead of being attached to the wrong achievement.
*/

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// title -> api-name, for the titles that identify exactly one achievement in the list.
function indexByTitle(list) {
  const seen = new Map();
  for (const entry of Array.isArray(list) ? list : []) {
    const title = normalizeTitle(entry?.displayName);
    if (!title || entry?.name == null) continue;
    seen.set(title, seen.has(title) ? null : entry.name);
  }
  const index = new Map();
  for (const [title, name] of seen) if (name != null) index.set(title, name);
  return index;
}

/*
  `unlocks` is keyed by the source's own api-names, and `sourceList` describes them. The result is
  keyed by `targetList`'s api-names, ready to be merged into that schema.

  An empty `targetList` means there is nothing to translate onto - the source is being read for its
  own game - so the keys are kept as they are.
*/
function remapUnlocksOntoSchema(unlocks, sourceList, targetList) {
  const out = {};
  const entries = Object.entries(unlocks || {});
  if (entries.length === 0) return out;

  // Only an absent target list means "read this source for its own game, keys already line up". A
  // list that is there but yields no usable title translates nothing: passing the source's own keys
  // through would staple them onto a schema that never had them.
  const translate = Array.isArray(targetList) && targetList.length > 0;
  const target = translate ? indexByTitle(targetList) : new Map();
  const titleOf = new Map();
  for (const entry of Array.isArray(sourceList) ? sourceList : []) {
    if (entry?.name == null) continue;
    titleOf.set(String(entry.name), normalizeTitle(entry.displayName));
  }

  for (const [key, value] of entries) {
    if (!value) continue;
    let name = key;
    if (translate) {
      const mapped = target.get(titleOf.get(String(key)) || '');
      if (mapped == null) continue;
      name = mapped;
    }
    out[name] = { ...value, name };
  }
  return out;
}

module.exports = { normalizeTitle, indexByTitle, remapUnlocksOntoSchema };
