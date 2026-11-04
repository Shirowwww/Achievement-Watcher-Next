'use strict';

/*
  Which game the overlay shortcut opens. A game the playtime monitor tracks by its process wins.
  Emulators (RPCS3, Xenia, shadPS4...) run the game inside their own exe, so the monitor never
  knows which game is up: the game that just unlocked something live stands in for it, and only
  without either does the app fall back to the open or first library game. Every live watcher
  feeds it (launchers too), so a game closed minutes ago is still the target, which beats the
  arbitrary first library game.
*/
// shortcut: an emulator exit is not seen, so a stale unlock can steer the overlay for this long;
// replace with real emulator game detection once the playtime monitor has it.
const LIVE_UNLOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

function createOverlayTarget() {
  let lastUnlock = null;

  /** @param {{ appid?: unknown, notificationType?: string } | null | undefined} payload */
  function noteLiveUnlock(payload, now = Date.now()) {
    if (!payload || payload.notificationType) return;
    const appid = String(payload.appid == null ? '' : payload.appid).trim();
    if (!appid || appid === '0') return;
    lastUnlock = { appid, at: now };
  }

  /** @returns {string} the appid to ask for, '0' meaning "let the app choose" */
  function appidFor(runningAppid, now = Date.now()) {
    if (runningAppid) return String(runningAppid);
    if (lastUnlock && now - lastUnlock.at <= LIVE_UNLOCK_WINDOW_MS) return lastUnlock.appid;
    return '0';
  }

  function wrapNotify(notify, clock = Date.now) {
    return (payload, opts) => {
      noteLiveUnlock(payload, clock());
      return notify(payload, opts);
    };
  }

  return { noteLiveUnlock, appidFor, wrapNotify };
}

module.exports = { createOverlayTarget, LIVE_UNLOCK_WINDOW_MS };
