/*
  Runs inside a preset preview frame, on the website only.

  A preset page is written for the app: it waits for `window.api.onNotification` and paints whatever
  the Watchdog sends it. Nothing else in the page knows about the app, so giving the copy a stand-in
  api is enough to make the real popup - the same markup, the same stylesheet, the same animation
  timings - play in a browser.

  tools/site/build-assets.js injects this file into the copies under docs/assets/preset/. The
  presets themselves are never modified.
*/
(function () {
  'use strict';

  var listener = null;

  // On a page the popup is the illustration, so it stays. The engine reads this meta tag once, at
  // DOMContentLoaded, to work out how long the card holds before it animates itself away: raising
  // it here (before the engine's own listener, which is registered later) is what keeps the card on
  // screen instead of leaving an empty box a few seconds after every visitor arrives.
  var HOLD_MS = 3600000;

  // Stand-ins for what the app would hand a preset. Both are inline SVG, so a preview costs no
  // request and cannot depend on anything the app installs locally.
  var ICON =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#6c91ff"/><stop offset="1" stop-color="#2f4d9c"/>' +
        '</linearGradient></defs>' +
        '<rect width="64" height="64" rx="10" fill="url(#g)"/>' +
        '<path fill="#fff" d="M20 14h24v5c0 1.6 1.3 2 2.6 1.6l3.4-1v6.6c0 4.4-3.6 8-8 8h-.6A12 12 0 0 1 34 40v5h5.5c1.4 0 2.5 1.1 2.5 2.5V50H22v-2.5c0-1.4 1.1-2.5 2.5-2.5H30v-5a12 12 0 0 1-7.4-5.8H22c-4.4 0-8-3.6-8-8v-6.6l3.4 1C18.7 21 20 20.6 20 19v-5Zm-2 9.4v3.2c0 2 1.4 3.7 3.3 4a19 19 0 0 1-.3-3.4v-2.5l-3-1.3Zm28 0-3 1.3v2.5c0 1.2-.1 2.3-.3 3.4a4.1 4.1 0 0 0 3.3-4v-3.2Z"/>' +
        '</svg>'
    );

  var ARTWORK =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 430">' +
        '<defs>' +
        '<linearGradient id="s" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#122a52"/><stop offset="0.55" stop-color="#3b2a6b"/><stop offset="1" stop-color="#7a3b6a"/>' +
        '</linearGradient>' +
        '<radialGradient id="h" cx="0.72" cy="0.28" r="0.5">' +
        '<stop offset="0" stop-color="#ffd08a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd08a" stop-opacity="0"/>' +
        '</radialGradient>' +
        '</defs>' +
        '<rect width="920" height="430" fill="url(#s)"/>' +
        '<rect width="920" height="430" fill="url(#h)"/>' +
        '<path d="M0 330 L180 232 L330 300 L520 190 L700 268 L920 168 L920 430 L0 430 Z" fill="#0b1120" opacity="0.72"/>' +
        '<path d="M0 372 L210 300 L420 356 L640 288 L920 348 L920 430 L0 430 Z" fill="#070c16" opacity="0.9"/>' +
        '</svg>'
    );

  var STATES = {
    normal: {
      displayName: 'First Light',
      description: 'Reach the summit before dawn.',
      gameName: 'Achievement Watcher Next',
      rarityPercent: null,
    },
    rare: {
      displayName: 'No Witnesses',
      description: 'Finish the heist without an alarm.',
      gameName: 'Achievement Watcher Next',
      rarityPercent: 1.4,
    },
    platinum: {
      displayName: 'Completionist',
      description: 'Every achievement unlocked.',
      gameName: 'Achievement Watcher Next',
      notificationType: 'platinum',
      isPlatinum: true,
      rarityPercent: null,
    },
    progress: {
      displayName: 'Collector',
      description: 'Recover the scattered relics.',
      gameName: 'Achievement Watcher Next',
      notificationType: 'progress',
      rarityPercent: null,
      progress: { current: 34, max: 50, percent: 68 },
    },
  };

  function payloadFor(state) {
    var base = STATES[state] || STATES.normal;
    var payload = {};
    for (var key in base) if (Object.prototype.hasOwnProperty.call(base, key)) payload[key] = base[key];
    payload.iconPath = ICON;
    payload.imagePath = ARTWORK;
    payload.scale = 1;
    return payload;
  }

  function play(state) {
    if (listener) listener(payloadFor(state));
  }

  // The popup declares its own size; the page needs it to give the frame the right box.
  function onReady() {
    var duration = document.querySelector('meta[name="duration"]');
    if (duration) duration.setAttribute('content', String(HOLD_MS));

    var meta = document.querySelector('meta[width]');
    var width = Number((meta && meta.getAttribute('width')) || 0) || 474;
    var height = Number((meta && meta.getAttribute('height')) || 0) || 136;
    try {
      window.parent.postMessage({ type: 'aw-preset-size', width: width, height: height }, '*');
    } catch (err) {
      /* a preview that cannot report its size still renders at the default box */
    }
  }

  window.api = {
    onNotification: function (callback) {
      listener = callback;
      // The preset registers on DOMContentLoaded; play on the next tick so it is fully wired.
      window.setTimeout(function () {
        play('normal');
      }, 0);
    },
    // The app uses these to know when to show the window and when to close it. On a page the frame
    // is already visible and stays put, so both are deliberately inert.
    notificationRenderReady: function () {},
    closeNotificationWindow: function () {},
  };

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || data.type !== 'aw-preset-play') return;
    play(String(data.state || 'normal'));
  });

  window.addEventListener('DOMContentLoaded', onReady);
})();
