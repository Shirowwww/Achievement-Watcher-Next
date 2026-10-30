'use strict';

// Reading and writing the playtime a user enters in the "Edit playtime" dialog: one whole number
// per field. A blank field counts as zero, and no field has to stay below the next unit up ("31"
// hours is as good as 1 day and 7 hours).

const { UNITS_BY_MODE } = require('./libraryChrome.js');

const MAX_SECONDS = 0xffffffff; // the registry stores the total as a DWORD

const UNIT_SECONDS = Object.freeze({ days: 86400, hours: 3600, minutes: 60, seconds: 1 });

// The tiles' 'auto' mode switches units with the total; the dialog keeps days, hours and minutes.
const AUTO_FIELDS = Object.freeze(['days', 'hours', 'minutes']);

// The fields for a Library tiles > Playtime choice, largest unit first: the units the tiles use.
function playtimeFields(mode) {
  return UNITS_BY_MODE[mode] || AUTO_FIELDS;
}

// { field: number } for the dialog's starting values; what is below the last field is dropped.
function splitPlaytime(seconds, fields = AUTO_FIELDS) {
  let left = Math.max(0, Math.floor(Number(seconds) || 0));
  const parts = {};
  for (const name of fields) {
    parts[name] = Math.floor(left / UNIT_SECONDS[name]);
    left -= parts[name] * UNIT_SECONDS[name];
  }
  return parts;
}

// Seconds, or null when a field is not a whole number or the total does not fit.
function joinPlaytime(values) {
  let seconds = 0;
  for (const [name, size] of Object.entries(UNIT_SECONDS)) {
    const raw = String((values && values[name]) ?? '').trim();
    if (raw === '') continue;
    if (!/^\d+$/.test(raw)) return null;
    seconds += Number(raw) * size;
  }
  return seconds > MAX_SECONDS ? null : seconds;
}

// The fields after one press of a field's - or + button: the total moves by one of that unit and
// is read back, so 59 minutes and one more is 1 hour. Unreadable fields start again from zero.
function stepPlaytime(values, field, delta, fields = AUTO_FIELDS) {
  const size = UNIT_SECONDS[field] || 0;
  const grain = UNIT_SECONDS[fields[fields.length - 1]];
  const shown = Math.floor((joinPlaytime(values) ?? 0) / grain) * grain;
  const next = Math.min(Math.max(0, shown + delta * size), Math.floor(MAX_SECONDS / grain) * grain);
  return splitPlaytime(next, fields);
}

// The total to store on Confirm, or null when the fields do not read. Fields still as they opened
// keep the stored total, so the seconds a layout without a seconds field hides are not lost. Zero
// is always zero: a total under one minute opens as zero, so Reset after an edit would read as
// untouched and give the hidden seconds back; confirming such a total as it opened clears them.
function playtimeToSave(stored, values, fields = AUTO_FIELDS) {
  const seconds = joinPlaytime(values);
  if (seconds === null || seconds === 0) return seconds;
  return seconds === joinPlaytime(splitPlaytime(stored, fields)) ? stored : seconds;
}

module.exports = { splitPlaytime, joinPlaytime, stepPlaytime, playtimeFields, playtimeToSave, MAX_SECONDS };
