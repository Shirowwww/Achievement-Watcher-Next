'use strict';

/*
  Offscreen renders, a few at a time: each one is a whole window, and too many at once slow every
  load past its timeout. Asks from what is on screen go before those made ahead of time, and the
  same key asked twice is rendered once, moved up when the second ask is the more urgent.
*/

const DEFAULT_LIMIT = 3;

function createRenderQueue({ limit = DEFAULT_LIMIT } = {}) {
  const now = [];
  const later = [];
  const byKey = new Map();
  let running = 0;

  function pump() {
    while (running < limit && (now.length || later.length)) {
      const job = now.shift() || later.shift();
      job.started = true;
      running += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          running -= 1;
          if (byKey.get(job.key) === job) byKey.delete(job.key);
          pump();
        });
    }
  }

  // `key` null renders every time; `ahead` waits behind every ask from the screen.
  function run(key, task, { ahead = false } = {}) {
    const known = key == null ? null : byKey.get(key);
    if (known) {
      if (!ahead && known.ahead && !known.started) {
        later.splice(later.indexOf(known), 1);
        known.ahead = false;
        now.push(known);
      }
      return known.promise;
    }
    const job = { key, task, ahead, started: false };
    job.promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
    if (key != null) byKey.set(key, job);
    (ahead ? later : now).push(job);
    pump();
    return job.promise;
  }

  return { run, running: () => running, waiting: () => now.length + later.length };
}

module.exports = { createRenderQueue, DEFAULT_LIMIT };
