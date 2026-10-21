'use strict';

function indexAchievementRows($) {
  const rowsByName = new Map();
  $('#achievement li .achievement[data-name]').each(function () {
    const name = this.getAttribute('data-name');
    const rows = rowsByName.get(name);
    if (rows) rows.push(this);
    else rowsByName.set(name, [this]);
  });
  return rowsByName;
}

// The rare halo under an achievement icon is two infinite CSS rotations Blink cannot composite,
// so every rare row repaints on the main thread every frame, even off-screen - pausing those is
// worth ~40% of main-thread budget. content-visibility/IntersectionObserver cost a per-frame test
// that itself drops frames, so nothing is measured while scrolling; the set recomputes once it settles.
const GLOW_MARGIN_PX = 400;
const GLOW_SETTLE_MS = 150;
let glowLive = [];
let glowSettleTimer = null;

function refreshRareGlow() {
  const scroller = document.getElementById('achievement');
  if (!scroller) return;
  scroller.classList.remove('glow-all');

  const view = scroller.getBoundingClientRect();
  const top = view.top - GLOW_MARGIN_PX;
  const bottom = view.bottom + GLOW_MARGIN_PX;
  const next = [];
  for (const box of scroller.querySelectorAll('.achievement.rare .box')) {
    const rect = box.getBoundingClientRect();
    // A row hidden by the search filter or a collapsed section has a zero-height rect: it paints
    // nothing, so it never needs its halo running.
    if (rect.height > 0 && rect.bottom >= top && rect.top <= bottom) next.push(box);
  }
  for (const box of glowLive) if (!next.includes(box)) box.classList.remove('glow-live');
  for (const box of next) box.classList.add('glow-live');
  glowLive = next;
}

// Anything that moves rows or changes which ones exist (rarity arriving, a sort, the search filter,
// a section folding) goes through here rather than recomputing inline: it coalesces with the scroll
// settle, so a burst of changes costs one pass.
function scheduleRareGlowRefresh(delay = GLOW_SETTLE_MS) {
  clearTimeout(glowSettleTimer);
  glowSettleTimer = setTimeout(refreshRareGlow, delay);
}
window.scheduleRareGlowRefresh = scheduleRareGlowRefresh;

/*
  The percent formatter, resolved once and allowed to be absent. Rarity is an enrichment: if this
  module cannot load, the figure still shows as a plain number. Folding it into the rarityTier
  lookup below would make a resolution failure silently turn off the whole rarity column instead.
*/
let rarityPercentFormat = null;

function formatRarityPercent(percent, lang) {
  if (rarityPercentFormat === null) {
    try {
      const remote = require('@electron/remote');
      const path = require('path');
      rarityPercentFormat = require(path.join(remote.app.getAppPath(), 'util/intlFormat.js'));
    } catch {
      rarityPercentFormat = false;
    }
  }
  if (!rarityPercentFormat) return String(percent);
  return rarityPercentFormat.formatPercent(percent, lang, { maximumFractionDigits: 1 }) || String(percent);
}

/*
  A PlayStation trophy is graded by the game itself, so its rate never regrades it: the figure reads
  like the console's ("Platinum · 7.1% · Very rare") and only gold and platinum keep the halo. A game
  from another store keeps its own rate, so Sony's rarity words would not describe it: grade and rate only.
*/
function paintPlayStationTrophy(elem, figure, grade, percent, text, tiers) {
  const grades = typeof window.trophyLabels === 'function' ? window.trophyLabels() : {};
  const bands = typeof window.psnRarityLabels === 'function' ? window.psnRarityLabels() : {};
  const onConsole = $('#achievement .wrapper > .header').attr('data-system') === 'playstation';
  figure.text([grades[grade] || grade, text, onConsole ? bands[tiers.psnRarity(percent)] : ''].filter(Boolean).join(' · '));
  elem.addClass('ps-trophy').attr('data-trophy', grade);
  if (grade === 'platinum' || grade === 'gold') elem.addClass('rare rarity-gold');
}

