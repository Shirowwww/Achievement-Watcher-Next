'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const { fileURLToPath } = require('url');

/*
  Desktop notifications for platforms without WinRT toasts: the Watchdog sends the toast it would
  have shown and the main process hands it to Electron's Notification, which goes through the
  freedesktop notification service on Linux. A click opens the game like a toast activation does.
*/

const SERVICE = 'org.freedesktop.Notifications';
// A desktop whose notification daemon starts after AW is asked again, at most this often.
const SERVICE_RECHECK_MS = 60 * 1000;
// A Windows toast is held at most this long, so one that never reports a close is still let go.
const TOAST_KEEP_MS = 10 * 60 * 1000;

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

function busCall(method, args, run) {
  const command = ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', `org.freedesktop.DBus.${method}`, ...args];
  return new Promise((resolve, reject) => {
    run('gdbus', command, { timeout: 5000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

/*
  libnotify waits out its whole D-Bus timeout (about 25 s) when no notification service answers,
  and it does so on the main process, which then stops handling the Watchdog. So the session bus is
  asked first, from a child process: a running daemon, or one that D-Bus actually starts on demand
  (a service file whose daemon cannot start is the common broken case). Without gdbus to ask, the
  answer is "yes", as it was before this check.
*/
async function busHasNotificationService(run = execFile) {
  try {
    if ((await busCall('NameHasOwner', [SERVICE], run)).includes('true')) return true;
    await busCall('StartServiceByName', [SERVICE, '0'], run);
    return true;
  } catch (err) {
    return err.code === 'ENOENT';
  }
}

function createDesktopNotifier({ Notification, onClick = () => {}, log = () => {}, platform = process.platform, hasService = busHasNotificationService, now = Date.now }) {
  // Kept referenced until closed: a garbage-collected Notification loses its click handler.
  const live = new Set();
  let known = platform !== 'linux';
  let checkedAt = null;
  let pending = null;

  function serviceUp() {
    if (known) return Promise.resolve(true);
    if (pending) return pending;
    if (checkedAt !== null && now() - checkedAt < SERVICE_RECHECK_MS) return Promise.resolve(false);
    pending = hasService().then((up) => {
      known = up;
      checkedAt = now();
      pending = null;
      if (!up) log(`[notify] no ${SERVICE} service on the session bus - system notifications are skipped, the overlay still shows`);
      return up;
    });
    return pending;
  }

  async function usable() {
    if (!Notification || !Notification.isSupported()) {
      log('[notify] desktop notifications are not supported here');
      return false;
    }
    return serviceUp();
  }

  function display(options, click) {
    const notification = new Notification(options);
    live.add(notification);
    const release = () => live.delete(notification);
    notification.on('close', release);
    notification.on('click', () => {
      release();
      click();
    });
    notification.show();
  }

  return {
    // A toast handed over by the Watchdog: clicking it opens its game.
    async show(payload) {
      if (!payload || !(await usable())) return false;
      const options = {
        title: String(payload.title || ''),
        body: String(payload.body || ''),
        icon: localIcon(payload.icon),
        silent: payload.silent === true,
        urgency: payload.urgent ? 'critical' : 'normal',
      };
      display(options, () => onClick({ appid: String(payload.appid || ''), achievement: String(payload.achievement || '') }));
      return true;
    },
    /*
      A Windows toast the Watchdog built (util/powertoast.js), posted under the app's own
      AppUserModelID. The XML carries everything: artwork, progress, scenario, and the protocol
      launch that opens the game, which Windows runs itself. Resolves whether Windows took it.
    */
    // `hideAfterMs` closes a toast that would otherwise stay on screen (a reminder over a game).
    async showToastXml(toastXml, { hideAfterMs = 0 } = {}) {
      if (!(await usable())) return { ok: false, reason: 'notifications are not supported here' };
      return new Promise((resolve) => {
        const notification = new Notification({ toastXml: String(toastXml || '') });
        live.add(notification);
        const release = () => live.delete(notification);
        // A toast Windows files straight into the notification centre may never report a close.
        const expiry = setTimeout(release, TOAST_KEEP_MS);
        if (typeof expiry.unref === 'function') expiry.unref();
        notification.on('close', release);
        notification.on('click', release);
        notification.on('show', () => {
          if (hideAfterMs > 0) setTimeout(() => notification.close(), hideAfterMs);
          resolve({ ok: true });
        });
        notification.on('failed', (_event, error) => {
          release();
          resolve({ ok: false, reason: String(error || 'failed') });
        });
        notification.show();
      });
    },
    // The app's own one-off messages; a click runs `click`.
    async notify(options, click = () => {}) {
      if (!(await usable())) return false;
      display(options, click);
      return true;
    },
  };
}

module.exports = { createDesktopNotifier, busHasNotificationService, localIcon };
