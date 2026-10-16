'use strict';

const path = require('path');
const { createRequire } = require('module');

/*
  Pure mapping/parsing helpers for the keyless Steam schema chain: official GetGameAchievements
  (no API key needed) -> SteamHunters public JSON API -> SteamCommunity achievements page (HTML).
  No I/O; depends only on node-html-parser (loaded lazily so this file works where only the JSON
  mappings are needed). Network orchestration lives in app/electron/init.js and watchdog/steam.js.

  All mappers emit: { name, defaultvalue, displayName, hidden, description, icon, icongray, rarityPercent? }
*/

function toRarityPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Steam's achievement sets (October 2026): set 0 is the base game and has no name. An archived
// achievement, or one in an archived set, only counts for players who already earned it.
function setLabel(id, name) {
  return id == null || Number(id) === 0 ? '' : String(name || '').trim();
}

// IPlayerService/GetGameAchievements response -> AW schema entries. Real descriptions for hidden
// achievements are included by Steam itself, unlike legacy GetSchemaForGame.
function mapOfficialAchievements(response, appid) {
  const list = response && Array.isArray(response.achievements) ? response.achievements : [];
  const groups = new Map((response && Array.isArray(response.groups) ? response.groups : []).map((g) => [Number(g && g.groupid), g]));
  return list.map((a) => {
    const group = groups.get(Number(a.groupid));
    const category = group ? setLabel(group.groupid, group.localized_name) : '';
    return {
      name: a.internal_name,
      defaultvalue: 0,
      displayName: a.localized_name,
      hidden: a.hidden ? 1 : 0,
      description: a.localized_desc || '',
      icon: a.icon
        ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appid}/${a.icon}`
        : '',
      icongray: a.icon_gray
        ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appid}/${a.icon_gray}`
        : '',
      rarityPercent: toRarityPercent(a.player_percent_unlocked),
      archived: !!(a.archived || (group && group.archived)),
      ...(category ? { category } : {}),
    };
  });
}

// internal_key -> { name, maxProgress } from the same response, for IPlayerService/GetUserAchievements,
// which names achievements only by that key. Key 0 is a real key.
function officialKeyIndex(response) {
  const index = new Map();
  for (const a of response && Array.isArray(response.achievements) ? response.achievements : []) {
    if (!a || a.internal_key == null || !a.internal_name) continue;
    const maxProgress = Number(a.max_progress_int ?? a.max_progress_float);
    index.set(Number(a.internal_key), { name: a.internal_name, maxProgress: maxProgress > 0 ? maxProgress : 0 });
  }
  return index;
}

/*
  IPlayerService/GetUserAchievements (keyless) -> AW unlock rows. Steam lists only achievements with
  an unlock or some progress; every other schema entry is a locked row. `null` means Steam refused to
  show the profile's game details (it answers an empty response with x-eresult 15), never "nothing".
*/
function mapUserAchievements(response, keyIndex) {
  if (!response || !Array.isArray(response.groups)) return null;
  const byKey = new Map();
  for (const a of Array.isArray(response.achievements) ? response.achievements : []) {
    if (a && a.internal_key != null) byKey.set(Number(a.internal_key), a);
  }
  const rows = [];
  for (const [key, schema] of keyIndex) {
    const state = byKey.get(key);
    const achieved = !!(state && state.unlocked);
    const row = { apiname: schema.name, achieved: achieved ? 1 : 0, unlocktime: achieved ? Number(state.unlock_time) || 0 : 0 };
    const progress = state ? Number(state.progress_int ?? state.progress_float) : NaN;
    if (!achieved && Number.isFinite(progress) && schema.maxProgress > 0) {
      row.progress = progress;
      row.max_progress = schema.maxProgress;
    }
    rows.push(row);
  }
  return rows;
}

