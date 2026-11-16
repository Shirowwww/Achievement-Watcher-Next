'use strict';

/*
  A goal of exactly 100 that the description does not state as a count is a game counting in
  percent (#168), shown "37%". A real count of 100 shown so is still exact. CommonJS, and a plain
  script in the sandboxed overlay window.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CounterUnit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PERCENT_GOAL = 100;
  // Digit runs with their thousands separators ("10,000", "1 000"), and whether a percent sign follows.
  const NUMBER = /(\d(?:[\d.,   ]*\d)?)\s*(%|％)?/g;

  function descriptionStatesCount(description) {
    const text = String(description == null ? '' : description);
    for (const match of text.matchAll(NUMBER)) {
      if (match[2]) continue; // "100%" is a percentage, not a count
      if (Number(match[1].replace(/[^\d]/g, '')) === PERCENT_GOAL) return true;
    }
    return false;
  }

  function isPercentCounter(max, description) {
    return Number(max) === PERCENT_GOAL && !descriptionStatesCount(description);
  }

  // "37%" or "37 / 100", with the language's own number format when `formatNumber`/`formatPercent` are given.
  function counterLabel(current, max, description, { formatNumber = String, formatPercent = (n) => `${n}%`, separator = ' / ' } = {}) {
    if (isPercentCounter(max, description)) return formatPercent(Math.floor(Number(current) || 0));
    return `${formatNumber(current)}${separator}${formatNumber(max)}`;
  }

  return { isPercentCounter, counterLabel };
});
