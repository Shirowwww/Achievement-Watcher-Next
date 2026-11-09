'use strict';

/*
  GOG, Ubisoft and Epic publish no DLC grouping for their achievements; Steam does (its achievement
  sets, or SteamHunters groups, already in the Steam schema as `category`). This borrows those labels
  for the same game sold elsewhere. An achievement is matched by api name, then by title, and the
  labels are only taken when most of the store's list is found on Steam: two games sharing one
  achievement title must not hand each other a DLC label.
*/

const MIN_SHARED = 0.8;

function titleKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function apiKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

// Steam entries by api name and by title; a title two entries share points at neither.
function indexSteamList(steamList) {
  const byApi = new Map();
  const byTitle = new Map();
  for (const entry of steamList) {
    if (!entry) continue;
    const api = apiKey(entry.name);
    if (api && !byApi.has(api)) byApi.set(api, entry);
    const title = titleKey(entry.displayName);
    if (title) byTitle.set(title, byTitle.has(title) ? null : entry);
  }
  return { byApi, byTitle };
}

/**
 * @param {Array<{name?: string, displayName?: string, category?: string}>} list the store's achievements
 * @param {Array<{name?: string, displayName?: string, category?: string}>} steamList the same game's Steam schema
 * @returns {Array<object>|null} a new list with the borrowed labels, or null when nothing can be borrowed safely
 */
function borrowCategories(list, steamList) {
  if (!Array.isArray(list) || list.length === 0 || !Array.isArray(steamList) || steamList.length === 0) return null;
  if (!steamList.some((entry) => entry && entry.category)) return null;

  const { byApi, byTitle } = indexSteamList(steamList);
  const matches = list.map((entry) => (entry ? byApi.get(apiKey(entry.name)) || byTitle.get(titleKey(entry.displayName)) || null : null));
  const shared = matches.filter(Boolean).length;
  if (shared < list.length * MIN_SHARED) return null;
  if (!matches.some((match, index) => match && match.category && !(list[index] && list[index].category))) return null;

  return list.map((entry, index) => {
    const label = matches[index] && matches[index].category;
    return entry && label && !entry.category ? { ...entry, category: label } : entry;
  });
}

module.exports = { borrowCategories, MIN_SHARED };