// The steamcommunity achievements page is a React app since October 2026. The old
// /stats/<appid>/achievements address redirects to it and drops `?l=`, so it is asked for directly.
function steamCommunityAchievementsUrl(appid, lang, steamid) {
  const game = encodeURIComponent(String(appid));
  const base = steamid
    ? `https://steamcommunity.com/profiles/${encodeURIComponent(String(steamid))}/achievements/${game}`
    : `https://steamcommunity.com/achievements/${game}`;
  return `${base}?l=${encodeURIComponent(lang || 'english')}`;
}

// That page ships its data as a react-query cache in <script id="valve-ssr-data">, under
// renderContext.queryData (itself a JSON string). Returns { schema, globalpercentages, ... } or null.
function readCommunityPageQueries(html) {
  if (typeof html !== 'string') return null;
  const match = /<script\b[^>]*\bid="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  try {
    const queryData = JSON.parse(match[1])?.renderContext?.queryData;
    const dehydrated = typeof queryData === 'string' ? JSON.parse(queryData) : queryData;
    const byKind = {};
    for (const query of Array.isArray(dehydrated && dehydrated.queries) ? dehydrated.queries : []) {
      const key = Array.isArray(query && query.queryKey) ? query.queryKey : [];
      if (key[0] === 'achievements' && query.state && query.state.status === 'success') byKind[key[2]] = query.state.data;
    }
    return byKind;
  } catch {
    return null;
  }
}

// The page's own schema -> rows in the shape below, plus what the old HTML never had: the real
// apiName, the hidden flag, sets, archived entries and rarity. null when the page carries no schema.
function communityPageRows(html) {
  const queries = readCommunityPageQueries(html);
  const schema = queries && queries.schema;
  if (!schema || !Array.isArray(schema.groups)) return null;
  const percentages = (queries.globalpercentages && queries.globalpercentages.percentages) || {};
  const rows = [];
  for (const group of schema.groups) {
    const category = setLabel(group && group.id, group && group.name);
    for (const a of Array.isArray(group && group.achievements) ? group.achievements : []) {
      const title = String((a && a.name) || '').trim();
      if (!title) continue;
      const icon = String(a.icon_achieved || '');
      rows.push({
        img: iconKey(icon),
        icon,
        icongray: String(a.icon_unachieved || ''),
        title,
        description: String(a.description || '').trim(),
        apiName: String(a.api_name || ''),
        hidden: !!a.hidden,
        archived: !!(a.archived || group.archived),
        rarityPercent: toRarityPercent(percentages[a.internal_key]),
        ...(category ? { category } : {}),
      });
    }
  }
  return rows;
}

// SteamHunters public JSON API (https://steamhunters.com/api/apps/<id>/achievements) -> entries.
// The JSON carries apiName/name/description and global rarity, but no icons and no hidden flag.
// `estimatedSteamPercentage` is the fallback used by other consumers when Steam has not published
// the real percentage yet (the field appears on brand-new or low-owner games).
function mapSteamHuntersJson(list) {
  if (!Array.isArray(list)) return [];
  return list.map((a) => ({
    name: a.apiName,
    defaultvalue: 0,
    displayName: a.name,
    hidden: 0,
    description: a.description || '',
    icon: '',
    icongray: '',
    rarityPercent: toRarityPercent(a.steamPercentage ?? a.estimatedSteamPercentage),
  }));
}

function stripHtml(value) {
  const source = String(value || '');
  let text = '';
  let inTag = false;
  for (const character of source) {
    if (character === '<') {
      inTag = true;
    } else if (character === '>') {
      inTag = false;
    } else if (!inTag) {
      text += character;
    }
  }
  return text.replace(/&nbsp;/g, ' ').trim();
}

