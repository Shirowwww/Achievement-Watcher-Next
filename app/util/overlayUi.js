'use strict';

// Shared helpers for the in-game achievement overlay (app/view/overlay.html).
// The file is loaded both as a CommonJS module (unit tests) and as a plain
// browser script (the overlay window is sandboxed, so it attaches to
// window.OverlayUi instead of using require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./intlFormat.js'), require('./rarityTiers.js'));
  } else {
    root.OverlayUi = factory(root.IntlFormat, root.RarityTiers);
  }
})(typeof self !== 'undefined' ? self : this, function (intlFormat, rarityTiers) {
  'use strict';

  const HIDDEN_FALLBACK = 'Hidden';
  const NA_FALLBACK = 'N/A';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });
  }

  // Achievement texts are either plain strings or {language: text} objects.
  // Missing/broken values fall back to the hidden label like the game view.
  function safeLocalizedText(input, lang, hiddenLabel) {
    const fallback = hiddenLabel || HIDDEN_FALLBACK;
    if (!input) return fallback;
    if (typeof input === 'string') return input.trim() || fallback;
    if (typeof input === 'object') {
      return (
        input[lang] ||
        input.english ||
        Object.values(input).find((v) => typeof v === 'string' && v.trim() !== '') ||
        fallback
      );
    }
    return fallback;
  }

  function toBcp47(lang) {
    return intlFormat.toBcp47(lang);
  }

  function formatTimestamp(timestamp, lang, naLabel) {
    return intlFormat.formatDateTime(timestamp, lang) || naLabel || NA_FALLBACK;
  }

  // Normalized progress for an achievement. Progress is only considered real
  // when the schema declares a counter (max above 1) AND the achievement is
  // unlocked or already carries a numeric current value.
  // A max of 1 is not a counter, it is the plain locked/unlocked state, and some
  // schemas set it on every row: shipped schemas exist that declare min_val and
  // max_val both at 1, so the emulator writes 1/1 for achievements that were
  // never earned. Rendering those as a full bar is what makes a whole game look
  // 100% complete on first launch. The list view and the toast already refuse a
  // max of 1 (getAchievementProgressState, normalizeProgress); this is the same
  // rule, so all three surfaces agree.
  function progressInfo(achievement) {
    const a = achievement || {};
    if (!Number.isFinite(Number(a.MaxProgress)) || Number(a.MaxProgress) <= 0) {
      return { hasProgress: false, current: 0, max: 0, percent: 0 };
    }
    const max = Number(a.MaxProgress);
    if (max <= 1) {
      return { hasProgress: false, current: 0, max, percent: 0 };
    }
    const raw = Number(a.CurProgress);
    const hasCurrent = Number.isFinite(raw);
    if (!hasCurrent && !a.Achieved) {
      return { hasProgress: false, current: 0, max, percent: 0 };
    }
    const current = a.Achieved ? max : Math.max(0, Math.min(max, hasCurrent ? raw : 0));
    return { hasProgress: true, current, max, percent: max > 0 ? Math.round((current / max) * 100) : 0 };
  }

  // Community rarity when the source provides it (Epic/GOG official schemas,
  // emulator sidecars). Null when unknown - the overlay simply hides it.
  function rarityPercent(achievement) {
    const a = achievement || {};
    const raw =
      a.rarityPercent ??
      a.globalPercent ??
      (a.rarity && typeof a.rarity === 'object' ? a.rarity.percent : a.rarity);
    if (raw === null || raw === undefined || raw === '') return null;
    const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.').trim());
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
  }

  // The cut-offs live in rarityTiers.js; without a mode this is the historic rare-only tiering.
  function rarityTier(percent, mode, thresholds) {
    return rarityTiers.tierFor(percent, mode, thresholds);
  }

  // `isPinned` keeps the pinned rows on top whatever the sort.
  function sortAchievements(list, sortState, getTitle, isPinned) {
    const titleOf = typeof getTitle === 'function' ? getTitle : (a) => String((a && a.displayName) || '');
    const pinnedOf = typeof isPinned === 'function' ? (a) => (isPinned(a) ? 1 : 0) : () => 0;
    return (list || []).slice().sort((a, b) => {
      const pinnedFirst = pinnedOf(b) - pinnedOf(a);
      if (pinnedFirst !== 0) return pinnedFirst;
      if (sortState && sortState.status) {
        const aStatus = a && a.Achieved ? 1 : 0;
        const bStatus = b && b.Achieved ? 1 : 0;
        if (aStatus !== bStatus) return (aStatus - bStatus) * sortState.status;
      }
      if (sortState && sortState.achievement) {
        const aTitle = titleOf(a).toLowerCase();
        const bTitle = titleOf(b).toLowerCase();
        if (aTitle < bTitle) return -1 * sortState.achievement;
        if (aTitle > bTitle) return 1 * sortState.achievement;
      }
      if (sortState && sortState.rarity) {
        // Missing rarity always sorts last regardless of direction - there is nothing to compare it
        // against, and burying unranked rows at the bottom beats scattering them through the list.
        const aRarity = rarityPercent(a);
        const bRarity = rarityPercent(b);
        if (aRarity === null && bRarity === null) return 0;
        if (aRarity === null) return 1;
        if (bRarity === null) return -1;
        if (aRarity !== bRarity) return (aRarity - bRarity) * sortState.rarity;
      }
      if (sortState && sortState.time) {
        const aTime = a && a.Achieved && Number.isFinite(Number(a.UnlockTime)) ? Number(a.UnlockTime) : null;
        const bTime = b && b.Achieved && Number.isFinite(Number(b.UnlockTime)) ? Number(b.UnlockTime) : null;
        if (aTime === null && bTime === null) return 0;
        if (aTime === null) return 1;
        if (bTime === null) return -1;
        if (aTime !== bTime) return (aTime - bTime) * sortState.time;
      }
      return 0;
    });
  }

  // Same rule as the achievement list in the main window: a hidden achievement that is still
  // locked keeps its description behind a click unless the user turned "show hidden" on.
  function isDescriptionMasked(achievement, showHidden) {
    const a = achievement || {};
    return a.hidden == 1 && !showHidden && !a.Achieved;
  }

  function buildStats(list) {
    const items = Array.isArray(list) ? list : [];
    const total = items.length;
    const unlocked = items.filter((a) => a && a.Achieved).length;
    const progress = items.filter((a) => a && !a.Achieved && progressInfo(a).hasProgress).length;
    return {
      total,
      unlocked,
      locked: total - unlocked,
      progress,
      percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
    };
  }

  // The custom accent picker: a code typed by hand, the hue slider and the shade pad all land on '#rrggbb'.
  function normalizeHex(value) {
    const text = String(value == null ? '' : value).trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(text)) return `#${text.split('').map((c) => c + c).join('')}`;
    return /^[0-9a-f]{6}$/.test(text) ? `#${text}` : null;
  }

  function hexToHsv(hex) {
    const code = normalizeHex(hex) || '#000000';
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(code.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    let h = 0;
    if (delta) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
    }
    return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
  }

  function hsvToHex({ h, s, v }) {
    const unit = (value) => Math.min(1, Math.max(0, Number(value) || 0));
    const hue = ((Number.isFinite(Number(h)) ? Number(h) : 0) % 360 + 360) % 360;
    const sat = unit(s);
    const val = unit(v);
    const channel = (n) => {
      const k = (n + hue / 60) % 6;
      return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return `#${[5, 3, 1].map((n) => Math.round(channel(n) * 255).toString(16).padStart(2, '0')).join('')}`;
  }

  const RECENT_ACCENTS = 3;

  // The last custom colours, newest first, without repeats or anything that is not a colour code.
  function rememberAccent(list, hex) {
    const kept = (Array.isArray(list) ? list : []).map(normalizeHex).filter(Boolean);
    const chosen = normalizeHex(hex);
    return [...new Set(chosen ? [chosen, ...kept] : kept)].slice(0, RECENT_ACCENTS);
  }

  return {
    normalizeHex,
    hexToHsv,
    hsvToHex,
    rememberAccent,
    escapeHtml,
    safeLocalizedText,
    toBcp47,
    formatTimestamp,
    progressInfo,
    rarityPercent,
    rarityTier,
    sortAchievements,
    isDescriptionMasked,
    buildStats,
  };
});
