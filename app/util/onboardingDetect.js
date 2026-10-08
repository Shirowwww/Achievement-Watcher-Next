'use strict';

/*
  What the first-run guide reports as "found on this PC". Every reader is injected, so the numbers
  can be tested without a launcher installed and a failing launcher costs one row, not the guide.
*/

// Steam lists its shared redistributables as an installed "app"; it is not a game.
const STEAM_REDISTRIBUTABLES = new Set(['228980']);

const LAUNCHERS = ['steam', 'gog', 'epic', 'ubisoft'];

function steamInstalledAppids({ libraryAppsDirs, readdir }) {
  const ids = new Set();
  for (const dir of libraryAppsDirs()) {
    let names = [];
    try {
      names = readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const match = /^appmanifest_(\d+)\.acf$/i.exec(name);
      if (match && !STEAM_REDISTRIBUTABLES.has(match[1])) ids.add(match[1]);
    }
  }
  return [...ids];
}

function idsOf(entries) {
  const ids = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = entry && typeof entry === 'object' ? entry.appid : entry;
    if (id !== undefined && id !== null && String(id) !== '') ids.add(String(id));
  }
  return [...ids];
}

async function collectLaunchers(readers) {
  const found = {};
  for (const key of LAUNCHERS) {
    try {
      found[key] = idsOf(await readers[key]());
    } catch {
      found[key] = [];
    }
  }
  return found;
}

// Runs `task` over `items` with at most `limit` in flight, keeping the results in item order.
async function mapLimit(items, limit, task, shouldStop = () => false) {
  const results = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length && !shouldStop()) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// `folders` is one list of { appid, source } per folder the guide scanned.
function buildReport({ launchers = {}, folders = [] } = {}) {
  const launcherIds = Object.fromEntries(LAUNCHERS.map((key) => [key, idsOf(launchers[key])]));
  const emulatorGames = new Set();
  for (const games of folders) for (const id of idsOf(games)) emulatorGames.add(id);
  const everything = new Set(emulatorGames);
  for (const key of LAUNCHERS) for (const id of launcherIds[key]) everything.add(id);
  return {
    launchers: Object.fromEntries(LAUNCHERS.map((key) => [key, launcherIds[key].length])),
    emulators: { games: emulatorGames.size, folders: folders.filter((games) => idsOf(games).length > 0).length },
    total: everything.size,
  };
}

module.exports = { LAUNCHERS, steamInstalledAppids, collectLaunchers, mapLimit, buildReport };
