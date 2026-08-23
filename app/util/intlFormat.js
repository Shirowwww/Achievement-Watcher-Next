'use strict';

/*
  Locale-aware dates, relative times and numbers, built on the platform's Intl. Formats that are
  pure ICU data (a date, "3 days ago", a grouped count, a percentage) don't need a 28-locale
  translation - Intl already knows the separators, plural rules and calendar for every bundled
  language. Only the sentence around a value belongs in app/locale/lang.

  Like overlayUi.js this loads both as CommonJS (app, tests) and as a plain browser script (the
  sandboxed overlay window cannot require), so it also attaches to window.IntlFormat.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IntlFormat = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /*
    App locale id -> BCP-47 tag. The same pairs live in app/locale/steam.json as `iso`, which this
    file cannot read from the overlay sandbox; test/core/intlFormat.test.js asserts the two agree
    for every bundled locale, so adding a language is still a single source of truth in practice.
  */
  const BCP47 = {
    english: 'en-US',
    french: 'fr-FR',
    german: 'de-DE',
    spanish: 'es-ES',
    latam: 'es-419',
    italian: 'it-IT',
    portuguese: 'pt-PT',
    brazilian: 'pt-BR',
    czech: 'cs-CZ',
    slovak: 'sk-SK',
    hungarian: 'hu-HU',
    polish: 'pl-PL',
    russian: 'ru-RU',
    ukrainian: 'uk-UA',
    turkish: 'tr-TR',
    thai: 'th-TH',
    japanese: 'ja-JP',
    schinese: 'zh-CN',
    koreana: 'ko-KR',
    tchinese: 'zh-TW',
    dutch: 'nl-NL',
    swedish: 'sv-SE',
    danish: 'da-DK',
    norwegian: 'nb-NO',
    finnish: 'fi-FI',
    greek: 'el-GR',
    indonesian: 'id-ID',
    vietnamese: 'vi-VN',
  };

  const DEFAULT_LOCALE = 'en-US';

  // Unknown ids keep the platform default rather than silently becoming English: a user on a
  // locale AW Next does not bundle still gets their own date and number conventions.
  function toBcp47(lang) {
    const raw = String(lang || '').trim();
    if (BCP47[raw.toLowerCase()]) return BCP47[raw.toLowerCase()];
    // Already a tag (a language the app does not bundle, read from the system): pass it through
    // as written, since Intl is the one that decides whether it can serve it.
    if (/^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(raw)) return raw;
    return undefined;
  }

  // Intl constructors throw on a tag the runtime cannot parse; never let a label take the UI down.
  function build(Ctor, lang, options) {
    try {
      return new Ctor(toBcp47(lang), options);
    } catch {
      try {
        return new Ctor(DEFAULT_LOCALE, options);
      } catch {
        return null;
      }
    }
  }

  function formatNumber(value, lang, options) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const formatter = build(Intl.NumberFormat, lang, options);
    return formatter ? formatter.format(number) : String(number);
  }

  /*
    A ratio already expressed in percent (42.5 -> "42.5%"), not a 0-1 fraction: every caller in the
    app carries completion as a percentage already, and rounding it here would lose the one decimal
    the rarity badge shows.
  */
  function formatPercent(value, lang, { maximumFractionDigits = 0, minimumFractionDigits = 0 } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const formatter = build(Intl.NumberFormat, lang, {
      style: 'percent',
      maximumFractionDigits,
      minimumFractionDigits,
    });
    return formatter ? formatter.format(number / 100) : `${number}%`;
  }

  function toDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    // Unix seconds from the parsers, milliseconds from Date.now() stamps.
    const date = new Date(number < 1e12 ? number * 1000 : number);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, lang, options = { dateStyle: 'medium' }) {
    const date = toDate(value);
    if (!date) return '';
    const formatter = build(Intl.DateTimeFormat, lang, options);
    return formatter ? formatter.format(date) : date.toDateString();
  }

  function formatDateTime(value, lang, options = { dateStyle: 'medium', timeStyle: 'short' }) {
    return formatDate(value, lang, options);
  }

  const RELATIVE_UNITS = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['week', 604800000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000],
  ];

  /*
    "3 days ago" / "in 2 hours" from a millisecond delta, picking the largest unit that has at least
    one whole step. Anything under a minute is reported as seconds so the value never renders empty.
  */
  function formatRelativeTime(value, lang, { now = Date.now(), numeric = 'auto' } = {}) {
    const date = toDate(value);
    if (!date) return '';
    const deltaMs = date.getTime() - now;
    const formatter = build(Intl.RelativeTimeFormat, lang, { numeric });
    if (!formatter) return '';
    const magnitude = Math.abs(deltaMs);
    for (const [unit, ms] of RELATIVE_UNITS) {
      if (magnitude >= ms || unit === 'second') {
        // Truncate towards zero: 47 hours is "yesterday", never "2 days ago".
        return formatter.format(Math.trunc(deltaMs / ms), unit);
      }
    }
    return '';
  }

  /*
    A played-time duration in the reader's language. Intl covers every bundled locale, unlike the
    duration library this replaced: humanize-duration didn't know Simplified Chinese or Brazilian
    Portuguese, and its `fallbacks` option turned that into silent English. Returns null when the
    runtime has no Intl.DurationFormat, so the caller can keep its old path.
  */
  function splitDuration(totalSeconds, units) {
    const SECONDS = { days: 86400, hours: 3600, minutes: 60, seconds: 1 };
    let left = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const parts = {};
    for (const unit of units) {
      const size = SECONDS[unit];
      if (!size) continue;
      parts[unit] = Math.floor(left / size);
      left -= parts[unit] * size;
    }
    return parts;
  }

  function formatDuration(totalSeconds, lang, { units = ['hours', 'minutes'], style = 'long' } = {}) {
    if (typeof Intl.DurationFormat !== 'function') return null;
    const seconds = Number(totalSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const parts = splitDuration(seconds, units);
    // Drop leading zero units so a 40-minute session is "40 minutes", not "0 hours, 40 minutes".
    const trimmed = {};
    let started = false;
    for (const unit of units) {
      if (!started && !parts[unit]) continue;
      started = true;
      trimmed[unit] = parts[unit];
    }
    const shown = started ? trimmed : { [units[units.length - 1]]: parts[units[units.length - 1]] || 0 };
    const formatter = build(Intl.DurationFormat, lang, { style });
    return formatter ? formatter.format(shown) : null;
  }

  // "a, b and c" in the reader's language, for the source and folder lists.
  function formatList(values, lang, options = { style: 'long', type: 'conjunction' }) {
    const items = (Array.isArray(values) ? values : []).map((value) => String(value)).filter(Boolean);
    if (items.length === 0) return '';
    const formatter = typeof Intl.ListFormat === 'function' ? build(Intl.ListFormat, lang, options) : null;
    return formatter ? formatter.format(items) : items.join(', ');
  }

  return {
    BCP47,
    toBcp47,
    formatNumber,
    formatPercent,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    formatDuration,
    formatList,
  };
});
