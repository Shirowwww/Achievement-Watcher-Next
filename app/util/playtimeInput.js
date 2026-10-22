'use strict';

// Reading and writing the playtime a user enters in the "Edit playtime" dialog: one whole number
// each for days, hours and minutes. A blank field counts as zero, and no field has to stay below
// the next unit up ("31" hours is as good as 1 day and 7 hours).

const MAX_SECONDS = 0xffffffff; // the registry stores the total as a DWORD

const FIELDS = [
  ['days', 86400],
  ['hours', 3600],
  ['minutes', 60],
];

// { days, hours, minutes } for the dialog's starting values; seconds are dropped.
function splitPlaytime(seconds) {
  let left = Math.max(0, Math.floor(Number(seconds) || 0));
  const parts = {};
  for (const [name, size] of FIELDS) {
    parts[name] = Math.floor(left / size);
    left -= parts[name] * size;
  }
  return parts;
}

// Seconds, or null when a field is not a whole number or the total does not fit.
function joinPlaytime(values) {
  let seconds = 0;
  for (const [name, size] of FIELDS) {
    const raw = String((values && values[name]) ?? '').trim();
    if (raw === '') continue;
    if (!/^\d+$/.test(raw)) return null;
    seconds += Number(raw) * size;
  }
  return seconds > MAX_SECONDS ? null : seconds;
}

module.exports = { splitPlaytime, joinPlaytime, MAX_SECONDS };
