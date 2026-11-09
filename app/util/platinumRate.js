'use strict';

/*
  The platinum's share of players, taken from the same rates as the game's other trophies: just under
  the rarest base-game one, since nobody earns the platinum without it. Sony's and Exophase's rates
  count other players than Steam's, so next to Steam figures they read higher than the rarest trophy.
*/

const OFFSETS = [0.1, 0.2, 0.3];
// Below this the offset would swallow the rate, so the rarest is halved instead.
const MIN_RATE = 0.1;

// The same offset for a game on every view, so the figure does not change between visits.
function offsetFor(seed) {
  let sum = 0;
  for (const char of String(seed)) sum += char.codePointAt(0);
  return OFFSETS[sum % OFFSETS.length];
}

/**
 * @param {Iterable<[string, unknown]>} rates achievement name -> percent
 * @param {{ isDlc?: (name: string) => boolean, seed?: string|number }} [options]
 * @returns {number|null} the platinum rate, two decimals, or null when no base-game trophy has a rate
 */
function derivedPlatinumRate(rates, { isDlc = () => false, seed = '' } = {}) {
  let rarest = Infinity;
  for (const [name, raw] of rates || []) {
    if (raw === null || raw === undefined || raw === '' || isDlc(String(name))) continue;
    const percent = Number(raw);
    if (Number.isFinite(percent) && percent >= 0 && percent < rarest) rarest = percent;
  }
  if (!Number.isFinite(rarest)) return null;
  // Rounded first: 0.3 - 0.2 is 0.0999... in floating point and would miss the floor.
  const lowered = Math.round((rarest - offsetFor(seed)) * 100) / 100;
  const rate = lowered >= MIN_RATE ? lowered : rarest / 2;
  return Math.round(Math.min(rate, 100) * 100) / 100;
}

module.exports = { derivedPlatinumRate };
