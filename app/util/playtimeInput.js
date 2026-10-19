'use strict';

// Reading and writing the playtime a user types in the "Edit playtime" prompt. Plain numbers are
// hours ("12", "12.5", "12,5"); "12:30", "12h30", "12h 30m" and "90m" are hours and minutes.

const MAX_SECONDS = 0xffffffff; // the registry stores the total as a DWORD

const HOURS_ONLY = /^(\d+(?:[.,]\d+)?)\s*h?$/i;
const HOURS_MINUTES = /^(\d+)\s*(?::|h)\s*(\d{1,2})\s*(?:m|min)?$/i;
const MINUTES_ONLY = /^(\d+)\s*(?:m|min)$/i;

// Seconds, or null when the text is not a duration.
function parsePlaytime(text) {
  const value = String(text == null ? '' : text).trim();
  let seconds = null;
  let match;
  if ((match = HOURS_MINUTES.exec(value))) {
    const minutes = Number(match[2]);
    if (minutes >= 60) return null;
    seconds = Number(match[1]) * 3600 + minutes * 60;
  } else if ((match = MINUTES_ONLY.exec(value))) {
    seconds = Number(match[1]) * 60;
  } else if ((match = HOURS_ONLY.exec(value))) {
    seconds = Math.round(Number(match[1].replace(',', '.')) * 3600);
  }
  if (seconds == null || !Number.isFinite(seconds) || seconds > MAX_SECONDS) return null;
  return seconds;
}

// The prompt's starting value, in a form parsePlaytime reads back: "12h30", "5h", "0h45".
function formatPlaytimeInput(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return minutes > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`;
}

module.exports = { parsePlaytime, formatPlaytimeInput, MAX_SECONDS };
