'use strict';

/*
  Pure matching rules behind the Settings search box (driven by app/ui/settings.js), kept DOM-free
  on purpose. The panel is translated positionally - locale/loader.js binds labels with
  `li:nth-child(n)` - so the filter must hide rows, never move or remove them; the selectors are as
  much the contract as the matching. Both live here so test/ui/settingsSearch.test.js can run
  against the real app.html without a browser.
*/

/*
  Rows a search can hide. Only the OUTERMOST match inside a tab counts as a row: a folder entry's
  edit/unlink buttons and a guide panel's bullets are also `<li>`s, nested inside their own row/
  panel - filtering them independently would strip a visible row of its controls.
*/
const ROW_SELECTOR = 'li, .emulator-login, .emulator-hero, .help-panel';

// Blocks that should disappear once every row inside them is filtered out, so a filtered tab shows
// matching sections instead of a column of empty headers.
const BLOCK_SELECTOR = 'ul, .arrow-list, .emulator-group, .settings-card, #epic-connect';

// Blocks searched as a whole when they hold no row (the Epic, Xbox, RetroAchievements... cards):
// before, nothing could ever hide them, so every query kept them on screen.
const ROWLESS_CARD_SELECTOR = '.settings-card';

// Rows and tabs the interface mode (util/interfaceMode.js) is hiding. Duplicated as a literal to
// keep this module dependency-free; interfaceMode.HIDDEN_CLASS is the definition, and
// test/ui/interfaceMode.test.js pins the two together.
const MODE_HIDDEN_CLASS = 'mode-hidden';

