'use strict';

/*
  A host that just proved itself unreachable isn't worth asking again for every game: a user log
  showed a 210s offline scan where every appid spent ~10s failing DNS then 30s hitting the
  per-game load timeout. The breaker turns that into one failure the rest of the scan reads.
*/

// Both plain fetch and Chromium report an unreachable host, each in its own spelling. Matching only
// the fetch names left the browser fallback unable to open the breaker.
function isSteamTransportFailure(err) {
  const text = String((err && (err.code || err.message)) || err || '').toLowerCase();
  return /enotfound|name_not_found|name_not_resolved|internet_disconnected|err_connection|address_unreachable|proxy_connection|eai_again|econnrefused|econnreset|etimedout|timeout|fetch failed|network|socket|dns/.test(
    text
  );
}

/*
  failureLimit consecutive counted failures open the breaker for cooldownMs. Any success closes it
  at once: a reachable host is proof, and waiting out a cooldown that no longer applies would be a
  worse error than the one being avoided.
*/
function createNetworkCircuit({ failureLimit = 2, cooldownMs = 5 * 60 * 1000, shouldCount = () => true, now = () => Date.now() } = {}) {
  let failures = 0;
  let skipUntil = 0;

  return {
    cooldownMs,
    unavailable() {
      return now() < skipUntil;
    },
    // True only on the call that opens the breaker, so the caller can log it once.
    recordFailure(err) {
      if (!shouldCount(err)) return false;
      failures += 1;
      if (failures < failureLimit) return false;
      failures = 0;
      skipUntil = now() + cooldownMs;
      return true;
    },
    recordSuccess() {
      failures = 0;
      skipUntil = 0;
    },
    reset() {
      failures = 0;
      skipUntil = 0;
    },
  };
}

module.exports = { createNetworkCircuit, isSteamTransportFailure };
