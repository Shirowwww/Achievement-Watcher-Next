'use strict';

/*
  Play time for console games, which never match a process of their own: while an emulator process
  runs, its log names the booted game (console/emulatorCurrent.js). A session opens when a game
  boots, moves when another one boots in the same window, and closes when the emulator exits or
  goes back to its menu. Nothing is read while no emulator runs.
*/

const { EMULATORS } = require('../console/emulatorCurrent.js');

// The titles AW Next reads achievements for are found again at most this often while a game runs.
const TARGETS_TTL_MS = 60_000;

/**
 * @param {{
 *   listProcesses: () => Promise<Array<{ process: string, pid: number }>> | Array<{ process: string, pid: number }>,
 *   processPath: (pid: number) => string,
 *   targets: Record<string, () => object[]>,
 *   emulatorDirs: () => string[],
 *   start: (game: object) => void,
 *   stop: (appid: string) => void,
 *   emulators?: object[],
 *   now?: () => number,
 *   log?: (line: string) => void,
 * }} deps
 */
function createEmulatorSessions({ listProcesses, processPath, targets, emulatorDirs, start, stop, emulators = EMULATORS, now = Date.now, log = () => {} }) {
  const active = new Map();
  const cache = new Map();

  function targetsOf(emulator) {
    const hit = cache.get(emulator.id);
    if (hit && now() - hit.at < TARGETS_TTL_MS) return hit.list;
    let list = [];
    try {
      list = (targets[emulator.id] && targets[emulator.id]()) || [];
    } catch (err) {
      log(`[Playtime] ${emulator.id} titles unreadable: ${err.message || err}`);
    }
    cache.set(emulator.id, { at: now(), list });
    return list;
  }

  function currentOf(emulator, row) {
    try {
      return emulator.current({ exePath: processPath(row.pid) || '', targets: () => targetsOf(emulator), emulatorDirs });
    } catch (err) {
      log(`[Playtime] ${emulator.id} log unreadable: ${err.message || err}`);
      return null;
    }
  }

  function close(emulator) {
    const session = active.get(emulator.id);
    if (!session) return;
    active.delete(emulator.id);
    stop(session.appid);
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await check();
    } finally {
      busy = false;
    }
  }

  async function check() {
    let rows;
    try {
      rows = await listProcesses();
    } catch (err) {
      log(`[Playtime] emulator check skipped: ${err.message || err}`);
      return;
    }
    for (const emulator of emulators) {
      const row = rows.find((entry) => entry && emulator.process.test(String(entry.process || '')));
      if (!row) {
        cache.delete(emulator.id);
        close(emulator);
        continue;
      }
      const game = currentOf(emulator, row);
      const session = active.get(emulator.id);
      if (session && game && session.appid === game.appid) continue;
      close(emulator);
      if (!game) continue;
      active.set(emulator.id, { appid: game.appid });
      start({ appid: game.appid, name: game.name || game.appid, source: emulator.source, binary: row.process, emulatorPid: row.pid });
    }
  }

  return { tick, stopAll: () => emulators.forEach(close) };
}

module.exports = { createEmulatorSessions, TARGETS_TTL_MS };
