'use strict';

let modulePromise;
const load = () => modulePromise || (modulePromise = import('powertoast'));

// powertoast only understands `aumid`, but the old codebase used `appID` for years (silently
// falling back to the Microsoft Store identity). Every call site is fixed now; this normalizer
// guarantees a future `appID` slip can never silently break toasts again.
function normalizeToastOptions(options) {
  const normalized = { ...options };
  if (normalized.aumid == null && normalized.appID != null) {
    normalized.aumid = normalized.appID;
    delete normalized.appID;
  }
  return normalized;
}

// Off Windows there is no WinRT toast: the app shows a desktop notification (libnotify / D-Bus)
// for the Watchdog, which as a plain Node process has no Electron Notification of its own.
// The game a click should open comes from `uniqueID` ("<appid>" or "<appid>:<achievement>").
function desktopNotificationPayload(options) {
  const id = String(options.uniqueID || '');
  const split = id.indexOf(':');
  return {
    title: String(options.title || ''),
    body: String(options.message || ''),
    icon: typeof options.icon === 'string' ? options.icon : '',
    silent: options.silent === true,
    urgent: options.scenario === 'urgent',
    appid: split < 0 ? id : id.slice(0, split),
    achievement: split < 0 ? '' : id.slice(split + 1),
  };
}

async function toast(options, { send = process.send && process.send.bind(process), platform = process.platform } = {}) {
  if (platform !== 'win32') {
    if (typeof send !== 'function') throw new Error('no app to show the desktop notification');
    send({ desktopNotification: desktopNotificationPayload(normalizeToastOptions(options)) });
    return;
  }
  const { Toast } = await load();
  // powertoast reads `disableWinRT` from the show() options, not from the constructor options.
  // Splitting it here is what actually makes the "use PowerShell" fallback controllable; callers
  // that set `disableWinRT` on the payload were silently ignored before.
  const { disableWinRT, ...toastOptions } = normalizeToastOptions(options);
  return new Toast(toastOptions).show({ disableWinRT: !!disableWinRT });
}

toast.isWinRTAvailable = async () => process.platform === 'win32' && Boolean((await load()).isWinRTAvailable);

module.exports = toast;
module.exports.normalizeToastOptions = normalizeToastOptions;
module.exports.desktopNotificationPayload = desktopNotificationPayload;
