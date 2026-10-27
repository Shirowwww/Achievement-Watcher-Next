/*
  The designer's live page of an imported SAN theme loads this before engine.js and host.js. It
  stands in for notificationPreload.js: the designer, not the main process, hands host.js each
  payload, and hears when a card has played out (the popup would close its window then).
*/
(function () {
  'use strict';
  var listener = null;
  window.api = {
    onNotification: function (callback) {
      listener = callback;
    },
    closeNotificationWindow: function () {
      if (typeof window.awPreviewEnded === 'function') window.awPreviewEnded();
    },
    notificationRenderReady: function () {},
    // The card is in the page and not painted yet.
    notificationDrawn: function () {
      if (typeof window.awPreviewDrawn === 'function') window.awPreviewDrawn();
    },
  };
  // Resolves once the card is drawn and its pictures have loaded.
  window.awPreviewShow = function (data) {
    return listener ? Promise.resolve(listener(data)) : Promise.resolve();
  };
})();
