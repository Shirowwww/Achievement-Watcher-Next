'use strict';

/*
  Which game the overlay shortcut opens. A game the playtime monitor tracks by its process wins.
  Emulators (RPCS3, Xenia, shadPS4...) run the game inside their own exe, so the monitor never
  knows which game is up: an emulator that says which game it runs (RPCS3, console/rpcs3Current.js)
  answers next, then the game that just unlocked something live stands in for it, and only
  without any of them does the app fall back to the open or first library game.
*/
// shortcut: an exit of the other emulators is not seen, so a stale unlock can steer the overlay for
// this long; give each emulator a currentGame reader like RPCS3's to retire it.
const LIVE_UNLOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

function createOverlayTarget({ emulatorGame = () => '' } = {}) {
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
    let emulated = '';
    try {
      emulated = String(emulatorGame() || '');
    } catch {
      emulated = '';
    }
    if (emulated) return emulated;
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