// SteamCommunity achievements page -> [{ img, icon, title, description }], with the extra fields of
// communityPageRows() when the page is the current one. `img` keeps the historical hash-only value
// (used by mergeTranslatedAchievements), `icon` is the full URL used when rebuilding a schema.
function parseSteamCommunityRows(html) {
  const fromPage = communityPageRows(html);
  if (fromPage) return fromPage;
  const rows = [];
  if (!html || typeof html !== 'string' || !html.includes('achieveRow')) return rows;

  let htmlParser = null;
  try {
    htmlParser = require('node-html-parser');
  } catch {
    // The packaged Watchdog loads this module from resources/app.asar.unpacked, outside the
    // watchdog's own node_modules chain; anchor the lookup at the watchdog package (its cwd).
    try {
      htmlParser = createRequire(path.join(process.cwd(), 'package.json'))('node-html-parser');
    } catch {
      htmlParser = null;
    }
  }

  if (htmlParser) {
    const doc = htmlParser.parse(html);
    for (const row of doc.querySelectorAll('.achieveRow')) {
      const title = row.querySelector('.achieveTxt h3')?.text?.trim() || '';
      if (!title) continue;
      const src = row.querySelector('.achieveImgHolder img')?.getAttribute('src') || '';
      rows.push({
        img: src ? src.split('/').pop().split('.jpg')[0] : '',
        icon: src || '',
        title,
        description: row.querySelector('.achieveTxt h5')?.text?.trim() || '',
      });
    }
    return rows;
  }

  // Regex fallback for environments without node-html-parser (standalone verification only).
  const rowRe = /<div class="achieveRow[^"]*">([\s\S]*?)<div style="clear: both;"><\/div>/g;
  let match;
  while ((match = rowRe.exec(html))) {
    const block = match[1];
    const title = stripHtml((block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
    if (!title) continue;
    const src = (block.match(/<img[^>]*src="([^"]+)"/) || [])[1] || '';
    rows.push({
      img: src ? src.split('/').pop().split('.jpg')[0] : '',
      icon: src,
      title,
      description: stripHtml((block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/) || [])[1]),
    });
  }
  return rows;
}

// SteamCommunity rows -> AW entries. Rows from the current page carry the real apiName and flags;
// rows from the old HTML page are the degraded fallback (title as name, blank description = hidden).
function mapSteamCommunityRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    if (!r.apiName) {
      return {
        name: r.title || '',
        defaultvalue: 0,
        displayName: r.title || '',
        hidden: r.title && !r.description ? 1 : 0,
        description: r.description || '',
        icon: r.icon || '',
        icongray: '',
      };
    }
    return {
      name: r.apiName,
      defaultvalue: 0,
      displayName: r.title || '',
      hidden: r.hidden ? 1 : 0,
      description: r.description || '',
      icon: r.icon || '',
      icongray: r.icongray || '',
      rarityPercent: r.rarityPercent ?? null,
      archived: !!r.archived,
      ...(r.category ? { category: r.category } : {}),
    };
  });
}

// True when rows came from the current page: a complete schema in itself, localized, apiNames included.
function rowsCarryApiNames(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every((r) => r && r.apiName);
}

// Merges SteamHunters JSON (apiName + English descriptions) with SteamCommunity rows (icons +
// hidden status), matched case-insensitively by title. A same-position row is used only for the
// icon, never hidden/description, so a misordered page can't mislabel an achievement. Localized
// text comes separately from achievementTranslations.mergeTranslatedAchievements (matched by icon hash).
function mergeSteamHuntersWithCommunity(shList, rows) {
  const mapped = mapSteamHuntersJson(shList);
  if (!Array.isArray(rows) || rows.length === 0) return mapped;

  const byTitle = new Map();
  const byApiName = new Map();
  for (const row of rows) {
    if (row && row.title) byTitle.set(row.title.toLowerCase(), row);
    if (row && row.apiName) byApiName.set(row.apiName.toLowerCase(), row);
  }

  return mapped.map((achievement, index) => {
    const matched =
      byApiName.get(String(achievement.name || '').toLowerCase()) || byTitle.get(String(achievement.displayName || '').toLowerCase());
    const row = matched || rows[index];
    if (!row) return achievement;
    const pageHidden = matched && row.apiName ? (row.hidden ? 1 : 0) : null;
    return {
      ...achievement,
      // Hidden is only trustworthy when the row really is the same achievement.
      hidden: pageHidden ?? (matched && row.title && !row.description ? 1 : achievement.hidden),
      description: achievement.description || (matched ? row.description : '') || '',
      icon: achievement.icon || row.icon || '',
      icongray: achievement.icongray || '',
    };
  });
}

