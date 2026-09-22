'use strict';

/*
  Should the stored library be served in place of a full scan?

  A scan costs seconds per launch - a discovery walk over every library folder, then one metadata and
  unlock load per game - and almost every launch rebuilds a list identical to the one already on
  disk. This decides when that work can be traded for the few hundred stat() calls behind
  util/scanFingerprint.js.

  Deliberately answers with a sentence rather than a boolean: a library that rescans every launch
  should say which condition is refusing it, in the log, without a debugger.
*/

// The fingerprint sees folders and unlock files, never a database or the cloud, so Xbox, Ubisoft
// Connect and progress made on another PC are invisible to it. Past this the library is rebuilt
// whether or not anything moved locally.
const REUSE_TTL_MS = 6 * 60 * 60 * 1000;

// How long a confirmed-miss provisional entry is still allowed to force a full rescan. Short enough
// that a fresh failure still gets its retry within the hour, long enough that it is not just noise
// from the scan that only just found it.
const PROVISIONAL_GRACE_MS = 30 * 60 * 1000;

/*
  entry    - what librarySnapshot.readEntry() returned, or null.
  options  - the onStart() options; a recheck or a cache clear is the user asking for a real scan.
  context  - { now, appVersion, inputsUnchanged } - injected so the decision stays testable and the
             expensive filesystem sweep runs last, only once everything cheaper has passed.
*/
function refuseReason(entry, options = {}, context = {}) {
  if (!entry || !Array.isArray(entry.games) || entry.games.length === 0) return 'nothing stored yet';
  if (options && options.forceAchievementRecheck === true) return 'a recheck was requested';
  if (options && options.preserveExistingOnFailure === true) return 'the caches were just cleared';
  if (!entry.fingerprint) return 'stored without a fingerprint';
  const version = String(context.appVersion || '');
  if (!version) return 'the running version could not be read';
  if (entry.appVersion !== version) return `stored by version ${entry.appVersion || 'unknown'}`;
  const age = Number(context.now || Date.now()) - Number(entry.savedAt || 0);
  if (!Number.isFinite(age) || age < 0) return 'the stored library is dated in the future';
  if (age > REUSE_TTL_MS) return `the last scan is ${(age / 3600000).toFixed(1)}h old`;
  // A provisional entry is a game whose description never arrived - a network failure, not a fact
  // about the disk, so the next scan is normally its retry. But one game steam.js has positively
  // confirmed has no Steam data (provisionalDefinitive, from the negative cache) will not resolve
  // until that cache entry expires days from now: once it has sat provisional past the grace period
  // it stops forcing a full network rescan of the WHOLE library on every launch. Anything else
  // provisional (reason unknown, or just written) still blocks reuse so it gets retried promptly.
  const blockingProvisional = entry.games.some((game) => {
    if (!game || !game.provisional) return false;
    if (!game.provisionalDefinitive) return true;
    const age = Number(context.now || Date.now()) - Number(game.provisionalAt || 0);
    return !(Number.isFinite(age) && age >= PROVISIONAL_GRACE_MS);
  });
  if (blockingProvisional) return 'the last scan left entries undescribed';
  if (typeof context.inputsUnchanged !== 'function' || !context.inputsUnchanged(entry.fingerprint))
    return 'a game folder or unlock file changed';
  return '';
}

module.exports = { REUSE_TTL_MS, PROVISIONAL_GRACE_MS, refuseReason };
