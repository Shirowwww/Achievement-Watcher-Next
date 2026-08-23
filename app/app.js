'use strict';
const rendererScriptStartedAt = performance.now();
const { ipcRenderer, clipboard } = require('electron');
let userDataPath = null;
function getUserDataPath() {
  if (userDataPath) return userDataPath;
  userDataPath = ipcRenderer.sendSync('get-user-data-path-sync');
  return userDataPath;
}
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');
const args_split = require('argv-split');
const { cssUrl, cssUrlValue } = require(path.join(appPath, 'util/cssUrl.js'));
const { focusAchievementRow } = require(path.join(appPath, 'util/achievementFocus.js'));
const { splitLaunchArgs } = require(path.join(appPath, 'util/launchArgs.js'));
const windowsShellLaunch = require(path.join(appPath, 'util/windowsShellLaunch.js'));
const { openExternalSafe } = require(path.join(appPath, 'util/externalLink.js'));
const steamClientLinks = require(path.join(appPath, 'util/steamClientLinks.js'));
const gameHealthInterfaceMode = require(path.join(appPath, 'util/interfaceMode.js'));
const notificationPreset = require(path.join(appPath, 'util/notificationPreset.js'));
const gameNotificationPreset = require(path.join(appPath, 'util/gamePreset.js'));

// The DOM id carried by an achievement row icon. It is built in two places - the row markup and
// the icon preload pass - and the two must stay byte-identical, so the derivation lives here
// instead of being spelled out twice.
function achievementIconId(name) {
  return String(name)
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]/g, '');
}

/*
  Simple mode reports outcomes ("Achievement data found"), Advanced reports the values behind them
  (the schema count, the watched binary, the transport). Both read the SAME report: only the wording
  and the length of the check list change, never a state, a level or an offered repair. The exact
  values Simple leaves out are all still in Technical details, which both modes show.
*/
function interfaceIsSimple() {
  return gameHealthInterfaceMode.isSimple(gameHealthInterfaceMode.resolve(app.config));
}

const args = require('minimist');
const moment = require('moment');
const { spawn } = require('child_process');
const humanizeDuration = require('humanize-duration');
const settings = require(path.join(appPath, 'settings.js'));
settings.setUserDataPath(getUserDataPath());
const achievements = require(path.join(appPath, 'parser/achievements.js'));
const scanScope = require(path.join(appPath, 'parser/scanScope.js'));
const userdatapath = getUserDataPath();
const isDev = ipcRenderer.sendSync('win-isDev') || false;
achievements.initDebug({ isDev, userDataPath: userdatapath });
if (achievements.setEmulatorFixedHandler) {
  achievements.setEmulatorFixedHandler((game) => {
    try {
      ipcRenderer.send('emulator-fixed-notify', game);
    } catch (err) {
      debug && debug.log(`[emulator-fixed] notify bridge failed => ${formatErr(err)}`);
    }
  });
}
const blacklist = require(path.join(appPath, 'parser/blacklist.js'));
const userDir = require(path.join(appPath, 'parser/userDir.js'));
const libraryDirs = require(path.join(appPath, 'parser/libraryDirs.js'));
const goldberg = require(path.join(appPath, 'parser/goldberg.js'));
const gbeInstaller = require(path.join(appPath, 'parser/gbeInstaller.js'));
const uplayR2 = require(path.join(appPath, 'parser/uplayR2.js'));
const uplayR2Installer = require(path.join(appPath, 'parser/uplayR2Installer.js'));
const steamParser = require(path.join(appPath, 'parser/steam.js'));
const exeList = require(path.join(appPath, 'parser/exeList.js'));
const manualUnlock = require(path.join(appPath, 'parser/manualUnlock.js'));
const manualGames = require(path.join(appPath, 'parser/manualGames.js'));
manualGames.setUserDataPath(getUserDataPath());
const exeDetect = require(path.join(appPath, 'parser/exeDetect.js'));
const gameIndex = require(path.join(appPath, 'parser/gameIndex.js'));
const PlaytimeTracking = require(path.join(appPath, 'parser/playtime.js'));
const progressMute = require(path.join(appPath, 'parser/progressMute.js'));
progressMute.setUserDataPath(getUserDataPath());
const notificationHealth = require(path.join(appPath, 'parser/notificationHealth.js'));
notificationHealth.setUserDataPath(getUserDataPath());
const achievementReset = require(path.join(appPath, 'parser/achievementReset.js'));
achievementReset.setUserDataPath(getUserDataPath());
const emulatorSourceOverride = require(path.join(appPath, 'parser/emulatorSourceOverride.js'));
emulatorSourceOverride.setUserDataPath(getUserDataPath());
const l10n = require(path.join(appPath, 'locale/loader.js'));
const coverStore = require(path.join(appPath, 'util/coverStore.js'));
const gameIconStore = require(path.join(appPath, 'util/gameIconStore.js'));
const localIcons = require(path.join(appPath, 'util/localIcons.js'));
const uninstall = require(path.join(appPath, 'util/uninstall.js'));
const apiCheckBypass = require(path.join(appPath, 'parser/apiCheckBypass.js'));
const { calculateLibraryStats } = require(path.join(appPath, 'util/libraryStats.js'));
const { resolveGameRarityContext } = require(path.join(appPath, 'util/rarity.js'));
const librarySnapshot = require(path.join(appPath, 'util/librarySnapshot.js'));
const { createViewportWork } = require(path.join(appPath, 'util/viewportWork.js'));
const perfTrace = require(path.join(appPath, 'util/perfTrace.js'));
const libraryLayout = require(path.join(appPath, 'util/libraryLayout.js'));
const intlFormat = require(path.join(appPath, 'util/intlFormat.js'));
const links = require(path.join(appPath, 'util/links.js'));
const { localeText } = require(path.join(appPath, 'locale/t.js'));
// `t` and `escapeHtml` come from ui/settings.js; classic scripts share their lexical scope.
let debug = new (require(path.join(appPath, 'util/logger.js')))({
  console: isDev,
  file: path.join(userdatapath, `logs/${ipcRenderer.sendSync('get-app-name-sync')}.log`),
});

if (isDev)
  debug.log(
    `[perf] renderer modules loaded in ${(performance.now() - rendererScriptStartedAt).toFixed(0)}ms ` +
      `(${rendererScriptStartedAt.toFixed(0)}ms of page time before app.js)`
  );

// Keep otherwise-silent renderer failures in the log.
window.addEventListener('unhandledrejection', (e) => {
  try {
    debug.error(`[unhandledrejection] ${(e.reason && e.reason.stack) || e.reason}`);
  } catch {}
});
/*
  "ResizeObserver loop completed with undelivered notifications" is benign: Chromium raises it when
  an observer callback resizes something and defers the rest to next frame (ordinary for a
  responsive grid). It reaches window.onerror with no Error/stack, so it was the only thing landing
  at ERROR level in an otherwise-clean exported log.
*/
const BENIGN_WINDOW_ERRORS = [/^ResizeObserver loop /i];

window.addEventListener('error', (e) => {
  try {
    const message = String(e.message || '');
    if (!e.error && BENIGN_WINDOW_ERRORS.some((pattern) => pattern.test(message))) return;
    debug.error(`[window.error] ${(e.error && e.error.stack) || e.message}`);
  } catch {}
});

/*
  Opens the Steam target in the client if it is running, otherwise the web page in the browser. The
  question is asked fresh on every click and never cached: Steam can start or quit while the app is
  open, and answering from the startup state could send a steam:// link to a client that is no
  longer there.
*/
async function openSteamTarget(build, appid) {
  let running = false;
  try {
    running = !!(await ipcRenderer.invoke('steam:is-running'));
  } catch {
    // Without a response, fall back to the browser: a web page always opens, a steam:// link does not.
  }
  const url = build(appid, { clientRunning: running });
  if (url) remote.shell.openExternal(url);
}

const gameElements = new Map();
let gameList = [];
let libraryArtwork = createViewportWork();
const coverRecoveryCache = new Map();
let artworkLoadGeneration = 0;

ipcRenderer.on('artwork-caches-cleared', () => {
  artworkLoadGeneration += 1;
  coverRecoveryCache.clear();
  reloadCoverOverrides();
  document.querySelectorAll('#game-list .header').forEach((header) => {
    header.style.background = 'none';
    setLibraryArtworkFeedback($(header), 'clear');
  });
});
let profileStatsAnimationTimer = null;

/*
  A live window resize snaps the library grid straight to its new column count - a per-card
  reposition animation was tried and cost too much for 200+ tiles. This is the cheap version: dip
  the whole panel's opacity while the window is actively resizing, then let it ease back once it
  settles, so the eye reads "the panel is adjusting" instead of catching the hard jump.
*/
let resizeSettleTimer = null;
window.addEventListener(
  'resize',
  () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    document.body.classList.add('is-resizing');
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => document.body.classList.remove('is-resizing'), 160);
  },
  { passive: true }
);

/*
  Recomputing the profile summary for every streamed game made both halves quadratic on a large
  library. Streamed repaints are throttled to roughly one a frame; explicit callers (batch paint,
  end-of-scan sort) are never throttled, so the final figures the user sees are always exact.
*/
const PROFILE_STATS_MIN_INTERVAL_MS = 120;
let lastProfileStatsAt = 0;
let profileStatsNodes = null;
function profileStatsElements() {
  if (profileStatsNodes && profileStatsNodes.stats.length && document.contains(profileStatsNodes.stats[0])) {
    return profileStatsNodes;
  }
  const stats = $('#user-info .info .stats');
  const dist = $('#user-info .completion-dist');
  profileStatsNodes = { stats, data: stats.find('li span.data'), dist, distFill: dist.find('.fill') };
  return profileStatsNodes;
}

function renderProfileStats(stats, { animate = false } = {}) {
  const values = [String(stats.totalUnlocked), `${stats.completed}/${stats.total}`, String(stats.average)];
  const nodes = profileStatsElements();
  let changed = false;
  nodes.data.each(function (index) {
    if (this.textContent === values[index]) return;
    this.textContent = values[index];
    changed = true;
  });

  nodes.distFill.css('width', stats.average + '%');
  nodes.dist.attr('title', formatPercentValue(stats.average));

  const statsEl = nodes.stats;
  if (!animate || !changed || !statsEl.length) return;
  statsEl.removeClass('is-updating');
  void statsEl[0].offsetWidth;
  statsEl.addClass('is-updating');
  clearTimeout(profileStatsAnimationTimer);
  profileStatsAnimationTimer = setTimeout(() => statsEl.removeClass('is-updating'), 220);
}

function refreshProfileStats({ animate = false } = {}) {
  const installedOnly = typeof window.installedOnlyEnabled === 'function' && window.installedOnlyEnabled();
  renderProfileStats(calculateLibraryStats(gameList, { installedOnly }), { animate });
}

window.refreshProfileStats = refreshProfileStats;

function gameTouchesScanScope(game, scope) {
  const data = (game && game.data) || {};
  const sourcePaths = Array.isArray(game && game.dataPaths) ? game.dataPaths.map((entry) => entry && entry.path) : [];
  return [game && game.path, game && game.dataPath, game && game.gameDir, game && game.exe, data.path, data.root, data.gameDir, data.exe, ...sourcePaths]
    .filter(Boolean)
    .some((candidate) => scanScope.pathIsWithinSelectedDirectories(candidate, scope));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentFromProgress(current, max) {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((current / max) * 100)));
}

function getAchievementProgressState(achievement) {
  // Keep float counters readable without changing integers.
  const max = Math.round(Math.max(0, finiteNumber(achievement.MaxProgress ?? achievement.max_progress, 0)) * 100) / 100;
  let current = Math.max(0, finiteNumber(achievement.CurProgress ?? achievement.progress, 0));
  const achieved = achievement.Achieved == 1 || achievement.Achieved === true;
  if (achieved && max > 0 && current < max) current = max;
  if (max > 0 && current > max) current = max;
  current = Math.round(current * 100) / 100;
  const percent = percentFromProgress(current, max);
  return {
    current,
    max,
    percent,
    // 0/1 is a normal locked/unlocked state, not a counter.
    hasProgress: max > 1,
  };
}

// Periodically discover new installs without loading their full data.
const NEW_GAME_SCAN_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
// Most ticks have nothing to find, and a discovery is a few hundred milliseconds of synchronous
// directory walking on this thread. A tick therefore compares the folders the last scan read and
// stops there when none of them moved. That check cannot see the sources that live in a database or
// the registry (Steam, GOG Galaxy, Ubisoft Connect), so a full pass still runs on a slower cadence.
const FULL_DISCOVERY_EVERY_TICKS = 5; // ~15 minutes
let newGameScanTicks = 0;
let newGameScanTimer = null;
let scanInFlight = false;

// Appids the last completed scan discovered. Diffing against the rendered list instead made every
// discovered-but-unrenderable appid (merged into another source, hidden by "hide 0%", no schema)
// look new on every tick. Mirrors runBackgroundAutoFix in electron/init.js.
let knownDiscoveredAppids = null;

/*
  Appids a completed scan discovered but deliberately did not render (no achievements, not
  installed, merged elsewhere, filtered out). Discovery is not stable for these, so a phantom
  reappearing read as "new game installed" and triggered a full refresh - counting misses and
  ignoring an appid after two failures breaks that loop while still letting a real new game through.
*/
const UNRENDERABLE_MISS_LIMIT = 2;
const unrenderableAppids = new Map();

function isPersistentlyUnrenderable(appid) {
  return (unrenderableAppids.get(String(appid)) || 0) >= UNRENDERABLE_MISS_LIMIT;
}

function seedNewGameScanBaseline(renderedList) {
  return achievements
    .detectInstalledAppids(app.config)
    .then((ids) => {
      knownDiscoveredAppids = new Set(ids.map(String));
      // Within DISCOVER_TTL_MS this reuses the discovery the finished scan was built from, so the
      // two sets are directly comparable: anything discovered but absent from the rendered list is
      // a miss for this pass.
      if (!Array.isArray(renderedList)) return;
      const rendered = new Set(renderedList.map((game) => String(game && game.appid)));
      for (const id of knownDiscoveredAppids) {
        if (rendered.has(id)) unrenderableAppids.delete(id);
        else unrenderableAppids.set(id, (unrenderableAppids.get(id) || 0) + 1);
      }
    })
    .catch((err) => debug.log(`[new-game-scan] baseline failed: ${err}`));
}

// One detection tick: cheap discover, diff against the last discovery, full refresh only on a new one.
async function runNewGameScan() {
  if (scanInFlight) return; // a scan is already running
  if ($('#achievement').is(':visible')) return; // user is reading a game's achievements - don't yank the view
  if ($('title-bar')[0] && $('title-bar')[0].inSettings) return; // user is configuring - leave them be
  scanInFlight = true;
  try {
    newGameScanTicks += 1;
    if (newGameScanTicks % FULL_DISCOVERY_EVERY_TICKS !== 0) {
      const checkStartedAt = performance.now();
      if (achievements.discoveryInputsUnchanged()) {
        if (isDev)
          debug.log(
            `[new-game-scan] nothing changed in the folders the last scan read (${(performance.now() - checkStartedAt).toFixed(0)}ms) - skipping this tick`
          );
        return;
      }
    }
    const discovered = (await achievements.detectInstalledAppids(app.config)).map(String);
    const previous = knownDiscoveredAppids;
    knownDiscoveredAppids = new Set(discovered);
    if (previous === null) return; // no scan has finished yet - this tick only establishes the baseline
    const fresh = discovered.filter((id) => !previous.has(id) && !isPersistentlyUnrenderable(id));
    if (fresh.length > 0) {
      debug.log(`[new-game-scan] ${fresh.length} new game(s) detected (${fresh.join(', ')}) - refreshing library`);
      app.onStart(); // re-seeds the watchdog gameIndex so the new game is tracked
    }
  } catch (err) {
    debug.log(`[new-game-scan] failed: ${err}`);
  } finally {
    scanInFlight = false;
  }
}

// Manual refresh clears the Steam miss caches.
function forgetScanCaches() {
  // A manual refresh is the user saying "look again properly", so stop suppressing the appids that
  // previously failed to render.
  unrenderableAppids.clear();
  try {
    achievements.forgetInstallScanCache();
    steamParser.forgetUnresolved();
    // Also drop remembered local-schema locations, so a schema added by hand since the last scan
    // is found now rather than whenever the miss memo happens to expire.
    steamParser.forgetLocalSchemaLocations();
  } catch (err) {
    debug.log(`[new-game-scan] could not clear the unresolved-appid cache: ${err}`);
  }
}

// Keep one background discovery timer alive.
function scheduleNewGameScan() {
  if (newGameScanTimer) clearInterval(newGameScanTimer);
  newGameScanTimer = setInterval(runNewGameScan, NEW_GAME_SCAN_INTERVAL_MS);
}

function resolveUnpackedBinary(binPath) {
  const normalized = String(binPath || '');
  const unpacked = normalized.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  return fs.existsSync(unpacked) ? unpacked : normalized;
}

// Show progress for long per-game actions without exposing dynamic HTML.
function setGameBoxBusy($box, text) {
  if (!$box || !$box.length) return;
  const content = $box.find('.loading-overlay .content').first();
  content.html('<i class="fas fa-spinner fa-spin"></i><div class="status"></div>');
  content.find('.status').text(text || '');
  $box.addClass('wait');
}
function clearGameBoxBusy($box) {
  if (!$box || !$box.length) return;
  $box.removeClass('wait');
  $box.find('.loading-overlay .content').first().html('<i class="fas fa-spinner fa-spin"></i>');
}

function applyLibraryLayout(value, legacyPortrait = false) {
  const mode = libraryLayout.normalize(value, legacyPortrait);
  $('#game-list')
    .removeClass(libraryLayout.MODES.map((name) => `view-${name}`).join(' '))
    .addClass(`view-${mode}`)
    .attr('data-library-layout', mode);
  $('#library-layout-select, #option_libraryLayout').val(mode);
  return mode;
}

// Keep the control in the DOM so the other launch entry points can reuse its handler.
function applyPlayButtonVisibility(value) {
  const visible = value !== false;
  $('#game-list').toggleClass('hide-play-button', !visible);
  return visible;
}

// The interface language, for the Intl helpers. Read on each call: it changes without a reload.
function uiLang() {
  try {
    return String((app.config && app.config.achievement && app.config.achievement.lang) || 'english');
  } catch {
    return 'english';
  }
}

/*
  Fill in every href the markup declares as data-aw-link="<key>", resolved against
  app/util/links.js. Markup names the destination, the registry owns the address: a renamed
  repository or a moved documentation page is then one edit, not a hunt through the views.
*/
function applyExternalLinks(root) {
  $(root || document)
    .find('[data-aw-link]')
    .addBack('[data-aw-link]')
    .each(function () {
      const key = String($(this).attr('data-aw-link') || '');
      const url = key.split('.').reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), links);
      if (typeof url === 'string' && url) $(this).attr('href', url);
      else debug.warn(`[links] no address for data-aw-link="${key}"`);
    });
}

// Grouped counts ("1,024" / "1 024"), for the achievement totals a large library shows.
function formatCount(value) {
  return intlFormat.formatNumber(Number(value) || 0, uiLang());
}

// A completion percentage already expressed in percent, with the language's own separator and sign.
function formatPercentValue(value, digits = 0) {
  return intlFormat.formatPercent(value, uiLang(), { maximumFractionDigits: digits });
}

function libraryRelativeTime(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const lang = uiLang();
  const date = new Date(seconds * 1000);
  const relative = intlFormat.formatRelativeTime(seconds, lang);
  const exact = intlFormat.formatDateTime(seconds, lang, { dateStyle: 'full', timeStyle: 'short' });
  return `<time class="library-scroll-text" datetime="${date.toISOString()}" title="${escapeHtml(
    exact
  )}"><span class="library-scroll-content">${escapeHtml(relative)}</span></time>`;
}

function startLibraryTextScroll(container) {
  if (!container || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const text = container.querySelector(':scope > .library-scroll-content');
  if (!text) return;
  const overflow = Math.max(0, Math.ceil(text.scrollWidth - container.clientWidth));
  if (overflow <= 2) return;

  container._scrollAnimation?.cancel();
  container._scrollAnimation = text.animate(
    [
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: 0.14 },
      { transform: `translateX(-${overflow}px)`, offset: 0.78 },
      { transform: `translateX(-${overflow}px)`, offset: 1 },
    ],
    {
      duration: Math.max(3200, overflow * 28),
      iterations: Infinity,
      direction: 'alternate',
      easing: 'ease-in-out',
    }
  );
}

function stopLibraryTextScroll(container) {
  container?._scrollAnimation?.cancel();
  if (container) container._scrollAnimation = null;
}

/*
  A played-time label. Intl.DurationFormat knows all 28 bundled languages; humanize-duration is
  kept only for a runtime that does not ship it, and its own language list does not cover every
  locale AW Next bundles, so it stays the fallback rather than the first choice.
*/
function formatPlaytime(seconds, { units } = {}) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  const intlUnits = units || (total < 60 ? ['seconds'] : total >= 86400 ? ['days', 'hours'] : ['hours', 'minutes']);
  const viaIntl = intlFormat.formatDuration(total, uiLang(), { units: intlUnits });
  if (viaIntl) return viaIntl;
  const shortUnits = intlUnits.map((unit) => unit[0]);
  return humanizeDuration(total * 1000, { language: moment.locale(), fallbacks: ['en'], units: shortUnits, round: true, largest: 2 });
}

function libraryPlaytime(seconds) {
  return formatPlaytime(seconds);
}

async function ensureUplayR2Package({ interactive = true, forceImport = false } = {}) {
  const cacheDir = path.join(getUserDataPath(), 'cache/uplayR2');
  let bundledError = null;
  if (!forceImport) {
    try {
      return await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir, log: debug });
    } catch (err) {
      bundledError = err;
      debug.error(`[uplayR2] bundled package could not be imported => ${formatErr(err)}`);
    }
  }
  let cache = uplayR2Installer.ensureEmulatorDlls({ cacheDir });
  if (cache.seeded && !forceImport) return cache;
  if (!interactive) {
    const invalid = cache.invalid.map((entry) => `${entry.name || path.basename(entry.file)}: ${entry.error}`).join(', ');
    throw new Error(`Uplay R2 package is not available${bundledError ? ` (${formatErr(bundledError)})` : invalid ? ` (${invalid})` : ''}`);
  }

  const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'warning',
    title: t('uplay-r2-dll-not-seeded', 'Uplay R2 dll not seeded', 'DLL Uplay R2 manquantes'),
    message: t('no-files-found-in-the-uplay-r2-cache', 'No files found in the Uplay R2 cache.', 'Aucun fichier trouvé dans le cache Uplay R2.'),
    detail:
      t(
        'copy-the-uplay-r2-loader-64-dll-upc-r2-loader-64-dll-files-into-',
        'Select your Uplay R2 package once. AW Next will import only validated x86/x64 loader DLLs into:\n{dir}',
        'Sélectionne une fois ton paquet Uplay R2. AW Next importera uniquement les DLL x86/x64 validées dans :\n{dir}',
        { dir: cacheDir }
      ) +
      (cache.invalid.length ? `\n\n${cache.invalid.map((entry) => `${entry.name || path.basename(entry.file)}: ${entry.error}`).join('\n')}` : ''),
    buttons: [t('cancel', 'Cancel', 'Annuler'), t('select-file', 'Select file…', 'Sélectionner le fichier…')],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  });
  if (choice !== 1) return null;
  const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
    title: t('select-file', 'Select file…', 'Sélectionner le fichier…'),
    properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
    filters: [
      { name: t('archives', 'Archives', 'Archives'), extensions: ['7z', 'zip'] },
      { name: 'Uplay R2 DLL', extensions: ['dll'] },
    ],
  });
  if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return null;
  for (const packagePath of picked.filePaths) {
    await uplayR2Installer.importPackage({ packagePath, cacheDir, log: debug });
  }
  cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir, log: debug });
  if (!cache.seeded) throw new Error('The selected package contained no compatible Uplay R2 loader');
  return cache;
}

async function detectedGameExe(game, gameDir) {
  const configured = await exeList.get(game && game.appid);
  const candidates = [(configured && configured.exe) || '', (game && game.exe) || ''];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const full = path.isAbsolute(candidate) ? candidate : path.join(gameDir, candidate);
    if (fs.existsSync(full)) return full;
  }
  const detected = exeDetect.detect(gameDir, (game && game.name) || '', { dllPaths: uplayR2.detectEmulator(gameDir).dll });
  return (detected && detected.full) || '';
}

function uplayR2IniOptions() {
  const emulator = app.config?.emulator || {};
  return {
    accountName: String(emulator.uplayUsername || '').trim() || app.config?.general?.username,
    language: emulator.uplayLanguage && emulator.uplayLanguage !== 'auto' ? emulator.uplayLanguage : app.config?.achievement?.lang,
    logging: emulator.uplayLogging === true,
  };
}

async function selectUplayR2SteamMapping({ game, gameDir, appid } = {}) {
  const record = game && typeof game === 'object' ? game : {};
  const identity = uplayR2.resolveGameIdentity(record, appid);
  const ranked = await steamParser.findAppidCandidatesByName(record.name || path.basename(gameDir || ''), 6);
  const hints = uplayR2.findSteamAppidHints(gameDir);
  const candidates = [];
  const add = (candidate, hinted = false) => {
    const value = String(candidate && candidate.appid ? candidate.appid : '').trim();
    if (!/^\d+$/.test(value) || candidates.some((entry) => entry.appid === value)) return;
    candidates.push({
      appid: value,
      name: String((candidate && candidate.name) || `Steam AppID ${value}`),
      hinted,
    });
  };
  for (const hint of hints) {
    const known = ranked.find((candidate) => String(candidate.appid) === String(hint.appid));
    add(known || { appid: hint.appid, name: `Steam AppID ${hint.appid}` }, true);
  }
  for (const candidate of ranked) add(candidate);
  if (candidates.length === 0) return null;

  const labels = candidates.map((candidate) => `${candidate.name} (${candidate.appid})${candidate.hinted ? ' [steam_appid.txt]' : ''}`);
  const skipped = labels.length;
  const picked = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'question',
    title: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
    message: t('which-game-is-x', 'Which game is "{name}"?', 'Quel jeu est « {name} » ?', {
      name: record.name || path.basename(gameDir || ''),
    }),
    detail: t(
      'uplay-no-steam-match',
      'This Ubisoft game has no known match in uplay-steam.json.',
      "Ce jeu Ubisoft n'a pas de correspondance connue dans uplay-steam.json."
    ),
    buttons: [...labels, t('skip', 'Skip', 'Ignorer')],
    defaultId: 0,
    cancelId: skipped,
    noLink: true,
  });
  if (picked < 0 || picked >= candidates.length) return null;
  const selected = candidates[picked];
  return {
    uplay_id: identity.uplayId,
    steam_appid: Number(selected.appid),
    steam_name: selected.name,
    manual: true,
    pendingOverride: true,
  };
}

async function replaceUplayR2SteamMapping({ game, gameDir, appid, box = null } = {}) {
  const mapping = await selectUplayR2SteamMapping({ game, gameDir, appid });
  if (!mapping) return null;
  setGameBoxBusy(box, t('fetching-the-steam-schema', 'Fetching the Steam schema…', 'Récupération du schéma Steam…'));
  const schema = await steamParser.getGameData({
    appID: mapping.steam_appid,
    lang: app.config?.achievement?.lang || 'english',
    showHidden: true,
  });
  if (!uplayR2.derivePrefixedIds((schema && schema.achievement && schema.achievement.list) || [])) {
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('unsupported-game', 'Unsupported game', 'Jeu non pris en charge'),
      message: t(
        'uplay-prefix-pattern-mismatch',
        "This game's Steam achievement names don't follow the required <prefix><digits> pattern.",
        'Les noms de succès Steam de ce jeu ne suivent pas le format <préfixe><chiffres> requis.'
      ),
      noLink: true,
    });
    return null;
  }
  const saved = uplayR2.saveSteamMappingOverride({
    gameDir,
    uplayId: mapping.uplay_id,
    steamAppid: mapping.steam_appid,
    steamName: (schema && schema.name) || mapping.steam_name,
  });
  remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'info',
    title: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
    message: t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
      appid: saved.steam_appid,
      name: saved.steam_name,
    }),
    noLink: true,
  });
  return saved;
}

/*
  One renderer Uplay R2 repair entry point for the context menu, Game Health, and Fix all. The
  background scanner calls the same installer transaction directly; validation is identical.
*/
async function applyUplayR2Repair({ game, gameDir, appid, box = null, interactive = true, showResult = true } = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) throw new Error(`Uplay R2 game folder not found: ${gameDir || '(missing)'}`);
  const id = appid != null ? appid : game && game.appid;
  const setBusy = (message) => setGameBoxBusy(box, message);
  const record = game && typeof game === 'object' ? game : {};
  const recordData = record.data && typeof record.data === 'object' ? record.data : {};
  const recordedDir = record.gameDir || recordData.gameDir || '';
  const persistedAtThisInstall =
    !!(record.uplayR2 || recordData.uplayR2 || /uplay r2|goldberg uplay|lumaplay|^uplay$/i.test(String(record.source || ''))) &&
    !!recordedDir &&
    path.resolve(recordedDir).toLowerCase() === path.resolve(gameDir).toLowerCase();
  const trustedInstall = persistedAtThisInstall || uplayR2.hasEmulatorEvidence(gameDir);
  if (!trustedInstall) {
    throw new Error('This folder is not proven to be a Goldberg Uplay R2 installation; refusing to replace an official Ubisoft loader');
  }
  setBusy(t('resolving-the-steam-equivalent', 'Resolving the Steam equivalent…', 'Résolution du jeu Steam…'));
  const identity = uplayR2.resolveGameIdentity({ ...record, appid: id, gameDir }, id);
  let mapping = identity.mapping;
  if (!mapping && interactive) mapping = await selectUplayR2SteamMapping({ game, gameDir, appid: id });
  if (!mapping) {
    if (interactive) {
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        title: t('no-steam-equivalent-found', 'No Steam equivalent found', 'Jeu Steam introuvable'),
        message: t('uplay-no-steam-match', 'This Ubisoft game has no known match in uplay-steam.json.', "Ce jeu Ubisoft n'a pas de correspondance connue dans uplay-steam.json."),
        detail: t('the-uplay-r2-fix-needs-the-steam-version-of-the-game-to-fetch-th', 'The Uplay R2 fix needs the Steam version of the game to fetch the achievement schema.', 'Le fix Uplay R2 a besoin de la version Steam du jeu pour récupérer le schéma des succès.'),
      });
      return null;
    }
    throw new Error('No trusted Steam mapping for this Ubisoft game');
  }

  setBusy(t('fetching-the-steam-schema', 'Fetching the Steam schema…', 'Récupération du schéma Steam…'));
  const schema = await steamParser.getGameData({
    appID: mapping.steam_appid,
    lang: app.config?.achievement?.lang || 'english',
    showHidden: true,
  });
  const achievementList = (schema && schema.achievement && schema.achievement.list) || [];
  const prefixInfo = uplayR2.derivePrefixedIds(achievementList);
  if (!prefixInfo) {
    if (interactive) {
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        title: t('unsupported-game', 'Unsupported game', 'Jeu non pris en charge'),
        message: t('uplay-prefix-pattern-mismatch', "This game's Steam achievement names don't follow the required <prefix><digits> pattern.", 'Les noms de succès Steam de ce jeu ne suivent pas le format <préfixe><chiffres> requis.'),
        detail: t('the-automatic-goldberg-uplay-r2-mapping-cannot-be-generated-for-', 'The automatic Goldberg Uplay R2 mapping cannot be generated for this game.', 'Le mappage automatique vers Goldberg Uplay R2 ne peut pas être généré pour ce jeu.'),
      });
      return null;
    }
    throw new Error('Steam achievement names cannot be mapped safely to Ubisoft objective IDs');
  }

  const emu = uplayR2.detectEmulator(gameDir);
  const installed = uplayR2.inspectInstalledLoaders(emu.dll);
  const existingRuntimeDirs = [...new Set(emu.dll.map((file) => path.dirname(file)))];
  const existingSetupFiles = existingRuntimeDirs.flatMap((dir) =>
    [uplayR2.ACH_SCHEMA_FILE, ...uplayR2.INI_NAMES]
      .map((name) => path.join(dir, name))
      .filter((file) => fs.existsSync(file))
  );
  const existingRepairFiles = [...new Set([...emu.dll, ...existingSetupFiles])];
  const hasExistingUplayFix = emu.dll.length > 0;
  let reapplyConfirmed = false;
  if (interactive && hasExistingUplayFix) {
    const proceed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('reapply-gbe-title', 'Re-apply the emulator fix?', 'Ré-appliquer le fix émulateur ?'),
      message: t(
        'reapply-gbe-message',
        'This game already has a setup ({name}). Re-applying replaces it with a freshly generated one.',
        'Ce jeu a déjà une configuration ({name}). La ré-appliquer la remplace par une configuration régénérée.',
        { name: 'Uplay R2' }
      ),
      detail: `${existingRepairFiles.join('\n')}\n${t(
        'reapply-gbe-detail',
        'The current files are backed up first and can be restored from the repair controls.',
        'Les fichiers actuels sont sauvegardés au préalable et peuvent être restaurés depuis les contrôles de réparation.'
      )}`,
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('reapply-gbe-button', 'Re-apply', 'Ré-appliquer')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (proceed !== 1) return null;
    reapplyConfirmed = true;
  }
  let installPlan = null;
  let cache = null;
  try {
    cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir: path.join(getUserDataPath(), 'cache/uplayR2'), log: debug });
  } catch (err) {
    debug.log(`[${id}] uplayR2: loader cache unavailable => ${formatErr(err)}`);
  }
  const customReplacementRequired = !!cache && cache.customNames.some((name) =>
    emu.dll.some((file) => path.basename(file).toLowerCase() === name && !uplayR2Installer.sameFileBytes(file, cache.files[name]))
  );
  const loaderMustBeInstalled = emu.dll.length === 0 || !installed.supportsAchievements || !installed.architectureValid || customReplacementRequired;
  if (loaderMustBeInstalled) {
    cache = cache || (await ensureUplayR2Package({ interactive }));
    if (!cache) return null;
    installPlan = uplayR2Installer.planInstall({
      gameDir,
      dlls: cache,
      loaderPaths: emu.dll,
      exePath: await detectedGameExe(game, gameDir),
      trustedInstall,
    });
    if (!installPlan.safe && interactive && installPlan.issues.some((issue) => issue.code === 'PACKAGE_MISSING_LOADER')) {
      cache = await ensureUplayR2Package({ interactive, forceImport: true });
      if (!cache) return null;
      installPlan = uplayR2Installer.planInstall({ gameDir, dlls: cache, loaderPaths: emu.dll, exePath: await detectedGameExe(game, gameDir), trustedInstall });
    }
    if (!installPlan.safe) throw new Error(`No safe Uplay R2 loader target: ${installPlan.issues.map((issue) => issue.code).join(', ')}`);
  } else if (!installed.supportsAchRedirect) {
    try {
      cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir: path.join(getUserDataPath(), 'cache/uplayR2'), log: debug });
      const candidate = uplayR2Installer.planInstall({ gameDir, dlls: cache, loaderPaths: emu.dll, exePath: await detectedGameExe(game, gameDir), trustedInstall });
      const improvesEveryTarget = candidate.safe && candidate.targets.every((target) => uplayR2.inspectLoader(target.source).supportsAchRedirect);
      if (interactive && improvesEveryTarget) {
        const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'question',
          title: t('update-the-uplay-r2-loader', 'Update the Uplay R2 loader?', 'Mettre à jour le loader Uplay R2 ?'),
          message: t('uplay-r2-old-loader-message', 'This game uses a loader too old to redirect achievements.', 'Ce jeu utilise un loader trop ancien pour rediriger les succès.'),
          detail: t('uplay-r2-old-loader-detail', "The fix works without updating: AW Next reads the emulator's own save folder.\n\nUpdating enables the redirect into GSE Saves, but replaces a DLL the game currently launches with (the original is kept in the repair backup).", "Le correctif fonctionne sans mise à jour : AW Next lit le dossier de sauvegarde de l'émulateur.\n\nMettre à jour le loader permet la redirection vers GSE Saves, mais remplace une DLL avec laquelle le jeu se lance actuellement (l'originale est conservée dans la sauvegarde de réparation)."),
          buttons: [t('keep-current-loader', 'Keep the current loader', 'Garder le loader actuel'), t('update-loader', 'Update', 'Mettre à jour')],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (choice === 1) installPlan = candidate;
      }
    } catch (err) {
      debug.log(`[${id}] uplayR2: optional loader update unavailable => ${formatErr(err)}`);
    }
  }

  const runtimeDirs = installPlan
    ? [...new Set(installPlan.targets.map((target) => target.dir))]
    : [...new Set(emu.dll.map((file) => path.dirname(file)))];
  if (interactive && !reapplyConfirmed) {
    const detail = [
      t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
        appid: mapping.steam_appid,
        name: mapping.steam_name,
      }),
      ...((installPlan && installPlan.targets) || []).map((target) => `${target.name} (${target.arch}) → ${target.dir}`),
      ...runtimeDirs.map((dir) => `${uplayR2.ACH_SCHEMA_FILE}, ${uplayR2.INI_NAMES.join(', ')} → ${dir}`),
    ].join('\n');
    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'question',
      title: t('apply-emulator-fix-uplay-r2', 'Apply emulator fix (Uplay R2)…', 'Appliquer le correctif émulateur (Uplay R2)…'),
      message: t(
        'apply-the-emulator-fix-to-x-detected-game-s-existing-files-are-b',
        'Apply the emulator fix to {count} detected game(s)? Existing files are backed up before being overwritten.',
        'Appliquer le fix émulateur à {count} jeu(x) détecté(s) ? Les fichiers existants sont sauvegardés avant d’être écrasés.',
        { count: 1 }
      ),
      detail,
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('apply-emulator-fix-uplay-r2', 'Repair Uplay R2', 'Réparer Uplay R2')],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return null;
  }

  setBusy(t('configuring-achievements', 'Configuring (achievements)…', 'Configuration (succès)…'));
  const iniOptions = uplayR2IniOptions();
  const result = uplayR2Installer.repairInstallation({
    gameDir,
    installPlan,
    loaderPaths: emu.dll,
    steamAppid: mapping.steam_appid,
    uplayId: mapping.uplay_id,
    name: (game && game.name) || mapping.steam_name,
    mapping,
    schema,
    prefix: prefixInfo.prefix,
    ...iniOptions,
    log: debug,
  });
  if (mapping.pendingOverride) {
    mapping = uplayR2.saveSteamMappingOverride({
      gameDir,
      uplayId: mapping.uplay_id,
      steamAppid: mapping.steam_appid,
      steamName: mapping.steam_name,
    });
  }

  if (interactive && showResult) {
    const mapped = Math.max(0, ...result.repairs.map((repair) => Object.keys(repair.achievementsSchemaJson).length));
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'info',
      title: t('uplay-r2-installed', 'Uplay R2 installed', 'Uplay R2 installé'),
      message: t('uplay-r2-installed-message', '{installedLabel} - {mapped} achievement(s) mapped', '{installedLabel} - {mapped} succès mappé(s)', {
        installedLabel: result.install.installed > 0
          ? t('dllsInstalled', '{count} dll(s) installed', '{count} dll(s) installée(s)', { count: result.install.installed })
          : t('emulator-fix-applied', 'Emulator fix applied', 'Fix émulateur appliqué'),
        mapped,
      }),
      detail: `${runtimeDirs.join('\n')}${result.backupDir ? `\n${t('diagnosis-config-backed-up', 'Previous config backed up: {path}', 'Configuration précédente sauvegardée : {path}', { path: result.backupDir })}` : ''}`,
      noLink: true,
    });
  }
  return { ...result, mapping, schema, prefix: prefixInfo.prefix };
}

// Show a progress cursor while the interactive library scan runs.
function setLibraryBusyCursor(busy) {
  try {
    document.documentElement.classList.toggle('library-loading', busy === true);
  } catch (err) {
    debug.warn(`[cursor] ${err && err.message ? err.message : err}`);
  }
}

// Skeleton tiles fill the grid while a scan streams real games in. Without them a fast local
// install sits alone on screen, then the whole library pops in at once.
const MAX_SKELETON_TILES = 18;
const DEFAULT_SKELETON_TILES = 12;
const MIN_STREAMING_SKELETON_TILES = 6;
// One placeholder past whatever is still coming, so the grid keeps saying "there is more" until the
// scan actually finishes - clearSkeletonTiles() takes it away at the end.
const EXTRA_SKELETON_TILES = 1;
let skeletonStreamActive = false;
let skeletonSequence = 0;
// The live placeholders, in document order. Re-querying them per streamed game cost two full
// `:has()` traversals of a list that grows with every tile.
let skeletonTiles = [];
// Games the scan will actually deliver; null until makeList reports it.
let skeletonExpected = null;
let skeletonRendered = 0;

function skeletonTileHtml(index) {
  const delay = ((index || 0) % 6 * -0.2).toFixed(1);
  return `
    <li>
      <div class="game-box skeleton" aria-hidden="true" style="--skeleton-delay:${delay}s">
        <div class="header"></div>
        <div class="info">
          <div class="info-head"><div class="title"></div></div>
          <div class="progressBar"><span class="meter"></span></div>
        </div>
      </div>
    </li>`;
}

// Never show more placeholders than games still to arrive, so a 3-game library does not shimmer
// with 12 of them - plus the one deliberate extra.
function skeletonBudget(cap) {
  if (skeletonExpected === null) return cap;
  const remaining = Math.max(0, skeletonExpected - skeletonRendered);
  return Math.min(cap, remaining + EXTRA_SKELETON_TILES);
}

// Is this tile one the installed-only filter will hide? Counted from the filter state and the
// tile's own flag rather than its computed style, so the answer does not depend on layout having
// happened yet.
function tileHiddenByInstalledFilter(item) {
  try {
    if (!(typeof window.installedOnlyEnabled === 'function' && window.installedOnlyEnabled())) return false;
    return item.find('.game-box').attr('data-installed') === '0';
  } catch {
    return false;
  }
}

function appendSkeletonTiles(count) {
  const list = $('#game-list ul');
  for (let i = 0; i < count; i++) {
    const tile = $(skeletonTileHtml(skeletonSequence++));
    list.append(tile);
    skeletonTiles.push(tile);
  }
}

function trimSkeletonTiles(target) {
  while (skeletonTiles.length > target) skeletonTiles.pop().remove();
}

function addSkeletonTiles(count) {
  skeletonStreamActive = true;
  skeletonSequence = 0;
  skeletonTiles = [];
  skeletonExpected = null;
  skeletonRendered = 0;
  appendSkeletonTiles(count);
}

// makeList reports the real count before the first game resolves; resize to it.
function setSkeletonExpected(total) {
  if (!skeletonStreamActive || !(total > 0) || skeletonExpected === total) return;
  skeletonExpected = total;
  trimSkeletonTiles(skeletonBudget(MAX_SKELETON_TILES));
}

function replaceSkeletonWith(item) {
  const skeleton = skeletonTiles.shift();
  if (skeleton && skeleton.parent().length) skeleton.replaceWith(item);
  else $('#game-list ul').append(item);
  // makeList reports every game it will deliver, but installed-only hides part of them in CSS, so
  // that total counts tiles the user will never see. A hidden arrival is removed from what is still
  // expected instead of counting as one delivered - either way the remaining budget drops by one,
  // and the placeholders keep matching the games the grid is actually going to show.
  if (tileHiddenByInstalledFilter(item)) {
    if (skeletonExpected !== null) skeletonExpected -= 1;
  } else {
    skeletonRendered += 1;
  }
  // Keep a short animated tail until makeList resolves, or a large library looks finished after
  // its first dozen games. The tail shrinks to nothing as the last games arrive.
  if (!skeletonStreamActive) return;
  const budget = skeletonBudget(MIN_STREAMING_SKELETON_TILES);
  if (skeletonTiles.length > budget) trimSkeletonTiles(budget);
  else appendSkeletonTiles(budget - skeletonTiles.length);
}

function clearSkeletonTiles() {
  skeletonStreamActive = false;
  skeletonTiles = [];
  skeletonExpected = null;
  skeletonRendered = 0;
  $('#game-list ul li:has(.game-box.skeleton)').remove();
}

// Repaint one tile and the header counters from the current in-memory list.
function refreshLibraryProgressFor(appid, games) {
  const list = Array.isArray(games) ? games : [];
  const game = list.find((g) => g && String(g.appid) === String(appid));
  if (game && game.achievement) {
    const total = Number(game.achievement.total) || 0;
    const percent = total > 0 ? Math.round((100 * (Number(game.achievement.unlocked) || 0)) / total) : 0;
    const bar = $('#game-list .game-box')
      .filter(function () {
        return String($(this).data('appid')) === String(appid);
      })
      .first()
      .find('.progressBar')
      .first();
    if (bar.length) {
      bar.attr('data-percent', percent);
      bar.find('.meter').css('width', percent + '%');
      bar.find('.progress-value').text(formatPercentValue(percent));
    }
  }

  refreshProfileStats({ animate: true });
}

/*
  The Watchdog keeps each game's unlock baseline in memory, so deleting the .db file is only half of
  a reset: the running monitor would still diff the re-earned achievement against a baseline that
  has it and report "already unlocked", costing the user every future notification for that game.
  Best effort - a monitor that is not running has no memory to clear, and starts from the file.
*/
async function forgetWatchdogBaseline(appid) {
  try {
    await ipcRenderer.invoke('watchdog-forget-achievement-baseline', String(appid));
  } catch (err) {
    debug.warn(`[reset] the monitor could not be told to drop its baseline: ${formatErr(err)}`);
  }
}

/*
  Take the in-memory copy of a game back to zero after its saves were cleared, then repaint. The
  library is only re-read from disk on a scan, so without this the tile and the achievement list
  would keep showing the unlocks that were just deleted until the next refresh.
*/
function repaintGameAfterReset(appid, game) {
  if (game && game.achievement && Array.isArray(game.achievement.list)) {
    for (const achievement of game.achievement.list) {
      if (!achievement) continue;
      achievement.Achieved = false;
      achievement.UnlockTime = 0;
      achievement.CurProgress = 0;
      delete achievement.manual;
      delete achievement.manualForced;
    }
    game.achievement.unlocked = 0;
  }
  const box = $('#game-list .game-box')
    .filter(function () {
      return String($(this).data('appid')) === String(appid);
    })
    .first();
  if (box.length && typeof app.onGameBoxClick === 'function') app.onGameBoxClick(box, gameList);
  refreshLibraryProgressFor(appid, gameList);
}

// Open catalog links only after validating their http(s) scheme.
function openCatalogLink(url) {
  return openExternalSafe(remote.shell, url, (rejected) => {
    debug.warn(`[crackfix] refused to open a non-http(s) link: ${String(rejected).slice(0, 120)}`);
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('crakfiles', 'CrakFiles'),
      message: t(
        'link-not-opened',
        'This link was not opened because it is not a web address.',
        "Ce lien n'a pas \u00e9t\u00e9 ouvert car ce n'est pas une adresse web."
      ),
      detail: String(rejected || ''),
    });
  });
}

// Tracks in-flight uninstall completions so the game list refreshes once the
// uninstaller (or Steam) has actually removed the game. One poll per
// (mode, appid, folder) so repeated right-click actions don't stack timers.
const uninstallPolls = new Map();
function pollUninstallCompletion({ appid, gameDir, mode } = {}) {
  const key = `${mode}|${String(appid)}|${String(gameDir || '')}`;
  if (uninstallPolls.has(key)) return;
  const started = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - started;
    let done = false;
    if (mode === 'local') {
      done = gameDir ? !fs.existsSync(gameDir) : false;
    } else if (mode === 'steam') {
      const gameDirGone = gameDir ? !fs.existsSync(gameDir) : false;
      const info = /^[0-9]+$/.test(String(appid)) ? uninstall.getSteamUninstallInfo(appid) : null;
      done = gameDirGone || (info && info.installed === false);
    }
    if (done || elapsed >= 120000) {
      clearInterval(timer);
      uninstallPolls.delete(key);
      if (done) setTimeout(() => app.onStart(), 800);
    }
  }, 3000);
  uninstallPolls.set(key, timer);
}

// Convert Error, string, and plain-object failures into readable text.
function formatErr(err) {
  if (err == null) return 'unknown error';
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const msg = err.message || err.error || err.reason;
    if (msg) return err.code && String(err.code) !== String(msg) ? `${msg} (${err.code})` : String(msg);
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

// Cache source icons so each distinct source needs one IPC lookup.
const sourceImgCache = new Map();
function getSourceImg(source) {
  if (sourceImgCache.has(source)) return sourceImgCache.get(source);
  const localPath = ipcRenderer.sendSync('fetch-source-img', source);
  const img = localPath && path.isAbsolute(localPath) ? pathToFileURL(localPath).href : localPath;
  sourceImgCache.set(source, img);
  return img;
}

// Cover-art overrides (per-appid; cfg/covers.db)
// One-time: covers picked before they were stored per orientation are bound to the shape their own
// image has, so switching the grid between portrait and landscape stops reusing the other shape's
// picture. Runs before the snapshot below so the first render already sees the split entries.
try {
  const split = coverStore.splitLegacyByShape();
  if (split.length > 0) debug.log(`[cover] bound ${split.length} custom cover(s) to the orientation of their artwork`);
} catch (err) {
  debug.warn(`[cover] could not classify legacy overrides: ${err.message || err}`);
}
// In-memory snapshot so the render path can apply an override synchronously (no disk read per tile).
let coverOverrides = coverStore.readAll();
function reloadCoverOverrides() {
  coverOverrides = coverStore.readAll();
}
// `orientation` ('portrait' | 'landscape') selects between independently-set covers; omitted, this
// falls back to whatever legacy single value is on record (applies to every orientation).
function coverOverrideFor(appid, orientation) {
  const id = String(appid);
  const override = coverStore.valueForOrientation(coverOverrides[id] || null, orientation);
  if (override && !coverStore.isUsable(override)) {
    const recovered = coverStore.recoverRemote(override);
    if (recovered) {
      // Old SteamGridDB selections retain their content hash in the deleted cache filename. Restore
      // the exact CDN URL now; it no longer depends on steam_cache and can be downloaded again.
      coverStore.set(id, recovered, orientation);
      reloadCoverOverrides();
      debug.log(`[cover] recovered SteamGridDB override for ${id}`);
      return recovered;
    }
    // A pre-fix covers.db can still reference steam_cache after that cache was already removed.
    // Drop only the broken reference so the normal cover fallback renders instead of a blank tile.
    coverStore.remove(id, orientation);
    reloadCoverOverrides();
    debug.warn(`[cover] removed missing override for ${id}`);
    return null;
  }
  return override;
}
// Square game-logo overrides (per-appid; cfg/gameIcons.db). Same lifecycle as the cover overrides
// above: an in-memory snapshot so a render never reads the disk, and a broken reference is dropped
// rather than left to paint an empty box.
let gameIconOverrides = gameIconStore.readAll();
function reloadGameIconOverrides() {
  gameIconOverrides = gameIconStore.readAll();
}
function gameIconOverrideFor(appid) {
  const id = String(appid);
  const override = gameIconOverrides[id] || null;
  if (!override) return null;
  if (gameIconStore.isUsable(override)) return override;
  gameIconStore.remove(id);
  reloadGameIconOverrides();
  debug.warn(`[icon] removed missing game-icon override for ${id}`);
  return null;
}

function applyCoverBackground(appid, value) {
  const el = $(`#game-header-${appid}`);
  if (!value || value === 'none') {
    el.css({ background: 'none', backgroundSize: '', backgroundPosition: '', backgroundRepeat: '' });
  } else {
    el.css({ backgroundImage: cssUrl(value), backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' });
  }
}

// A value the browser can paint: schema tokens stay as they are (their caller resolves them first),
// but an absolute Windows path has to become a file URL or Chromium reads it as a relative one.
function imageDisplayUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return path.isAbsolute(text) ? pathToFileURL(text).href : text;
}

const HEADER_ICON_SELECTOR = '#achievement .wrapper > .header .title .icon';

// The artwork the square logo can be cut from, best first.
function headerIconSourcesFor(game) {
  const img = (game && game.img) || {};
  return [img.icon, img.logo, img.portrait, img.header].filter(Boolean);
}

// The first square-ish image the game itself ships, as a file URL. Offline last resort for the
// header icon, and the "Game folder" tiles of the icon picker.
function localGameIconUrls(game) {
  try {
    return localIcons.gameIconCandidates(game).map((file) => pathToFileURL(file).href);
  } catch (err) {
    debug.warn(`[icon] local game icon lookup failed => ${err.message || err}`);
    return [];
  }
}

/*
  Paint the square logo beside the game title, in the order a user would expect:
    1. their own pick (right-click -> Game icon), remote picks going through the icon cache;
    2. the square logo the host resolves for notifications - the community icon set, then the
       game's own artwork cut square, so every surface shows the same logo for a game;
    3. artwork shipped inside the game folder, which is the only source that still works with no
       network at all.
  Repaintable on demand: the context menu calls it again after changing the selection.
*/
async function paintGameHeaderIcon(game) {
  const iconEl = $(HEADER_ICON_SELECTOR);
  // The element is shared across game pages. Another page can open while this resolves, and the
  // header carries the appid of the one on screen - so it is the freshness check for every branch.
  const stillOnScreen = () => String($('#achievement .wrapper > .header').attr('data-appid')) === String(game.appid);
  // With no artwork at all the box must go back to the neutral CSS surface, or the previous game's
  // icon stays behind and reads as if this page belonged to another game.
  const paint = (value) => {
    if (!stillOnScreen()) return;
    iconEl.css('background', value ? cssUrl(value) : '');
  };
  const paintLocal = () => paint(localGameIconUrls(game)[0] || '');
  const cacheAppid = game.steamappid || game.appid;

  const override = gameIconOverrideFor(game.appid);
  if (override) {
    if (!/^https?:/i.test(override)) {
      paint(imageDisplayUrl(override));
      return;
    }
    const local = await ipcRenderer.invoke('fetch-icon', override, cacheAppid).catch(() => null);
    if (local && local !== override) {
      paint(imageDisplayUrl(local));
      return;
    }
    // A remote pick that cannot be downloaded is not a reason to show nothing: fall through to the
    // normal chain, exactly like a cover override whose source went away.
    debug.warn(`[icon] custom game icon for ${game.appid} could not be downloaded`);
  }

  const sources = headerIconSourcesFor(game);
  if (sources.length === 0) {
    paintLocal();
    return;
  }

  paint(pathToFileURL(path.join(appPath, 'resources/img/loading.gif')).href);
  try {
    // The library appid too: artwork is cached under the Steam one, but the executable this game
    // was linked to is recorded under the library one, and the host needs it to read the exe icon.
    const resolved = await ipcRenderer.invoke('resolve-square-logo', {
      appid: cacheAppid,
      libraryAppid: game.appid,
      name: game.name || '',
      sources,
    });
    if (resolved) {
      paint(imageDisplayUrl(resolved));
      return;
    }
  } catch (err) {
    debug.warn(`[icon] square logo lookup failed => ${err.message || err}`);
  }
  paintLocal();
}

function setLibraryArtworkFeedback(headerEl, state, retry) {
  const header = headerEl && headerEl[0];
  if (!header) return;
  let feedback = header.querySelector('.library-artwork-feedback');
  if (!state || state === 'clear') {
    header.classList.remove('artwork-error', 'artwork-missing');
    feedback?.remove();
    return;
  }
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.className = 'library-artwork-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    const message = document.createElement('span');
    message.className = 'library-artwork-feedback-message';
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'library-artwork-retry';
    feedback.append(icon, message, retryButton);
    header.append(feedback);
  }
  const networkFailed = state === 'failed';
  header.classList.toggle('artwork-error', networkFailed);
  header.classList.toggle('artwork-missing', !networkFailed);
  const icon = feedback.querySelector('i');
  const message = feedback.querySelector('.library-artwork-feedback-message');
  const retryButton = feedback.querySelector('.library-artwork-retry');
  icon.className = networkFailed ? 'fas fa-exclamation-triangle' : 'fas fa-image';
  message.textContent = networkFailed
    ? t('artwork-fetch-failed', 'Could not fetch artwork', 'Impossible de récupérer le visuel')
    : t('artwork-not-found', 'No artwork found', 'Aucun visuel trouvé');
  retryButton.textContent = t('retry-artwork', 'Retry', 'Réessayer');
  retryButton.title = t('retry-artwork', 'Retry', 'Réessayer');
  retryButton.setAttribute('aria-label', t('retry-artwork', 'Retry', 'Réessayer'));
  retryButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    retry?.();
  };
}

// Fetch the preferred cover, then walk every usable artwork source before accepting a blank tile.
async function applyCoverWithFallback(game, headerEl, imgName, orientation = 'landscape', tried, generation = artworkLoadGeneration, { sameShapeOnly = false } = {}) {
  const img = (game && game.img) || {};
  const fallback = (current) => {
    /*
      Shapes are not interchangeable: header/landscape are 460x215/920x430, portrait is 600x900.
      sameShapeOnly is the first pass - it accepts only the requested shape, leaving the tile empty
      rather than settling on the wrong one while recovery looks for a real cover. Cross-shape
      candidates are only used afterwards, once recovery has failed.
    */
    const sameShape = orientation === 'portrait' ? [img.portrait] : [img.header, img.landscape];
    const otherShape = orientation === 'portrait' ? [img.header, img.landscape, img.background, img.icon] : [img.portrait, img.background, img.icon];
    const candidates = sameShapeOnly ? sameShape : [...sameShape, ...otherShape];
    return candidates.find((candidate) => candidate && candidate !== current && !(tried && tried.has(candidate))) || null;
  };
  if (!imgName || (tried && tried.has(imgName))) {
    if (generation !== artworkLoadGeneration) return { ok: false, reason: 'stale' };
    headerEl.css('background', 'none');
    return { ok: false, reason: 'missing' };
  }
  tried = tried || new Set();
  tried.add(imgName);
  try {
    const localPath = await ipcRenderer.invoke('fetch-icon', imgName, game.steamappid || game.appid);
    if (generation !== artworkLoadGeneration) return { ok: false, reason: 'stale' };
    const localExists = path.isAbsolute(String(localPath)) ? fs.existsSync(String(localPath)) : /^file:/i.test(String(localPath));
    if (localPath && (localPath !== imgName || localExists)) {
      headerEl.css('background', cssUrl(localPath));
      return { ok: true, source: imgName, localPath };
    }
  } catch {}
  const alt = fallback(imgName);
  if (alt) return applyCoverWithFallback(game, headerEl, alt, orientation, tried, generation, { sameShapeOnly });
  if (generation !== artworkLoadGeneration) return { ok: false, reason: 'stale' };
  headerEl.css('background', 'none');
  // A url that did not download is a missing image, not a diagnosis of the user's connection: only
  // a source that reported networkError may claim that (see recoverLibraryCover).
  return { ok: false, reason: 'missing' };
}

/*
  Does this image actually load? A gallery tile that paints an empty box is worse than no tile:
  the provider listed art the CDN no longer serves, so it is dropped rather than offered. Bounded,
  because a stalled request would otherwise hold "Loading…" open for the whole dialog.
*/
function imagePreviewReady(value) {
  const preview = imageDisplayUrl(value);
  if (!/^(?:https?|file|data):/i.test(preview) || typeof Image !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 8000);
    const image = new Image();
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = preview;
  });
}

/*
  A gallery-ready URL for one candidate, or null. Schema values such as "library_600x900.jpg" or a
  bare content hash are fetch-icon tokens, not browser-ready URLs; resolve those through the icon
  cache first. Shared by the cover picker and the icon picker.
*/
async function resolvePickerPreview(url, cacheAppid) {
  let preview = String(url || '').trim();
  if (!/^(?:https?|file|data):/i.test(preview) && !path.isAbsolute(preview)) {
    preview = await ipcRenderer.invoke('fetch-icon', preview, cacheAppid).catch(() => null);
    if (!preview || preview === url) return null;
  }
  return (await imagePreviewReady(preview)) ? imageDisplayUrl(preview) : null;
}

// Show alternate SteamDB and SteamGridDB covers for a game.
function openCoverPicker(game, appid, coverCacheAppid) {
  const portraitView = !!(app.config && app.config.achievement && app.config.achievement.thumbnailPortrait);
  const pickerOrientation = portraitView ? 'portrait' : 'landscape';
  const img = (game && game.img) || {};
  const defaultUrl = portraitView ? img.portrait || img.header || img.landscape : img.header || img.landscape || img.portrait;
  const overrideUrl = coverOverrideFor(appid, pickerOrientation);
  const currentUrl = overrideUrl || defaultUrl;
  const overlay = document.createElement('div');
  overlay.className = 'aw-prompt-overlay aw-cover-picker-overlay';
  const box = document.createElement('div');
  box.className = 'aw-prompt aw-cover-picker';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('chooseAnotherCoverTitle', 'Choose another cover', 'Choisir une autre jaquette'));
  const head = document.createElement('div');
  head.className = 'aw-prompt-heading';
  const icon = document.createElement('div');
  icon.className = 'aw-prompt-icon';
  icon.innerHTML = '<i class="fas fa-images"></i>';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'aw-prompt-title';
  titleWrap.textContent = t('chooseAnotherCoverTitle', 'Choose another cover', 'Choisir une autre jaquette');
  head.append(icon, titleWrap);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'aw-prompt-button secondary aw-cover-picker-close';
  closeBtn.textContent = '×';
  closeBtn.title = t('cancel', 'Cancel', 'Annuler');
  head.append(closeBtn);
  const status = document.createElement('div');
  status.className = 'aw-cover-picker-status';
  status.setAttribute('aria-live', 'polite');
  const statusMessage = document.createElement('span');
  statusMessage.textContent = t('coverPickerLoading', 'Loading covers…', 'Chargement des jaquettes…');
  const retrySourcesButton = document.createElement('button');
  retrySourcesButton.type = 'button';
  retrySourcesButton.className = 'aw-prompt-button secondary aw-cover-picker-retry';
  retrySourcesButton.textContent = t('retry-artwork', 'Retry', 'Réessayer');
  retrySourcesButton.hidden = true;
  status.append(statusMessage, retrySourcesButton);
  const grid = document.createElement('div');
  grid.className = 'aw-cover-picker-grid';
  const actions = document.createElement('div');
  actions.className = 'aw-prompt-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'aw-prompt-button secondary';
  cancelBtn.textContent = t('cancel', 'Cancel', 'Annuler');
  actions.append(cancelBtn);
  box.append(head, status, grid, actions);
  overlay.append(box);

  const done = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  closeBtn.onclick = done;
  cancelBtn.onclick = done;
  overlay.onmousedown = (ev) => {
    if (ev.target === overlay) done();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      done();
    }
  };
  document.addEventListener('keydown', onKey);

  // Show the gallery even when loading its options fails.
  document.body.append(overlay);

  const seenUrls = new Set();
  let providerTileCount = 0;
  const resolvePreview = (url) => resolvePickerPreview(url, coverCacheAppid);
  const addTile = (url, source, previewUrl = url) => {
    const key = String(url || '').trim();
    if (!key || seenUrls.has(key)) return;
    seenUrls.add(key);
    const tile = document.createElement('div');
    tile.className = 'aw-cover-picker-tile';
    if (!portraitView) tile.classList.add('aw-landscape');
    const preview = path.isAbsolute(String(previewUrl || '')) ? pathToFileURL(previewUrl).href : previewUrl;
    tile.style.backgroundImage = cssUrl(preview);
    tile.title = url;
    const tag = document.createElement('span');
    tag.className = 'aw-cover-picker-source';
    tag.textContent = source;
    tile.append(tag);
    tile.onclick = async () => {
      try {
        // Bound downloads and fall back to the remote URL on failure.
        const local = await Promise.race([
          ipcRenderer.invoke('fetch-icon', url, coverCacheAppid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('fetch-icon timeout')), 15000)),
        ]).catch((err) => {
          debug.warn(`[cover] picker download failed (${err.message || err}) - applying remote URL`);
          return null;
        });
        // Persist the provider URL, not the disposable downloaded preview. The next render will
        // populate steam_cache again, and a dead source can then fall through to the normal chain.
        const target = coverStore.persist(String(appid), url, getUserDataPath(), pickerOrientation);
        if (!target) throw new Error('selected cover could not be persisted');
        reloadCoverOverrides();
        applyCoverBackground(String(appid), local && local !== url ? local : target);
      } catch (err) {
        debug.warn(`[cover] picker apply failed => ${err}`);
      }
      done();
    };
    grid.append(tile);
  };
  const addProviderTile = async (url, source, previewUrl = url) => {
    try {
      const key = String(url || '').trim();
      if (!key) return false;
      if (seenUrls.has(key)) return true;
      if (!(await resolvePreview(previewUrl))) return false;
      const before = seenUrls.size;
      addTile(url, source, previewUrl);
      if (seenUrls.size > before) providerTileCount += 1;
      return seenUrls.size > before;
    } catch (err) {
      debug.warn(`[cover] picker preview failed (${source}) => ${err}`);
      return false;
    }
  };

  // Render the current cover independently from the provider lookup. Schema values such as
  // "library_600x900.jpg" are fetch-icon tokens, not browser-ready URLs; resolve them first so the
  // "Current"/"Default" tiles never appear as an empty surface while SteamDB/SteamGridDB are loading.
  /*
    What the library tile is painted with right now. Current and Default are the way back to the
    cover the game already has, so they must be offered even when their value no longer resolves -
    a token the CDN stopped answering, or no network at all. The picture is on screen either way.
  */
  const paintedCover = () => cssUrlValue($(`#game-header-${appid}`).first().css('background-image'));
  const addResolvedTile = async (url, source) => {
    const preview = (await resolvePreview(url)) || paintedCover();
    if (preview) addTile(url, source, preview);
  };
  const currentTilePromise = currentUrl ? addResolvedTile(currentUrl, t('currentCover', 'Current', 'Actuelle')) : Promise.resolve();
  // Once an override is set, the schema-provided default drops out of currentUrl - without a
  // dedicated tile it would only reappear via "Reset cover to default" in the context menu.
  const defaultTilePromise =
    overrideUrl && defaultUrl && defaultUrl !== overrideUrl
      ? currentTilePromise.then(() => addResolvedTile(defaultUrl, t('defaultCover', 'Default', 'Par défaut')))
      : Promise.resolve();

  const steamCoverId = /^\d+$/.test(String((game && (game.steamappid || game.appid)) || ''))
    ? String(game.steamappid || game.appid)
    : '';

  let pendingSources = 0;
  let failedSources = 0;
  let sourceAttempt = 0;
  const refreshStatus = () => {
    if (providerTileCount > 0) {
      status.remove();
      return;
    }
    if (!status.isConnected) box.insertBefore(status, grid);
    if (pendingSources > 0) {
      statusMessage.textContent = t('coverPickerLoading', 'Loading covers…', 'Chargement des jaquettes…');
      retrySourcesButton.hidden = true;
      return;
    }
    statusMessage.textContent = failedSources
      ? t(
          'cover-picker-fetch-failed',
          'Could not fetch alternative covers. Check your connection and retry.',
          'Impossible de récupérer les jaquettes alternatives. Vérifiez votre connexion et réessayez.'
        )
      : t('noCoversFound', 'No alternative covers found.', 'Aucune jaquette alternative trouvée.');
    retrySourcesButton.hidden = false;
  };
  const sourceSettled = (attempt, failed) => {
    if (attempt !== sourceAttempt) return;
    pendingSources -= 1;
    if (failed) failedSources += 1;
    refreshStatus();
  };
  const startSourceLoad = () => {
    const attempt = ++sourceAttempt;
    pendingSources = 2;
    failedSources = 0;
    refreshStatus();

    // Two lookups on purpose. The instant sources (Steam's CDN and SteamGridDB) paint the gallery in
    // well under a second; the SteamDB scrape costs a browser launch, so its tiles are appended
    // whenever it finishes instead of holding the whole dialog on "Loading covers".
    const fastOptions = ipcRenderer.invoke('get-cover-options', {
      name: game.name,
      orientation: pickerOrientation,
      // Only a real Steam release should hit the Steam CDN probe - a non-Steam numeric id (GOG/Xbox)
      // would just answer 404 on every asset path.
      steamAppid: steamCoverId,
    });

    let fastFailed = false;
    let fastNetworkUnavailable = false;
    fastOptions
      .then(async (opts = {}) => {
        fastNetworkUnavailable = opts.networkError === true;
        fastFailed = fastNetworkUnavailable;
        const steamUrls = Array.isArray(opts.steam) ? opts.steam : [];
        const steamResults = await Promise.all(steamUrls.map((url) => addProviderTile(url, 'Steam')));
        // Tiles preview the SteamGridDB thumbnail; the full-size url is only downloaded on click.
        const gridCovers = Array.isArray(opts.grids) ? opts.grids : [];
        const gridResults = await Promise.all(
          gridCovers.map((cover) =>
            addProviderTile(cover && cover.url, 'SteamGridDB', (cover && cover.thumb) || (cover && cover.url))
          )
        );
        const candidates = steamUrls.length + gridCovers.length;
        if (candidates > 0 && !steamResults.some(Boolean) && !gridResults.some(Boolean)) fastFailed = true;
      })
      .catch((err) => {
        fastFailed = true;
        fastNetworkUnavailable = true;
        debug.warn(`[cover] picker options failed => ${err}`);
      })
      .then(() => {
        sourceSettled(attempt, fastFailed);
        // SteamDB launches a browser scrape. Do not start it at all when the fast providers already
        // proved that the network is unavailable; this is what kept an offline clear-cache scan
        // waiting behind a queue of 45-second SteamDB pages.
        if (!steamCoverId || fastNetworkUnavailable) {
          sourceSettled(attempt, true);
          return null;
        }
        let steamdbFailed = false;
        return ipcRenderer
          .invoke('get-cover-options-steamdb', { orientation: pickerOrientation, steamAppid: steamCoverId })
          .then(async (urls) => {
            const candidates = Array.isArray(urls) ? urls : [];
            const results = await Promise.all(candidates.map((url) => addProviderTile(url, 'SteamDB')));
            if (candidates.length > 0 && !results.some(Boolean)) steamdbFailed = true;
          })
          .catch((err) => {
            steamdbFailed = true;
            debug.warn(`[cover] picker SteamDB options failed => ${err}`);
          })
          .then(() => sourceSettled(attempt, steamdbFailed));
      });
  };
  retrySourcesButton.onclick = () => startSourceLoad();
  startSourceLoad();
}

/*
  Pick the square logo shown beside the game title - the icon counterpart of the cover picker, and
  deliberately the same dialog: same chrome, same tiles, same "click a tile to apply it", only the
  tiles are square and the sources are icon sources.

  Four of them, in the order they are appended: what is on screen now, the community icon set
  (SteamGridDB), the game's own Steam artwork, and images found inside the install folder. The last
  one is the only source that works with no usable network, and it is also where a player who
  already has the right picture on disk will look for it.
*/
function openIconPicker(game, appid, iconCacheAppid, exePath) {
  const overlay = document.createElement('div');
  overlay.className = 'aw-prompt-overlay aw-cover-picker-overlay';
  const box = document.createElement('div');
  box.className = 'aw-prompt aw-cover-picker aw-icon-picker';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const title = t('chooseAnotherIconTitle', 'Choose another icon', "Choisir une autre icône");
  box.setAttribute('aria-label', title);
  const head = document.createElement('div');
  head.className = 'aw-prompt-heading';
  const icon = document.createElement('div');
  icon.className = 'aw-prompt-icon';
  icon.innerHTML = '<i class="fas fa-icons"></i>';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'aw-prompt-title';
  titleWrap.textContent = title;
  head.append(icon, titleWrap);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'aw-prompt-button secondary aw-cover-picker-close';
  closeBtn.textContent = '×';
  closeBtn.title = t('cancel', 'Cancel', 'Annuler');
  head.append(closeBtn);
  const status = document.createElement('div');
  status.className = 'aw-cover-picker-status';
  status.setAttribute('aria-live', 'polite');
  const statusMessage = document.createElement('span');
  statusMessage.textContent = t('iconPickerLoading', 'Loading icons…', 'Chargement des icônes…');
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'aw-prompt-button secondary aw-cover-picker-retry';
  retryButton.textContent = t('retry-artwork', 'Retry', 'Réessayer');
  retryButton.hidden = true;
  status.append(statusMessage, retryButton);
  const grid = document.createElement('div');
  grid.className = 'aw-cover-picker-grid';
  const actions = document.createElement('div');
  actions.className = 'aw-prompt-actions';
  // The manual route lives inside the gallery as well as in the context menu: a user who opened
  // this dialog and found nothing usable should not have to close it and right-click again.
  const browseBtn = document.createElement('button');
  browseBtn.className = 'aw-prompt-button secondary';
  browseBtn.textContent = t('choose-local-image', 'Choose local image…', 'Choisir une image locale…');
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'aw-prompt-button secondary';
  cancelBtn.textContent = t('cancel', 'Cancel', 'Annuler');
  actions.append(browseBtn, cancelBtn);
  box.append(head, status, grid, actions);
  overlay.append(box);

  const done = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') done();
  };
  closeBtn.onclick = done;
  cancelBtn.onclick = done;
  overlay.onmousedown = (ev) => {
    if (ev.target === overlay) done();
  };
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);

  browseBtn.onclick = () => {
    if (chooseLocalGameIcon(game, appid)) done();
  };

  const seenUrls = new Set();
  let providerTileCount = 0;
  const addTile = (key, source, previewUrl, onPick) => {
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key);
    const tile = document.createElement('div');
    tile.className = 'aw-cover-picker-tile aw-square';
    tile.style.backgroundImage = cssUrl(imageDisplayUrl(previewUrl));
    tile.title = key;
    const tag = document.createElement('span');
    tag.className = 'aw-cover-picker-source';
    tag.textContent = source;
    tile.append(tag);
    tile.onclick = () => {
      onPick();
      done();
    };
    grid.append(tile);
    return true;
  };
  const addProviderTile = async (url, source, previewUrl = url) => {
    try {
      const key = String(url || '').trim();
      if (!key) return false;
      if (seenUrls.has(key)) return true;
      const preview = await resolvePickerPreview(previewUrl, iconCacheAppid);
      if (!preview) return false;
      /*
        What gets stored is not always what was listed. A remote URL is kept as the source, so the
        bytes stay disposable cache; a schema token ("library_600x900.jpg", a bare content hash) is
        meaningless outside fetch-icon, so the file it resolved to is stored instead.
      */
      const applyValue = /^https?:/i.test(key) ? key : preview;
      if (addTile(key, source, preview, () => applyGameIconSelection(game, appid, applyValue))) providerTileCount += 1;
      return true;
    } catch (err) {
      debug.warn(`[icon] picker preview failed (${source}) => ${err}`);
      return false;
    }
  };

  let attempt = 0;
  const refreshStatus = (pending, failed) => {
    if (providerTileCount > 0) {
      status.remove();
      return;
    }
    if (!status.isConnected) box.insertBefore(status, grid);
    if (pending) {
      statusMessage.textContent = t('iconPickerLoading', 'Loading icons…', 'Chargement des icônes…');
      retryButton.hidden = true;
      return;
    }
    statusMessage.textContent = failed
      ? t(
          'icon-picker-fetch-failed',
          'Could not fetch alternative icons. Check your connection and retry.',
          'Impossible de récupérer les icônes alternatives. Vérifie ta connexion et réessaie.'
        )
      : t('noIconsFound', 'No alternative icon found.', 'Aucune icône alternative trouvée.');
    retryButton.hidden = false;
  };

  /*
    The icon this game would have with no pick at all, as the first tile.

    Undoing a choice was reachable only from the context menu, which meant leaving the gallery to
    find out what the original even looked like. Here it is a tile like any other, showing the
    picture it restores; clicking it clears the override rather than storing one, so the game goes
    back to following its own artwork instead of being pinned to a copy of it.
  */
  const addDefaultTile = async (run) => {
    let resolved = '';
    try {
      resolved = await ipcRenderer.invoke('resolve-square-logo', {
        appid: iconCacheAppid,
        libraryAppid: appid,
        name: game.name || '',
        sources: headerIconSourcesFor(game),
        exe: exePath || '',
        ignoreOverride: true,
      });
    } catch (err) {
      debug.warn(`[icon] default icon lookup failed => ${err}`);
    }
    if (run !== attempt || !resolved) return;
    const preview = await resolvePickerPreview(resolved, iconCacheAppid);
    if (run !== attempt || !preview) return;
    const overridden = !!gameIconOverrideFor(appid);
    // With nothing overridden the default IS what is on screen, so it is labelled for what it is
    // rather than offering to restore something that is already there.
    const label = overridden ? t('defaultCover', 'Default', 'Par défaut') : t('currentCover', 'Current', 'Actuelle');
    if (addTile(resolved, label, preview, () => resetGameIcon(game, appid))) providerTileCount += 1;
  };

  const startSourceLoad = async () => {
    const run = ++attempt;
    refreshStatus(true, false);

    // The local sources cost a readdir and always answer, so they are painted before anything is
    // asked of the network: with no connection at all the gallery is still usable.
    await addDefaultTile(run);
    if (run !== attempt) return;
    const currentUrl = gameIconOverrideFor(appid) || '';
    if (currentUrl) await addProviderTile(currentUrl, t('currentCover', 'Current', 'Actuelle'));
    for (const localUrl of localGameIconUrls(game)) {
      if (run !== attempt) return;
      await addProviderTile(localUrl, t('iconSourceGameFolder', 'Game folder', 'Dossier du jeu'));
    }
    if (run !== attempt) return;
    refreshStatus(true, false);

    const steamAppid = /^\d+$/.test(String(iconCacheAppid || '')) ? String(iconCacheAppid) : '';
    let failed = false;
    try {
      /*
        The game's own Steam artwork is cut into squares by the host before it gets here. Offering
        the raw tokens filled the gallery with library covers instead - a 2:3 grid and a 2:1 header
        are not icons, and neither is what the box beside the title ends up painting.
      */
      const options = await ipcRenderer.invoke('get-icon-options', {
        name: game.name || '',
        steamAppid,
        // The id every other artwork lookup for this game uses, so a game with no Steam appid still
        // caches its executable icon under a folder of its own.
        cacheAppid: String(iconCacheAppid || ''),
        sources: headerIconSourcesFor(game),
        exe: exePath || '',
      });
      if (run !== attempt) return;
      const opts = options || {};
      if (opts.exe) await addProviderTile(opts.exe, t('iconSourceExecutable', 'Executable', 'Exécutable'));
      for (const url of Array.isArray(opts.steam) ? opts.steam : []) {
        if (run !== attempt) return;
        await addProviderTile(url, 'Steam');
      }
      for (const asset of Array.isArray(opts.grids) ? opts.grids : []) {
        if (run !== attempt) return;
        await addProviderTile(asset && asset.url, 'SteamGridDB', (asset && asset.thumb) || (asset && asset.url));
      }
      failed = opts.networkError === true && providerTileCount === 0;
    } catch (err) {
      failed = true;
      debug.warn(`[icon] picker options failed => ${err}`);
    }
    if (run !== attempt) return;
    refreshStatus(false, failed);

    // SteamDB last, and appended whenever it finishes: it costs a browser launch, so holding the
    // gallery on "Loading" for it would undo the point of painting everything else immediately.
    if (!steamAppid) return;
    try {
      const urls = await ipcRenderer.invoke('get-icon-options-steamdb', { steamAppid });
      if (run !== attempt) return;
      for (const url of Array.isArray(urls) ? urls : []) {
        if (run !== attempt) return;
        await addProviderTile(url, 'SteamDB');
      }
    } catch (err) {
      debug.warn(`[icon] picker SteamDB options failed => ${err}`);
    }
    if (run !== attempt) return;
    refreshStatus(false, failed);
  };
  retryButton.onclick = () => startSourceLoad();
  startSourceLoad();
}

// Record a picked icon and repaint the header with it. Remote picks are stored as their source URL
// (the bytes stay disposable cache), exactly like a picked cover.
function applyGameIconSelection(game, appid, url) {
  try {
    const stored = gameIconStore.persist(String(appid), url, getUserDataPath(), undefined);
    if (!stored) throw new Error('selected icon could not be persisted');
    reloadGameIconOverrides();
    // paintGameHeaderIcon downloads a remote pick through the icon cache itself, so this single
    // call both stores the selection and puts it on screen.
    paintGameHeaderIcon(game);
    return true;
  } catch (err) {
    debug.warn(`[icon] apply failed => ${err}`);
    remote.dialog.showMessageBox({
      type: 'error',
      message: t('could-not-set-icon', 'Could not set icon: {error}', "Impossible de définir l'icône : {error}", { error: err.message || err }),
    });
    return false;
  }
}

// Drop the pick and go back to the icon the game resolves to on its own. Shared by the context
// menu and the picker's "Default" tile, so both undo a choice exactly the same way.
async function resetGameIcon(game, appid) {
  gameIconStore.remove(String(appid));
  reloadGameIconOverrides();
  await paintGameHeaderIcon(game);
}

// The manual route, shared by the context menu and the picker's own button.
function chooseLocalGameIcon(game, appid) {
  const files = remote.dialog.showOpenDialogSync({
    title: t('choose-icon-image', 'Choose icon image', "Choisir une image d'icône"),
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
  });
  if (!files || !files[0]) return false;
  return applyGameIconSelection(game, appid, pathToFileURL(files[0]).href);
}

/*
  Right-click the square logo on a game's page to change it - the same four actions the cover
  submenu offers, on the icon instead of the tile. Bound per page render (namespaced, so the
  previous game's handler goes with it) because the element is shared across every game page and
  the menu has to act on the one currently on screen.
*/
function bindGameHeaderIconMenu(game) {
  const appid = String(game.appid);
  const iconCacheAppid = String(game.steamappid || game.appid);
  $(HEADER_ICON_SELECTOR)
    .attr('title', t('rightClickToChangeIcon', 'Right-click to change this icon', "Clic droit pour changer cette icône"))
    .off('contextmenu.awGameIcon')
    .on('contextmenu.awGameIcon', async function (event) {
      event.preventDefault();
      const { Menu, MenuItem } = remote;
      const menu = new Menu();
      let exePath = '';
      try {
        exePath = (await exeList.get(appid))?.exe || '';
      } catch {
        /* no configured executable is normal; the picker simply skips that source */
      }

      menu.append(
        new MenuItem({
          label: t('chooseAnotherIcon', 'Choose another icon…', "Choisir une autre icône…"),
          click() {
            openIconPicker(game, appid, iconCacheAppid, exePath);
          },
        })
      );
      menu.append(
        new MenuItem({
          label: t('choose-local-image', 'Choose local image…', 'Choisir une image locale…'),
          click() {
            chooseLocalGameIcon(game, appid);
          },
        })
      );
      menu.append(
        new MenuItem({
          label: t('re-download-icon', 'Re-download icon', "Retélécharger l'icône"),
          async click() {
            try {
              gameIconStore.remove(appid);
              reloadGameIconOverrides();
              // Forget the cached answer as well as the selection, or the same picture comes
              // straight back out of steam_cache instead of being looked up again.
              await ipcRenderer.invoke('forget-square-logo', { appid: iconCacheAppid, name: game.name || '' }).catch(() => null);
              await paintGameHeaderIcon(game);
            } catch (err) {
              debug.warn(`[icon] redownload failed => ${err}`);
            }
          },
        })
      );
      if (gameIconOverrideFor(appid)) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(
          new MenuItem({
            label: t('reset-icon-to-default', 'Reset icon to default', "Réinitialiser l'icône"),
            click() {
              resetGameIcon(game, appid);
            },
          })
        );
      }
      menu.popup({ window: remote.getCurrentWindow() });
    });
}

// Styled in-app text prompt (Electron disables window.prompt). Resolves to the trimmed value or null.
function promptText(message, defaultValue = '', type = 'text') {
  return new Promise((resolve) => {
    const isSteamGuard = /(steam.*(?:2fa|guard)|(?:2fa|guard).*code|two.?factor)/i.test(message);
    const overlay = document.createElement('div');
    overlay.className = 'aw-prompt-overlay';
    const box = document.createElement('div');
    box.className = 'aw-prompt';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const heading = document.createElement('div');
    heading.className = 'aw-prompt-heading';
    const icon = document.createElement('span');
    icon.className = 'aw-prompt-icon';
    icon.innerHTML = `<i class="fas ${isSteamGuard ? 'fa-shield-alt' : 'fa-keyboard'}"></i>`;
    const copy = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'aw-prompt-title';
    title.textContent = isSteamGuard ? 'Steam Guard' : t('input-required', 'Input required', 'Saisie requise');
    const label = document.createElement('div');
    label.className = 'aw-prompt-description';
    label.textContent = isSteamGuard
      ? t('enter-the-code-sent-by-email-to-confirm-the-steam-login', 'Enter the code sent by email to confirm the Steam login.', 'Saisis le code reçu par e-mail pour confirmer la connexion Steam.')
      : message;
    copy.append(title, label);
    heading.append(icon, copy);
    const input = document.createElement('input');
    input.type = type;
    input.value = defaultValue;
    input.className = `aw-prompt-input${isSteamGuard ? ' code' : ''}`;
    if (isSteamGuard) {
      input.maxLength = 10;
      input.autocomplete = 'one-time-code';
      input.spellcheck = false;
      input.setAttribute('aria-label', t('steam-guard-code', 'Steam Guard code', 'Code Steam Guard'));
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\s+/g, '').toUpperCase();
      });
    }
    const row = document.createElement('div');
    row.className = 'aw-prompt-actions';
    const cancel = document.createElement('button');
    cancel.className = 'aw-prompt-button secondary';
    cancel.textContent = t('cancel', 'Cancel', 'Annuler');
    const ok = document.createElement('button');
    ok.className = 'aw-prompt-button primary';
    ok.textContent = t('confirm', 'Confirm', 'Valider');
    row.append(cancel, ok);
    box.append(heading, input, row);
    overlay.append(box);
    document.body.append(overlay);
    input.focus();
    input.select();
    const done = (val) => {
      overlay.remove();
      resolve(val);
    };
    cancel.onclick = () => done(null);
    ok.onclick = () => done(input.value.trim() || null);
    overlay.onmousedown = (ev) => {
      if (ev.target === overlay) done(null);
    };
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') ok.click();
      else if (ev.key === 'Escape') cancel.click();
    };
  });
}
// Share the modal with the Steam-login test and emulator setup prompts.
window.awPromptText = promptText;

// These emulator sources already provide local artwork paths.
const EMU_LOCAL_ICON_SOURCES = new Set(['RPCS3 Emulator', 'ShadPS4 Emulator', 'Xenia Emulator']);

async function downloadLibraryCover(url, cacheAppid) {
  if (!url) return { path: null, source: null, reason: 'missing' };
  try {
    const local = await ipcRenderer.invoke('fetch-icon', url, cacheAppid);
    return local && local !== url ? { path: local, source: url, reason: null } : { path: null, source: url, reason: 'failed' };
  } catch {
    return { path: null, source: url, reason: 'failed' };
  }
}

async function recoverLibraryCover(game, orientation, { force = false } = {}) {
  const identity = String((game && (game.steamappid || game.appid)) || game?.name || '');
  if (!identity) return { path: null, reason: 'missing' };
  const key = `${orientation}:${identity}`;
  if (force) coverRecoveryCache.delete(key);
  if (!coverRecoveryCache.has(key)) {
    const pending = (async () => {
      const cacheAppid = game.steamappid || game.appid;
      const steamAppid = /^\d+$/.test(String(cacheAppid || '')) ? String(cacheAppid) : '';
      let failure = false;
      let networkUnavailable = false;

      // Steam is both authoritative and cheaper. A successful HEAD probe is not enough: only stop
      // when fetch-icon has actually cached a usable file, otherwise continue to SteamGridDB.
      if (steamAppid) {
        const steamResult = await ipcRenderer
          .invoke('get-steam-cdn-covers-status', steamAppid, orientation)
          .catch(() => ({ urls: [], networkError: true }));
        networkUnavailable = steamResult.networkError === true;
        failure = failure || networkUnavailable;
        const steamUrls = steamResult.urls;
        for (const url of Array.isArray(steamUrls) ? steamUrls : []) {
          const result = await downloadLibraryCover(url, cacheAppid);
          if (result.path) return result;
          // A candidate url that does not download is an absent asset. Most games have no 920x430
          // grid and no hashed capsule, so counting those as failures told every second tile to
          // tell the user to check a connection that was working perfectly.
        }
      }

      // SteamDB knows about hashed store assets that the guessable Steam CDN paths cannot derive.
      // Keep it in the same ordered chain as the picker: only reach it after Steam's own candidates
      // are absent or failed, and only continue to SteamGridDB when the SteamDB downloads also fail.
      if (steamAppid && !networkUnavailable) {
        const steamdbUrls = await ipcRenderer
          .invoke('get-cover-options-steamdb', { orientation, steamAppid })
          .catch(() => []);
        for (const url of Array.isArray(steamdbUrls) ? steamdbUrls : []) {
          const result = await downloadLibraryCover(url, cacheAppid);
          if (result.path) return result;
        }
      }

      if (!networkUnavailable) {
        const gridResult = await ipcRenderer
          .invoke('get-steamgriddb-cover-status', game.name || '', steamAppid, orientation)
          .catch(() => ({ url: null, networkError: true }));
        failure = failure || gridResult.networkError === true;
        const gridUrl = gridResult.url;
        if (gridUrl) {
          const result = await downloadLibraryCover(gridUrl, cacheAppid);
          if (result.path) return result;
        }
      }
      return { path: null, source: null, reason: failure ? 'failed' : 'missing' };
    })();
    coverRecoveryCache.set(key, pending);
    /*
      Only an answer is worth remembering. A recovery that failed because the network was down (or
      a breaker was open) used to be memoised for the whole session, so a tile that lost its cover
      during one bad minute stayed blank until the app was restarted - even after the connection
      came back and the user pressed Retry. Drop those, and keep the ones that concluded something.
    */
    pending
      .then((result) => {
        if (result && !result.path && result.reason === 'failed') coverRecoveryCache.delete(key);
      })
      .catch(() => coverRecoveryCache.delete(key));
  }
  return coverRecoveryCache.get(key);
}

// The glossy sweep belongs on a cover of the tile's own shape only: stretched over a cross-shape
// fallback it reads as a smear instead of a highlight.
function hasOwnShapeCover(image, portrait) {
  if (!image) return false;
  return Boolean(portrait ? image.portrait : image.header || image.landscape);
}

// All density modes share one tile. Only portrait changes the artwork orientation, so this helper
// also lets the toolbar repaint covers without rescanning the whole library.
function scheduleLibraryCover(game, headerEl, portrait) {
  if (!game || !headerEl || !headerEl.length) return;
  const image = game.img || {};
  const isPortrait = portrait && image.portrait;
  headerEl.toggleClass('glow', hasOwnShapeCover(image, portrait)).toggleClass('portrait-fallback', Boolean(portrait && !isPortrait));

  const load = async (force = false) => {
    if (!headerEl[0]?.isConnected) return;
    const generation = artworkLoadGeneration;
    const tileOrientation = portrait ? 'portrait' : 'landscape';
    if (force) {
      headerEl.css('background', 'none');
      setLibraryArtworkFeedback(headerEl, 'clear');
    }
    const coverOverride = coverOverrideFor(game.appid, tileOrientation);
    if (coverOverride) {
      if (!/^https?:\/\//i.test(coverOverride)) {
        headerEl.toggleClass('portrait-fallback', false).addClass('glow').css('background', cssUrl(coverOverride));
        setLibraryArtworkFeedback(headerEl, 'clear');
        return;
      }
      const local = await ipcRenderer.invoke('fetch-icon', coverOverride, game.steamappid || game.appid).catch(() => null);
      if (generation !== artworkLoadGeneration) return;
      if (!local || local === coverOverride) {
        // A dead custom URL must not permanently mask the normal artwork chain. Remove only the
        // override, then let Steam -> SteamDB -> SteamGridDB recover a usable replacement.
        coverStore.remove(game.appid, tileOrientation);
        reloadCoverOverrides();
        debug.warn(`[cover] custom override failed for ${game.appid}; trying provider fallbacks`);
      } else {
        // Keep the source URL in covers.db; the downloaded file remains disposable steam_cache data.
        const stored = coverStore.persist(game.appid, coverOverride, getUserDataPath(), tileOrientation);
        if (!stored) {
          setLibraryArtworkFeedback(headerEl, 'failed', () => load(true));
          return;
        }
        reloadCoverOverrides();
        headerEl
          .toggleClass('portrait-fallback', false)
          .addClass('glow')
          .css('background', cssUrl(local));
        setLibraryArtworkFeedback(headerEl, 'clear');
        return;
      }
    }
    if (EMU_LOCAL_ICON_SOURCES.has(game.source)) {
      if (image.header) {
        headerEl.toggleClass('glow', !portrait).css('background', cssUrl(image.header));
        setLibraryArtworkFeedback(headerEl, 'clear');
      } else {
        headerEl.removeClass('glow').css('background', 'none');
        setLibraryArtworkFeedback(headerEl, 'missing', () => load(true));
      }
      return;
    }

    // First pass: only art of the tile's own shape. Anything else waits until recovery has had its
    // turn, so a wide capsule never settles into a portrait tile while a real cover is one lookup
    // away (and never the reverse in the landscape grid).
    const imgName = portrait ? image.portrait : image.header || image.landscape;
    const applied = await applyCoverWithFallback(game, headerEl, imgName, tileOrientation, undefined, generation, { sameShapeOnly: true });
    if (generation !== artworkLoadGeneration) return;
    if (!headerEl[0]?.isConnected) return;
    const currentModeIsPortrait = libraryLayout.isPortrait(app.config?.achievement?.libraryLayout);
    if (portrait !== currentModeIsPortrait) return;
    if (applied.ok) {
      headerEl.toggleClass('portrait-fallback', false).addClass('glow');
      setLibraryArtworkFeedback(headerEl, 'clear');
      return;
    }
    const recovered = await recoverLibraryCover(game, tileOrientation, { force });
    if (generation !== artworkLoadGeneration) return;
    if (!headerEl[0]?.isConnected) return;
    if (portrait !== libraryLayout.isPortrait(app.config?.achievement?.libraryLayout)) return;
    if (recovered.path) {
      // Keep the provider URL in the in-memory schema too. The file is only a disposable preview
      // under steam_cache and must not become the next scan's source after a cache clear.
      if (portrait) image.portrait = recovered.source || recovered.path;
      else image.header = recovered.source || recovered.path;
      headerEl.toggleClass('portrait-fallback', false).addClass('glow').css('background', cssUrl(recovered.path));
      setLibraryArtworkFeedback(headerEl, 'clear');
      return;
    }
    /*
      Last resort. No art of the right shape exists anywhere, so the choice is now between the wrong
      shape and an empty tile - and a recognisable cover, marked as a fallback so the grid styles it
      rather than stretching it, beats a blank rectangle.
    */
    const crossShape = await applyCoverWithFallback(game, headerEl, imgName, tileOrientation, undefined, generation);
    if (generation !== artworkLoadGeneration) return;
    if (!headerEl[0]?.isConnected) return;
    if (portrait !== libraryLayout.isPortrait(app.config?.achievement?.libraryLayout)) return;
    if (crossShape.ok) {
      headerEl.removeClass('glow');
      if (portrait) headerEl.addClass('portrait-fallback');
      setLibraryArtworkFeedback(headerEl, 'clear');
      return;
    }
    // 'failed' now means exactly one thing: a source reported that it could not be reached. Anything
    // else - no capsule on the CDN, no grid on SteamGridDB, a 404 on a guessed url - is "no artwork
    // found", which is the truth and does not send the user to check a working connection.
    setLibraryArtworkFeedback(headerEl, recovered.reason === 'failed' ? 'failed' : 'missing', () => load(true));
  };

  libraryArtwork.schedule(headerEl[0], () =>
    load(false).catch((err) => {
      if (!headerEl[0]?.isConnected) return;
      debug.warn(`[cover] artwork load failed for ${game.appid} => ${err.message || err}`);
      setLibraryArtworkFeedback(headerEl, 'failed', () => load(true));
    })
  );
}

function refreshLibraryCovers(mode) {
  libraryArtwork.disconnect();
  libraryArtwork = createViewportWork();
  const portrait = libraryLayout.isPortrait(mode);
  for (const game of gameList) {
    const element = gameElements.get(String(game && game.appid));
    if (element) scheduleLibraryCover(game, $(element).find('.header').first(), portrait);
  }
}

function gameHasAchievements(game) {
  return !!(game && game.achievement && Number(game.achievement.total) > 0);
}

// Legitimate Steam-library entries already have a Steam appid; do not add a source badge.
function isLegitSteamLibraryGame(game) {
  return String((game && game.source) || '').startsWith('Steam (');
}

/*
  ONE table: an unrecognised label falls through silently to the Steam badge, so a too-narrow or
  too-loose pattern ships a wrong badge unnoticed. Ubisoft is absent on purpose (isUbisoftGame()
  decides it separately). Every `source:` literal in app/parser/*.js must appear here or in
  STEAM_BADGE_SOURCES below - test/parsers/libraryDetectionFixes.test.js enforces it.
*/
const SOURCE_BADGE = {
  playstation: /^(?:rpcs3 emulator|shadps4 emulator)$/,
  xbox: /^xenia emulator$/,
  epic: /^epic(?:-official)?$/,
  gog: /^(?:gog|gog galaxy)$/,
  socialclub: /^goldberg socialclub$/,
  ea: /^ea$/,
};

/*
  Labels that legitimately end on the Steam badge: Steam games seen through an emulator or crack,
  and the placeholder records. Listing them is what makes the coverage test meaningful - without it
  "falls through to Steam" would swallow genuinely unclassified labels too.
*/
const STEAM_BADGE_SOURCES =
  /^(?:achievement watcher : watchdog|ali213|codex|creamapi|empress|gbe fork|goldberg(?: steamemu| \(empress\))?|greenluma|hoodlum|manual|onlinefix|razor1911|reloaded - 3dm|rld!|rune|skidrow|smartsteamemu|steam|steam-emulator|tenoke|unconfigured|universelan)$/;

function sourcePresentationFor(game) {
  const source = game && game.source;
  const sourceLower = String(source || '').toLowerCase();
  const system = String((game && game.system) || '').toLowerCase();
  const isUbisoft = uplayR2.isUbisoftGame(game, game && game.appid);

  if (isLegitSteamLibraryGame(game)) {
    return { img: '', label: '', kind: 'steam-hidden' };
  }

  if (!gameHasAchievements(game)) {
    if (isUbisoft) {
      return {
        img: getSourceImg('ubisoft'),
        label: t('ubisoft-game-no-achievements-found', 'Ubisoft game - no achievements found', 'Jeu Ubisoft - aucun succès trouvé'),
        kind: 'ubisoft-empty',
      };
    }
    if (game && game.manual && (system === 'playstation' || system === 'xbox')) {
      const isPlayStation = system === 'playstation';
      return {
        img: getSourceImg(isPlayStation ? 'RPCS3 Emulator' : 'Xenia Emulator'),
        label: t('achievements-not-available', 'No achievements', 'Pas de succès'),
        kind: `${system}-empty`,
      };
    }
    return {
      img: getSourceImg('Unconfigured'),
      label: t('no-achievements-found', 'No achievements found', 'Aucun succès trouvé'),
      kind: 'empty',
    };
  }

  // `system` overrides the label: a manually added console game carries no platform source.
  const kind =
    system === 'playstation' || system === 'xbox' || system === 'ea'
      ? system
      : Object.keys(SOURCE_BADGE).find((name) => SOURCE_BADGE[name].test(sourceLower)) || (isUbisoft ? 'ubisoft' : '');

  switch (kind) {
    case 'playstation':
      return {
        img: getSourceImg(source === 'ShadPS4 Emulator' ? source : 'RPCS3 Emulator'),
        label: t('playstation-trophies', 'PlayStation trophies', 'Succès PlayStation'),
        kind,
      };
    case 'xbox':
      return { img: getSourceImg('Xenia Emulator'), label: t('xbox-achievements', 'Xbox achievements', 'Succès Xbox'), kind };
    case 'epic':
      return { img: getSourceImg('epic'), label: t('epic-games-achievements', 'Epic Games achievements', 'Succès Epic Games'), kind };
    case 'gog':
      return { img: getSourceImg('gog'), label: t('gog-achievements', 'GOG achievements', 'Succès GOG'), kind };
    case 'socialclub':
      return {
        img: getSourceImg('Goldberg SocialClub'),
        label: t('social-club-achievements', 'Social Club achievements', 'Succès Social Club'),
        kind,
      };
    case 'ubisoft':
      return { img: getSourceImg('ubisoft'), label: t('ubisoft-connect-achievements', 'Ubisoft Connect achievements', 'Succès Ubisoft Connect'), kind };
    case 'ea':
      return { img: getSourceImg('ea'), label: t('ea-app-achievements', 'EA app achievements', 'Succès EA app'), kind };
    default:
      break;
  }

  return { img: getSourceImg(source), label: t('steam-achievements', 'Steam achievements', 'Succès Steam'), kind: 'steam' };
}

function dllPresentationFor(game) {
  const present = !!(game && game.hasSteamApiDll);
  return {
    present,
    label: present
      ? t('steam-api-64-dll-detected', 'steam_api(64).dll detected', 'steam_api(64).dll détecté')
      : t('steam-api-64-dll-not-found', 'steam_api(64).dll not found', 'steam_api(64).dll introuvable'),
  };
}

function normalizePathKey(value) {
  return path.resolve(String(value || '')).toLowerCase();
}

function isPathInsideDir(value, root) {
  if (!value || !root) return false;
  const childKey = normalizePathKey(value);
  const rootKey = normalizePathKey(root);
  return childKey === rootKey || childKey.startsWith(rootKey + path.sep);
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function gbeBackupIndexFile() {
  return path.join(getUserDataPath(), 'cfg/gbe-backups.db');
}

function automaticGbeBackupRoot() {
  return path.join(getUserDataPath(), 'backups', 'gbe');
}

function readGbeBackupIndex() {
  const data = readJsonFile(gbeBackupIndexFile(), []);
  return Array.isArray(data) ? data : [];
}

function writeGbeBackupIndex(entries) {
  const file = gbeBackupIndexFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8');
}

function backupManifestFor(backupDir) {
  const manifest = readJsonFile(path.join(backupDir || '', 'backup.json'), null);
  if (!manifest || !Array.isArray(manifest.files) || !manifest.gameDir) return null;
  return manifest;
}

function rememberGbeBackup({ appid, gameDir, backupDir, manifest }) {
  try {
    const resolvedBackup = path.resolve(backupDir);
    const entries = readGbeBackupIndex().filter((entry) => entry && normalizePathKey(entry.backupDir) !== normalizePathKey(resolvedBackup));
    entries.push({
      appid: String(appid || ''),
      gameDir: path.resolve(gameDir),
      backupDir: resolvedBackup,
      createdAt: (manifest && manifest.createdAt) || new Date().toISOString(),
    });
    writeGbeBackupIndex(entries.slice(-80));
  } catch (err) {
    debug.log(`[gbe-backup] could not remember backup => ${formatErr(err)}`);
  }
}

function createAutomaticGbeBackup({ appid, gameDir, steamSettings } = {}) {
  try {
    const localSteamSettings = isPathInsideDir(steamSettings, gameDir) ? steamSettings : null;
    const result = goldberg.backupSetup({
      gameDir,
      steamSettings: localSteamSettings,
      destinationRoot: automaticGbeBackupRoot(),
    });
    rememberGbeBackup({
      appid,
      gameDir,
      backupDir: result.backupDir,
      manifest: result.manifest,
    });
    debug.log(`[${appid || '?'}] GBE/Goldberg pre-fix backup created => ${result.backupDir}`);
    return { ...result, skipped: false };
  } catch (err) {
    const message = formatErr(err);
    if (/no steam_settings or Steam API DLL was found/i.test(message)) {
      debug.log(`[${appid || '?'}] GBE/Goldberg pre-fix backup skipped (${message})`);
      return { skipped: true, reason: message };
    }
    throw new Error(`backup before emulator fix failed: ${message}`);
  }
}

function backupCandidateFromDir(backupDir, { appid, gameDir, source = 'scan', indexedAppid = null } = {}) {
  try {
    if (!backupDir || !fs.existsSync(backupDir)) return null;
    const manifest = backupManifestFor(backupDir);
    if (!manifest) return null;
    const sameGameDir = normalizePathKey(manifest.gameDir) === normalizePathKey(gameDir);
    const sameIndexedAppid = indexedAppid && String(indexedAppid) === String(appid);
    if (!sameGameDir && !sameIndexedAppid) return null;
    const stat = fs.statSync(backupDir);
    const createdAt = manifest.createdAt || stat.mtime.toISOString();
    return { backupDir: path.resolve(backupDir), manifest, createdAt, source };
  } catch {
    return null;
  }
}

function scanBackupRoot(root, game) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  const push = (dir) => {
    const candidate = backupCandidateFromDir(dir, { appid: game.appid, gameDir: game.gameDir, source: 'scan' });
    if (candidate) out.push(candidate);
  };
  push(root);
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) push(path.join(root, entry.name));
  }
  return out;
}

function findLatestGbeBackup(game) {
  if (!game || !game.gameDir) return null;
  const candidates = [];
  for (const entry of readGbeBackupIndex()) {
    if (!entry || !entry.backupDir) continue;
    const candidate = backupCandidateFromDir(entry.backupDir, {
      appid: game.appid,
      gameDir: game.gameDir,
      source: 'index',
      indexedAppid: entry.appid,
    });
    if (candidate) candidates.push(candidate);
  }

  const roots = [];
  const addRoot = (root) => {
    if (!root) return;
    const key = normalizePathKey(root);
    if (!roots.some((existing) => normalizePathKey(existing) === key)) roots.push(root);
  };
  try {
    addRoot(remote.app.getPath('documents'));
  } catch {}
  try {
    addRoot(automaticGbeBackupRoot());
  } catch {}
  try {
    addRoot(path.dirname(game.gameDir));
  } catch {}
  for (const entry of readGbeBackupIndex()) {
    try {
      addRoot(path.dirname(entry.backupDir));
    } catch {}
  }
  for (const root of roots) candidates.push(...scanBackupRoot(root, game));

  const unique = new Map();
  for (const candidate of candidates) unique.set(normalizePathKey(candidate.backupDir), candidate);
  return [...unique.values()].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0] || null;
}

function formatGbeBackupDetail(backup, game) {
  const lines = [];
  if (game?.gameDir) lines.push(`${t('game', 'Game', 'Jeu')}: ${game.gameDir}`);
  if (backup?.backupDir) lines.push(`${t('backup', 'Backup', 'Sauvegarde')}: ${backup.backupDir}`);
  if (backup?.createdAt) {
    const created = intlFormat.formatDateTime(backup.createdAt, uiLang(), { dateStyle: 'short', timeStyle: 'short' });
    if (created) lines.push(`${t('created', 'Created', 'Créée')}: ${created}`);
  }
  if (backup?.manifest?.gameDir && game?.gameDir && normalizePathKey(backup.manifest.gameDir) !== normalizePathKey(game.gameDir)) {
    lines.push(`${t('original-folder', 'Original folder', 'Dossier d’origine')}: ${backup.manifest.gameDir}`);
  }
  if (backup?.source && backup.source !== 'manual') {
    const source = backup.source === 'index' ? (t('aw-history', 'AW history', 'historique AW')) : t('disk-scan', 'disk scan', 'scan disque');
    lines.push(t('found-automatically-via-x', 'Found automatically via {source}.', 'Trouvée automatiquement via {source}.', { source }));
  }
  return lines.join('\n');
}

// Return the title-bar shadow root when the custom element is ready.
function titleBarShadow() {
  const bar = document.querySelector('title-bar');
  return (bar && bar.shadowRoot) || null;
}

// The icon is built here rather than shipped inside the locale value: a translated string must
// never carry markup, and this element is filled from user-facing text.
function setStartWatchdogButton(button, label) {
  button.textContent = '';
  button.hidden = !label;
  if (!label) return;
  const icon = document.createElement('i');
  icon.className = 'fas fa-shield-alt';
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon, ' ', label);
}

/*
  The status reads "<state> | <what that means>". Both halves are locale keys and the separator is
  drawn in CSS, so no language has to carry punctuation or markup - and the detail can be dropped on
  a narrow window without touching the state.
*/
function setWatchdogStatus(label, state, detail) {
  label.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = state;
  label.append(strong);
  if (!detail) return;
  const span = document.createElement('span');
  span.className = 'status-detail';
  span.textContent = detail;
  label.append(span);
}

// A manual restart was asked for: show the transient state immediately rather than leaving the old
// one on screen until the next 5s poll. renderWatchdogStatus owns the markup, so the reset cannot
// drift from what the poll paints.
ipcRenderer.on('reset-watchdog-status', () => {
  lastWatchdogState = 'starting';
  renderWatchdogStatus(lastWatchdogState);
});

/*
  Accessible names that have to be derived rather than authored: the Settings rows label their
  control with a neighbouring <span> instead of a <label> (the panel's i18n is positional, so the
  markup cannot change), and the Font Awesome glyphs are decorative everywhere in this app. Re-run
  whenever a language is applied, since the names come from the translated row labels.
*/
window.refreshAccessibleNames = () => {
  $('#search-bar input[type=search]').attr('aria-label', t('search-games', 'Search games…', 'Rechercher un jeu…'));
  $('#settings .arrow-list li').each(function () {
    const label = $(this).children('.left').text().trim();
    if (!label) return;
    $(this).find('.right').find('select, input').each(function () {
      // Only ever rewrite names this function owns, so an authored aria-label survives.
      if (this.getAttribute('aria-label') && !this.dataset.derivedLabel) return;
      this.setAttribute('aria-label', label);
      this.dataset.derivedLabel = '1';
    });
  });
  markDecorativeIcons(document);
};

// Every Font Awesome glyph in this app is decorative - it always sits beside its own text or inside
// a labelled control. Rows are built at runtime (folders, blacklist, presets, game tiles), so an
// observer keeps marking them instead of each template having to remember.
function markDecorativeIcons(root) {
  for (const icon of root.querySelectorAll('i[class*="fa-"]:not([aria-hidden])')) icon.setAttribute('aria-hidden', 'true');
}

new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches('i[class*="fa-"]') && !node.hasAttribute('aria-hidden')) node.setAttribute('aria-hidden', 'true');
      markDecorativeIcons(node);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

/*
  The four states the main process can report. 'unresponsive' is the one the old up/down probe
  could not see: the process is alive but its event loop stopped, so it offers a restart (a wedged
  child must be killed first, see restartWatchdog in electron/init.js) rather than a start. Colours
  reuse the title bar's three palette tokens; the pulse alone separates 'starting' from 'unresponsive'.
*/
function watchdogPresentation(state) {
  switch (state) {
    case 'running':
      return {
        dot: 'status-green',
        pulse: false,
        label: t('watchdog-running', 'Watchdog active', 'Watchdog actif'),
        detail: t('watchdog-running-detail', 'Game and achievement tracking operational', 'Suivi des jeux et des succès opérationnel'),
        button: '',
      };
    case 'starting':
      return {
        dot: 'status-orange',
        pulse: true,
        label: t('watchdog-starting', 'Watchdog starting…', 'Démarrage du Watchdog…'),
        detail: t('watchdog-starting-detail', 'Tracking begins in a moment', 'Le suivi démarre dans un instant'),
        button: '',
      };
    case 'unresponsive':
      return {
        dot: 'status-orange',
        pulse: false,
        label: t('watchdog-unresponsive', 'Watchdog not responding', 'Watchdog ne répond pas'),
        detail: t('watchdog-unresponsive-detail', 'It is running but has stopped reporting', 'Il tourne mais ne répond plus'),
        button: t('restart-watchdog', 'Restart Watchdog', 'Redémarrer le Watchdog'),
      };
    default:
      return {
        dot: 'status-red',
        pulse: false,
        label: t('watchdog-stopped', 'Watchdog stopped', 'Watchdog arrêté'),
        detail: t('watchdog-stopped-detail', 'No in-game overlay or notifications', 'Ni overlay en jeu ni notifications'),
        button: t('start-watchdog', 'Start Watchdog', 'Démarrer le Watchdog'),
      };
  }
}

// The status is always on screen but is only pushed by the monitor poll, so a language change has
// to repaint it from the last known state instead of waiting for the next tick.
let lastWatchdogState = null;
function renderWatchdogStatus(state) {
  let shadow = titleBarShadow();
  if (!shadow) return;
  let watchdogStatus = shadow.querySelector('.status-dot');
  const view = watchdogPresentation(state);

  watchdogStatus.classList.remove('status-green', 'status-orange', 'status-red');
  watchdogStatus.classList.add(view.dot);
  watchdogStatus.classList.toggle('status-pulse', view.pulse);
  setWatchdogStatus(shadow.querySelector('.status-text'), view.label, view.detail);
  setStartWatchdogButton(shadow.querySelector('#start-watchdog'), view.button);
}

ipcRenderer.on('watchdog-status', (event, state) => {
  // Booleans are what this channel carried before the heartbeat existed; keep reading them so a
  // stale renderer never renders "stopped" for a healthy monitor.
  lastWatchdogState = typeof state === 'string' ? state : state ? 'running' : 'stopped';
  renderWatchdogStatus(lastWatchdogState);
});

// Repaint the title-bar status in the language that was just applied.
window.refreshWatchdogStatusText = () => {
  if (lastWatchdogState !== null) renderWatchdogStatus(lastWatchdogState);
};

ipcRenderer.on('achievement-unlock', (event, { appid, ach_data }) => {
  // Ignore toasts for games or achievements missing from the current view.
  const game = gameList.find((game) => game.appid == appid);
  if (!game) return;
  const achievement = game.achievement.list.find((ach) => ach.name == ach_data.name);
  if (!achievement) return;
  if (!achievement.Achieved) {
    achievement.Achieved = 1;
    achievement.UnlockTime = Date.now() / 1000;
    game.achievement.unlocked += 1;
    updateGameBox(appid, game.achievement.total > 0 ? Math.floor((game.achievement.unlocked / game.achievement.total) * 100) : 0);
  }
  updateGamePage(appid, ach_data);
});

// The achievement row to scroll to and flash the next time its game view renders. A toast carries
// the achievement in its activation URI, so a click on it should land on that row rather than on the
// top of the game page. Consumed exactly once: a request left pending would make every later game
// view hunt for a row belonging to a game the user has already navigated past.
let pendingAchievementFocus = null;

function setAchievementFocus(appid, name) {
  pendingAchievementFocus = appid && name ? { appid: String(appid), name: String(name) } : null;
}

// The achievement to focus for `appid`, clearing the request either way - a pending focus aimed at
// another game is stale by definition once a different game is on screen.
function takeAchievementFocus(appid) {
  const focus = pendingAchievementFocus;
  pendingAchievementFocus = null;
  return focus && focus.appid === String(appid) ? focus.name : '';
}

// Open the library tile targeted by a Windows toast click.
ipcRenderer.on('open-game', (event, { appid, achievement } = {}) => {
  if (!appid) return;
  const el = $('#game-list .game-box')
    .filter(function () {
      return String(this.dataset.appid) === String(appid);
    })
    .first();
  if (el.length && typeof app.onGameBoxClick === 'function') {
    debug.log(`[open-game] opening ${appid}${achievement ? ` (${achievement})` : ''}`);
    setAchievementFocus(appid, achievement);
    // Triggered rather than calling onGameBoxClick directly so the toast path is the same code a
    // real click runs: it also resets the achievement search box and records the tile for the
    // mouse "Forward" button, both bound as delegated handlers in ui/game.js.
    el.trigger('click');
  } else {
    debug.warn(`[open-game] no library tile for appid=${appid}`);
  }
});

function updateGamePage(appid, ach_data) {
  // Refresh details only when this game is already open.
  if (!$('#achievement').is(':visible')) return;
  if (String($('#achievement .wrapper > .header').attr('data-appid')) !== String(appid)) return;
  const el = gameElements.get(`${appid}`);
  if (!el) return;
  app.onGameBoxClick($(el), gameList);
}

function updateGameBox(appid, newProgress) {
  const gameEl = gameElements.get(`${appid}`);
  if (!gameEl) return;
  const progressBar = gameEl.querySelector('.progressBar');
  const meter = progressBar.querySelector('.meter');
  const value = progressBar.querySelector('.progress-value');
  meter.style.width = `${newProgress}%`;
  progressBar.dataset.percent = newProgress;
  if (value) value.textContent = formatPercentValue(newProgress);
}

// Auto-detect a launch executable from a known install folder.
function autodetectGameExe(gameDir, gameName, taken) {
  if (!gameDir) return null;
  try {
    const emu = goldberg.detectEmulator(gameDir);
    // Require strong evidence; otherwise let the user choose the executable.
    const exeInfo = exeDetect.detectConfident(gameDir, gameName || '', { dllPaths: emu.dll, taken });
    if (exeInfo?.full && fs.existsSync(exeInfo.full)) return exeInfo.full;
  } catch (err) {
    debug.log(err);
  }
  return null;
}

// Build the set of exe paths already claimed by appids other than `appid`, for anti-collision.
async function takenExePaths(appid) {
  try {
    const all = await exeList.list();
    return new Set(all.filter((e) => String(e.appid) !== String(appid) && e.exe).map((e) => e.exe));
  } catch {
    return new Set();
  }
}

var app = {
  args: getArgs(remote.process.argv),
  config: settings.load(),
  errorExit: function (err, message) {
    const text = message || t('unexpected-error-message', 'An unexpected error has occurred', 'Une erreur inattendue est survenue');
    remote.dialog.showMessageBoxSync({ type: 'error', title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'), message: `${text}`, detail: `${err}` });
    remote.app.quit();
  },
  onStart: function (options = {}) {
    let self = this;
    const activeScanScope = scanScope.normalizeScanScope(options && options.scanScope);
    const scanStartedAt = performance.now();
    let firstFreshTileAt = null;

    // Coalesce overlapping scans so streaming tiles are not duplicated.
    if (self.listLoadInFlight) {
      self.listRescanPending = true;
      // "Recheck achievement lists" must survive coalescing: carry the force into the follow-up pass.
      if (options && options.forceAchievementRecheck === true) self.listRescanForceRecheck = true;
      // A full refresh takes precedence over queued selective retries.
      if (!activeScanScope) self.listRescanScope = null;
      else if (self.listRescanScope !== null) self.listRescanScope = activeScanScope;
      return self.listLoadPromise || Promise.resolve();
    }
    self.listLoadInFlight = true;
    clearTimeout(self.listLoadGuardTimer);
    // Safety net: a makeList that rejects outright must never wedge the guard permanently.
    self.listLoadGuardTimer = setTimeout(() => {
      self.listLoadInFlight = false;
    }, 5 * 60 * 1000);

    // The main process may have promoted legacy cache-backed cover overrides while clearing caches.
    // Refresh this snapshot before rebuilding tiles so the renderer uses the new durable paths.
    reloadCoverOverrides();

    debug.log(`${remote.app.name} loading...`);

    // Arm background detection so newly-installed games are picked up (and registered with the
    // watchdog for playtime tracking) without the user having to manually refresh.
    scheduleNewGameScan();

    $('title-bar')[0].inSettings = true;

    l10n
      .load(self.config.achievement.lang)
      .then((locale) => {
        moment.locale(locale);
      })
      .catch((err) => {
        debug.log(err);
        app.errorExit(err, t('lang-load-failed', 'The interface language could not be loaded.', 'La langue de l’interface n’a pas pu être chargée.'));
      });

    $('#user-info .info .name').text(self.config.general.username || os.userInfo().username || '');

    let loadingElem = {
      elem: $('#main-footer .loading'),
      progress: $('#main-footer .loading .progressBar'),
      meter: $('#main-footer .loading .progressBar > .meter'),
    };
    // Reuse the loading footer during refreshes.
    $('#main-footer').removeClass('done');
    loadingElem.elem.show();
    // Show activity across the whole window while scanning.
    setLibraryBusyCursor(true);

    renderProfileStats(calculateLibraryStats([]));

    $('#search-bar input[type=search]').val('').change().blur();

    // Keep the profile summary in sync with the streamed list and active installed-only filter.
    sortOptions(); // reflect persisted sort state on the sort-box during load (real sort runs once at the end)
    $('#user-info').fadeTo('fast', 1).css('pointer-events', 'initial');
    $('#sort-box').fadeTo('fast', 1).css('pointer-events', 'initial');
    $('#search-bar').fadeTo('fast', 1).css('pointer-events', 'initial');
    $('title-bar')[0].inSettings = false;
    // A scoped refresh replaces only entries under the selected roots.
    const preserveExistingOnFailure = options && options.preserveExistingOnFailure === true;
    const previousGames = activeScanScope || preserveExistingOnFailure ? gameList.slice() : [];
    // First scan of the session: serve cached data immediately (no cover/description re-fetch per
    // game) so the library appears fast; details refresh themselves when opened.
    const fastStart = !self.hasCompletedFirstScan;
    // Settings > Advanced > "Check now" bypasses the 3-day achievement-recheck cooldown for this scan.
    const forceAchievementRecheck = options && options.forceAchievementRecheck === true;
    const scanConfig = activeScanScope
      ? { ...self.config, scanScope: activeScanScope, fastStart, forceAchievementRecheck }
      : { ...self.config, fastStart, forceAchievementRecheck };
    const snapshotReadStartedAt = performance.now();
    const knownGames = fastStart && !activeScanScope ? librarySnapshot.read(getUserDataPath(), scanConfig) : [];
    const snapshotReadMs = performance.now() - snapshotReadStartedAt;
    // Read the manual-unlock sidecar once for this scan. Applying it in the streamed callback makes
    // tile percentages and profile counters survive an app restart without doing sync I/O per game.
    const manualUnlockMap = (() => {
      const file = manualUnlock.sidecarFile();
      return file ? manualUnlock.readMap(file) : {};
    })();
    // How many tiles the grid was actually showing, which is not gameList.length: installed-only
    // hides part of the library, so a 200-game list can be three tiles on screen. Placeholders are a
    // promise about what is coming, so they have to be counted the way the grid is filtered. Read it
    // before the list is emptied.
    const previousVisibleCount = $('#game-list ul > li').filter(function () {
      return $(this).css('display') !== 'none';
    }).length;
    gameList = [];
    const gameListIndex = new Map();
    const freshRenderedAppids = new Set();
    // Reset the list and handlers so onStart() stays idempotent.
    $('#game-list ul').empty();
    clearSkeletonTiles();
    gameElements.clear();
    libraryArtwork.disconnect();
    libraryArtwork = createViewportWork();
    applyLibraryLayout(
      self.config.achievement.libraryLayout,
      self.config.achievement.thumbnailPortrait === true
    );
    applyPlayButtonVisibility(self.config.achievement.showPlayButton);
    $('#library-layout-select')
      .off('change.awLibraryLayout')
      .on('change.awLibraryLayout', function () {
        const previousMode = libraryLayout.normalize(
          self.config.achievement.libraryLayout,
          self.config.achievement.thumbnailPortrait === true
        );
        const nextMode = applyLibraryLayout($(this).val());
        self.config.achievement.libraryLayout = nextMode;
        self.config.achievement.thumbnailPortrait = libraryLayout.isPortrait(nextMode);
        if (libraryLayout.isPortrait(previousMode) !== libraryLayout.isPortrait(nextMode)) refreshLibraryCovers(nextMode);
        settings.save(self.config).catch((err) => debug.log(`library layout save failed: ${err}`));
      });
    // Remove only handlers owned by this scan.
    $('#game-list').off('.awLibrary');
    $('#game-config').off('click', '.edit').off('click', '.unlink');
    $('#btn-game-config-save').off('click');
    $('#btn-game-config-cancel, #game-config .overlay').off('click');
    const renderGame = (game, { fresh = true, deferStats = false } = {}) => {
          manualUnlock.applyToGame(game, manualUnlockMap, game.appid, game.source);
          if (game.achievement.unlocked > 0 || self.config.achievement.hideZero == false) {
            const appidKey = String(game.appid);
            if (fresh && freshRenderedAppids.has(appidKey)) {
              debug.log(`[${game.appid}] duplicate streamed tile ignored`);
              return;
            }
            if (fresh) {
              freshRenderedAppids.add(appidKey);
              if (firstFreshTileAt === null) {
                firstFreshTileAt = performance.now();
                if (isDev)
                  debug.log(
                    `[perf] first fresh library tile in ${(firstFreshTileAt - scanStartedAt).toFixed(1)}ms (${firstFreshTileAt.toFixed(0)}ms after page start)`
                  );
              }
            }
            const existingIndex = gameListIndex.has(appidKey) ? gameListIndex.get(appidKey) : -1;
            const listIndex = existingIndex >= 0 ? existingIndex : gameList.length;
            const knownGame = existingIndex >= 0 ? gameList[existingIndex] : null;
            if (fresh && game.provisional && knownGame && !knownGame.provisional) {
              Object.assign(game, librarySnapshot.mergeKnownGame(game, knownGame));
              manualUnlock.applyToGame(game, manualUnlockMap, game.appid, game.source);
            }
            const stopBuild = perfTrace.start('tile:build');
            const hasAchievements = Number(game.achievement.total) > 0;
            let progress = hasAchievements ? Math.round((100 * game.achievement.unlocked) / game.achievement.total) : 0;
            const progressLabel = !hasAchievements
              ? t('achievements-not-available', 'No achievements', 'Pas de succès')
              : formatPercentValue(progress);

            const achievementList = Array.isArray(game.achievement.list) ? game.achievement.list : [];
            const latestUnlock = achievementList.reduce((latest, achievement) => {
              const unlockTime = Number(achievement && achievement.UnlockTime);
              if (!achievement || !achievement.Achieved || !Number.isFinite(unlockTime) || unlockTime <= 0) return latest;
              return !latest || unlockTime > Number(latest.UnlockTime) ? achievement : latest;
            }, null);
            const timeMostRecent = latestUnlock ? Number(latestUnlock.UnlockTime) : 0;

            // One registry read supplies both the activity row and the "recently played" sort.
            const stopPlaytimeRead = perfTrace.start('tile:playtime');
            const playtime = PlaytimeTracking.readSync(game.appid);
            stopPlaytimeRead();
            const lastPlayed = Number(playtime.lastplayed) || 0;
            const totalPlaytime = Number(playtime.playtime) || 0;

            // Read the live value because a scan can still be streaming while the toolbar view is
            // changed; newly arriving tiles must use the same orientation as those already shown.
            const portrait = libraryLayout.isPortrait(self.config.achievement.libraryLayout);
            const sourceIcon = sourcePresentationFor(game);
            const dllIcon = typeof game.hasSteamApiDll === 'boolean' ? dllPresentationFor(game) : null;
            const hideSteamBadges = sourceIcon.kind === 'steam-hidden';
            const recentUnlockText = !hasAchievements
              ? progressLabel
              : latestUnlock
                ? latestUnlock.displayName || localeText('unlocked')
                : localeText('noneUnlocked');
            const recentUnlockTime = libraryRelativeTime(timeMostRecent);
            const lastPlayedTime = libraryRelativeTime(lastPlayed);
            const playtimeText = libraryPlaytime(totalPlaytime);
            const neverPlayedText = localeText('neverPlayed');
            const achievementSummaryText = hasAchievements
              ? `${formatCount(game.achievement.unlocked)} / ${formatCount(game.achievement.total)}`
              : progressLabel;
            // Accessible names for the three icon-only controls on a tile.
            const tileLabels = {
              play: t('launch-game', 'Launch game', 'Lancer le jeu'),
              achievements: localeText('achievements'),
              health: t('game-health-title', 'Game health', 'État du jeu'),
              achievementDate: localeText('latestAchievementEarned'),
              lastPlayed: localeText('sort.tooltip.played'),
              playtime: localeText('settings.notification.test.playtime'),
              staleOwnership: t('steam-stale-badge', 'No longer in your Steam library', 'Plus dans ta bibliothèque Steam'),
              familyOwnership: t('steam-family-badge', 'Shared with you through Steam Family', 'Partagé avec toi via la famille Steam'),
            };
            const ownershipLabel =
              game.ownership === 'stale' ? tileLabels.staleOwnership : game.ownership === 'family' ? tileLabels.familyOwnership : '';
            let template = `
            <li>
                <div class="game-box" data-index="${listIndex}" data-appid="${game.appid}" data-progress="${hasAchievements ? progress : -1}" data-installed="${
              game.installed ? 1 : 0
            }" data-ownership="${escapeHtml(game.ownership || '')}" data-time="${
              timeMostRecent > 0 ? timeMostRecent : 0
            }" data-lastplayed="${lastPlayed}" ${
              game.system ? `data-system="${game.system}"` : ''
            }>
                  <div class="loading-overlay"><div class="content"><i class="fas fa-spinner fa-spin"></i></div></div>
                  <div class="header ${hasOwnShapeCover(game.img, portrait) ? 'glow' : ''}" id="game-header-${game.appid}">
                  <button type="button" class="play-button" aria-label="${escapeHtml(tileLabels.play)}"><i class="fas fa-play" aria-hidden="true"></i></button>
                  </div>

                  <button type="button" class="achievement-button" title="${escapeHtml(tileLabels.achievements)}" aria-label="${escapeHtml(tileLabels.achievements)}">
                    <i class="fas fa-trophy" aria-hidden="true"></i>
                  </button>

                  <button type="button" class="config-button" title="${escapeHtml(tileLabels.health)}" aria-label="${escapeHtml(tileLabels.health)}">
                    <i class="fas fa-tools" aria-hidden="true"></i>
                  </button>

                  <div class="info">
                    <div class="info-head">
                      <div class="title library-scroll-text" title="${escapeHtml(game.name)}"><span class="library-scroll-content">${escapeHtml(
                        game.name
                      )}</span></div>
                      <div class="game-meta">
                        ${
                          dllIcon && !hideSteamBadges
                            ? `<span class="dll-badge ${dllIcon.present ? 'present' : 'missing'}" title="${escapeHtml(
                                dllIcon.label
                              )}" role="img" aria-label="${escapeHtml(dllIcon.label)}"></span>`
                            : ''
                        }
                        ${
                          ownershipLabel
                            ? `<span class="ownership-badge ${game.ownership}" title="${escapeHtml(
                                ownershipLabel
                              )}" role="img" aria-label="${escapeHtml(ownershipLabel)}"></span>`
                            : ''
                        }
                        ${
                          sourceIcon.img
                            ? `<img class="source-icon" src="${sourceIcon.img}" data-kind="${escapeHtml(sourceIcon.kind)}" title="${escapeHtml(
                                sourceIcon.label
                              )}" alt="${escapeHtml(sourceIcon.label)}" aria-label="${escapeHtml(sourceIcon.label)}">`
                            : ''
                        }
                      </div>
                    </div>
                    <div class="progressBar${!hasAchievements ? ' unavailable' : ''}" data-percent="${progress}"><span class="meter" style="width:${progress}%"></span><span class="progress-value library-scroll-text" title="${escapeHtml(
                      progressLabel
                    )}"><span class="library-scroll-content">${escapeHtml(
                      progressLabel
                    )}</span></span></div>
                    <div class="library-details${hasAchievements ? '' : ' no-achievements'}">
                      <span class="library-achievement-summary" data-label="${escapeHtml(tileLabels.achievements)}" title="${escapeHtml(tileLabels.achievements)}"><i class="fas fa-trophy" aria-hidden="true"></i><span class="library-scroll-text" title="${escapeHtml(
                        achievementSummaryText
                      )}"><span class="library-scroll-content">${escapeHtml(achievementSummaryText)}</span></span></span>
                      <span class="library-recent-unlock${latestUnlock ? '' : ' is-empty'}" data-label="${escapeHtml(tileLabels.achievementDate)}" title="${escapeHtml(tileLabels.achievementDate)}"><i class="fas fa-medal" aria-hidden="true"></i><span class="library-recent-name library-scroll-text" title="${escapeHtml(
                        recentUnlockText
                      )}"><span class="library-scroll-content">${escapeHtml(
                        recentUnlockText
                      )}</span></span>${recentUnlockTime}</span>
                      <span class="library-last-played${lastPlayedTime ? '' : ' is-empty'}" data-label="${escapeHtml(tileLabels.lastPlayed)}" title="${escapeHtml(tileLabels.lastPlayed)}"><i class="fas fa-gamepad" aria-hidden="true"></i>${
                        lastPlayedTime ||
                        `<span class="library-scroll-text" title="${escapeHtml(neverPlayedText)}"><span class="library-scroll-content">${escapeHtml(
                          neverPlayedText
                        )}</span></span>`
                      }</span>
                      <span class="library-playtime${playtimeText ? '' : ' is-empty'}" data-label="${escapeHtml(tileLabels.playtime)}" title="${escapeHtml(tileLabels.playtime)}"><i class="fas fa-hourglass-half" aria-hidden="true"></i><span class="library-scroll-text" title="${escapeHtml(
                        playtimeText || '—'
                      )}"><span class="library-scroll-content">${
                        playtimeText ? escapeHtml(playtimeText) : '—'
                      }</span></span></span>
                    </div>
                    <!--${game.source ? `<div class="source">${game.source}</div>` : ''}-->
                  </div>
                </div>
            </li>
            `;

            stopBuild();
            const stopParse = perfTrace.start('tile:parse');
            const item = $(template);
            stopParse();
            const existingElement = gameElements.get(appidKey);
            const stopInsert = perfTrace.start('tile:insert');
            if (existingElement && existingElement.closest('li')) $(existingElement.closest('li')).replaceWith(item);
            else replaceSkeletonWith(item);
            stopInsert();
            const headerEl = item.find('.header').first();
            if (existingIndex >= 0) {
              gameList[existingIndex] = game;
            } else {
              gameListIndex.set(appidKey, gameList.length);
              gameList.push(game);
            }
            gameElements.set(appidKey, item.find('.game-box')[0]);
            if (!deferStats) {
              const now = performance.now();
              if (now - lastProfileStatsAt >= PROFILE_STATS_MIN_INTERVAL_MS) {
                lastProfileStatsAt = now;
                refreshProfileStats();
              }
            }

            scheduleLibraryCover(game, headerEl, portrait);
          }
        };

    if (knownGames.length > 0) {
      perfTrace.reset('tile:');
      for (const game of knownGames) renderGame(game, { fresh: false, deferStats: true });
      refreshProfileStats();
      const knownPainted = gameElements.size;
      if (knownPainted > 0) {
        sort($('#game-list ul'), sortOptions());
        if (isDev)
          debug.log(
            `[perf] painted ${knownPainted} known library game(s) in ${(performance.now() - scanStartedAt).toFixed(1)}ms ` +
              `(snapshot read ${snapshotReadMs.toFixed(1)}ms, ${performance.now().toFixed(0)}ms after page start) ` +
              `[${perfTrace.summary({ prefix: 'tile:' })}]`
          );
      }
    }

    // Nothing known to show: placeholders stand in until the first fresh tile arrives.
    if (gameElements.size === 0) {
      addSkeletonTiles(
        previousVisibleCount > 0
          ? Math.min(MAX_SKELETON_TILES, previousVisibleCount + EXTRA_SKELETON_TILES)
          : DEFAULT_SKELETON_TILES
      );
    }

    const listLoadPromise = achievements
      .makeList(
        scanConfig,
        (percent, total) => {
          loadingElem.progress.attr('data-percent', percent);
          loadingElem.meter.css('width', percent + '%');
          setSkeletonExpected(total);
        },
        (game) => renderGame(game)
      )
      .then((list) => {
        // Scan finished - release the re-entry guard. If a refresh was requested while this run was in
        // flight, run exactly one more pass now (the just-finished list is stale) and skip finalising it.
        clearTimeout(self.listLoadGuardTimer);
        self.listLoadInFlight = false;
        if (self.listRescanPending) {
          self.listRescanPending = false;
          const nextScope = self.listRescanScope;
          const forceRecheck = self.listRescanForceRecheck === true;
          self.listRescanScope = undefined;
          self.listRescanForceRecheck = false;
          return self.onStart(
            nextScope
              ? { scanScope: nextScope, forceAchievementRecheck: forceRecheck }
              : { forceAchievementRecheck: forceRecheck }
          );
        }
        self.hasCompletedFirstScan = true;
        // Clearing steam_cache deliberately forces a fresh schema lookup. If that lookup happens
        // while offline, keep the last complete in-memory game instead of replacing it with a
        // provisional 0-achievement card; the next successful recheck will replace it normally.
        if (preserveExistingOnFailure && previousGames.length > 0 && Array.isArray(list)) {
          const previousByAppid = new Map(previousGames.map((game) => [String(game && game.appid), game]));
          if (list.length === 0) {
            list.push(...previousGames);
            for (const game of previousGames) renderGame(game, { fresh: false });
          } else {
            for (let index = 0; index < list.length; index += 1) {
              const candidate = list[index];
              const previous = previousByAppid.get(String(candidate && candidate.appid));
              if (!previous || !candidate.provisional || previous.provisional) continue;
              list[index] = previous;
              // The provisional candidate was already streamed and registered as a fresh tile. Use
              // the non-fresh path so the complete in-memory record replaces that tile instead of
              // being discarded by the duplicate-stream guard.
              renderGame(previous, { fresh: false });
            }
          }
        }
        // Baseline for the background detector: the appids this scan was built from. Within the
        // discovery TTL this reuses the scan's own discovery rather than repeating it. Passing the
        // rendered list lets it also record which discovered appids produced no tile, so a phantom
        // that flickers in and out of discovery stops re-triggering full refreshes.
        seedNewGameScanBaseline(list);
        if (activeScanScope && previousGames.length > 0 && Array.isArray(list)) {
          const freshAppids = new Set(list.map((game) => String(game && game.appid)));
          const preserved = previousGames.filter(
            (game) => game && !freshAppids.has(String(game.appid)) && !gameTouchesScanScope(game, activeScanScope)
          );
          for (const game of preserved) {
            list.push(game);
            renderGame(game);
          }
        }
        const currentAppids = new Set(list.map((game) => String(game && game.appid)));
        for (const [appid, element] of gameElements) {
          if (currentAppids.has(appid)) continue;
          element.closest('li')?.remove();
          gameElements.delete(appid);
        }
        gameList = gameList.filter((game) => currentAppids.has(String(game && game.appid)));
        gameListIndex.clear();
        gameList.forEach((game, index) => gameListIndex.set(String(game && game.appid), index));
        if (!activeScanScope) {
          try {
            librarySnapshot.write(getUserDataPath(), scanConfig, list);
          } catch (err) {
            debug.log(`[library-snapshot] save failed: ${err.message || err}`);
          }
        }
        if (isDev) debug.log(`[perf] fresh library scan finished in ${(performance.now() - scanStartedAt).toFixed(1)}ms`);
        loadingElem.elem.hide();
        $('#main-footer').addClass('done');
        setLibraryBusyCursor(false);

        if (list.length == 0) {
          debug.log('No game found !');
          clearSkeletonTiles();
          $('#game-list .isEmpty').show();
          return;
        }
        ipcRenderer.send('close-puppeteer');
        debug.log('Populating game list ...');

        // Sort once after all tiles have loaded.
        clearSkeletonTiles();
        sort($('#game-list ul'), sortOptions());

        // Clear duplicate executable assignments before playtime tracking.
        try {
          const cleared = gameIndex.reconcile(gameList);
          if (cleared > 0) debug.log(`[gameIndex] reconcile cleared ${cleared} duplicate binary assignment${cleared === 1 ? '' : 's'}`);
        } catch (err) {
          debug.log(err);
        }
        // The scan just (re)seeded cfg/gameIndex.json; let the Watchdog reload it so freshly added
        // non-Steam games are tracked without waiting for a Watchdog restart.
        ipcRenderer.invoke('watchdog-reload-playtime-index').catch((err) => debug.log(err));

        // Reconcile launch paths with the installed games.
        exeList
          .reconcile(gameList)
          .then(async (n) => {
            if (n > 0) debug.log(`[exeList] reconcile fixed ${n} entr${n === 1 ? 'y' : 'ies'}`);
            // exeList signal for the "installed only" filter: a game with a still-living configured
            // launch exe is installed even if discovery couldn't resolve its install folder. reconcile
            // just dropped dead paths, so any non-empty exe here exists on disk.
            try {
              const entries = await exeList.list();
              // Known non-game executables (R.exe from SPSS, browser/office tools, …) must never
              // count as an install proof - a stale "configure executable" pointing at one of those
              // used to mark uninstalled games (e.g. The Last of Us Part II) as installed.
              const withExe = new Set(
                entries.filter((e) => e.exe && !exeDetect.isKnownNonGameExe(path.basename(e.exe))).map((e) => String(e.appid))
              );
              for (const game of gameList) {
                if (withExe.has(String(game.appid))) game.installed = true;
              }
              for (const box of document.querySelectorAll('#game-list .game-box[data-installed="0"]')) {
                if (withExe.has(String(box.dataset.appid))) box.dataset.installed = '1';
              }
              window.applyInstalledFilter?.();
            } catch (err) {
              debug.log(err);
            }
          })
          .catch((err) => debug.log(err));

        let elem = $('#game-list ul');

        elem.find('.game-box').each(function () {
          const appid = this.dataset.appid;
          gameElements.set(appid, this);
        });

        $('#btn-game-config-cancel, #game-config .overlay').on('click', function () {
          self.onGameConfigCancelClick($(this));
        });

        $('#btn-game-config-save').click(async function () {
          self.onGameConfigSaveClick($(this));
        });

        $('#game-list')
          .on('mouseenter.awLibrary', '.library-scroll-text', function () {
            startLibraryTextScroll(this);
          })
          .on('mouseleave.awLibrary', '.library-scroll-text', function () {
            stopLibraryTextScroll(this);
          })
          .on('click.awLibrary', '.game-box', function () {
            // Achievement-less entries use the exact same detail-page flow as every other game.
            // Only the explicit play control below launches an executable.
            self.onGameBoxClick($(this), gameList);
          })
          .on('click.awLibrary', '.game-box .play-button', async function (e) {
            e.stopPropagation();
            self.onPlayButtonClick($(this));
          })
          .on('click.awLibrary', '.game-box .config-button', async function (e) {
            e.stopPropagation();
            self.onConfigButtonClick($(this), gameList, await exeList.get());
          });

        $('#game-config').on('click', '.edit', async function (e) {
          e.stopPropagation();
          let appid = $('#game-config .header').attr('title');
          let cfg = await exeList.get(appid);
          let dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
            title: t('choose-the-game-executable', 'Choose the game executable', 'Choisir l\'exécutable du jeu'),
            buttonLabel: t('select', 'Select', 'Sélectionner'),
            defaultPath: cfg.exe,
            filters: [{ name: 'Executables', extensions: ['exe', 'bat'] }],
            properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'],
          });

          if (dialog.filePaths.length > 0 && dialog.filePaths[0].length > 0) {
            const filePath = dialog.filePaths[0];

            $('#game-config').find('.constant').text(filePath);
            $('#game-config').find('.constant').attr('title', filePath);
          }
        });

        $('#game-config')
          .on('mouseenter', '#dirlist .path', function () {
            const text = this.querySelector('.constant');
            if (!text) return;
            const overflow = Math.max(0, Math.ceil(text.scrollWidth - this.clientWidth));
            this.classList.toggle('overflow', overflow > 2);
            if (overflow <= 2) return;

            this._scrollAnimation?.cancel();
            this._scrollAnimation = text.animate(
              [
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(0)', offset: 0.14 },
                { transform: `translateX(-${overflow}px)`, offset: 0.78 },
                { transform: `translateX(-${overflow}px)`, offset: 1 },
              ],
              {
                duration: Math.max(3400, overflow * 18),
                iterations: Infinity,
                direction: 'alternate',
                easing: 'ease-in-out',
              }
            );
          })
          .on('mouseleave', '#dirlist .path', function () {
            this._scrollAnimation?.cancel();
            this._scrollAnimation = null;
          });

        // Unlink: clear the configured executable for this game and persist immediately.
        $('#game-config').on('click', '.unlink', async function (e) {
          e.stopPropagation();
          let appid = $('#game-config .header').attr('title');
          let cfg = await exeList.get(appid);
          cfg.exe = '';
          await exeList.add(cfg);
          $('#game-config').find('.constant').text('').attr('title', '');
        });

        $('#game-list .game-box').contextmenu(function (e) {
          e.preventDefault();
          let self = $(this);
          let appid = self.data('appid');
          // Never write a synthetic local id to steam_appid.txt; use a real Steam id when available.
          let writableAppid = /^[0-9]+$/.test(String(appid)) ? appid : list.find((g) => g.appid == appid)?.steamappid || null;
          const ctxGame = list.find((g) => g.appid == appid);
          const gameSource = ctxGame?.source || '';
          const isManualGame = !!ctxGame?.manual || gameSource === 'Manual';
          // Offer GBE for non-Steam and non-native-launcher installs.
          const isLegitSteamOwned = gameSource.startsWith('Steam (');
          const isNativeLauncher = gameSource === 'gog' || gameSource === 'epic';
          // Console-emulator records do not use Steam/Ubisoft tools; Uplay is the exception.
          const rawSystem = self.data('system');
          const isConsoleSystem = !!rawSystem && rawSystem !== 'uplay';
          // Manual per-game override (right-click → Emulator source) lets the user force GBE Fork or
          // Uplay R2 when the on-disk marker heuristic (isUbisoftGame) guesses wrong - e.g. a Ubisoft
          // title repacked with both a steam_api dll and leftover Ubisoft engine files (a Steam-store
          // Ubisoft remaster). `null` means no override: keep the automatic detection.
          const emulatorSourceForced = emulatorSourceOverride.get(appid);
          const isUbisoftSource =
            emulatorSourceForced === 'ubisoft' ? true : emulatorSourceForced === 'steam' ? false : uplayR2.isUbisoftGame(ctxGame, appid);
          const isUplayR2Source =
            emulatorSourceForced === 'ubisoft' ? true : emulatorSourceForced === 'steam' ? false : uplayR2.isUplayR2Game(ctxGame, appid);
          const initialGbeEligibility = emulatorFixEligibility.inspect({
            gameDir: ctxGame?.gameDir,
            source: gameSource,
            system: rawSystem,
            isUbisoft: isUbisoftSource,
            manual: isManualGame,
            allowManual: isManualGame,
          });
          const ubisoftTools = isUbisoftSource ? uplayR2.getGameToolPaths(ctxGame, appid) : null;
          const catalogAppid = String(
            (ubisoftTools && ubisoftTools.steamAppid) || ctxGame?.steamappid || writableAppid || (/^[0-9]+$/.test(String(appid)) ? appid : '')
          );
          const { Menu, MenuItem, nativeImage } = remote;
          // Native Windows menus render icons at their natural size; the bundled
          // icons are 32×32 and look oversized at typical DPI. Normalize every
          // context-menu icon to the standard 16×16 size.
          const menuIcon = (name) => {
            const img = nativeImage.createFromPath(path.join(appPath, 'resources/img', name));
            if (img.isEmpty()) return img;
            return img.resize({ width: 16, height: 16, quality: 'best' });
          };

          // CrakFiles community fixes. Declared here, appended by whichever branch below applies:
          // the list is matched by game NAME (it holds no appids) and a fix is just files dropped into
          // the install folder, so nothing about it is Steam-specific. It used to live inside the
          // Steam-only branch, which silently denied it to cracked Ubisoft games.
          const appendCrackFixItem = () => {
            // Community "Fixes & Bypasses" from the CrakFiles list - a SEPARATE launch helper. These
            // can overwrite game files (incl. steam_api), so it warns that achievement detection runs
            // through the emulator and the emulator fix may need re-applying. Overwritten files are
            // backed up under <gameDir>/.aw-crackfix-backups/.
            emulatorMenu.append(
              new MenuItem({
                icon: menuIcon('file-text.png'),
                label: $('#game-list').attr('data-ctx-crackfix') || '',
                async click() {
                  // Hoisted so the catch's "pixeldrain captcha → apply a manually-downloaded file" flow
                  // can reach the resolved game / fix / install dir.
                  let game = null;
                  let top = null;
                  let fix = null;
                  let gameDir = null;
                  const crackFix = require(path.join(appPath, 'parser/crackFix.js'));
                  try {
                    game = list.find((g) => g.appid == appid);
                    if (!game?.name) {
                      remote.dialog.showMessageBoxSync({ type: 'info', title: t('crakfiles', 'CrakFiles'), message: t('unknown-game-name', 'Unknown game name.', 'Nom de jeu inconnu.') });
                      return;
                    }
                    const cacheDir = path.join(getUserDataPath(), 'cache/crackfiles');
                    setGameBoxBusy(self, t('searching-fixes', 'Searching fixes…', 'Recherche de fixes…'));
                    const cfList = await crackFix.fetchList({ cacheDir, log: debug });
                    clearGameBoxBusy(self);
                    const matches = crackFix.findFixes(cfList, game.name, { limit: 5 });
                    if (matches.length === 0) {
                      const c = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'info',
                        title: t('crakfiles', 'CrakFiles'),
                        message: t('no-fix-found-for-x', 'No fix found for "{name}".', 'Aucun fix trouvé pour « {name} ».', { name: game.name }),
                        detail: t('the-crakfiles-list-is-community-maintained-and-limited', 'The CrakFiles list is community-maintained and limited.', 'La liste CrakFiles est communautaire et limitée.'),
                        buttons: [t('ok', 'OK', 'OK'), t('open-crakfiles', 'Open CrakFiles', 'Ouvrir CrakFiles')],
                        defaultId: 0,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (c === 1) remote.shell.openExternal('https://github.com/KoriaPolis/CrakFiles');
                      return;
                    }
                    top = matches[0];
                    // Pick the best fix instead of blindly the first listed: prefer an auto-installable
                    // (pixeldrain) link and the build matching the game's architecture when detectable.
                    let arch = null;
                    try {
                      if (game.gameDir && fs.existsSync(game.gameDir)) {
                        const pe = require(path.join(appPath, 'util/pe.js'));
                        const emu0 = goldberg.detectEmulator(game.gameDir);
                        const exe0 = exeDetect.detect(game.gameDir, game.name || '', { dllPaths: emu0.dll });
                        if (exe0 && exe0.full) arch = pe.exeArch(exe0.full);
                      }
                    } catch {}
                    fix = crackFix.pickBestFix(top, { arch }) || (top.fixes && top.fixes[0]) || {};
                    const badges = (fix.badges || []).join(', ');
                    const choice = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                      type: 'warning',
                      title: t('crakfiles', 'CrakFiles'),
                      message: t('fix-found-x', 'Fix found: {name}', 'Fix trouvé : {name}', { name: top.name }),
                      detail:
                        (fix.filename ? `${fix.filename}${badges ? ` [${badges}]` : ''}\n` : '') +
                        t(
                          'crackfix-overwrite-warning',
                          '\n⚠ A community crack may overwrite game files (incl. steam_api(64).dll). Achievement detection runs through the emulator - if the crack replaces steam_api, re-run "Apply emulator fix" afterwards. Overwritten files are backed up.',
                          "\n⚠ Un crack communautaire peut écraser des fichiers du jeu (dont steam_api(64).dll). La détection des succès passe par l'émulateur - si le crack remplace steam_api, relance « Appliquer le fix émulateur » après. Les fichiers écrasés sont sauvegardés."
                        ),
                      // NB: Windows treats `&` in a button label as the Alt-mnemonic marker and hides
                      // it ("Download  apply"); double it so a literal ampersand shows.
                      buttons: [
                        t('cancel', 'Cancel', 'Annuler'),
                        t('open-download-page', 'Open download page', 'Ouvrir la page de téléchargement'),
                        t('open-source', 'Open source', 'Ouvrir la source'),
                        t('download-apply', 'Download && apply', 'Télécharger && appliquer'),
                      ],
                      defaultId: 1,
                      cancelId: 0,
                      noLink: true,
                    });
                    if (choice.response === 0) return;
                    if (choice.response === 1) {
                      if (fix.href) openCatalogLink(fix.href);
                      return;
                    }
                    if (choice.response === 2) {
                      const src = (top.source_crack || [])[0];
                      if (src) openCatalogLink(src);
                      return;
                    }
                    gameDir = game.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                    if (!gameDir) {
                      const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                        title: t('game-install-folder', 'Game install folder', "Dossier d'installation du jeu"),
                        properties: ['openDirectory', 'dontAddToRecent'],
                      });
                      if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                      gameDir = picked.filePaths[0];
                    }
                    if (!crackFix.pixeldrainDirectUrl(fix.href)) {
                      const c = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'info',
                        title: t('crakfiles', 'CrakFiles'),
                        message: t('this-link-cannot-be-applied-automatically', 'This link cannot be applied automatically.', 'Ce lien ne peut pas être appliqué automatiquement.'),
                        detail: t('open-the-download-page-and-apply-it-manually', 'Open the download page and apply it manually.', 'Ouvre la page de téléchargement et applique-le manuellement.'),
                        buttons: [t('ok', 'OK', 'OK'), t('open', 'Open', 'Ouvrir')],
                        defaultId: 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (c === 1 && fix.href) openCatalogLink(fix.href);
                      return;
                    }
                    setGameBoxBusy(self, t('downloading-fix', 'Downloading fix…', 'Téléchargement du fix…'));
                    const res = await crackFix.downloadAndApply({ fix, gameDir, cacheDir, entryName: top.name, proxyFallback: (app.config?.emulator || {}).pixeldrainProxyFallback !== false, log: debug });
                    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                      type: 'info',
                      title: t('crakfiles', 'CrakFiles'),
                      message: t('applied-x-file-s', 'Applied {count} file(s).', '{count} fichier(s) appliqué(s).', { count: res.applied.length }),
                      detail:
                        gameDir +
                        (res.backupDir ? `\n${t('backup', 'Backup:', 'Sauvegarde :')} ${res.backupDir}` : '') +
                        (t('n-nif-steam-api-was-replaced-re-run-apply-emulator-fix-to-keep-a', '\n\nIf steam_api was replaced, re-run "Apply emulator fix" to keep achievement detection.', '\n\nSi steam_api a été remplacé, relance « Appliquer le fix émulateur » pour garder la détection des succès.')),
                      noLink: true,
                    });
                  } catch (err) {
                    // Pixeldrain rate-limits popular files (403): they can't be auto-downloaded, only
                    // fetched through a browser (captcha). Rather than a dead end, walk the user through
                    // downloading it themselves and then hand the file to AW to extract + apply.
                    if (err && err.code === 'PIXELDRAIN_UNAVAILABLE') {
                      const href = err.href || fix?.href;
                      const choice = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                        type: 'warning',
                        title: t('crakfiles', 'CrakFiles'),
                        message: t('pixeldrain-captcha-required-for-this-file', 'Pixeldrain captcha required for this file.', 'Captcha pixeldrain requis pour ce fichier.'),
                        detail: t(
                          'pixeldrain-rate-limited',
                          "Pixeldrain rate-limited this file (too many downloads): you must solve a captcha in the browser.\n\n1) Open the page and download the .rar.\n2) Come back and select the downloaded file - AW will extract and apply it automatically (overwritten files are backed up).",
                          "Pixeldrain limite ce fichier (trop de téléchargements) : il faut résoudre un captcha dans le navigateur.\n\n1) Ouvre la page et télécharge le .rar.\n2) Reviens et sélectionne le fichier téléchargé - AW l'extraira et l'appliquera automatiquement (les fichiers écrasés sont sauvegardés)."
                        ),
                        buttons: [
                          t('cancel', 'Cancel', 'Annuler'),
                          t('open-page', 'Open page', 'Ouvrir la page'),
                          t('select-downloaded-file', 'Select downloaded file…', 'Sélectionner le fichier téléchargé…'),
                        ],
                        defaultId: 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (choice.response === 0) return;
                      if (choice.response === 1) {
                        if (href) openCatalogLink(href);
                        // Wait (non-blocking modal) for the user to finish the browser download, then let
                        // them pick the file. Cancelling here just leaves the page open.
                        const after = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                          type: 'info',
                          title: t('crakfiles', 'CrakFiles'),
                          message: t('once-the-download-is-finished', 'Once the download is finished…', 'Une fois le téléchargement terminé…'),
                          detail: t('select-the-downloaded-file-rar-zip-7z-to-apply-it', 'Select the downloaded file (.rar/.zip/.7z) to apply it.', 'Sélectionne le fichier téléchargé (.rar/.zip/.7z) pour l’appliquer.'),
                          buttons: [t('cancel', 'Cancel', 'Annuler'), t('select-file', 'Select file…', 'Sélectionner le fichier…')],
                          defaultId: 1,
                          cancelId: 0,
                          noLink: true,
                        });
                        if (after.response !== 1) return;
                      }
                      // Pick + apply the locally-downloaded archive.
                      const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                        title: t('select-the-downloaded-crack', 'Select the downloaded crack', 'Sélectionne le crack téléchargé'),
                        properties: ['openFile', 'dontAddToRecent'],
                        filters: [
                          { name: t('archives', 'Archives', 'Archives'), extensions: ['rar', 'zip', '7z'] },
                          { name: t('all-files', 'All files', 'Tous les fichiers'), extensions: ['*'] },
                        ],
                      });
                      if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                      // Resolve the install folder (the try-scoped one may be unset if we failed early).
                      let applyDir = (gameDir && fs.existsSync(gameDir) && gameDir) ||
                        (game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null);
                      if (!applyDir) {
                        const pd = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('game-install-folder', 'Game install folder', "Dossier d'installation du jeu"),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (pd.canceled || !pd.filePaths || pd.filePaths.length === 0) return;
                        applyDir = pd.filePaths[0];
                      }
                      try {
                        setGameBoxBusy(self, t('applying-file', 'Applying file…', 'Application du fichier…'));
                        const res = await crackFix.applyLocalArchive({
                          archivePath: picked.filePaths[0],
                          gameDir: applyDir,
                          fix: fix && fix.href ? fix : null,
                          entryName: top?.name || '',
                          log: debug,
                        });
                        clearGameBoxBusy(self);
                        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'info',
                          title: t('crakfiles', 'CrakFiles'),
                          message: t('applied-x-file-s', 'Applied {count} file(s).', '{count} fichier(s) appliqué(s).', { count: res.applied.length }),
                          detail:
                            applyDir +
                            (res.backupDir ? `\n${t('backup', 'Backup:', 'Sauvegarde :')} ${res.backupDir}` : '') +
                            (t('n-nif-steam-api-was-replaced-re-run-apply-emulator-fix-to-keep-a', '\n\nIf steam_api was replaced, re-run "Apply emulator fix" to keep achievement detection.', '\n\nSi steam_api a été remplacé, relance « Appliquer le fix émulateur » pour garder la détection des succès.')),
                          noLink: true,
                        });
                      } catch (e2) {
                        remote.dialog.showMessageBoxSync({ type: 'error', title: t('crakfiles', 'CrakFiles'), message: t('apply-failed', 'Apply failed.', 'Échec de l’application.'), detail: formatErr(e2) });
                      }
                    } else {
                      remote.dialog.showMessageBoxSync({ type: 'error', title: t('crakfiles', 'CrakFiles'), message: t('failed', 'Failed.', 'Échec.'), detail: formatErr(err) });
                    }
                  } finally {
                    clearGameBoxBusy(self);
                  }
                },
              })
            );
          };
          const menu = new Menu();
          const gameMenu = new Menu();
          const emulatorMenu = new Menu();
          const folderMenu = new Menu();
          const linkMenu = new Menu();
          // One list, shared with Game Health: a second hand-maintained copy is how the two views
          // came to disagree about which issues the very same repair can fix.
          const diagnosisRepairCodes = [...gameHealth.REPAIRABLE_GOLDBERG_CODES];
          const canRepairGoldbergReport = (report) => report.issues.some((i) => diagnosisRepairCodes.includes(i.code));
          const buildGoldbergDiagnosisLines = (report) => {
            const emuLabel = {
              gbe: 'GBE Fork',
              goldberg: 'Goldberg (classic)',
              none: t('diagnosis-emulator-none', 'none detected', 'aucun détecté'),
            }[report.emulator] || report.emulator;
            const lines = [];
            lines.push(t('diagnosis-emulator', 'Emulator: {emulator}', 'Émulateur : {emulator}', { emulator: emuLabel }));
            lines.push(
              report.steamSettings
                ? t('diagnosis-steam-settings', 'steam_settings: {path}', 'steam_settings : {path}', { path: report.steamSettings })
                : t('diagnosis-steam-settings-missing', 'steam_settings: not found', 'steam_settings : introuvable')
            );
            if (report.achievements.expected != null) {
              lines.push(
                t('diagnosis-achievements-count', 'achievements: {found} in file / {expected} in schema', 'succès : {found} dans le fichier / {expected} dans le schéma', {
                  found: report.achievements.found,
                  expected: report.achievements.expected,
                })
              );
            }
            if (report.issues.length === 0) {
              lines.push('');
              lines.push(t('diagnosis-no-problems', 'No problems detected.', 'Aucun problème détecté.'));
            } else {
              lines.push('');
              for (const i of report.issues) lines.push(`[${i.level}] ${i.message}`);
            }
            return lines;
          };
          const repairGoldbergSetup = async ({ report, gameDir, game }) => {
            const request = require('request-zero');
            const target = report.steamSettings || path.join(gameDir, 'steam_settings');
            const downloadIcon = async (url, dir) => {
              // See steam.js resolveWorkingIconUrl: the raw schema URL 404s for a new appid whose
              // achievement art is not on Steam's primary CDN yet, well after the store art is.
              const resolved = (await steamParser.resolveWorkingIconUrl(writableAppid, url)) || url;
              const r = await request.download(resolved, dir);
              return r && r.path;
            };
            // Also enable all DLCs (configs.app.ini) and stamp the app's username/language into
            // configs.user.ini - the full GBE setup, not just achievements.json.
            return goldberg.repair({
              steamSettings: target,
              appid: writableAppid,
              schema: game,
              downloadIcon,
              fetchDlc: (id) => steamParser.getDLCList(id),
              accountName: app.config?.general?.username,
              language: app.config?.achievement?.lang,
            });
          };
          const diagnoseGoldbergSetup = async ({ game, gameDir, autoRepair = false, showDialog = true }) => {
            let report = goldberg.diagnose({ gameDir, appid: writableAppid, schema: game });
            let repaired = null;
            let repairError = null;
            const canRepair = canRepairGoldbergReport(report);

            if (autoRepair && canRepair) {
              try {
                repaired = await repairGoldbergSetup({ report, gameDir, game });
                report = goldberg.diagnose({ gameDir, appid: writableAppid, schema: game });
              } catch (err) {
                repairError = err;
              }
            }

            if (showDialog) {
              const lines = buildGoldbergDiagnosisLines(report);
              if (repaired) {
                lines.push('');
                lines.push(
                  t('diagnosis-auto-repair-wrote', 'Auto-repair wrote {count} achievements to {path}', 'La réparation automatique a écrit {count} succès dans {path}', {
                    count: repaired.achievementsJson.length,
                    path: repaired.steamSettings,
                  })
                );
                lines.push(
                  t('diagnosis-icons-summary', 'icons: {downloaded} downloaded, {failed} failed, {skipped} skipped', 'icônes : {downloaded} téléchargées, {failed} en échec, {skipped} ignorées', {
                    downloaded: repaired.icons.downloaded,
                    failed: repaired.icons.failed,
                    skipped: repaired.icons.skipped,
                  })
                );
                // A whole set that 404s is Steam not having published the art yet, not a broken
                // install. Without this the report is a bare "150 failed" and the user goes
                // hunting for a fault in their game folder that is not there.
                if (repaired.icons.unavailable) lines.push(t('diagnosis-icons-unavailable', 'Steam has no achievement artwork for this game yet, so no icon could be downloaded. The achievement list itself is complete; run the repair again once the artwork is published.', "Steam n'a pas encore d'illustrations de succès pour ce jeu : aucune icône n'a pu être téléchargée. La liste des succès est complète ; relancez la réparation une fois les illustrations publiées."));
                if (repaired.wroteAppId) lines.push(t('diagnosis-steam-appid-created', 'steam_appid.txt created', 'steam_appid.txt créé'));
                if (repaired.main && repaired.main.changed) {
                  lines.push(t('diagnosis-configs-main-updated', 'configs.main.ini updated (new_app_ticket + gc_token)', 'configs.main.ini mis à jour (new_app_ticket + gc_token)'));
                }
                if (repaired.dlc) {
                  lines.push(
                    t('diagnosis-configs-app-updated', 'configs.app.ini updated ({count} DLC entries, unlock_all={unlockAll})', 'configs.app.ini mis à jour ({count} entrées DLC, unlock_all={unlockAll})', {
                      count: repaired.dlc.count,
                      unlockAll: repaired.dlc.unlockAll ? '1' : '0',
                    })
                  );
                }
                if (repaired.user && repaired.user.changed) lines.push(t('diagnosis-configs-user-updated', 'configs.user.ini updated', 'configs.user.ini mis à jour'));
              }
              if (repairError) {
                lines.push('');
                lines.push(
                  t('diagnosis-auto-repair-failed', 'Auto-repair failed: {error}', 'La réparation automatique a échoué : {error}', {
                    error: repairError.message || repairError,
                  })
                );
              }

              const choice = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                type: report.ok && !repairError ? 'info' : 'warning',
                title: t('goldberg-diagnosis-title', 'Goldberg/GBE diagnosis - {gameName}', 'Diagnostic Goldberg/GBE - {gameName}', { gameName: game?.name || appid }),
                message: report.ok
                  ? t('setupLooksValid', 'Setup looks valid.', 'La configuration semble valide.')
                  : t('problemsWereDetected', 'Problems were detected.', 'Des problèmes ont été détectés.'),
                detail: lines.join('\n'),
                buttons: !autoRepair && canRepair
                  ? ['OK', t('repairSteamSettings', 'Repair steam_settings (write schema + icons)…', 'Réparer steam_settings (écrire le schéma + les icônes)…')]
                  : ['OK'],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
              });

              if (!autoRepair && canRepair && choice.response === 1) {
                try {
                  const summary = await repairGoldbergSetup({ report, gameDir, game });
                  remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                    type: 'info',
                    title: t('repair-complete', 'Repair complete', 'Réparation terminée'),
                    message: t(
                      'repair-complete-message',
                      'Wrote {count} achievements to {path}',
                      '{count} succès écrits dans {path}',
                      { count: summary.achievementsJson.length, path: summary.steamSettings }
                    ),
                    detail:
                      t('diagnosis-icons-summary', 'icons: {downloaded} downloaded, {failed} failed, {skipped} skipped', 'icônes : {downloaded} téléchargées, {failed} en échec, {skipped} ignorées', {
                        downloaded: summary.icons.downloaded,
                        failed: summary.icons.failed,
                        skipped: summary.icons.skipped,
                      }) +
                      (summary.icons.unavailable ? '\n' + t('diagnosis-icons-unavailable', 'Steam has no achievement artwork for this game yet, so no icon could be downloaded. The achievement list itself is complete; run the repair again once the artwork is published.', "Steam n'a pas encore d'illustrations de succès pour ce jeu : aucune icône n'a pu être téléchargée. La liste des succès est complète ; relancez la réparation une fois les illustrations publiées.") : '') +
                      (summary.wroteAppId ? '\n' + t('diagnosis-steam-appid-created', 'steam_appid.txt created', 'steam_appid.txt créé') : '') +
                      (summary.main && summary.main.changed ? '\n' + t('diagnosis-configs-main-updated', 'configs.main.ini updated (new_app_ticket + gc_token)', 'configs.main.ini mis à jour (new_app_ticket + gc_token)') : '') +
                      (summary.dlc
                        ? '\n' +
                          t('diagnosis-configs-app-updated', 'configs.app.ini updated ({count} DLC entries, unlock_all={unlockAll})', 'configs.app.ini mis à jour ({count} entrées DLC, unlock_all={unlockAll})', {
                            count: summary.dlc.count,
                            unlockAll: summary.dlc.unlockAll ? '1' : '0',
                          })
                        : '') +
                      (summary.user && summary.user.changed ? '\n' + t('diagnosis-configs-user-updated', 'configs.user.ini updated', 'configs.user.ini mis à jour') : ''),
                    noLink: true,
                  });
                } catch (err) {
                  remote.dialog.showMessageBoxSync({ type: 'error', title: t('repair-failed', 'Repair failed', 'Échec de la réparation'), message: t('could-not-write-steam-settings', 'Could not write steam_settings.', 'Impossible d\'écrire steam_settings.'), detail: `${err}` });
                }
              }
            }

            return { report, repaired, repairError };
          };
          gameMenu.append(
            new MenuItem({
              icon: menuIcon('cross.png'),
              label: $('#game-list').attr('data-contextMenu0'),
              async click() {
                try {
                  if (isManualGame) {
                    manualGames.remove(String(appid));
                    await exeList.remove(String(appid));
                    gameIndex.remove(String(appid));
                    app.onStart();
                    return;
                  }
                  // Store the display name alongside the id so the Settings blacklist manager can
                  // show which game each entry is.
                  blacklist.add(appid, list.find((g) => g.appid == appid)?.name || self.find('.info .title span').text() || '');
                  app.onStart();
                } catch (err) {
                  remote.dialog.showMessageBoxSync({
                    type: 'error',
                    title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
                    message: t('blacklist-add-failed', 'Failed to add item to user blacklist', 'Échec de l’ajout à la liste noire'),
                    detail: `${err}`,
                  });
                }
              },
            })
          );

          // Manual override for which emulator family this game's tools should target - for the
          // rare Ubisoft title (e.g. a Steam-store Ubisoft remaster) whose folder trips the on-disk
          // marker heuristic the wrong way, or a genuine Ubisoft install the user wants to try GBE
          // Fork on anyway. Hidden for legit Steam-owned/GOG/Epic records and console emulators,
          // where neither fix could ever apply.
          if (!isConsoleSystem && !isLegitSteamOwned && !isNativeLauncher) {
            gameMenu.append(new MenuItem({ type: 'separator' }));
            const emulatorSourceMenu = new Menu();
            const emulatorSourceOptions = [
              { value: null, labelKey: 'emulator-source-auto', labelEn: 'Automatic (detected)', labelFr: 'Automatique (détecté)' },
              { value: 'steam', labelKey: 'emulator-source-steam', labelEn: 'Steam / GBE Fork', labelFr: 'Steam / GBE Fork' },
              { value: 'ubisoft', labelKey: 'emulator-source-ubisoft', labelEn: 'Ubisoft (Uplay R2)', labelFr: 'Ubisoft (Uplay R2)' },
            ];
            for (const opt of emulatorSourceOptions) {
              emulatorSourceMenu.append(
                new MenuItem({
                  type: 'radio',
                  label: t(opt.labelKey, opt.labelEn, opt.labelFr),
                  checked: emulatorSourceForced === opt.value,
                  click() {
                    emulatorSourceOverride.set(appid, opt.value);
                  },
                })
              );
            }
            gameMenu.append(
              new MenuItem({
                icon: menuIcon('file-text.png'),
                label: t('emulator-source', 'Emulator source', 'Source de l’émulateur'),
                submenu: emulatorSourceMenu,
              })
            );
          }

          // Launching and picking the executable are not Ubisoft-specific: every tile carries the
          // same play and config buttons, and onPlayButtonClick works for any source. These two
          // entries used to sit inside the Ubisoft branch, so right-clicking a Steam, GOG or Epic
          // game offered no way to start it even with the executable already configured.
          gameMenu.append(new MenuItem({ type: 'separator' }));
          gameMenu.append(
            new MenuItem({
              label: t('launch-game', 'Launch game', 'Lancer le jeu'),
              async click() {
                await app.onPlayButtonClick(self.find('.play-button'));
              },
            })
          );
          gameMenu.append(
            new MenuItem({
              label: t('configure-executable', 'Configure executable…', 'Configurer l’exécutable…'),
              async click() {
                await app.onConfigButtonClick(self.find('.config-button'));
              },
            })
          );

          if (isManualGame || isUbisoftSource) {
            // Non-Ubisoft games get their own reset-playtime entry in the emulator section below.
            gameMenu.append(
              new MenuItem({
                label: $('#game-list').attr('data-ctx-resetplaytime') || '',
                async click() {
                  self.css('pointer-events', 'none');
                  await PlaytimeTracking.reset(appid).catch((err) => debug.error(err));
                  self.css('pointer-events', 'initial');
                },
              })
            );
          }

          if (!isManualGame) {
            gameMenu.append(
              new MenuItem({
                label: progressMute.isMuted(appid)
                  ? $('#game-list').attr('data-ctx-unmuteprogress') || ''
                  : $('#game-list').attr('data-ctx-muteprogress') || '',
                click() {
                  try {
                    progressMute.toggle(appid);
                  } catch (err) {
                    debug.error(err);
                  }
                },
              })
            );
          }

          /*
            Reset the game's achievements so they can be earned again. Deliberately outside every
            source/emulator gate above: every source AW tracks except a platform-owned unlock
            (server-side) keeps its unlocks somewhere AW can zero. Restore is offered beside it,
            listing existing backups.
          */
          gameMenu.append(new MenuItem({ type: 'separator' }));
          gameMenu.append(
            new MenuItem({
              icon: menuIcon('cross.png'),
              label: t('reset-ach-menu', 'Reset achievements…', 'Réinitialiser les succès…'),
              async click() {
                self.css('pointer-events', 'none');
                try {
                  await app.resetAchievementsAction(appid);
                } finally {
                  self.css('pointer-events', 'initial');
                }
              },
            })
          );
          {
            const backups = achievementReset.listBackups(appid);
            if (backups.length > 0) {
              const restoreMenu = new Menu();
              // Newest first, capped: this is an undo, not an archive browser.
              for (const backup of backups.slice(0, 10)) {
                restoreMenu.append(
                  new MenuItem({
                    label: `${intlFormat.formatDateTime(backup.at, uiLang()) || backup.id} - ${t('reset-ach-backup-files', '{count} file(s)', '{count} fichier(s)', {
                      count: backup.files,
                    })}`,
                    async click() {
                      self.css('pointer-events', 'none');
                      try {
                        await app.restoreAchievementsAction(appid, backup.id);
                      } finally {
                        self.css('pointer-events', 'initial');
                      }
                    },
                  })
                );
              }
              gameMenu.append(
                new MenuItem({
                  label: t('reset-ach-restore-menu', 'Restore an achievement backup', 'Restaurer une sauvegarde de succès'),
                  submenu: restoreMenu,
                })
              );
            }
          }

          // Native-platform records normally skip Steam-emulator tools. Ubisoft and explicitly
          // added PC games are exceptions: the latter keep the basic per-game tools as an opt-in,
          // while automatic/bulk config generation continues to exclude them.
          // Gated on the raw system value (isConsoleSystem), not isUbisoftSource, so forcing a
          // system="uplay" record to 'steam' via the override still opens this block (for the GBE
          // Fork tools) instead of hiding both toolsets.
          if (!isConsoleSystem) {
            if (!isUbisoftSource) {
            if (!isManualGame) {
              gameMenu.append(
                new MenuItem({
                  label: $('#game-list').attr('data-ctx-resetplaytime') || '',
                  async click() {
                    self.css('pointer-events', 'none');
                    await PlaytimeTracking.reset(appid).catch((err) => {
                      debug.error(err);
                    });
                    self.css('pointer-events', 'initial');
                  },
                })
              );
            }
            if (app.config.notification_advanced.iconPrefetch) {
              if (!isManualGame) emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('image.png'),
                  label: $('#game-list').attr('data-contextMenu1'),
                  async click() {
                    self.css('pointer-events', 'none');
                    self.addClass('wait');
                    try {
                      const request = require('request-zero');
                      const cache = path.join(remote.app.getPath('userData'), `steam_cache/icon/${appid}`);

                      for (let achievement of list.find((game) => game.appid == appid).achievement.list) {
                        await Promise.all([request.download(achievement.icon, cache), request.download(achievement.icongray, cache)]).catch(() => {});
                      }
                    } catch (err) {
                      remote.dialog.showMessageBoxSync({
                        type: 'error',
                        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
                        message: t('icon-cache-build-failed', 'Failed to build icon cache', 'Échec de la construction du cache d’icônes'),
                        detail: `${err}`,
                      });
                    }
                    self.removeClass('wait');
                    self.css('pointer-events', 'initial');
                  },
                })
              );
            }

            emulatorMenu.append(
              new MenuItem({
                icon: menuIcon('file-text.png'),
                label: $('#game-list').attr('data-ctx-genjson') || '',
                async click() {
                  self.css('pointer-events', 'none');
                  try {
                    const request = require('request-zero');

                    let dialog = await remote.dialog.showSaveDialog(remote.getCurrentWindow(), {
                      title: t('choose-where-to-generate-achievements-json', 'Choose where to generate achievements.json', 'Choisir où générer achievements.json'),
                      buttonLabel: t('generate', 'Generate', 'Générer'),
                      defaultPath: 'achievements.json',
                      properties: ['showHiddenFiles', 'dontAddToRecent'],
                    });

                    self.addClass('wait');

                    if (dialog.filePath.length > 0) {
                      const filePath = dialog.filePath;
                      const dir = path.parse(filePath).dir;
                      const achievements = list.find((game) => game.appid == appid).achievement.list;

                      let result = [];

                      for (let achievement of achievements) {
                        try {
                          let icons = await Promise.all([
                            request.download(achievement.icon, path.join(dir, 'images')),
                            request.download(achievement.icongray, path.join(dir, 'images')),
                          ]);
                          result.push({
                            description: achievement.description || '',
                            displayName: achievement.displayName,
                            hidden: achievement.hidden == 1 ? '1' : '0',
                            icon: 'images/' + path.parse(icons[0].path).base,
                            icongray: 'images/' + path.parse(icons[1].path).base,
                            name: achievement.name,
                          });
                        } catch {
                          result.push({
                            description: achievement.description || '',
                            displayName: achievement.displayName,
                            hidden: achievement.hidden == 1 ? '1' : '0',
                            name: achievement.name,
                          });
                        }
                      }

                      if (result.length > 0) {
                        fs.mkdirSync(path.dirname(filePath), { recursive: true });
                        fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
                      }
                    }
                  } catch (err) {
                    remote.dialog.showMessageBoxSync({
                      type: 'error',
                      title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
                      message: t('generate-achievements-json-failed', 'Failed to generate achievements.json', 'Échec de la génération de achievements.json'),
                      detail: `${err}`,
                    });
                  }
                  self.removeClass('wait');
                  self.css('pointer-events', 'initial');
                },
              })
            );

            // Three visually distinct tool clusters: data, diagnostics/backups, then game-file fixes.
            emulatorMenu.append(new MenuItem({ type: 'separator' }));
            emulatorMenu.append(
              new MenuItem({
                icon: menuIcon('file-text.png'),
                label: $('#game-list').attr('data-ctx-diagnose') || '',
                async click() {
                  try {
                    const game = list.find((g) => g.appid == appid);
                    // Reuse the install folder discover() already found instead of asking the
                    // user to re-browse to it; only prompt when it's genuinely unknown.
                    let gameDir = game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                    if (!gameDir) {
                      const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                        title: t('select-install-folder-emulator-dll', "Select the game's install folder (where the emulator .dll is)", "Sélectionne le dossier d'installation du jeu (où se trouve la .dll de l'émulateur)"),
                        buttonLabel: t('diagnose', 'Diagnose', 'Diagnostiquer'),
                        properties: ['openDirectory', 'dontAddToRecent'],
                      });
                      if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        gameDir = picked.filePaths[0];
                      }
                    await diagnoseGoldbergSetup({ game, gameDir });
                  } catch (err) {
                    remote.dialog.showMessageBoxSync({ type: 'error', title: t('diagnose-failed', 'Diagnose failed', 'Échec du diagnostic'), message: t('could-not-diagnose-the-setup', 'Could not diagnose the setup.', 'Impossible de diagnostiquer la configuration.'), detail: `${err}` });
                  }
                },
              })
            );

            const backupGame = list.find((g) => g.appid == appid);
            if (backupGame?.gameDir && fs.existsSync(backupGame.gameDir)) {
              emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('folder-open.png'),
                  label: $('#game-list').attr('data-ctx-backupgbe') || '',
                  async click() {
                    try {
                      const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                        title: t('where-should-aw-save-the-gbe-goldberg-setup', 'Where should AW save the GBE/Goldberg setup?', 'Où sauvegarder GBE/Goldberg (steam_settings + steam_api) ?'),
                        buttonLabel: t('create-backup', 'Create backup', 'Créer la sauvegarde'),
                        defaultPath: remote.app.getPath('documents'),
                        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
                      });
                      if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                      const result = goldberg.backupSetup({
                        gameDir: backupGame.gameDir,
                        steamSettings: backupGame.steamSettings,
                        destinationRoot: picked.filePaths[0],
                      });
                      rememberGbeBackup({
                        appid,
                        gameDir: backupGame.gameDir,
                        backupDir: result.backupDir,
                        manifest: result.manifest,
                      });
                      const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'info',
                        title: t('gbe-goldberg-backup-created', 'GBE/Goldberg backup created', 'Sauvegarde GBE/Goldberg créée'),
                        message: t('backed-up-x-item-s-steam-settings-steam-dlls', 'Backed up {count} item(s): steam_settings + Steam DLLs.', '{count} élément(s) sauvegardé(s) : steam_settings + DLL Steam.', { count: result.files.length }),
                        detail: formatGbeBackupDetail({ backupDir: result.backupDir, manifest: result.manifest, createdAt: result.manifest?.createdAt }, backupGame),
                        buttons: [t('ok', 'OK', 'OK'), t('open-backup-folder', 'Open backup folder', 'Ouvrir la sauvegarde')],
                        defaultId: 0,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (choice === 1) remote.shell.openPath(result.backupDir);
                    } catch (err) {
                      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'error',
                        title: t('gbe-goldberg-backup-failed', 'GBE/Goldberg backup failed', 'Échec de la sauvegarde GBE/Goldberg'),
                        message: t('could-not-back-up-steam-settings-and-steam-dlls-for-this-game', 'Could not back up steam_settings and Steam DLLs for this game.', 'Impossible de sauvegarder steam_settings et les DLL Steam de ce jeu.'),
                        detail: formatErr(err),
                      });
                    }
                  },
                })
              );

              // Counterpart to "Back up GBE/Goldberg setup": copy the files from a backup folder
              // (one created by the item above, identified by its backup.json manifest) back over the
              // live install - the manual undo for a bad emulator fix / DLC edit / DRM strip.
              emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('redo-alt.png'),
                  label: $('#game-list').attr('data-ctx-restoregbe') || '',
                  async click() {
                    try {
                      let backup = findLatestGbeBackup({ ...backupGame, appid });
                      if (!backup) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('no-known-backup-choose-a-gbe-goldberg-backup-folder', 'No known backup: choose a GBE/Goldberg backup folder', 'Aucune sauvegarde connue : choisir un dossier GBE/Goldberg'),
                          buttonLabel: t('restore-this-folder', 'Restore this folder', 'Restaurer ce dossier'),
                          defaultPath: remote.app.getPath('documents'),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        const backupDir = path.resolve(picked.filePaths[0]);
                        const manifest = backupManifestFor(backupDir);
                        if (!manifest) throw new Error('restore: backup.json manifest is missing - not an AW Next GBE backup');
                        backup = { backupDir, manifest, createdAt: manifest.createdAt, source: 'manual' };
                      }
                      const confirm = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'warning',
                        title: t('restore-gbe-goldberg-backup', 'Restore GBE/Goldberg backup?', 'Restaurer la sauvegarde GBE/Goldberg ?'),
                        message: t('aw-will-restore-the-saved-steam-settings-and-steam-dlls-for-this', 'AW will restore the saved steam_settings and Steam DLLs for this game.', 'AW va restaurer steam_settings et les DLL Steam sauvegardées pour ce jeu.'),
                        detail: formatGbeBackupDetail(backup, backupGame),
                        buttons: [t('cancel', 'Cancel', 'Annuler'), t('restore', 'Restore', 'Restaurer')],
                        defaultId: 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (confirm !== 1) return;
                      const result = goldberg.restoreSetup({
                        backupDir: backup.backupDir,
                        gameDir: backupGame.gameDir,
                      });
                      rememberGbeBackup({
                        appid,
                        gameDir: backupGame.gameDir,
                        backupDir: backup.backupDir,
                        manifest: backup.manifest || result.manifest,
                      });
                      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'info',
                        title: t('gbe-goldberg-restore-complete', 'GBE/Goldberg restore complete', 'Restauration GBE/Goldberg terminée'),
                        message: t('restored-x-item-s', 'Restored {count} item(s).', '{count} élément(s) restauré(s).', { count: result.files.length }),
                        detail: formatGbeBackupDetail({ ...backup, manifest: result.manifest }, { ...backupGame, gameDir: result.gameDir }),
                        noLink: true,
                      });
                    } catch (err) {
                      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'error',
                        title: t('gbe-goldberg-restore-failed', 'GBE/Goldberg restore failed', 'Échec de la restauration GBE/Goldberg'),
                        message: t('could-not-restore-this-gbe-goldberg-backup', 'Could not restore this GBE/Goldberg backup.', 'Impossible de restaurer cette sauvegarde GBE/Goldberg.'),
                        detail: formatErr(err),
                      });
                    }
                  },
                })
              );
            }

            /*
              Ubisoft installs use Uplay R2 instead of the Steam GBE fix. A game with an existing
              setup gets a RE-APPLY option rather than nothing: the automatic/bulk scan stays
              conservative and still refuses those games, but from this menu, no entry at all was
              itself the bug - a repack update or a wrong-appid setup left a game fixable only by
              re-applying, with the item silently missing exactly then.
            */
            const gbeExistingFix = initialGbeEligibility.reason === 'existing-fix' ? initialGbeEligibility.existingFix : null;
            if (!isLegitSteamOwned && !isNativeLauncher && !isUbisoftSource && (initialGbeEligibility.eligible || gbeExistingFix)) {
              emulatorMenu.append(new MenuItem({ type: 'separator' }));
              emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('file-text.png'),
                  label:
                    (gbeExistingFix
                      ? $('#game-list').attr('data-ctx-reinstallgbe') || $('#game-list').attr('data-ctx-installgbe')
                      : $('#game-list').attr('data-ctx-installgbe')) || '',
                  async click() {
                    try {
                      // Re-applying overwrites a setup that is already there, so it asks first and
                      // names what was found. The write path below backs everything up either way.
                      if (gbeExistingFix) {
                        const proceed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'warning',
                          title: t('reapply-gbe-title', 'Re-apply the emulator fix?', 'Ré-appliquer le fix émulateur ?'),
                          message: t('reapply-gbe-message', 'This game already has a setup ({name}). Re-applying replaces it with a freshly generated one.', 'Ce jeu a déjà une configuration ({name}). La ré-appliquer la remplace par une configuration régénérée.', {
                            name: gbeExistingFix.name || '',
                          }),
                          detail: `${gbeExistingFix.path || ''}\n${t('reapply-gbe-detail', 'The current files are backed up first and can be restored from this same menu.', 'Les fichiers actuels sont sauvegardés au préalable et peuvent être restaurés depuis ce même menu.')}`,
                          buttons: [t('cancel', 'Cancel', 'Annuler'), t('reapply-gbe-button', 'Re-apply', 'Ré-appliquer')],
                          defaultId: 0,
                          cancelId: 0,
                          noLink: true,
                        });
                        if (proceed !== 1) return;
                      }
                      // 1 - reuse the install folder discover() already found; only prompt when
                      // it's genuinely unknown (e.g. a manually-added custom-dir game).
                      const game = list.find((g) => g.appid == appid);
                      let gameDir = game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                      if (!gameDir) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('select-install-folder-steam-api', "Select the game's install folder (where steam_api(64).dll should go)", "Sélectionne le dossier d'installation du jeu (où doit aller steam_api(64).dll)"),
                          buttonLabel: t('install-here', 'Install here', 'Installer ici'),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        gameDir = picked.filePaths[0];
                      }

                      // 1a - Create a portable restore point before any write step. CrakFiles remains
                      // the first actual fix applied, but the user can now undo the pre-fix
                      // steam_settings + steam_api(64).dll state from "Restore latest GBE/Goldberg backup".
                      setGameBoxBusy(self, t('backing-up-before-fix', 'Backing up before fix…', 'Sauvegarde avant fix…'));
                      const preFixBackup = createAutomaticGbeBackup({
                        appid,
                        gameDir,
                        steamSettings: game?.steamSettings,
                      });
                      const preFixBackupNote = preFixBackup && preFixBackup.backupDir
                        ? t('n-nbackup-before-fix-nx', '\n\nBackup before fix:\n{dir}', '\n\nSauvegarde avant fix:\n{dir}', { dir: preFixBackup.backupDir })
                        : t('n-nbackup-before-fix-no-existing-steam-settings-steam-api-found', '\n\nBackup before fix: no existing steam_settings / steam_api found.', '\n\nSauvegarde avant fix: aucun steam_settings / steam_api existant.');

                      // Apply a confident CrakFiles fix before the emulator repair.
                      let crackApplied = false;
                      let crackNote = '';
                      if ((app.config?.emulator || {}).autoApplyCrackFix !== false) {
                        try {
                          const crackFix = require(path.join(appPath, 'parser/crackFix.js'));
                          let arch = null;
                          let exe0 = null;
                          try {
                            const pe = require(path.join(appPath, 'util/pe.js'));
                            const emu0 = goldberg.detectEmulator(gameDir);
                            exe0 = exeDetect.detect(gameDir, game?.name || '', { dllPaths: emu0.dll });
                            if (exe0 && exe0.full) arch = pe.exeArch(exe0.full);
                          } catch {}
                          const gameNameCandidates = [game?.name, path.basename(gameDir || ''), path.basename((exe0 && (exe0.full || exe0.name)) || '').replace(/\.exe$/i, '')].filter(Boolean);
                          setGameBoxBusy(self, t('checking-community-crack', 'Checking community crack…', 'Recherche d’un crack communautaire…'));
                          const cf = await crackFix.applyBestFix({
                            cacheDir: path.join(getUserDataPath(), 'cache/crackfiles'),
                            gameName: game?.name || '',
                            gameNames: gameNameCandidates,
                            gameDir,
                            arch,
                            proxyFallback: (app.config?.emulator || {}).pixeldrainProxyFallback !== false,
                            log: debug,
                          });
                          if (cf && cf.applied) {
                            crackApplied = true;
                            crackNote = t(
                              'ncommunity-crack-x-applied-x-file-s',
                              '\nCommunity crack: "{name}" applied ({count} file(s))',
                              '\nCrack communautaire : « {name} » appliqué ({count} fichier(s))',
                              { name: cf.entry?.name, count: (cf.files || []).length }
                            );
                            debug.log(`[${appid}] CrakFiles (manual emu fix): applied "${cf.entry?.name}" via "${cf.matchedName || game?.name}" (${(cf.files || []).length} file(s))`);
                          } else if (cf && cf.skipped && cf.reason === 'already-applied') {
                            crackApplied = true;
                            crackNote = t('ncommunity-crack-x-already-applied', '\nCommunity crack: "{name}" already applied', '\nCrack communautaire : « {name} » déjà appliqué', { name: cf.entry?.name });
                            debug.log(`[${appid}] CrakFiles (manual emu fix): already applied "${cf.entry?.name}" via "${cf.matchedName || game?.name}"`);
                          } else if (cf && cf.reason === 'pixeldrain-unavailable') {
                            // A crack matched but pixeldrain rate-limited it (captcha/paid) - can't be
                            // auto-fetched. Note it so the user knows to grab it manually; the emulator
                            // install still proceeds below.
                            crackNote = t(
                              'ncommunity-crack-found-but-pixeldrain-rate-limited-captcha-requi',
                              '\nCommunity crack found but pixeldrain-rate-limited (captcha required) - download it manually: {url}',
                              '\nCrack communautaire trouvé mais limité par pixeldrain (captcha requis) - à télécharger à la main : {url}',
                              { url: cf.href || '' }
                            );
                            debug.log(`[${appid}] CrakFiles (manual emu fix): pixeldrain-unavailable (${cf.availability}) ${cf.href || ''}`);
                          } else {
                            debug.log(`[${appid}] CrakFiles (manual emu fix): nothing applied (${cf && cf.reason})`);
                          }
                        } catch (e) {
                          debug.log(`[${appid}] CrakFiles (manual emu fix) failed => ${formatErr(e)}`);
                        }
                      }

                      // 1b - if we still don't have a real Steam appid (unconfigured game, no
                      // steam_appid.txt), resolve it interactively with the fuzzy name search and write
                      // it via repair below. Skipped silently when the name yields no candidates.
                      if (!writableAppid && game?.name) {
                        const candidates = await steamParser.findAppidCandidatesByName(game.name, 3);
                        if (candidates.length > 0) {
                          const labels = candidates.map((c) => `${c.name} (${c.appid})`);
                          const pick = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                            type: 'question',
                            title: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
                            message: t('which-game-is-x', 'Which game is "{name}"?', 'Quel jeu est « {name} » ?', { name: game.name }),
                            detail: t('pick-the-match-to-write-the-correct-steam-appid-txt-correct-achi', 'Pick the match to write the correct steam_appid.txt (correct achievements + DLCs), or skip.', 'Choisis la correspondance pour écrire le bon steam_appid.txt (succès + DLC corrects), ou ignore.'),
                            buttons: [...labels, t('skip', 'Skip', 'Ignorer')],
                            defaultId: 0,
                            cancelId: labels.length,
                            noLink: true,
                          });
                          if (pick.response < candidates.length) writableAppid = candidates[pick.response].appid;
                        }
                      }

                      // 2 - detect where the dll currently lives. Both arches are handled: an existing
                      // steam_api.dll and/or steam_api64.dll is replaced in place; a folder with
                      // neither (fresh manual install) gets a 64-bit dll by default.
                      setGameBoxBusy(self, t('preparing', 'Preparing…', 'Préparation…'));
                      const emu = goldberg.detectEmulator(gameDir);
                      const detectedRuntimeExe = exeDetect.detect(gameDir, game?.name || '', { dllPaths: emu.dll });
                      const dllDirs = gbeInstaller.runtimeDllDirs({
                        gameDir,
                        dllPaths: emu.dll,
                        exePath: detectedRuntimeExe && detectedRuntimeExe.full,
                        steamSettings: emu.steamSettings,
                        fallbackDir: gameDir,
                      });

                      // Emulator setup is driven by the Settings → Emulator section: Regular DLL setup,
                      // optional Steamless pre-unpack, and whether to re-check GitHub for a newer GBE build.
                      const emuCfg = app.config?.emulator || {};
                      const forceUpdate = emuCfg.checkUpdates !== false;

                      // Advanced steam_settings: shell out to generate_emu_config for deeper
                      // coverage (depots, languages, stats, branches), merged into the game's
                      // steam_settings without clobbering AW's own achievements.json/configs. Optional
                      // Steam login (THROWAWAY account) pulls data Steam hides anonymously; the Steam
                      // Guard prompt is forwarded to the in-app text prompt. Returns a one-line note.
                      const runAdvanced = async (steamSettingsDirs) => {
                        if (emuCfg.steamSettingsMode !== 'advanced') return '';
                        if (!/^[0-9]+$/.test(String(writableAppid || ''))) {
                          return '\n' + t('diagnosis-advanced-data-skipped', 'Advanced data: skipped (no numeric AppID)', 'Données avancées : ignorées (AppID numérique absent)');
                        }
                        let login = null;
                        if (emuCfg.login === 'steam') {
                          // Prefer the credentials saved in Settings → Emulator; only prompt for what's missing.
                          let user = emuCfg.loginAccountName;
                          let pass = emuCfg.loginPassword;
                          if (!user)
                            user = await promptText(
                              t('steam-username-throwaway-account-only', 'Steam username (THROWAWAY account only):', 'Identifiant Steam (COMPTE JETABLE uniquement) :'),
                              ''
                            );
                          if (!user) return '\n' + t('diagnosis-advanced-data-login-cancelled', 'Advanced data: login cancelled', 'Données avancées : connexion annulée');
                          if (!pass) pass = await promptText(t('steam-password', 'Steam password:', 'Mot de passe Steam :'), '', 'password');
                          if (!pass) return '\n' + t('diagnosis-advanced-data-login-cancelled', 'Advanced data: login cancelled', 'Données avancées : connexion annulée');
                          login = { username: user, password: pass };
                        }
                        try {
                          setGameBoxBusy(self, t('advanced-data-generate-emu-config', 'Advanced data (generate_emu_config)…', 'Données avancées (generate_emu_config)…'));
                          const genEmu = require(path.join(appPath, 'parser/genEmuConfig.js'));
                          const tool = await genEmu.ensureGenerateEmuConfig({
                            cacheDir: path.join(getUserDataPath(), 'cache/gse_emu_config'),
                            preferredTag: dlls && dlls.tag ? dlls.tag : null,
                            log: debug,
                          });
                          const onPrompt = (q) => promptText(`generate_emu_config - ${q}`);
                          const res = await genEmu.generate({ tool, appid: writableAppid, login, onPrompt, log: debug });
                          let added = 0;
                          for (const dir of steamSettingsDirs) added += genEmu.mergeIntoGame(res.steamSettings, dir).length;
                          try {
                            fs.rmSync(res.workDir, { recursive: true, force: true });
                          } catch {}
                          return (
                            '\n' +
                            t('diagnosis-advanced-data-merged', 'Advanced data: merged {count} extra file(s) (generate_emu_config {tag})', 'Données avancées : {count} fichier(s) supplémentaire(s) fusionné(s) (generate_emu_config {tag})', {
                              count: added,
                              tag: tool.tag || '',
                            })
                          );
                        } catch (e) {
                          return '\n' + t('diagnosis-advanced-data-failed', 'Advanced data: {error}', 'Données avancées : {error}', { error: e.message || e });
                        }
                      };

                      let drmNote = '';
                      // Read below (Steam API check bypass): only meaningful with a SteamStub-wrapped
                      // exe - see that block for why.
                      let hasSteamStub = false;

                      // SteamStub: strip it with Steamless so the plain DLL works (the SteamAutoCrack
                      // way). There is no ColdClient fallback - if Steamless can't strip a detected stub
                      // the plain DLL is still installed and the game may fail to launch.
                      try {
                        const pe = require(path.join(appPath, 'util/pe.js'));
                        // Skip DRM stripping when the community crack already replaced the runtime - a
                        // cracked exe is DRM-free, same call the auto flow makes.
                        hasSteamStub = !crackApplied && !!(detectedRuntimeExe && detectedRuntimeExe.full && pe.detectSteamStub(detectedRuntimeExe.full));
                        const shouldRunSteamless = !crackApplied && !!(detectedRuntimeExe && detectedRuntimeExe.full && (emuCfg.steamlessAutoUnpack || hasSteamStub));
                        if (shouldRunSteamless) {
                          setGameBoxBusy(self, t('downloading-steamless', 'Downloading Steamless…', 'Téléchargement de Steamless…'));
                          const steamlessMod = require(path.join(appPath, 'parser/steamless.js'));
                          let stripped = false;
                          let reason = '';
                          try {
                            const cli = await steamlessMod.ensureSteamless({ cacheDir: path.join(getUserDataPath(), 'cache/steamless'), log: debug });
                            setGameBoxBusy(self, t('removing-drm', 'Removing DRM…', 'Retrait du DRM…'));
                            const r = await steamlessMod.stripDrm({ steamless: cli, exePath: detectedRuntimeExe.full, experimental: !!emuCfg.steamlessExperimental, log: debug });
                            stripped = !!(r && r.stripped);
                            reason = (r && r.reason) || '';
                          } catch (e) {
                            reason = e.message || String(e);
                            debug.log(`[${appid}] Steamless failed => ${e}`);
                          }
                          if (stripped) {
                            drmNote = t('ndrm-steamstub-removed-x', '\nDRM: SteamStub removed ({exe})', '\nDRM : SteamStub retiré ({exe})', { exe: path.basename(detectedRuntimeExe.full) });
                          } else if (hasSteamStub) {
                            drmNote = t('ndrm-steamstub-present-steamless-failed-x-the-plain-dll-may-not-', '\nDRM: SteamStub present, Steamless failed ({reason}); the plain DLL may not load', '\nDRM : SteamStub présent, Steamless a échoué ({reason}) ; la DLL seule risque de ne pas charger', { reason });
                          } else if (emuCfg.steamlessAutoUnpack) {
                            drmNote = t('ndrm-x', '\nDRM: {label}', '\nDRM : {label}', {
                              label: reason === 'no-steamstub' ? t('noSteamStub', 'no SteamStub', 'pas de SteamStub') : reason,
                            });
                          }
                        }
                      } catch (e) {
                        debug.log(`[${appid}] DRM auto-detect skipped => ${e}`);
                      }

                      // Download/cache the GBE Fork build (steam_api DLLs).
                      setGameBoxBusy(self, t('downloading-gbe-fork', 'Downloading GBE Fork…', 'Téléchargement de GBE Fork…'));
                      const cacheDir = path.join(getUserDataPath(), 'cache/gse_fork');
                      const dlls = await gbeInstaller.ensureEmulatorDlls({ cacheDir, force: forceUpdate, log: debug });

                      // GBE/GSE setup requires steam_interfaces.txt generated from the
                      // original game steam_api DLL. Run the matching bundled tool before replacing
                      // anything; on a repeated repair generateInterfaces prefers the original .bak.
                      const runtimeDirKeys = new Set(dllDirs.map((dir) => path.resolve(dir).toLowerCase()));
                      const interfaceDlls = emu.dll.filter(
                        (file) => /^steam_api(64)?\.dll$/i.test(path.basename(file)) && runtimeDirKeys.has(path.resolve(path.dirname(file)).toLowerCase())
                      );
                      for (const dllPath of interfaceDlls) {
                        const dest = path.join(path.dirname(dllPath), 'steam_settings');
                        const interfaces = await gbeInstaller.generateInterfaces({ dllPath, steamSettings: dest, dlls, log: debug });
                        if (!interfaces.generated) debug.log(`[${writableAppid}] steam_interfaces.txt skipped (${interfaces.reason})`);
                      }

                      {
                        // Standalone (replace steam_api dll) - the only emulator-apply path
                        setGameBoxBusy(self, t('installing-the-dll', 'Installing the DLL…', 'Installation de la DLL…'));
                        const pe = require(path.join(appPath, 'util/pe.js'));
                        const missingArch = detectedRuntimeExe && detectedRuntimeExe.full ? pe.exeArch(detectedRuntimeExe.full) : 'x64';
                        const installResult = gbeInstaller.installDlls({
                          dllDirs,
                          dlls,
                          writeIfMissing: missingArch || 'x64',
                          log: debug,
                        });
                        // Pre-create both GBE Fork and classic Goldberg runtime folders. PSPC/repack
                        // guides mention both, and discovery dedupes them by appid once real state exists.
                        try {
                          if (process.env.APPDATA) {
                            fs.mkdirSync(path.join(process.env.APPDATA, 'GSE Saves', String(writableAppid)), { recursive: true });
                            fs.mkdirSync(path.join(process.env.APPDATA, 'Goldberg SteamEmu Saves', String(writableAppid)), { recursive: true });
                          }
                        } catch (e) {
                          debug.log(`[${writableAppid}] could not pre-create Goldberg/GBE save folder => ${e}`);
                        }
                        /*
                          Optional, opt-in: SteamAutoCrack's Steam API ownership-check bypass (proxy DLL).
                          It redirects steam_api64.dll back to the pre-swap original on the exe's
                          FIRST access, so a SteamStub integrity re-check (which runs before the
                          game's own Steam init) sees the untouched DLL and passes. Windows loads a
                          DLL once per process: without a re-check to absorb that first access, the
                          redirect lands on the real runtime load instead and the GBE Fork DLL is
                          never reached.
                        */
                        if (emuCfg.apiCheckBypass && hasSteamStub && detectedRuntimeExe && detectedRuntimeExe.full) {
                          try {
                            const apiCheckBypass = require(path.join(appPath, 'parser/apiCheckBypass.js'));
                            setGameBoxBusy(self, t('steam-api-check-bypass', 'Steam API check bypass…', 'Contournement du contrôle API Steam…'));
                            const bypassDlls = await apiCheckBypass.ensureBypassDlls({ cacheDir: path.join(getUserDataPath(), 'cache/api_check_bypass'), log: debug });
                            const rb = apiCheckBypass.applyBypass({ gameDir, exePath: detectedRuntimeExe.full, dlls: bypassDlls, log: debug });
                            debug.log(`[${writableAppid}] Steam API check bypass: ${rb.applied ? `applied (${rb.dll})` : `skipped (${rb.reason})`}`);
                          } catch (e) {
                            debug.log(`[${writableAppid}] Steam API check bypass failed => ${e}`);
                          }
                        }
                        setGameBoxBusy(self, t('configuring-achievements-dlcs', 'Configuring (achievements + DLCs)…', 'Configuration (succès + DLC)…'));
                        let repairedDirs = 0;
                        const diagnosisLines = [];
                        const repairErrors = [];
                        for (const dir of dllDirs) {
                          const result = await diagnoseGoldbergSetup({ game, gameDir: dir, autoRepair: true, showDialog: false });
                          if (result.repaired) repairedDirs++;
                          if (result.repairError) repairErrors.push(`${dir}: ${result.repairError.message || result.repairError}`);
                          diagnosisLines.push(
                            t('diagnosis-dir-status-line', '{dir}: {status}', '{dir} : {status}', {
                              dir,
                              status: result.report.ok
                                ? t('diagnosis-dir-status-ok', 'ok', 'ok')
                                : t('diagnosis-dir-status-attention', 'needs attention', 'à vérifier'),
                            })
                          );
                        }
                        const regAdvNote = await runAdvanced(dllDirs.map((d) => path.join(d, 'steam_settings')));
                        const installedDlls = [...new Set(installResult.perDir.flatMap((d) => d.wrote))].join(', ') || 'steam_api64.dll';
                        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'info',
                          title: t('gbe-fork-installed', 'GBE Fork installed', 'GBE Fork installé'),
                          message: t('gbe-fork-installed-message', '{installed} installed to {count} location(s)', '{installed} installée(s) dans {count} emplacement(s)', {
                            installed: installedDlls,
                            count: installResult.installed,
                          }),
                          detail:
                            dllDirs.join('\n') +
                            '\n\n' +
                            t('diagnosis-version', 'Version: {version}', 'Version : {version}', {
                              version: dlls.tag || t('diagnosis-version-unknown', 'unknown', 'inconnue'),
                            }) +
                            (installResult.backedUp > 0
                              ? '\n' +
                                t('diagnosis-dlls-backed-up-locations', 'Existing dll(s) backed up as *.bak in {count} location(s)', 'Dll(s) existante(s) sauvegardée(s) en .bak dans {count} emplacement(s)', {
                                  count: installResult.backedUp,
                                })
                              : '') +
                            preFixBackupNote +
                            crackNote +
                            drmNote +
                            '\n\n' +
                            t('diagnosis-after-install', 'Diagnostic after install:', 'Diagnostic après installation :') +
                            '\n' +
                            diagnosisLines.join('\n') +
                            (repairedDirs > 0
                              ? '\n\n' +
                                t('diagnosis-auto-repaired-steam-settings', 'Auto-repaired steam_settings (schema + icons + DLCs) in {count} location(s)', 'steam_settings réparé automatiquement (schéma + icônes + DLC) dans {count} emplacement(s)', {
                                  count: repairedDirs,
                                })
                              : '') +
                            (repairErrors.length > 0
                              ? '\n' +
                                t('diagnosis-auto-repair-failed-for', 'Auto-repair failed for: {paths}', 'La réparation automatique a échoué pour : {paths}', {
                                  paths: repairErrors.join('; '),
                                })
                              : '') +
                            regAdvNote,
                          noLink: true,
                        });
                      }
                    } catch (err) {
                      remote.dialog.showMessageBoxSync({
                        type: 'error',
                        title: t('gbe-fork-install-failed', 'GBE Fork install failed', 'Échec de l\'installation de GBE Fork'),
                        message: t('could-not-download-or-install-gbe-fork', 'Could not download or install GBE Fork.', 'Impossible de télécharger ou d\'installer GBE Fork.'),
                        detail: formatErr(err),
                      });
                    } finally {
                      clearGameBoxBusy(self);
                    }
                  },
                })
              );

              // These advanced file-rewriting actions remain hidden for a manually-added library
              // entry. Its basic GBE diagnosis/config tools above are enough for an explicit opt-in.
              if (!isManualGame) emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('file-text.png'),
                  label: $('#game-list').attr('data-ctx-removedrm') || '',
                  async click() {
                    try {
                      const game = list.find((g) => g.appid == appid);
                      let gameDir = game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                      if (!gameDir) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('select-game-install-folder', "Select the game's install folder", "Choisir le dossier d'installation du jeu"),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        gameDir = picked.filePaths[0];
                      }

                      // Detect the main game exe (name-aware); let the user override the guess.
                      const emu = goldberg.detectEmulator(gameDir);
                      const detected = exeDetect.detect(gameDir, game?.name || '', { dllPaths: emu.dll });
                      let exePath = detected && detected.full ? detected.full : null;

                      const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                        type: 'question',
                        title: t('remove-steam-drm-steamless', 'Remove Steam DRM (Steamless)', 'Retirer le DRM Steam (Steamless)'),
                        message: exePath
                          ? t('remove-steamstub-from-x', 'Remove SteamStub from: {exe}?', 'Retirer le SteamStub de : {exe} ?', { exe: path.basename(exePath) })
                          : t('no-exe-detected-choose-one', 'No exe detected - choose one?', 'Aucun exe détecté - en choisir un ?'),
                        detail: t(
                          'steamless-detail',
                          'Modifies the game executable (the original is kept as .steamstub.bak). No effect if the game has no SteamStub DRM.',
                          "Modifie l'exécutable du jeu (l'original est conservé en .steamstub.bak). Sans effet si le jeu n'a pas de DRM SteamStub."
                        ),
                        buttons: [t('cancel', 'Cancel', 'Annuler'), t('choose-an-exe', 'Choose an .exe…', 'Choisir un .exe…'), t('remove-drm', 'Remove DRM', 'Retirer le DRM')],
                        defaultId: exePath ? 2 : 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (confirm.response === 0) return;
                      if (confirm.response === 1) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('select-game-executable', 'Select the game executable', "Choisir l'exécutable du jeu"),
                          defaultPath: gameDir,
                          filters: [{ name: 'Executable', extensions: ['exe'] }],
                          properties: ['openFile', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        exePath = picked.filePaths[0];
                      }
                      if (!exePath) return;

                      setGameBoxBusy(self, t('downloading-steamless', 'Downloading Steamless…', 'Téléchargement de Steamless…'));
                      const steamlessMod = require(path.join(appPath, 'parser/steamless.js'));
                      const cli = await steamlessMod.ensureSteamless({ cacheDir: path.join(getUserDataPath(), 'cache/steamless'), log: debug });
                      setGameBoxBusy(self, t('removing-drm', 'Removing DRM…', 'Retrait du DRM…'));
                      const result = await steamlessMod.stripDrm({ steamless: cli, exePath, log: debug });

                      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: result.stripped ? 'info' : 'warning',
                        title: t('steamless', 'Steamless'),
                        message: result.stripped
                          ? t('steamstub-drm-removed', 'SteamStub DRM removed.', 'DRM SteamStub retiré.')
                          : result.reason === 'no-steamstub'
                          ? t('no-steamstub-drm-detected-exe-left-unchanged', 'No SteamStub DRM detected - exe left unchanged.', 'Aucun DRM SteamStub détecté - exe inchangé.')
                          : t('drm-removal-failed', 'DRM removal failed.', 'Échec du retrait du DRM.'),
                        detail:
                          path.basename(exePath) +
                          (result.stripped ? `\n${t('original-kept-as', 'Original kept as:', 'Original conservé :')} ${path.basename(result.backup)}` : '') +
                          (result.reason && result.reason !== 'no-steamstub' && result.reason !== 'unpacked' ? `\n${result.reason}` : '') +
                          `\n\nSteamless ${cli.tag || ''}`,
                        noLink: true,
                      });
                    } catch (err) {
                      remote.dialog.showMessageBoxSync({
                        type: 'error',
                        title: t('steamless-failed', 'Steamless failed', 'Échec de Steamless'),
                        message: t('could-not-remove-the-steam-drm', 'Could not remove the Steam DRM.', 'Impossible de retirer le DRM Steam.'),
                        detail: `${err}`,
                      });
                    } finally {
                      clearGameBoxBusy(self);
                    }
                  },
                })
              );

              if (!isManualGame) appendCrackFixItem();
            }
            }

            // Ubisoft/uPlay counterpart of the GBE Fork block above: maps the game to its Steam
            // equivalent, writes a matching achievements_schema.json for the Uplay R2 loader, and
            // redirects its save path into %AppData%\GSE Saves\<steamAppid> - already read by AW.
            if (isUplayR2Source) {
              if (emulatorMenu.items.length) {
                emulatorMenu.append(new MenuItem({ type: 'separator' }));
              }

              const diagnoseUplayR2Setup = async ({ game, gameDir, showDialog = true }) => {
                const identity = uplayR2.resolveGameIdentity({ ...(game || {}), appid, gameDir }, appid);
                const report = uplayR2.diagnose({ gameDir, appid, name: game?.name, mapping: identity.mapping });
                if (showDialog) {
                  const lines = [];
                  lines.push(
                    report.mapping
                      ? t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
                          appid: report.mapping.steam_appid,
                          name: report.mapping.steam_name,
                        })
                      : t('diagnosis-steam-appid-not-resolved', 'Steam AppID: not resolved', 'Steam AppID : non résolu')
                  );
                  lines.push('');
                  for (const issue of report.issues) lines.push(`[${issue.level}] ${issue.code}: ${issue.message}`);
                  remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                    type: report.ok ? 'info' : 'warning',
                    title: t('uplay-r2-diagnosis-title', 'Uplay R2 diagnosis - {gameName}', 'Diagnostic Uplay R2 - {gameName}', { gameName: game?.name || appid }),
                    message: report.ok
                      ? t('setupLooksValid', 'Setup looks valid.', 'La configuration semble valide.')
                      : t('problemsWereDetected', 'Problems were detected.', 'Des problèmes ont été détectés.'),
                    detail: lines.join('\n'),
                    noLink: true,
                  });
                }
                return report;
              };

              emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('file-text.png'),
                  label:
                    $('#game-list').attr('data-ctx-installuplayr2') ||
                    t('apply-emulator-fix-uplay-r2', 'Apply emulator fix (Uplay R2)…', 'Appliquer le correctif émulateur (Uplay R2)…'),
                  async click() {
                    try {
                      const game = list.find((g) => g.appid == appid);
                      let gameDir = game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                      if (!gameDir) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('select-install-folder-uplay-r2-loader', "Select the game's install folder (where the Uplay R2 loader .dll should go)", "Sélectionne le dossier d'installation du jeu (où doit aller la .dll du loader Uplay R2)"),
                          buttonLabel: t('install-here', 'Install here', 'Installer ici'),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        gameDir = picked.filePaths[0];
                      }

                      await applyUplayR2Repair({ game, gameDir, appid, box: self, interactive: true, showResult: true });
                    } catch (err) {
                      remote.dialog.showMessageBoxSync({
                        type: 'error',
                        title: t('uplay-r2-install-failed', 'Uplay R2 install failed', 'Échec de l\'installation de Uplay R2'),
                        message: t('could-not-install-or-configure-goldberg-uplay-r2', 'Could not install or configure Goldberg Uplay R2.', 'Impossible d\'installer ou de configurer Goldberg Uplay R2.'),
                        detail: formatErr(err),
                      });
                    } finally {
                      clearGameBoxBusy(self);
                    }
                  },
                })
              );

              emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('file-text.png'),
                  label:
                    $('#game-list').attr('data-ctx-diagnoseuplayr2') ||
                    t('diagnose-uplay-r2-setup', 'Diagnose Uplay R2 setup', 'Diagnostiquer la configuration Uplay R2'),
                  async click() {
                    try {
                      const game = list.find((g) => g.appid == appid);
                      let gameDir = game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                      if (!gameDir) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('select-install-folder-uplay-r2-loader-diagnose', "Select the game's install folder (where the Uplay R2 loader .dll is)", "Sélectionne le dossier d'installation du jeu (où se trouve la .dll du loader Uplay R2)"),
                          buttonLabel: t('diagnose', 'Diagnose', 'Diagnostiquer'),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        gameDir = picked.filePaths[0];
                      }
                      await diagnoseUplayR2Setup({ game, gameDir });
                    } catch (err) {
                      remote.dialog.showMessageBoxSync({ type: 'error', title: t('diagnose-failed', 'Diagnose failed', 'Échec du diagnostic'), message: t('could-not-diagnose-the-uplay-r2-setup', 'Could not diagnose the Uplay R2 setup.', 'Impossible de diagnostiquer la configuration Uplay R2.'), detail: `${err}` });
                    }
                  },
                })
              );

              emulatorMenu.append(
                new MenuItem({
                  icon: menuIcon('steam.png'),
                  label: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
                  async click() {
                    try {
                      const game = list.find((g) => g.appid == appid);
                      let gameDir = game?.gameDir && fs.existsSync(game.gameDir) ? game.gameDir : null;
                      if (!gameDir) {
                        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
                          title: t('select-game-install-folder', "Select the game's install folder", "Choisir le dossier d'installation du jeu"),
                          properties: ['openDirectory', 'dontAddToRecent'],
                        });
                        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
                        gameDir = picked.filePaths[0];
                      }
                      await replaceUplayR2SteamMapping({ game, gameDir, appid, box: self });
                    } catch (err) {
                      remote.dialog.showMessageBoxSync({
                        type: 'error',
                        title: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
                        message: t(
                          'the-uplay-r2-fix-needs-the-steam-version-of-the-game-to-fetch-th',
                          'The Uplay R2 fix needs the Steam version of the game to fetch the achievement schema.',
                          'Le fix Uplay R2 a besoin de la version Steam du jeu pour récupérer le schéma des succès.'
                        ),
                        detail: formatErr(err),
                      });
                    } finally {
                      clearGameBoxBusy(self);
                    }
                  },
                })
              );

              // Undo the last fix. Every Uplay R2 repair snapshots the schema + ini files it is about
              // to overwrite, but nothing could read those back - the Steam side has had its
              // "restore a backup" entry from the start, which is most of why this submenu looked so
              // much thinner. Only offered when a snapshot actually exists.
              {
                const restoreDir = ctxGame?.gameDir && fs.existsSync(ctxGame.gameDir) ? ctxGame.gameDir : null;
                const backups = restoreDir ? uplayR2.listConfigBackups(restoreDir) : [];
                if (backups.length > 0) {
                  emulatorMenu.append(
                    new MenuItem({
                      icon: menuIcon('redo-alt.png'),
                      label:
                        $('#game-list').attr('data-ctx-restoreuplayr2') ||
                        t('restore-uplay-r2-config', 'Restore the previous Uplay R2 configuration…', 'Restaurer la configuration Uplay R2 précédente…'),
                      async click() {
                        try {
                          const latest = backups[0];
                          const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                            type: 'question',
                            buttons: [t('restore', 'Restore', 'Restaurer'), t('cancel', 'Cancel', 'Annuler')],
                            defaultId: 0,
                            cancelId: 1,
                            title: t('restore-uplay-r2-title', 'Restore Uplay R2 configuration', 'Restaurer la configuration Uplay R2'),
                            message: t(
                              'restore-uplay-r2-message',
                              'Restore the snapshot taken before the last repair?',
                              'Restaurer la sauvegarde prise avant la dernière réparation ?'
                            ),
                            detail: `${latest.name}\n${latest.files.join('\n')}`,
                            noLink: true,
                          });
                          if (confirmed !== 0) return;
                          const result = uplayR2.restoreConfigBackup({ dir: restoreDir, backup: latest });
                          remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                            type: 'info',
                            title: t('restore-uplay-r2-title', 'Restore Uplay R2 configuration', 'Restaurer la configuration Uplay R2'),
                            message: t('restore-uplay-r2-done', 'Configuration restored.', 'Configuration restaurée.'),
                            detail: [...result.restored, ...result.removed.map((file) => `[-] ${file}`)].join('\n'),
                            noLink: true,
                          });
                        } catch (err) {
                          remote.dialog.showMessageBoxSync({
                            type: 'error',
                            title: t('restore-failed', 'Restore failed', 'Échec de la restauration'),
                            message: t('could-not-restore-the-uplay-r2-setup', 'Could not restore the Uplay R2 configuration.', 'Impossible de restaurer la configuration Uplay R2.'),
                            detail: `${err}`,
                          });
                        }
                      },
                    })
                  );
                }
              }

              // A cracked Ubisoft game is exactly what the CrakFiles list is full of, and the entry
              // needs nothing Steam-specific - it was simply unreachable from this branch.
              appendCrackFixItem();

              emulatorMenu.append(new MenuItem({ type: 'separator' }));
              emulatorMenu.append(
                new MenuItem({
                  label: t('refresh-game-data', 'Refresh game data', 'Actualiser les données du jeu'),
                  click() {
                    app.onStart();
                  },
                })
              );
              if (ubisoftTools.steamAppid) {
                emulatorMenu.append(
                  new MenuItem({
                    label: `${t('copy-steam-appid', 'Copy Steam AppID', 'Copier l’AppID Steam')} (${ubisoftTools.steamAppid})`,
                    click() {
                      clipboard.writeText(ubisoftTools.steamAppid);
                    },
                  })
                );
              }
              if (ubisoftTools.uplayId) {
                emulatorMenu.append(
                  new MenuItem({
                    label: `${t('copy-ubisoft-product-id', 'Copy Ubisoft product ID', 'Copier l’ID produit Ubisoft')} (${ubisoftTools.uplayId})`,
                    click() {
                      clipboard.writeText(ubisoftTools.uplayId);
                    },
                  })
                );
              }
            }

            // Open the actual game install folder, when AW managed to resolve one (Goldberg/GBE scan
            // or name-based folder match).
            const gameForDir = list.find((g) => g.appid == appid);
            if (gameForDir?.gameDir && fs.existsSync(gameForDir.gameDir)) {
              folderMenu.append(
                new MenuItem({
                  icon: menuIcon('folder-open.png'),
                  label: $('#game-list').attr('data-ctx-installloc') || '',
                  click() {
                    remote.shell.openPath(gameForDir.gameDir);
                  },
                })
              );
            }

            // Keep the top-level menu short, while retaining the useful maintenance paths. Some
            // sources point at the save FILE itself, so reveal it rather than trying to open a file
            // as a folder.
            const revealDataPath = (target) => {
              try {
                if (!fs.existsSync(target)) return;
                if (fs.statSync(target).isDirectory()) remote.shell.openPath(target);
                else remote.shell.showItemInFolder(target);
              } catch (err) {
                debug.error(err);
              }
            };
            // A merged card can have several sources. Keep each real source available in one
            // submenu instead of silently picking a fallback or filling the parent menu with paths.
            const seenDataPaths = new Set();
            const dataPaths = (gameForDir?.dataPaths?.length ? gameForDir.dataPaths : [{ source: '', path: gameForDir?.dataPath }]).filter(
              (entry) => {
                if (!entry.path || seenDataPaths.has(entry.path) || !fs.existsSync(entry.path)) return false;
                seenDataPaths.add(entry.path);
                return true;
              }
            );
            if (dataPaths.length) {
              const dataMenu = new Menu();
              const segments = (folderPath) => folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
              const rootOf = (folderPath) => segments(folderPath).slice(-2)[0] || segments(folderPath).pop() || folderPath;
              const labels = dataPaths.map((entry) => entry.source || rootOf(entry.path));
              const labelCounts = labels.reduce((counts, label) => counts.set(label, (counts.get(label) || 0) + 1), new Map());
              dataPaths.forEach((entry, index) => {
                const label = labels[index];
                dataMenu.append(
                  new MenuItem({
                    icon: menuIcon('folder-open.png'),
                    label: labelCounts.get(label) > 1 ? `${label} - ${rootOf(entry.path)}` : label,
                    click: () => revealDataPath(entry.path),
                  })
                );
              });
              dataMenu.append(new MenuItem({ type: 'separator' }));
              dataMenu.append(
                new MenuItem({
                  label: t('copy-achievement-data-path', 'Copy achievement data path', 'Copier le chemin des données de succès'),
                  click() {
                    clipboard.writeText(dataPaths.map((entry) => entry.path).join('\r\n'));
                  },
                })
              );
              folderMenu.append(
                new MenuItem({
                  icon: menuIcon('folder-open.png'),
                  label: t('achievement-data-folders', 'Achievement data', 'Données de succès'),
                  submenu: dataMenu,
                })
              );
            }

            const cacheMenu = new Menu();
            cacheMenu.append(
              new MenuItem({
                icon: menuIcon('folder-open.png'),
                label: $('#game-list').attr('data-ctx-iconcache') || '',
                click() {
                  remote.shell.openPath(path.join(getUserDataPath(), 'steam_cache', 'icon', catalogAppid || `${appid}`));
                },
              })
            );
            cacheMenu.append(
              new MenuItem({
                icon: menuIcon('folder-open.png'),
                label: $('#game-list').attr('data-ctx-dbcache') || '',
                click() {
                  remote.shell.showItemInFolder(
                    path.join(getUserDataPath(), 'steam_cache', 'schema', `${app.config.achievement.lang}`, `${catalogAppid || appid}.db`)
                  );
                },
              })
            );
            folderMenu.append(
              new MenuItem({
                icon: menuIcon('folder-open.png'),
                label: t('cache-folders', 'Caches', 'Caches'),
                submenu: cacheMenu,
              })
            );

            // Catalog links use the mapped Steam appid for Ubisoft records (including namespaced
            // uplay-<productId> official entries). Never emit broken URLs with a local/native id.
            if (/^[0-9]+$/.test(catalogAppid)) {
              linkMenu.append(
                new MenuItem({
                  icon: menuIcon('globe.png'),
                  label: 'Steam',
                  click() {
                    openSteamTarget(steamClientLinks.steamStoreUrl, catalogAppid);
                  },
                })
              );
              linkMenu.append(
                new MenuItem({
                  icon: menuIcon('globe.png'),
                  label: 'SteamDB',
                  click() {
                    remote.shell.openExternal(`https://steamdb.info/app/${catalogAppid}/`);
                  },
                })
              );
              linkMenu.append(
                new MenuItem({
                  icon: menuIcon('globe.png'),
                  label: 'PCGamingWiki',
                  click() {
                    remote.shell.openExternal(`https://pcgamingwiki.com/api/appid.php?appid=${catalogAppid}`);
                  },
                })
              );
              linkMenu.append(
                new MenuItem({
                  icon: menuIcon('globe.png'),
                  label: 'SteamHunters',
                  click() {
                    remote.shell.openExternal(`https://steamhunters.com/apps/${catalogAppid}/achievements`);
                  },
                })
              );
              linkMenu.append(
                new MenuItem({
                  icon: menuIcon('globe.png'),
                  label: 'Steam Community',
                  click() {
                    openSteamTarget(steamClientLinks.steamGameHubUrl, catalogAppid);
                  },
                })
              );
            }

            // Platform metadata links: non-Steam sources get a
            // store/search page plus PCGamingWiki instead of Steam-only links.
            const linkGame = list.find((g) => g.appid == appid);
            const linkName = encodeURIComponent((linkGame && linkGame.name) || '');
            const sourceLower = String((linkGame && linkGame.source) || '').toLowerCase();
            const globeIcon = () => menuIcon('globe.png');
            const hasLink = (label) => linkMenu.items.some((item) => item.label === label);
            const addPcgw = (label) => {
              if (hasLink(label)) return;
              linkMenu.append(
                new MenuItem({
                  icon: globeIcon(),
                  label,
                  click() {
                    remote.shell.openExternal(`https://pcgamingwiki.com/w/index.php?search=${linkName}`);
                  },
                })
              );
            };
            if (linkName) {
              if (sourceLower.startsWith('epic')) {
                linkMenu.append(
                  new MenuItem({
                    icon: globeIcon(),
                    label: 'Epic Games Store',
                    click() {
                      remote.shell.openExternal(`https://store.epicgames.com/search?q=${linkName}`);
                    },
                  })
                );
                addPcgw('PCGamingWiki');
              } else if (sourceLower.startsWith('gog')) {
                linkMenu.append(
                  new MenuItem({
                    icon: globeIcon(),
                    label: 'GOG',
                    click() {
                      remote.shell.openExternal(`https://www.gog.com/games?search=${linkName}`);
                    },
                  })
                );
                addPcgw('PCGamingWiki');
              } else if (sourceLower === 'ea') {
                linkMenu.append(
                  new MenuItem({
                    icon: globeIcon(),
                    label: 'EA',
                    click() {
                      remote.shell.openExternal(`https://www.ea.com/search?q=${linkName}`);
                    },
                  })
                );
                addPcgw('PCGamingWiki');
              } else if (sourceLower.includes('rpcs3')) {
                linkMenu.append(
                  new MenuItem({
                    icon: globeIcon(),
                    label: 'RPCS3 Wiki',
                    click() {
                      remote.shell.openExternal(`https://wiki.rpcs3.net/index.php?search=${linkName}`);
                    },
                  })
                );
                addPcgw('PCGamingWiki');
              } else if (sourceLower.includes('shadps4') || sourceLower.includes('xenia')) {
                addPcgw('PCGamingWiki');
              } else if (sourceLower.includes('uplay') || sourceLower === 'lumaplay' || sourceLower.includes('ubisoft')) {
                linkMenu.append(
                  new MenuItem({
                    icon: globeIcon(),
                    label: 'Ubisoft Store',
                    click() {
                      remote.shell.openExternal(`https://store.ubi.com/us/search?q=${linkName}`);
                    },
                  })
                );
                addPcgw('PCGamingWiki');
              }
            }
          }

          // Console-style manual entries skip the PC tools above but still need safe navigation and
          // catalog links. PC manual entries already received those common items in the main block.
          if (isManualGame && isConsoleSystem) {
            if (ctxGame?.gameDir && fs.existsSync(ctxGame.gameDir)) {
              folderMenu.append(
                new MenuItem({
                  icon: menuIcon('folder-open.png'),
                  label: $('#game-list').attr('data-ctx-installloc') || '',
                  click() {
                    remote.shell.openPath(ctxGame.gameDir);
                  },
                })
              );
            }
            if (/^[0-9]+$/.test(catalogAppid)) {
              for (const [label, url] of [
                ['Steam', `https://store.steampowered.com/app/${catalogAppid}/`],
                ['SteamDB', `https://steamdb.info/app/${catalogAppid}/`],
                ['PCGamingWiki', `https://pcgamingwiki.com/api/appid.php?appid=${catalogAppid}`],
              ]) {
                linkMenu.append(new MenuItem({ icon: menuIcon('globe.png'), label, click: () => remote.shell.openExternal(url) }));
              }
            } else if (ctxGame?.name) {
              const query = encodeURIComponent(ctxGame.name);
              linkMenu.append(
                new MenuItem({
                  icon: menuIcon('globe.png'),
                  label: 'PCGamingWiki',
                  click: () => remote.shell.openExternal(`https://pcgamingwiki.com/w/index.php?search=${query}`),
                })
              );
            }
          }

          // Uninstall (opt-in via Settings > General)
          // Manual entries use the same guarded discovery as detected games: Steam only when the
          // client confirms the AppID, otherwise a real local uninstaller or recoverable Recycle
          // Bin removal. Removing the AW library entry remains a separate, non-destructive action.
          if (app.config?.general?.uninstallContextMenu !== false) {
            const uninstallCtx = $('#game-list');
            const uninstallGame = list.find((g) => g.appid == appid);
            const uninstallDir =
              uninstallGame && uninstallGame.gameDir && fs.existsSync(uninstallGame.gameDir)
                ? path.resolve(uninstallGame.gameDir)
                : null;
            const uninstallMenu = new Menu();
            let uninstallEntries = 0;

            // 1) Steam client uninstall (steam://uninstall/<appid>) - offered for real
            //    Steam-owned games, or any numeric AppID the Steam client confirms as
            //    installed (covers GreenLuma-style libraries too).
            const steamUrl = uninstall.steamUninstallUrl(catalogAppid);
            if (steamUrl) {
              const steamInfo = uninstall.getSteamUninstallInfo(catalogAppid);
              if (isLegitSteamOwned || steamInfo.installed === true) {
                uninstallMenu.append(
                  new MenuItem({
                    icon: menuIcon('steam.png'),
                    label: uninstallCtx.attr('data-ctx-uninstall-steam') || (t('uninstall-via-steam', 'Uninstall via Steam…', 'Désinstaller via Steam…')),
                    async click() {
                      const gameName = list.find((g) => g.appid == appid)?.name || String(appid);
                      const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                        type: 'warning',
                        title: t('uninstall-via-steam', 'Uninstall via Steam', 'Désinstaller via Steam'),
                        message: t('uninstall-x-via-steam', 'Uninstall "{name}" via Steam?', 'Désinstaller « {name} » via Steam ?', { name: gameName }),
                        detail: t(
                          'steam-uninstall-detail',
                          "Steam will remove the game's local files. You can reinstall it later from your library.",
                          'Steam supprimera les fichiers locaux du jeu. Tu pourras le réinstaller plus tard depuis ta bibliothèque.'
                        ),
                        buttons: [t('cancel', 'Cancel', 'Annuler'), t('uninstall', 'Uninstall', 'Désinstaller')],
                        defaultId: 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (confirm.response !== 1) return;
                      try {
                        await remote.shell.openExternal(steamUrl);
                      } catch (err) {
                        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'error',
                          title: t('steam-uninstall-failed', 'Steam uninstall failed', 'Échec de la désinstallation Steam'),
                          message: t('steam-uninstall-open-failed', 'Could not open Steam to uninstall this game.', "Impossible d'ouvrir Steam pour désinstaller ce jeu."),
                          detail: formatErr(err),
                        });
                        return;
                      }
                      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'info',
                        title: t('steam-opened', 'Steam opened', 'Steam ouvert'),
                        message: t('steam-will-handle-the-uninstall-the-game-list-will-refresh-autom', 'Steam will handle the uninstall. The game list will refresh automatically.', 'Steam va gérer la désinstallation. La liste se rafraîchira automatiquement.'),
                        noLink: true,
                      });
                      if (uninstallDir) {
                        pollUninstallCompletion({ appid: catalogAppid, gameDir: uninstallDir, mode: 'steam' });
                      } else {
                        // No local folder to watch and the registry may be unavailable:
                        // give Steam a moment, then refresh once.
                        setTimeout(() => app.onStart(), 12000);
                      }
                    },
                  })
                );
                uninstallEntries++;
              }
            }

            // 2) Local uninstaller / folder removal - never for legit Steam games
            //    (Steam owns those files and should be the one removing them).
            if (uninstallDir && !isLegitSteamOwned) {
              const local = uninstall.findLocalUninstaller(uninstallDir);
              if (local) {
                uninstallMenu.append(
                  new MenuItem({
                    icon: menuIcon('file-text.png'),
                    label: uninstallCtx.attr('data-ctx-uninstall-run') || (t('run-game-uninstaller', 'Run game uninstaller…', 'Lancer le désinstalleur du jeu…')),
                    async click() {
                      const gameName = list.find((g) => g.appid == appid)?.name || String(appid);
                      const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                        type: 'warning',
                        title: t('uninstall-game', 'Uninstall game', 'Désinstaller le jeu'),
                        message: t('uninstall-x-with-x', 'Uninstall "{name}" with {uninstaller}?', 'Désinstaller « {name} » avec {uninstaller} ?', { name: gameName, uninstaller: local.name }),
                        detail:
                          uninstallDir +
                          (local.silent
                            ? t('n-nthe-uninstaller-will-run-in-silent-mode', '\n\nThe uninstaller will run in silent mode.', '\n\nLe désinstalleur s’exécutera en mode silencieux.')
                            : t('n-nno-reliable-silent-mode-was-detected-follow-the-uninstaller-p', '\n\nNo reliable silent mode was detected: follow the uninstaller prompts.', '\n\nAucun mode silencieux fiable n’a été détecté : suis les invites du désinstalleur.')),
                        buttons: [t('cancel', 'Cancel', 'Annuler'), t('uninstall', 'Uninstall', 'Désinstaller')],
                        defaultId: 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (confirm.response !== 1) return;
                      // The tile stays busy for as long as the uninstaller runs, so a silent
                      // uninstall (no window of its own) is not mistaken for nothing happening.
                      setGameBoxBusy(self, t('uninstalling-game', 'Uninstalling…', 'Désinstallation…'));
                      let child;
                      try {
                        child = spawn(local.file, local.args, { cwd: uninstallDir, detached: true, stdio: 'ignore' });
                      } catch (err) {
                        clearGameBoxBusy(self);
                        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'error',
                          title: t('launch-failed', 'Launch failed', 'Échec du lancement'),
                          message: t('could-not-launch-the-uninstaller', 'Could not launch the uninstaller.', 'Impossible de lancer le désinstalleur.'),
                          detail: formatErr(err),
                        });
                        return;
                      }
                      child.on('error', (err) => {
                        debug.warn(`[uninstall] ${local.file} => ${formatErr(err)}`);
                        clearGameBoxBusy(self);
                        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'error',
                          title: t('launch-failed', 'Launch failed', 'Échec du lancement'),
                          message: t('could-not-launch-the-uninstaller', 'Could not launch the uninstaller.', 'Impossible de lancer le désinstalleur.'),
                          detail: formatErr(err),
                        });
                      });
                      // Refresh after the uninstaller exits; clean up silent temp files on success.
                      child.on('exit', (code) => {
                        if (code === 0) uninstall.cleanupSilentUninstaller(local);
                        clearGameBoxBusy(self);
                        setTimeout(() => app.onStart(), 1500);
                      });
                      child.unref();
                      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'info',
                        title: t('uninstall-started', 'Uninstall started', 'Désinstallation lancée'),
                        message: t('the-uninstaller-was-started-the-game-list-will-refresh-automatic', 'The uninstaller was started. The game list will refresh automatically.', 'Le désinstalleur a été lancé. La liste se rafraîchira automatiquement.'),
                        noLink: true,
                      });
                      pollUninstallCompletion({ appid, gameDir: uninstallDir, mode: 'local' });
                    },
                  })
                );
                uninstallEntries++;
              } else if (uninstall.isSafeTrashTarget(uninstallDir)) {
                uninstallMenu.append(
                  new MenuItem({
                    icon: menuIcon('folder-open.png'),
                    label:
                      uninstallCtx.attr('data-ctx-uninstall-delete') ||
                      (t('delete-game-folder-recycle-bin', 'Delete game folder (Recycle Bin)…', 'Supprimer le dossier du jeu (Corbeille)…')),
                    async click() {
                      const gameName = list.find((g) => g.appid == appid)?.name || String(appid);
                      const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                        type: 'warning',
                        title: t('delete-game-folder', 'Delete game folder', 'Supprimer le dossier du jeu'),
                        message: t('move-x-s-folder-to-the-recycle-bin', 'Move "{name}"\'s folder to the Recycle Bin?', 'Déplacer le dossier de « {name} » vers la Corbeille ?', { name: gameName }),
                        detail:
                          uninstallDir +
                          (t('n-nno-uninstaller-was-found-in-this-folder-the-files-will-be-mov', '\n\nNo uninstaller was found in this folder. The files will be moved to the Recycle Bin (recoverable).', '\n\nAucun désinstalleur n’a été trouvé dans ce dossier. Les fichiers seront déplacés vers la Corbeille (récupérables).')),
                        buttons: [t('cancel', 'Cancel', 'Annuler'), t('delete', 'Delete', 'Supprimer')],
                        defaultId: 1,
                        cancelId: 0,
                        noLink: true,
                      });
                      if (confirm.response !== 1) return;
                      // Moving a game folder to the Recycle Bin takes as long as the folder is big,
                      // and the tile gave no sign of it - the same spinner the emulator fix uses says
                      // the work started and is still going.
                      setGameBoxBusy(self, t('deleting-game-folder', 'Moving to the Recycle Bin…', 'Déplacement vers la Corbeille…'));
                      try {
                        await remote.shell.trashItem(uninstallDir);
                      } catch (err) {
                        clearGameBoxBusy(self);
                        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                          type: 'error',
                          title: t('delete-failed', 'Delete failed', 'Échec de la suppression'),
                          message: t('could-not-move-the-folder-to-the-recycle-bin', 'Could not move the folder to the Recycle Bin.', 'Impossible de déplacer le dossier vers la Corbeille.'),
                          detail: formatErr(err),
                        });
                        return;
                      }
                      clearGameBoxBusy(self);
                      app.onStart();
                    },
                  })
                );
                uninstallEntries++;
              }
            }

            if (uninstallEntries > 0) {
              gameMenu.append(new MenuItem({ type: 'separator' }));
              gameMenu.append(
                new MenuItem({
                  icon: menuIcon('cross.png'),
                  label: uninstallCtx.attr('data-ctx-uninstall-group') || (t('uninstall', 'Uninstall', 'Désinstaller')),
                  submenu: uninstallMenu,
                })
              );
            }
          }

          // Native Electron menu labels treat a lone "&" as an accelerator marker (swallowed at
          // render time), so a literal ampersand must be doubled ("&&"). Locale strings keep the
          // single "&" (they're also used in HTML); escape only here, at the native-menu boundary.
          const groupLabel = (attribute) => ($('#game-list').attr(attribute) || '').replace(/&/g, '&&');
          if (gameMenu.items.length) menu.append(new MenuItem({ label: groupLabel('data-ctx-group-game'), submenu: gameMenu }));
          // The emulator submenu is the GBE runtime / Steamless / Uplay R2 surface, so it belongs to
          // Advanced. Nothing is disabled by hiding it: the safe per-game repairs (rewrite the
          // achievement data, restore the emulator file) stay on the Game Health panel in both
          // modes, and switching to Advanced brings the full menu straight back.
          if (emulatorMenu.items.length && !interfaceIsSimple())
            menu.append(
              new MenuItem({
                label: isUbisoftSource ? 'Ubisoft Connect' : groupLabel('data-ctx-group-emulator'),
                submenu: emulatorMenu,
              })
            );
          if (folderMenu.items.length) menu.append(new MenuItem({ label: groupLabel('data-ctx-group-folders'), submenu: folderMenu }));
          if (linkMenu.items.length) menu.append(new MenuItem({ label: groupLabel('data-ctx-group-links'), submenu: linkMenu }));

          // Cover art management (re-download / alternate AppID / local image)
          const coverGame = list.find((g) => g.appid == appid);
          if (coverGame) {
            const coverCacheAppid = catalogAppid || String(coverGame.steamappid || appid);
            const coverOrientation = app.config?.achievement?.thumbnailPortrait ? 'portrait' : 'landscape';
            const defaultCoverUrl = () => {
              const img = coverGame.img || {};
              return app.config?.achievement?.thumbnailPortrait
                ? img.portrait || img.header || img.landscape || null
                : img.header || img.landscape || img.portrait || null;
            };
            const refetchDefaultCover = async () => {
              if (EMU_LOCAL_ICON_SOURCES.has(coverGame.source)) {
                applyCoverBackground(appid, (coverGame.img && coverGame.img.header) || 'none');
                return;
              }
              const headerEl = $(`#game-header-${appid}`).first();
              const url = defaultCoverUrl();
              const applied = await applyCoverWithFallback(coverGame, headerEl, url, coverOrientation);
              if (applied.ok) return;
              const recovered = await recoverLibraryCover(coverGame, coverOrientation, { force: true });
              applyCoverBackground(appid, recovered.path || 'none');
            };

            const coverMenu = new Menu();
            coverMenu.append(
              new MenuItem({
                label: t('re-download-cover', 'Re-download cover', 'Retélécharger la jaquette'),
                async click() {
                  try {
                    coverStore.remove(appid, coverOrientation);
                    reloadCoverOverrides();
                    // Purge the cached art so fetch-icon actually re-downloads instead of returning the stale file.
                    try {
                      for (const id of new Set([String(appid), coverCacheAppid])) {
                        fs.rmSync(path.join(getUserDataPath(), 'steam_cache', 'icon', id), { recursive: true, force: true });
                      }
                    } catch {}
                    await refetchDefaultCover();
                  } catch (err) {
                    debug.warn(`[cover] redownload failed => ${err}`);
                  }
                },
              })
            );
            coverMenu.append(
              new MenuItem({
                label: t('chooseAnotherCover', 'Choose another cover…', 'Choisir une autre jaquette…'),
                click() {
                  openCoverPicker(coverGame, appid, coverCacheAppid);
                },
              })
            );
            coverMenu.append(
              new MenuItem({
                label: t('use-another-steam-appid', 'Use another Steam AppID…', 'Utiliser un autre AppID Steam…'),
                async click() {
                  const alt = await promptText(
                    t('steam-appid-to-pull-cover-art-from', 'Steam AppID to pull cover art from:', 'AppID Steam à utiliser pour la jaquette :'),
                    /^[0-9]+$/.test(coverCacheAppid) ? coverCacheAppid : ''
                  );
                  if (!alt || !/^[0-9]+$/.test(alt)) return;
                  const alternate = {
                    ...coverGame,
                    appid: String(appid),
                    steamappid: alt,
                    img: {},
                  };
                  const recovered = await recoverLibraryCover(alternate, coverOrientation, { force: true });
                  if (!recovered.path || !recovered.source) {
                    remote.dialog.showMessageBox({ type: 'warning', message: t('no-steam-cover-art-for-appid', 'No Steam cover art found for AppID {appid}.', 'Aucune jaquette Steam trouvée pour l\'AppID {appid}.', { appid: alt }) });
                    return;
                  }
                  const stored = coverStore.persist(appid, recovered.source, getUserDataPath(), coverOrientation);
                  if (!stored) throw new Error('downloaded cover could not be persisted');
                  reloadCoverOverrides();
                  applyCoverBackground(appid, recovered.path);
                },
              })
            );
            coverMenu.append(
              new MenuItem({
                label: t('choose-local-image', 'Choose local image…', 'Choisir une image locale…'),
                click() {
                  const files = remote.dialog.showOpenDialogSync({
                    title: t('choose-cover-image', 'Choose cover image', 'Choisir une jaquette'),
                    properties: ['openFile'],
                    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
                  });
                  if (!files || !files[0]) return;
                  try {
                    const url = coverStore.persist(appid, pathToFileURL(files[0]).href, getUserDataPath(), coverOrientation);
                    if (!url) throw new Error('selected image could not be persisted');
                    reloadCoverOverrides();
                    applyCoverBackground(appid, url);
                  } catch (err) {
                    debug.warn(`[cover] local image failed => ${err}`);
                    remote.dialog.showMessageBox({ type: 'error', message: t('could-not-set-cover', 'Could not set cover: {error}', 'Impossible de définir la jaquette : {error}', { error: err.message || err }) });
                  }
                },
              })
            );
            if (coverOverrideFor(appid, coverOrientation)) {
              coverMenu.append(new MenuItem({ type: 'separator' }));
              coverMenu.append(
                new MenuItem({
                  label: t('reset-cover-to-default', 'Reset cover to default', 'Réinitialiser la jaquette'),
                  async click() {
                    coverStore.remove(appid, coverOrientation);
                    reloadCoverOverrides();
                    await refetchDefaultCover();
                  },
                })
              );
            }
            menu.append(new MenuItem({ label: groupLabel('data-ctx-group-cover'), submenu: coverMenu }));
          }

          menu.popup({ window: remote.getCurrentWindow() });
        });

        if (self.args.appid)
          $(`#game-list .game-box[data-appid="${self.args.appid.toString().replace(/[^\d]/g, '')}"]`)
            .first()
            .trigger('click');
      })
      .catch((err) => {
        loadingElem.elem.hide();
        $('#main-footer').addClass('done');
        setLibraryBusyCursor(false);
        clearSkeletonTiles();
        $('#game-list .isEmpty').show();
        remote.dialog.showMessageBoxSync({
          type: 'error',
          title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
          message: t('game-list-generation-failure', 'Game list generation failure', 'Échec de la génération de la liste des jeux'),
          detail: `${err}`,
        });
      })
      .finally(() => {
        $('#user-info').fadeTo('fast', 1).css('pointer-events', 'initial');
        $('#sort-box').fadeTo('fast', 1).css('pointer-events', 'initial');
        $('#search-bar').fadeTo('fast', 1).css('pointer-events', 'initial');
        $('title-bar')[0].inSettings = false;
      });
    self.listLoadPromise = listLoadPromise;
    return listLoadPromise;
  },
  onGameBoxClick: function (self, list) {
    self.css('pointer-events', 'none');

    let game = list.find((elem) => elem.appid == self.data('appid') && list.indexOf(elem) == self.data('index'));

    // A list/DOM desync (stale index after a re-sort or removal) can leave no match; bail out instead
    // of dereferencing game.img below and throwing an uncaught error that strands the click.
    if (!game) {
      debug.warn(`onGameBoxClick: no game for appid=${self.data('appid')} index=${self.data('index')}`);
      self.css('pointer-events', 'initial');
      return;
    }

    // Merge manually-unlocked achievements (user overrides) before anything renders, so the header
    // counters, unlocked/locked lists and sorting all reflect them consistently.
    manualUnlock.loadAndApplyToGame(game, game.appid, game.source);

    if (self.data('time') > 0) $('#unlock > .header .sort-ach .sort.time').addClass('show');

    $('#home').fadeOut(function () {
      $('body').fadeIn().css('background', `url('../resources/img/ach_background.jpg')`);
      if (game.img.background) {
        ipcRenderer.invoke('fetch-icon', game.img.background, game.steamappid || game.appid).then((localPath) => {
          // This fetch can outlive the page that asked for it: going back to the library before it
          // resolved used to repaint the *home* screen with this game's artwork, because the
          // back button had already cleared body's style by the time this ran. The header carries
          // the appid only while that game's page is on screen, so it doubles as the freshness
          // check - it is cleared on the way out and overwritten when another game opens.
          if (String($('#achievement .wrapper > .header').attr('data-appid')) !== String(game.appid)) return;
          if (game.system === 'uplay' || game.img?.overlay === true) {
            let gradient = `linear-gradient(to bottom right, color-mix(in srgb, var(--bg-base) 88%, black) 0%, color-mix(in srgb, var(--bg-glow) 78%, black) 100%)`;
            $('body').fadeIn().attr('style', `background: ${gradient}, ${cssUrl(localPath)}`);
          } else {
            $('body').fadeIn().css('background', cssUrl(localPath));
          }
        });
      }

      // Mark which game the detail view is currently showing, so a live unlock toast only
      // refreshes this page when it belongs to the game on screen (see updateGamePage).
      $('#achievement .wrapper > .header').attr('data-appid', game.appid);
      $('#achievement .wrapper > .header').attr('data-source', game.source || '');

      if (game.system) {
        $('#achievement .wrapper > .header').attr('data-system', game.system);
      } else {
        $('#achievement .wrapper > .header').removeAttr('data-system');
      }

      /*
        The header box is square, and so is what belongs in it. Steam's clienticon is 32x32
        (blurry beside a crisp title) and many games - notably brand-new releases - have none at
        all. Ask the host for the same square logo a notification uses: the community icon set
        first, then the game's own artwork cut into a square.
      */
      // `background` is deliberately absent: Steam's storepagebackground is a blurred decorative
      // wash, and cutting a square out of it produces a flat gradient - a box that looks empty
      // while claiming to be the game's logo.
      paintGameHeaderIcon(game);
      bindGameHeaderIconMenu(game);

      $('#achievement .wrapper > .header .title span').text(game.name);
      // Never let the denominator fall below what's actually displayed: a desynced schema could leave
      // total at 0 for a completed game, rendering "39 / 0" and a NaN%/Infinity% percentage.
      const unlockedCount = Math.max(0, Math.floor(finiteNumber(game.achievement.unlocked, 0)));
      const counterMax = Math.max(Math.floor(finiteNumber(game.achievement.total, 0)), game.achievement.list.length, unlockedCount);
      $('#achievement .wrapper > .header .stats .counter')
        .attr('data-count', unlockedCount)
        .attr('data-max', counterMax)
        .attr('data-percent', percentFromProgress(unlockedCount, counterMax));

      if (game.system === 'playstation') {
        $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.platinum span').text(
          game.achievement.list.filter((ach) => ach.Achieved && ach.type === 'P').length
        );
        $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.gold span').text(
          game.achievement.list.filter((ach) => ach.Achieved && ach.type === 'G').length
        );
        $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.silver span').text(
          game.achievement.list.filter((ach) => ach.Achieved && ach.type === 'S').length
        );
        $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.bronze span').text(
          game.achievement.list.filter((ach) => ach.Achieved && ach.type === 'B').length
        );
      }

      $('#achievement .wrapper > .header .playtime').hide();
      $('#achievement .wrapper > .header .lastplayed').hide();
      // PlayStation emulators have no per-game process to attribute; every other source (Steam,
      // official Ubisoft Connect, Uplay R2, Epic, GOG, EA, Xbox PC, ...) can be tracked by exe.
      if (game.system !== 'playstation') {
        PlaytimeTracking(game.appid)
          .then(({ playtime, lastplayed }) => {
            if (playtime > 0) {
              // Past a day the exact hours are still the useful number, with the rounded days beside it.
              const exact = formatPlaytime(playtime, { units: playtime < 60 ? ['seconds'] : ['hours', 'minutes'] });
              const rounded = playtime >= 86400 ? formatPlaytime(playtime, { units: ['days', 'hours'] }) : '';
              $('#achievement .wrapper > .header .playtime span').text(rounded ? `${exact} (~ ${rounded})` : exact);
              $('#achievement .wrapper > .header .playtime').css('display', 'inline-block');
            }

            if (lastplayed > 0) {
              $('#achievement .wrapper > .header .lastplayed span').text(intlFormat.formatDate(lastplayed, uiLang()));
              $('#achievement .wrapper > .header .lastplayed').css('display', 'inline-block');
            }
          })
          .catch((err) => {
            debug.error(err);
          });
      }

      $('#achievement .sort-ach .sort').removeClass('active');
      let unlock = $('#unlock ul');
      let lock = $('#lock ul');
      unlock.empty();
      lock.empty();

      const hiddenDescLabel = $('#lock').data('lang-hiddenDesc') || 'Hidden description';

      // Every lookup below used to run once per achievement: a jQuery selector plus a data() parse,
      // a locale lookup and a file URL rebuild, several hundred times before a single row was shown.
      const globalStatLabel = $('#achievement .achievements').data('lang-globalStat');
      const manualTitle = escapeHtml(
        $('#achievement .achievement-list').attr('data-lang-manualUnlocked') ||
          t('manuallyUnlocked', 'Manually unlocked', 'Débloqué manuellement')
      );
      const loadingIcon = cssUrl(pathToFileURL(path.join(appPath, 'resources/img/loading.gif')).href);
      // Rows are collected and inserted in one append per list. jQuery parses the markup and splices
      // it into the live DOM on every call, so appending row by row cost one layout pass per row.
      const unlockRows = [];
      const lockRows = [];

      let i = 0;
      for (let achievement of game.achievement.list) {
        const iconId = achievementIconId(achievement.name);
        const unlockLang = uiLang();
        const unlockAt = intlFormat.formatDateTime(achievement.UnlockTime, unlockLang, { dateStyle: 'short', timeStyle: 'short' });
        const unlockAgo = intlFormat.formatRelativeTime(achievement.UnlockTime, unlockLang);
        const progress = getAchievementProgressState(achievement);
        const progressMax = progress.hasProgress ? progress.max : 0;
        const progressLabel = `${formatCount(progress.current)} / ${formatCount(progress.max)}`;

        // Hidden + still locked + "show hidden" off => mask the description inline. The real text is
        // stashed in data-desc and revealed in place on click (delegated handler below), instead of
        // being hidden away in a separate bottom "reveal all" section.
        const isHiddenMasked = achievement.hidden == 1 && !app.config.achievement.showHidden && !achievement.Achieved;
        const realDesc = achievement.description || '...';
        const descHtml = isHiddenMasked
          ? `<div class="description masked-desc" data-desc="${escapeHtml(realDesc)}">${escapeHtml(hiddenDescLabel)}</div>`
          : `<div class="description">${escapeHtml(realDesc)}</div>`;

        let template = `
                <li>

                         <div class="achievement${achievement.manual ? ' manual' : ''}" data-name="${escapeHtml(achievement.name)}" data-index="${i}" data-achieved="${
          achievement.Achieved ? 1 : 0
        }" data-manual="${achievement.manual ? 1 : 0}" title="${achievement.manual ? manualTitle : ''}">
                            <div class="box">
                              <div class="glow mask contain">
                                  <div class="glow mask ray ">
                                    <div class="glow fx"></div>
                                  </div>
                              </div>
                              <div class="icon" id="achievement-${iconId}" style="background: ${loadingIcon};"></div>
                            </div>
                            <div class="content">
                                <div class="title">${
                                  game.system === 'playstation'
                                    ? `<i class="fas fa-trophy" data-type="${escapeHtml(achievement.type)}"></i> ${escapeHtml(achievement.displayName)}`
                                    : `${escapeHtml(achievement.displayName)}`
                                }</div>
                                ${
                                  achievement.category
                                    ? `<div class="ach-category">${escapeHtml(achievement.category)}</div>`
                                    : ''
                                }
                                ${descHtml}
                                <div class="progressBar" data-current="${progress.current}" data-max="${progressMax}" data-percent="${
          progress.percent
        }" data-label="${progressLabel}">
                                <span class="meter" style="width:${progress.hasProgress ? progress.percent : 0}%"></span></div>
                            </div>
                            <div class="stats">
                              <div class="time" data-time="${achievement.UnlockTime}"><i class="fas fa-clock"></i>
                                <span>${escapeHtml(unlockAt)}</span>
                                <span>${escapeHtml(unlockAgo)}</span>
                              </div>
                              <div class="community"><i class="fab fa-steam"></i> <span class="data">--</span> ${globalStatLabel}</div>
                            </div>
                        </div>

                </li>
                `;

        // Hidden achievements are no longer collected into a separate "reveal all" row - they render
        // inline in the locked list like any other (with their description masked, click to reveal).
        if (achievement.Achieved) {
          unlockRows.push(template);
        } else {
          lockRows.push(template);
        }
        i += 1;
      }

      if (unlockRows.length) unlock.append(unlockRows.join(''));
      if (lockRows.length) lock.append(lockRows.join(''));

      // Paint the first candidate that actually decodes, and report whether one did. A row is left
      // on its placeholder rather than painted with a broken image, so the caller can try the next
      // source instead of showing an empty square.
      function setAchievementImage(selector, candidates) {
        const list = (Array.isArray(candidates) ? candidates : [candidates]).map(imageDisplayUrl).filter(Boolean);
        return new Promise((resolve) => {
          const attempt = (index) => {
            if (index >= list.length) return resolve(false);
            const img = new Image();
            img.onload = () => {
              $(selector).css('background', cssUrl(list[index]));
              resolve(true);
            };
            img.onerror = () => attempt(index + 1);
            img.src = list[index];
          };
          attempt(0);
        });
      }
      /*
        A Steam-emulated install already holds every achievement image - that is what the emulator
        paints in game. Reading them costs one readdir and works with no network at all: a player
        whose connection cannot reach the Steam CDN was left with a page of spinners while the same
        pictures sat in the game's own achievement_images folder.
      */
      const localIconIndex = localIcons.readIndex(game);
      const imageCache = new Map(); // hash -> promise
      const cachedIcon = (hash) => {
        if (!imageCache.has(hash)) imageCache.set(hash, ipcRenderer.invoke('fetch-icon', hash, game.steamappid || game.appid));
        return imageCache.get(hash);
      };
      const preloadPromises = game.achievement.list.map(async (achievement) => {
        const selector = `#achievement-${achievementIconId(achievement.name)}`;
        const hash = achievement.Achieved ? achievement.icon : achievement.icongray;
        const local = localIcons.achievementIcon(localIconIndex, achievement, !!achievement.Achieved);
        // These emulator sources already store a local path in the schema: nothing to download.
        if (EMU_LOCAL_ICON_SOURCES.has(game.source)) {
          await setAchievementImage(selector, [hash, local]);
          return;
        }
        if (local && (await setAchievementImage(selector, [local]))) return;
        const downloaded = await cachedIcon(hash).catch(() => null);
        await setAchievementImage(selector, [downloaded, local]);
      });

      if (typeof window.restoreAchievementSorts === 'function') window.restoreAchievementSorts();

      let count_unlocked = game.achievement.list.filter(
        (elem) => elem.Achieved
      ).length; /*can replace by value on header which were calculated parse etc already*/
      let count_locked = game.achievement.list.length - count_unlocked;

      $('#unlock .header .title').attr('data-count', count_unlocked);
      $('#lock .header .title').attr('data-count', count_locked);

      if (game.achievement.list.length === 0) {
        $('#unlock').hide();
        $('#lock').show();
        const title = game.manual
          ? t('achievements-not-available', 'No achievements', 'Pas de succès')
          : t('no-steam-achievements-found', 'No Steam achievements found', 'Aucun succès Steam trouvé');
        const detail = game.manual
          ? ''
          : game.unconfigured
          ? t('no-ach-unconfigured', 'This folder does not have a Goldberg/GBE setup with a reliable Steam AppID yet.', "Ce dossier n'a pas encore de configuration Goldberg/GBE avec un AppID Steam fiable.")
          : t('no-ach-no-schema', 'AW can show the game, but Steam did not provide an achievement schema for this AppID.', 'AW affiche le jeu, mais Steam ne fournit aucun schéma de succès pour cet AppID.');
        lock.append(`
              <li>
                <div class="notice empty-achievement-notice">
                  <p><i class="fas fa-trophy"></i> ${title}</p>
                  ${detail ? `<p>${detail}</p>` : ''}
                </div>
              </li>`);
      } else {
        $('#unlock').show();
      }

      if (game.achievement.list.length > 0 && count_unlocked == 0) {
        let template = `
              <li>
                <div class="notice">
                  <p>${$('#unlock').data('lang-noneUnlocked')}</p>
                  <p class="notice-aside">${$('#unlock').data('lang-noneUnlockedHint')} <a href="${links.troubleshooting}" target="_blank">${$('#unlock').data('lang-troubleshoot')} ↗</a></p>
                  </div>
              </li>`;
        unlock.append(template);
      }

      if (game.achievement.list.length > 0 && count_locked == 0) {
        $('#lock').hide();
      } else {
        $('#lock').show();
      }

      let elem = $('#achievement .achievement-list ul > li');
      elem.removeClass('highlight');

      // Reconciled rarity: any source that maps to Steam (Uplay R2, official Ubisoft via the id
      // bridge, Epic-with-Steam-release) gets the same Steam community column and refresh path as a
      // native Steam game. Console emulators keep Exophase (trophy icon), Xbox PC paints its import
      // cache, and sources without any percentage source (EA) keep the column hidden.
      const rarityContext = resolveGameRarityContext(game, { emulatorSources: EMU_LOCAL_ICON_SOURCES });
      if (!rarityContext) {
        $('.achievement .stats .community').hide();
      } else {
        $('.achievement .stats .community').show();
        $('.achievement .stats .community i').attr(
          'class',
          rarityContext.kind === 'emulator' ? 'fas fa-trophy' : 'fab fa-steam'
        );
        if (rarityContext.kind === 'xbox') {
          // Rarity was cached at import time on each schema entry - paint it directly, no network.
          const entries = (game.achievement.list || [])
            .filter((a) => a && a.rarityPct != null && Number.isFinite(Number(a.rarityPct)))
            .map((a) => ({ name: a.name, percent: Number(a.rarityPct) }));
          applyRarity(entries);
        } else if (rarityContext.kind === 'steam-bridge') {
          getGlobalStat(rarityContext.cacheId, 'steam-bridge', game.name, game.achievement.list, rarityContext);
        } else if (rarityContext.kind === 'emulator') {
          getGlobalStat(game.appid, rarityContext.source, game.name, game.achievement.list);
        } else if (rarityContext.kind === 'steam') {
          getGlobalStat(rarityContext.appid, 'steam', game.name, game.achievement.list);
        } else {
          getGlobalStat(rarityContext.appid, rarityContext.source, game.name, game.achievement.list);
        }
      }

      $('#achievement').fadeIn(600, function () {
        // Focus is requested per open (see setAchievementFocus) instead of read from app.args on
        // every render: the launch arguments never change, so the old check re-fired for every game
        // opened afterwards, and `.offset()` on the resulting empty set threw before
        // pointer-events could be restored - stranding the tile that was clicked.
        const focusName = takeAchievementFocus(game.appid);
        if (focusName) {
          focusAchievementRow($, $(this), elem, focusName, {
            onMissing: (missing) => debug.warn(`[open-game] no achievement row named '${missing}'`),
          });
        }

        // The rarity pass that hands out `.rare` runs before this fade, with the view still hidden
        // and every row measuring zero, so this is the first moment the on-screen halos can be
        // picked (see refreshRareGlow in ui/game.js).
        if (typeof window.scheduleRareGlowRefresh === 'function') window.scheduleRareGlowRefresh(0);

        self.css('pointer-events', 'initial');
      });
    });
  },
  // Mark/clear a manually-unlocked achievement (right-click on an achievement row) and re-render
  // the current game view so counters/lists reflect the override immediately.
  manualUnlockAction: async function (appid, source, name, action) {
    try {
      const result = manualUnlock.saveUpdate(appid, source, name, action);
      if (!result.changed) return result;
      const box = $('#game-list .game-box')
        .filter(function () {
          return String($(this).data('appid')) === String(appid);
        })
        .first();
      if (box.length && typeof this.onGameBoxClick === 'function') {
        // Re-rendering the detail view is what re-applies the overrides to the in-memory game, so
        // the tile and the header counters are refreshed from it afterwards - otherwise the library
        // kept showing the percentage from the last full scan.
        this.onGameBoxClick(box, gameList);
      }
      refreshLibraryProgressFor(appid, gameList);
      return result;
    } catch (err) {
      debug.warn(`[manualUnlock] ${err && err.stack ? err.stack : err}`);
      return { changed: false };
    }
  },
  /*
    Reset a game's achievements so they can be earned - and announced - again. Everything is
    backed up first (parser/achievementReset.js) and the user approves the actual file list. The
    Watchdog is told to drop its in-memory unlock baseline too - otherwise the game re-earns
    against a baseline that still has them and never notifies again.
  */
  resetAchievementsAction: async function (appid) {
    const game = gameList.find((g) => g && String(g.appid) === String(appid));
    if (!game) return false;

    let resetPlan;
    try {
      resetPlan = achievementReset.plan(game);
    } catch (err) {
      debug.error(`[reset] planning failed for ${appid} => ${formatErr(err)}`);
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
        message: t('reset-ach-failed', 'The achievements could not be reset.', 'Les succès n’ont pas pu être réinitialisés.'),
        detail: `${err && (err.message || err)}`,
      });
      return false;
    }

    if (!resetPlan.supported) {
      // Say which of the two it is: a platform that owns its unlocks, or simply nothing recorded yet.
      const official = resetPlan.blocked.length > 0;
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'info',
        title: t('reset-ach-title', 'Reset achievements', 'Réinitialiser les succès'),
        message: official
          ? t('reset-ach-official', 'This game’s achievements are stored by its platform, not on this PC.', 'Les succès de ce jeu sont conservés par sa plateforme, pas sur ce PC.')
          : t('reset-ach-nothing', 'There is nothing to reset for this game yet.', 'Il n’y a rien à réinitialiser pour ce jeu.'),
        detail: official
          ? t('reset-ach-official-detail', 'Steam, GOG Galaxy, Ubisoft Connect, EA, Epic and Xbox keep unlocks on your account and re-synchronise them. Only the account itself can clear them.', 'Steam, GOG Galaxy, Ubisoft Connect, EA, Epic et Xbox conservent les succès sur ton compte et les resynchronisent. Seul le compte peut les effacer.')
          : t('reset-ach-nothing-detail', 'AW Next has not recorded any unlock for it, and found no achievement save to clear.', 'AW Next n’a enregistré aucun déblocage et n’a trouvé aucune sauvegarde de succès à effacer.'),
      });
      return false;
    }

    const shown = resetPlan.files.slice(0, 8).map((entry) => `• ${entry.path}`);
    if (resetPlan.files.length > shown.length) {
      shown.push(t('reset-ach-more-files', '…and {count} more', '…et {count} de plus', { count: resetPlan.files.length - shown.length }));
    }
    const detail = [
      t('reset-ach-detail-count', '{count} achievement file(s) will be backed up, then cleared:', '{count} fichier(s) de succès seront sauvegardés, puis effacés :', {
        count: resetPlan.files.length,
      }),
      ...shown,
      '',
      t('reset-ach-detail-backup', 'Backup: {path}', 'Sauvegarde : {path}', { path: achievementReset.gameBackupRoot(resetPlan.appid) }),
    ];
    if (resetPlan.manualEntries > 0) {
      detail.push(t('reset-ach-detail-manual', 'Manual unlocks for this game will also be cleared ({count}).', 'Les déblocages manuels de ce jeu seront aussi effacés ({count}).', { count: resetPlan.manualEntries }));
    }
    if (resetPlan.blocked.length > 0) {
      detail.push(
        t('reset-ach-detail-blocked', 'Unlocks held by {sources} cannot be reset from here and are left untouched.', 'Les succès gérés par {sources} ne peuvent pas être réinitialisés ici et restent intacts.', {
          sources: [...new Set(resetPlan.blocked.map((entry) => entry.source).filter(Boolean))].join(', '),
        })
      );
    }

    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('reset-ach-confirm-title', 'Reset this game’s achievements?', 'Réinitialiser les succès de ce jeu ?'),
      message: t('reset-ach-confirm-message', 'Every achievement of {game} goes back to locked, so the game can unlock them again.', 'Tous les succès de {game} repassent en verrouillé, pour que le jeu puisse les débloquer à nouveau.', {
        game: game.name || resetPlan.appid,
      }),
      detail: detail.join('\n'),
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('reset-ach-confirm-button', 'Reset', 'Réinitialiser')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return false;

    let result;
    try {
      result = achievementReset.run(resetPlan);
    } catch (err) {
      debug.error(`[reset] failed for ${appid} => ${formatErr(err)}`);
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
        message: t('reset-ach-failed', 'The achievements could not be reset.', 'Les succès n’ont pas pu être réinitialisés.'),
        detail: `${err && (err.message || err)}`,
      });
      return false;
    }

    await forgetWatchdogBaseline(resetPlan.appid);
    repaintGameAfterReset(appid, game);

    const answer = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: result.errors.length > 0 ? 'warning' : 'info',
      title: t('reset-ach-done-title', 'Achievements reset', 'Succès réinitialisés'),
      message: t('reset-ach-done-message', '{count} file(s) cleared. Unlock them again in game and they will be announced as new.', '{count} fichier(s) effacé(s). Débloque-les à nouveau en jeu et ils seront annoncés comme neufs.', {
        count: result.files,
      }),
      detail:
        result.errors.length > 0
          ? `${t('reset-ach-done-detail', 'Backup: {path}', 'Sauvegarde : {path}', { path: result.backupDir })}\n${result.errors
              .map((entry) => `• ${entry.path} - ${entry.message}`)
              .join('\n')}`
          : t('reset-ach-done-detail', 'Backup: {path}', 'Sauvegarde : {path}', { path: result.backupDir }),
      buttons: [t('ok', 'OK', 'OK'), t('open-backup-folder', 'Open backup folder', 'Ouvrir la sauvegarde')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer === 1) remote.shell.openPath(result.backupDir);
    return true;
  },
  // Put a backup back exactly where it came from, including the unlock baseline, so restored
  // achievements do not arrive as a burst of new notifications.
  restoreAchievementsAction: async function (appid, backupId) {
    const game = gameList.find((g) => g && String(g.appid) === String(appid));
    const backups = achievementReset.listBackups(appid);
    const backup = backups.find((entry) => entry.id === backupId) || backups[0];
    if (!backup) return false;

    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('reset-ach-restore-title', 'Restore this achievement backup?', 'Restaurer cette sauvegarde de succès ?'),
      message: t('reset-ach-restore-message', 'The {count} file(s) saved on {date} go back to their original location, replacing what is there now.', 'Les {count} fichier(s) sauvegardés le {date} retournent à leur emplacement d’origine et remplacent ce qui s’y trouve.', {
        count: backup.files,
        date: intlFormat.formatDateTime(backup.at, uiLang()) || backup.id,
      }),
      detail: backup.path,
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('restore', 'Restore', 'Restaurer')],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return false;

    let result;
    try {
      result = achievementReset.restore(appid, backup.id);
    } catch (err) {
      debug.error(`[reset] restore failed for ${appid} => ${formatErr(err)}`);
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
        message: t('restore-failed', 'Restore failed', 'Échec de la restauration'),
        detail: `${err && (err.message || err)}`,
      });
      return false;
    }

    // The restored save is the truth again; a rescan is what re-reads it into the library.
    await forgetWatchdogBaseline(String(appid));
    if (game) {
      const box = $('#game-list .game-box')
        .filter(function () {
          return String($(this).data('appid')) === String(appid);
        })
        .first();
      if (box.length && typeof this.onGameBoxClick === 'function') this.onGameBoxClick(box, gameList);
    }
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: result.errors.length > 0 ? 'warning' : 'info',
      title: t('reset-ach-restore-done', 'Achievement backup restored', 'Sauvegarde de succès restaurée'),
      message: t('restored-x-item-s', 'Restored {count} item(s)', '{count} élément(s) restauré(s)', { count: result.restored }),
      detail:
        result.errors.length > 0
          ? result.errors.map((entry) => `• ${entry.path} - ${entry.message}`).join('\n')
          : t('reset-ach-restore-rescan', 'Refresh the library to read the restored unlocks back in.', 'Rafraîchis la bibliothèque pour relire les succès restaurés.'),
    });
    return true;
  },
  onPlayButtonClick: async function (self) {
    let appid = self.closest('.game-box').data('appid');
    const gameRecord = gameList.find((game) => String(game.appid) === String(appid));
    if (steamClientLinks.shouldOfferSteamInstall(gameRecord)) {
      const answer = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'question',
        title: t('steam-install-title', 'Game not installed', 'Jeu non installé'),
        message: t(
          'steam-install-message',
          'This Steam game is not installed on this PC. Install it through Steam?',
          'Ce jeu Steam n’est pas installé sur ce PC. L’installer via Steam ?'
        ),
        buttons: [t('cancel', 'Cancel', 'Annuler'), t('steam-install-confirm', 'Install via Steam', 'Installer via Steam')],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
      });
      if (answer === 1) remote.shell.openExternal(steamClientLinks.steamInstallUrl(gameRecord.appid));
      return;
    }
    let cfg = await exeList.get(appid);
    if (!cfg?.exe || cfg.exe === '' || !fs.existsSync(cfg.exe)) {
      const game = gameList.find((g) => g.appid == appid);
      let detected =
        game && game.exe && game.exeConfident && fs.existsSync(game.exe)
          ? game.exe
          : autodetectGameExe(game?.gameDir, game?.name, await takenExePaths(appid));
      if (detected) {
        cfg.exe = detected;
        await exeList.add(cfg);
      }
    }
    if (!cfg?.exe || cfg.exe === '' || !fs.existsSync(cfg.exe)) {
      let dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
        title: t('choose-the-game-executable', 'Choose the game executable', 'Choisir l\'exécutable du jeu'),
        buttonLabel: t('select', 'Select', 'Sélectionner'),
        defaultPath: cfg?.exe || '',
        filters: [{ name: 'Executables', extensions: ['exe', 'bat'] }],
        properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'],
      });

      if (dialog.filePaths.length > 0 && dialog.filePaths[0].length > 0) {
        const filePath = dialog.filePaths[0];
        if (!fs.existsSync(filePath)) return;
        cfg.exe = filePath;
        await exeList.add(cfg);
      }
    }
    if (!cfg.exe || cfg.exe === '' || !fs.existsSync(cfg.exe)) return;
    if (fs.statSync(cfg.exe).isFile()) {
      const gameBox = self.closest('.game-box');
      setGameBoxBusy(gameBox, t('launch-game', 'Launch game', 'Lancer le jeu'));
      if (gameRecord && gameRecord.manual) {
        const recovery = apiCheckBypass.quarantineBrokenBypass({ exePath: cfg.exe, log: debug });
        if (recovery.changed) {
          debug.warn(`[${appid}] disabled broken Steam API bypass before launch: ${recovery.files.map((file) => file.from).join(', ')}`);
        }
      }
      // spawn() takes (command, args, options) - there is no callback overload, so the old 4th-arg
      // callback was dead code and launch failures (missing/blocked exe) were swallowed silently.
      // Listen on 'error' and surface it so the user knows the click did something.
      const reportLaunchFailure = (error) => {
        clearGameBoxBusy(gameBox);
        debug.error(`Failed to launch ${cfg.exe}: ${error}`);
        remote.dialog.showMessageBoxSync({
          type: 'error',
          title: t('launch-failed', 'Launch failed', 'Échec du lancement'),
          message: t('could-not-start-the-game', 'Could not start the game.', 'Impossible de démarrer le jeu.'),
          detail: `${error}`,
        });
      };
      const shellLaunch = (elevate = false) =>
        ipcRenderer.invoke('launch-game-via-shell', {
          executable: cfg.exe,
          args: cfg.args || '',
          workingDirectory: path.dirname(cfg.exe),
          elevate,
        });
      /*
        spawn() is CreateProcess, which cannot start an executable whose manifest requires
        administrator: Windows fails it with ERROR_ELEVATION_REQUIRED (reported as EACCES) even
        though the game runs fine from Explorer. ShellExecute honours the manifest and raises the
        UAC prompt, so an EACCES retries through it; a refusal there is offered as an explicit
        elevated retry, not performed silently.
      */
      const recoverFromLaunchDenied = async (error) => {
        if (process.platform !== 'win32' || !windowsShellLaunch.isElevationLikeError(error)) {
          reportLaunchFailure(error);
          return;
        }
        debug.warn(`[${appid}] direct launch was denied (${error && error.code ? error.code : error}) - retrying through the Windows shell`);
        const viaShell = await shellLaunch(false);
        if (viaShell && viaShell.ok) {
          clearGameBoxBusy(gameBox);
          return;
        }
        if (viaShell && viaShell.declined) {
          // The UAC prompt was dismissed. Nothing failed, so nothing is reported.
          clearGameBoxBusy(gameBox);
          return;
        }
        const answer = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'question',
          title: t('launch-failed', 'Launch failed', 'Échec du lancement'),
          message: t(
            'launch-needs-admin',
            'Windows refused to start this game without administrator rights.',
            'Windows a refusé de démarrer ce jeu sans les droits administrateur.'
          ),
          detail: t(
            'launch-needs-admin-detail',
            'Retry as administrator? Windows will ask you to confirm. AW Next itself stays unelevated - only the game is started with administrator rights.',
            'Réessayer en tant qu’administrateur ? Windows vous demandera de confirmer. AW Next reste sans élévation : seul le jeu est démarré avec les droits administrateur.'
          ),
          buttons: [t('cancel', 'Cancel', 'Annuler'), t('launch-as-admin', 'Run as administrator', 'Exécuter en tant qu’administrateur')],
          defaultId: 1,
          cancelId: 0,
          noLink: true,
        });
        if (answer !== 1) {
          clearGameBoxBusy(gameBox);
          return;
        }
        const elevated = await shellLaunch(true);
        if (elevated && elevated.ok) {
          clearGameBoxBusy(gameBox);
          return;
        }
        if (elevated && elevated.declined) {
          clearGameBoxBusy(gameBox);
          return;
        }
        reportLaunchFailure((elevated && elevated.error) || (viaShell && viaShell.error) || error);
      };
      try {
        if (process.platform === 'win32' && gameRecord && gameRecord.manual) {
          // ShellExecute gives GUI/.NET programs a normal Windows launch environment. Ryujinx
          // crashes in Console.Title when started as a detached child with ignored stdio handles.
          const result = await shellLaunch(false);
          if (!result || !result.ok) {
            if (result && result.declined) {
              clearGameBoxBusy(gameBox);
              return;
            }
            throw new Error((result && result.error) || 'Windows shell launch failed');
          }
          clearGameBoxBusy(gameBox);
          return;
        }
        // args_split (argv-split) strips the quotes it uses for grouping; the hand-rolled regex that
        // used to live here kept them, and since spawn() runs without a shell Node re-quoted the token,
        // so a game asked for -savedir "D:\My Games\Save" received the literal quotes as part of the path.
        let game = spawn(cfg.exe, splitLaunchArgs(cfg.args, (m) => debug.log(m)), {
          cwd: path.dirname(cfg.exe),
          detached: true,
          stdio: 'ignore',
        });
        game.once('spawn', () => setTimeout(() => clearGameBoxBusy(gameBox), 350));
        // 'error' fires after the click has already returned, so the recovery has to own its own
        // failures: an unhandled rejection here would leave the tile spinning with nothing said.
        game.on('error', (error) => {
          recoverFromLaunchDenied(error).catch((err) => reportLaunchFailure(err));
        });
        game.unref();
      } catch (error) {
        await recoverFromLaunchDenied(error);
      }
    }
  },
  onConfigButtonClick: async function (self) {
    let appid = self.closest('.game-box').data('appid');
    $('#game-config').show();
    $('#game-config .box').fadeIn();
    $('#game-config .header').attr('title', appid);
    // The panel covers several tabs now, so it is titled after the game rather than after one of them.
    const named = gameList.find((g) => g.appid == appid);
    $('#game-config-title').text(named?.name || t('game-config-title', 'Executable configuration', "Configuration de l'exécutable"));
    applyGameConfigTabLabels();
    // Health opens first: it answers "is this game ready" without the user knowing which tab to
    // look in. The executable configuration is one click away and still loads below either way.
    setGameConfigView('health');
    loadGameNotificationSettings(appid);

    /*
      Resolve (and persist) the executable BEFORE the report is collected. renderGameHealth() reads
      the same exeList this block writes to; fired un-awaited, it used to race the auto-detection
      below and almost always win, reporting "no executable" for a game one click from a detected path.
    */
    let cfg = await exeList.get(appid);
    if (!cfg?.exe || cfg.exe === '' || !fs.existsSync(cfg.exe)) {
      const game = gameList.find((g) => g.appid == appid);
      let detected =
        game && game.exe && game.exeConfident && fs.existsSync(game.exe)
          ? game.exe
          : autodetectGameExe(game?.gameDir, game?.name, await takenExePaths(appid));
      if (detected) {
        cfg.exe = detected;
        await exeList.add(cfg);
      }
    }
    renderGameHealth(appid);
    let exeLbl = $('#game-config').find('.constant');
    let argsInput = $('#launch-args');
    exeLbl.attr('title', cfg.exe);
    exeLbl.text(cfg.exe);
    argsInput.val(cfg.args);
  },
  onGameConfigCancelClick: async function (self) {
    self.css('pointer-events', 'none');
    $('#game-config .box').fadeOut(() => {
      $('#game-config').hide();
      self.css('pointer-events', 'initial');
    });
  },
  onGameConfigSaveClick: async function (self) {
    let appid = $('#game-config .header').attr('title');
    let cfg = await exeList.get(appid);
    let exeLbl = $('#game-config').find('.constant');
    let argsInput = $('#launch-args');
    cfg.exe = exeLbl.text();
    cfg.args = argsInput.val() === undefined ? '' : argsInput.val();
    await exeList.add(cfg);
    /*
      Carry the choice into the in-memory game too. exeList is the persisted truth, but the loaded
      gameList entry is what the rest of this session reads - Game Health's own fallback, "Track this
      game", the play button. Left stale, picking the executable by hand looked like it did nothing
      until the next full library scan.
    */
    const chosen = gameList.find((g) => g.appid == appid);
    if (chosen && cfg.exe) {
      chosen.exe = cfg.exe;
      chosen.exeConfident = true;
    }
    this.onGameConfigCancelClick(self);
  },
};

// The per-game report behind the tools button. Signal collection lives here because it needs the
// renderer's game list, user config and userData paths; every state / explanation / action decision
// is in util/gameHealth.js so it can be tested without a window or a game install.
const gameHealth = require(path.join(appPath, 'util/gameHealth.js'));
const gameHealthRepair = require(path.join(appPath, 'util/gameHealthRepair.js'));
// Libraries whose unlocks come from the platform itself. Their watchdog watcher polls the account,
// so none of the process-tracking or Steam-emulator reasoning applies to them.
const OFFICIAL_PLATFORM_SOURCES = /^(?:steam\s*\(|gog(?:\s|$)|gog galaxy|epic(?:-official)?$|ea$|ubisoft connect|xbox)/i;
function isOfficialPlatformSource(source) {
  return OFFICIAL_PLATFORM_SOURCES.test(String(source || '').trim());
}

/*
  Tab labels. Re-applied on every open rather than once at startup: the panel outlives a language
  change, and locale/loader.js does not know about this panel's tabs, so a one-shot binding would
  leave them frozen in whatever language the app started in.
*/
function applyGameConfigTabLabels() {
  $('#game-config-tab-health').text(t('game-config-tab-health', 'Health', 'État'));
  $('#game-config-tab-exe').text(t('game-config-tab-exe', 'Executable', 'Exécutable'));
  $('#game-config-tab-notification').text(localeText('settings.sideMenu.notification'));
  $('#game-notification-preset-label').text(localeText('dialogs.game-notification-preset-title'));
  $('#game-notification-use-global').text(localeText('dialogs.game-notification-use-global'));
  $('#game-notification-position-label').text(localeText('settings.notification.option.overlayPosition'));
  $('#game-notification-sound-label').text(localeText('settings.notification.option.overlaySound'));
  $('#game-notification-scale-label').text(localeText('settings.notification.option.overlayScale'));
  $('#game-notification-position option[value=""], #game-notification-sound option[value=""], #game-notification-scale option[value=""]').text(
    localeText('settings.notification.option.presetSameAsMain')
  );
  $('#game-notification-sound option[value="__none__"]').text(localeText('settings.notification.option.soundNone'));
  $('#game-notification-sound option[value="__random__"]').text(localeText('settings.notification.option.overlayRandomSound'));
  const repositionLabel = localeText('settings.notification.option.reposition');
  $('#game-notification-reposition').attr({ title: repositionLabel, 'aria-label': repositionLabel });
  $('#game-notification-test-title').text(localeText('settings.notification.title.test'));
  const labels = {
    toast: localeText('settings.notification.test.achievement'),
    rare: localeText('settings.notification.test.rare'),
    progress: localeText('settings.notification.test.progress'),
    playtime: localeText('settings.notification.test.playtime'),
    platinum: localeText('settings.notification.test.platinum'),
  };
  $('#game-notification-tests [data-notification-kind]').each(function () {
    $(this).find('span').text(labels[$(this).attr('data-notification-kind')] || '');
  });
}

function gameNotificationSettingsFromPanel() {
  const root = $('#game-notifications');
  const settings = {
    preset: $('#game-notification-preset').val() || '',
    position: $('#game-notification-position').val() || '',
    sound: $('#game-notification-sound').val() || '',
    scale: $('#game-notification-scale').val() || '',
  };
  if (settings.position === 'custom') {
    try {
      settings.customPosition = JSON.parse(root.attr('data-custom-position') || 'null');
    } catch {}
  }
  return gameNotificationPreset.normalizeSettings(settings);
}

function applyGameNotificationPanelSettings(value) {
  const settings = gameNotificationPreset.normalizeSettings(value);
  $('#game-notifications').attr(
    'data-custom-position',
    settings.customPosition ? JSON.stringify(settings.customPosition) : ''
  );
  $('#game-notification-preset').val(settings.preset || '');
  $('#game-notification-position').val(settings.position || '');
  $('#game-notification-sound').val(settings.sound || '');
  $('#game-notification-scale').val(settings.scale == null ? '' : String(settings.scale));
}

async function loadGameNotificationSettings(appid) {
  const root = $('#game-notifications');
  const controls = root.find('select');
  const reposition = $('#game-notification-reposition');
  root
    .attr('data-appid', String(appid))
    .attr('data-loaded', 'false')
    .attr('data-saved-settings', '{}')
    .attr('data-custom-position', '');
  controls.val('').prop('disabled', true);
  reposition.prop('disabled', true);
  try {
    const [listed, sounds, saved] = await Promise.all([
      ipcRenderer.invoke('list-presets'),
      ipcRenderer.invoke('list-sounds'),
      ipcRenderer.invoke('game-preset:get', String(appid)),
    ]);
    if (String($('#game-config .header').attr('title')) !== String(appid)) return;
    const sameAsMain = localeText('settings.notification.option.presetSameAsMain');

    const names = [...new Set((Array.isArray(listed) ? listed : []).map(String).filter(Boolean))];
    const select = $('#game-notification-preset');
    select.find('option:not([value=""])').remove();
    names.forEach((name) => select.append($('<option>').attr('value', name).text(name)));

    const position = $('#game-notification-position').empty().append($('<option>').attr('value', '').text(sameAsMain));
    $('#option_overlayPosition option').each(function () {
      position.append($('<option>').attr('value', $(this).attr('value')).text($(this).text()));
    });
    const scale = $('#game-notification-scale').empty().append($('<option>').attr('value', '').text(sameAsMain));
    $('#option_overlayScale option').each(function () {
      scale.append($('<option>').attr('value', $(this).attr('value')).text($(this).text()));
    });
    const sound = $('#game-notification-sound').empty().append($('<option>').attr('value', '').text(sameAsMain));
    sound.append(
      $('<option>').attr('value', gameNotificationPreset.SOUND_NONE).text(localeText('settings.notification.option.soundNone')),
      $('<option>').attr('value', gameNotificationPreset.SOUND_RANDOM).text(localeText('settings.notification.option.overlayRandomSound'))
    );
    (Array.isArray(sounds) ? sounds : []).forEach((name) =>
      sound.append($('<option>').attr('value', name).text(String(name).replace(/\.[^.]+$/, '')))
    );

    const stored = gameNotificationPreset.normalizeSettings(saved);
    const raw = stored.preset || '';
    const alias = notificationPreset.legacyPresetAlias(raw);
    stored.preset = names.includes(raw) ? raw : alias && names.includes(alias) ? alias : '';
    const hasOption = (element, value) =>
      element
        .find('option')
        .toArray()
        .some((option) => String(option.value) === String(value));
    if (!hasOption(position, stored.position || '')) delete stored.position;
    if (!hasOption(scale, stored.scale == null ? '' : stored.scale)) delete stored.scale;
    if (!hasOption(sound, stored.sound || '')) delete stored.sound;
    applyGameNotificationPanelSettings(stored);
    const shown = gameNotificationSettingsFromPanel();
    root.attr('data-saved-settings', JSON.stringify(shown)).attr('data-loaded', 'true');
    controls.prop('disabled', false);
    reposition.prop('disabled', false);
  } catch (err) {
    debug.log(`[game-preset] could not load ${appid} => ${formatErr(err)}`);
    if (String($('#game-config .header').attr('title')) === String(appid)) {
      applyGameNotificationPanelSettings({});
      root.attr('data-saved-settings', '{}').attr('data-loaded', 'true');
      controls.prop('disabled', false);
      reposition.prop('disabled', false);
    }
  }
}

function setGameConfigView(view) {
  $('#game-config-tabs button').each(function () {
    const active = $(this).attr('data-gc-view') === view;
    $(this).toggleClass('active', active).attr('aria-selected', String(active));
  });
  $('#game-config .content').each(function () {
    $(this).toggleClass('active', $(this).attr('data-view') === view);
  });
  // Save belongs to the executable form. The other views either report state or auto-save.
  const editing = view === 'exe-config';
  $('#btn-game-config-save').toggle(editing);
  // With no Save beside it there is nothing to cancel, so the single button closes the panel.
  $('#btn-game-config-cancel').text(editing ? t('cancel', 'Cancel', 'Annuler') : t('close', 'Close', 'Fermer'));
}

/*
  Everything Game Health reasons about, read once per panel open. Anything unavailable stays absent
  rather than being guessed at - deriveHealth() reports only on the signals it is actually given.
*/
async function collectGameHealthSignals(appid) {
  const game = gameList.find((g) => g.appid == appid) || {};
  let cfg = { exe: '', args: '' };
  try {
    cfg = (await exeList.get(appid)) || cfg;
  } catch (err) {
    debug.log(`[health] exeList lookup failed for ${appid} => ${formatErr(err)}`);
  }

  const gameDir = game.gameDir || '';
  const gameDirExists = !!gameDir && fs.existsSync(gameDir);
  // steam.js stamps this on the cached schema every time it re-reads the list from Steam.
  const achievementsCheckedAt = Number(game.descBackfilledAt) || 0;
  const exe = cfg.exe || (game.exeConfident ? game.exe : '') || '';
  const source = String(game.source || '');
  const system = String(game.system || '');

  const forced = emulatorSourceOverride.get(appid);
  const isUbisoft = forced === 'ubisoft' ? true : forced === 'steam' ? false : uplayR2.isUbisoftGame(game, appid);
  // Console records read their unlocks from their own emulator's trophy/achievement store.
  const isConsole = !!system && system !== 'uplay';
  const writableAppid = /^[0-9]+$/.test(String(appid)) ? String(appid) : game.steamappid || null;

  // Where this game's unlocks are ACTUALLY read from, as resolved during the scan. This is the only
  // honest way to tell which mechanism a game uses: the source label cannot, because CODEX, RUNE,
  // OnlineFix, SmartSteamEmu, TENOKE and Goldberg SocialClub are all Steam emulators that keep
  // their saves in completely different places, and none of them wants a steam_settings folder.
  const saveSources = (Array.isArray(game.dataPaths) && game.dataPaths.length ? game.dataPaths : game.dataPath ? [{ source, path: game.dataPath }] : [])
    .filter((entry) => entry && entry.path)
    .map((entry) => ({ source: entry.source || source, path: entry.path }));
  const readsGoldbergSave = saveSources.some((entry) => /[\\/](gse saves|goldberg steamemu saves)[\\/]/i.test(entry.path));

  // Only diagnose a Goldberg/GBE setup when one is actually there: a steam_settings folder or a
  // replaced steam_api dll on disk, or a save already being read out of GSE/Goldberg.
  let goldbergReport = null;
  let emulated = false;
  if (!isConsole && !isUbisoft && gameDirExists) {
    try {
      const emu = goldberg.detectEmulator(gameDir);
      const hasSetupOnDisk = emu.type !== 'none' || !!emu.steamSettings || emu.dll.length > 0;
      if (hasSetupOnDisk || readsGoldbergSave) {
        emulated = true;
        goldbergReport = { ...goldberg.diagnose({ gameDir, appid: writableAppid, schema: game }), dllCount: emu.dll.length };
      }
    } catch (err) {
      debug.log(`[health] goldberg diagnose failed for ${appid} => ${formatErr(err)}`);
    }
  }

  let uplayReport = null;
  if (uplayR2.isUplayR2Game(game, appid) && gameDirExists) {
    try {
      const identity = uplayR2.resolveGameIdentity({ ...game, appid, gameDir }, appid);
      uplayReport = uplayR2.diagnose({ gameDir, appid, name: game.name, mapping: identity.mapping });
    } catch (err) {
      debug.log(`[health] uplay R2 diagnose failed for ${appid} => ${formatErr(err)}`);
    }
  }

  const indexEntry = gameIndex.get(appid);
  let playtime = { playtime: 0, lastplayed: 0 };
  try {
    playtime = await PlaytimeTracking(appid);
  } catch (err) {
    debug.log(`[health] playtime read failed for ${appid} => ${formatErr(err)}`);
  }

  return {
    appid,
    steamappid: game.steamappid || '',
    name: game.name || '',
    source,
    system,
    manual: !!game.manual,
    unconfigured: !!game.unconfigured,
    isUbisoft,
    installed: !!game.installed,
    gameDir,
    gameDirExists,
    exe,
    exeExists: !!exe && fs.existsSync(exe),
    achievements: { total: (game.achievement && game.achievement.total) || 0, unlocked: (game.achievement && game.achievement.unlocked) || 0 },
    emulated,
    achievementsCheckedAt,
    saveSources,
    goldberg: goldbergReport,
    uplay: uplayReport,
    // Console emulators (RPCS3/ShadPS4/Xenia) and the official platform libraries are followed by
    // their own watchers, not by the process monitor, so a missing gameIndex entry means nothing
    // for them and must not be reported as a fault.
    processTracking: !isConsole && !isOfficialPlatformSource(source),
    tracking: { indexed: !!indexEntry, binary: (indexEntry && indexEntry.binary) || '' },
    notifications: {
      transport: (app.config && app.config.notification_transport && app.config.notification_transport.mode) || 'auto',
      progressMuted: progressMute.isMuted(appid),
      // What the Watchdog observed last time it announced something for this game. Absent until it
      // has actually delivered one, and never guessed at from the setting.
      effective: notificationHealth.forGame(appid),
    },
    playtime: { total: playtime.playtime || 0, lastPlayed: playtime.lastplayed || 0 },
  };
}

function gameHealthStateLabel(state) {
  if (state === gameHealth.STATE.READY) return t('gh-state-ready', 'Ready', 'Prêt');
  if (state === gameHealth.STATE.NOT_TRACKING) return t('gh-state-not-tracking', 'Not tracking', 'Non suivi');
  return t('gh-state-attention', 'Needs attention', 'À vérifier');
}

// The one sentence that has to make the state make sense on its own, in the user's words.
function gameHealthExplanation(report) {
  const p = report.params || {};
  switch (report.reason) {
    case 'not-installed':
      return t('gh-why-not-installed', "This game isn't installed on this PC, or AW Next can't tell where it is. Choose its executable so it can be watched.", "Ce jeu n'est pas installé sur ce PC, ou AW Next ne sait pas où il se trouve. Choisis son exécutable pour qu'il puisse être suivi.");
    case 'install-gone':
      return t('gh-why-install-gone', 'The game folder AW Next knew about is gone - it was moved, uninstalled, or is on a drive that is not connected. Point AW Next at the game again.', "Le dossier du jeu connu d'AW Next a disparu : déplacé, désinstallé, ou sur un disque non connecté. Indique à nouveau son emplacement.", p);
    case 'no-achievement-data':
      return t('gh-why-no-achievement-data', 'No achievement list could be found for this game, so there is nothing to track yet. Games with no achievements at all are normal here.', "Aucune liste de succès n'a été trouvée pour ce jeu, il n'y a donc rien à suivre. C'est normal pour un jeu sans succès.");
    case 'emulator-missing':
      return t('gh-why-emulator-missing', 'This game needs a Steam emulator to record achievements, and none is set up in its folder. Use the emulator fix from the game’s right-click menu to set one up.', "Ce jeu a besoin d'un émulateur Steam pour enregistrer les succès, et aucun n'est installé dans son dossier. Utilise le fix émulateur du menu clic droit du jeu.");
    case 'emulator-runtime-missing':
      return t('gh-why-emulator-runtime-missing', 'The achievement data is in place, but the emulator file that reads it is missing from the game folder, so nothing will ever be recorded. AW Next can put it back.', "Les données de succès sont en place, mais le fichier d'émulateur qui les lit est absent du dossier du jeu : rien ne sera jamais enregistré. AW Next peut le remettre.");
    case 'uplay-broken':
      return t('gh-why-uplay-broken', 'The Ubisoft emulator setup for this game is incomplete, so unlocks are not being recorded. Use the Uplay R2 repair button below.', "La configuration de l'émulateur Ubisoft de ce jeu est incomplète : les déblocages ne sont pas enregistrés. Utilise le bouton de réparation Uplay R2 ci-dessous.", p);
    case 'achievement-data-incomplete':
      return t('gh-why-achievement-data-incomplete', "The achievement list AW Next has for this game doesn't match what the game will look for, so some unlocks would be missed. This can be rewritten from the official data.", "La liste de succès dont dispose AW Next ne correspond pas à ce que le jeu va chercher : certains déblocages seraient manqués. Elle peut être réécrite à partir des données officielles.", p);
    case 'no-progress-yet':
      return t('gh-why-no-progress-yet', 'The game is detected and achievement data is available, but no achievement progress has been found yet. The likely issue is the game or emulator configuration rather than notifications.', "Le jeu est détecté et les données de succès sont disponibles, mais aucune progression n'a encore été trouvée. Le problème vient probablement de la configuration du jeu ou de l'émulateur, pas des notifications.");
    case 'install-unknown':
      return t('gh-why-install-unknown', "AW Next is reading this game's achievements from its save files, but doesn't know where the game itself is installed. Locate it to enable playtime tracking and repairs.", "AW Next lit les succès de ce jeu dans ses fichiers de sauvegarde, mais ne sait pas où le jeu est installé. Localise-le pour activer le temps de jeu et les réparations.");
    case 'not-watched':
      return t('gh-why-not-watched', "Everything needed is in place, but AW Next isn't watching this game while it runs, so playtime and live unlock notifications won't happen.", "Tout est en place, mais AW Next ne surveille pas ce jeu pendant qu'il tourne : ni temps de jeu ni notifications en direct.");
    case 'appid-mismatch':
      return t('gh-why-appid-mismatch', 'The emulator in this game’s folder announces game ID {appidOnDisk}, but AW Next matched this game to {appidExpected}. Achievements unlocked under the wrong ID are recorded against another game. Correct the file if {appidExpected} is the right game - the current value is kept.', 'L’émulateur du dossier de ce jeu annonce l’identifiant {appidOnDisk}, alors qu’AW Next a associé ce jeu à {appidExpected}. Les succès débloqués sous le mauvais identifiant sont enregistrés sur un autre jeu. Corrige le fichier si {appidExpected} est le bon jeu - la valeur actuelle est conservée.', p);
    case 'notification-failed':
      return t('gh-why-notification-failed', 'This game is tracked correctly and its unlocks are being seen, but the last notification could not be sent. Send a test notification to check the display path.', "Ce jeu est correctement suivi et ses déblocages sont bien vus, mais la dernière notification n'a pas pu être envoyée. Envoie une notification de test pour vérifier l'affichage.");
    case 'progress-muted':
      return t('gh-why-progress-muted', 'This game is set up correctly. Progress notifications are muted for it, so only full unlocks will be announced.', "Ce jeu est correctement configuré. Les notifications de progression sont coupées pour lui : seuls les déblocages complets seront annoncés.");
    case 'nothing-unlocked-yet':
      return t('gh-why-nothing-unlocked-yet', "This game is set up correctly and AW Next is watching it. Nothing has been unlocked yet, which is simply a game you haven't made progress in.", "Ce jeu est correctement configuré et AW Next le surveille. Rien n'a encore été débloqué, c'est simplement un jeu sans progression.");
    case 'ready':
      return t('gh-why-ready', 'This game is detected, its achievement data is available, and AW Next is watching it for unlocks.', 'Ce jeu est détecté, ses données de succès sont disponibles et AW Next surveille ses déblocages.');
    default:
      return t('gh-why-attention', 'This game works, but part of its setup is incomplete. The checks below show which part.', 'Ce jeu fonctionne, mais une partie de sa configuration est incomplète. Les vérifications ci-dessous indiquent laquelle.');
  }
}

function gameHealthCheckLabel(id, simple) {
  if (simple) {
    switch (id) {
      case 'install':
        return t('gh-simple-check-install', 'Game files', 'Fichiers du jeu');
      case 'executable':
        return t('gh-simple-check-executable', 'Game', 'Jeu');
      case 'achievement-data':
        return t('gh-simple-check-achievement-data', 'Achievements', 'Succès');
      case 'emulator':
      case 'uplay':
        return t('gh-simple-check-emulator', 'Achievement support', 'Prise en charge des succès');
      case 'progress':
        return t('gh-simple-check-progress', 'Progress', 'Progression');
      case 'tracking':
        return t('gh-simple-check-tracking', 'Tracking', 'Suivi');
      default:
        return t('gh-check-notifications', 'Notifications', 'Notifications');
    }
  }
  switch (id) {
    case 'install':
      return t('gh-check-install', 'Game files', 'Fichiers du jeu');
    case 'executable':
      return t('gh-check-executable', 'Executable', 'Exécutable');
    case 'identity':
      return t('gh-check-identity', 'Game identity', 'Identité du jeu');
    case 'achievement-data':
      return t('gh-check-achievement-data', 'Achievement data', 'Données de succès');
    case 'emulator':
    case 'uplay':
      return t('gh-check-emulator', 'Emulator setup', 'Configuration émulateur');
    case 'progress':
      return t('gh-check-progress', 'Progress', 'Progression');
    case 'tracking':
      return t('gh-check-tracking', 'Live tracking', 'Suivi en direct');
    default:
      return t('gh-check-notifications', 'Notifications', 'Notifications');
  }
}

/*
  Simple mode: one plain outcome per check, in the words a player would use. No paths, no process
  names, no appid, no transport name - those are what Technical details is for.
*/
function gameHealthSimpleCheckValue(entry) {
  const p = entry.params || {};
  const ok = entry.level === gameHealth.LEVEL.OK;
  switch (entry.id) {
    case 'install':
      return ok
        ? t('gh-simple-install-ok', 'Game files found', 'Fichiers du jeu trouvés')
        : t('gh-simple-install-missing', 'Game files not found', 'Fichiers du jeu introuvables');
    case 'executable':
      return ok
        ? t('gh-simple-executable-ok', 'Game found on this PC', 'Jeu trouvé sur ce PC')
        : t('gh-simple-executable-missing', 'Game not located yet', 'Jeu pas encore localisé');
    case 'achievement-data':
      if (ok) return t('gh-simple-data-ok', 'Achievement data found', 'Données de succès trouvées');
      return entry.level === gameHealth.LEVEL.FAIL
        ? t('gh-simple-data-missing', 'No achievement data found', 'Aucune donnée de succès trouvée')
        : t('gh-simple-data-partial', 'Achievement data is incomplete', 'Données de succès incomplètes');
    case 'emulator':
    case 'uplay':
      if (ok) return t('gh-simple-emulator-ok', 'Achievement support is set up', 'Prise en charge des succès configurée');
      return entry.level === gameHealth.LEVEL.FAIL
        ? t('gh-simple-emulator-missing', 'Achievement support is missing', 'Prise en charge des succès absente')
        : t('gh-simple-emulator-partial', 'Achievement support needs attention', 'Prise en charge des succès à vérifier');
    case 'progress':
      if (ok) return t('gh-simple-progress-ok', 'Achievement progress found', 'Progression des succès trouvée');
      // A save file exists but nothing is earned in it yet. gameHealth.js only sets `type` on that
      // branch, so its presence is what separates "we found the save" from "there is none".
      if (p.type !== undefined) return t('gh-simple-progress-save', 'Game saves detected', 'Sauvegardes du jeu détectées');
      return entry.level === gameHealth.LEVEL.WARN
        ? t('gh-simple-progress-none', 'No progress found yet', 'Aucune progression trouvée pour le moment')
        : t('gh-simple-progress-empty', 'Nothing unlocked yet', 'Rien de débloqué pour le moment');
    case 'tracking':
      return ok
        ? t('gh-simple-tracking-ok', 'Tracking active', 'Suivi actif')
        : t('gh-simple-tracking-off', 'Not being tracked yet', 'Pas encore suivi');
    default: {
      if (entry.level === gameHealth.LEVEL.INFO)
        return t('gh-simple-notifications-muted', 'Progress notifications are muted', 'Notifications de progression coupées');
      if (entry.level === gameHealth.LEVEL.WARN)
        return t('gh-simple-notifications-failed', 'The last notification could not be sent', "La dernière notification n'a pas pu être envoyée");
      // Working, but not the way the setting alone would suggest - say which, since "no overlay
      // appeared" is otherwise read as a fault rather than as the fallback doing its job. The
      // comparison lives in gameHealth.js; Simple only picks the sentence.
      if (p.fallbackActive)
        return t('gh-simple-notifications-fallback', 'Working - Windows fallback active', 'Fonctionnel - repli Windows actif');
      return t('gh-simple-notifications-ok', 'Notifications working', 'Notifications opérationnelles');
    }
  }
}

/*
  The emulator's name. "gbe" / "goldberg" are internal ids and must never reach the UI; the two
  product names are brands that stay identical in every language, while "no emulator" is a real
  sentence and uses the translation the right-click diagnosis already ships.
*/
function gameHealthEmulatorLabel(emulator) {
  if (emulator === 'gbe') return 'GBE Fork';
  if (emulator === 'goldberg') return 'Goldberg';
  if (!emulator || emulator === 'none') return t('diagnosis-emulator-none', 'none detected', 'aucun détecté');
  return String(emulator);
}

/*
  The notification transport, reusing the labels the Notifications tab already shows for the same
  setting, so the two never drift apart and no new translation is needed for a value that exists.
*/
function gameHealthTransportLabel(transport) {
  const key = String(transport || '').toLowerCase();
  if (!key) return '';
  const labels = (window.appLocale && window.appLocale.settings?.notification?.option?.mode?.value) || null;
  return (labels && labels[key]) || key;
}

/*
  Why the last notification went where it went. Only the states the user could otherwise misread are
  named: a transport that simply did what the setting says needs no explanation, while one chosen
  over the configured overlay - or one whose delivery could not be confirmed - does.
*/
function gameHealthNotificationReason(params) {
  if (params.outcome === 'unknown') return t('gh-notif-unconfirmed', 'delivery not confirmed', 'diffusion non confirmée');
  if (params.outcome === 'failed') return t('gh-notif-reason-failed', 'sending failed', "l'envoi a échoué");
  switch (params.effectiveReason) {
    case 'fullscreen-hidden':
      return t('gh-notif-reason-fullscreen', 'game in exclusive fullscreen', 'jeu en plein écran exclusif');
    case 'overlay-unavailable':
      return t('gh-notif-reason-unavailable', 'overlay unavailable', 'overlay indisponible');
    case 'overlay-failing':
      return t('gh-notif-reason-overlay-failing', 'the overlay could not display', "l'overlay n'a pas pu s'afficher");
    case 'remembered-toast':
      return t('gh-notif-reason-remembered', 'what worked for this game', 'ce qui a fonctionné pour ce jeu');
    default:
      return '';
  }
}

// What each group of diagnosis codes is about, in the words a player would use. Replaces the bare
// "N point(s) to review", which named a number and gave no way to find out what it referred to.
function gameHealthIssueTopicLabel(topic) {
  switch (topic) {
    case 'schema':
      return t('gh-issue-schema', 'achievement list', 'liste des succès');
    case 'icons':
      return t('gh-issue-icons', 'achievement icons', 'icônes des succès');
    case 'appid':
      return t('gh-issue-appid', 'game ID file', 'fichier d’identification du jeu');
    case 'dlc':
      return t('gh-issue-dlc', 'DLC access', 'accès aux DLC');
    case 'compat':
      return t('gh-issue-compat', 'Steam compatibility settings', 'réglages de compatibilité Steam');
    case 'account':
      return t('gh-issue-account', 'account name and language', 'nom de compte et langue');
    case 'savepath':
      return t('gh-issue-savepath', 'custom save location', 'emplacement de sauvegarde personnalisé');
    case 'loader':
      return t('gh-issue-loader', 'emulator version', 'version de l’émulateur');
    default:
      return t('gh-issue-mapping', 'matching Steam release', 'version Steam correspondante');
  }
}

// Values stay concrete: real paths, real counts. Only the connecting words are translated.
function gameHealthCheckValue(entry, simple) {
  if (simple) return gameHealthSimpleCheckValue(entry);
  const p = entry.params || {};
  const missing = t('gh-value-missing', 'not found', 'introuvable');
  switch (entry.id) {
    case 'install':
      if (p.path) return entry.level === gameHealth.LEVEL.OK ? p.path : `${p.path} - ${missing}`;
      return missing;
    case 'executable':
      if (p.path) return entry.level === gameHealth.LEVEL.OK ? p.path : `${p.path} - ${missing}`;
      return missing;
    case 'identity':
      return [p.appid, p.source].filter(Boolean).join(' · ') || missing;
    case 'achievement-data':
      if (p.missing) return t('gh-value-missing-entries', '{missing} of {total} missing from the emulator file', '{missing} sur {total} absents du fichier de l’émulateur', p);
      if (p.missingIcons && p.iconsUnavailable) return t('gh-value-icons-unavailable', 'icons not published by Steam yet', 'illustrations pas encore publiées par Steam', p);
      if (p.missingIcons) return t('gh-value-missing-icons', '{missingIcons} icons not downloaded', '{missingIcons} icônes non téléchargées', p);
      if (p.total || p.found) return t('gh-value-achievements', '{total} achievements', '{total} succès', { total: p.total || p.found });
      return missing;
    case 'emulator':
      // Name what is wrong. A bare count ("1 point to review") gave the user no way to know what to
      // look at, which defeats the purpose of the row.
      if (p.topics && p.topics.length) return p.topics.map(gameHealthIssueTopicLabel).join(' · ');
      return gameHealthEmulatorLabel(p.emulator);
    case 'uplay': {
      const mapping = p.steamAppid
        ? t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
            appid: p.steamAppid,
            name: p.steamName || `Steam App ${p.steamAppid}`,
          })
        : '';
      const problems = p.topics && p.topics.length ? p.topics.map(gameHealthIssueTopicLabel).join(' · ') : '';
      return [mapping, problems].filter(Boolean).join(' · ') || gameHealthIssueTopicLabel('mapping');
    }
    case 'progress':
      if (p.unlocked) return t('gh-value-unlocked', '{unlocked} unlocked', '{unlocked} débloqué(s)', p);
      return t('gh-value-none-yet', 'nothing recorded yet', 'rien d’enregistré pour l’instant');
    case 'tracking':
      if (p.binary) return t('gh-value-watching', 'watching {binary}', 'surveille {binary}', p);
      return t('gh-value-none-yet', 'nothing recorded yet', 'rien d’enregistré pour l’instant');
    default: {
      if (entry.level === gameHealth.LEVEL.INFO) return t('gh-value-muted', 'progress muted', 'progression coupée');
      // Nothing has been announced for this game yet: all there is to report is the setting.
      if (!p.effective) return gameHealthTransportLabel(p.transport);
      const detail = gameHealthNotificationReason(p);
      const transport = gameHealthTransportLabel(p.effective);
      return detail ? `${transport} · ${detail}` : transport;
    }
  }
}

function gameHealthActionLabel(action) {
  switch (action) {
    case gameHealth.ACTION.CHOOSE_EXE:
      return t('gh-action-choose-exe', 'Locate the game', 'Localiser le jeu');
    case gameHealth.ACTION.OPEN_FOLDER:
      return t('gh-action-open-folder', 'Open the game folder', 'Ouvrir le dossier du jeu');
    case gameHealth.ACTION.REPAIR_DATA:
      return t('gh-action-repair-data', 'Rewrite the achievement data', 'Réécrire les données de succès');
    case gameHealth.ACTION.REPAIR_UPLAY:
      return t('apply-emulator-fix-uplay-r2', 'Repair Uplay R2 support', 'Réparer la prise en charge Uplay R2');
    case gameHealth.ACTION.INSTALL_RUNTIME:
      return t('gh-action-install-runtime', 'Restore the emulator file', 'Restaurer le fichier d’émulateur');
    case gameHealth.ACTION.START_TRACKING:
      return t('gh-action-start-tracking', 'Watch this game', 'Surveiller ce jeu');
    case gameHealth.ACTION.UNMUTE_PROGRESS:
      return t('gh-action-unmute-progress', 'Unmute progress notifications', 'Réactiver les notifications de progression');
    case gameHealth.ACTION.FIX_APPID:
      return t('gh-action-fix-appid', 'Correct the game ID file', 'Corriger le fichier d’identification');
    default:
      return t('gh-action-test-notification', 'Send a test notification', 'Envoyer une notification de test');
  }
}

const GAME_HEALTH_ICON = { ok: 'fa-check-circle', warn: 'fa-exclamation-triangle', fail: 'fa-times-circle', info: 'fa-info-circle' };
const GAME_HEALTH_STATE_ICON = { ready: 'fa-check-circle', attention: 'fa-exclamation-triangle', 'not-tracking': 'fa-times-circle' };

function paintGameHealth(report) {
  const root = $('#game-health');
  // Kept for the repairs that need a value out of the report they were offered by (the appid fix
  // needs the two ids). Re-reading the whole report would risk acting on a different one.
  root.data('report', report);
  const chip = root.find('.gh-state').attr('data-state', report.state);
  // The chip starts as a spinner; swapping the icon is what ends the loading state.
  chip.find('i').attr('class', `fas ${GAME_HEALTH_STATE_ICON[report.state] || GAME_HEALTH_ICON.info}`);
  chip.find('.gh-state-label').text(gameHealthStateLabel(report.state));
  root.find('.gh-explanation').text(gameHealthExplanation(report));

  const simple = interfaceIsSimple();
  const mode = simple ? gameHealthInterfaceMode.SIMPLE : gameHealthInterfaceMode.ADVANCED;
  const checks = report.checks
    // Simple drops the purely diagnostic rows (interfaceMode.SIMPLE_HIDDEN_CHECKS). They are
    // filtered out of the DISPLAY only - the report they came from is unchanged, so the state, the
    // explanation and the offered repairs are identical in both modes.
    .filter((entry) => gameHealthInterfaceMode.isCheckVisible(entry.id, mode))
    .map((entry) => {
      const value = gameHealthCheckValue(entry, simple);
      return `<li data-level="${escapeHtml(entry.level)}" data-check="${escapeHtml(entry.id)}">
        <i class="fas ${GAME_HEALTH_ICON[entry.level] || GAME_HEALTH_ICON.info}"></i>
        <span class="gh-check-label">${escapeHtml(gameHealthCheckLabel(entry.id, simple))}</span>
        <span class="gh-check-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
      </li>`;
    })
    .join('');
  root.find('.gh-checks').html(checks);

  // The first action is the fix for the problem the explanation just named, so it leads.
  const actions = report.actions
    .map(
      (action, index) =>
        `<button type="button" class="inline-action-btn${index === 0 ? ' primary' : ' secondary'}" data-gh-action="${escapeHtml(action)}">${escapeHtml(
          gameHealthActionLabel(action)
        )}</button>`
    )
    .join('');
  root.find('.gh-actions').html(actions);

  root.find('.gh-technical-label').text(t('gh-technical', 'Technical details', 'Détails techniques'));
  root.find('.gh-copy').html(`<i class="fas fa-copy"></i> ${escapeHtml(t('gh-copy', 'Copy', 'Copier'))}`);
  root.find('.gh-technical-dump').text(JSON.stringify(report.technical, null, 2));
  paintGameHealthVerified(root, report);
}

/*
  "Achievements checked N days ago", linking to the control that forces a recheck now. Steam
  announces nothing when a game update adds achievements, so the list is re-read on a 3-day cadence
  (steam.js, descBackfilledAt) - the only honest answer to "is this current?". Advanced only: the
  cadence is machinery a Simple user isn't asked to manage.
*/
function gameHealthVerifiedLabel(stampMs) {
  if (!stampMs) return t('gh-verified-never', 'Achievement list never checked', 'Liste des succès jamais vérifiée');
  // Intl phrases the delay ("3 days ago", "yesterday") with the right plural and wording for the
  // language; the locale files only carry the sentence it is dropped into.
  const when = intlFormat.formatRelativeTime(stampMs, uiLang());
  return t('gh-verified-when', 'Achievements checked {when}', 'Succès vérifiés {when}', { when });
}

function paintGameHealthVerified(root, report) {
  const el = root.find('.gh-verified');
  if (!el.length) return;
  // A negative or future stamp is a clock change, not a check: treat it as never rather than
  // rendering "checked -3 days ago".
  const raw = Number(report && report.technical && report.technical.achievementsCheckedAt) || 0;
  const stamp = raw > 0 && raw <= Date.now() ? raw : 0;
  el.text(gameHealthVerifiedLabel(stamp));
  el.attr('title', t('gh-verified-hint', 'Open the setting that rechecks achievement lists', 'Ouvrir le réglage qui revérifie les listes de succès'));
  el.removeAttr('hidden');
}

/*
  Drive the Game Health repair progress bar. "Repair the achievement data" downloads two icons per
  achievement, so a large game can sit for a minute looking frozen/hung. Phases with a countable
  unit of work (the icons) fill the bar; phases without one (backup, schema/config writes) switch
  it to an indeterminate sweep instead of inventing a percentage.
*/
const GAME_HEALTH_PROGRESS_LABEL = {
  backup: () => t('gh-progress-backup', 'Backing up the current files…', 'Sauvegarde des fichiers actuels…'),
  icons: () => t('gh-progress-icons', 'Downloading achievement icons…', 'Téléchargement des icônes de succès…'),
  schema: () => t('gh-progress-schema', 'Writing the achievement list…', 'Écriture de la liste des succès…'),
  config: () => t('gh-progress-config', 'Writing the emulator settings…', 'Écriture des réglages de l’émulateur…'),
};

function setGameHealthProgress(progress) {
  const box = $('#game-health').find('.gh-progress');
  if (!box.length) return;
  if (!progress || progress.phase === 'done') {
    box.attr('hidden', 'hidden').removeAttr('data-indeterminate');
    box.find('.gh-progress-fill').css('width', '0%');
    box.find('.gh-progress-count').text('');
    return;
  }
  const { phase, done = 0, total = 0 } = progress;
  const label = GAME_HEALTH_PROGRESS_LABEL[phase];
  box.removeAttr('hidden');
  box.find('.gh-progress-label').text(label ? label() : '');
  // total 0 means "no countable work here", which is not the same as "0 of 0 done".
  const determinate = Number(total) > 0;
  const track = box.find('.gh-progress-track');
  if (determinate) {
    const percent = Math.max(0, Math.min(100, Math.round((Number(done) / Number(total)) * 100)));
    box.removeAttr('data-indeterminate');
    box.find('.gh-progress-fill').css('width', `${percent}%`);
    box.find('.gh-progress-count').text(`${formatCount(done)} / ${formatCount(total)}`);
    track.attr('aria-valuenow', String(percent));
  } else {
    box.attr('data-indeterminate', 'true');
    box.find('.gh-progress-count').text('');
    track.removeAttr('aria-valuenow');
  }
}

async function renderGameHealth(appid) {
  const root = $('#game-health');
  root.attr('data-appid', String(appid));
  const chip = root.find('.gh-state').attr('data-state', 'loading');
  // Restore the spinner: a previous report for another game replaced it with its own state icon.
  chip.find('i').attr('class', 'fas fa-circle-notch fa-spin');
  chip.find('.gh-state-label').text(t('gh-loading', 'Checking…', 'Vérification…'));
  root.find('.gh-explanation').text('');
  root.find('.gh-checks').empty();
  root.find('.gh-actions').empty();
  setGameHealthProgress(null);

  try {
    const signals = await collectGameHealthSignals(appid);
    // The panel can be reopened on another game while the folder walk is still running.
    if (String(root.attr('data-appid')) !== String(appid)) return;
    paintGameHealth(gameHealth.deriveHealth(signals));
  } catch (err) {
    debug.error(`[health] report failed for ${appid} => ${formatErr(err)}`);
    chip.attr('data-state', gameHealth.STATE.ATTENTION);
    chip.find('i').attr('class', `fas ${GAME_HEALTH_STATE_ICON[gameHealth.STATE.ATTENTION]}`);
    chip.find('.gh-state-label').text(gameHealthStateLabel(gameHealth.STATE.ATTENTION));
    root.find('.gh-explanation').text(`${t('unexpected-error', 'Unexpected Error', 'Erreur inattendue')} - ${err && (err.message || err)}`);
  }
}

async function notificationPreviewGame(appid) {
  const game = gameList.find((entry) => entry.appid == appid) || {};
  const art = game.img || {};
  const artAppid = game.steamappid || appid;
  const resolveArt = async (token) => {
    if (!token) return '';
    try {
      const resolved = await ipcRenderer.invoke('fetch-icon', token, artAppid);
      if (!resolved) return '';
      return resolved.startsWith('file://') ? require('url').fileURLToPath(resolved) : resolved;
    } catch (err) {
      debug.log(`[notification-preview] could not resolve artwork "${token}" for ${appid} => ${formatErr(err)}`);
      return '';
    }
  };

  const [square, image] = await Promise.all([
    ipcRenderer
      .invoke('resolve-square-logo', {
        appid: artAppid,
        libraryAppid: String(appid),
        name: game.name || '',
        sources: [art.icon, art.logo, art.portrait, art.header].filter(Boolean),
      })
      .catch(() => ''),
    resolveArt(art.header || art.background || art.icon || art.logo),
  ]);
  const icon = square && square.startsWith('file://') ? require('url').fileURLToPath(square) : square || '';
  // `appid` is the id artwork is cached under; `libraryAppid` is the one the game's own settings
  // (its notification preset, its custom position) are keyed on. For a namespaced game they differ.
  return { appid: artAppid, libraryAppid: String(appid), name: game.name || '', icon, image };
}

async function testGameNotification(appid, kind, button) {
  const root = $('#game-notifications');
  let settings = {};
  if (String(root.attr('data-appid')) === String(appid) && root.attr('data-loaded') === 'true') {
    settings = gameNotificationSettingsFromPanel();
  } else {
    settings = gameNotificationPreset.normalizeSettings(
      (await ipcRenderer.invoke('game-preset:get', String(appid)).catch(() => ({}))) || {}
    );
  }
  const game = await notificationPreviewGame(appid);
  await window.testAchievementWatcherNotification(
    app.config?.notification_transport?.mode,
    button,
    settings,
    game,
    kind
  );
}

/*
  Run one repair. The two that write files describe exactly what they are about to change and where
  the previous version is kept before the first byte is written; both delegate the writing to the
  parsers that already implement that backup, so nothing here weakens it.
*/
async function runGameHealthAction(appid, action, button) {
  const game = gameList.find((g) => g.appid == appid) || {};
  const writableAppid = /^[0-9]+$/.test(String(appid)) ? String(appid) : game.steamappid || null;

  if (action === gameHealth.ACTION.CHOOSE_EXE) {
    setGameConfigView('exe-config');
    $('#game-config .edit').trigger('click');
    return false;
  }

  if (action === gameHealth.ACTION.OPEN_FOLDER) {
    if (game.gameDir) remote.shell.openPath(game.gameDir);
    return false;
  }

  if (action === gameHealth.ACTION.UNMUTE_PROGRESS) {
    progressMute.toggle(appid);
    return true;
  }

  if (action === gameHealth.ACTION.START_TRACKING) {
    const cfg = await exeList.get(appid);
    const exe = (cfg && cfg.exe) || game.exe || '';
    if (!exe) return false;
    gameIndex.upsert({ appid, name: game.name || '', binary: path.basename(exe), icon: game.img?.icon || '', source: game.source || '' });
    return true;
  }

  /*
    Point steam_appid.txt at the appid AW Next resolved for this game. Both values are put in front
    of the user before anything is written, because the mismatch has two possible causes and only
    the user can tell them apart: a setup applied for the wrong game, or a library card matched to
    the wrong Steam release. The previous file is kept under steam_settings/.aw-backups/.
  */
  if (action === gameHealth.ACTION.FIX_APPID) {
    const report = $('#game-health').data('report');
    const params = (report && report.checks.find((entry) => entry.id === 'emulator')?.params) || {};
    const steamSettings = game.steamSettings || (game.gameDir ? path.join(game.gameDir, 'steam_settings') : '');
    if (!params.appidExpected || !steamSettings) return false;

    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('gh-appid-confirm-title', 'Correct the game ID file?', 'Corriger le fichier d’identification ?'),
      message: t('gh-appid-confirm-message', 'steam_appid.txt will be changed from {appidOnDisk} to {appidExpected}.', 'steam_appid.txt passera de {appidOnDisk} à {appidExpected}.', params),
      detail: t('gh-appid-confirm-detail', 'Only do this if {game} really is game {appidExpected} on Steam. If the emulator was set up on purpose for {appidOnDisk}, cancel: the file is right and the library card is what needs correcting. The current file is backed up under steam_settings\\.aw-backups.', 'Ne fais ceci que si {game} est bien le jeu {appidExpected} sur Steam. Si l’émulateur a été configuré volontairement pour {appidOnDisk}, annule : c’est le fichier qui a raison et la fiche du jeu qu’il faut corriger. Le fichier actuel est sauvegardé dans steam_settings\\.aw-backups.', {
        ...params,
        game: game.name || appid,
      }),
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('gh-action-fix-appid', 'Correct the game ID file', 'Corriger le fichier d’identification')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return false;

    try {
      const result = goldberg.writeSteamAppId({ steamSettings, appid: params.appidExpected });
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'info',
        title: t('gh-appid-done-title', 'Game ID file corrected', 'Fichier d’identification corrigé'),
        message: t('gh-appid-done-message', 'steam_appid.txt now reads {appid}.', 'steam_appid.txt contient maintenant {appid}.', { appid: result.appid }),
        detail: result.backupDir || '',
      });
      return true;
    } catch (err) {
      debug.error(`[health] appid repair failed for ${appid} => ${formatErr(err)}`);
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
        message: t('gh-action-failed', 'That repair could not be completed.', 'Cette réparation n’a pas pu être effectuée.'),
        detail: `${err && (err.message || err)}`,
      });
      return false;
    }
  }

  if (action === gameHealth.ACTION.TEST_NOTIFICATION) {
    await testGameNotification(appid, 'toast', button && button[0]);
    return false;
  }

  if (action === gameHealth.ACTION.REPAIR_UPLAY) {
    if (!game.gameDir || !fs.existsSync(game.gameDir)) return false;
    try {
      const result = await applyUplayR2Repair({ game, gameDir: game.gameDir, appid, interactive: true, showResult: true });
      return !!result;
    } catch (err) {
      debug.error(`[health] Uplay R2 repair failed for ${appid} => ${formatErr(err)}`);
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('uplay-r2-install-failed', 'Uplay R2 repair failed', 'Échec de la réparation Uplay R2'),
        message: t('could-not-install-or-configure-goldberg-uplay-r2', 'Could not install or configure Goldberg Uplay R2.', "Impossible d'installer ou de configurer Goldberg Uplay R2."),
        detail: formatErr(err),
      });
      return false;
    }
  }

  if (action === gameHealth.ACTION.REPAIR_DATA) {
    /*
      Repair the folder the diagnosis actually read, not a guess: `game.steamSettings` is absent for
      many games, and the naive fallback (<gameDir>/steam_settings) is wrong when the emulator lives
      in a nested engine directory (e.g. Unreal's Binaries/Win64) - it used to create an empty
      steam_settings the emulator never reads. Repair the report's own resolved path instead.
    */
    const diagnosed = $('#game-health').data('report');
    const diagnosedSettings = (diagnosed && diagnosed.technical && diagnosed.technical.goldberg && diagnosed.technical.goldberg.steamSettings) || '';
    const plan = gameHealthRepair.planAchievementDataRepair({
      steamSettings: diagnosedSettings || game.steamSettings,
      gameDir: game.gameDir,
      achievementCount: (game.achievement && game.achievement.total) || 0,
      downloadIcons: !!(app.config.achievement && app.config.achievement.goldbergDownloadIcons),
    });
    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'question',
      title: t('gh-confirm-repair-title', 'Rewrite the achievement data?', 'Réécrire les données de succès ?'),
      message: t('gh-confirm-repair-message', 'AW Next will write the achievement list, icons and emulator settings for this game.', 'AW Next va écrire la liste des succès, les icônes et les réglages de l’émulateur de ce jeu.'),
      detail: t(
        'gh-confirm-repair-detail',
        'Files written in:\n{target}\n\n{writes}\n\nAny existing version of these files is copied to {backup} first.',
        'Fichiers écrits dans :\n{target}\n\n{writes}\n\nToute version existante de ces fichiers est d’abord copiée dans {backup}.',
        { target: plan.target, writes: plan.writes.join(', '), backup: plan.backup }
      ),
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('gh-action-repair-data', 'Rewrite the achievement data', 'Réécrire les données de succès')],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return false;

    const request = require('request-zero');
    /*
      Coalesce the per-icon updates: a big game reports hundreds of them, and re-laying out the
      panel that often would make the repair feel slower. Throttled on a timestamp, not
      requestAnimationFrame: rAF is undependable here since backgroundThrottling stops delivering it
      when the window isn't composited. A phase change always paints, so the label never lags behind.
    */
    const PROGRESS_PAINT_MS = 80;
    let lastProgressPaint = 0;
    let lastProgressPhase = '';
    const pushProgress = (progress) => {
      const now = Date.now();
      const phaseChanged = progress && progress.phase !== lastProgressPhase;
      const finished = progress && (progress.phase === 'done' || (progress.total > 0 && progress.done >= progress.total));
      if (!phaseChanged && !finished && now - lastProgressPaint < PROGRESS_PAINT_MS) return;
      lastProgressPaint = now;
      lastProgressPhase = progress ? progress.phase : '';
      setGameHealthProgress(progress);
    };
    setGameHealthProgress({ phase: 'backup', done: 0, total: 0 });
    // try/finally, not a plain await: a repair that throws must still take the bar down with it,
    // otherwise the panel is left showing progress for something that already stopped.
    let summary;
    try {
      summary = await gameHealthRepair.repairAchievementData({
        goldberg,
        plan,
        appid: writableAppid,
        schema: game,
        onProgress: pushProgress,
        downloadIcon: async (url, dir) => {
          const resolved = (await steamParser.resolveWorkingIconUrl(writableAppid, url)) || url;
          const r = await request.download(resolved, dir);
          return r && r.path;
        },
        fetchDlc: (id) => steamParser.getDLCList(id),
        accountName: app.config?.general?.username,
        language: app.config?.achievement?.lang,
        // An explicit repair must be able to clear NO_USER_CONFIG / BAD_USER_CONFIG. Without this
        // the file was only written when the app had a username or language to stamp into it, so on
        // a default install the repair skipped it entirely and both warnings survived every run.
        fillUserDefaults: true,
      });
    } finally {
      setGameHealthProgress(null);
    }
    /*
      Async dialog, not showMessageBoxSync: the sync one freezes the renderer on the spot, so the
      bar keeps whatever frame it last painted. The 80ms paint throttle means that frame is some
      arbitrary mid-count - a repair that gave up early left "17 / 150" sitting behind the modal,
      reading as a hang. Awaiting the async form lets the hide above reach the screen first.
    */
    await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
      type: 'info',
      title: t('repair-complete', 'Repair complete', 'Réparation terminée'),
      message: t('repair-complete-message', 'Wrote {count} achievements to {path}', '{count} succès écrits dans {path}', {
        count: summary.achievementsJson.length,
        path: summary.steamSettings,
      }),
      detail: t('diagnosis-icons-summary', 'icons: {downloaded} downloaded, {failed} failed, {skipped} skipped', 'icônes : {downloaded} téléchargées, {failed} en échec, {skipped} ignorées', summary.icons)
        + (summary.icons.unavailable ? '\n' + t('diagnosis-icons-unavailable', 'Steam has no achievement artwork for this game yet, so no icon could be downloaded. The achievement list itself is complete; run the repair again once the artwork is published.', "Steam n'a pas encore d'illustrations de succès pour ce jeu : aucune icône n'a pu être téléchargée. La liste des succès est complète ; relancez la réparation une fois les illustrations publiées.") : ''),
      noLink: true,
    });
    return true;
  }

  if (action === gameHealth.ACTION.INSTALL_RUNTIME) {
    const steamSettings = (game.steamSettings && fs.existsSync(game.steamSettings) ? game.steamSettings : null) || goldberg.detectEmulator(game.gameDir).steamSettings;
    const cfg = await exeList.get(appid);
    const exe = (cfg && cfg.exe) || game.exe || '';
    let arch = 'x64';
    try {
      if (exe && fs.existsSync(exe)) arch = require(path.join(appPath, 'util/pe.js')).exeArch(exe) || 'x64';
    } catch {
      /* an unreadable header just means the 64-bit default is used */
    }
    const plan = gameHealthRepair.planRuntimeInstall({ gbeInstaller, gameDir: game.gameDir, exePath: exe || null, steamSettings, arch });
    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'question',
      title: t('gh-confirm-runtime-title', 'Restore the emulator file?', 'Restaurer le fichier d’émulateur ?'),
      message: t('gh-confirm-runtime-message', 'AW Next will download the supported emulator build and install it into the game folder.', 'AW Next va télécharger la version prise en charge de l’émulateur et l’installer dans le dossier du jeu.'),
      detail: t(
        'gh-confirm-runtime-detail',
        '{file} will be installed in:\n{dirs}\n\nAn existing file of that name is kept as {backup} before being replaced.',
        '{file} sera installé dans :\n{dirs}\n\nUn fichier existant de ce nom est conservé sous {backup} avant remplacement.',
        { file: plan.file, dirs: plan.dirs.join('\n'), backup: plan.backup }
      ),
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('gh-action-install-runtime', 'Restore the emulator file', 'Restaurer le fichier d’émulateur')],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return false;

    const summary = await gameHealthRepair.installEmulatorRuntime({
      gbeInstaller,
      plan,
      cacheDir: path.join(getUserDataPath(), 'cache/gbe'),
      steamSettings,
      log: debug,
    });
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'info',
      title: t('repair-complete', 'Repair complete', 'Réparation terminée'),
      message: t('gh-runtime-done', '{installed} emulator file(s) installed ({tag}).', '{installed} fichier(s) d’émulateur installé(s) ({tag}).', {
        installed: summary.installed,
        tag: summary.tag || '',
      }),
      detail: summary.backedUp
        ? t('diagnosis-dlls-backed-up', 'Existing dll(s) backed up as *.bak', 'Dll(s) existante(s) sauvegardée(s) en .bak')
        : '',
      noLink: true,
    });
    return true;
  }

  return false;
}

(function ($, window, document) {
  $(function () {
    if (isDev) debug.log(`[perf] renderer scripts ready ${performance.now().toFixed(0)}ms after page start`);
    applyExternalLinks();
    // Game Health: registered once, not per scan, because the panel outlives every list rebuild.
    $('#game-config-tabs').on('click', 'button', function () {
      setGameConfigView($(this).attr('data-gc-view'));
    });

    $('#game-notifications').on('change', 'select', async function () {
      const root = $('#game-notifications');
      const controls = root.find('select');
      const reposition = $('#game-notification-reposition');
      const appid = String(root.attr('data-appid') || '');
      if (!appid || root.attr('data-loaded') !== 'true') return;
      let previous = {};
      try {
        previous = JSON.parse(root.attr('data-saved-settings') || '{}');
      } catch {}
      const settings = gameNotificationSettingsFromPanel();
      controls.prop('disabled', true);
      reposition.prop('disabled', true);
      try {
        const result = await ipcRenderer.invoke('game-preset:set', { appid, settings });
        if (!result || !result.ok) throw new Error('preset-save-failed');
        if (String(root.attr('data-appid')) === appid) {
          const saved = gameNotificationPreset.normalizeSettings(result.settings || {});
          applyGameNotificationPanelSettings(saved);
          root.attr('data-saved-settings', JSON.stringify(saved));
          controls.prop('disabled', false);
          reposition.prop('disabled', false);
        }
      } catch (err) {
        debug.log(`[game-preset] could not save ${appid} => ${formatErr(err)}`);
        if (String(root.attr('data-appid')) === appid) {
          applyGameNotificationPanelSettings(previous);
          controls.prop('disabled', false);
          reposition.prop('disabled', false);
        }
      }
    });

    $('#game-notification-reposition').on('click', async function () {
      const root = $('#game-notifications');
      const controls = root.find('select');
      const appid = String(root.attr('data-appid') || '');
      if (!appid || root.attr('data-loaded') !== 'true') return;
      let previous = {};
      try {
        previous = JSON.parse(root.attr('data-saved-settings') || '{}');
      } catch {}
      $('#game-notification-position').val('custom');
      const settings = gameNotificationSettingsFromPanel();
      controls.prop('disabled', true);
      $(this).prop('disabled', true);
      try {
        const result = await ipcRenderer.invoke('game-preset:set', { appid, settings });
        if (!result || !result.ok) throw new Error('custom-position-save-failed');
        const saved = gameNotificationPreset.normalizeSettings(result.settings || {});
        if (String(root.attr('data-appid')) !== appid) return;
        applyGameNotificationPanelSettings(saved);
        root.attr('data-saved-settings', JSON.stringify(saved));
        const game = await notificationPreviewGame(appid);
        window.repositionAchievementWatcherNotification(saved, game, appid);
      } catch (err) {
        debug.log(`[game-preset] could not start custom positioning for ${appid} => ${formatErr(err)}`);
        if (String(root.attr('data-appid')) === appid) applyGameNotificationPanelSettings(previous);
      } finally {
        if (String(root.attr('data-appid')) === appid) {
          controls.prop('disabled', false);
          $(this).prop('disabled', false);
        }
      }
    });

    ipcRenderer.on('game-preset:custom-position', (event, payload = {}) => {
      const root = $('#game-notifications');
      if (String(root.attr('data-appid') || '') !== String(payload.appid || '')) return;
      const customPosition = gameNotificationPreset.normalizeCustomPosition(payload.customPosition);
      if (!customPosition) return;
      const settings = gameNotificationSettingsFromPanel();
      settings.position = 'custom';
      settings.customPosition = customPosition;
      const saved = gameNotificationPreset.normalizeSettings(settings);
      applyGameNotificationPanelSettings(saved);
      root.attr('data-saved-settings', JSON.stringify(saved));
    });

    $('#game-notification-tests').on('click', '[data-notification-kind]', async function () {
      const appid = String($('#game-config .header').attr('title') || '');
      if (!appid) return;
      try {
        await testGameNotification(appid, String($(this).attr('data-notification-kind') || 'toast'), this);
      } catch (err) {
        debug.log(`[game-preset] notification test failed for ${appid} => ${formatErr(err)}`);
      }
    });

    $('#game-health').on('click', '.gh-copy', function () {
      clipboard.writeText($('#game-health .gh-technical-dump').text());
      const icon = $(this).find('i');
      icon.attr('class', 'fas fa-check');
      setTimeout(() => icon.attr('class', 'fas fa-copy'), 1200);
    });

    /*
      The last-check stamp navigates to the control that forces the check; it does not run it - a
      full-library rescan is a lot of surprising work to start from a line of small print, and the
      setting it points at already explains the cadence. Closing the game panel first makes the jump
      visible: #game-config sits above #settings and would otherwise hide the row we just flashed.
    */
    $('#game-health').on('click', '.gh-verified', function () {
      $('#btn-game-config-cancel').trigger('click');
      $('title-bar').trigger('open-settings');
      $("#settingNav li[data-view='advanced']").trigger('click');
      const row = $('#force-achievement-recheck').closest('li');
      if (!row.length) return;
      row[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.removeClass('gh-jump-flash');
      // Reflow between removal and re-add, or re-clicking the link would not replay the animation.
      void row[0].offsetWidth;
      row.addClass('gh-jump-flash');
      setTimeout(() => row.removeClass('gh-jump-flash'), 2000);
    });

    $('#game-health').on('click', '[data-gh-action]', async function () {
      const button = $(this);
      const action = button.attr('data-gh-action');
      const appid = $('#game-health').attr('data-appid');
      if (!appid || button.prop('disabled')) return;
      button.prop('disabled', true);
      try {
        // A repair that changed something re-runs the report, so the user sees the new state
        // instead of the one that justified the button they just pressed.
        if (await runGameHealthAction(appid, action, button)) await renderGameHealth(appid);
      } catch (err) {
        debug.error(`[health] action ${action} failed for ${appid} => ${formatErr(err)}`);
        remote.dialog.showMessageBoxSync({
          type: 'error',
          title: t('repair-failed', 'Repair failed', 'Échec de la réparation'),
          message: t('gh-action-failed', 'That repair could not be completed.', 'Cette réparation n’a pas pu être effectuée.'),
          detail: `${err && (err.message || err)}`,
        });
      } finally {
        button.prop('disabled', false);
      }
    });

    try {
      // Apply the saved app theme before anything renders (Settings > General > Theme).
      const savedTheme = app.config.general?.theme || 'default';
      const isUserTheme = userThemes.parseValue(savedTheme) !== null;
      document.documentElement.dataset.theme = isUserTheme || savedTheme === 'custom' ? 'default' : savedTheme;
      userThemes.applyCss('');
      ipcRenderer
        .invoke('get-theme-payload')
        .then((payload) => {
          if (!payload) return;
          const css = [payload.appCss || '', payload.userCss || ''].join('\n');
          userThemes.applyCss(css);
        })
        .catch(() => userThemes.applyCss(''));

      // Game executable configuration modal: localize the static strings that the
      // i18n loader does not bind (title, launch arguments, placeholder, actions).
      try {
        $('#game-config-title').text(t('game-config-title', 'Executable configuration', "Configuration de l'exécutable"));
        $('#launch-args-label').html(
          `<i class="fas fa-terminal"></i> ${t('launch-args-label', 'Launch arguments:', 'Arguments de lancement :')}`
        );
        $('#game-config .constant').attr(
          'data-placeholder',
          t('game-config-placeholder', '…Click EDIT to choose the executable…', '…Cliquez sur MODIFIER pour choisir l’exécutable…')
        );
        $('#game-config .unlink').attr('title', t('game-config-unlink', 'Unlink executable', "Dissocier l'exécutable"));
        // The tab labels are (re)applied every time the panel opens, in onConfigButtonClick - this
        // startup pass only covers the case where it is inspected before its first open.
        applyGameConfigTabLabels();
      } catch (err) {
        debug.log(`game-config i18n failed: ${err}`);
      }

      // Manual library entries are first-class launch/playtime records even when no achievement
      // provider supports the game. Metadata and artwork are resolved during the normal scan.
      let manualExe = '';
      const closeManualGame = () => {
        $('#manual-game').attr('aria-hidden', 'true').hide();
        manualExe = '';
      };
      const addManualGameLabel = t('add-game-manually', 'Add game manually', 'Ajouter un jeu manuellement');
      const manualGameNameLabel = t('manual-game-name', 'Game name', 'Nom du jeu');
      const manualGameAppidLabel = t('manual-game-appid-optional', 'Steam AppID (optional)', 'AppID Steam (facultatif)');
      $('#add-game-manually span, #manual-game-title').text(addManualGameLabel);
      $('#add-game-manually').attr({ title: addManualGameLabel, 'aria-label': addManualGameLabel });
      $('#manual-game-name-label').text(manualGameNameLabel);
      $('#manual-game-name').attr('placeholder', manualGameNameLabel);
      $('#manual-game-exe-label, #manual-game-pick-exe span').text(t('choose-the-game-executable', 'Choose the game executable', "Choisir l'exécutable du jeu"));
      $('#manual-game-platform-label').text(t('manual-game-platform', 'Platform', 'Plateforme'));
      $('#manual-game-platform-other').text(t('manual-game-platform-other', 'Other', 'Autre'));
      $('#manual-game-appid-label').text(manualGameAppidLabel);
      $('#manual-game-appid').attr('placeholder', manualGameAppidLabel);
      $('#manual-game-note').html(`<i class="fas fa-info-circle"></i> ${escapeHtml(t('achievements-not-available', 'No achievements', 'Pas de succès'))}`);
      $('#manual-game-cancel').text(t('cancel', 'Cancel', 'Annuler'));
      $('#manual-game-save').text(t('blacklist-add-button', 'Add', 'Ajouter'));
      $('#add-game-manually').on('click', () => {
        manualExe = '';
        $('#manual-game-name, #manual-game-appid').val('');
        $('#manual-game-platform').val('PC');
        $('#manual-game-exe-path').text('');
        $('#manual-game').attr('aria-hidden', 'false').show();
        setTimeout(() => $('#manual-game-name').trigger('focus'), 0);
      });
      $('#manual-game-cancel, #manual-game > .overlay').on('click', closeManualGame);
      $(document).on('keydown.manual-game', (event) => {
        if (event.key === 'Escape' && $('#manual-game').attr('aria-hidden') === 'false') closeManualGame();
      });
      $('#manual-game-pick-exe').on('click', async () => {
        const dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
          title: t('choose-the-game-executable', 'Choose the game executable', "Choisir l'exécutable du jeu"),
          filters: [{ name: 'Executables', extensions: ['exe', 'bat', 'cmd'] }],
          properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'],
        });
        if (!dialog.filePaths || !dialog.filePaths[0]) return;
        manualExe = dialog.filePaths[0];
        $('#manual-game-exe-path').text(manualExe).attr('title', manualExe);
        if (!$('#manual-game-name').val().trim()) {
          let detectedName = '';
          try {
            detectedName = require(path.join(appPath, 'util/pe.js')).readExeProductName(manualExe) || '';
          } catch {}
          $('#manual-game-name').val(detectedName || path.basename(manualExe, path.extname(manualExe)));
        }
      });
      $('#manual-game form').on('submit', async (event) => {
        event.preventDefault();
        const title = $('#manual-game-name').val().trim();
        if (!title || !manualExe || !fs.existsSync(manualExe)) {
          if (!title) $('#manual-game-name').trigger('focus');
          else $('#manual-game-pick-exe').trigger('focus');
          return;
        }
        const entry = manualGames.upsert({
          title,
          exe: manualExe,
          platform: $('#manual-game-platform').val() || 'PC',
          storeAppId: $('#manual-game-appid').val().trim(),
        });
        await exeList.add({ appid: entry.id, exe: entry.exe, args: '' });
        gameIndex.upsert({ appid: entry.id, name: entry.title, binary: path.basename(entry.exe), source: 'Manual', steamappid: entry.storeAppId });
        closeManualGame();
        app.onStart();
      });

      // On a genuine first run, defer the initial library scan until the onboarding guide is done:
      // onboarding lets the user set their profile (and game folders), and finish()/skip()
      // trigger the first scan via resetUI()/onStart(). Scanning here too would run a duplicate
      // pass before the user has chosen folders or sources.
      if (app.config.general?.onboardingCompleted === true) {
        app.onStart();
      }

      // Empty-state call to action: jump straight to Settings → Folders so a first-time user with no
      // detected games knows where to point the app. Bound once (static element, survives onStart re-runs).
      $('#empty-open-folders').on('click', function () {
        $('title-bar').trigger('open-settings');
        $("#settingNav li[data-view='folder']").trigger('click');
      });

      // Reveal a hidden achievement's masked description in place. Delegated from the stable #achievement
      // container (the list is rebuilt on every game open), so it's bound exactly once here.
      $('#achievement').on('click', '.achievement .content .description.masked-desc', function () {
        const el = $(this);
        const real = el.data('desc');
        if (real == null) return;
        el.text(real).removeClass('masked-desc');
      });

      // Settings → Ubisoft / Uplay R2: keep the bundled package and the targeted batch action
      // visible without exposing loader filenames, architecture switches or INI details. The package
      // verification is the same import/PE/capability gate used immediately before an installation.
      let uplayPackageCheck = null;
      let uplayBatchRunning = false;
      const uplaySettingsText = (key, fallback, params = {}) => {
        const localized = window.appLocale && window.appLocale.settings && window.appLocale.settings.emulator && window.appLocale.settings.emulator.uplay;
        const value = (localized && localized[key]) || fallback;
        return String(value).replace(/\{(\w+)\}/g, (match, name) =>
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
        );
      };
      const setUplayPackageStatus = (state, text) => {
        const status = $('#uplay-r2-package-status');
        const icon = state === 'checking' ? 'fa-circle-notch fa-spin' : state === 'ready' ? 'fa-check-circle' : 'fa-exclamation-circle';
        status.attr('data-state', state).find('i').attr('class', `fas ${icon}`);
        $('#uplay-r2-package-status-text').text(text);
      };
      const verifyUplayPackage = async ({ announce = false } = {}) => {
        if (uplayPackageCheck) return uplayPackageCheck;
        const button = $('#verify-uplay-r2-package');
        setUplayPackageStatus('checking', uplaySettingsText('checking', 'Checking…'));
        button.prop('disabled', true);
        uplayPackageCheck = (async () => {
          try {
            const cache = await uplayR2Installer.ensureBundledEmulatorDlls({
              cacheDir: path.join(getUserDataPath(), 'cache/uplayR2'),
              log: debug,
            });
            if (!cache.complete) throw new Error('The integrated Uplay R2 repair package is incomplete');
            setUplayPackageStatus(
              'ready',
              cache.customNames.length
                ? uplaySettingsText('customReady', 'Custom DLLs ready')
                : uplaySettingsText('ready', 'Ready')
            );
            if (announce) $('#uplay-r2-settings-result').text(uplaySettingsText('verifySuccess', 'The integrated repair package is valid and ready.'));
            return cache;
          } catch (err) {
            debug.error(`[uplayR2 settings] package verification failed => ${formatErr(err)}`);
            setUplayPackageStatus('error', uplaySettingsText('attention', 'Needs attention'));
            $('#uplay-r2-settings-result').text(
              uplaySettingsText('verifyFailure', 'The integrated repair package could not be verified. No game files were changed.')
            );
            return null;
          } finally {
            button.prop('disabled', false);
            uplayPackageCheck = null;
          }
        })();
        return uplayPackageCheck;
      };

      // Opening the tab prepares the private validated cache in the background. The explicit button
      // deliberately runs the integrity check again and reports its result in the card.
      $("#settingNav li[data-view='uplay']").on('click', function () {
        if ($('#uplay-r2-package-status').attr('data-state') !== 'ready') verifyUplayPackage();
      });
      $('#verify-uplay-r2-package').on('click', function () {
        verifyUplayPackage({ announce: true });
      });
      $('#import-uplay-r2-loaders').on('click', async function () {
        const button = $(this);
        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
          title: uplaySettingsText('import', 'Import or replace DLLs'),
          properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
          filters: [
            { name: t('uplay-r2-dll-filter', 'Uplay R2 loader', 'Loader Uplay R2'), extensions: ['dll'] },
            { name: t('archives', 'Archives', 'Archives'), extensions: ['7z', 'zip'] },
          ],
        });
        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
        button.prop('disabled', true);
        try {
          const cacheDir = path.join(getUserDataPath(), 'cache/uplayR2');
          for (const packagePath of picked.filePaths) {
            await uplayR2Installer.importPackage({ packagePath, cacheDir, log: debug });
          }
          const cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir, log: debug });
          setUplayPackageStatus('ready', uplaySettingsText('customReady', 'Custom DLLs ready'));
          $('#uplay-r2-settings-result').text(
            uplaySettingsText('importSuccess', '{count} selected file(s) imported for the next repair.', { count: picked.filePaths.length })
          );
        } catch (err) {
          debug.error(`[uplayR2 settings] loader import failed => ${formatErr(err)}`);
          setUplayPackageStatus('error', uplaySettingsText('attention', 'Needs attention'));
          $('#uplay-r2-settings-result').text(uplaySettingsText('importFailure', 'The selected DLL could not be imported.'));
        } finally {
          button.prop('disabled', false);
        }
      });
      $('#restore-uplay-r2-loaders').on('click', async function () {
        const button = $(this).prop('disabled', true);
        try {
          await uplayR2Installer.ensureBundledEmulatorDlls({
            cacheDir: path.join(getUserDataPath(), 'cache/uplayR2'),
            log: debug,
            replaceExisting: true,
          });
          setUplayPackageStatus('ready', uplaySettingsText('ready', 'Ready'));
          $('#uplay-r2-settings-result').text(uplaySettingsText('restoreSuccess', 'The integrated DLLs have been restored.'));
        } catch (err) {
          debug.error(`[uplayR2 settings] integrated loader restore failed => ${formatErr(err)}`);
          setUplayPackageStatus('error', uplaySettingsText('attention', 'Needs attention'));
          $('#uplay-r2-settings-result').text(uplaySettingsText('verifyFailure', 'The integrated repair package could not be verified. No game files were changed.'));
        } finally {
          button.prop('disabled', false);
        }
      });
      $('#repair-all-uplay-r2').on('click', async function () {
        if (uplayBatchRunning) return;
        const button = $(this);
        const result = $('#uplay-r2-settings-result');
        const targets = gameList.filter(
          (game) => game && game.gameDir && fs.existsSync(game.gameDir) && uplayR2.isUplayR2Game(game, game.appid)
        );
        if (targets.length === 0) {
          result.text(uplaySettingsText('noGames', 'No detected Uplay R2 game has a known installation folder.'));
          return;
        }
        const repairPackage = await verifyUplayPackage();
        if (!repairPackage) return;
        const confirmation = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          type: 'question',
          buttons: [uplaySettingsText('repairConfirm', 'Repair games'), t('cancel', 'Cancel', 'Annuler')],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
          title: uplaySettingsText('repairTitle', 'Repair detected Uplay R2 games'),
          message: uplaySettingsText(
            'repairConfirmMessage',
            'Repair {count} detected Uplay R2 game(s)? Existing files are backed up and every result is validated.',
            { count: targets.length }
          ),
        });
        if (confirmation.response !== 0) return;

        uplayBatchRunning = true;
        button.prop('disabled', true);
        let repaired = 0;
        let unchanged = 0;
        let failed = 0;
        try {
          for (let index = 0; index < targets.length; index++) {
            const game = targets[index];
            result.text(
              uplaySettingsText('repairing', 'Repairing {current} / {total} — {game}', {
                current: index + 1,
                total: targets.length,
                game: game.name || game.appid,
              })
            );
            try {
              const summary = await applyUplayR2Repair({
                game,
                gameDir: game.gameDir,
                appid: game.appid,
                interactive: false,
                showResult: false,
              });
              if (!summary) throw new Error('Uplay R2 repair did not produce a validated result');
              if (summary.changed) repaired++;
              else unchanged++;
            } catch (err) {
              failed++;
              debug.error(`[uplayR2 settings] ${game.appid} (${game.name}) failed => ${formatErr(err)}`);
            }
          }
          result.text(
            uplaySettingsText('repairResult', 'Done — {repaired} repaired, {unchanged} already healthy, {failed} failed.', {
              repaired,
              unchanged,
              failed,
            })
          );
        } finally {
          button.prop('disabled', false);
          uplayBatchRunning = false;
        }
      });

      // Settings → Advanced: "Fix all games". Runs the same emulator-fix chain the per-scan auto-apply
      // uses (achievements.autoApplyEmulatorFix) over every emulator-detected game that has a real
      // install folder. Sequential + per-game try/catch so one failure never aborts the batch.
      let fixAllRunning = false;
      $('#fix-all-games').on('click', async function () {
        if (fixAllRunning) return;
        const result = $('#fix-all-result');
        // Only games with a live install dir, a usable appid/schema and an emulator signal -
        // never touch plain legit Steam installs.
        const targets = gameList.filter((g) => {
          if (!g || !g.gameDir || !fs.existsSync(g.gameDir)) return false;
          const isUplay = uplayR2.isUplayR2Game(g, g.appid);
          const isSteamEmulator =
            /^\d+$/.test(String(g.appid)) &&
            g.achievement &&
            Array.isArray(g.achievement.list) &&
            g.achievement.list.length > 0 &&
            (g.hasSteamApiDll === true || !!g.steamSettings || g.source === 'GBE Fork' || g.source === 'Goldberg');
          return isUplay || isSteamEmulator;
        });
        if (targets.length === 0) {
          result.text(t('no-detected-game-with-a-known-install-folder-to-fix', 'No detected game with a known install folder to fix.', 'Aucun jeu détecté avec un dossier d’installation connu à réparer.'));
          return;
        }
        const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          type: 'question',
          buttons: [t('fix-all', 'Fix all', 'Réparer tous'), t('cancel', 'Cancel', 'Annuler')],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
          title: t('fix-all-games', 'Fix all games', 'Réparer tous les jeux'),
          message: t(
            'apply-the-emulator-fix-to-x-detected-game-s-existing-files-are-b',
            'Apply the emulator fix to {count} detected game(s)? Existing files are backed up before being overwritten.',
            'Appliquer le fix émulateur à {count} jeu(x) détecté(s) ? Les fichiers existants sont sauvegardés avant d’être écrasés.',
            { count: targets.length }
          ),
        });
        if (confirm.response !== 0) return;

        fixAllRunning = true;
        $(this).css('pointer-events', 'none');
        let fixed = 0;
        let failed = 0;
        for (let i = 0; i < targets.length; i++) {
          const game = targets[i];
          result.text((t('fixing', 'Fixing', 'Réparation')) + ` ${i + 1} / ${targets.length} - ${game.name}`);
          try {
            if (uplayR2.isUplayR2Game(game, game.appid)) {
              const summary = await applyUplayR2Repair({
                game,
                gameDir: game.gameDir,
                appid: game.appid,
                interactive: false,
                showResult: false,
              });
              if (!summary) throw new Error('Uplay R2 repair did not produce a validated result');
              debug.log(
                `[fix-all] ${game.appid} (${game.name}) Uplay R2 ${summary.changed ? 'repaired' : 'already valid'} in ${summary.runtimeDirs.join(', ')}`
              );
              fixed++;
              continue;
            }
            const detectedEmu = goldberg.detectEmulator(game.gameDir);
            const detectedExe = exeDetect.detect(game.gameDir, game.name || '', { dllPaths: detectedEmu.dll });
            createAutomaticGbeBackup({
              appid: game.appid,
              gameDir: game.gameDir,
              steamSettings: game.steamSettings || detectedEmu.steamSettings,
            });
            const schema = {
              name: game.name,
              achievement: {
                total: game.achievement && game.achievement.total,
                list: game.achievement && Array.isArray(game.achievement.list) ? game.achievement.list.map((a) => ({ ...a })) : [],
              },
            };
            const setup = await achievements.autoApplyEmulatorFix({
              gameDir: game.gameDir,
              gameName: game.name,
              appid: game.appid,
              steamSettings: game.steamSettings || detectedEmu.steamSettings,
              option: app.config,
              detectedEmu,
              detectedExe,
              skipAdvanced: true,
              schema,
            });
            const repairDirs = new Set(setup.steamSettingsDirs || []);
            if (game.steamSettings) repairDirs.add(game.steamSettings);
            if (detectedEmu.steamSettings) repairDirs.add(detectedEmu.steamSettings);
            const downloadIcon =
              app.config.achievement && app.config.achievement.goldbergDownloadIcons
                ? (() => {
                    const request = require('request-zero');
                    return async (url, dir) => {
                      const r = await request.download(url, dir);
                      return r && r.path;
                    };
                  })()
                : undefined;
            for (const steamSettingsDir of repairDirs) {
              if (!steamSettingsDir) continue;
              const summary = await goldberg.repair({
                steamSettings: steamSettingsDir,
                appid: game.appid,
                schema,
                downloadIcon,
                fetchDlc: (id) => steamParser.getDLCList(id),
                accountName: app.config.general && app.config.general.username,
                language: app.config.achievement && app.config.achievement.lang,
              });
              // The bulk pass has no per-game dialog to report into, so the log is the only record.
              // Worth keeping: it is the one path that can repair dozens of games in a row.
              debug.log(
                `[fix-all] ${game.appid} (${game.name}) wrote ${summary.achievementsJson.length} entries to ${steamSettingsDir}` +
                  (downloadIcon ? ` + icons: ${summary.icons.downloaded} dl, ${summary.icons.failed} fail` : '') +
                  (summary.icons.unavailable ? ' (no achievement artwork published for this appid yet)' : '')
              );
              try {
                goldberg.seedRuntimeSave({
                  appid: game.appid,
                  schema,
                  steamSettings: steamSettingsDir,
                  types: ['gbe'],
                });
              } catch (seedErr) {
                debug.log(`[fix-all] ${game.appid} (${game.name}) runtime seed failed => ${seedErr}`);
              }
            }
            fixed++;
          } catch (err) {
            failed++;
            debug.log(`[fix-all] ${game.appid} (${game.name}) failed => ${err}`);
          }
        }
        const skipped = targets.length - fixed - failed;
        result.text(
          t('done-x-game-s-fixed-x-skipped-x-failed', 'Done - {fixed} game(s) fixed, {skipped} skipped, {failed} failed.', 'Terminé - {fixed} jeu(x) réparé(s), {skipped} ignoré(s), {failed} en échec.', { fixed, skipped, failed })
        );
        $(this).css('pointer-events', 'initial');
        fixAllRunning = false;
      });

      remote.app.on('second-instance', (event, argv, cwd) => {});
    } catch (err) {
      debug.log(err);
      app.errorExit(err);
    }
  });
})(window.jQuery, window, document);

function getArgs(argv) {
  if (argv[1]) {
    if (argv[1].includes('ach:')) {
      argv[1] = argv[1].replace('ach:', '');
      argv = args_split(argv[1]);
    }
  }

  return args(argv);
}
