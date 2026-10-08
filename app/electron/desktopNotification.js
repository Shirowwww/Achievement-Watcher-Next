'use strict';

const fs = require('fs');
const { fileURLToPath } = require('url');

/*
  Desktop notifications for platforms without WinRT toasts: the Watchdog sends the toast it would
  have shown and the main process hands it to Electron's Notification, which goes through the
  freedesktop notification service on Linux. A click opens the game like a toast activation does.
*/

// Electron wants a local picture; anything else (a URL the Watchdog could not cache) shows no icon.
function localIcon(icon) {
  const value = String(icon || '');
  if (!value) return undefined;
  let file = value;
  if (value.startsWith('file://')) {
    try {
      file = fileURLToPath(value);
    } catch {
      return undefined;
    }
  }
  return fs.existsSync(file) ? file : undefined;
}

function createDesktopNotifier({ Notification, onClick = () => {}, log = () => {} }) {
  // Kept referenced until closed: a garbage-collected Notification loses its click handler.
  const live = new Set();
  return {
    show(payload) {
      if (!payload || !Notification || !Notification.isSupported()) {
        log('[notify] desktop notifications are not supported here');
        return false;
      }
      const notification = new Notification({
        title: String(payload.title || ''),
        body: String(payload.body || ''),
        icon: localIcon(payload.icon),
        silent: payload.silent === true,
        urgency: payload.urgent ? 'critical' : 'normal',
      });
      live.add(notification);
      const release = () => live.delete(notification);
      notification.on('close', release);
      notification.on('click', () => {
        release();
        onClick({ appid: String(payload.appid || ''), achievement: String(payload.achievement || '') });
      });
      notification.show();
      return true;
    },
  };
}

module.exports = { createDesktopNotifier, localIcon };
