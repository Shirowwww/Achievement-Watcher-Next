'use strict';

/*
  What every notify call is built from (Steam saves, the live watchers, Xbox PC, playtime): the
  options from options.ini, the rarity of an unlock, and the decorations a live unlock gets. Each
  path used to spell these by hand, and a field added to one (the language, the volume) missed the others.
*/

const { notificationVolumePercent } = require('../util/notificationVolume.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const rarityTiers = require(sharedAppModulePath('util/rarityTiers.js'));
const psnTrophyLink = require(sharedAppModulePath('parser/psnTrophyLinkRead.js'));
const { withSouvenir } = require('./withSouvenir.js');
const { withCompletionPopup } = require('../util/completionPopup.js');
const { withLibraryReport } = require('../util/libraryUnlockReport.js');

/*
  The second argument of notify. `sound: false` drops the toast's own sound (progress, playtime, a
  title whose platform already chimes) and `rumble: false` the pad; the volume always follows the
  setting, since the toast still plays a chosen sound file. `prefetch` defaults to the setting.
*/
function notifyOptions(options, { toastId, attribution, imageIntegration = '0', sound = true, rumble = true, prefetch } = {}) {
  const advanced = options.notification_advanced;
  return {
    notify: options.notification.notify,
    lang: options.achievement.lang,
    transport: {
      mode: options.notification_transport.mode,
      websocket: options.notification_transport.websocket,
    },
    toast: {
      appid: toastId,
      winrt: options.notification_transport.winRT,
      balloonFallback: options.notification_transport.balloon,
      customAudio: sound ? options.notification_toast.customToastAudio : '0',
      volume: notificationVolumePercent(options),
      imageIntegration,
      group: options.notification_toast.groupToast,
      attribution,
    },
    prefetch: prefetch !== undefined ? prefetch : advanced ? advanced.iconPrefetch : true,
    rumble: rumble ? options.notification.rumble : false,
  };
}

// The unlock rate rounded to a tenth as the achievement menu shows it, and the same rate as
// `rarityPercent` only at or under Settings > General > Rarity thresholds; null when unknown.
function unlockRarity(percent, options) {
  const value = percent === null || percent === undefined || percent === '' ? NaN : Number(percent);
  const rounded = Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
  const unlockRate = rounded !== null && rounded >= 0 && rounded <= 100 ? rounded : null;
  const rareMax = rarityTiers.normalizeRareBounds(options && options.achievement).rareMax;
  return { unlockRate, rarityPercent: unlockRate !== null && unlockRate <= rareMax ? unlockRate : null };
}

/*
  The notify a live unlock goes through (console and launcher watchers, Xbox PC): the open library
  is told first, the game's PlayStation trophy is attached, the souvenir settings are filled in and
  the 100% popup follows the unlock that completes the game.
*/
function createUnlockNotify(notify, { getOptions, report }) {
  const completionNotify = withCompletionPopup(withSouvenir(notify, getOptions), getOptions);
  return withLibraryReport((payload, opts) => completionNotify(psnTrophyLink.withLinkedTrophy(getOptions(), payload), opts), report);
}

module.exports = { notifyOptions, unlockRarity, createUnlockNotify };
