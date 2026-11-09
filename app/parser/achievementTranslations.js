'use strict';

// SteamCommunity translations identify an achievement by its apiName on the current page, and by
// either artwork URL on older answers. Indexing keeps the original Array.find order (first schema
// entry wins), while avoiding a full schema scan per translated achievement.
function iconKey(urlOrHash) {
  const value = String(urlOrHash || '').trim();
  if (!value) return value;
  const base = value.split('/').pop() || value;
  return base.replace(/\.(?:jpg|png)$/i, '');
}

function buildAchievementImageIndex(achievements) {
  const list = Array.isArray(achievements) ? achievements : [];
  // An icon several achievements share (a generic badge) cannot tell them apart.
  const count = (field) => {
    const uses = new Map();
    for (const achievement of list) {
      const key = iconKey(achievement[field]);
      if (key) uses.set(key, (uses.get(key) || 0) + 1);
    }
    return uses;
  };
  const iconUses = count('icon');
  const grayUses = count('icongray');
  const byImage = new Map();

  for (const achievement of list) {
    const icon = iconKey(achievement.icon);
    const gray = iconKey(achievement.icongray);
    if (icon && iconUses.get(icon) === 1 && !byImage.has(icon)) byImage.set(icon, achievement);
    if (gray && grayUses.get(gray) === 1 && !byImage.has(gray)) byImage.set(gray, achievement);
    // Legacy behaviour: a schema entry with no artwork at all still receives a translation that
    // carries no image. Real empty strings are skipped, so entries whose icon is missing (e.g.
    // SteamHunters mappings) are never mislabeled by a page row without an image URL either.
    if (!icon && !gray && !byImage.has(undefined)) byImage.set(undefined, achievement);
  }

  return byImage;
}

// Exact apiName first, then the same name in any case, as the other Steam merges compare them.
function buildAchievementNameIndex(achievements) {
  const exact = new Map();
  const folded = new Map();
  for (const achievement of Array.isArray(achievements) ? achievements : []) {
    const name = String((achievement && achievement.name) || '');
    if (!name) continue;
    if (!exact.has(name)) exact.set(name, achievement);
    if (!folded.has(name.toLowerCase())) folded.set(name.toLowerCase(), achievement);
  }
  return { get: (name) => exact.get(name) || folded.get(String(name).toLowerCase()) };
}

// Rows from an answer that names its achievements keep only those named exactly once.
function trustedRows(translations) {
  const rows = (Array.isArray(translations) ? translations : []).filter(Boolean);
  if (!rows.some((row) => row.apiName)) return rows;
  const counts = new Map();
  for (const row of rows) if (row.apiName) counts.set(row.apiName, (counts.get(row.apiName) || 0) + 1);
  return rows.filter((row) => row.apiName && counts.get(row.apiName) === 1);
}

function mergeTranslatedAchievements(achievements, translations) {
  const byImage = buildAchievementImageIndex(achievements);
  const byName = buildAchievementNameIndex(achievements);

  for (const translation of trustedRows(translations)) {
    let match;
    if (translation.apiName) {
      match = byName.get(translation.apiName);
    } else {
      const key = translation.img == null ? undefined : iconKey(translation.img);
      match = key === '' ? undefined : byImage.get(key);
    }
    if (!match) continue;
    // SteamCommunity blanks hidden descriptions on purpose; never overwrite a real schema
    // description with an empty one (the official endpoint / SteamHunters provide the text).
    if (translation.description && String(translation.description).trim() !== '') {
      match.description = translation.description;
    }
    if (translation.title) match.displayName = translation.title;
  }

  return achievements;
}

module.exports = {
  iconKey,
  buildAchievementImageIndex,
  mergeTranslatedAchievements,
};