// Icon URL/hash -> stable identifier (same trick as achievementTranslations.js). Steam serves the
// same CDN image for a given achievement everywhere, so this survives across languages/sources.
function iconKey(urlOrHash) {
  const value = String(urlOrHash || '').trim();
  if (!value) return '';
  const base = value.split('/').pop() || value;
  return base.replace(/\.(?:jpg|png)$/i, '');
}

// Icon-hash -> real apiName lookup, built from a list that has real apiNames (never from the
// SteamCommunity-only degraded fallback, whose `name` is just a display title). A hash shared by
// two DIFFERENT apiNames (some games reuse one generic icon) is dropped instead of guessed.
function buildApiNameIndex(achievements) {
  const index = {};
  const ambiguous = new Set();
  for (const a of Array.isArray(achievements) ? achievements : []) {
    if (!a || !a.name) continue;
    for (const key of [iconKey(a.icon), iconKey(a.icongray)]) {
      if (!key) continue;
      if (key in index) {
        if (index[key] !== a.name) ambiguous.add(key);
        continue;
      }
      index[key] = a.name;
    }
  }
  for (const key of ambiguous) delete index[key];
  return index;
}

// Recovers real apiNames for the degraded SteamCommunity-only fallback via the index above. No
// match just keeps the title-based placeholder name - never worse than before this lookup existed.
function applyApiNameIndex(achievements, index) {
  if (!index || typeof index !== 'object' || Object.keys(index).length === 0) return achievements;
  return (Array.isArray(achievements) ? achievements : []).map((a) => {
    const real = a && index[iconKey(a.icon)];
    return real ? { ...a, name: real } : a;
  });
}

// SteamHunters achievement-group JSON (https://steamhunters.com/api/GetAchievementGroups/v1) ->
// normalized groups. Only entries that carry an apiName list are useful for tagging schema entries.
function parseSteamHuntersGroups(json) {
  if (!json || !Array.isArray(json.groups)) return [];
  return json.groups
    .map((group) => ({
      name: String(group && (group.dlcAppName || group.name) || '').trim(),
      dlcAppId: group && group.dlcAppId ? Number(group.dlcAppId) : 0,
      apiNames: Array.isArray(group && group.achievementApiNames)
        ? group.achievementApiNames.map((n) => String(n || '').trim()).filter(Boolean)
        : [],
    }))
    .filter((group) => group.name && group.apiNames.length > 0);
}

// Tag schema entries with their SteamHunters group name (DLC/update). Matching is by apiName only
// (case-insensitive, because Steam emulator files and official schemas occasionally differ in
// case), so a SteamCommunity-only fallback (title-based names) is simply left untagged. Never
// overwrites an existing category and never mutates entries in place.
function applySteamHuntersGroups(achievements, groups) {
  const normalized = parseSteamHuntersGroups(Array.isArray(groups) ? { groups } : groups);
  if (!Array.isArray(achievements) || achievements.length === 0 || normalized.length === 0) {
    return achievements;
  }
  const byApiName = new Map();
  for (const group of normalized) {
    for (const apiName of group.apiNames) {
      const key = apiName.toLowerCase();
      if (!byApiName.has(key)) byApiName.set(key, group.name);
    }
  }
  return achievements.map((achievement) => {
    if (!achievement || achievement.category || !achievement.name) return achievement;
    const label = byApiName.get(String(achievement.name).trim().toLowerCase());
    return label ? { ...achievement, category: label } : achievement;
  });
}

module.exports = {
  mapOfficialAchievements,
  officialKeyIndex,
  mapUserAchievements,
  steamCommunityAchievementsUrl,
  mapSteamHuntersJson,
  stripHtml,
  parseSteamCommunityRows,
  mapSteamCommunityRows,
  rowsCarryApiNames,
  mergeSteamHuntersWithCommunity,
  parseSteamHuntersGroups,
  applySteamHuntersGroups,
  toRarityPercent,
  iconKey,
  buildApiNameIndex,
  applyApiNameIndex,
};
