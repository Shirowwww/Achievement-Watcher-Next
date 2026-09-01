'use strict';

/*
  One reader for every shape an unlock date arrives in, because each source picked its own: Steam
  and the emulator saves write epoch seconds, Xbox and Epic write an ISO 8601 string, and a few
  write milliseconds. Answers epoch SECONDS, which is what the library and the schema cache store.

  Anything above this is milliseconds: 1e10 seconds is the year 2286, while a millisecond stamp has
  been past it since 1970.
*/
const MILLISECOND_THRESHOLD = 10_000_000_000;

function parseUnlockTimeSeconds(value) {
  if (value === null || value === undefined) return 0;

  const numeric = typeof value === 'number' ? value : /^\d+$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN;
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return 0;
    return Math.floor(numeric >= MILLISECOND_THRESHOLD ? numeric / 1000 : numeric);
  }

  const raw = String(value).trim();
  if (!raw) return 0;
  const epochMs = Date.parse(raw);
  return Number.isFinite(epochMs) && epochMs > 0 ? Math.floor(epochMs / 1000) : 0;
}

module.exports = { parseUnlockTimeSeconds, MILLISECOND_THRESHOLD };
