'use strict';

// Windows preserves switch spelling inconsistently when a second Electron
// instance forwards argv to the resident one. Keep the public CLI contract
// camel-cased, but accept a case-folded spelling from that hand-off too.
const CANONICAL_WINDOW_ARGS = [
  'achievementHidden',
  'appid',
  'description',
  'displayName',
  'gameDisplayAt',
  'gameDisplayName',
  'gameIcon',
  'hidden',
  'icon',
  'image',
  'notificationType',
  'notifyId',
  'paintReport',
  'progressCurrent',
  'progressMax',
  'progressPercent',
  'rarityPercent',
  'realPlatinum',
  'silent',
  'source',
  'trophyGrade',
  'unlockRate',
  'wintype',
];

function normalizeWindowArgs(value) {
  const args = value && typeof value === 'object' ? { ...value } : {};
  const folded = new Map();
  for (const [key, entry] of Object.entries(args)) folded.set(String(key).toLowerCase(), entry);

  for (const key of CANONICAL_WINDOW_ARGS) {
    if (args[key] === undefined && folded.has(key.toLowerCase())) args[key] = folded.get(key.toLowerCase());
  }
  return args;
}

module.exports = { normalizeWindowArgs };
