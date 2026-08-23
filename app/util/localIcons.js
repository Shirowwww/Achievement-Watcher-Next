'use strict';

/*
  Artwork the game already carries on disk.

  A Steam-emulated install ships its own achievement images - that is how the emulator draws its
  in-game pop-ups - under steam_settings/, in `images/` when AW wrote them and in
  `achievement_images/` when generate_emu_config or a repack did. AW itself never looked at them:
  every icon went through the Steam CDN, so a player whose network cannot reach that CDN sat in
  front of a page of spinners while the exact same pictures were two folders away (issue #38).

  This module is the offline half of the icon chain. It is deliberately pure fs/path - no Electron,
  no network - because both the renderer and the standalone Watchdog read from it (the Watchdog via
  sharedAppModule.js, so notification cards get the same local artwork the page does).

  Two indexes, because emulator installs name their files two different ways:
    byName   from steam_settings/achievements.json, which maps an achievement's api name to the
             image file the emulator paints. Authoritative when it exists.
    byToken  every image in those folders keyed by its basename without extension. A schema icon
             value is a Steam content hash ("a1b2....jpg") and generate_emu_config saves the file
             under exactly that name, so the hash alone finds it when no achievements.json does.
*/

const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

// Sub-folders of a steam_settings (or of the game folder itself) that hold achievement art.
// `images` is what AW's own repair writes; the others are what emulator config tools produce.
const IMAGE_DIR_NAMES = ['images', 'achievement_images', 'achievement images', 'ach_images'];

// A game folder can hold thousands of assets; the index only ever reads the achievement-art folders
// listed above, and stops once it has more entries than any real schema could reference.
const MAX_INDEXED_FILES = 5000;

const indexCache = new Map();

