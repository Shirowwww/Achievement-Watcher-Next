'use strict';

const { sharedAppModulePath } = require('./sharedAppModule.js');
const { SOURCE_LABEL } = require(sharedAppModulePath('util/sourceIdentity.js'));

const XBOX_POLL_INTERVAL_MS = 30000;
const XBOX_POLL_MAX_BACKOFF_MS = 10 * 60000;
// A 429 without Retry-After still waits this long; a Retry-After is followed up to an hour.
const XBOX_RATE_LIMIT_MIN_MS = 2 * 60000;
const XBOX_RETRY_AFTER_CAP_MS = 60 * 60000;
// An unlock earned just before quitting takes a few seconds to reach the account.
const XBOX_EXIT_POLL_DELAY_MS = 15000;

// Run one Xbox poll at a time for a state object. The current-state callback makes a poll
// cancellable when the running game changes while an API request or a notification is pending.
async function runXboxPoll({
  state,
  getCurrentState,
  ensureSession,
  pollOnce,
  writeState,
  beforeNotifications = () => {},
  notifyUnlock = async () => {},
  onError = () => {},
}) {
  const isCurrent = () => getCurrentState() === state;
  if (!state || !isCurrent() || state.polling) return false;

  state.polling = true;
  try {
    const auth = await ensureSession(state.auth);
    if (!isCurrent()) return false;
    state.auth = auth;

    const { snapshot, newUnlocked } = await pollOnce({
      auth,
      titleId: state.appid,
      previousSnapshot: state.snapshot,
    });
    if (!isCurrent()) return false;

    state.failures = 0;
    state.lastError = null;
    state.snapshot = snapshot;
    writeState(state.appid, snapshot);
    if (!newUnlocked.length) return true;

    beforeNotifications(newUnlocked);
    if (!isCurrent()) return false;
    for (const id of newUnlocked) {
      if (!isCurrent()) return false;
      await notifyUnlock(id);
      if (!isCurrent()) return false;
    }
    return true;
  } catch (error) {
    if (isCurrent()) {
      state.failures = (Number(state.failures) || 0) + 1;
      state.lastError = error;
      onError(error);
    }
    return false;
  } finally {
    state.polling = false;
  }
}

// The poll follows the game it was started for, whatever source runs it.
function matchesActiveXboxPoll(state, exitedGame, normalizeTitleId) {
  if (!exitedGame) return true;
  if (!state) return false;
  if (state.game && state.game.appid != null) return String(exitedGame.appid) === String(state.game.appid);
  if (String(exitedGame.source || '') !== SOURCE_LABEL.XBOX_PC) return false;
  return normalizeTitleId(exitedGame.appid) === state.appid;
}

/*
  The Xbox title whose unlocks belong to a running game, or null. An Xbox PC game is its own title.
  Any other source (an online-fix or GBE copy, #231) gets the imported title the library folds into
  it, matched by name the same way (fuzzyAppid.sameTitleAppid, the title asked against the game).
  Two titles matching is no answer: polling the wrong one would announce another game's unlocks.
*/
function xboxTitleForGame(game, { normalizeTitleId, listTitles, titleName, sameTitleAppid }) {
  if (!game) return null;
  if (String(game.source || '') === SOURCE_LABEL.XBOX_PC) return normalizeTitleId(game.appid) || null;
  const name = String(game.name || '').trim();
  if (!name) return null;
  const target = [{ appid: 'running', name }];
  try {
    const hits = listTitles().filter((titleId) => {
      const title = titleName(titleId);
      return title && sameTitleAppid(title, target) === 'running';
    });
    return hits.length === 1 ? normalizeTitleId(hits[0]) || null : null;
  } catch {
    return null;
  }
}

function isRateLimit(error) {
  return Number(error && error.status) === 429 || Number(error && error.retryAfterMs) > 0;
}

// How long to wait before the next poll: the interval, doubled per failure in a row up to a ceiling,
// and never less than a rate limit asks for.
function nextPollDelay(state) {
  const failures = Math.max(0, Number(state && state.failures) || 0);
  if (!failures) return XBOX_POLL_INTERVAL_MS;
  const backoff = Math.min(XBOX_POLL_MAX_BACKOFF_MS, XBOX_POLL_INTERVAL_MS * 2 ** Math.min(failures, 20));
  const error = state.lastError;
  if (!isRateLimit(error)) return backoff;
  const asked = Math.min(XBOX_RETRY_AFTER_CAP_MS, Number(error.retryAfterMs) || 0);
  return Math.max(backoff, asked, XBOX_RATE_LIMIT_MIN_MS);
}

function stopPollLoop(state) {
  if (!state) return;
  state.stopped = true;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

// Polls at once, then again after each poll settles, so a slow reply never stacks a second request.
function startPollLoop(state, poll) {
  state.stopped = false;
  const tick = async () => {
    state.timer = null;
    await poll();
    if (!state.stopped) state.timer = setTimeout(tick, nextPollDelay(state));
  };
  return tick();
}

// The game closed: one last poll catches what it earned at the end, then the loop is over.
function finishPollLoop(state, poll, onDone = () => {}) {
  stopPollLoop(state);
  const delay = Math.max(XBOX_EXIT_POLL_DELAY_MS, state.failures ? nextPollDelay(state) : 0);
  state.timer = setTimeout(async () => {
    state.timer = null;
    try {
      await poll();
    } finally {
      onDone();
    }
  }, delay);
}

module.exports = {
  runXboxPoll,
  matchesActiveXboxPoll,
  xboxTitleForGame,
  nextPollDelay,
  startPollLoop,
  stopPollLoop,
  finishPollLoop,
  XBOX_POLL_INTERVAL_MS,
  XBOX_POLL_MAX_BACKOFF_MS,
  XBOX_EXIT_POLL_DELAY_MS,
};
