'use strict';

// A session is measured on the monotonic clock, not the wall clock: an NTP correction or a manual
// time change during a session used to produce a negative duration, and the registry counter it is
// added to is an unsigned DWORD, so the total wrapped to a nonsense value.
class Timer {
  constructor() {
    this.start = new Date();
    this.startedAt = process.hrtime.bigint();
    this.played = 0;
    this.saved = 0;
    this.stopped = false;
  }

  elapsed() {
    if (this.stopped) return this.played;
    const elapsedSeconds = Number(process.hrtime.bigint() - this.startedAt) / 1e9;
    return Math.max(0, Math.floor(elapsedSeconds));
  }

  stop() {
    this.played = this.elapsed();
    this.stopped = true;
  }

  // The seconds not written yet, marked as written: the counter is saved while the game runs, so a
  // power cut loses one interval instead of the whole session.
  checkpoint() {
    const seconds = Math.max(0, this.elapsed() - this.saved);
    this.saved += seconds;
    return seconds;
  }
}

module.exports = Timer;
