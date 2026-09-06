'use strict';

const path = require('path');

// Seed already-running games so their playtime is recorded on exit.

function normalizeBinary(binary) {
  return typeof binary === 'string' ? binary.trim().toLowerCase() : '';
}

// Case-insensitive match of a running process name against a game's stored binary, tolerating the
// Unreal Engine "<name>-Win64-Shipping.exe" variant.
function binaryMatchesProcess(binary, process) {
  const b = normalizeBinary(binary);
  if (!b) return false;
  const p = String(process || '').toLowerCase();
  if (!p) return false;
  return b === p || b.replace('.exe', '-win64-shipping.exe') === p;
}

function buildBinaryIndex(gameIndex) {
  const byProcessName = new Map();
  if (!gameIndex || typeof gameIndex[Symbol.iterator] !== 'function') return byProcessName;

  const add = (processName, game) => {
    let matches = byProcessName.get(processName);
    if (!matches) {
      matches = [];
      byProcessName.set(processName, matches);
    }
    matches.push(game);
  };

  for (const game of gameIndex) {
    if (!game) continue;
    const binary = normalizeBinary(game.binary);
    if (!binary) continue;
    add(binary, game);

    const shippingVariant = binary.replace('.exe', '-win64-shipping.exe');
    // Only .exe names get an Unreal shipping alias.
    if (shippingVariant !== binary) add(shippingVariant, game);
  }

  return byProcessName;
}

// Preserve game-index order; live filters are applied later.
function getBinaryMatches(binaryIndex, process) {
  if (!(binaryIndex instanceof Map)) return [];
  return binaryIndex.get(String(process || '').toLowerCase()) || [];
}

// Paths as the process monitor, the index and cfg/exeList.db spell them, made comparable.
function normalizePath(value) {
  return String(value || '')
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function parentDir(normalized) {
  const cut = normalized.lastIndexOf('/');
  return cut < 0 ? '' : normalized.slice(0, cut);
}

/*
  Several index rows answer to one executable name: two games named after the same thing, or an old
  catalogue row beside the library's own. The install folder is what tells them apart. The row whose
  executable is the file that just started wins; failing that, the one whose install folder holds
  it. Null when the paths settle nothing, so the caller can keep looking.
*/
function pickGameForProcess(matches, filepath, exePathFor) {
  const list = Array.isArray(matches) ? matches : [];
  if (list.length === 1) return list[0];
  const file = normalizePath(filepath);
  if (list.length === 0 || !file) return null;

  const exact = [];
  const sameFolder = [];
  for (const game of list) {
    if (!game) continue;
    const known = game.exePath || (typeof exePathFor === 'function' ? exePathFor(game.appid) : '');
    const exe = normalizePath(known);
    if (!exe) continue;
    if (exe === file) exact.push(game);
    else {
      const folder = parentDir(exe);
      if (folder && file.startsWith(folder + '/')) sameFolder.push(game);
    }
  }
  if (exact.length === 1) return exact[0];
  if (exact.length === 0 && sameFolder.length === 1) return sameFolder[0];
  return null;
}

/*
  The Watchdog reads two indexes: cfg/gameIndex.json, which the app seeds from the installs it
  found on this disk, and the catalogue a pre-3.x install downloaded into steam_cache/schema and
  nothing has refreshed since. A catalogue row is a guess about every copy of an executable name;
  the app's row is about one folder on this machine, so where both name the same executable the
  catalogue's claim goes. One file stores appids as strings and the other as numbers, so every
  row leaves here with a string appid.
*/
function mergeGameIndexes(catalogue, userRows) {
  const rows = (list) =>
    (Array.isArray(list) ? list : []).filter((game) => game && game.appid != null).map((game) => ({ ...game, appid: String(game.appid) }));
  const user = rows(userRows);
  const known = new Set(user.map((game) => game.appid));
  const claimed = new Set(user.map((game) => normalizeBinary(game.binary)).filter(Boolean));
  const yielded = [];
  const list = [];
  for (const game of rows(catalogue)) {
    if (known.has(game.appid)) continue;
    if (claimed.has(normalizeBinary(game.binary))) {
      yielded.push({ appid: game.appid, name: game.name, binary: game.binary });
      game.binary = '';
    }
    list.push(game);
  }
  return { list: list.concat(user), yielded };
}

// Return metadata snapshots without exposing timer or PID state.
function snapshotActiveGames(sessions) {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .filter((session) => session && session.appid != null)
    .map(({ pids, timer, ...game }) => ({ ...game }));
}

// Select overlay and Xbox targets from active sessions.
function describeActiveGames(sessions) {
  const games = snapshotActiveGames(sessions);
  return {
    games,
    overlayGame: games.length > 0 ? games[games.length - 1] : null,
    xboxGame: games.findLast((game) => String(game.source || '') === 'Xbox PC') || null,
  };
}

// Build sessions from task-list snapshots; tests inject the timer. The snapshot carries no image
// paths, so `resolvePath` is asked for one only when several games share the executable name.
function buildSeededSessions({ gameIndex, processes, now = Date.now(), createTimer = () => ({}), resolvePath = null, exePathFor = null }) {
  if (!Array.isArray(gameIndex) || !Array.isArray(processes)) return [];
  const gamesByProcessName = buildBinaryIndex(gameIndex);
  const sessionsByAppid = new Map();

  for (const proc of processes) {
    if (!proc || !Number.isFinite(Number(proc.pid))) continue;
    const pid = Number(proc.pid);
    const matches = getBinaryMatches(gamesByProcessName, proc.process || proc.name);
    if (matches.length === 0) continue;
    let filepath = proc.filepath || '';
    let game = matches[0];
    if (matches.length > 1) {
      if (!filepath && typeof resolvePath === 'function') {
        try {
          filepath = resolvePath(pid) || '';
        } catch {
          filepath = '';
        }
      }
      game = pickGameForProcess(matches, filepath, exePathFor);
      if (!game) continue; // still ambiguous - the normal creation watcher handles launches from now on
    }
    const existing = sessionsByAppid.get(game.appid);
    if (existing) {
      existing.pids.add(pid);
      continue;
    }
    sessionsByAppid.set(game.appid, {
      appid: game.appid,
      name: game.name,
      binary: game.binary,
      icon: game.icon,
      source: game.source || '',
      steamappid: game.steamappid,
      iconUrl: game.iconUrl,
      headerUrl: game.headerUrl,
      portraitUrl: game.portraitUrl,
      pids: new Set([pid]),
      timer: createTimer(now),
      exePath: filepath,
      gameDir: filepath ? path.dirname(filepath) : '',
      seeded: true,
      startedAt: now,
    });
  }
  return [...sessionsByAppid.values()];
}

module.exports = {
  binaryMatchesProcess,
  buildBinaryIndex,
  buildSeededSessions,
  getBinaryMatches,
  pickGameForProcess,
  mergeGameIndexes,
  snapshotActiveGames,
  describeActiveGames,
};
