'use strict';

/*
  Play time for console games, which never match a process of their own: while an emulator process
  runs, its log names the booted game (console/emulatorCurrent.js). A session opens when a game
  boots, moves when another one boots in the same window, and closes when the emulator exits or,
  for RPCS3, logs the stop. Xenia and shadPS4 log no stop, so a game quit to their menu counts until
  the emulator closes. A check that cannot tell leaves the session as it is. Nothing is read while
  no emulator runs.
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

  // Throws when the titles cannot be read; only a successful read is remembered.
  function targetsOf(emulator) {
    const hit = cache.get(emulator.id);
    if (hit && now() - hit.at < TARGETS_TTL_MS) return hit.list;
    const list = (targets[emulator.id] && targets[emulator.id]()) || [];
    cache.set(emulator.id, { at: now(), list });
    return list;
  }

  // The game running now, null for none, undefined when the log or the titles cannot tell.
  function currentOf(emulator, row) {
    try {
      return emulator.current({ exePath: processPath(row.pid) || '', targets: () => targetsOf(emulator), emulatorDirs });
    } catch (err) {
      log(`[Playtime] ${emulator.id} game unreadable: ${err.message || err}`);
      return undefined;
    }
  }

  function close(emulator) {
    const session = active.get(emulator.id);
    if (!session) return;
    active.delete(emulator.id);
    stop(session.appid);
  }

  function follow(emulator, row) {
    const game = currentOf(emulator, row);
    if (game === undefined) return;
    const session = active.get(emulator.id);
    if (session && game && session.appid === game.appid) return;
    close(emulator);
    if (!game) return;
    active.set(emulator.id, { appid: game.appid });
    start({ appid: game.appid, name: game.name || game.appid, source: emulator.source, binary: row.process, emulatorPid: row.pid });
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
      if (row) {
        follow(emulator, row);
        continue;
      }
      cache.delete(emulator.id);
      close(emulator);
    }
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

  return { tick };
}

module.exports = { createEmulatorSessions, TARGETS_TTL_MS };
