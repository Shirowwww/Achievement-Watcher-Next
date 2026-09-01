'use strict';

// A session is measured on the monotonic clock, not the wall clock: an NTP correction or a manual
// time change during a session used to produce a negative duration, and the registry counter it is
// added to is an unsigned DWORD, so the total wrapped to a nonsense value.
class Timer {
  constructor() {
    this.start = new Date();
    this.startedAt = process.hrtime.bigint();
    this.played = 0;
  }

  stop() {
    const elapsedSeconds = Number(process.hrtime.bigint() - this.startedAt) / 1e9;
    this.played = Math.max(0, Math.floor(elapsedSeconds));
  }
}

module.exports = Timer;
