'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require(path.join(__dirname, 'replaceFile.js'));
const { pathKey } = require(path.join(__dirname, 'winHosts.js'));

/*
  A game started from a non-Steam shortcut gets the shortcut's own generated id as SteamAppId, and
  gbe_fork saves the unlocks in GSE Saves\<that id>. This module ties such an id to the game the
  shortcut starts (its exe or start folder lies in the game folder), so the folder is read and
  watched as one more save of that game. cfg/shortcutSaveIds.json ({ id: appid }) is how the library
  scan tells the Watchdog, which never reads shortcuts.vdf.
*/

function idsFile(userDataRoot) {
  return path.join(userDataRoot, 'cfg', 'shortcutSaveIds.json');
}

// A missing, locked or corrupt file reads as no links.
function read(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function within(dir, file) {
  if (!dir || !file) return false;
  const root = pathKey(dir);
  const target = pathKey(file);
  return target === root || target.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

// The shortcut ids whose exe or start folder is inside gameDir.
function linkedIds(gameDir, entries) {
  if (!gameDir) return [];
  const ids = [];
  for (const entry of entries || []) {
    if (!entry || !entry.id || ids.includes(entry.id)) continue;
    if (within(gameDir, entry.exe) || within(gameDir, entry.startDir)) ids.push(entry.id);
  }
  return ids;
}

/*
  Merges what one scan linked (Map appid -> ids) into the file. `liveIds` is every id Steam still
  has a shortcut for (null when unknown); links to a deleted shortcut go, the others are kept so a
  scoped scan does not forget games it did not see. Writes only on a change.
*/
function update(file, links, liveIds = null) {
  const current = read(file);
  const next = {};
  for (const [id, appid] of Object.entries(current)) {
    if (typeof appid === 'string' && appid && (!liveIds || liveIds.has(id))) next[id] = appid;
  }
  for (const [appid, ids] of links) for (const id of ids) next[id] = String(appid);
  if (JSON.stringify(next) === JSON.stringify(current)) return false;
  writeFileAtomicSync(file, JSON.stringify(next, null, 2));
  return true;
}

function appidFor(links, folderName) {
  const appid = links && Object.prototype.hasOwnProperty.call(links, folderName) ? links[folderName] : null;
  return typeof appid === 'string' && appid ? appid : null;
}

function idsFor(links, appid) {
  return Object.keys(links || {}).filter((id) => links[id] === String(appid));
}

/*
  The other save folders of the same game beside `dir` (same parent): the game's own appid folder
  and every shortcut id folder, whichever of them `dir` is. Existing or not; the caller checks.
*/
function twinFolders(links, dir) {
  const name = path.basename(dir);
  const parent = path.dirname(dir);
  const appid = appidFor(links, name) || (idsFor(links, name).length > 0 ? name : null);
  if (!appid) return [];
  return [appid, ...idsFor(links, appid)].filter((other) => other !== name).map((other) => path.join(parent, other));
}

/*
  Library-scan step. `games` are the installed games found ({ appid, gameDir }); `folderFor(id,
  game)` names the save folder a shortcut id would use. Removes from `data` the stray "game" the
  generic save-folder scan made out of a linked id, and returns the links and the alias folders that
  exist. A shortcut that does not point into a game folder is not linked: nothing is guessed.
*/
function foldAliasSaves({ data, games, entries, folderFor }) {
  const links = new Map();
  const aliasPaths = new Map();
  const taken = new Set();
  for (const game of games || []) {
    if (!game || !game.appid) continue;
    const ids = linkedIds(game.gameDir, entries).filter((id) => !taken.has(id));
    if (ids.length === 0) continue;
    ids.forEach((id) => taken.add(id));
    links.set(String(game.appid), ids);
    for (const id of ids) {
      const folder = folderFor(id, game);
      if (!folder) continue;
      let exists = false;
      try {
        exists = fs.statSync(folder).isDirectory();
      } catch {
        /* the game was never started from that shortcut */
      }
      if (!exists) continue;
      const list = aliasPaths.get(String(game.appid)) || [];
      list.push(folder);
      aliasPaths.set(String(game.appid), list);
    }
  }
  for (let i = data.length - 1; i >= 0; i--) {
    if (taken.has(String(data[i] && data[i].appid))) data.splice(i, 1);
  }
  return { links, aliasPaths };
}

/*
  Reads several save folders of one game and merges them by achievement name: unlocked in any is
  unlocked, the oldest unlock date wins. The first readable folder is the base; a folder that cannot
  be read is skipped, and the reader's own error is thrown only when none can.
*/
async function readMergedSaves(readFolder, folders, { isEarned, timeOf }) {
  let merged = null;
  let firstError = null;
  for (const folder of folders) {
    let save;
    try {
      save = await readFolder(folder);
    } catch (err) {
      if (!firstError) firstError = err;
      continue;
    }
    if (!save || typeof save !== 'object') continue;
    if (!merged) {
      merged = { ...save };
      continue;
    }
    for (const [name, incoming] of Object.entries(save)) {
      const own = merged[name];
      if (own === undefined) {
        merged[name] = incoming;
      } else if (isEarned(incoming) && !isEarned(own)) {
        merged[name] = incoming;
      } else if (isEarned(incoming) && isEarned(own)) {
        const a = timeOf(own);
        const b = timeOf(incoming);
        if (b > 0 && (a === 0 || b < a)) merged[name] = incoming;
      }
    }
  }
  if (!merged) throw firstError || new Error('No save folder to read');
  return merged;
}

// The Watchdog's parsed lists ([{ name, Achieved, UnlockTime, ... }]) of the twin folders, merged the same way.
function mergeParsedLists(lists) {
  const byName = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      const own = byName.get(item.name);
      if (!own) byName.set(item.name, item);
      else if (item.Achieved && !own.Achieved) byName.set(item.name, item);
      else if (item.Achieved && own.Achieved) {
        const a = Number(own.UnlockTime) || 0;
        const b = Number(item.UnlockTime) || 0;
        if (b > 0 && (a === 0 || b < a)) byName.set(item.name, item);
      }
    }
  }
  return [...byName.values()].sort((a, b) => (Number(b.UnlockTime) || 0) - (Number(a.UnlockTime) || 0));
}

module.exports = { idsFile, read, linkedIds, update, appidFor, idsFor, twinFolders, foldAliasSaves, readMergedSaves, mergeParsedLists };
