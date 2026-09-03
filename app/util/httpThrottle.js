'use strict';

/*
  Steam's public hosts answer a burst with a refusal, not with data. A library of 192 emulator saves
  is loaded by eight scan workers, each asking api.steampowered.com, store.steampowered.com,
  steamhunters.com and steamcommunity.com about its game: far past what any of them allow. The
  refusals came back as "no achievements" and "no name", so those games rendered as a bare AppID with
  an empty achievement list, and the only way out was to rescan until enough calls happened to land
  inside the budget (issue #55).

  A circuit breaker does not help here: the host IS reachable and IS answering, it is answering "not
  so fast". So one gate per host instead. At most `concurrency` requests are in flight, two starts are
  at least `minIntervalMs` apart, and a refusal pauses the whole host rather than only the request
  that hit it - a 429 is a fact about the host, so every other game waits it out instead of spending
  a refusal of its own to learn the same thing.

  No I/O of its own: the caller passes a function that performs the request, and the gate decides
  when it runs and whether it runs again. `now`/`sleep` are injected so the tests describe the
  policy rather than wait on it.
*/

const RETRY_STATUS = new Set([429, 502, 503, 504]);

// Retry-After is either a delay in seconds or an HTTP date. Anything else (absent, malformed, a
// negative value) means "the host did not say", which the caller answers with its own backoff.
function parseRetryAfter(value, now = Date.now()) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // Date.parse is generous enough to read "-5" as a year, which would answer "wait zero" for a
  // header that in fact said nothing usable. A delay is digits only; anything else must be a date.
  if (/^[+-]?\d+$/.test(text)) return null;
  const at = Date.parse(text);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - now);
}

// Status codes worth waiting out. A 404 or a 403 is a final answer about this appid; a 429 or a
// gateway error is a temporary answer about the host.
function isThrottleStatus(status) {
  return RETRY_STATUS.has(Number(status));
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // A pending backoff must never be the reason the process stays alive.
    if (typeof timer.unref === 'function') timer.unref();
  });
}

/*
  attempts counts total tries, so `attempts: 3` is one request plus two retries. backoffMs is the
  wait used when the host refuses without saying for how long; it doubles per attempt and is capped
  by maxBackoffMs, which is also the ceiling on a Retry-After the host does send (a header asking
  for an hour would strand the scan).
*/
function createRequestGate({
  concurrency = 2,
  minIntervalMs = 0,
  attempts = 3,
  backoffMs = 1500,
  maxBackoffMs = 30000,
  // How long a request may spend queued and paced before the gate gives up on it entirely. Set it
  // per host from how much of a game's load budget that host's answer is worth.
  maxWaitMs: defaultMaxWaitMs = 15000,
  now = () => Date.now(),
  sleep = defaultSleep,
  onThrottled = () => {},
} = {}) {
  const waiting = [];
  let inFlight = 0;
  let lastStart = -Infinity;
  let pausedUntil = 0;

  function pump() {
    while (inFlight < concurrency && waiting.length > 0) {
      const next = waiting.shift();
      inFlight += 1;
      next();
    }
  }

  function release() {
    inFlight -= 1;
    pump();
  }

  function acquire() {
    return new Promise((resolve) => {
      waiting.push(resolve);
      pump();
    });
  }

  /*
    The two waits every request owes the host: whatever pause a refusal put in place, then the
    minimum spacing since the previous start. Re-checked in a loop because a refusal recorded while
    this request was already waiting must be honoured too.

    `deadline` is what keeps pacing from turning into stalling. Each game in a scan has its own
    budget (30s in app/parser/achievements.js), so a request that cannot even start inside its share
    of that budget must give up and let the game load without it, rather than hold the whole tile
    hostage to an optional lookup queued behind two hundred others.
  */
  async function waitForTurn(deadline) {
    for (;;) {
      if (now() >= deadline) return false;
      const pause = pausedUntil - now();
      if (pause > 0) {
        if (now() + pause > deadline) return false;
        await sleep(pause);
        continue;
      }
      const spacing = lastStart + minIntervalMs - now();
      if (spacing > 0) {
        if (now() + spacing > deadline) return false;
        await sleep(spacing);
        continue;
      }
      lastStart = now();
      return true;
    }
  }

  function pauseFor(ms) {
    const until = now() + Math.max(0, ms);
    if (until > pausedUntil) pausedUntil = until;
  }

  /*
    Runs `task` under the gate. `task` returns anything; only a value carrying a throttling `status`
    (a fetch Response, or any object with one) triggers a retry, so a task that already turned its
    answer into data is simply rate-limited and never retried.

    Resolves to `null` when the gate could not start the task within `maxWaitMs` of this call: the
    task was NEVER run, so a caller must read null as "not attempted", never as a failed request.
  */
  async function run(task, { label = '', maxWaitMs = defaultMaxWaitMs } = {}) {
    const deadline = now() + maxWaitMs;
    await acquire();
    try {
      let attempt = 0;
      let refusal = null; // the last answer, so a give-up can hand back a refusal rather than null
      for (;;) {
        attempt += 1;
        // Out of budget. A retry that never happened still leaves the refusal that caused it, which
        // is a truer answer than "not attempted" - only a request that never ran at all reports null.
        if (!(await waitForTurn(deadline))) return refusal;
        const answer = await task(attempt);
        if (!answer || !isThrottleStatus(answer.status)) return answer;
        refusal = answer;

        const headers = answer.headers;
        const header = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
        const asked = parseRetryAfter(header, now());
        // Exponential on the attempt already made, so the first refusal waits `backoffMs`.
        const fallback = backoffMs * Math.pow(2, attempt - 1);
        const wait = Math.min(maxBackoffMs, asked == null ? fallback : asked);
        pauseFor(wait);
        onThrottled({ status: Number(answer.status), waitMs: wait, attempt, label, retryAfter: asked });
        if (attempt >= attempts) return answer;
      }
    } finally {
      release();
    }
  }

  return {
    run,
    // Observation only, for the tests; nothing here decides anything.
    stats() {
      return { inFlight, waiting: waiting.length, pausedForMs: Math.max(0, pausedUntil - now()) };
    },
    // A user-driven "check again now" must not sit out a cooldown the previous scan earned.
    reset() {
      pausedUntil = 0;
      lastStart = -Infinity;
    },
  };
}

module.exports = { createRequestGate, parseRetryAfter, isThrottleStatus };
