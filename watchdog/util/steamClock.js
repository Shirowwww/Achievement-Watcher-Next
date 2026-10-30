'use strict';

/*
  Steam stamps an unlock with its own clock and the Watchdog ages it with the PC's, so a PC running
  a minute fast saw every Steam client unlock as a minute old and dropped it as Outatime (#155).
  The offset comes from Valve's keyless GetServerInfo: measured at start, then again every hour.
*/

const SERVER_INFO_URL = 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/';
const TIMEOUT_MS = 4000;
const REFRESH_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

function createSteamClock({ fetchImpl = globalThis.fetch, now = Date.now, log = null } = {}) {
  let offset = 0;
  let nextCheck = 0;
  let pending = null;

  async function measure() {
    const sentAt = now();
    try {
      const res = await fetchImpl(SERVER_INFO_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const serverTime = Number(body && body.servertime);
      if (!Number.isFinite(serverTime) || serverTime <= 0) throw new Error('no server time in the answer');
      // servertime is a whole second; rounding the offset up means a fresh unlock can read a second
      // or two old, never as one from the future, which the age check drops.
      offset = Math.ceil(serverTime + 1 - (sentAt + now()) / 2000);
      nextCheck = now() + REFRESH_MS;
      if (log) log(`[steam] Steam's clock is ${offset}s from this PC's`);
    } catch (err) {
      nextCheck = now() + RETRY_MS;
      if (log) log(`[steam] Steam's clock not read (${err.message || err}), keeping ${offset}s`);
    }
  }

  // Seconds to add to this PC's time to read it on Steam's clock.
  async function offsetSeconds() {
    if (!pending && now() >= nextCheck) {
      pending = measure().finally(() => {
        pending = null;
      });
    }
    if (pending) await pending;
    return offset;
  }

  return { offsetSeconds };
}

module.exports = { createSteamClock };
