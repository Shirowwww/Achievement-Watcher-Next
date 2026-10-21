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
  const RARE_DEFAULTS = Object.freeze({ rareGoldMax: 5, rareSilverMax: 10, rareMax: 15 });
  const RARE_LIMITS = Object.freeze({ goldMin: 1, goldMax: 20, silverMin: 2, silverMax: 30, rareMin: 3, rareMax: 50 });
  const RARE_MAX = Object.freeze({ gold: RARE_DEFAULTS.rareGoldMax, silver: RARE_DEFAULTS.rareSilverMax, bronze: RARE_DEFAULTS.rareMax });

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

  // The rare bounds travel as a triple, like the trophy pair: one bad or crossed value resets all three.
  function normalizeRareBounds(input) {
    const source = input || {};
    const gold = Number(source.rareGoldMax);
    const silver = Number(source.rareSilverMax);
    const rare = Number(source.rareMax);
    const L = RARE_LIMITS;
    const valid =
      [gold, silver, rare].every(Number.isFinite) &&
      gold >= L.goldMin && gold <= L.goldMax && silver >= L.silverMin && silver <= L.silverMax &&
      rare >= L.rareMin && rare <= L.rareMax && gold < silver && silver < rare;
    return valid ? { rareGoldMax: gold, rareSilverMax: silver, rareMax: rare } : { ...RARE_DEFAULTS };
  }

  // Each mode's config keys, lowest bound first, with the limits normalize* enforce on them.
  const BOUND_KEYS = Object.freeze({
    rare: [
      ['rareGoldMax', RARE_LIMITS.goldMin, RARE_LIMITS.goldMax],
      ['rareSilverMax', RARE_LIMITS.silverMin, RARE_LIMITS.silverMax],
      ['rareMax', RARE_LIMITS.rareMin, RARE_LIMITS.rareMax],
    ],
    trophy: [
      ['trophyGoldBelow', TROPHY_LIMITS.goldMin, TROPHY_LIMITS.goldMax],
      ['trophySilverBelow', TROPHY_LIMITS.silverMin, TROPHY_LIMITS.silverMax],
    ],
  });

  /*
    The bounds after one of them moved: the moved one keeps its value as far as the others leave
    room for it, and the others are pushed to stay strictly in order, one percent apart at least.
    Everything stays inside its limits, so the result always survives normalize*.
  */
  function pushBounds(mode, values, changed) {
    const keys = BOUND_KEYS[normalizeMode(mode)];
    const at = Math.max(0, keys.findIndex(([key]) => key === changed));
    const out = {};
    keys.forEach(([key, min]) => {
      out[key] = Math.round(Number(values && values[key]));
      if (!Number.isFinite(out[key])) out[key] = min;
    });
    const lowest = Math.max(...keys.slice(0, at + 1).map(([, min], i) => min + (at - i)));
    const highest = Math.min(...keys.slice(at).map(([, , max], i) => max - i));
    out[keys[at][0]] = Math.min(Math.max(out[keys[at][0]], lowest), highest);
    for (let i = at + 1; i < keys.length; i++) out[keys[i][0]] = Math.min(Math.max(out[keys[i][0]], out[keys[i - 1][0]] + 1), keys[i][2]);
    for (let i = at - 1; i >= 0; i--) out[keys[i][0]] = Math.max(Math.min(out[keys[i][0]], out[keys[i + 1][0]] - 1), keys[i][1]);
    return out;
  }

  // Both modes' bounds from an [achievement] config section, in the shape tierFor takes.
  function gradingFrom(cfg) {
    const source = cfg || {};
    return {
      mode: normalizeMode(source.rarityMode),
      thresholds: {
        ...normalizeThresholds({ goldBelow: source.trophyGoldBelow, silverBelow: source.trophySilverBelow }),
        ...normalizeRareBounds(source),
      },
    };
  }

  function toPercent(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = Number(value);
    return Number.isFinite(raw) ? raw : null;
  }

  function rareTier(percent, bounds) {
    const raw = toPercent(percent);
    if (raw === null) return null;
    const p = Math.round(raw * 10) / 10;
    const { rareGoldMax, rareSilverMax, rareMax } = normalizeRareBounds(bounds);
    if (p < 0 || p > rareMax) return null;
    if (p <= rareGoldMax) return 'gold';
    if (p <= rareSilverMax) return 'silver';
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
    return normalizeMode(mode) === MODE_TROPHY ? trophyTier(percent, thresholds) : rareTier(percent, thresholds);
  }

  // A PlayStation trophy's own grade, from its letter (P/G/S/B) or its name; '' for anything else.
  const TROPHY_GRADES = Object.freeze({ p: 'platinum', g: 'gold', s: 'silver', b: 'bronze' });
  function trophyGrade(value) {
    const key = String(value || '').trim().toLowerCase();
    if (TROPHY_GRADES[key]) return TROPHY_GRADES[key];
    return Object.values(TROPHY_GRADES).includes(key) ? key : '';
  }

  // PlayStation's own four rarity names, by the share of players who earned the trophy.
  const PSN_RARITY_BELOW = Object.freeze([
    ['ultraRare', 5],
    ['veryRare', 10],
    ['rare', 20],
  ]);
  function psnRarity(percent) {
    const raw = toPercent(percent);
    if (raw === null || raw < 0) return '';
    const band = PSN_RARITY_BELOW.find(([, below]) => raw < below);
    return band ? band[0] : 'common';
  }

  /*
    The fields a notification preset reads: the tier class to paint and the platinum flag. A trophy
    carries its colour itself, so its grade wins over any tier worked out from an unlock rate.
  */
  function notificationTier({ percent, type, mode, thresholds, grade } = {}) {
    const kind = String(type || '').toLowerCase();
    if (kind === 'platinum') return 'platinum';
    if (kind === 'progress' || kind === 'playtime') return '';
    return trophyGrade(grade) || tierFor(percent, mode, thresholds) || '';
  }

  return {
    MODE_RARE,
    MODE_TROPHY,
    MODES,
    RARE_MAX,
    RARE_DEFAULTS,
    RARE_LIMITS,
    TROPHY_DEFAULTS,
    TROPHY_LIMITS,
    normalizeMode,
    normalizeThresholds,
    normalizeRareBounds,
    BOUND_KEYS,
    pushBounds,
    gradingFrom,
    tierFor,
    trophyGrade,
    psnRarity,
    notificationTier,
  };
});
