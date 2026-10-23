/*
  The page side of an imported Steam Achievement Notifier theme: takes AW Next's notification payload,
  picks which of the theme's four SAN states paints it, and hands that to engine.js. Inlined into the
  preset's index.html by util/sanEngine/index.js, after engine.js.
*/
(function () {
  'use strict';
  var engine = window.AWSanEngine;
  var themeNode = document.getElementById('aw-san-theme');
  var theme = {};
  try {
    theme = JSON.parse((themeNode && themeNode.textContent) || '{}');
  } catch (e) {
    // The block is written and cleaned by util/sanEngine/index.js; a damaged one still draws SAN's
    // default card rather than leaving the popup blank until its safety timeout.
  }
  var types = theme.types || {};

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
  function layoutCss(id) {
    if (loadedCss[id]) return loadedCss[id];
    loadedCss[id] = new Promise(function (resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'layout-' + id + '.css';
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
    return loadedCss[id];
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

  var closeTimer = null;
  function close() {
    clearTimeout(closeTimer);
    if (window.api && window.api.closeNotificationWindow) window.api.closeNotificationWindow();
  }

  function show(data) {
    data = data || {};
    var rate = data.unlockRate != null ? data.unlockRate : data.rarityPercent;
    // AW Next's own tier decides the state, so the rarity settings apply to this preset too.
    var type = engine.stateOf({ tier: data.rarityTier, mode: data.rarityMode, platinum: data.isPlatinum, percent: rate, thresholds: theme.thresholds });
    var customisation = types[type] || types.main || {};
    var layout = engine.layoutOf(customisation.preset);
    var template = document.getElementById('aw-san-layout-' + layout);
    var strings = data.fallback || {};
    return layoutCss(layout).then(function () {
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
        onEnd: close,
      });
      // The page closes itself after the card has played; this is only the net under it.
      clearTimeout(closeTimer);
      closeTimer = setTimeout(close, (Number(customisation.displaytime) || 10) * 1000 + 4000);
      return engine.whenImagesSettle(result.images, 3000).then(function () {
        if (window.api && window.api.notificationRenderReady) window.api.notificationRenderReady();
      });
    });
  }

  if (window.api && window.api.onNotification) window.api.onNotification(show);
})();