function existingDir(candidate) {
  if (!candidate) return null;
  try {
    return fs.statSync(candidate).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}

function existingFile(candidate) {
  if (!candidate) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function isImageFile(name) {
  return IMAGE_EXTENSIONS.has(path.extname(String(name || '')).toLowerCase());
}

/*
  Folders that may hold a steam_settings layout for this game, most specific first: what the scan
  already resolved, then the game folder, then the folder the watched binary sits in (the Watchdog
  knows the exe long before it knows a gameDir).
*/
function settingsRoots({ gameDir, steamSettings, binary } = {}) {
  const roots = [];
  const push = (dir) => {
    const found = existingDir(dir);
    if (!found) return;
    const key = path.resolve(found).toLowerCase();
    if (!roots.some((r) => path.resolve(r).toLowerCase() === key)) roots.push(found);
  };

  push(steamSettings);
  const exeDir = binary ? path.dirname(String(binary)) : null;
  for (const base of [gameDir, exeDir]) {
    if (!base) continue;
    push(path.join(String(base), 'steam_settings'));
    push(base);
  }
  return roots;
}

// The achievement-art folders under those roots. A root that IS an image folder counts too, so a
// user pointing straight at `.../steam_settings/achievement_images` still works.
function imageDirs(roots) {
  const dirs = [];
  const push = (dir) => {
    const found = existingDir(dir);
    if (!found) return;
    const key = path.resolve(found).toLowerCase();
    if (!dirs.some((d) => path.resolve(d).toLowerCase() === key)) dirs.push(found);
  };
  for (const root of roots) {
    if (IMAGE_DIR_NAMES.includes(path.basename(root).toLowerCase())) push(root);
    for (const name of IMAGE_DIR_NAMES) push(path.join(root, name));
  }
  return dirs;
}

// The token a schema icon value reduces to on disk: "…/a1b2c3.jpg?t=1" and "a1b2c3" both index as
// "a1b2c3", which is how generate_emu_config names the file it saved for that icon.
function iconToken(value) {
  const text = String(value || '')
    .split('?')[0]
    .split('#')[0]
    .trim();
  if (!text) return '';
  const base = text.split(/[\\/]/).pop() || '';
  return base.replace(/\.[^.]+$/, '').toLowerCase();
}

/*
  What the memoized index is keyed on. The folder's mtime alone is not enough: a repair that writes
  its images in the same millisecond the index was built would keep serving the empty one, and NTFS
  timestamps are coarse enough for that to be an ordinary case rather than a race. The entry count
  is what makes an added or removed file visible; it costs one readdir, against an index build that
  reads the same folders plus a JSON file.
*/
function stampOf(dirs) {
  return dirs
    .map((dir) => {
      try {
        return `${dir}:${fs.statSync(dir).mtimeMs}:${fs.readdirSync(dir).length}`;
      } catch {
        return `${dir}:0:0`;
      }
    })
    .join('|');
}

function readAchievementsJson(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, 'achievements.json'), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildIndex(roots) {
  const dirs = imageDirs(roots);
  const byToken = new Map();
  let indexed = 0;
  for (const dir of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (indexed >= MAX_INDEXED_FILES) break;
      if (!entry.isFile() || !isImageFile(entry.name)) continue;
      const token = iconToken(entry.name);
      if (!token || byToken.has(token)) continue;
      byToken.set(token, path.join(dir, entry.name));
      indexed += 1;
    }
  }

  const byName = new Map();
  for (const root of roots) {
    for (const entry of readAchievementsJson(root)) {
      if (!entry || entry.name == null) continue;
      const key = String(entry.name).toUpperCase();
      if (byName.has(key)) continue;
      const resolved = {};
      // GBE Fork writes `icon_gray`, classic Goldberg `icongray` - app/parser/steam.js reads both,
      // so the local index has to as well or the greyed image is never found by name.
      for (const [field, refs] of [
        ['icon', [entry.icon]],
        ['icongray', [entry.icongray, entry.icon_gray]],
      ]) {
        for (const ref of refs) {
          // Only a relative reference is a local file; an http(s) value is the same CDN url the
          // schema already carries and has nothing to add here.
          if (!ref || /^https?:\/\//i.test(String(ref))) continue;
          const direct = existingFile(path.isAbsolute(String(ref)) ? String(ref) : path.join(root, String(ref)));
          // achievements.json can name a folder the repack later renamed; the byToken index still
          // knows where that exact file went.
          const found = direct || byToken.get(iconToken(ref)) || null;
          if (found) {
            resolved[field] = found;
            break;
          }
        }
      }
      if (resolved.icon || resolved.icongray) byName.set(key, resolved);
    }
  }

  return { dirs, byName, byToken };
}

/*
  The local artwork index for one game, memoized until one of its image folders changes. Returns
  empty indexes (never null) when the game has no local art, so callers can use it unconditionally.
*/
function readIndex(game) {
  const roots = settingsRoots(game || {});
  if (roots.length === 0) return { dirs: [], byName: new Map(), byToken: new Map() };
  const key = roots.map((r) => path.resolve(r).toLowerCase()).join('|');
  const stamp = stampOf(imageDirs(roots));
  const cached = indexCache.get(key);
  if (cached && cached.stamp === stamp) return cached.index;
  const index = buildIndex(roots);
  indexCache.set(key, { stamp, index });
  return index;
}

function clearCache() {
  indexCache.clear();
}

/*
  The local file for one achievement state, or null. `achieved` picks between the colour and the
  greyed-out image the same way every caller already does when reading the schema.
*/
function achievementIcon(index, achievement, achieved) {
  if (!index || !achievement) return null;
  const field = achieved ? 'icon' : 'icongray';
  const named = index.byName.get(String(achievement.name || '').toUpperCase());
  if (named && named[field]) return named[field];
  const schemaValue = String(achievement[field] || (achieved ? '' : achievement.icon_gray) || '');
  const token = iconToken(schemaValue);
  const found = token && index.byToken.get(token);
  if (found) return found;
  // The other state's image, only when the schema has nothing of its own: a colour icon on a locked
  // row reads as unlocked, so returning null - and letting the caller use the schema url - wins
  // whenever there is one. With no url either, the wrong-state picture still beats an empty box.
  if (!schemaValue && named && (named.icon || named.icongray)) return named.icon || named.icongray;
  return null;
}

// Same answer for a caller that has the game rather than a prepared index (the Watchdog, which
// resolves one achievement at a time). The index itself is memoized, so this stays a map lookup.
function achievementIconFor(game, achievement, achieved) {
  return achievementIcon(readIndex(game), achievement, achieved);
}

// Filenames that are plausibly the game's own square logo rather than a screenshot or a texture.
const GAME_ICON_NAMES = /^(?:icon0?|icon|logo|game|app|gameicon|app_?icon|clienticon|cover|thumbnail)$/i;

/*
  Square-ish artwork sitting in the game folder, offered in the icon picker as a "from the game
  folder" source. Only the folder roots themselves are read (never a recursive walk): a game folder
  can hold tens of thousands of files, and the icon a repack ships is always at the top.
*/
function gameIconCandidates(game, { limit = 24 } = {}) {
  const roots = settingsRoots(game || {});
  const found = [];
  const seen = new Set();
  const push = (file) => {
    const key = path.resolve(file).toLowerCase();
    if (seen.has(key) || found.length >= limit) return;
    seen.add(key);
    found.push(file);
  };

  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !isImageFile(entry.name)) continue;
      if (!GAME_ICON_NAMES.test(iconToken(entry.name))) continue;
      push(path.join(root, entry.name));
    }
  }
  return found;
}

module.exports = {
  IMAGE_DIR_NAMES,
  settingsRoots,
  imageDirs,
  iconToken,
  readIndex,
  clearCache,
  achievementIcon,
  achievementIconFor,
  gameIconCandidates,
};
