'use strict';

/*
  One unlock, two routes (#231): a game whose save records its unlocks (OnlineFix's Stats.ini) and
  whose Xbox account is polled too. Both meet in the local baseline (track.js), keyed by the shown
  game's appid and achievement name: whichever route sees the unlock first announces it.
*/

const sameName = (a, b) => String(a ?? '').toUpperCase() === String(b ?? '').toUpperCase();

async function announcedLocally(track, appid, name) {
  const baseline = await track.load(String(appid));
  return baseline.some((entry) => entry && entry.Achieved && sameName(entry.name, name));
}

// Only into a baseline that exists: one created here would make the save's first read announce
// every older unlock as new, since the baseline would no longer be empty enough to seed.
async function recordAccountUnlock(track, appid, name, unlockTime) {
  const baseline = await track.load(String(appid));
  if (baseline.length === 0) return false;
  let found = false;
  const next = baseline.map((entry) => {
    if (!entry || !sameName(entry.name, name)) return entry;
    found = true;
    return entry.Achieved ? entry : { ...entry, Achieved: true, UnlockTime: Number(unlockTime) || 0 };
  });
  if (!found) next.push({ name, Achieved: true, CurProgress: 0, MaxProgress: 0, UnlockTime: Number(unlockTime) || 0 });
  await track.save(String(appid), next);
  return true;
}

module.exports = { announcedLocally, recordAccountUnlock };
