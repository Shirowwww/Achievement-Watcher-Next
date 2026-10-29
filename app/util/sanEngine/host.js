/*
  The page side of an imported Steam Achievement Notifier theme: takes AW Next's notification payload,
  picks which of the theme's four SAN states paints it, and hands that to engine.js. Inlined into the
  preset's index.html by util/sanEngine/index.js, after engine.js.
*/
(function () {
  'use strict';
  var engine = window.AWSanEngine;
  var themeNode = document.getElementById('aw-san-theme');

  // Read for each card: the designer's live preview rewrites the block between two of them.
  function readTheme() {
    try {
      return JSON.parse((themeNode && themeNode.textContent) || '{}');
    } catch (e) {
      // The block is written and cleaned by util/sanEngine/index.js; a damaged one still draws SAN's
      // default card rather than leaving the popup blank until its safety timeout.
      return {};
    }
  }

  // AW Next's screen positions onto SAN's six corners, which decide where a card slides in from.
  var CORNERS = {
    'top-left': 'topleft',
    'center-top': 'topcenter',
    'top-right': 'topright',
    'middle-left': 'topleft',
    'middle-right': 'topright',
    'bottom-left': 'bottomleft',
    'center-bottom': 'bottomcenter',
    'bottom-right': 'bottomright',
  };

  // Drawn for a hidden achievement when the theme brings no picture of its own: SAN's padlock.
  var LOCK_ICON =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#FFFFFF"><path d="M0 0h24v24H0z" fill="none"/><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>'
    );

  // A Windows path becomes a file URL; a value that already has a scheme is left as it is.
  function fileUrl(value) {
    var p = String(value || '').replace(/\\/g, '/');
    if (!p) return '';
    return /^(?:file|data|https?|blob):/i.test(p) ? p : 'file:///' + p;
  }

  // Theme files are named relative to this page; a preview may map them to data URIs instead.
  function assetUrl(name) {
    if (!name) return '';
    var map = window.__awSanAssets;
    if (map && Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    return /^(?:data|blob|file|https?):/i.test(name) ? name : name.split('/').map(encodeURIComponent).join('/');
  }

  var loadedCss = {};
  var layoutLinks = {};
  var currentLayout = null;
  function layoutCss(id) {
    if (loadedCss[id]) return loadedCss[id];
    loadedCss[id] = new Promise(function (resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'layout-' + encodeURIComponent(id) + '.css';
      link.onload = link.onerror = function () {
        // Loaded after another layout's card was drawn: it waits for its own card.
        if (link.sheet && currentLayout !== null) link.sheet.disabled = currentLayout !== id;
        resolve();
      };
      layoutLinks[id] = link;
      document.head.appendChild(link);
    });
    return loadedCss[id];
  }

  // The designer's page draws cards of several layouts in turn, and their rules share selectors.
  // Switched through the CSSOM: a disabled <link> drops its sheet and only gets it back later.
  function useLayoutCss(id) {
    currentLayout = id;
    Object.keys(layoutLinks).forEach(function (other) {
      var sheet = layoutLinks[other].sheet;
      if (sheet) sheet.disabled = other !== id;
    });
  }

  // Clears a previous card (the designer preview shows several in a row) without touching the page.
  function reset() {
    var keep = { TEMPLATE: true, SCRIPT: true };
    Array.prototype.slice.call(document.body.children).forEach(function (node) {
      if (!keep[node.tagName]) node.remove();
    });
    Array.prototype.slice.call(document.body.attributes).forEach(function (attr) {
      document.body.removeAttribute(attr.name);
    });
    var font = document.getElementById('aw-san-font');
    if (font) font.remove();
    document.documentElement.removeAttribute('style');
  }

  // Written as the designer's own cards write it.
  function rarityText(percent) {
    if (percent == null || percent === '' || !isFinite(Number(percent))) return '';
    return Math.round(Number(percent) * 10) / 10 + '%';
  }

  // AW Next's tier as the classes the designer's items are shown or hidden by.
  function stateClasses(data) {
    if (data.isPlatinum || data.rarityTier === 'platinum') return ['state-platinum'];
    return ['bronze', 'silver', 'gold'].indexOf(data.rarityTier) !== -1 ? ['state-rare', 'tier-' + data.rarityTier] : [];
  }

  /*
    The items added in the designer, put into the drawn card. The state's scale zooms the whole page,
    so the layer takes it back: an item keeps the size it was given over the card as shown.
    `bare` asks for the card alone (the designer draws the items itself, over a picture of it).
  */
  function drawCanvas(data) {
    var template = document.getElementById('aw-san-canvas');
    var card = document.getElementById('outerwrapper');
    if (!template || !card || data.bare === true) return;
    card.classList.add.apply(card.classList, ['ach'].concat(stateClasses(data)));
    var layer = template.content.firstElementChild.cloneNode(true);
    var zoom = parseFloat(document.body.style.zoom) || 1;
    if (zoom !== 1) layer.style.zoom = String(1 / zoom);
    var words = {
      game: String(data.gameName || ''),
      title: String(data.displayName || ''),
      detail: String(data.description || ''),
      rarity: rarityText(data.rarityPercent),
    };
    var spans = layer.querySelectorAll('[data-tok]');
    for (var i = 0; i < spans.length; i++) {
      var key = spans[i].getAttribute('data-tok');
      if (Object.prototype.hasOwnProperty.call(words, key)) spans[i].textContent = words[key];
    }
    card.insertBefore(layer, card.firstChild);
    card.classList.add('active');
  }

  var closeTimer = null;
  function close() {
    clearTimeout(closeTimer);
    if (window.api && window.api.closeNotificationWindow) window.api.closeNotificationWindow();
  }

  // Only the latest card may close the page: a card replaced mid-fade still answers its own timers.
  var shownCount = 0;

  function show(data) {
    data = data || {};
    var shown = ++shownCount;
    var closeThis = function () {
      if (shown === shownCount) close();
    };
    var theme = readTheme();
    // AW Next's own tier decides the state, so the rarity settings apply to this preset too.
    var unlock = engine.unlockOf(data);
    var rate = unlock.percent;
    var picked = engine.customisationFor(theme, unlock);
    var type = picked.type;
    var customisation = picked.customisation;
    var tier = engine.pictureTier(Object.assign({ thresholds: theme.thresholds, fixed: theme.tierPictures }, unlock));
    var layout = engine.layoutOf(customisation.preset);
    var template = document.getElementById('aw-san-layout-' + layout);
    var strings = data.fallback || {};
    return layoutCss(layout).then(function () {
      // A newer card was asked for while this layout loaded: that one is drawn instead.
      if (shown !== shownCount) return;
      useLayoutCss(layout);
      reset();
      var result = engine.render({
        layoutHtml: template ? template.innerHTML : '',
        customisation: customisation,
        info: {
          type: type,
          title: data.displayName,
          desc: data.description,
          icon: fileUrl(data.iconPath || data.icon),
          gameIcon: fileUrl(data.gameIconPath),
          gameLogo: fileUrl(data.gameIconPath),
          gameArt: fileUrl(data.imagePath || data.headerPath),
          gameName: data.gameName,
          percent: rate,
          hidden: data.hidden === true,
          realPlatinum: data.realPlatinum === true,
        },
        thresholds: theme.thresholds,
        tier: tier,
        showpercent: theme.showpercent,
        notify1line: theme.notify1line === true,
        pos: CORNERS[data.position] || customisation.pos || 'bottomcenter',
        strings: {
          unlocked: strings.achievementUnlocked || 'Achievement unlocked',
          congrats: strings.congratulations || 'Congratulations!',
          gameComplete: strings.gameComplete || '100% Complete',
          gameCompleteDesc: strings.gameCompleteDesc || "You've unlocked all achievements!",
          gameTitle: strings.gameTitle || 'Game Title',
        },
        url: assetUrl,
        lockIcon: LOCK_ICON,
        onEnd: closeThis,
      });
      drawCanvas(data);
      // The designer's live page stops the card here, before it is painted.
      if (window.api && window.api.notificationDrawn) window.api.notificationDrawn();
      // The page closes itself after the card has played; this is only the net under it.
      clearTimeout(closeTimer);
      closeTimer = setTimeout(closeThis, (Number(customisation.displaytime) || 10) * 1000 + 4000);
      return engine.whenImagesSettle(result.images, 3000).then(function () {
        if (window.api && window.api.notificationRenderReady) window.api.notificationRenderReady();
      });
    });
  }

  if (window.api && window.api.onNotification) window.api.onNotification(show);
})();
