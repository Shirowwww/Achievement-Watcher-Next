'use strict';

/*
  One reader for every shape an unlock date arrives in, because each source picked its own: Steam
  and the emulator saves write epoch seconds, Xbox and Epic write an ISO 8601 string, and a few
  write milliseconds. Answers epoch SECONDS, which is what the library and the schema cache store.

  Anything above this is milliseconds: 1e10 seconds is the year 2286, while a millisecond stamp has
  been past it since 1970. A broken save can hold micro or nanoseconds (#212), read by the same rule
  of a factor 1000 per range. A stamp between those ranges (a Windows FILETIME, .NET ticks) would
  divide into a plausible but wrong year, so it answers no date at all.
*/
const MILLISECOND_THRESHOLD = 10_000_000_000;
const UNIT_RANGES = [
  [MILLISECOND_THRESHOLD, 1],
  [MILLISECOND_THRESHOLD * 1e3, 1e3],
  [MILLISECOND_THRESHOLD * 1e6, 1e6],
  [MILLISECOND_THRESHOLD * 1e8, 0], // FILETIME and .NET ticks land here
  [MILLISECOND_THRESHOLD * 1e9, 1e9],
];

function epochSeconds(numeric) {
  const range = UNIT_RANGES.find(([below]) => numeric < below);
  return range && range[1] ? Math.floor(numeric / range[1]) : 0;
}

function parseUnlockTimeSeconds(value) {
  if (value === null || value === undefined) return 0;

  const numeric = typeof value === 'number' ? value : /^\d+$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN;
  if (Number.isFinite(numeric)) return numeric <= 0 ? 0 : epochSeconds(numeric);

  const raw = String(value).trim();
  if (!raw) return 0;
  const epochMs = Date.parse(raw);
  return Number.isFinite(epochMs) && epochMs > 0 ? Math.floor(epochMs / 1000) : 0;
}

module.exports = { parseUnlockTimeSeconds, MILLISECOND_THRESHOLD };
