'use strict';

/*
  Which parts of the monitor are actually working.

  The heartbeat only proves the event loop turns, so a subsystem that failed to start - a console
  watcher whose emulator folder is unreadable, the playtime monitor losing its native binding - left
  the app supervising a process that reported itself healthy while tracking nothing. Each subsystem
  says how it went here, and the report rides along with the heartbeat so the failure reaches the
  app's log instead of only this process's own.

  Deliberately not a UI state: the app has four (running / starting / unresponsive / stopped) and a
  degraded monitor is still running. This is diagnostic, and it is what an exported log will show.
*/

const state = new Map();

function report(name, ok, detail) {
  const key = String(name || '').trim();
  if (!key) return;
  state.set(key, {
    ok: ok !== false,
    detail: ok === false ? String((detail && detail.message) || detail || 'failed').slice(0, 200) : '',
  });
}

// The names that are not working, sorted so an unchanged set compares equal between beats.
function failed() {
  return [...state.entries()]
    .filter(([, value]) => !value.ok)
    .map(([name, value]) => ({ name, detail: value.detail }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

function snapshot() {
  return [...state.entries()].map(([name, value]) => ({ name, ...value })).sort((l, r) => l.name.localeCompare(r.name, 'en'));
}

function reset() {
  state.clear();
}

module.exports = { report, failed, snapshot, reset };