// Paint the global unlock % (rarity) onto the rendered achievement rows. `entries` is the normalized
// [{name, percent}] shape produced by util/rarity.js, identical for Steam/Epic/GOG.
function applyRarity(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  let tiers = null;
  try {
    const remote = require('@electron/remote');
    const path = require('path');
    tiers = require(path.join(remote.app.getAppPath(), 'util/rarityTiers.js'));
  } catch {
    return; // rarity is a non-essential enrichment
  }
  const grading = typeof window.rarityGrading === 'function' ? window.rarityGrading() : { mode: 'rare' };
  const graded = grading.mode === 'trophy';
  const grades = typeof window.trophyLabels === 'function' ? window.trophyLabels() : {};
  const rowsByName = indexAchievementRows($);
  const lang = String((window.app && window.app.config && window.app.config.achievement && window.app.config.achievement.lang) || 'english');
  for (const { name, percent: raw } of entries) {
    let percent = Math.round(raw * 10) / 10;
    if (percent > 100) percent = 100;

    const elem = $(rowsByName.get(String(name)) || []);
    // Shown with the language's own decimal separator and percent placement; sorting reads the raw
    // number from the attribute, because parseFloat cannot read "84,5".
    const figure = elem.find('.stats .community span.data');
    const text = formatRarityPercent(percent, lang);
    figure.attr('data-percent', percent).text(text);
    elem.removeClass('rare trophy-grade ps-trophy rarity-gold rarity-silver rarity-bronze').removeAttr('data-trophy');
    figure.removeAttr('data-grade');

    const native = tiers.trophyGrade(elem.find('[data-type]').first().attr('data-type'));
    if (native) {
      paintPlayStationTrophy(elem, figure, native, percent, text, tiers);
      continue;
    }
    const tier = tiers.tierFor(percent, grading.mode, grading.thresholds);
    if (!tier) continue;
    if (!graded || tier === 'gold') elem.addClass('rare');
    elem.addClass('rarity-' + tier);
    if (graded) {
      elem.addClass('trophy-grade');
      figure.attr('data-grade', grades[tier] || tier);
    }
  }
  $('.achievement-list > .header .sort-ach .sort.percentage').addClass('show');
  // Rarity arrives asynchronously; reapply a persisted percentage sort now that its values are real.
  if (typeof window.restoreAchievementSorts === 'function') window.restoreAchievementSorts();
  // `.rare` was just handed out (or taken back), so this is where the halo set first exists at all.
  scheduleRareGlowRefresh(0);
}

// Bumped on every game shown, so a late answer for the previous game cannot touch this one.
let rarityRequest = 0;

// Once the lookup is over, a row nobody has a rate for says nothing rather than "--".
function hideUnknownRarity() {
  $('#achievement .achievement-list ul > li .stats .community').each((_, row) => {
    if (!$(row).find('span.data').attr('data-percent')) $(row).hide();
  });
}

function getGlobalStat(appid, source, gameName, achievements, context) {
  const request = ++rarityRequest;
  const settle = () => {
    if (request === rarityRequest) hideUnknownRarity();
  };
  let rarity;
  try {
    const path = require('path');
    const remote = require('@electron/remote');
    rarity = require(path.join(remote.app.getAppPath(), 'util/rarity.js'));
  } catch (err) {
    settle();
    return; // rarity is a non-essential enrichment - never let it break the game view
  }

  // 1. Instant paint from the on-disk sidecar so a repeat/offline view shows tiers immediately
  //    instead of waiting on (or losing) the network round-trip.
  try {
    applyRarity(rarity.readRarityCacheEntries(appid));
  } catch (err) {
    /* no cache yet - the refresh below will populate it */
  }

  // 2. Background refresh: hits the network only when the cache is stale (TTL-gated inside the util),
  //    persists the result, and repaints. Failures fall back to whatever the cache already showed.
  const pending =
    source === 'steam-bridge' && context && context.steamAppId
      ? rarity.getSteamBridgeRarity(appid, context.steamAppId, context.names || achievements.map((a) => a && a.name), {})
      : rarity.getRarityEntries(appid, source, {
          gameName,
          gameNames: context && context.gameNames,
          achievements,
          npCommId: context && context.npCommId,
          // The main process holds the PlayStation token; it answers "not connected" when there is none.
          officialTrophyRates: (list) => require('electron').ipcRenderer.invoke('psn:trophy-rates', list),
        });
  pending
    .then((entries) => {
      if (request !== rarityRequest) return;
      applyRarity(entries);
      // The profile's trophy counts rank unlocks by these same rates.
      if (typeof window.forgetTrophyRates === 'function') window.forgetTrophyRates(appid);
    })
    .catch(() => {})
    .finally(settle);
}

