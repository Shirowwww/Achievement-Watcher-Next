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

// How long the app gets to say whether Windows took the toast; past it the toast counts as failed.
const APP_TOAST_TIMEOUT_MS = 10000;

let appToastSequence = 0;
const appToastWaits = new Map();

/*
  powertoast shows a toast through PowerShell, since its WinRT addons are not shipped: seconds per
  toast, and an unsigned process starting PowerShell is what antivirus engines block (#128). The app
  posts toasts under its own AppUserModelID, so for that id the Watchdog builds the same XML and the
  main process shows it with Electron's Notification. Any other id (a user override, the Xbox
  fallback) cannot be posted from the app and keeps the PowerShell path.
*/
function canAppShowToast(options, { send, connected, appAumid }) {
  return typeof send === 'function' && connected === true && Boolean(appAumid) && options.aumid === appAumid;
}

// A reminder stays on screen until dismissed, and only the app can hide it on time. Shown any other
// way it becomes an ordinary toast again.
function withoutReminder(options) {
  if (options.scenario !== 'reminder') return options;
  const plain = { ...options };
  delete plain.scenario;
  delete plain.button;
  return plain;
}

function showThroughApp(xml, send, timeoutMs, hideAfterMs = 0) {
  appToastSequence += 1;
  const id = `${process.pid}-${appToastSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      appToastWaits.delete(id);
      reject(new Error('the app did not report whether Windows showed the toast'));
    }, timeoutMs);
    appToastWaits.set(id, (result) => {
      clearTimeout(timer);
      appToastWaits.delete(id);
      if (result.ok === true) resolve();
      else reject(new Error(`Windows did not show the toast: ${result.reason || 'no reason given'}`));
    });
    try {
      send({ windowsToast: hideAfterMs > 0 ? { id, xml, hideAfterMs } : { id, xml } });
    } catch (err) {
      reportAppToast({ id, ok: false, reason: err.message || String(err) });
    }
  });
}

// The app's answer to a `windowsToast` request; an id nobody waits for any more is dropped.
function reportAppToast(result) {
  const settle = result && appToastWaits.get(String(result.id));
  if (settle) settle(result);
}

async function toast(
  options,
  {
    send = process.send && process.send.bind(process),
    platform = process.platform,
    connected = process.connected,
    appAumid = process.env.AW_AUMID,
    timeoutMs = APP_TOAST_TIMEOUT_MS,
  } = {}
) {
  if (platform !== 'win32') {
    if (typeof send !== 'function') throw new Error('no app to show the desktop notification');
    send({ desktopNotification: desktopNotificationPayload(normalizeToastOptions(options)) });
    return;
  }
  // powertoast reads `disableWinRT` from the show() options, not from the constructor options.
  // Splitting it here is what actually makes the "use PowerShell" fallback controllable; callers
  // that set `disableWinRT` on the payload were silently ignored before.
  const { disableWinRT, hideAfterMs, ...toastOptions } = normalizeToastOptions(options);
  const { Toast, toXmlString } = await load();
  if (canAppShowToast(toastOptions, { send, connected, appAumid })) {
    return showThroughApp(toXmlString(toastOptions), send, timeoutMs, Number(hideAfterMs) || 0);
  }
  return new Toast(withoutReminder(toastOptions)).show({ disableWinRT: !!disableWinRT });
}

toast.isWinRTAvailable = async () => process.platform === 'win32' && Boolean((await load()).isWinRTAvailable);

module.exports = toast;
module.exports.normalizeToastOptions = normalizeToastOptions;
module.exports.desktopNotificationPayload = desktopNotificationPayload;
module.exports.canAppShowToast = canAppShowToast;
module.exports.reportAppToast = reportAppToast;
module.exports.withoutReminder = withoutReminder;
