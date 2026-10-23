'use strict';

/*
  The 100% popup for the games a live watcher follows (Xenia, recompiled ports, GOG, Ubisoft...),
  the same one a save-file game gets. A watcher tells how far the game is with
  `completion: { unlocked, total }` on each unlock; the unlock that brings it to 100% is followed by
  the platinum popup, the real PlayStation one when the game is tied to its list.
*/

const notifyStrings = require('./notifyStrings.js');
const psnTrophyLink = require('./psnTrophyLink.js');

const isComplete = (completion) =>
  Boolean(completion) && Number(completion.total) > 0 && Number(completion.unlocked) >= Number(completion.total);

// A list whose own achievement is the platinum already popped it with that unlock.
const hasPlatinumTwin = (link) => Boolean(link) && Object.values(link.trophies).some((trophy) => trophy && trophy.type === 'P');

function platinumPopup(options, unlock) {
  if (!unlock || unlock.notificationType === 'platinum' || !isComplete(unlock.completion)) return null;
  if (options && options.notification && options.notification.platinum === false) return null;
  const link = psnTrophyLink.readLink(unlock.appid);
  if (hasPlatinumTwin(link)) return null;
  const real = psnTrophyLink.linkedPlatinum(link);
  const strings = notifyStrings.forLang(options && options.achievement && options.achievement.lang);
  return {
    source: unlock.source,
    appid: unlock.appid,
    notificationType: 'platinum',
    realPlatinum: Boolean(real),
    gameDisplayName: unlock.gameDisplayName,
    achievementDisplayName: real ? real.name : unlock.gameDisplayName,
    achievementDescription: real ? real.description : strings.platinumDesc,
    icon: (real && real.icon) || unlock.icon,
    gameIcon: unlock.gameIcon,
    image: unlock.image,
    time: unlock.time,
  };
}

// Wraps a watcher's notify: the unlock goes out first, then the platinum popup once per game and session.
function withCompletionPopup(notify, getOptions) {
  const completed = new Set();
  return async (payload, opts) => {
    const { completion, ...unlock } = payload || {};
    const result = await notify(unlock, opts);
    const options = getOptions();
    const popup = platinumPopup(options, { ...unlock, completion });
    const key = `${unlock.source}:${unlock.appid}`;
    if (!popup || completed.has(key)) return result;
    completed.add(key);
    const title = notifyStrings.forLang(options && options.achievement && options.achievement.lang).platinumTitle;
    const toast = opts && opts.toast ? { ...opts.toast, attribution: `${unlock.gameDisplayName} · ${title}` } : undefined;
    await notify(popup, { ...opts, ...(toast ? { toast } : {}) });
    return result;
  };
}

module.exports = { platinumPopup, withCompletionPopup };