(function ($, window, document) {
  $(function () {
    // Remember the tile of the game being viewed so the mouse "Forward" button can reopen it.
    // Opening a game also resets the achievement search box (fresh view, no stale filter).
    $('#game-list').on('click', '.game-box', function () {
      window.__awMouseNavGameBox = this;
      $('#achievement-search-input').val('');
      $('#achievement .achievement-list ul > li').removeClass('search-hidden');
    });

    // While the list is moving every rare halo runs, as it did before this budget existed; the
    // on-screen set is worked out once it has come to rest. Passive: this must never be able to
    // hold up the scroll it is watching.
    const achievementScroller = document.getElementById('achievement');
    if (achievementScroller) {
      achievementScroller.addEventListener(
        'scroll',
        function () {
          this.classList.add('glow-all');
          scheduleRareGlowRefresh();
        },
        { passive: true }
      );
    }
    // A taller window shows rows that were out of the picked set, and nothing else would notice.
    window.addEventListener('resize', () => scheduleRareGlowRefresh(), { passive: true });

    // Filter the unlocked/locked achievement rows by title or (visible) description. Hidden-masked
    // descriptions are matched on their displayed label only, so spoilers don't leak through search.
    $('#achievement-search-input').on('input', function () {
      const { stripTags } = require('../util/stripTags.js');
      const filter = stripTags(String($(this).val() || ''))
        .trim()
        .toUpperCase();
      $('#achievement .achievement-list ul > li').each(function () {
        const elem = $(this);
        const title = elem.find('.achievement .content .title').text().toUpperCase();
        const desc = elem.find('.achievement .content .description').text().toUpperCase();
        elem.toggleClass('search-hidden', filter !== '' && !title.includes(filter) && !desc.includes(filter));
      });
      scheduleRareGlowRefresh();
    });

    // Mouse side-button navigation (app-wide): Back (4) closes Settings first - it overlays
    // everything - then the game detail view; Forward (5) reopens the game closed with Back.
    $(document).mouseup(function (e) {
      if ($('#onboarding').is(':visible')) return;
      if (e.which === 4) {
        if ($('#settings').is(':visible')) {
          $('#btn-settings-cancel').trigger('click');
        } else if ($('#achievement').is(':visible')) {
          $('#btn-previous').trigger('click');
        }
      } else if (e.which === 5) {
        const box = window.__awMouseNavGameBox;
        if (!$('#achievement').is(':visible') && !$('#settings').is(':visible') && box && document.contains(box)) {
          $(box).trigger('click');
        }
      }
    });

    // Right-click an achievement row to mark it as manually unlocked (or clear the override).
    $('#achievement .achievement-list').on('contextmenu', '.achievement', function (event) {
      const row = $(this);
      const name = row.data('name');
      const appid = $('#achievement .wrapper > .header').attr('data-appid');
      const source = $('#achievement .wrapper > .header').attr('data-source') || '';
      if (!name || !appid) return;

      const achieved = row.data('achieved') === 1;
      const manual = row.data('manual') === 1;
      const remote = require('@electron/remote');
      const items = [];
      if (manual) {
        items.push({
          label: $('#game-list').attr('data-ctx-clearmanualunlock') || '',
          click: () => window.app?.manualUnlockAction?.(appid, source, name, 'clear-manual'),
        });
      } else if (!achieved) {
        items.push({
          label: $('#game-list').attr('data-ctx-manualunlock') || '',
          click: () => window.app?.manualUnlockAction?.(appid, source, name, 'mark-unlocked'),
        });
      }
      if (items.length === 0) return;
      event.preventDefault();
      remote.Menu.buildFromTemplate(items).popup({ window: remote.getCurrentWindow() });
    });

    $('#btn-previous').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      if (app.args.name) app.args.name = null;

      // Mark the detail view as closed straight away, before the fade-out and delay below.
      // An artwork fetch still in flight for this game checks this attribute before painting body,
      // so clearing it here is what stops a late reply from putting the game's background behind
      // the library. Everything else that reads it means "the game currently on screen" too.
      $('#achievement .wrapper > .header').removeAttr('data-appid').removeAttr('data-source');

      // Leaving sinks the page and fades the game's picture with it (app.css), so the library comes
      // back without the backdrop snapping away or an empty frame between the two views.
      $('body').addClass('is-leaving-game');
      $('#achievement')
        .addClass('is-leaving')
        .fadeOut(200, function () {
          $(this).removeClass('is-leaving').scrollTop(0);
          $('body').removeAttr('style').removeClass('is-leaving-game');
          $('.achievement-list > .header .sort-ach .sort').removeClass('show active');
          $('#home').addClass('is-returning');
          $('#home').fadeIn(240, function () {
            $(this).removeClass('is-returning');
            self.css('pointer-events', 'initial');
          });
        });
    });

    /*
      Reset this game's achievements, from the game's own page. The appid comes from the header
      attribute rather than from a captured variable: it is the same value every other late-arriving
      handler in this view checks, so the button can never act on the game that was open before.
    */
    $('#btn-reset-achievements').click(async function () {
      const appid = $('#achievement .wrapper > .header').attr('data-appid');
      if (!appid) return;
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        await app.resetAchievementsAction(appid);
      } finally {
        self.css('pointer-events', 'initial');
      }
    });

    $('#btn-scrollup').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      $('#achievement').animate({ scrollTop: 0 }, 500, 'swing', function () {
        self.css('pointer-events', 'initial');
      });
    });

    $('#achievement .achievement-list .header .toggle').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      let list = self.parent().next('ul');
      let elem = self.closest('.achievement-list');
      let speed = 400;

      if (elem.hasClass('active')) {
        list.slideUp(speed);
        elem.removeClass('active');
      } else {
        list.slideDown(speed);
        elem.addClass('active');
      }
      self.attr('aria-expanded', String(elem.hasClass('active')));
      setTimeout(() => {
        self.css('pointer-events', 'initial');
        // Folding a section moves everything below it, so re-pick the halos once it has settled.
        scheduleRareGlowRefresh(0);
      }, speed);
    });
  });
})(window.jQuery, window, document);
