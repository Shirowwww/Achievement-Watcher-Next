'use strict';

const os = require('os');
const toast = require('../../util/powertoast');
const soundPlayer = require('../../util/soundPlayer.js');
const { mediaPlayerVolume } = require('../../util/notificationVolume.js');
const notifyStrings = require('../../util/notifyStrings.js');

const TOAST_QUEUE_SOUND_DELAY_MS = 5000;

// Windows 11 build 22546 introduced the urgent scenario; Windows 10 does not know it.
const URGENT_MIN_BUILD = 22546;
// How long a reminder stays when the registry cannot say how long Windows keeps a toast.
const DEFAULT_TOAST_SECONDS = 5;

function urgentScenarioSupported(platform = process.platform, release = os.release()) {
  if (platform !== 'win32') return true;
  const build = Number(String(release).split('.')[2]);
  return Number.isFinite(build) && build >= URGENT_MIN_BUILD;
}

// Stored once because every toast uses the same urgency setting.
let urgentUnlocks = false;
let urgentSupported = urgentScenarioSupported();
function setUrgentUnlocks(enabled) {
  urgentUnlocks = enabled === true;
}

// Urgent applies only to unlocks and is opt-in.
function isUrgent(message) {
  return urgentUnlocks && urgentSupported && message.notificationType !== 'playtime' && message.notificationType !== 'progress';
}

/*
  A fullscreen game makes Windows hold ordinary toasts back. Urgent and reminder toasts are still
  drawn over a game running with fullscreen optimizations, without taking its focus. A reminder
  needs a button and stays until dismissed, so the app hides it after the usual toast time.
*/
function scenarioFor(message, breakthrough) {
  if (isUrgent(message)) return 'urgent';
  return breakthrough ? 'reminder' : undefined;
}

function normalizeProgress(progress) {
  if (!progress) return null;
  const max = Number(progress.max);
  if (!Number.isFinite(max) || max <= 1) return null;
  const currentRaw = Number(progress.current);
  const current = Math.max(0, Math.min(max, Number.isFinite(currentRaw) ? currentRaw : 0));
  return {
    current,
    max,
    percent: Math.max(0, Math.min(100, Math.floor((current / max) * 100))),
  };
}

// Keep float counters readable without changing integers.
function formatProgressValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(Math.round(n * 100) / 100);
}

// Use encoded path segments because powertoast inserts the URI into toast XML.
function buildActivation(message) {
  const scheme = String(process.env.AW_TOAST_PROTOCOL || '').trim();
  if (!scheme || message.appid == null || message.appid === '') return null;
  const segments = [encodeURIComponent(String(message.appid))];
  if (message.achievementName) segments.push(encodeURIComponent(String(message.achievementName)));
  return { launch: `${scheme}://game/${segments.join('/')}`, type: 'protocol' };
}

function buildToastNotification(message, options) {
  const strings = notifyStrings.forLang(
    String((options && (options.lang || (options.toast && options.toast.lang))) || 'english')
  );
  const type = String((message && message.notificationType) || '').toLowerCase();

  let title = message.achievementDisplayName;
  let body = message.achievementDescription;
  if (type === 'platinum') {
    title = strings.platinumTitle || title;
    body = [message.gameDisplayName, message.achievementDescription].filter(Boolean).join('\n');
  } else if (type === 'achievement' || type === '') {
    title = strings.achievementUnlocked || title;
    body = [message.achievementDisplayName, message.achievementDescription].filter(Boolean).join('\n');
  }

  // A configured file is played by soundPlayer; otherwise Windows supplies the sound.
  const soundFile = (options && options.toast && options.toast.soundFile) || '';
  const hasCustomSound = !!soundFile;
  let notification = {
    // powertoast calls this field `aumid`.
    aumid: options.toast.appid,
    // powertoast expects Unix seconds here.
    time: message.time,
    title,
    message: body,
    // Playtime prefers the high-res library art since Steam's clienticon (message.icon) is 32x32
    // and blurs when scaled; other toasts keep the achievement icon, falling back to the game logo.
    icon: type === 'playtime' ? message.gameIcon || message.icon : message.icon || message.gameIcon,
    // Silence the native toast when soundPlayer handles audio or the user muted it.
    silent: Boolean(hasCustomSound || options.toast.customAudio === '0'),
    audio: hasCustomSound ? null : options.toast.customAudio === '2' ? 'ms-winsoundevent:Notification.Achievement' : null,
    // Keep achievement artwork square.
    cropIcon: false,
  };

  notification.uniqueID = message.achievementName ? `${message.appid}:${message.achievementName}` : `${message.appid}`;

  const scenario = scenarioFor(message, options.toast.breakthrough === true);
  if (scenario) notification.scenario = scenario;
  if (scenario === 'reminder') {
    // Windows labels the system dismiss button in the user's language.
    notification.button = [{ text: '', activation: { type: 'system', launch: 'dismiss' } }];
    notification.hideAfterMs = Math.round((Number(options.toast.durationSeconds) || DEFAULT_TOAST_SECONDS) * 1000);
  }

  // Protocol activation lets the main process open the selected game.
  const activation = buildActivation(message);
  if (activation) notification.activation = activation;

  if (options.toast.attribution) notification.attribution = options.toast.attribution;

  // Playtime always uses the game header as its hero image.
  const imageIntegration = type === 'playtime' ? '1' : options.toast.imageIntegration;
  if (imageIntegration != '0' && message.image) {
    if (imageIntegration == '1') {
      notification.heroImg = message.image;
    } else if (options.toast.imageIntegration == '2') {
      notification.inlineImg = message.image;
    }
  }

  // powertoast requires non-empty string ids and titles for grouping.
  if (options.toast.group) {
    const groupId = String(message.appid ?? '').trim();
    const groupTitle = String(message.gameDisplayName ?? '').trim();
    if (groupId && groupTitle) notification.group = { id: groupId, title: groupTitle };
  }

  if (options.toast.winrt === false) notification.disableWinRT = true;

  const progress = normalizeProgress(message.progress);
  if (progress) {
    notification.progress = {
      value: progress.percent,
      status: `${formatProgressValue(progress.current)}/${formatProgressValue(progress.max)}`,
    };
  }

  return { notification, soundFile };
}

module.exports = async (message, options) => {
  const { notification, soundFile } = buildToastNotification(message, options);
  await toast(notification);

  if (soundFile) {
    const queueDelay = Math.max(0, Number(message.delay) || 0) * TOAST_QUEUE_SOUND_DELAY_MS;
    // Toast sounds play at 100% at most.
    const volume = mediaPlayerVolume(options.toast.volume);
    soundPlayer.play(soundFile, { delayMs: queueDelay, volume }).catch((e) => {
      const debug = require('../../util/log.js');
      debug.log(`Error playing toast sound:  ${e}`);
    });
  }
};

module.exports.buildToastNotification = buildToastNotification;
module.exports.buildActivation = buildActivation;
module.exports.setUrgentUnlocks = setUrgentUnlocks;
module.exports.isUrgent = isUrgent;
module.exports.urgentScenarioSupported = urgentScenarioSupported;
// Tests pin the Windows build, which on a CI runner predates the urgent scenario.
module.exports._setUrgentSupported = (supported) => {
  urgentSupported = supported === true;
};
