'use strict';

/*
  The platinum for the games a live watcher follows (Xenia, recompiled ports, GOG, Ubisoft...), by
  the rules a save-file game follows (watchdog.js). A watcher tells how far the game is with
  `completion: { unlocked, total, achievements }` on each unlock (completionOf below). From the list:
  the game's own "earn every achievement" one pops as the platinum (util/platinumLike.js), and
  otherwise the platinum popup follows the unlock that completes what the platinum waits for, the
  base game by default (util/platinumScope.js). A game tied to its PlayStation list uses the real one.
*/

const notifyStrings = require('./notifyStrings.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const psnTrophyLink = require(sharedAppModulePath('parser/psnTrophyLinkRead.js'));
const platinumLike = require(sharedAppModulePath('util/platinumLike.js'));
const platinumScope = require(sharedAppModulePath('util/platinumScope.js'));

const platinumOn = (options) => !(options && options.notification && options.notification.platinum === false);

const isComplete = (completion) =>
  Boolean(completion) && Number(completion.total) > 0 && Number(completion.unlocked) >= Number(completion.total);

/**
 * The completion a watcher hands with an unlock.
 * @param {{ name: string, displayName?: string, description?: string, category?: string }[]} entries the game's list
 * @param {Iterable<string>} earned names of the achievements earned so far
 * @returns {{ unlocked: number, total: number, achievements: object[] }}
 */
function completionOf(entries, earned) {
  const earnedNames = new Set([...(earned || [])].map(String));
  const achievements = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.name != null)
    .map((entry) => ({ ...entry, name: String(entry.name), earned: earnedNames.has(String(entry.name)) }));
  return { unlocked: achievements.filter((entry) => entry.earned).length, total: achievements.length, achievements };
}

const listOf = (completion) => (completion && Array.isArray(completion.achievements) ? completion.achievements : null);

// The list's own platinum achievement, or null. A list without names and texts has none to find.
function ownPlatinumName(unlock, completion) {
  const list = listOf(completion);
  return list ? platinumLike.platinumNameOf({ appid: unlock.appid, achievement: { list } }) : null;
}

// Whether this unlock completes what the platinum waits for. A watcher that only counts keeps the whole list.
function completesPlatinum(options, unlock, completion, link) {
  const list = listOf(completion);
  if (!list) return isComplete(completion);
  const inScope = platinumScope.platinumFilter(list, {
    scope: options && options.notification && options.notification.platinumScope,
    categoryOf: (achievement) => achievement.category || psnTrophyLink.linkedGroup(options, link, achievement.name),
  });
  const required = list.filter((achievement) => !achievement.removed && (!inScope || inScope(achievement)));
  // A DLC unlock after the base game was done is no platinum: only one the platinum waited for is.
  const counts = required.some((achievement) => achievement.name === String(unlock.achievementName));
  return required.length > 0 && counts && required.every((achievement) => achievement.earned);
}

function platinumPopup(options, unlock) {
  if (!unlock || unlock.notificationType === 'platinum' || !platinumOn(options)) return null;
  const { completion, ...rest } = unlock;
  const link = psnTrophyLink.readLink(rest.appid);
  // A list whose own achievement is the platinum already popped it with that unlock.
  if (psnTrophyLink.platinumTwinName(link) || ownPlatinumName(rest, completion)) return null;
  if (!completesPlatinum(options, rest, completion, link)) return null;
  const real = psnTrophyLink.linkedPlatinum(link);
  const strings = notifyStrings.forLang(options && options.achievement && options.achievement.lang);
  return {
    source: rest.source,
    appid: rest.appid,
    notificationType: 'platinum',
    realPlatinum: Boolean(real),
    gameDisplayName: rest.gameDisplayName,
    achievementDisplayName: real ? real.name : rest.gameDisplayName,
    achievementDescription: real ? real.description : strings.platinumDesc,
    icon: (real && real.icon) || rest.icon,
    gameIcon: rest.gameIcon,
    image: rest.image,
    time: rest.time,
  };
}

const withPlatinumAttribution = (opts, gameName, title) =>
  opts && opts.toast ? { ...opts, toast: { ...opts.toast, attribution: `${gameName} · ${title}` } } : opts;

// Wraps a watcher's notify: the unlock goes out first, then the platinum popup once per game and session.
function withCompletionPopup(notify, getOptions) {
  const completed = new Set();
  return async (payload, opts) => {
    const { completion, ...unlock } = payload || {};
    const options = getOptions();
    const title = notifyStrings.forLang(options && options.achievement && options.achievement.lang).platinumTitle;
    // The game's own platinum achievement pops as the platinum, in place of a normal popup.
    const own = platinumOn(options) && unlock.notificationType !== 'platinum' ? ownPlatinumName(unlock, completion) : null;
    if (own && own === String(unlock.achievementName)) {
      return notify({ ...unlock, notificationType: 'platinum', realPlatinum: true }, withPlatinumAttribution(opts, unlock.gameDisplayName, title));
    }
    const result = await notify(unlock, opts);
    const popup = platinumPopup(options, { ...unlock, completion });
    const key = `${unlock.source}:${unlock.appid}`;
    if (!popup || completed.has(key)) return result;
    completed.add(key);
    await notify(popup, withPlatinumAttribution(opts, unlock.gameDisplayName, title));
    return result;
  };
}

module.exports = { completionOf, platinumPopup, withCompletionPopup };