// Accents are dropped so "masques" finds "masqués" and the other way round.
function normalize(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Words this long also match without their plural or feminine ending: "masques" finds the
// "Masquer" choice of a Show / Hide row, "themes" finds "Theme".
const STEM_MIN_LENGTH = 5;
function stem(term) {
  return term.length >= STEM_MIN_LENGTH ? term.replace(/(es|s|e)$/, '') : term;
}

// Split a query into words. Matching is per-word and order-independent, so "hide zero" and
// "zero hide" both find "Hide 0% games" - that is how a half-remembered setting is actually typed.
function parseTerms(query) {
  return normalize(query).split(' ').filter(Boolean);
}

// A row matches when every term appears somewhere in its searchable text.
function matches(haystack, terms) {
  const text = normalize(haystack);
  return terms.every((term) => text.includes(term) || text.includes(stem(term)));
}

/*
  Everything a row can be found by: its visible text plus the option ids it contains. The ids
  matter because they're the only stable, language-independent handle on a setting - searching
  "hideZero" works in a Japanese UI too.
*/
function buildHaystack({ text = '', ids = [], placeholders = [] } = {}) {
  return normalize([text, ...ids.map((id) => String(id).replace(/^option_/, '')), ...placeholders].join(' '));
}

// The heading of the card a row sits in. A card found by its title shows all its rows: "hidden"
// must keep the hidden-games list, whose rows are game names, not the word itself.
function cardTitleOf($, row) {
  return $(row).closest('.arrow-list, .settings-card').children('.title, .emulator-login-heading').first().text() || '';
}

// What a row is called on screen: its label, or the heading of a standalone card.
function labelOf($, row) {
  const el = $(row);
  return el.children('.left').text() || el.find('.title').first().text() || '';
}

// Searchable text of one row, read through jQuery.
function haystackFor($, row) {
  const el = $(row);
  return buildHaystack({
    text: `${el.text() || ''} ${cardTitleOf($, row)}`,
    ids: el
      .find('[id]')
      .map(function () {
        return this.id;
      })
      .get(),
    placeholders: el
      .find('input[placeholder]')
      .map(function () {
        return $(this).attr('placeholder');
      })
      .get(),
  });
}

/*
  Hide every non-matching settings row and collapse empty blocks. Rows are hidden with a class, never
  moved - positional i18n breaks if the DOM order changes. Returns { total, perView }.
*/
// The rows of one tab: matches of ROW_SELECTOR with no other match between them and the tab.
function rowsIn($, section) {
  return section.find(ROW_SELECTOR).filter(function () {
    return $(this).parentsUntil(section).filter(ROW_SELECTOR).length === 0;
  });
}

/*
  How many rows match but are folded away by the interface mode (a row of its own, or one inside a
  folded section or tab). Simple mode cannot show them, so the panel uses this number to say they
  exist and offer Advanced instead of answering "nothing found".
*/
function countModeHiddenMatches($, query, scope = '#settings') {
  const terms = parseTerms(query);
  if (terms.length === 0) return 0;
  let count = 0;
  $(`${scope} .box section.content[data-view]`).each(function () {
    rowsIn($, $(this)).each(function () {
      if ($(this).closest(`.${MODE_HIDDEN_CLASS}`).length && matches(haystackFor($, this), terms)) count++;
    });
  });
  return count;
}

// What app.css hides on this system (the other system's settings), so it is never a hit.
function offPlatformSelector($) {
  const platform = $('html').attr('data-platform');
  return [platform !== 'win32' && '[data-windows-only]', platform !== 'linux' && '[data-linux-only]'].filter(Boolean).join(', ');
}

function filterSections($, query, scope = '#settings') {
  const terms = parseTerms(query);
  const perView = {};
  // Hits in a row's own label, per tab: a tab that names the setting beats one whose help text
  // merely mentions it ("GreenLuma" belongs in Sources, not in a Notification hint).
  const labelPerView = {};
  const offPlatform = offPlatformSelector($);
  let total = 0;

  $(`${scope} .box section.content[data-view]`).each(function () {
    const section = $(this);
    // Simple mode hides whole tabs and individual rows with MODE_HIDDEN_CLASS. Searching must not
    // count them, and must never clear their class - the search owns `search-hidden` and nothing
    // else. A hidden tab reports zero hits so its nav counter stays empty.
    const modeHidden = section.hasClass(MODE_HIDDEN_CLASS);
    const rows = modeHidden
      ? $()
      : rowsIn($, section)
          .not(`.${MODE_HIDDEN_CLASS}, [hidden]`)
          .filter(function () {
            return $(this).closest(offPlatform).length === 0;
          });
    let hits = 0;
    let labelHits = 0;

    rows.each(function () {
      const row = $(this);
      if (terms.length === 0 || matches(haystackFor($, this), terms)) {
        row.removeClass('search-hidden');
        hits++;
        if (terms.length > 0 && matches(labelOf($, this), terms)) labelHits++;
      } else {
        row.addClass('search-hidden');
      }
    });

    section.find(BLOCK_SELECTOR).each(function () {
      const block = $(this);
      // Only the rows this block actually owns decide whether it still has anything to show.
      const owned = rows.filter(function () {
        return this !== block[0] && block[0].contains(this);
      });
      if (owned.length === 0 && block.is(ROWLESS_CARD_SELECTOR) && !block.closest(`.${MODE_HIDDEN_CLASS}`).length) {
        // An account card has buttons, not rows: the card itself is the thing searched. One the page
        // keeps closed (the theme editor) is never a hit.
        const found = this.style.display !== 'none' && (terms.length === 0 || matches(haystackFor($, this), terms));
        block.toggleClass('search-hidden', terms.length > 0 && !found);
        if (found && terms.length > 0 && block.closest(offPlatform).length === 0) hits++;
        return;
      }
      block.toggleClass('search-hidden', terms.length > 0 && owned.length > 0 && owned.not('.search-hidden').length === 0);
    });

    perView[section.attr('data-view')] = hits;
    labelPerView[section.attr('data-view')] = labelHits;
    total += hits;
  });

  return { total, perView, labelPerView };
}

module.exports = {
  ROW_SELECTOR,
  BLOCK_SELECTOR,
  MODE_HIDDEN_CLASS,
  normalize,
  stem,
  parseTerms,
  matches,
  buildHaystack,
  cardTitleOf,
  labelOf,
  haystackFor,
  rowsIn,
  countModeHiddenMatches,
  offPlatformSelector,
  filterSections,
};
