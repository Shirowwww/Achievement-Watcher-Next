'use strict';

/*
  Two places resolve "several appids claim the same executable": the game index (which binary name a
  game answers to) and the executable list (which install a launch button points at). Both group by
  the path, score each claimant's title against the file name, and keep the best - and the rule that
  decides a tie only ever landed in one of them, so the other could still hand the claim to a
  placeholder row. One helper, one rule.

  A synthetic "local-..." row is what an earlier scan wrote for a folder it could not identify. Once
  the same install has a real AppID the two carry the same title, so similarity alone is a tie, which
  the placeholder used to win by being first.
*/
function isPlaceholderClaim(appid, source) {
  return /^local-/i.test(String(appid || '')) || String(source || '').toLowerCase() === 'unconfigured';
}

// The entry that keeps the claim. `nameOf` answers the game title known for an entry.
function pickBestClaim(entries, base, nameOf, nameSimilarity) {
  let best = entries[0];
  let bestScore = -Infinity;
  for (const entry of entries) {
    const title = nameOf(entry) || '';
    const score = nameSimilarity(title, base) + (isPlaceholderClaim(entry.appid, entry.source) ? -1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

module.exports = { isPlaceholderClaim, pickBestClaim };
