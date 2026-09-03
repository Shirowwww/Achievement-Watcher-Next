'use strict';

/*
  Closing Settings with OK used to rebuild the whole library: the grid was emptied, the memo of which
  AppIDs failed to resolve was dropped, and a full scan ran again. Changing a theme colour therefore
  cost the same seconds, and the same network traffic, as changing a game source.

  Only a handful of settings actually decide what the library CONTAINS. This module says which, so
  the panel can rescan when it must and simply close when it need not. Everything else is either
  applied live while Settings is open (theme, tile size, tile chrome, the Play button) or has no
  bearing on the grid at all (notifications, controller, overlay).

  Pure and DOM-free so test/core/libraryRefresh.test.js can describe the policy rather than the UI.
*/

/*
  Under `achievement`. Each one changes the rows themselves, not how they are painted:
    lang                  the schema is fetched and cached per language
    showHidden            decides whether hidden achievements are read into the list
    mergeDuplicate        one card per game, or one per source
    timeMergeRecentFirst  which unlock time survives a merge
    hideZero              filters games out of the grid as it is built

  libraryLayout is deliberately absent: switching view swaps a class and, across an orientation
  change, re-requests the covers of the tiles already on screen. The toolbar picker has always done
  exactly that without a scan, and Settings now calls the same function (applyLibraryView in app.js).
*/
const ACHIEVEMENT_KEYS = Object.freeze(['lang', 'showHidden', 'mergeDuplicate', 'timeMergeRecentFirst', 'hideZero']);

/*
  Compare values by what they mean, not by their type. Saving reads every switch out of a <select>,
  so a source stored as the number 2 comes back as the string "2" and a boolean as "true": compared
  literally, every OK looked like a change and rebuilt the library even when nothing moved.
*/
function stable(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => `${key}=${stable(value[key])}`)
      .join(';');
  }
  return String(value);
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) out[key] = stable(source && typeof source === 'object' ? source[key] : undefined);
  return out;
}

// Folder rows carry UI-only fields; only the path and whether it is enabled reach the scan.
function normalizeFolders(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => {
      const path = String((typeof entry === 'string' ? entry : entry && (entry.path || entry.dir)) || '').trim();
      const enabled = !(typeof entry === 'object' && entry !== null && entry.enabled === false);
      // Windows accepts either separator and does not care about case, so neither may read as a
      // different folder: comparing them literally would rescan over a path written another way.
      return { path: path.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase(), enabled };
    })
    .filter((entry) => entry.path)
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

/*
  A comparable snapshot of everything the grid's contents depend on. Compared as a whole rather than
  key by key: a setting added to a source list later is then covered by default, which is the safe
  direction to fail in - an unnecessary rescan is slow, a missing one shows stale data.
*/
function signature({ config, userDirs, libraryDirs } = {}) {
  const settings = config && typeof config === 'object' ? config : {};
  return JSON.stringify({
    achievement: pick(settings.achievement, ACHIEVEMENT_KEYS),
    // Every source switch, whatever it is called: turning one on or off adds or removes games.
    sources: stable(settings.achievement_source && typeof settings.achievement_source === 'object' ? settings.achievement_source : {}),
    // The Steam account the legit-Steam source reads.
    steam: pick(settings.steam, ['main']),
    // Shown on the profile band, which is rebuilt with the list.
    username: pick(settings.general, ['username']),
    userDirs: normalizeFolders(userDirs),
    libraryDirs: normalizeFolders(libraryDirs),
  });
}

// True when the two snapshots differ, i.e. when closing Settings has to rebuild the library.
function needsRescan(before, after) {
  return before !== after;
}

module.exports = { ACHIEVEMENT_KEYS, signature, needsRescan, normalizeFolders };
