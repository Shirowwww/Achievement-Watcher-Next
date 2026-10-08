'use strict';

// The one definition of the rarity tiers. Loaded as a CommonJS module and, by the overlay window
// (sandboxed, no require), as a plain script that attaches to window.RarityTiers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RarityTiers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODE_RARE = 'rare';
  const MODE_TROPHY = 'trophy';
  const MODES = Object.freeze([MODE_RARE, MODE_TROPHY]);

  // Rare mode: only the rarest achievements get a tier, up to this unlock rate (inclusive).
  const RARE_MAX = Object.freeze({ gold: 5, silver: 10, bronze: 15 });

  // Trophy mode: every achievement is graded; a rate strictly below the bound earns the grade.
  const TROPHY_DEFAULTS = Object.freeze({ goldBelow: 20, silverBelow: 50 });
  const TROPHY_LIMITS = Object.freeze({ goldMin: 1, goldMax: 40, silverMin: 10, silverMax: 90 });

  function normalizeMode(value) {
    return String(value || '').toLowerCase() === MODE_TROPHY ? MODE_TROPHY : MODE_RARE;
  }

  // Anything out of range, non numeric or out of order falls back to the defaults as a pair, so a
  // half-valid pair can never produce a silver band that sits below the gold one.
  function normalizeThresholds(input) {
    const source = input || {};
    const gold = Number(source.goldBelow);
    const silver = Number(source.silverBelow);
    const L = TROPHY_LIMITS;
    const valid =
      Number.isFinite(gold) && Number.isFinite(silver) &&
      gold >= L.goldMin && gold <= L.goldMax && silver >= L.silverMin && silver <= L.silverMax && gold < silver;
    return valid ? { goldBelow: gold, silverBelow: silver } : { ...TROPHY_DEFAULTS };
  }

  function toPercent(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = Number(value);
    return Number.isFinite(raw) ? raw : null;
  }

  function rareTier(percent) {
    const raw = toPercent(percent);
    if (raw === null) return null;
    const p = Math.round(raw * 10) / 10;
    if (p < 0 || p > RARE_MAX.bronze) return null;
    if (p <= RARE_MAX.gold) return 'gold';
    if (p <= RARE_MAX.silver) return 'silver';
    return 'bronze';
  }

  function trophyTier(percent, thresholds) {
    const raw = toPercent(percent);
    if (raw === null || raw < 0) return 'bronze';
    const { goldBelow, silverBelow } = normalizeThresholds(thresholds);
    if (raw < goldBelow) return 'gold';
    if (raw < silverBelow) return 'silver';
    return 'bronze';
  }

  // 'gold' | 'silver' | 'bronze', or null when the rare mode gives the achievement no tier.
  function tierFor(percent, mode, thresholds) {
    return normalizeMode(mode) === MODE_TROPHY ? trophyTier(percent, thresholds) : rareTier(percent);
  }

  // The fields a notification preset reads: the tier class to paint and the platinum flag.
  function notificationTier({ percent, type, mode, thresholds } = {}) {
    const kind = String(type || '').toLowerCase();
    if (kind === 'platinum') return 'platinum';
    if (kind === 'progress' || kind === 'playtime') return '';
    return tierFor(percent, mode, thresholds) || '';
  }

  return {
    MODE_RARE,
    MODE_TROPHY,
    MODES,
    RARE_MAX,
    TROPHY_DEFAULTS,
    TROPHY_LIMITS,
    normalizeMode,
    normalizeThresholds,
    tierFor,
    notificationTier,
  };
});
