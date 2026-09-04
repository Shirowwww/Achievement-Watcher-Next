'use strict';

/*
  Boot timeline. Everything before the renderer was unmeasured: the log opened at "renderer modules
  loaded", so a slow start could only ever be blamed on the part that already reported itself. Each
  mark is the milliseconds since this process was spawned, so Electron's own runtime init (the time
  before this file runs at all) shows up as the first one.
*/
const bootMarks = [];
function bootMark(label) {
  bootMarks.push([label, Math.round(process.uptime() * 1000)]);
}
function bootTimeline() {
  return bootMarks.map(([label, at]) => `${label} ${at}ms`).join(', ');
}
bootMark('electron');

const path = require('path');
const { app } = require('electron');
const { APP_DATA_DIR_NAME } = require('../util/userDataPath.js');
const { portableUserDataDir } = require('../util/portableMode.js');
const { migrateLegacyUserData, migrateAw3UserData, migrateSouvenirFolder, retargetBackupIndex } = require('../util/migrateUserData.js');
const { deriveWatchdogState } = require('../util/watchdogState.js');
const links = require('../util/links.js');
const { createNetworkCircuit, isSteamTransportFailure } = require('../util/networkCircuit.js');
const { createRequestGate, isThrottleStatus } = require('../util/httpThrottle.js');
const sgdbAssetCache = require('../util/sgdbAssetCache.js');
const { toAccelerator } = require('../util/hotkeyAccelerator.js');
app.setName('Achievement Watcher');
// Keep 3.x data separate from the legacy folder; --user-data-dir still overrides it for tests.
const cliUserDataDir = (() => {
  try {
    const argv = process.argv.slice(1);
    const eq = argv.find((a) => a.startsWith('--user-data-dir='));
    if (eq) return eq.slice('--user-data-dir='.length);
    const i = argv.indexOf('--user-data-dir');
    return i >= 0 && argv[i + 1] ? argv[i + 1] : '';
  } catch {
    return '';
  }
})();
const packagedPortableUserDataDir = portableUserDataDir({ execPath: process.execPath, isPackaged: app.isPackaged });
const isPortableBuild = !!packagedPortableUserDataDir;
app.setPath('userData', cliUserDataDir || packagedPortableUserDataDir || path.join(app.getPath('appData'), APP_DATA_DIR_NAME));
// Import forward along the data-folder chain, newest source first: each hop is a no-op once the
// destination already holds AW configuration, so a user coming straight from 1.6.8 still gets their data.
// A portable archive starts isolated on purpose and never imports the installed app's profile.
if (!isPortableBuild) {
  migrateAw3UserData(app.getPath('userData'));
  migrateLegacyUserData(app.getPath('userData'));
  migrateSouvenirFolder(app.getPath('userData'));
}
// Runs on every start: folders migrated before this existed still hold a restore-point index
// pointing at their old location. Idempotent, a repointed entry is skipped next time.
retargetBackupIndex(app.getPath('userData'));
// Keep GPU acceleration enabled, but avoid Chromium background services AW does not use in tray mode.
for (const sw of ['disable-extensions', 'disable-component-extensions-with-background-pages', 'disable-default-apps', 'disable-background-networking', 'disable-accelerated-video-decode']) {
  app.commandLine.appendSwitch(sw);
}
// Bound heap growth while the app sits in the tray: the renderer's measured heap stays near 20 MB,
// so a 192 MB ceiling makes V8 collect earlier instead of letting every process grow toward 256 MB.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192');
const { BrowserWindow, dialog, session, shell, ipcMain, globalShortcut, Tray, Menu, nativeImage, Notification } = require('electron');
const os = require('os');
  const { verifyUpdateCodeSignature } = require('../util/updateSignature.js');
  const { withScrapeLease } = require('../util/scrapeLease.js');
  const steamSchemaFetch = require(path.join(__dirname, '../util/steamSchemaFetch.js'));
  const { clampWindowBoundsToWorkArea } = require('../util/windowBounds.js');
  const { resolveMainWindowState, buildMainWindowState, mainWindowStateChanged } = require('../util/mainWindowState.js');

/*
  electron-updater is 159 files and about 1.7 s of a cold start - the single largest thing this
  process read before it could put a window on screen, for a check that happens eight seconds after
  launch at the earliest and never happens at all outside a packaged build. It loads on the first
  call below, and configures itself and its listeners then.
*/
let updaterModule = null;
// Assigned once the startup block below has run; there is nothing to register before that.
let registerUpdaterEvents = null;

function getUpdater() {
  if (!updaterModule) {
    updaterModule = require('electron-updater');
    const { autoUpdater } = updaterModule;
    // Updates require an explicit download and install confirmation.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    // Differential downloads patch a cached, never-revalidated copy of the previous installer; a corrupted
    // base fails every future patch with a checksum mismatch. Full downloads avoid that failure class.
    autoUpdater.disableDifferentialDownload = true;
    // Accept the project's self-signed publisher through the tested verifier.
    autoUpdater.verifyUpdateCodeSignature = (publisherNames, tempUpdateFile) =>
      verifyUpdateCodeSignature(publisherNames, tempUpdateFile, (message) => debug.log(message));
    if (registerUpdaterEvents) registerUpdaterEvents(autoUpdater);
  }
  return updaterModule.autoUpdater;
}

function newCancellationToken() {
  getUpdater();
  return new updaterModule.CancellationToken();
}
let updateCheckTimer = null;
let updatePromptOpen = false;
let updaterErrorNotified = false;
let manualUpdateCheckPending = false; // Settings requested a check.
let manualUpdateResult = null; // 'available' | 'uptodate' | 'error'
let updateDownloading = false; // true from the accepted "Download && Install" until it lands or fails
// Set when the user explicitly accepted "Download && Install". Carried through to the install step
// so a deliberate request is never held back by a process that the monitor classifies as a game.
let updateAcceptedByUser = false;
let checksumRetryInFlight = false; // guards the one automatic retry after a cache-clearing recovery
const UPDATE_RECHECK_MS = 60 * 60 * 1000; // silent hourly re-check while the app stays resident
// How long the "installing" state stays on screen before the windows close. Covers one paint plus
// the tray balloon; anything shorter and the app disappears before it has finished saying why.
const INSTALL_HANDOVER_MS = 1200;
// Number of games currently reported by the monitor.
let gamesRunning = 0;
const isGameRunning = () => gamesRunning > 0;
// A completed update waiting for the current game to end.
let promptDownloadedUpdate = null;
let pendingInstallPrompt = null;

const updateGate = require(path.join(__dirname, '../util/updateGate.js'));
const { resolveSteamMetadata } = require(path.join(__dirname, '../util/steamMetadata.js'));
const { isChecksumMismatchError, summarizeUpdaterError } = require(path.join(__dirname, '../util/updateChecksum.js'));
const { clearUpdaterCacheDir: clearCacheDirForHelper } = require(path.join(__dirname, '../util/updateCacheClear.js'));
const { clearSafeCaches } = require(path.join(__dirname, '../util/clearableCaches.js'));

async function applyGeneralPatch(patch) {
  if (!configJS) return;
  if (!configJS.general) configJS.general = {};
  Object.assign(configJS.general, patch);
  // This IS the writer of those keys, so it must not have them read back from disk over its patch.
  await settingsJS.save(configJS, { keepMainOwnedKeys: false });
}

async function postponeUpdate(version) {
  try {
    const patch = updateGate.postponePatch(version);
    await applyGeneralPatch(patch);
    debug.log(`[updater] version ${version} postponed until ${new Date(patch.updatePostponedUntil).toISOString()}`);
  } catch (err) {
    debug.log(`[updater] could not persist the postpone: ${err.message || err}`);
  }
}

// A user who asks for a check has just overruled their own "later".
async function clearUpdatePostpone() {
  try {
    const general = (configJS && configJS.general) || {};
    if (!general.updatePostponedVersion && !general.updatePostponedUntil) return;
    await applyGeneralPatch(updateGate.clearPostponePatch());
  } catch (err) {
    debug.log(`[updater] could not clear the postpone: ${err.message || err}`);
  }
}

function shouldSuppressUpdatePrompt(version, { manual = false } = {}) {
  const { suppress, reason } = updateGate.shouldSuppressUpdatePrompt((configJS && configJS.general) || {}, version, {
    manual,
    // Nothing that is not strictly newer than what is running may be offered or downloaded.
    currentVersion: app.getVersion(),
  });
  if (suppress) debug.log(`[updater] version ${version} not offered (${reason})`);
  return suppress;
}

/* One updater state, published to every window and mirrored on the taskbar/tray tooltip. State and
   transitions live in util/updateStatus.js (testable without a release); this half is plumbing only. */
const updateStatus = require(path.join(__dirname, '../util/updateStatus.js'));
let currentUpdateStatus = updateStatus.initialState();
let publishedUpdateStatus = null;
let updateProgressLogged = -1;
// Set for the length of one download so the user can stop it; cleared as soon as it ends.
let updateDownloadCancellation = null;

// Taskbar: a fraction for a real download, 2 for the indeterminate bar while the installer runs
// (there is no byte counter to follow once the installer owns the work), -1 for nothing.
function taskbarProgressFor(state) {
  if (state.phase === 'downloading') return Math.max(0, state.percent) / 100;
  if (state.phase === 'installing') return 2;
  return -1;
}

function applyUpdateProgressToWindow(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setProgressBar(taskbarProgressFor(currentUpdateStatus));
  } catch (err) {
    debug.log(`[updater] could not set the taskbar progress: ${err.message || err}`);
  }
}

function trayTooltipFor(state) {
  if (state.phase === 'downloading') {
    return `Achievement Watcher Next - ${t('downloading-update', 'downloading update {percent}%', 'téléchargement de la mise à jour {percent} %', { percent: Math.round(state.percent) })}`;
  }
  if (state.phase === 'installing') {
    return `Achievement Watcher Next - ${t('update-installing-short', 'Installing update…', 'Installation de la mise à jour…')}`;
  }
  return 'Achievement Watcher Next';
}

/* Only the main window listens (title bar + Settings live there); overlay/notification windows are
   left alone. A window not yet created is not a missed update, it asks via get-update-status on load. */
function publishUpdateStatus() {
  publishedUpdateStatus = currentUpdateStatus;
  applyUpdateProgressToWindow(MainWin);
  if (tray) {
    try {
      tray.setToolTip(trayTooltipFor(currentUpdateStatus));
    } catch {}
  }
  if (!MainWin || MainWin.isDestroyed()) return;
  try {
    MainWin.webContents.send('update-status', currentUpdateStatus);
  } catch {
    /* a window torn down mid-broadcast is not an error */
  }
}

function setUpdateStatus(event) {
  currentUpdateStatus = updateStatus.reduce(currentUpdateStatus, event);
  if (updateStatus.shouldPublish(publishedUpdateStatus, currentUpdateStatus)) publishUpdateStatus();
}

function clearUpdateDownloadProgress() {
  updateProgressLogged = -1;
  updateDownloadCancellation = null;
  if (currentUpdateStatus.phase === 'idle') return;
  setUpdateStatus({ type: 'reset' });
}

/* Start/restart the download, keeping its cancellation token: electron-updater aborts cleanly on
   cancel, which is what makes an in-app Cancel button possible instead of quitting the app. */
function startUpdateDownload(version) {
  updateProgressLogged = -1;
  setUpdateStatus({ type: 'download-started', version });
  const token = newCancellationToken();
  updateDownloadCancellation = token;
  return getUpdater().downloadUpdate(token).catch((err) => {
    // A cancellation is not a failure; the 'update-cancelled' listener already cleared the state.
    if (token.cancelled) return;
    // A checksum mismatch is handled entirely by the 'error' listener, which clears the cache and
    // retries once instead of surfacing the raw failure immediately.
    if (!isChecksumMismatchError(err)) notifyUpdateError(`download failed: ${summarizeUpdaterError(err)}`);
  });
}

// True when there was a download to stop. The state itself is cleared by 'update-cancelled'.
function cancelUpdateDownload() {
  const token = updateDownloadCancellation;
  if (!token || token.cancelled) return false;
  debug.log('[updater] cancelling the download at the user request');
  try {
    token.cancel();
  } catch (err) {
    debug.log(`[updater] could not cancel the download: ${err.message || err}`);
    return false;
  }
  return true;
}

function notifyUpdateError(message) {
  debug.log(`[updater] ${message}`);
  updateProgressLogged = -1;
  updateDownloadCancellation = null;
  setUpdateStatus({ type: 'error', message });
  updateDownloading = false;
  updateAcceptedByUser = false;
  manualUpdateResult = 'error';
  manualUpdateCheckPending = false;
  if (!updaterErrorNotified && tray) {
    updaterErrorNotified = true;
    try {
      tray.displayBalloon({
        iconType: 'warning',
        title: t('achievement-watcher', 'AW Next'),
        content: t('update-check-failed-detail', 'Update check failed: {message}', 'Échec de la vérification des mises à jour : {message}', { message }),
      });
    } catch {}
  }
}

// A finished download that cannot install yet. Held-back updates used to be silent, so the only
// thing the user could observe was an update that downloaded on every check and never arrived.
function notifyUpdateHeldBack(version) {
  if (!tray) return;
  try {
    tray.displayBalloon({
      iconType: 'info',
      title: t('achievement-watcher', 'AW Next'),
      content: t(
        'update-ready-after-game',
        'Version {version} is ready and will be installed once the running game is closed.',
        'La version {version} est prête et sera installée une fois le jeu en cours fermé.',
        { version }
      ),
    });
  } catch {}
}

// Wipes the electron-updater cache directory (differential-download base + pending/ download) and
// resets its in-memory record. Shared by checksum-mismatch recovery and Settings > Advanced.
async function clearUpdaterCacheDir() {
  const helper = await getUpdater().getOrCreateDownloadHelper();
  return clearCacheDirForHelper(helper, {
    onHelperClearError: (err) => debug.log(`[updater] could not reset the download helper state: ${err.message || err}`),
  });
}

// The one automatic retry (cache cleared, full download re-attempted) also failed: this is no
// longer a corrupted-cache problem, so stop being quiet about it and offer a manual way out.
async function notifyChecksumRecoveryFailed(message, cacheDir) {
  debug.log(`[updater] retry after clearing the update cache also failed: ${message}`);
  clearUpdateDownloadProgress();
  updateDownloading = false;
  manualUpdateResult = 'error';
  manualUpdateCheckPending = false;
  if (updatePromptOpen) return; // a real dialog is already up; do not stack another one on top
  updatePromptOpen = true;
  try {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: t('achievement-watcher', 'AW Next'),
      message: t(
        'update-retry-failed-message',
        'The update still failed after clearing the cached files in {folder}.',
        'La mise à jour a encore échoué après avoir vidé les fichiers en cache dans {folder}.',
        { folder: cacheDir }
      ),
      detail: t(
        'update-retry-failed-detail',
        'This is likely a network or release problem, not something clearing the cache can fix. You can download and install the update manually from the release page.',
        'Il s’agit probablement d’un problème réseau ou lié à la publication, que vider le cache ne peut pas résoudre. Vous pouvez télécharger et installer la mise à jour manuellement depuis la page de version.'
      ),
      buttons: [t('open-release-page', 'Open Release Page', 'Ouvrir la page de version'), t('ok', 'OK', 'OK')],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.openExternal(links.releases).catch(() => {});
  } catch (err) {
    debug.log(`[updater] could not show the recovery-failed dialog: ${err.message || err}`);
  } finally {
    updatePromptOpen = false;
  }
}

function scheduleUpdateCheck(delayMs) {
  clearTimeout(updateCheckTimer);
  updateCheckTimer = setTimeout(() => {
    updateCheckTimer = null;
    if (!app.isPackaged) return;
    if (updatePromptOpen) {
      // Keep checking after an open prompt closes.
      scheduleUpdateCheck(UPDATE_RECHECK_MS);
      return;
    }
    // Do not interrupt a running game with a modal update dialog.
    if (isGameRunning()) {
      debug.log('[updater] check deferred: a game is running');
      scheduleUpdateCheck(updateGate.INTERVALS.inGame);
      return;
    }
    getUpdater()
      .checkForUpdates()
      .then(() => {
        updaterErrorNotified = false; // a healthy check clears the "already told the user" flag
        scheduleUpdateCheck(updateGate.nextCheckDelayMs({ gameRunning: isGameRunning() }));
      })
      .catch((err) => {
        notifyUpdateError(summarizeUpdaterError(err));
        scheduleUpdateCheck(updateGate.nextCheckDelayMs({ gameRunning: isGameRunning(), failed: true }));
      });
  }, delayMs);
}

// Record the runtime, paths, flags and display layout once for troubleshooting.
function logStartupDiagnostics() {
  const line = (label, value) => debug.log(`[diag] ${label}: ${value}`);
  try {
    const { node, electron, chrome, v8 } = process.versions;
    line('app', `${app.getName()} ${app.getVersion()} (${app.isPackaged ? (isPortableBuild ? 'portable' : 'packaged') : 'dev'}${manifest.config.debug ? ', debug' : ''})`);
    line('runtime', `electron ${electron} · chrome ${chrome} · node ${node} · v8 ${v8}`);
    line('os', `${os.type()} ${os.release()} ${process.arch} · ${os.cpus().length} cpu · ${Math.round(os.totalmem() / 1048576)} MB`);
    line('paths', `exe=${process.execPath}`);
    line('paths', `app=${app.getAppPath()}`);
    line('paths', `userData=${userData}`);
    line('argv', JSON.stringify(process.argv.slice(1)));
    line('flags', `hidden=${process.argv.includes('--hidden')} safeMode=${safeMode} gpuDisabled=${!!(manifest.config['disable-gpu'] || userDisableGpu || safeMode)}`);
    const general = (configJS && configJS.general) || {};
    line('settings', `lang=${(configJS && configJS.achievement && configJS.achievement.lang) || '?'} theme=${general.theme || '?'} closeToTray=${general.closeToTray !== false} startWithWindows=${general.startWithWindows !== false}`);
    line('settings', `skippedVersion=${general.skippedVersion || 'none'} updatePostponed=${general.updatePostponedVersion || '-'}${general.updatePostponedUntil ? ' until ' + new Date(Number(general.updatePostponedUntil)).toISOString() : ''}`);
    // Access screen only after app readiness.
    const electronScreen = require('electron').screen;
    const primaryId = electronScreen.getPrimaryDisplay().id;
    for (const display of electronScreen.getAllDisplays()) {
      const { width, height } = display.size;
      const work = display.workAreaSize;
      line(
        'display',
        `${display.id}${display.id === primaryId ? ' (primary)' : ''} ${width}x${height} @${display.scaleFactor}x work=${work.width}x${work.height} rotation=${display.rotation}`
      );
    }
  } catch (err) {
    debug.log(`[diag] failed to collect startup diagnostics: ${err.message || err}`);
  }
}

// Defer updates while games run and check again when the last one exits.
function setGameActivity(count) {
  const wasRunning = isGameRunning();
  gamesRunning = Math.max(0, Number(count) || 0);
  debug.log(`[game-activity] ${gamesRunning} game(s) running`);
  if (wasRunning === isGameRunning()) return;
  if (isGameRunning()) {
    // A game just started: whatever the daemon was holding in memory for its own housekeeping is
    // memory the game could use. Hand it back now rather than waiting for Windows to take it.
    scheduleIdleTrim('game-started');
    return;
  }
  // The last game just exited: run the scan held back during play now, instead of waiting out its
  // fifteen-minute tick. Above the isPackaged gate on purpose, that gate is only for update checks.
  bgAutoFixHeldTicks = 0;
  if (!MainWin) setTimeout(() => runBackgroundAutoFix('after-game'), 20 * 1000);
  if (!app.isPackaged) return;

  // Reopen a completed download prompt after the game ends.
  if (pendingInstallPrompt && typeof promptDownloadedUpdate === 'function') {
    const info = pendingInstallPrompt;
    pendingInstallPrompt = null;
    setTimeout(() => promptDownloadedUpdate(info), updateGate.INTERVALS.afterGame);
    return;
  }
  scheduleUpdateCheck(updateGate.INTERVALS.afterGame);
}
const minimist = require('minimist');
const { execFile, execFileSync, spawn } = require('child_process');
const { launchViaWindowsShell, isElevationDeclinedError } = require('../util/windowsShellLaunch.js');
const { lazyRequire } = require('../util/lazyRequire.js');
const fs = require('fs');
const ipc = require(path.join(__dirname, 'ipc.js'));
const notificationSounds = require(path.join(__dirname, '../util/notificationSounds.js'));
const userThemes = require(path.join(__dirname, '../util/userThemes.js'));
const themeLayers = require(path.join(__dirname, '../util/themeLayers.js'));
const themeImages = require(path.join(__dirname, '../util/themeImages.js'));
const themeBlur = require(path.join(__dirname, '../util/themeBlur.js'));
const themePackage = lazyRequire(path.join(__dirname, '../util/themePackage.js'));
const overlayLocale = require(path.join(__dirname, '../util/overlayLocale.js'));
const { resolveOverlayRequest } = require(path.join(__dirname, '../util/overlayRequest.js'));
const { normalizeWindowArgs } = require(path.join(__dirname, '../util/windowArgs.js'));
const notificationBounds = require(path.join(__dirname, '../util/notificationBounds.js'));

// Resolve main-process strings from the selected locale, with English/French fallback.
let mainLocaleCache = null;
function t(key, english, french, params) {
  const interpolate = (value) =>
    params && typeof params === 'object'
      ? String(value).replace(/\{(\w+)\}/g, (match, name) =>
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
        )
      : value;
  try {
    const lang = String((configJS && configJS.achievement && configJS.achievement.lang) || 'english');
    if (!mainLocaleCache || mainLocaleCache.lang !== lang) {
      const englishData = JSON.parse(fs.readFileSync(path.join(__dirname, '../locale/lang/english.json'), 'utf8'));
      let data = englishData;
      if (lang !== 'english') {
        const requested = JSON.parse(fs.readFileSync(path.join(__dirname, '../locale/lang', `${lang}.json`), 'utf8'));
        const deepmerge = require('deepmerge');
        data = deepmerge(englishData, requested, { arrayMerge: (dest, src) => src });
      }
      mainLocaleCache = { lang, data };
    }
    const dialogs = mainLocaleCache.data && mainLocaleCache.data.dialogs;
    const value = dialogs && typeof dialogs[key] === 'string' ? dialogs[key] : null;
    if (value && value.trim()) return interpolate(value);
  } catch {}
  const lang = String((configJS && configJS.achievement && configJS.achievement.lang) || '');
  const fallback = lang.toLowerCase().startsWith('fr') && french ? french : english;
  return interpolate(fallback || key);
}

let cachedOverlayLanguagePayload = null;
function overlayLanguagePayload() {
  const lang = String((configJS && configJS.achievement && configJS.achievement.lang) || 'english');
  if (cachedOverlayLanguagePayload && cachedOverlayLanguagePayload.lang === lang) {
    return cachedOverlayLanguagePayload;
  }
  try {
    cachedOverlayLanguagePayload = overlayLocale.loadOverlayLocale({ localeDir: path.join(__dirname, '../locale/lang'), lang });
    return cachedOverlayLanguagePayload;
  } catch (err) {
    debug.log(`[overlay] language payload failed: ${err.message || err}`);
    cachedOverlayLanguagePayload = null;
    return { lang, strings: {} };
  }
}

// Controller shortcuts + button layout are sent to the overlay as a small config payload.
function overlayControllerConfigPayload() {
  const c = (configJS && configJS.controller) || {};
  const split = (value, fallback) => {
    const parts = String(value || '')
      .split('+')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    return parts.length ? parts : fallback;
  };
  return {
    layout: String(c.layout || 'auto'),
    nativeModeToggles: c.enabled === true,
    bindings: {
      toggle: split(c.toggleBinding, ['BACK', 'START', 'LEFT_SHOULDER']),
      ui: split(c.uiModeBinding, ['LEFT_SHOULDER', 'X']),
      move: split(c.controlModeBinding, ['LEFT_SHOULDER', 'RIGHT_SHOULDER']),
    },
  };
}

// Resolve the current theme for the main window and overlay.
function currentThemePayload(nameOverride) {
  const name = String(nameOverride || (configJS && configJS.general && configJS.general.theme) || 'default');
  const user = userThemes.parseValue(name);
  let userCss = '';
  if (user) {
    try {
      const matches = userThemes.listUserThemes(userData).filter((t) => t.name === user);
      if (matches.length > 0) userCss = userThemes.readThemeFile(matches[0].file);
    } catch {}
  }
  // An imported .awtheme, read only when actually selected. A theme deleted behind the app's back
  // resolves to null here, falling back to the built-in look rather than no stylesheet at all.
  let packTheme = null;
  const pack = userThemes.parsePackValue(name);
  if (pack) {
    try {
      const installed = themePackage.readInstalledTheme(userData, pack);
      packTheme = installed ? installed.theme : null;
    } catch {}
  }
  return themeLayers.themePayload(userData, name, themeLayers.loadCustomTheme(userData), userCss, packTheme);
}

const BASE_URL = 'https://www.steamgriddb.com/api/v2';
const DEFAULT_API_KEY = '2a9d32ddd0bfe4e1191b4f6ff56fef60'; // bundled public fallback (rate-limited)
// Bound artwork requests so a dead network cannot stall a scan for minutes.
const SGDB_FETCH_TIMEOUT_MS = 8000;
/* A per-request timeout is not enough: artwork is requested per game, so an unreachable SteamGridDB
   still costs the library one timeout each. Same breaker pattern as the Steam hosts below. */
const SGDB_COOLDOWN_MS = 5 * 60 * 1000;
const sgdbCircuit = createNetworkCircuit({ failureLimit: 3, cooldownMs: SGDB_COOLDOWN_MS, shouldCount: isSteamTransportFailure });

function steamGridDbUnavailable() {
  return sgdbCircuit.unavailable();
}

function recordSteamGridDbFailure(err, context) {
  if (!sgdbCircuit.recordFailure(err)) return false;
  debug.log(`[steamgriddb] unreachable (${context}) - skipping artwork lookups for ${SGDB_COOLDOWN_MS / 60000} minutes`);
  return true;
}
const startupArgs = normalizeWindowArgs(minimist(process.argv.slice(1)));
const safeMode = startupArgs['safe-mode'] === true || startupArgs.safeMode === true || startupArgs['reset-window'] === true;

// SteamGridDB artwork key: the bundled public fallback is used directly - no per-user key.
function getSteamGridDbApiKey() {
  return DEFAULT_API_KEY;
}

let remoteMain = null;
function getRemoteMain() {
  if (!remoteMain) {
    remoteMain = require('@electron/remote/main');
    remoteMain.initialize();
  }
  return remoteMain;
}

function fetch(...args) {
  return globalThis.fetch(...args);
}

function createXmlParser() {
  const { XMLParser } = require('fast-xml-parser');
  return new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true, cdataPropName: '__cdata' });
}

function fetchSteamIcon(url, appid) {
  return require(path.join(__dirname, '../parser/steam.js')).fetchIcon(url, appid);
}

// Plain-HTTP fetches for the keyless schema chain. SteamHunters serves its public JSON API to
// browser-like clients; SteamCommunity also expects a real UA. Modest timeouts keep a stalled
// host from blocking a scan (the browser scrape remains the last-resort fallback).
const STEAM_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const STEAM_KEYLESS_TIMEOUT_MS = 10000;
const STEAM_CLIENT_LOGIN_TIMEOUT_MS = 5000;
const STEAM_TRANSPORT_COOLDOWN_MS = 5 * 60 * 1000;
const steamTransportCircuit = createNetworkCircuit({
  failureLimit: 2,
  cooldownMs: STEAM_TRANSPORT_COOLDOWN_MS,
  shouldCount: isSteamTransportFailure,
});

function steamTransportUnavailable() {
  return steamTransportCircuit.unavailable();
}

function recordSteamTransportFailure(err) {
  if (!steamTransportCircuit.recordFailure(err)) return;
  debug.log(`[steam] network unavailable - skipping repeated Steam lookups for ${STEAM_TRANSPORT_COOLDOWN_MS / 60000} minutes`);
}

function recordSteamTransportSuccess() {
  steamTransportCircuit.recordSuccess();
}

function resetSteamTransportCircuit() {
  steamTransportCircuit.reset();
  storeAppDetailsCircuit.reset();
  productInfoCircuit.reset();
  for (const gate of Object.values(steamGates)) gate.reset();
}

/*
  One request gate per Steam host (see app/util/httpThrottle.js). The scan pool runs eight games at
  once and each one asks several of these hosts, so without pacing a large library spends its first
  seconds earning 429s that the rest of the scan then reads as "this game has no achievements and no
  name" (issue #55).

  The numbers are per host, and they come from the reporter's own logs plus a sweep of the 826 AppIDs
  in them. Only the STORE ever refused there (21 x HTTP 429) and only product info ever stalled, so
  the store keeps a wide spacing and the shortest queue budget - it is also the least important, since
  product info and SteamHunters answer the same question. The keyless schema endpoint and SteamHunters
  refused nothing at any rate tried, so pacing them hard bought no safety and cost real time: 826
  AppIDs took 103s at one request per 100/120ms against 23s unpaced, for the same result. They are now
  spaced just enough to stay polite, and the shared backoff on a refusal - which costs nothing while
  nothing refuses - is what actually protects them.
*/
const steamGates = {
  api: createRequestGate({ concurrency: 8, minIntervalMs: 25, backoffMs: 1500, maxWaitMs: 15000, onThrottled: logThrottle('api.steampowered.com') }),
  store: createRequestGate({ concurrency: 1, minIntervalMs: 400, backoffMs: 5000, maxWaitMs: 6000, onThrottled: logThrottle('store.steampowered.com') }),
  steamhunters: createRequestGate({ concurrency: 6, minIntervalMs: 40, backoffMs: 2000, maxWaitMs: 15000, onThrottled: logThrottle('steamhunters.com') }),
  // An HTML page, heavier for the host than a JSON answer, and only reached when the two above
  // could not fill the list. Kept the most spaced of the three that never refused.
  steamcommunity: createRequestGate({ concurrency: 3, minIntervalMs: 150, backoffMs: 2000, maxWaitMs: 12000, onThrottled: logThrottle('steamcommunity.com') }),
};

/*
  One line per refusal, not per waiting request: the pause is shared, so the other games queued
  behind it would each report the same fact. A refused request is never an answer ABOUT THE GAME -
  every fetcher below turns one into `networkError`, which the chain already reads as "not known
  yet, retry next scan", rather than into the empty list that used to be cached as the truth.
*/
function logThrottle(host) {
  return ({ status, waitMs, attempt, label }) => {
    debug.log(`[throttle] ${host} answered HTTP ${status}${label ? ` for ${label}` : ''} - pausing that host for ${Math.round(waitMs / 1000)}s (attempt ${attempt})`);
  };
}

/* appdetails is rate-limited per IP; a cleared cache blows through the budget in seconds and every
   remaining call returns an HTML block page or a bare `null`, neither of which the transport breaker
   above sees as a network error. The lookup is optional (product info is preferred), so stop asking
   once the endpoint starts refusing instead of paying a request and an exception per game. */
const STORE_APPDETAILS_COOLDOWN_MS = 5 * 60 * 1000;
const storeAppDetailsCircuit = createNetworkCircuit({ failureLimit: 2, cooldownMs: STORE_APPDETAILS_COOLDOWN_MS });

/*
  Read the store payload defensively: an error page is not JSON, and a throttled call answers with a
  literal `null` body under a 200. Neither is worth an exception.

  Returns { data, answered }. `answered` is what separates "the store says this AppID has no page"
  from "the store never told us": both produce no data, but only the first is a fact about the game,
  and the caller writes a three-day negative cache entry on facts (issue #55).
*/
async function fetchStoreAppDetails(appid) {
  const unanswered = { data: null, answered: false };
  if (storeAppDetailsCircuit.unavailable()) return unanswered;
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`;
  const res = await steamGates.store.run(() => fetch(url, { signal: AbortSignal.timeout(STEAM_KEYLESS_TIMEOUT_MS) }), { label: String(appid) });
  // The gate gave up queueing this one, so nothing was asked and nothing was refused: no breaker
  // failure to record, and the caller falls back to product info exactly as it does for a miss.
  if (res === null) return unanswered;
  if (!res.ok || !/json/i.test(res.headers.get('content-type') || '')) {
    if (storeAppDetailsCircuit.recordFailure()) {
      debug.log(
        `[store] appdetails refused (HTTP ${res.status}) - skipping the store lookup for ${
          STORE_APPDETAILS_COOLDOWN_MS / 60000
        } minutes; product info still resolves names and artwork`
      );
    }
    return unanswered;
  }
  const json = await res.json().catch(() => null);
  if (!json) {
    if (storeAppDetailsCircuit.recordFailure()) {
      debug.log(`[store] appdetails returned an empty body (throttled) - skipping it for ${STORE_APPDETAILS_COOLDOWN_MS / 60000} minutes`);
    }
    return unanswered;
  }
  storeAppDetailsCircuit.recordSuccess();
  // A JSON body with `success: false` IS an answer: the store knows the id and has nothing for it.
  return { data: (json[appid] && json[appid].data) || null, answered: true };
}

/* steam-user's product info runs over one queued connection with no bound; a cold scan can block all
   scan workers on it at once until the per-game budget kills them. Bound it and stop after two hangs:
   the store payload and app-list name still resolve a usable title without it. */
const STEAM_PRODUCT_INFO_TIMEOUT_MS = 12000;
const STEAM_PRODUCT_INFO_COOLDOWN_MS = 5 * 60 * 1000;
const productInfoCircuit = createNetworkCircuit({ failureLimit: 2, cooldownMs: STEAM_PRODUCT_INFO_COOLDOWN_MS });

async function fetchSteamProductInfo(appid) {
  if (productInfoCircuit.unavailable()) return null;
  let timer;
  try {
    const answer = await Promise.race([
      client.getProductInfo([appid], [], false),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`product info timed out after ${STEAM_PRODUCT_INFO_TIMEOUT_MS / 1000}s`)), STEAM_PRODUCT_INFO_TIMEOUT_MS);
      }),
    ]);
    productInfoCircuit.recordSuccess();
    return answer;
  } catch (err) {
    if (productInfoCircuit.recordFailure()) {
      debug.log(
        `[steam] product info is not answering (${err.message || err}) - falling back to the store and the app list for ${
          STEAM_PRODUCT_INFO_COOLDOWN_MS / 60000
        } minutes`
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let client; //lazyload SteamUser
let clientLoginPromise;
// SteamHunters DLC/update groups rarely change; one lookup per appid per session (memory) plus a
// 30-day disk cache (steam_cache, so "Clear caches" wipes it too) is enough.
const steamGroupsCache = new Map();
// Resident daemon, so an unbounded Map grows all session; eviction is cheap since every entry is
// also cached to disk for 30 days. Cap is far above a normal session's distinct-appid count.
const STEAM_GROUPS_MEMORY_CAP = 300;
function rememberSteamGroups(cacheKey, groups) {
  // Re-inserting moves the key to the end, so the eviction below is least-recently-used.
  steamGroupsCache.delete(cacheKey);
  steamGroupsCache.set(cacheKey, groups);
  while (steamGroupsCache.size > STEAM_GROUPS_MEMORY_CAP) {
    steamGroupsCache.delete(steamGroupsCache.keys().next().value);
  }
}

/* Circuit breaker for the SteamHunters achievement-groups endpoint: each game asks independently, so
   an unreachable host costs the whole library one 10s timeout apiece. Only transport failures count,
   an HTTP error is a real answer and leaves the breaker alone; any success closes it. */
const STEAM_GROUPS_COOLDOWN_MS = 5 * 60 * 1000;
const steamGroupsCircuit = createNetworkCircuit({ failureLimit: 3, cooldownMs: STEAM_GROUPS_COOLDOWN_MS });

function steamGroupsUnavailable() {
  return steamGroupsCircuit.unavailable();
}

function recordSteamGroupsFailure() {
  return steamGroupsCircuit.recordFailure();
}

function recordSteamGroupsSuccess() {
  steamGroupsCircuit.recordSuccess();
}
const STEAM_GROUPS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function clientLogOn() {
  const SteamUser = require('steam-user');
  if (!client) client = new SteamUser();
  if (client.steamID) return Promise.resolve();
  if (clientLoginPromise) return clientLoginPromise;
  const pending = new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeListener('loggedOn', onLoggedOn);
      client.removeListener('error', onError);
      if (err) reject(err);
      else resolve();
    };
    const onLoggedOn = () => finish();
    const onError = (err) => finish(err || new Error('Steam anonymous login failed'));
    client.once('loggedOn', onLoggedOn);
    client.once('error', onError);
    timer = setTimeout(() => finish(new Error('Steam anonymous login timed out')), STEAM_CLIENT_LOGIN_TIMEOUT_MS);
    try {
      client.logOn({ anonymous: true });
    } catch (err) {
      finish(err);
    }
  });
  clientLoginPromise = pending
    .catch((err) => {
      recordSteamTransportFailure(err);
      throw err;
    })
    .finally(() => {
      clientLoginPromise = null;
    });
  return clientLoginPromise;
}

const manifest = require('../package.json');
const userData = app.getPath('userData');
let currentlyscraping = { steamcommunity: false, steamhunters: false };
let settingsJS = null;
let configJS = null;
let achievementsJS = null;

// Read the GPU preference before app.ready; disabling it is opt-in.
let userDisableGpu = false;
try {
  const parsed = require('../util/ini').parse(fs.readFileSync(path.join(userData, 'cfg/options.ini'), 'utf8'));
  const v = parsed && parsed.general && parsed.general.disableHardwareAccel;
  userDisableGpu = v === true || v === 'true';
} catch {
  /* no options.ini yet (first run) -> keep GPU acceleration on */
}
if (manifest.config['disable-gpu'] || userDisableGpu || safeMode) app.disableHardwareAcceleration();
if (manifest.config.appid) app.setAppUserModelId(manifest.config.appid);
manifest.config.debug = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron/.test(process.execPath);
// Keep DevTools available in development, but open it only when requested.
const openDevTools = manifest.config.debug && /^(1|true)$/i.test(String(process.env.AW_OPEN_DEVTOOLS || ''));

// Register a per-user URI scheme so toast clicks can reopen the unpackaged app.
const TOAST_PROTOCOL = 'achievement-watcher';
let toastProtocolReady = false;
if (!manifest.config.debug) {
  try {
    toastProtocolReady = app.setAsDefaultProtocolClient(TOAST_PROTOCOL);
  } catch {
    /* protocol registration is best-effort: without it toasts still show, they just aren't clickable */
  }
}

let puppeteerWindow = {};
let MainWin = null;
/* Hiding to tray leaves the renderer (~180 MB) and its GPU process (~140 MB) resident even though
   every background job belongs to the monitor. So the window is released, not just hidden, once it
   has stayed hidden a while; a quick hide/show stays instant, reopening goes through createMainWindow(). */
const MAIN_WINDOW_IDLE_RELEASE_MS = 5 * 60 * 1000;
let mainWindowReleaseTimer = null;

function cancelMainWindowRelease() {
  if (!mainWindowReleaseTimer) return;
  clearTimeout(mainWindowReleaseTimer);
  mainWindowReleaseTimer = null;
}

function scheduleMainWindowRelease() {
  cancelMainWindowRelease();
  mainWindowReleaseTimer = setTimeout(() => {
    mainWindowReleaseTimer = null;
    // Re-check everything: the user may have reopened the window, or the app may be quitting.
    if (app.isQuiting) return;
    if (!MainWin || MainWin.isDestroyed() || MainWin.isVisible()) return;
    debug.log(`[MainWindow] hidden for ${MAIN_WINDOW_IDLE_RELEASE_MS / 60000} min -> releasing the renderer`);
    // destroy() fires 'closed' (not 'close'), so it bypasses the close-to-tray interception and runs
    // the existing teardown: MainWin = null, status poller cleared, Puppeteer closed.
    MainWin.destroy();
    // The renderer is gone but its pages are still resident in the processes that outlive it.
    scheduleIdleTrim('window-released');
  }, MAIN_WINDOW_IDLE_RELEASE_MS);
  // Never let this timer alone hold the process awake.
  if (typeof mainWindowReleaseTimer.unref === 'function') mainWindowReleaseTimer.unref();
}
let overlayWindow = null;
let overlayVisible = false;
let overlayWarmupTimer = null;
const OVERLAY_WARMUP_KEEP_MS = 300000;
let debug = new (require('../util/logger'))({
  console: manifest.config.debug || false,
  file: path.join(userData, `logs/renderer.log`),
});

process.on('uncaughtException', (err) => {
  debug.log(`[uncaughtException] ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (err) => {
  debug.log(`[unhandledRejection] ${err && err.stack ? err.stack : err}`);
});

async function fetchSteamCommunityAchievements(url) {
  // Parse the server-rendered achievements page without launching Chromium.
  try {
    const res = await steamGates.steamcommunity.run(
      () =>
        fetch(url, {
          headers: {
            'User-Agent': STEAM_FETCH_UA,
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: 'birthtime=662716801; wants_mature_content=1', // bypass age gate; ?l= controls language
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(STEAM_KEYLESS_TIMEOUT_MS),
        }),
      { label: url }
    );
    // A refusal that outlived its retries is not "this game has no achievements": say so, or the
    // empty list is cached as the truth about the game (issue #55). Every caller reads the result as
    // a list, so the marker rides on the empty list rather than changing its shape.
    // Not attempted (the queue was longer than this request's share of the game's budget) is the
    // same kind of non-answer as a refusal: unknown, not empty.
    if (res === null || isThrottleStatus(res.status)) {
      debug.log(`steamcommunity not answered${res === null ? ' (queued too long)' : ` (HTTP ${res.status})`}: ${url}`);
      return Object.assign([], { throttled: true });
    }
    if (!res.ok) return [];
    return steamSchemaFetch.parseSteamCommunityRows(await res.text()).map((row) => ({
      img: row.img || null,
      icon: row.icon || '',
      title: row.title || null,
      description: row.description || null,
    }));
  } catch (err) {
    recordSteamTransportFailure(err);
    debug.log(`steamcommunity fetch failed: ${err}`);
    return [];
  }
}

// Prefer the official Steam API; return null on transport/auth errors so scraping can take over.
async function getSchemaFromWebAPI(appid, lang) {
  const language = (lang && (lang.api || lang)) || 'english';
  const url = `https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=${encodeURIComponent(language)}`;
  let res;
  try {
    res = await steamGates.api.run(() => fetch(url, { signal: AbortSignal.timeout(STEAM_KEYLESS_TIMEOUT_MS) }), { label: String(appid) });
  } catch (err) {
    recordSteamTransportFailure(err);
    debug.log(`[${appid}] GetGameAchievements network error: ${err.message}`);
    return null;
  }
  // Still refused after the gate paced and retried it. The next source down the chain talks to a
  // different host, so it is still worth asking - but the caller must know this was a refusal and
  // not a verdict about the appid.
  if (res === null || isThrottleStatus(res.status)) {
    debug.log(`[${appid}] GetGameAchievements not answered${res === null ? ' (queued too long)' : ` (HTTP ${res.status})`}`);
    return { throttled: true };
  }
  if (!res.ok) {
    debug.log(`[${appid}] GetGameAchievements HTTP ${res.status}`);
    return null; // let the caller decide to scrape
  }
  recordSteamTransportSuccess();
  let json;
  try {
    json = await res.json();
  } catch (err) {
    return null;
  }
  return steamSchemaFetch.mapOfficialAchievements(json?.response, appid);
}

// SteamHunters' public JSON API: full achievement list (apiName/name/description/global rarity)
// in one plain request. { ok: true } with an empty list is a valid "no achievements" answer.
async function fetchSteamHuntersJson(appid) {
  try {
    const res = await steamGates.steamhunters.run(
      () =>
        fetch(`https://steamhunters.com/api/apps/${appid}/achievements`, {
          headers: { 'User-Agent': STEAM_FETCH_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(STEAM_KEYLESS_TIMEOUT_MS),
        }),
      { label: String(appid) }
    );
    if (res === null || isThrottleStatus(res.status)) {
      debug.log(`[${appid}] SteamHunters not answered${res === null ? ' (queued too long)' : ` (HTTP ${res.status})`}`);
      return { ok: false, list: [], throttled: true };
    }
    if (!res.ok) return { ok: false, list: [] };
    const json = await res.json();
    return Array.isArray(json) ? { ok: true, list: json } : { ok: false, list: [] };
  } catch (err) {
    recordSteamTransportFailure(err);
    debug.log(`[${appid}] SteamHunters JSON fetch failed: ${err.message}`);
    return { ok: false, list: [] };
  }
}

// Icon-hash -> real apiName lookup, one small file per appid (steam_cache, so "Clear caches" wipes
// it too). Feeds the degraded SteamCommunity-only fallback below when every apiName source fails.
function apiNameIndexPath(appid) {
  return path.join(userData, 'steam_cache/apinames', `${appid}.json`);
}

function loadApiNameIndex(appid) {
  try {
    return JSON.parse(fs.readFileSync(apiNameIndexPath(appid), 'utf8'));
  } catch {
    return null;
  }
}

function rememberApiNameIndex(appid, achievements) {
  try {
    const fresh = steamSchemaFetch.buildApiNameIndex(achievements);
    if (Object.keys(fresh).length === 0) return;
    const merged = { ...loadApiNameIndex(appid), ...fresh };
    const file = apiNameIndexPath(appid);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(merged));
  } catch (err) {
    debug.log(`[${appid}] could not persist the apiName index: ${err.message || err}`);
  }
}

/*
  SteamHunters' per-app record: {appId, name, typeString, ...}. It is the only keyless source that
  answers "what is this AppID called" for a game Steam's own retired GetAppList never listed and the
  Steam client has never installed - which is every emulator save folder. Before this, a library of
  GSE saves depended entirely on store.steampowered.com/api/appdetails and the anonymous product-info
  login; both are rate-limited, so a large scan rendered most tiles as a bare number (issue #55).

  Cached to disk for 30 days like the groups lookup below: a name does not change, and "Clear caches"
  wipes steam_cache anyway.
*/
const STEAMHUNTERS_APP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function steamHuntersAppCachePath(appid) {
  return path.join(userData, 'steam_cache/steamhunters_apps', `${appid}.json`);
}

function loadSteamHuntersApp(appid) {
  try {
    const raw = JSON.parse(fs.readFileSync(steamHuntersAppCachePath(appid), 'utf8'));
    if (raw && raw.fetchedAt && Date.now() - raw.fetchedAt < STEAMHUNTERS_APP_CACHE_TTL_MS) return raw;
  } catch {}
  return null;
}

async function fetchSteamHuntersApp(appid) {
  const cached = loadSteamHuntersApp(appid);
  if (cached) return { name: String(cached.name || ''), typeString: String(cached.typeString || '') };
  if (steamGroupsUnavailable()) return null;
  try {
    const res = await steamGates.steamhunters.run(
      () =>
        fetch(`https://steamhunters.com/api/apps/${appid}`, {
          headers: { 'User-Agent': STEAM_FETCH_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(STEAM_KEYLESS_TIMEOUT_MS),
        }),
      { label: `app ${appid}` }
    );
    // A status code is an answer from a live host, so it clears the transport breaker even when the
    // body is unusable; a refusal is not an answer about this appid and is simply left unanswered.
    if (res === null) return null;
    recordSteamGroupsSuccess();
    if (isThrottleStatus(res.status) || !res.ok) return null;
    const json = await res.json();
    const name = String((json && json.name) || '').trim();
    if (!name) return null;
    const typeString = String((json && json.typeString) || '').trim();
    try {
      const file = steamHuntersAppCachePath(appid);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), name, typeString }));
    } catch (err) {
      debug.log(`[${appid}] could not persist the SteamHunters app record: ${err.message || err}`);
    }
    return { name, typeString };
  } catch (err) {
    recordSteamGroupsFailure();
    debug.log(`[${appid}] SteamHunters app lookup failed: ${err.message || err}`);
    return null;
  }
}

function steamGroupsCachePath(appid) {
  return path.join(userData, 'steam_cache/steamhunters_groups', `${appid}.json`);
}

function loadSteamGroupsCache(appid) {
  try {
    const raw = JSON.parse(fs.readFileSync(steamGroupsCachePath(appid), 'utf8'));
    if (raw && Array.isArray(raw.groups) && raw.fetchedAt && Date.now() - raw.fetchedAt < STEAM_GROUPS_CACHE_TTL_MS) {
      return raw.groups;
    }
  } catch {}
  return null;
}

function saveSteamGroupsCache(appid, groups) {
  try {
    const file = steamGroupsCachePath(appid);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), groups }));
  } catch (err) {
    debug.log(`[${appid}] could not persist the SteamHunters groups cache: ${err.message || err}`);
  }
}

// Fast keyless chain: the official endpoint first (works without a key and is the only source with
// hidden descriptions + icons + rarity), then SteamHunters JSON enriched with SteamCommunity
// icons/hidden, then SteamCommunity alone, then nothing (the caller may fall back to the browser).
async function getAchievementsKeyless(appid, lang) {
  // A host that refused is a host that never answered about this appid. Tracked across the whole
  // chain so an all-refusals run ends as "unknown" rather than as "this game has no achievements",
  // which is what got cached and rendered as an empty tile (issue #55).
  let refused = false;
  const official = await getSchemaFromWebAPI(appid, lang);
  if (Array.isArray(official)) {
    rememberApiNameIndex(appid, official);
    return { achievements: official, source: 'official' };
  }
  if (official && official.throttled === true) refused = true;

  if (steamTransportUnavailable()) return { achievements: [], source: 'none', networkError: true };

  const sh = await fetchSteamHuntersJson(appid);
  if (sh.throttled === true) refused = true;
  if (sh.ok) {
    if (sh.list.length === 0) return { achievements: [], source: 'steamhunters' };
    const language = (lang && (lang.api || lang)) || 'english';
    // SteamHunters titles are English-only, so icons/hidden come from the English SteamCommunity
    // page (title match); the localized page is then overlaid by icon hash (language-independent).
    const achievements = steamSchemaFetch.mapSteamHuntersJson(sh.list);
    const englishRows = await fetchSteamCommunityAchievements(
      `https://steamcommunity.com/stats/${appid}/achievements?l=english`
    );
    const merged = englishRows.length
      ? steamSchemaFetch.mergeSteamHuntersWithCommunity(sh.list, englishRows)
      : achievements;
    if (language !== 'english') {
      const localizedRows = await fetchSteamCommunityAchievements(
        `https://steamcommunity.com/stats/${appid}/achievements?l=${language}`
      );
      if (localizedRows.length) {
        const { mergeTranslatedAchievements } = require('../parser/achievementTranslations.js');
        mergeTranslatedAchievements(merged, localizedRows);
      }
    }
    // SteamHunters always carries real apiNames, with or without a successful icon merge.
    rememberApiNameIndex(appid, merged);
    return { achievements: merged, source: 'steamhunters' };
  }

  if (steamTransportUnavailable()) return { achievements: [], source: 'none', networkError: true };

  const language = (lang && (lang.api || lang)) || 'english';
  const rows = await fetchSteamCommunityAchievements(
    `https://steamcommunity.com/stats/${appid}/achievements?l=${language}`
  );
  if (rows.throttled === true) refused = true;
  if (rows.length) {
    const degraded = steamSchemaFetch.mapSteamCommunityRows(rows);
    const apiNames = loadApiNameIndex(appid);
    return { achievements: apiNames ? steamSchemaFetch.applyApiNameIndex(degraded, apiNames) : degraded, source: 'steamcommunity' };
  }
  // networkError is the flag the whole chain already reads as "no verdict, keep the entry and try
  // again next scan"; a refusal deserves exactly that treatment.
  if (refused) return { achievements: [], source: 'none', networkError: true };
  return { achievements: [], source: 'none' };
}

/* One appid can be asked for the same thing several times at once (notification + library tile +
   parallel scan workers). Coalesce per (type, appid, language) for the duration of the in-flight
   request only; a completed answer is cached by the callers themselves, not here. */
const COALESCED_STEAM_TYPES = new Set(['common', 'name', 'header', 'icon', 'portrait', 'data', 'steamhunters']);
const steamDataInFlight = new Map();

function copySteamData(value) {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    return value; // non-cloneable payloads are handed back as-is rather than lost
  }
}

async function getSteamData(request) {
  const type = request.type;
  if (!COALESCED_STEAM_TYPES.has(type)) return resolveSteamData(request);
  const lang = request.lang || 'english';
  const key = `${type}\0${request.appid}\0${typeof lang === 'string' ? lang : lang.api}`;
  let pending = steamDataInFlight.get(key);
  if (!pending) {
    pending = resolveSteamData(request).finally(() => steamDataInFlight.delete(key));
    steamDataInFlight.set(key, pending);
  }
  return copySteamData(await pending);
}

async function resolveSteamData(request) {
  const appid = request.appid;
  const type = request.type;
  let user = request.user;
  let userid;
  const lang = request.lang || 'english';
  if (!configJS) {
    try {
      await startEngines(); // makes the config available for the browser-free schema path
    } catch (err) {
      debug.log('startEngines (getSteamData) failed: ' + err.message);
    }
  }
  try {
    // A cleared cache fans out one lookup per game; once transport has failed, do not make every
    // appid wait on the same dead host. The renderer keeps the game provisional and retries later.
    if (steamTransportUnavailable() && ['common', 'name', 'header', 'icon', 'portrait', 'user'].includes(type)) {
      return { appid, networkError: true };
    }
    if (type === 'user') {
      const url = `https://steamcommunity.com/profiles/${user}/stats/${appid}/?xml=1`;
      const res = await fetch(url);
      const xml = await res.text();
      const parser = createXmlParser();
      const data = parser.parse(xml);
      const achievements = data?.playerstats?.achievements?.achievement || [];
      const list = Array.isArray(achievements) ? achievements : [achievements];

      return list.map((a) => {
        const name = a.apiname?.__cdata || a.apiname || '';
        const unlock = parseInt(a.unlockTimestamp ?? 0, 10);
        return {
          apiname: name,
          achieved: unlock > 0 ? 1 : 0,
          unlocktime: unlock || 0,
        };
      });
    }
    if (type === 'steamcommunity') {
      let info = { appid };
      const url = `https://steamcommunity.com/stats/${appid}/achievements?l=${lang.api}`; //this doesnt give hidden descriptions
      info.achievements = await fetchSteamCommunityAchievements(url);
      if (info.achievements.length > 0 && info.achievements.every((a) => a.description)) {
        return info;
      }

      let validXml = false;
      let xml;

      // Prefer SteamHunters owners over a blind SteamID loop.

      await scrapeWithPuppeteer(info, { userlist: true, steamhunters: true, appid });
      // Keep partial achievements when the owner list fails.

      // Use the first public owner profile with complete localized descriptions.
      const tryOwnerProfiles = async (ids) => {
        for (let id of ids) {
          userid = id;
          const url = `https://steamcommunity.com/profiles/${userid}/stats/${appid}/?xml=1`; // this for all data
          const res = await fetch(url);
          xml = await res.text();
          validXml = !(xml.startsWith('<!DOCTYPE html') || xml.includes('<html'));
          if (!validXml) continue;

          const parser = createXmlParser();
          const data = parser.parse(xml);
          const achievements = data?.playerstats?.achievements?.achievement || [];
          const list = achievements.map((a) => {
            const unlocked = a['@_closed'] === '1';
            const name = a.name.__cdata;
            const description = a.description.__cdata;
            return { name, description, unlocked };
          });
          const allgood = list.length > 0 && list.every((a) => a.description);
          if (!allgood) continue;
          const url2 = `https://steamcommunity.com/profiles/${userid}/stats/${appid}?l=${lang.api}`; // this for name and description, match them via icon hash
          info.achievements = await fetchSteamCommunityAchievements(url2);
          return true;
        }
        return false;
      };

      if (await tryOwnerProfiles((info.users || []).map((user) => user.steamId))) return info;

      // Fall back to the cached top-owner SteamID pool.
      const owners = await fetchTopOwners();
      if (owners.length && (await tryOwnerProfiles(owners))) return info;
      return info;
    }

    if (type === 'data' || type === 'steamhunters') {
      let info = { appid };
      if (steamTransportUnavailable()) return { ...info, achievements: [], source: 'none', networkError: true };
      // Prefer the official endpoint - Steam serves this schema without a key. null means
      // transport/auth failure: fall through to the keyless chain, then to the browser scrape.
      const keyless = await getAchievementsKeyless(appid, request.lang);
      if (keyless.networkError === true) {
        return { ...info, achievements: [], source: 'none', networkError: true };
      }
      if (keyless.source === 'none') {
        await scrapeWithPuppeteer(info, { steamhunters: true });
        if (type === 'data') {
          // Bound the fallback so a stalled scrape cannot hang sendSync forever.
          let waited = 0;
          while (!info.achievements && waited < 60) {
            await delay(500);
            waited++;
          }
        }
      } else {
        info.achievements = keyless.achievements;
        info.source = keyless.source;
      }
      if (!Array.isArray(info.achievements)) info.achievements = [];
      return info;
    }
    if (type === 'steamgroups') {
      const cacheKey = String(appid);
      if (steamGroupsCache.has(cacheKey)) {
        const groups = steamGroupsCache.get(cacheKey);
        rememberSteamGroups(cacheKey, groups);
        return { ok: true, groups };
      }
      const cachedGroups = loadSteamGroupsCache(appid);
      if (cachedGroups) {
        rememberSteamGroups(cacheKey, cachedGroups);
        return { ok: true, groups: cachedGroups };
      }
      // The host was unreachable moments ago; do not spend another timeout proving it per game.
      if (steamGroupsUnavailable()) return { ok: false, groups: [] };
      try {
        const res = await steamGates.steamhunters.run(
          () =>
            fetch(`https://steamhunters.com/api/GetAchievementGroups/v1?appId=${appid}`, {
              headers: { 'User-Agent': STEAM_FETCH_UA, Accept: 'application/json' },
              signal: AbortSignal.timeout(STEAM_KEYLESS_TIMEOUT_MS),
            }),
          { label: `groups ${appid}` }
        );
        if (res === null) return { ok: false, groups: [] };
        // A status code is an answer from a live host, so it clears the breaker even when unusable.
        recordSteamGroupsSuccess();
        if (!res.ok) return { ok: false, groups: [] };
        const json = await res.json();
        const groups = Array.isArray(json && json.groups) ? json.groups : [];
        rememberSteamGroups(cacheKey, groups);
        // Persist non-empty answers only: a transient empty response must not hide future groups.
        if (groups.length) saveSteamGroupsCache(appid, groups);
        return { ok: true, groups };
      } catch (err) {
        if (recordSteamGroupsFailure()) {
          debug.log(
            `[${appid}] SteamHunters groups fetch failed: ${err.message || err} - skipping achievement groups for ${
              STEAM_GROUPS_COOLDOWN_MS / 60000
            } minutes`
          );
        } else {
          debug.log(`[${appid}] SteamHunters groups fetch failed: ${err.message || err}`);
        }
        return { ok: false, groups: [] };
      }
    }
    // Resolve names from the local app list first, then fall back to Steam's product info.
    if (type === 'name') {
      const offlineName = require('../util/gameNameCache.js').lookupSteamDbName(appid);
      if (offlineName) return offlineName;
    }
    if (steamTransportUnavailable()) return { appid, networkError: true };
    // Best-effort: the anonymous session is only needed by getProductInfo, which has a breaker of
    // its own, while the store and the SteamHunters fallback below need no session at all. Letting a
    // login timeout throw here cost every game its name for the rest of the scan.
    try {
      await clientLogOn();
    } catch (err) {
      debug.log(`[${appid}] Steam anonymous login unavailable (${err.message || err}); continuing with the keyless sources`);
    }
    const store = await fetchStoreAppDetails(appid);
    const productInfo = await fetchSteamProductInfo(appid);
    const apps = productInfo?.apps || {};
    const appInfo = apps[appid]?.appinfo || apps[0]?.appinfo;
    const metadata = resolveSteamMetadata({
      appInfo,
      storeData: store.data,
      langApi: lang.api,
      langKey: typeof lang === 'string' ? lang : lang.api,
    });
    // Did anything actually reply about this AppID? A nameless answer and no answer at all look
    // identical from here, and the parser turns the first into a three-day negative cache entry -
    // so a rate-limited scan used to blacklist the games it could not reach (issue #55).
    let answered = store.answered || productInfo !== null;

    /*
      Neither Steam source named the game. That is the normal case for an emulator save folder:
      GetAppList is retired, the Steam client has never installed the title, and the store endpoint
      is the first thing to start refusing under a large scan. SteamHunters knows the same AppID and
      is not on Steam's budget, so ask it rather than render the number (issue #55).
    */
    if (!metadata.name) {
      const hunted = await fetchSteamHuntersApp(appid);
      if (hunted) answered = true;
      if (hunted && hunted.name) {
        metadata.name = hunted.name;
        if (!metadata.productType && hunted.typeString) {
          metadata.productType = hunted.typeString.toLowerCase();
          metadata.isGame = metadata.productType === 'game';
        }
        debug.log(`[${appid}] no name from Steam; SteamHunters calls it "${hunted.name}"`);
      }
    }

    // Nobody answered and there is nothing to show for it: report it as the outage it is, so the
    // entry stays provisional and is retried, rather than being remembered as an unknown AppID.
    if (!answered && !metadata.name) {
      debug.log(`[${appid}] no source answered - reporting it as unknown rather than as a miss`);
      metadata.networkError = true;
    }

    switch (type) {
      case 'name':
        return metadata.name;

      case 'header':
        return metadata.header;
      case 'icon':
        return metadata.icon;
      case 'portrait':
        return metadata.portrait;
      default:
      case 'common':
        recordSteamTransportSuccess();
        return metadata;
    }
  } catch (err) {
    recordSteamTransportFailure(err);
    debug.log(err);
    return { appid, networkError: isSteamTransportFailure(err) };
  }
}

// Sources whose artwork and rarity come from local emulator data.
const OVERLAY_EMULATOR_RARITY_SOURCES = new Set(['RPCS3 Emulator', 'ShadPS4 Emulator', 'Xenia Emulator']);

  // Apply cached rarity so the overlay can render immediately without network access.
function attachOverlayRarity(game) {
  try {
    if (!game || !game.achievement || !Array.isArray(game.achievement.list)) return;
    const rarity = require(path.join(__dirname, '../util/rarity.js'));
    // Xbox PC caches rarity directly on each schema entry at import time (no sidecar file for it).
    if (String(game.source || '') === 'Xbox PC') {
      for (const a of game.achievement.list) {
        if (a && a.rarityPct != null && Number.isFinite(Number(a.rarityPct))) a.rarityPercent = Number(a.rarityPct);
      }
      return;
    }
    const context = rarity.resolveGameRarityContext(game, { emulatorSources: OVERLAY_EMULATOR_RARITY_SOURCES });
    if (!context) return;
    const cacheId = context.kind === 'steam-bridge' ? context.cacheId : context.kind === 'emulator' ? game.appid : context.appid;
    if (!cacheId) return;
    const entries = rarity.readRarityCacheEntries(cacheId);
    if (!Array.isArray(entries) || entries.length === 0) return;
    const byName = new Map(entries.map((e) => [String(e && e.name), e && e.percent]));
    for (const a of game.achievement.list) {
      if (!a || !a.name) continue;
      const percent = byName.get(String(a.name));
      if (percent !== undefined) a.rarityPercent = percent;
    }
  } catch (err) {
    debug.log(`[overlay] rarity attach failed: ${err.message || err}`);
  }
}

/* Point each row at the picture the game itself ships, if it has one: the overlay is on screen over a
   running game, the worst moment to wait on a download. Untouched games keep the normal fetch. */
function attachOverlayLocalIcons(game) {
  try {
    if (!game || !game.achievement || !Array.isArray(game.achievement.list)) return;
    const index = localIcons.readIndex({
      gameDir: game.gameDir,
      steamSettings: game.steamSettings,
      binary: configuredExecutable(game.appid),
    });
    if (index.byName.size === 0 && index.byToken.size === 0) return;
    for (const achievement of game.achievement.list) {
      if (!achievement) continue;
      const unlocked = localIcons.achievementIcon(index, achievement, true);
      const locked = localIcons.achievementIcon(index, achievement, false);
      if (unlocked) achievement.iconLocal = unlocked;
      if (locked) achievement.icongrayLocal = locked;
    }
  } catch (err) {
    debug.log(`[overlay] local icon attach failed: ${err.message || err}`);
  }
}

/*
  The on-demand scrapes (SteamDB covers, launch metadata, top owners) run off the critical path, so
  a teardown routinely fired while several were mid-flight: the renderer sends "close-puppeteer" the
  moment the game list is populated, and a scan leaves a fan-out of SteamDB lookups running behind
  it. Closing the context under them killed the page they were on, which surfaced as "Execution
  context was destroyed" on the evaluate and an unhandled TargetCloseError from inside the stealth
  plugin. Each scrape now takes a lease and closePuppeteer drains the ones outstanding when it was
  called - bounded, so a wedged page can still never hold the browser open.
*/
const puppeteerLeases = new Set();
const PUPPETEER_DRAIN_TIMEOUT_MS = 20000;
/*
  The same lease caps how many stealth pages exist at once. Nothing bounded the fan-out before: a
  scan seeds launch metadata per game off the critical path, so a library could ask for a dozen
  SteamDB pages simultaneously - a dozen renderers, a dozen full evasion passes, and a much wider
  window for a teardown to land mid-scrape. Queueing costs nothing here since every caller is
  already best-effort and off the critical path.
*/
const PUPPETEER_MAX_CONCURRENT_PAGES = 3;
const puppeteerSlotQueue = [];
let puppeteerSlotsInUse = 0;

async function acquirePuppeteerSlot() {
  if (puppeteerSlotsInUse >= PUPPETEER_MAX_CONCURRENT_PAGES) {
    // The releasing scrape hands its slot straight over, so the count stays accurate across the await.
    await new Promise((resolve) => puppeteerSlotQueue.push(resolve));
  } else {
    puppeteerSlotsInUse += 1;
  }
  let release;
  const lease = new Promise((resolve) => {
    release = resolve;
  });
  puppeteerLeases.add(lease);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    puppeteerLeases.delete(lease);
    release();
    const next = puppeteerSlotQueue.shift();
    if (next) next();
    else puppeteerSlotsInUse -= 1;
  };
}

let puppeteerClosing = null;

async function closePuppeteer() {
  currentlyscraping.steamcommunity = false;
  currentlyscraping.steamhunters = false;
  if (!puppeteerWindow) {
    puppeteerWindow = {};
    return;
  }
  // Two close paths can overlap (the window fires both 'close' and 'closed'); one drain is enough.
  if (puppeteerClosing) return puppeteerClosing;
  puppeteerClosing = (async () => {
    const outstanding = [...puppeteerLeases];
    if (outstanding.length) {
      debug.log(`puppeteer: waiting on ${outstanding.length} scrape(s) before closing the browser`);
      await Promise.race([Promise.all(outstanding), delay(PUPPETEER_DRAIN_TIMEOUT_MS)]);
    }
    // Detach handles first so a concurrent scrape cannot reuse a browser being closed.
    const browser = puppeteerWindow.browser;
    const context = puppeteerWindow.context;
    puppeteerWindow.browser = undefined;
    puppeteerWindow.context = undefined;
    puppeteerWindow.pagesh = undefined;
    try {
      if (context) await context.close();
    } catch {}
    try {
      if (browser) await browser.close();
    } catch {}
  })();
  try {
    await puppeteerClosing;
  } finally {
    puppeteerClosing = null;
  }
}

async function startEngines() {
  if (!settingsJS) {
    settingsJS = require(path.join(__dirname, '../settings.js'));
    settingsJS.setUserDataPath(userData);
  }
  configJS = await settingsJS.load();
}

/*
  The achievement parser is 177 files, and loading it here used to be part of every startup even
  though the main process only needs it for a background repair pass or a notification that has to
  describe a game - both minutes away at the earliest, and neither reached at all in a session where
  the user just looks at their library. It loads on first use instead, initialised exactly once.
*/
function getAchievements() {
  if (!achievementsJS) {
    achievementsJS = require(path.join(__dirname, '../parser/achievements.js'));
    achievementsJS.initDebug({ isDev: app.isDev || false, userDataPath: userData });
    // Emulator setup runs in the background; keep its completion toast wired.
    if (achievementsJS.setEmulatorFixedHandler) achievementsJS.setEmulatorFixedHandler((g) => notifyEmulatorFixed(g));
  }
  return achievementsJS;
}

async function getCachedData(info) {
  if (!info.source) info.source = 'steam';
  let g = await getAchievements().getGameFromCache(info.appid, info.source, configJS);
  switch (info.source.toLowerCase()) {
    case 'epic':
    case 'gog':
    case 'luma':
    case 'steam':
    default:
      if (g) {
        info.a = g.achievement.list.find((ac) => ac.name === String(info.ach));
        info.game = g;
        info.description = info.a?.displayName;
        return;
      }
      const [data, com] = await Promise.all([
        getSteamData({ appid: info.appid, type: 'steamhunters' }),
        getSteamData({ appid: info.appid, type: 'common' }),
      ]);
      info.game = com;
      info.game.achievements = data.achievements;

      await getAchievements().saveGameToCache(info, configJS.achievement.lang);
      info.a = info.game.achievements.find((ac) => ac.name === String(info.ach));
      info.description = info.a?.displayName;
  }
}

ipcMain.on('close-puppeteer', async (event, arg) => {
  await closePuppeteer();
  event.returnValue = true;
});

ipcMain.on('emulator-fixed-notify', async (event, game) => {
  try {
    await startEngines(); // refresh configJS so the master notification switch/language are respected
  } catch (err) {
    debug.log(`[bg-autofix] notify config refresh failed: ${err.message || err}`);
  }
  notifyEmulatorFixed(game);
});

ipcMain.on('get-steam-data', async (event, arg) => {
  const appid = +arg.appid;
  event.returnValue = await getSteamData({ appid, type: arg.type, user: arg.user, lang: arg.lang });
});

// Reload the main-process config after the renderer saves settings.
ipcMain.on('config-saved', async () => {
  try {
    await startEngines(); // re-reads options.ini into configJS
    if (overlayVisible) {
      overlayWindow.webContents.send('overlay-controller-config', overlayControllerConfigPayload());
    }
  } catch (err) {
    debug.log('[config-saved] config reload failed: ' + (err.message || err));
  }
});

// Async twin of the legacy handler; keep long scrapes off the renderer thread.
ipcMain.handle('get-steam-data', async (event, arg) => {
  const appid = +arg.appid;
  return await getSteamData({ appid, type: arg.type, user: arg.user, lang: arg.lang });
});

// Async Epic lookups keep slow store and artwork requests off the renderer thread.
async function resolveSteamAppidFromTitle(arg) {
  function normalizeTitle(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFKD') // normalize accents
      .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A']/g, '') // single quotes
      .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB"]/g, '') // double quotes
      .replace(/[™®©]/g, '') // trademark symbols
      .replace(/[:.,!?()\\[\\]{}-]/g, '') // punctuation + hyphens
      .replace(/\s+/g, ' ') // collapse spaces
      .trim();
  }

  let info = { name: arg.title };
  searchForSteamAppId(info);
  let possibleMatch;
  // Bound the poll because the page may fail before populating info.games.
  let tries = 0;
  while (tries < 60) {
    if (info.games) {
      for (let game of info.games) {
        if (normalizeTitle(game.title) === normalizeTitle(arg.title)) return game.appid;
        if (!possibleMatch && normalizeTitle(game.title).includes(normalizeTitle(arg.title))) {
          possibleMatch = game.appid;
        }
      }
      break;
    }
    await delay(500);
    tries++;
  }
  return possibleMatch;
}

ipcMain.on('get-steam-appid-from-title', async (event, arg) => {
  try {
    event.returnValue = await resolveSteamAppidFromTitle(arg);
  } catch {
    event.returnValue = undefined;
  }
});
ipcMain.handle('get-steam-appid-from-title', (event, arg) => resolveSteamAppidFromTitle(arg));

async function resolveTitleFromEpicId(arg) {
  let info = { appid: arg.appid };
  await searchForGameName(info); // bounded internally; info.title may be undefined on a miss
  return info.title;
}

ipcMain.on('get-title-from-epic-id', async (event, arg) => {
  try {
    event.returnValue = await resolveTitleFromEpicId(arg);
  } catch {
    event.returnValue = undefined;
  }
});
ipcMain.handle('get-title-from-epic-id', (event, arg) => resolveTitleFromEpicId(arg));

/*
  The name a store puts on a game and the name SteamGridDB files it under differ by an edition tag
  far more often than by anything else - a final cut, a deluxe, a midnight edition. The matcher is
  strict on purpose (a wrong cover is worse than none), so rather than loosen it, the same strict
  match is tried again against a shorter query. Only a tail that reads as an edition is dropped,
  never a subtitle: the part after a colon is usually the game's own name and is kept.
*/
/*
  An edition tag at the end of a name, after a separator or plain: a final cut, a deluxe, a complete
  story. Written as one literal rather than built from a string, where the backslashes are one
  escaping mistake away from matching the letter s instead of a space.
*/
const SGDB_EDITION_TAIL =
  /\s*(?:[-–—:]\s*)?(?:(?:the\s+)?(?:final\s+cut|definitive|complete(?:\s+story)?|deluxe|ultimate|premium|gold|platinum|anniversary|remastered|enchanted|redux|midnight|enhanced|standard|digital|collector'?s?|game\s+of\s+the\s+year|goty)\b[\w\s'’]*|(?:[\w'’]+\s+)?edition\b[\w\s'’]*)$/i;
// A dash-introduced tail that is not an edition is usually a subtitle SteamGridDB does not carry.
// Tried last, and still only accepted if the strict matcher recognises what comes back.
const SGDB_SUBTITLE_TAIL = /\s+[-–—]\s+.+$/;

function steamGridDbNameVariants(name) {
  const variants = [];
  const push = (value) => {
    const text = String(value || '').trim().replace(/\s{2,}/g, ' ');
    if (text && !variants.some((v) => v.toLowerCase() === text.toLowerCase())) variants.push(text);
  };
  push(name);
  // Trademark marks are in the store name and never in SteamGridDB's.
  const bare = String(name).replace(/[™®©]/g, '');
  push(bare);
  let trimmed = bare;
  for (let round = 0; round < 2 && SGDB_EDITION_TAIL.test(trimmed); round += 1) {
    trimmed = trimmed.replace(SGDB_EDITION_TAIL, '');
    push(trimmed);
  }
  if (SGDB_SUBTITLE_TAIL.test(trimmed)) push(trimmed.replace(SGDB_SUBTITLE_TAIL, ''));
  return variants;
}

// One lookup at a time is five requests; a library-wide refresh would fire hundreds at once and be
// throttled into failures. Enough of them run together to keep a scan quick, not enough to trip it.
const sgdbGate = { active: 0, waiting: [], limit: 4 };
async function withSteamGridDbSlot(run) {
  if (sgdbGate.active >= sgdbGate.limit) await new Promise((resolve) => sgdbGate.waiting.push(resolve));
  sgdbGate.active += 1;
  try {
    return await run();
  } finally {
    sgdbGate.active -= 1;
    const next = sgdbGate.waiting.shift();
    if (next) next();
  }
}

async function resolveImagesForGame(arg) {
  const gameName = String(arg && arg.name || '').trim();
  if (!gameName) return null;
  // One module owns where an answer lives and how long it lives, because the window reads those
  // same files directly instead of asking the main process once per game.
  const cacheFile = sgdbAssetCache.cacheFile(userData, gameName, arg.platform, arg.gameId);
  const cached = sgdbAssetCache.readCached(userData, gameName, arg.platform, arg.gameId);
  if (cached !== undefined) return cached;
  if (steamGridDbUnavailable()) return null;
  const apiKey = getSteamGridDbApiKey();
  // Time-box artwork requests so network failures return quickly.
  const sgdb = (url) =>
    fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(SGDB_FETCH_TIMEOUT_MS) });
  const rememberMiss = () => {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify({ notFound: true, name: gameName }, null, 2), 'utf8');
    } catch {}
  };
  return withSteamGridDbSlot(async () => {
  try {
    let game = null;
    let matchedName = gameName;
    /*
      `answered` separates "SteamGridDB has nothing for this name" from "SteamGridDB did not answer".
      Only the first is worth remembering: the key is shared by every install and gets throttled, and
      a throttled reply is an empty list like any other. Caching one of those as "no artwork" is how
      a game that does have a cover kept a blank tile for days.
    */
    let answered = false;
    for (const variant of steamGridDbNameVariants(gameName)) {
      const searchRes = await sgdb(`${BASE_URL}/search/autocomplete/${encodeURIComponent(variant)}`);
      sgdbCircuit.recordSuccess();
      // Error payloads may omit data.
      const searchData = await searchRes.json();
      if (searchRes.ok && searchData?.success !== false && Array.isArray(searchData?.data)) answered = true;
      game = pickSteamGridDbGame(searchData?.data, variant);
      if (game) {
        matchedName = variant;
        break;
      }
    }
    if (!game && answered) {
      // Nothing matched under the usual rules. One more pass, over the shortest query tried, where a
      // single candidate carrying the whole name is accepted even with more words of its own.
      const variants = steamGridDbNameVariants(gameName);
      const shortest = variants[variants.length - 1];
      const searchRes = await sgdb(`${BASE_URL}/search/autocomplete/${encodeURIComponent(shortest)}`);
      const searchData = await searchRes.json();
      game = pickSteamGridDbGame(searchData?.data, shortest, { relaxed: true });
      if (game) matchedName = `${shortest} (relaxed)`;
    }
    if (!game) {
      debug.log(`[get-images-for-game] no SteamGridDB entry for "${gameName}"${answered ? '' : ' (no answer - will retry)'}`);
      if (answered) rememberMiss();
      return null;
    }
    if (matchedName !== gameName) debug.log(`[get-images-for-game] "${gameName}" matched as "${matchedName}"`);

    const gameId = game.id;

    const [iconsRes, gridsRes, heroesRes, logosRes] = await Promise.all([
      sgdb(`${BASE_URL}/icons/game/${gameId}`),
      sgdb(`${BASE_URL}/grids/game/${gameId}`),
      sgdb(`${BASE_URL}/heroes/game/${gameId}`),
      sgdb(`${BASE_URL}/logos/game/${gameId}`),
    ]);

    const [icons, grids, heroes, logos] = await Promise.all([iconsRes.json(), gridsRes.json(), heroesRes.json(), logosRes.json()]);

    const gridList = Array.isArray(grids?.data) ? grids.data.filter((asset) => asset && asset.url) : [];
    const assetArea = (asset) => (Number(asset.width) || 0) * (Number(asset.height) || 0);
    const bestOf = (assets) => assets.slice().sort((a, b) => assetArea(b) - assetArea(a))[0];
    const portrait = gridList.find((g) => Number(g.width) === 600 && Number(g.height) === 900) || bestOf(gridList.filter((g) => Number(g.height) > Number(g.width)));
    const landscape = gridList.find((g) => Number(g.width) === 920 && Number(g.height) === 430) || bestOf(gridList.filter((g) => Number(g.width) > Number(g.height)));
    const icon = bestOf(Array.isArray(icons?.data) ? icons.data.filter((asset) => asset && asset.url) : []);
    const logo = bestOf(Array.isArray(logos?.data) ? logos.data.filter((asset) => asset && asset.url) : []);
    const hero = bestOf(Array.isArray(heroes?.data) ? heroes.data.filter((asset) => asset && asset.url) : []);
    const result = {
      title: String(game.name || gameName),
      icon: icon?.url || logo?.url,
      background: hero?.url,
      portrait: portrait?.url,
      landscape: landscape?.url,
      logo: logo?.url,
    };
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');
    } catch {}
    return result;
  } catch (err) {
    recordSteamGridDbFailure(err, 'artwork lookup');
    debug.log(`[get-images-for-game] ${gameName}: ${err.message}`);
    // A request that failed is not an answer, so it is not remembered as one.
    return null;
  }
  });
}

ipcMain.on('get-images-for-game', async (event, arg) => {
  // Always set returnValue for legacy sendSync callers.
  try {
    event.returnValue = await resolveImagesForGame(arg);
  } catch {
    event.returnValue = null;
  }
});
ipcMain.handle('get-images-for-game', (event, arg) => resolveImagesForGame(arg));

// Store artwork hosts, the only places this handler is ever pointed at.
const STYLIZE_IMAGE_HOSTS = new Set([
  'cdn1.epicgames.com',
  'cdn2.epicgames.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'media.rawg.io',
]);

ipcMain.on('stylize-background-for-appid', async (event, arg) => {
  try {
    const imageUrl = String((arg && arg.background) || '');
    // path.parse keeps a query string in the basename, and "?" is not a legal Windows filename: the
    // write failed every time, so the existsSync shortcut below never engaged either and the whole
    // fetch-and-blur ran again on every scan.
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== 'https:' || !STYLIZE_IMAGE_HOSTS.has(parsed.hostname)) return;

    const t = path.basename(parsed.pathname);
    // The appid names a folder, so it stays a plain id, like every other file-writing handler here.
    const appid = String((arg && arg.appid) || '').replace(/[^\w.-]/g, '_');
    if (!t || !appid) return;

    const outputPath = path.join(app.getPath('userData'), 'steam_cache', 'icon', appid, t);
    // The result is a file, and the same picture always blurs to the same thing: downloading and
    // re-blurring it on every scan cost a full image pipeline per game for a file already on disk.
    try {
      if (fs.existsSync(outputPath)) return;
    } catch {
      /* unreadable - fall through and rebuild it */
    }
    const sharp = require('sharp');

    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(SGDB_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    // Undici exposes arrayBuffer(), not node-fetch's buffer().
    const buffer = Buffer.from(await res.arrayBuffer());

    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;

    const processedBuffer = await sharp(buffer)
      .blur(5)
      .modulate({ saturation: 0.5 })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${width}" height="${height}">
              <rect width="100%" height="100%" fill="#3b65a7" fill-opacity="0.8"/>
              <rect width="100%" height="100%" fill="#000000" fill-opacity="0.4"/>
             </svg>`
          ),
          blend: 'over',
        },
      ])
      .toBuffer();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, processedBuffer);
  } catch (err) {
    debug.log(`[artwork] could not stylize the background: ${err.message || err}`);
  }
});

ipcMain.on('fetch-source-img', async (event, arg) => {
  switch (arg) {
    // Both labels each platform emits map to the same icon, so a caller passing the raw source
    // label gets the right art instead of silently falling through to the Steam default.
    case 'epic':
    case 'epic-official':
      event.returnValue = path.join(userData, 'Source', 'epic.svg');
      break;
    case 'gog':
    case 'GOG Galaxy':
      event.returnValue = path.join(userData, 'Source', 'gog.svg');
      break;
    case 'Goldberg SocialClub':
      event.returnValue = path.join(userData, 'Source', 'socialclub.svg');
      break;
    case 'ubisoft':
      event.returnValue = path.join(userData, 'Source', 'ubisoft.svg');
      break;
    case 'ea':
      event.returnValue = path.join(userData, 'Source', 'ea.svg');
      break;
    case 'RPCS3 Emulator':
    case 'ShadPS4 Emulator':
      event.returnValue = path.join(userData, 'Source', 'playstation.svg');
      break;
    case 'Xenia Emulator':
      event.returnValue = path.join(userData, 'Source', 'xbox.svg');
      break;
    case 'Unconfigured':
      // Use a generic icon for entries without a Steam appid.
      event.returnValue = path.join(__dirname, '../resources/img/file-text.png');
      break;
    case 'steam':
    default:
      event.returnValue = path.join(userData, 'Source', 'steam.svg');
      break;
  }
});

// ShellExecute (Start-Process), not spawn(): a detached Node child has no console handle, which
// crashes .NET GUI programs; also the EACCES fallback, ShellExecute elevates through UAC normally.
ipcMain.handle('launch-game-via-shell', async (event, { executable, args = '', workingDirectory = '', elevate = false } = {}) => {
  try {
    if (process.platform !== 'win32') {
      const error = await shell.openPath(String(executable || ''));
      if (error) throw new Error(error);
    } else {
      await launchViaWindowsShell({
        executable,
        args,
        workingDirectory: workingDirectory || path.dirname(String(executable || '')),
        elevate: elevate === true,
      });
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      // Declining the UAC prompt is a decision, not a fault - the caller must not report it as one.
      declined: isElevationDeclinedError(err),
    };
  }
});

/*
  "Delete game folder": the Recycle Bin first, a permanent delete only when the renderer comes back
  a second time with the choice made. It runs here rather than through remote.shell so the refusal
  is logged and inspected: Windows answers every recycle failure with one opaque line, and the file
  still open in the folder is what actually explains it. The safety gate is re-checked on this side
  because the path arrives from the renderer.
*/
ipcMain.handle('delete-game-folder', async (event, { dir, permanent = false } = {}) => {
  const uninstall = require(path.join(__dirname, '..', 'util', 'uninstall.js'));
  const { findRemovalBlocker } = require(path.join(__dirname, '..', 'util', 'folderRemoval.js'));
  const target = typeof dir === 'string' && dir ? path.resolve(dir) : '';
  if (!target || !uninstall.isSafeTrashTarget(target)) {
    debug.warn(`[uninstall] refused to delete ${target || '(empty path)'}: not a safe target`);
    return { ok: false, error: 'This folder is not a safe removal target.' };
  }
  try {
    if (permanent) await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    else await shell.trashItem(target);
    debug.log(`[uninstall] ${permanent ? 'deleted' : 'recycled'} ${target}`);
    return { ok: true };
  } catch (err) {
    const blocker = findRemovalBlocker(target);
    const reason = err && err.message ? err.message : String(err);
    debug.warn(
      `[uninstall] could not ${permanent ? 'delete' : 'recycle'} ${target} => ${reason}` +
        (blocker.busy ? ` (in use: ${blocker.busy})` : '') +
        (blocker.denied ? ` (access denied: ${blocker.denied})` : '')
    );
    return { ok: false, error: reason, busy: blocker.busy, denied: blocker.denied };
  }
});

/* Settings > Advanced > Diagnostics: zip every log file. Hand-copying is not enough, several
   processes keep their log streams open and appending, so read each once here for a consistent
   snapshot without stopping anything. */
ipcMain.handle('export-logs', async () => {
  try {
    const logArchive = require(path.join(__dirname, '..', 'util', 'logArchive.js'));
    const AdmZip = require('adm-zip');
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) return { ok: false, error: 'no-logs' };

    const res = await dialog.showSaveDialog(MainWin && !MainWin.isDestroyed() ? MainWin : undefined, {
      title: t('export-logs', 'Export logs', 'Exporter les journaux'),
      defaultPath: path.join(app.getPath('downloads'), logArchive.suggestedArchiveName(app.getVersion())),
      filters: [{ name: t('zip-archive', 'Zip archive', 'Archive zip'), extensions: ['zip'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    const summary = logArchive.exportLogs({
      logsDir,
      destination: res.filePath,
      Zip: AdmZip,
      meta: {
        appVersion: app.getVersion(),
        versions: process.versions,
        platform: process.platform,
        release: os.release(),
      },
    });
    return { ok: true, path: summary.destination, count: summary.files.length, skipped: summary.skipped.length };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('get-achievements', async (event, appid) => {
  return await getSteamData({ appid, type: 'steamhunters' });
});

// Manual update checks reuse the automatic prompt and notification flow.
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { ok: false, error: 'dev-build' };
  if (updatePromptOpen) return { ok: false, error: 'prompt-open' };
  // A download is already running from an earlier "Download && Install": calling checkForUpdates()
  // again while electron-updater is mid-download re-fires update-available and stacks a second
  // downloadUpdate() on top of it, which is what corrupted the in-progress download.
  if (updateDownloading) return { ok: false, error: 'download-in-progress' };
  manualUpdateCheckPending = true;
  manualUpdateResult = null;
  updaterErrorNotified = false; // let a still-failing check re-notify even if it already did once
  // A manual check overrides a previous "later" choice.
  await clearUpdatePostpone();
  try {
    await getUpdater().checkForUpdates();
    // Give update events a short window to report the result.
    for (let i = 0; i < 20 && manualUpdateResult === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return { ok: true, status: manualUpdateResult || 'unknown' };
  } catch (err) {
    notifyUpdateError(err && err.message ? err.message : String(err));
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

/* Current updater state for a window that just loaded: the broadcast alone is not enough, a download
   can finish while the app sat in the tray with nobody listening yet. */
ipcMain.handle('get-update-status', () => currentUpdateStatus);

// Stop a download in flight. Answers whether there was one, so the UI can drop a Cancel button that
// raced the download finishing instead of leaving it there doing nothing.
ipcMain.handle('cancel-update-download', () => ({ ok: cancelUpdateDownload() }));

// Settings > Advanced: clears every disposable cache the app knows (updater download cache, plus
// the re-fetchable Steam/Ubisoft schema, icon and emulator-tool caches - see the explicit allowlist
// in util/clearableCaches.js). Never touches settings, GBE backups, notification presets, theme
// images, or the Uplay R2 loader cache (no public source to re-download it from).
ipcMain.handle('clear-update-cache', async (event) => {
  if (updateDownloading || checksumRetryInFlight) return { ok: false, error: 'download-in-progress' };
  const result = { ok: true, error: null, updateFolder: null, updateCleared: false, updateError: null, clearedCaches: [] };
  try {
    const helper = await getUpdater().getOrCreateDownloadHelper();
    const cacheDir = helper.cacheDir;
    let hadContents = false;
    try {
      const entries = await fs.promises.readdir(cacheDir);
      hadContents = entries.length > 0;
    } catch {
      hadContents = false; // the folder simply doesn't exist yet
    }
    await clearUpdaterCacheDir();
    result.updateFolder = cacheDir;
    result.updateCleared = hadContents;
  } catch (err) {
    // Non-fatal: still clear the other app caches even if the updater cache path could not be
    // resolved (e.g. a dev build missing dev-app-update.yml).
    debug.log(`[updater] could not clear the update cache: ${err.message || err}`);
    result.updateError = err && err.message ? err.message : String(err);
    result.updateCleared = false;
    result.ok = false;
    result.error = 'update-cache-clear-failed';
  }
  try {
    result.clearedCaches = await clearSafeCaches(userData);
  } catch (err) {
    debug.log(`[cache] could not clear app caches: ${err.message || err}`);
    result.ok = false;
    result.error = err && err.message ? err.message : String(err);
  }
  resetArtworkLookupCaches();
  try {
    event.sender.send('artwork-caches-cleared');
  } catch {
    /* the renderer may have closed while the cache clear was finishing */
  }
  return result;
});

/*
  Connecting an Epic, Steam or Xbox account is a leaf too: sign-in windows and the status handlers
  behind them, with nothing here calling back into them. accounts.js gets the main window and the
  config as getters, since a sign-in can be started from the tray with no window open at all.
*/
require('./accounts.js').register({
  userData,
  debug,
  t,
  appSecret,
  getConfig: () => configJS,
  getMainWindow: () => MainWin,
});

// Kill any Watchdog holding WS port 8082: a crash of this app can leave an orphaned Watchdog behind
// (it outlives its parent on Windows), so sweep by the well-known port once before the first launch.
/*
  Asynchronous on purpose. netstat has taken well over a second on this machine, and running it
  synchronously froze the main process at exactly the moment the renderer was loading: every
  synchronous IPC the renderer makes on its way up (its user-data path, the app name) waits on this
  thread, so a slow sweep showed up as a slow window with nothing in any log to say why.
*/
function killWatchdog() {
  return new Promise((resolve) => {
    execFile('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true }, (err, out) => {
      if (err) {
        debug.log(`[watchdog] killWatchdog failed: ${err.message}`);
        return resolve();
      }
      sweepStaleWatchdogs(String(out));
      resolve();
    });
  });
}

function sweepStaleWatchdogs(out) {
  try {
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (line.includes(':8082') && /LISTENING/i.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
    }
    for (const pid of pids) {
      try {
        execFileSync('taskkill.exe', ['/F', '/PID', pid], { windowsHide: true, stdio: 'ignore' });
        debug.log(`[watchdog] killed stale instance PID ${pid} on port 8082`);
      } catch {}
    }
  } catch (err) {
    debug.log(`[watchdog] stale sweep failed: ${err.message}`);
  }
}

// Supervise the Watchdog monitor: we re-launch this executable in ELECTRON_RUN_AS_NODE mode with an
// 'ipc' channel (koffi native deps are ABI-stable), forward its overlay/notification requests here,
// and re-spawn it on unexpected exit.
let monitorProc = null;
let monitorRespawnTimer = null;
let watchdogStatusInterval = null;
let monitorRespawnDelay = 3000;
let watchdogSwept = false;
let monitorStartedAt = 0;
let monitorHeartbeatAt = 0;

// What to show on the title-bar indicator. Null means "no supervised child to speak for" (a dev
// run, or the gap between a crash and its respawn) and the caller falls back to the named-pipe
// probe. See util/watchdogState.js for why the heartbeat beats the probe when we do have a child.
function getWatchdogState() {
  return deriveWatchdogState({
    alive: Boolean(monitorProc && monitorProc.exitCode === null && !monitorProc.killed),
    startedAt: monitorStartedAt,
    heartbeatAt: monitorHeartbeatAt,
  });
}

// Route a monitor IPC message. It sends { argv: ['--wintype=overlay'|'notification', ...] } in place
// of the legacy `Achievement Watcher.exe --wintype=...` spawn; feed it through the existing dispatch.
function handleMonitorMessage(msg) {
  try {
    // Checked first: this is by far the most frequent message, and it must be recorded even while
    // something below it would throw.
    if (msg && msg.heartbeat) {
      monitorHeartbeatAt = Date.now();
      noteMonitorSubsystems(msg.heartbeat.failed);
      return;
    }
    if (msg && Array.isArray(msg.argv)) parseArgs(minimist(msg.argv));
    else if (msg && msg.overlayControl) handleOverlayControl(msg.overlayControl.action, msg.overlayControl.payload);
    else if (msg && msg.registerOverlayHotkey) registerOverlayHotkey(msg.registerOverlayHotkey.hotkey);
    else if (msg && msg.gameActivity) setGameActivity(msg.gameActivity.count);
    else if (msg && msg.artworkPrefetch) prefetchSquareGameLogo(msg.artworkPrefetch);
  } catch (err) {
    debug.log(`[monitor] message handling failed: ${err.message || err}`);
  }
}

/* Resolve a game's square logo while it starts, not while its notification is on screen: the answer
   lands in the same cache both transports read, so the unlock/playtime card paints it instantly. */
// Bounded for the same reason: one entry per distinct game started, for as long as the daemon runs.
// It only exists to skip a repeat prefetch, so an evicted key costs one extra cached lookup.
const SQUARE_LOGO_PREFETCH_CAP = 300;
const squareLogoPrefetched = new Set();
async function prefetchSquareGameLogo(request) {
  const appid = String((request && request.appid) || '').trim();
  const libraryAppid = String((request && request.libraryAppid) || '').trim();
  const name = String((request && request.name) || '').trim();
  if (!appid && !name) return;
  const key = `${appid}\0${name.toLowerCase()}`;
  if (squareLogoPrefetched.has(key)) return;
  squareLogoPrefetched.add(key);
  while (squareLogoPrefetched.size > SQUARE_LOGO_PREFETCH_CAP) {
    squareLogoPrefetched.delete(squareLogoPrefetched.values().next().value);
  }
  try {
    const icon = await fetchSteamGridDbIcon(name, appid);
    if (icon && icon.url) await fetchSteamIcon(icon.url, appid);
  } catch (err) {
    debug.log(`[artwork] square logo prefetch failed for "${name || appid}": ${err.message || err}`);
  }
  /* Also extract the executable's own icon while starting: the Watchdog has no PE reader, so the
     file must already be in the shared cache before the first toast is due. */
  try {
    const executable = configuredExecutable(libraryAppid, appid);
    if (executable) await fetchExecutableIcon(executable, appid);
  } catch (err) {
    debug.log(`[artwork] executable icon prefetch failed for "${name || appid}": ${err.message || err}`);
  }
}

/* Tell the monitor what became of an overlay notification it asked for (it cannot see this window).
   Two stages: 'accepted' (renderable, sent before artwork fetch) and 'rendered' (window actually
   loaded, or not). See watchdog/notification/overlayAck.js. */
function reportNotificationOutcome(id, stage, ok, reason = '') {
  if (!id) return;
  if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return;
  try {
    monitorProc.send({ notificationResult: { id: String(id), stage, ok: ok === true, reason } });
  } catch (err) {
    debug.log(`[monitor] notification outcome report failed: ${err.message || err}`);
  }
}

// Tell the monitor whether the overlay is on screen: it owns the hotkey flag, so a change it did not
// initiate must be reported from the window's own lifecycle events (redundant sends are dropped).
function notifyMonitorOverlayState(opened) {
  if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return;
  try {
    monitorProc.send({ overlayState: { opened: opened === true } });
  } catch (err) {
    debug.log(`[monitor] overlay state sync failed: ${err.message || err}`);
  }
}

// Frees the resident working set (measured 211 MB) idle Chromium keeps until Windows reclaims it.
// Not on a timer, repeated trims thrash; fires once per idle transition with a cooldown.
const IDLE_TRIM_DELAY_MS = 5000;
const IDLE_TRIM_MIN_INTERVAL_MS = 2 * 60 * 1000;
let idleTrimTimer = null;
let lastIdleTrimAt = 0;

function scheduleIdleTrim(reason) {
  if (idleTrimTimer) return;
  if (Date.now() - lastIdleTrimAt < IDLE_TRIM_MIN_INTERVAL_MS) return;
  idleTrimTimer = setTimeout(() => {
    idleTrimTimer = null;
    // Anything back on screen means the pages are in use again; leave them alone.
    if (MainWin || overlayVisible) return;
    if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return;
    lastIdleTrimAt = Date.now();
    try {
      // getAppMetrics is the only complete list of this app's Chromium processes (GPU, network,
      // utility); the Watchdog is this process's child and knows its own pid.
      const pids = app.getAppMetrics().map((metric) => metric.pid);
      monitorProc.send({ trimWorkingSets: { pids, reason } });
    } catch (err) {
      debug.log(`[memory] idle trim request failed: ${err.message || err}`);
    }
  }, IDLE_TRIM_DELAY_MS);
  if (typeof idleTrimTimer.unref === 'function') idleTrimTimer.unref();
}

// The overlay hotkey was pressed. The Watchdog decides what it means (which game is running, whether
// the overlay is already up), so this only reports the press.
function notifyMonitorOverlayHotkey() {
  if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return;
  try {
    monitorProc.send({ overlayHotkeyPressed: true });
  } catch (err) {
    debug.log(`[monitor] overlay hotkey press could not be delivered: ${err.message || err}`);
  }
}

// Schedule the supervised respawn with an exponential backoff (3s -> 6s -> 12s -> ... -> 60s cap)
// so a monitor that crashes in a loop (bad code, missing native module, config corruption) does not
// hammer the machine every three seconds. The backoff resets once a child survives 30 seconds.
/*
  A beating heart only proves the monitor's event loop turns. A watcher that failed to start leaves
  it running and tracking less than it should, which used to be visible only in the monitor's own
  log. Reported here once per change, not once per beat.
*/
let lastMonitorFailures = '';
function noteMonitorSubsystems(failed) {
  const list = Array.isArray(failed) ? failed : [];
  const key = list.map((entry) => `${entry && entry.name}:${(entry && entry.detail) || ''}`).join('|');
  if (key === lastMonitorFailures) return;
  lastMonitorFailures = key;
  if (list.length === 0) {
    debug.log('[monitor] every subsystem is running');
    return;
  }
  for (const entry of list) debug.log(`[monitor] subsystem "${entry && entry.name}" is not running: ${(entry && entry.detail) || 'unknown reason'}`);
}

function scheduleMonitorRespawn() {
  if (app.isQuiting || monitorRespawnTimer) return;
  const delay = monitorRespawnDelay;
  monitorRespawnDelay = Math.min(monitorRespawnDelay * 2, 60000);
  monitorRespawnTimer = setTimeout(() => {
    monitorRespawnTimer = null;
    launchWatchdog();
  }, delay);
  debug.log(`[monitor] respawn scheduled in ${delay}ms`);
}

// The main window is usually not created yet when this first runs (createMainWindow() runs after
// launchWatchdog() on a fresh start), so callers must not assume a non-null result means "no window".
function getRendererPid() {
  try {
    if (MainWin && !MainWin.isDestroyed() && MainWin.webContents && !MainWin.webContents.isDestroyed()) {
      const rendererPid = MainWin.webContents.getOSProcessId();
      if (Number.isInteger(rendererPid) && rendererPid > 0) return rendererPid;
    }
  } catch {}
  return null;
}

// Covers the gap AW_APP_PIDS cannot: on a fresh launch the watchdog reads its env before
// createMainWindow() gives the renderer its OS PID, so the Escape-to-game safeguard needs this too.
function notifyWatchdogOfAppPid() {
  const rendererPid = getRendererPid();
  if (!rendererPid) return;
  if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return;
  try {
    monitorProc.send({ appPid: rendererPid });
  } catch {}
}

function launchWatchdog() {
  // Must clearTimeout AND null the handle: scheduleMonitorRespawn() treats a non-null
  // monitorRespawnTimer as already pending and bails, so a stale handle would silently disable respawn.
  clearTimeout(monitorRespawnTimer);
  monitorRespawnTimer = null;
  if (monitorProc && monitorProc.exitCode === null && !monitorProc.killed) {
    return { ok: true }; // already running - idempotent
  }

  const baseDir = manifest.config.debug ? path.join(__dirname, '../../') : path.dirname(process.execPath);
  const wdDir = path.join(baseDir, 'watchdog');

  // Validate the launch chain up front. Missing pieces (notably watchdog/node_modules) would
  // otherwise fail in ways that are hard to diagnose from a detached child.
  const requiredPaths = {
    'watchdog dir': wdDir,
    'watchdog/node_modules': path.join(wdDir, 'node_modules'),
  };
  for (const [label, p] of Object.entries(requiredPaths)) {
    if (!fs.existsSync(p)) {
      debug.log(`[monitor] Cannot launch: missing ${label} at ${p}`);
      return { ok: false, error: `missing ${label}` };
    }
  }

  // Run the monitor under Electron's own Node (ELECTRON_RUN_AS_NODE; replaces the bundled node.exe),
  // with a 128 MB V8 ceiling - the watchdog is a lightweight event-driven process.
  const nodeOpts = [process.env.NODE_OPTIONS, '--max-old-space-size=128'].filter(Boolean).join(' ');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_OPTIONS: nodeOpts,
    AW_USER_DATA: userData,
    // The installation key, so the Watchdog can read the Xbox auth file the app wrote. Passed on
    // this spawn only - see appSecret() for why it is not in the ambient environment.
    AW_SECRET: appSecret(),
    // Where the bundled notification sounds live, so the Watchdog's Windows toasts play the
    // same sound files as the in-game overlay (user-imported sounds are under <userData>/sounds).
    AW_SOUNDS_DIR: path.join(__dirname, '../sounds'),
    // Toasts should appear under AW's own identity, not a borrowed Xbox app id. Registered by the
    // installer's shortcut; the Watchdog falls back to legacy ids when unregistered (dev runs).
    AW_AUMID: manifest.config.appid || '',
    // URI scheme a toast click activates. Empty when registration failed (or in a dev run), in
    // which case the Watchdog omits the activation instead of emitting one that goes nowhere.
    AW_TOAST_PROTOCOL: toastProtocolReady ? TOAST_PROTOCOL : '',
    // Lets the Watchdog's Escape-on-overlay-open helper avoid injecting input into AW's own window.
    // MainWin may not exist yet on a fresh launch; notifyWatchdogOfAppPid() covers that gap.
    AW_APP_PIDS: [String(process.pid), getRendererPid()]
      .filter(Boolean)
      .join(','),
  };

  try {
    const child = spawn(process.execPath, ['watchdog.js'], {
      cwd: wdDir,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], // 'ipc' => process.send()/'message' in the child
    });
    monitorProc = child;
    // Reset before any beat can arrive: a stale timestamp from the previous child would make a
    // freshly spawned monitor look instantly healthy (or instantly wedged).
    monitorStartedAt = Date.now();
    monitorHeartbeatAt = 0;
    // Same reason: a replacement monitor must report its own subsystems, not inherit the last one's.
    lastMonitorFailures = '';
    child.stdout?.on('data', (d) => debug.log(`[monitor] ${String(d).trimEnd()}`));
    child.stderr?.on('data', (d) => debug.log(`[monitor:err] ${String(d).trimEnd()}`));
    child.on('message', handleMonitorMessage);
    child.on('error', (err) => {
      // spawn failure emits 'error' but not 'exit'; without clearing it, the stale monitorProc would
      // report "already running" forever and the monitor would stay dead for the session.
      debug.log(`[monitor] spawn error: ${err.message}`);
      if (monitorProc === child) monitorProc = null;
      unregisterOverlayHotkey();
      // Only the monitor can tell us a game ended. If it dies mid-session the count would stay
      // above zero forever and updates would never be offered again.
      setGameActivity(0);
      scheduleMonitorRespawn();
    });
    child.on('exit', (code, signal) => {
      debug.log(`[monitor] exited code=${code}${signal ? ` signal=${signal}` : ''}`);
      const wasCurrent = monitorProc === child;
      if (wasCurrent) monitorProc = null; // only clear if still the current child
      if (wasCurrent) setGameActivity(0); // see the spawn-error handler above
      // Nothing is left to act on the overlay shortcut, and a combination this app holds is one no
      // other application can use. The respawned monitor asks for it again on its settings load.
      if (wasCurrent) unregisterOverlayHotkey();
      if (wasCurrent) scheduleMonitorRespawn(); // manual restarts take over their own relaunch
    });
    // Backoff reset: if this child survives 30s the crash loop is likely over.
    const stableTimer = setTimeout(() => {
      if (!app.isQuiting) monitorRespawnDelay = 3000;
    }, 30000);
    child.once('exit', () => clearTimeout(stableTimer));
    child.once('error', () => clearTimeout(stableTimer));
    debug.log('[monitor] launched (node.exe watchdog.js, ipc channel)');
    return { ok: true };
  } catch (err) {
    debug.log(`[monitor] exception launching: ${err.message}`);
    scheduleMonitorRespawn();
    return { ok: false, error: err.message };
  }
}

// Manual restart (Settings button or tray menu): kill the current child then relaunch so it always
// loads the current code. We wait for the child's actual 'exit' (port 8082 is then free) instead of
// a fixed sleep, with a safety fallback in case the exit event is lost.
function restartWatchdog() {
  monitorRespawnDelay = 3000;
  const child = monitorProc;
  monitorProc = null;
  if (!child || child.exitCode !== null || child.killed) return launchWatchdog();
  const fallback = setTimeout(() => launchWatchdog(), 5000);
  child.once('exit', () => {
    clearTimeout(fallback);
    launchWatchdog();
  });
  try {
    child.kill();
  } catch {
    clearTimeout(fallback);
    return launchWatchdog();
  }
  return { ok: true };
}

ipcMain.handle('start-watchdog', async (event) => {
  event.sender.send('reset-watchdog-status');
  return restartWatchdog();
});

// The renderer re-seeds cfg/gameIndex.json at scan end; ask the Watchdog to reload it so new non-Steam
// games are tracked without a restart (no-op when it's down). A reset game's unlock baseline lives in
// the monitor's memory too, so deleting the file is not enough, ask it to drop the game explicitly.
ipcMain.handle('watchdog-forget-achievement-baseline', (event, appid) => {
  if (!appid) return false;
  if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return false;
  try {
    monitorProc.send({ forgetAchievementBaseline: { appid: String(appid) } });
    return true;
  } catch (err) {
    debug.log(`[monitor] achievement baseline reset request failed: ${err.message}`);
    return false;
  }
});

ipcMain.handle('watchdog-reload-playtime-index', () => {
  if (!monitorProc || monitorProc.exitCode !== null || monitorProc.killed || !monitorProc.connected) return false;
  try {
    monitorProc.send({ reloadPlaytimeIndex: true });
    return true;
  } catch (err) {
    debug.log(`[monitor] playtime index reload request failed: ${err.message}`);
    return false;
  }
});

// Background emulator auto-fix: while the window is closed, periodically apply the same one-shot
// fix the UI scan does (gated by emulator.autoApplyNewGames), toasting each game actually fixed.
let bgAutoFixTimer = null;
let bgAutoFixInFlight = false;
let bgKnownAppids = null; // baseline of discovered appids; null until the first full pass seeds it
// Mirror of the renderer's unrenderable-appid memory (see seedNewGameScanBaseline in app.js): an
// appid discovery keeps finding but makeList never returns must not re-trigger a scan every poll.
const BG_UNRENDERABLE_MISS_LIMIT = 2;
const bgUnrenderableAppids = new Map();

function recordBackgroundScanMisses(discoveredIds, renderedList) {
  if (!Array.isArray(renderedList)) return;
  const rendered = new Set(renderedList.map((game) => String(game && game.appid)));
  for (const id of discoveredIds) {
    const key = String(id);
    if (rendered.has(key)) bgUnrenderableAppids.delete(key);
    else bgUnrenderableAppids.set(key, (bgUnrenderableAppids.get(key) || 0) + 1);
  }
}
const BG_AUTOFIX_INTERVAL_MS = 15 * 60 * 1000;
const BG_AUTOFIX_FULL_EVERY_TICKS = 4; // ~1 hour
let bgAutoFixTicks = 0;
// Safety valve: "game running" can be a background Steam app mistaken for one (DSX, Wallpaper
// Engine) until blacklisted, which would otherwise suspend the scan forever. Caps that cost.
const BG_AUTOFIX_MAX_HELD_TICKS = 8;
let bgAutoFixHeldTicks = 0;

function notifyEmulatorFixed(game) {
  try {
    if (configJS && configJS.notification && configJS.notification.notify === false) return; // master notif switch
    if (!Notification.isSupported || !Notification.isSupported()) return;
    const name = (game && game.name) || `AppID ${game && game.appid}`;
    new Notification({
      title: t('emulator-fix-applied', 'Emulator fix applied', 'Correctif émulateur appliqué'),
      body: t('x-is-ready-achievements-enabled', '{name} is ready - achievements enabled.', '{name} est prêt - succès activés.', { name }),
      icon: path.join(__dirname, '../resources/icon/icon.png'),
    }).show();
    debug.log(`[bg-autofix] toast: emulator fix applied for ${name}`);
  } catch (err) {
    debug.log(`[bg-autofix] notify failed: ${err.message || err}`);
  }
}

async function runBackgroundAutoFix(reason) {
  if (MainWin) return; // window open → the renderer's own new-game scan handles fixes
  // Not while playing: this is the heaviest background task (achievement engine + every fourth tick
  // walking library/db/registry), and the game owns the frame budget.
  if (isGameRunning() && bgAutoFixHeldTicks < BG_AUTOFIX_MAX_HELD_TICKS) {
    bgAutoFixHeldTicks += 1;
    debug.log(`[bg-autofix] a game is running - holding the ${reason} scan (${bgAutoFixHeldTicks}/${BG_AUTOFIX_MAX_HELD_TICKS})`);
    return;
  }
  if (bgAutoFixHeldTicks >= BG_AUTOFIX_MAX_HELD_TICKS) {
    debug.log(`[bg-autofix] held for ${bgAutoFixHeldTicks} ticks - scanning anyway`);
  }
  bgAutoFixHeldTicks = 0;
  if (bgAutoFixInFlight) return;
  try {
    await startEngines(); // loads configJS
  } catch (err) {
    debug.log(`[bg-autofix] startEngines failed: ${err.message || err}`);
    return;
  }
  if (!configJS || !configJS.emulator || configJS.emulator.autoApplyNewGames === false) return;
  bgAutoFixInFlight = true;
  try {
    // Once a baseline exists, do a cheap discovery-only poll first and run the heavier full scan only
    // when a genuinely new install appears (mirrors the renderer's runNewGameScan).
    if (bgKnownAppids !== null) {
      // Same cheap pre-check as the renderer's poll: stat the folders the last scan read instead of
      // walking them again. A full pass still runs every few hours for the database/registry sources.
      bgAutoFixTicks += 1;
      if (bgAutoFixTicks % BG_AUTOFIX_FULL_EVERY_TICKS !== 0 && getAchievements().discoveryInputsUnchanged?.()) return;
      const discovered = await getAchievements().detectInstalledAppids(configJS);
      const fresh = discovered.filter(
        (id) => !bgKnownAppids.has(String(id)) && (bgUnrenderableAppids.get(String(id)) || 0) < BG_UNRENDERABLE_MISS_LIMIT
      );
      bgKnownAppids = new Set(discovered.map(String));
      if (fresh.length === 0) return;
      debug.log(`[bg-autofix] ${fresh.length} new install(s) detected: ${fresh.join(', ')}`);
    }
    if (MainWin) return; // user opened the window during the poll - defer to the renderer
    debug.log(`[bg-autofix] running headless scan (${reason})`);
    // makeList drives the same one-shot auto-fix as the UI scan, but per-game emulator setup runs in
    // the background after makeList returns; the toast fires from setEmulatorFixedHandler, not onGame.
    const scanned = await getAchievements().makeList(configJS, () => {}, () => {});
    try {
      const all = await getAchievements().detectInstalledAppids(configJS);
      bgKnownAppids = new Set(all.map(String));
      recordBackgroundScanMisses(all, scanned);
    } catch {}
    debug.log(`[bg-autofix] done - background emulator setup (if any) will toast on completion`);
  } catch (err) {
    debug.log(`[bg-autofix] failed: ${err.message || err}`);
  } finally {
    bgAutoFixInFlight = false;
  }
}

function scheduleBackgroundAutoFix() {
  if (bgAutoFixTimer) return;
  // Initial pass shortly after startup (catches games installed while AW was off / closed), then a
  // periodic poll on the same cadence the renderer uses.
  setTimeout(() => runBackgroundAutoFix('startup'), 90 * 1000);
  bgAutoFixTimer = setInterval(() => runBackgroundAutoFix('interval'), BG_AUTOFIX_INTERVAL_MS);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Edge ships with Windows 10/11 and is Chromium-based, so puppeteer can drive it exactly like Chrome
// (stealth plugin works at the CDP layer). Using it as fallback avoids bundling a second browser.
function findInstalledEdge() {
  if (process.platform !== 'win32') return null;
  const roots = [process.env['ProgramFiles(x86)'], process.env['ProgramFiles'], 'C:\\Program Files (x86)', 'C:\\Program Files'];
  for (const root of roots) {
    if (!root) continue;
    const p = path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/*
  Once per session: when no installed browser can be launched at all, every later browser-backed
  lookup is going to fail the same way. Without this flag each game re-ran the whole launch attempt
  (~20s of dead wait each) before falling through to the cheaper sources - four in a row is what a
  user's log showed while their covers stayed blank. Reset only by restarting the app, which is also
  when a broken Chrome/Edge install would realistically have been repaired.
*/
let browserLaunchFailed = false;
let stealthRegistered = false;

async function startPuppeteer(headless, strip) {
  if (browserLaunchFailed && !puppeteerWindow.browser) throw new Error('No usable browser this session (a previous launch failed).');
  const puppeteer = require('puppeteer-extra');
  // puppeteer-extra's use() has no dedupe: registering here on every call stacked another
  // StealthPlugin (~17 evasions each) onto the module singleton, so every new page re-ran the whole
  // set once per past call and multiplied the plugin's own console noise by the same factor.
  if (!stealthRegistered) {
    puppeteer.use(require('puppeteer-extra-plugin-stealth')());
    stealthRegistered = true;
  }
  const ChromeLauncher = require('chrome-launcher');
  // Picked per-platform: getInstallations()[0] may be undefined when Chrome is not installed.
  const installedChromePath =
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : ChromeLauncher.Launcher.getInstallations()[0];
  // Browser preference: installed Chrome, then Edge (included with supported Windows versions).
  const browserPaths = [installedChromePath, findInstalledEdge()].filter(
    (browserPath, index, paths) => browserPath && fs.existsSync(browserPath) && paths.indexOf(browserPath) === index
  );
  // --no-first-run / --no-default-browser-check matter for Edge above all: without them the browser's
  // first-run experience exits the process we are waiting on (bare "Code: 0" failure).
  const launchArgs = [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (!puppeteerWindow.browser) {
    if (browserPaths.length === 0) throw new Error('Steam scraping requires Google Chrome or Microsoft Edge.');
    let lastError;
    for (const executablePath of browserPaths) {
      try {
        puppeteerWindow.browser = await puppeteer.launch({ headless: Boolean(headless), executablePath, args: launchArgs });
        break;
      } catch (err) {
        lastError = err;
        debug.log(`puppeteer: browser launch failed for ${executablePath} (${err.message})`);
      }
    }
    if (!puppeteerWindow.browser) {
      browserLaunchFailed = true;
      throw lastError;
    }
  }
  if (!puppeteerWindow.context) puppeteerWindow.context = await puppeteerWindow.browser.createBrowserContext();
  if (!puppeteerWindow.pagesh) {
    puppeteerWindow.pagesh = await puppeteerWindow.context.newPage();
    if (strip) {
      const page = puppeteerWindow.pagesh;
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });
    }
  }
}

async function scrapeWithPuppeteer(info = { appid: 269770 }, alternate) {
  // The browser fallback is the slowest path there is (~10s per game). When the plain-HTTP chain has
  // already proven the host unreachable, there is nothing left for it to find.
  if (steamTransportUnavailable()) {
    debug.log(`[${info.appid}] skipping the browser fallback - Steam hosts are unreachable`);
    return;
  }
  return withScrapeLease(currentlyscraping, alternate, async () => {
    await startPuppeteer(alternate, alternate?.steamhunters);
    try {
      if (alternate) {
        if (alternate.steamhunters) {
          if (alternate.userlist) {
            const url = `https://steamhunters.com/apps/${info.appid}/users?sort=completionstate`;
            const page = puppeteerWindow.pagesh;
            try {
              await page.goto(url);
              await page.waitForFunction(() => {
                return Array.from(document.querySelectorAll('script')).some((s) => s.textContent.includes('var sh'));
              });
              await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script'));
                const target = scripts.find((s) => s.textContent.includes('var sh'));
                // oxlint-disable-next-line no-eval -- runs in the scraped page, not in Node: the payload is the page own inline script.
                eval(target.textContent);
              });
              const users = (await page.evaluate(() => sh.model.listData.pagedList.items)) || [];

              const results = [];
              users.forEach((item) => {
                results.push({
                  id: item.steamId,
                  isPublic: item.privacyState === 0,
                });
              });
              info.users = users;
              recordSteamTransportSuccess();
            } catch (e) {
              recordSteamTransportFailure(e);
              debug.log(e);
            }
            return;
          }
          let start = Date.now();
          const url = `https://steamhunters.com/apps/${info.appid}/achievements?group=&sort=name`;
          const page = puppeteerWindow.pagesh;
          try {
            await page.goto(url);
            await page.waitForFunction(() => {
              return Array.from(document.querySelectorAll('script')).some((s) => s.textContent.includes('var sh'));
            });
            await page.evaluate(() => {
              const scripts = Array.from(document.querySelectorAll('script'));
              const target = scripts.find((s) => s.textContent.includes('var sh'));
              // oxlint-disable-next-line no-eval -- runs in the scraped page, not in Node: the payload is the page own inline script.
              eval(target.textContent);
            });
            const achievements = (await page.evaluate(() => sh.model.listData.pagedList.items)) || [];

            const results = [];
            achievements.forEach((item) => {
              results.push({
                name: item.apiName,
                default_value: 0,
                displayName: item.name,
                hidden: item.hidden ? 1 : 0,
                description: item.description || ' ',
                icon: item.icon,
                icongray: item.iconGray,
              });
            });
            info.achievements = results;
            recordSteamTransportSuccess();
            debug.log(`[${info.appid}] steamhunters took ${(Date.now() - start) / 1000}s`);
          } catch (e) {
            recordSteamTransportFailure(e);
            debug.log(e);
          }
          return;
        }

        // Every caller goes through the steamhunters paths above; the steamcommunity schema uses a
        // plain HTTP fetch instead, see fetchSteamCommunityAchievements.
      }
    } catch (err) {
      debug.log(err);
    }
  }, delay);
}

// Drop payloads a SteamDB/HTML scrape never reads (video, fonts, optionally images): the shared
// SteamHunters page does this via startPuppeteer(strip); on-demand SteamDB pages need it too.
async function blockHeavyResources(page, { keepImages = false } = {}) {
  const blockedTypes = new Set(['media', 'font', 'stylesheet']);
  if (!keepImages) blockedTypes.add('image');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (blockedTypes.has(req.resourceType()) || /\.(mp4|webm|gif|woff2?|ttf|otf)(\?|$)/i.test(req.url())) req.abort();
    else req.continue();
  });
}

// Modern Steam covers live under a hashed path that cannot be derived from the appid; SteamDB's
// app-info page lists the real links (stealth browser, it 403s plain requests), cached 30 days and
// serialized through one queue so a cold scan never opens N parallel browser pages.
const steamdbCoversDir = path.join(userData, 'steam_cache', 'steamdb_covers');
const steamdbCoversInFlight = new Map();
let steamdbCoversQueue = Promise.resolve();
let artworkCacheGeneration = 0;

/* A miss (no library asset) costs the full waitForSelector timeout, so it is cached too, on a shorter
   TTL since a game CAN gain a capsule. Offline is covered by the breaker below instead of opening a
   page per game to prove the host is unreachable. */
const STEAMDB_COVERS_TTL = 30 * 24 * 60 * 60 * 1000;
const STEAMDB_COVERS_MISS_TTL = 7 * 24 * 60 * 60 * 1000;
const STEAMDB_COVERS_COOLDOWN_MS = 5 * 60 * 1000;
const steamdbCoversCircuit = createNetworkCircuit({
  failureLimit: 2,
  cooldownMs: STEAMDB_COVERS_COOLDOWN_MS,
  shouldCount: isSteamTransportFailure,
});

function filterSteamDbCoversByOrientation(urls, orientation) {
  const list = Array.isArray(urls) ? urls : [];
  if (String(orientation || '').toLowerCase() === 'landscape') {
    const wide = list.filter((url) => /library_capsule/i.test(url));
    return wide.length ? wide : list;
  }
  const tall = list.filter((url) => /library_600x900/i.test(url));
  return tall.length ? tall : list;
}

/* Everything one SteamDB page says about artwork: `urls` (library covers) and `icons` (community
   image), from one scrape (the visit is the whole cost). `needIcons` decides whether a covers-only
   cached entry is worth re-scraping; a cover caller never pays for that. */
async function fetchSteamDbAssets(appid, { needIcons = false } = {}) {
  const empty = { urls: [], icons: [] };
  const id = String(appid || '').trim();
  if (!/^\d+$/.test(id)) return empty;
  const generation = artworkCacheGeneration;
  const cacheFile = path.join(steamdbCoversDir, `${id}.json`);
  // Asynchronous on purpose: the library scan asks this once per game, and existsSync + readFileSync
  // + statSync are three blocking calls each on the same thread that is painting the window.
  try {
    const [raw, stats] = await Promise.all([fs.promises.readFile(cacheFile, 'utf8'), fs.promises.stat(cacheFile)]);
    const cached = JSON.parse(raw);
    if (Array.isArray(cached.urls) && (!needIcons || Array.isArray(cached.icons))) {
      const ttl = cached.urls.length ? STEAMDB_COVERS_TTL : STEAMDB_COVERS_MISS_TTL;
      if (Date.now() - stats.mtimeMs < ttl) {
        return { urls: cached.urls, icons: Array.isArray(cached.icons) ? cached.icons : [] };
      }
    }
  } catch {
    /* missing, stale or corrupt -> refetch */
  }
  if (steamdbCoversInFlight.has(id)) return steamdbCoversInFlight.get(id);
  // The host proved itself unreachable moments ago; do not open a page per game to prove it again.
  if (steamdbCoversCircuit.unavailable()) return empty;

  const scrape = async () => {
    const steamdbCover = require(path.join(app.getAppPath(), 'parser/steamdbCover.js'));
    let page = null;
    const releasePage = await acquirePuppeteerSlot();
    try {
      await startPuppeteer(true, false);
      page = await puppeteerWindow.context.newPage();
      await blockHeavyResources(page);
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'
      );
      await page.goto(`https://steamdb.info/app/${id}/info/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // The assets table is server-rendered, resolving immediately when present. The timeout is paid
      // in full only by a game that has none, and only once now that misses are cached.
      await page
        .waitForSelector('a[href*="library_600x900.jpg"], a[href*="library_capsule"], #js-assets-table', { timeout: 3000 })
        .catch(() => {});
      // Two reads of the same page: the assets table holds library covers, icon hashes sit in appinfo
      // and the page's avatar. One scrape (a browser launch) answers both.
      const { assets, full } = await page.evaluate(() => {
        const table = document.querySelector('#js-assets-table');
        return { assets: table ? table.outerHTML : '', full: document.documentElement.innerHTML };
      });
      const urls = steamdbCover.coversFromHtml(id, assets || full);
      const icons = steamdbCover.iconsFromHtml(id, full);
      steamdbCoversCircuit.recordSuccess();
      // A page that loaded and listed nothing is a real answer: cache it (shorter TTL). Only a reached
      // page may write a miss, a failed navigation leaves the cache alone.
      if (generation === artworkCacheGeneration) {
        try {
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify({ appid: id, urls, icons }, null, 2));
        } catch {
          /* cache write failure is non-fatal */
        }
      }
      debug.log(urls.length ? `[${id}] SteamDB covers: ${urls.length} asset(s)` : `[${id}] SteamDB covers: no library asset found`);
      debug.log(`[${id}] SteamDB icons: ${icons.length} candidate(s)`);
      return { urls, icons };
    } catch (err) {
      if (steamdbCoversCircuit.recordFailure(err)) {
        debug.log(
          `[${id}] SteamDB covers fetch failed: ${err.message || err} - skipping SteamDB covers for ${
            STEAMDB_COVERS_COOLDOWN_MS / 60000
          } minutes`
        );
      } else {
        debug.log(`[${id}] SteamDB covers fetch failed: ${err.message || err}`);
      }
      return { urls: [], icons: [] };
    } finally {
      if (page) await page.close().catch(() => {});
      releasePage();
    }
  };
  const pending = steamdbCoversQueue.then(scrape);
  steamdbCoversQueue = pending.catch(() => {});
  steamdbCoversInFlight.set(id, pending);
  try {
    return await pending;
  } finally {
    steamdbCoversInFlight.delete(id);
  }
}

async function fetchSteamDbCovers(appid, orientation = 'portrait') {
  const { urls } = await fetchSteamDbAssets(appid);
  return filterSteamDbCoversByOrientation(urls, orientation);
}

async function fetchSteamDbIcons(appid) {
  const { icons } = await fetchSteamDbAssets(appid, { needIcons: true });
  return icons;
}

async function fetchSteamDbCover(appid) {
  const urls = await fetchSteamDbCovers(appid, 'portrait');
  return urls[0] || null;
}

ipcMain.handle('get-steamdb-cover', async (event, appid) => {
  return await fetchSteamDbCover(appid);
});

// Steam's own store CDN. The library assets sit at guessable paths, so a HEAD probe lists them in a
// few hundred ms with no scrape at all - the cheapest source in the picker, and the one that carries
// the landscape gallery (SteamGridDB has very few 920x430 grids for most games). Probed rather than
// assumed: a brand-new appid still answers 404 on every one of these paths.
const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const STEAM_CDN_ASSETS = {
  // library_600x900_2x is the same artwork at 2x, so it is left out as a visual duplicate.
  portrait: ['library_600x900.jpg'],
  landscape: ['header.jpg', 'capsule_616x353.jpg', 'library_hero.jpg'],
};
const STEAM_CDN_PROBE_TIMEOUT_MS = 6000;
// Same reasoning as steamGroupsCache: this is a resident daemon, so an unbounded Map grows for the
// whole session. Evicting is free - the entry is one probe away from being rebuilt.
const STEAM_CDN_COVERS_MEMORY_CAP = 500;
const steamCdnCoversCache = new Map();
function rememberSteamCdnCovers(key, value) {
  steamCdnCoversCache.delete(key); // re-inserting moves the key last, making the eviction below LRU
  steamCdnCoversCache.set(key, value);
  while (steamCdnCoversCache.size > STEAM_CDN_COVERS_MEMORY_CAP) {
    steamCdnCoversCache.delete(steamCdnCoversCache.keys().next().value);
  }
}

async function fetchSteamCdnCoversDetailed(appid, orientation = 'portrait') {
  const id = String(appid || '').trim();
  if (!/^\d+$/.test(id)) return { urls: [], networkError: false };
  const orient = String(orientation || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
  const key = `${id}\0${orient}`;
  if (steamCdnCoversCache.has(key)) return steamCdnCoversCache.get(key);

  const pending = (async () => {
    const probes = await Promise.all(
      STEAM_CDN_ASSETS[orient].map(async (asset) => {
        const url = `${STEAM_CDN_BASE}/${id}/${asset}`;
        try {
          const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(STEAM_CDN_PROBE_TIMEOUT_MS) });
          return { url: res.ok ? url : '', networkError: false };
        } catch {
          return { url: '', networkError: true };
        }
      })
    );
    return {
      urls: probes.map((probe) => probe.url).filter(Boolean),
      networkError: probes.some((probe) => probe.networkError),
    };
  })();
  rememberSteamCdnCovers(key, pending);
  return pending;
}

async function fetchSteamCdnCovers(appid, orientation = 'portrait') {
  return (await fetchSteamCdnCoversDetailed(appid, orientation)).urls;
}

// The library asks for this list only when its schema artwork is missing or unusable. Returning the
// probed Steam assets separately lets the renderer try their actual download before falling back to
// SteamGridDB, instead of paying for both providers for every visible tile.
ipcMain.handle('get-steam-cdn-covers', async (event, appid, orientation) => {
  return await fetchSteamCdnCovers(appid, orientation);
});
ipcMain.handle('get-steam-cdn-covers-status', async (event, appid, orientation) => {
  return await fetchSteamCdnCoversDetailed(appid, orientation);
});

// SteamGridDB covers (bundled public API key): when neither the guessable CDN path nor SteamDB has
// a portrait, the community grids usually do. Cached 30 days per game name and orientation.
const steamgriddbCoversDir = path.join(userData, 'steam_cache', 'steamgriddb_covers');
const steamgriddbCoversInFlight = new Map();

// Dimensions are filtered server-side. A popular game carries hundreds of grids of which only a
// handful are 920x430, so paging through the unfiltered list starves the landscape gallery while
// still costing two round trips. The first entry of each list is the library's native size.
const SGDB_DIMENSIONS = {
  portrait: ['600x900', '660x930', '342x482'],
  landscape: ['920x430', '460x215'],
};
const SGDB_COVER_PAGES = 2; // the API serves 50 grids per page
const SGDB_COVER_LIMIT = 48;
const SGDB_COVERS_TTL = 30 * 24 * 60 * 60 * 1000;

/* Resolve a SteamGridDB game id from a Steam appid: an identity mapping, not a guess, so it sidesteps
   title matching (SteamGridDB sometimes lists a game under a shorter name than Steam does). The title
   matcher stays strict and is only reached for sources with no Steam appid. Null cached too. */
const steamgriddbIdDir = path.join(userData, 'steam_cache', 'steamgriddb_ids');
const SGDB_ID_TTL = SGDB_COVERS_TTL;

async function fetchSteamGridDbGameIdBySteamAppid(steamAppid, options = {}) {
  const withStatus = options && options.withStatus === true;
  const id = String(steamAppid || '').trim();
  if (!/^\d+$/.test(id)) return withStatus ? { value: null, networkError: false } : null;
  const generation = artworkCacheGeneration;
  const cacheFile = path.join(steamgriddbIdDir, `${id}.json`);
  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < SGDB_ID_TTL) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const value = cached && cached.gameId ? cached : null;
      return withStatus ? { value, networkError: false } : value;
    }
  } catch {
    /* stale/corrupt -> refetch */
  }
  // Host already proven unreachable: report it as the network error it is, without a fresh timeout.
  if (steamGridDbUnavailable()) return withStatus ? { value: null, networkError: true } : null;
  let resolved = null;
  try {
    const res = await fetch(`${BASE_URL}/games/steam/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${getSteamGridDbApiKey()}` },
      signal: AbortSignal.timeout(SGDB_FETCH_TIMEOUT_MS),
    });
    sgdbCircuit.recordSuccess();
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const game = body && body.success && body.data;
      if (game && game.id) resolved = { gameId: Number(game.id), name: String(game.name || '') };
    }
  } catch (err) {
    // A network failure is not an answer - leave the cache alone so the next scan can retry.
    if (!recordSteamGridDbFailure(err, `appid ${id}`)) debug.log(`[steamgriddb] appid lookup failed for ${id}: ${err.message || err}`);
    if (!withStatus) return null;
    return { value: null, networkError: true };
  }
  if (generation === artworkCacheGeneration) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(resolved || { gameId: 0 }, null, 2));
    } catch {
      /* cache write failure is non-fatal */
    }
  }
  return withStatus ? { value: resolved, networkError: false } : resolved;
}

// Prefer an exact title match, then a token-level match (all query words present, at most one extra
// word for edition tags). Never take an unrelated first result - a wrong cover is worse than none.
// A sequel is numbered in roman on one side and in digits on the other often enough to matter, and
// an accent is dropped by one catalogue and kept by the other. Applied to both sides, so this
// recognises the same name written differently - it never makes two different names look alike.
const SGDB_ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
function steamGridDbTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => SGDB_ROMAN[token] || token);
}

function pickSteamGridDbGame(games, name, { relaxed = false } = {}) {
  const list = Array.isArray(games) ? games : [];
  const queryTokens = steamGridDbTokens(name);
  const tokensOf = (g) => steamGridDbTokens((g && g.name) || '');
  const exact = list.find((g) => tokensOf(g).join(' ') === queryTokens.join(' '));
  if (exact) return exact;
  if (!queryTokens.length) return null;
  const carriesQuery = (g) => {
    const tokens = tokensOf(g);
    return tokens.length > 0 && queryTokens.every((t) => tokens.includes(t));
  };
  const close = list.find((g) => carriesQuery(g) && tokensOf(g).length - queryTokens.length <= 1);
  if (close || !relaxed) return close || null;
  /*
    Last resort, once every query has come back with nothing: an entry that carries the whole name
    plus more of its own - a subtitle the store dropped, say. Taken only when exactly one candidate
    does, because the runner-up in that list is usually the sequel, and a wrong cover is worse than
    none.
  */
  const candidates = list.filter(carriesQuery);
  return candidates.length === 1 ? candidates[0] : null;
}

// Native size first, then the other accepted dimensions in declared order. The API returns grids by
// score, and that order is preserved inside each tier, so the best-rated artwork stays on top.
function rankSteamGridDbGrids(grids, orientation, limit) {
  const order = SGDB_DIMENSIONS[orientation] || SGDB_DIMENSIONS.portrait;
  const tierOf = (grid) => {
    const index = order.indexOf(`${Number(grid.width)}x${Number(grid.height)}`);
    return index === -1 ? order.length : index;
  };
  return (Array.isArray(grids) ? grids : [])
    .filter((grid) => grid && grid.url)
    .map((grid, index) => ({ grid, index }))
    .sort((a, b) => tierOf(a.grid) - tierOf(b.grid) || a.index - b.index)
    .slice(0, Math.max(1, Number(limit) || SGDB_COVER_LIMIT))
    .map(({ grid }) => ({
      url: String(grid.url),
      // The API ships a small preview next to every grid; the picker paints tiles from it so the
      // gallery is not downloading dozens of full-size covers just to be looked at.
      thumb: String(grid.thumb || grid.url),
      width: Number(grid.width) || 0,
      height: Number(grid.height) || 0,
    }));
}

function steamGridDbFetch(url) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${getSteamGridDbApiKey()}` },
    signal: AbortSignal.timeout(SGDB_FETCH_TIMEOUT_MS),
  });
}

/*
  The SteamGridDB game behind a title, for any of its asset lists.

  Identity first: a Steam appid names the game outright, so no title has to be matched at all. Only
  a game with no appid (Ubisoft, GOG, Epic, manual) falls back to the strict title matcher.
*/
async function resolveSteamGridDbGameId(name, steamAppid, context) {
  const byAppidResult = await fetchSteamGridDbGameIdBySteamAppid(steamAppid, { withStatus: true });
  const networkError = byAppidResult.networkError;
  if (byAppidResult.value && byAppidResult.value.gameId) return { gameId: byAppidResult.value.gameId, networkError };

  if (!name) return { gameId: 0, networkError };
  if (steamGridDbUnavailable()) return { gameId: 0, networkError: true };
  let searchRes;
  try {
    searchRes = await steamGridDbFetch(`${BASE_URL}/search/autocomplete/${encodeURIComponent(name)}`);
    sgdbCircuit.recordSuccess();
  } catch (err) {
    recordSteamGridDbFailure(err, `${context} search "${name}"`);
    return { gameId: 0, networkError: true };
  }
  if (!searchRes.ok) return { gameId: 0, networkError };
  const search = await searchRes.json().catch(() => null);
  const match = pickSteamGridDbGame(search && search.data, name);
  return { gameId: match && match.id ? Number(match.id) : 0, networkError };
}

async function fetchSteamGridDbGrids(name, orientation, steamAppid = '') {
  const sgdb = steamGridDbFetch;

  const resolved = await resolveSteamGridDbGameId(name, steamAppid, 'cover');
  let networkError = resolved.networkError;
  if (!resolved.gameId) return { grids: [], networkError };
  const game = { id: resolved.gameId };

  const dimensions = (SGDB_DIMENSIONS[orientation] || SGDB_DIMENSIONS.portrait).join(',');
  const pages = await Promise.all(
    Array.from({ length: SGDB_COVER_PAGES }, (unused, page) =>
      sgdb(`${BASE_URL}/grids/game/${game.id}?dimensions=${dimensions}&page=${page}`)
        .then(async (res) => ({ body: res.ok ? await res.json().catch(() => null) : null, networkError: false }))
        .catch(() => ({ body: null, networkError: true }))
    )
  );
  networkError = networkError || pages.some((page) => page.networkError);
  let list = pages
    .flatMap(({ body }) => (Array.isArray(body && body.data) ? body.data : []))
    .filter((grid) => grid && grid.url);
  // A game whose artists only ever uploaded odd sizes comes back empty; take whatever exists.
  if (!list.length) {
    let anyBody = null;
    try {
      const anyRes = await sgdb(`${BASE_URL}/grids/game/${game.id}`);
      anyBody = anyRes.ok ? await anyRes.json().catch(() => null) : null;
    } catch {
      networkError = true;
    }
    list = (Array.isArray(anyBody && anyBody.data) ? anyBody.data : []).filter((grid) => grid && grid.url);
  }

  const seen = new Set();
  return {
    grids: list.filter((grid) => {
      const url = String(grid.url);
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    }),
    networkError,
  };
}

async function fetchSteamGridDbCovers(gameName, limit = SGDB_COVER_LIMIT, orientation = 'portrait', steamAppid = '', options = {}) {
  const withStatus = options && options.withStatus === true;
  const empty = (networkError = false) => (withStatus ? { covers: [], networkError } : []);
  const name = String(gameName || '').trim();
  const appid = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  const generation = artworkCacheGeneration;
  // With an appid the name is decoration; without one it is the only handle there is.
  if (!name && !appid) return empty();
  const orient = String(orientation || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
  // The appid belongs in the key: the same title resolved by identity and by search can legitimately
  // land on different SteamGridDB games, and one must not serve the other's cached grids.
  const key = require('crypto').createHash('sha1').update(`${appid}\0${name.toLowerCase()}\0${orient}`).digest('hex');
  const cacheFile = path.join(steamgriddbCoversDir, `${key}.json`);
  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < SGDB_COVERS_TTL) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached.grids)) {
        const covers = rankSteamGridDbGrids(cached.grids, orient, limit);
        return withStatus ? { covers, networkError: false } : covers;
      }
    }
  } catch {
    /* stale/corrupt -> refetch */
  }
  if (steamgriddbCoversInFlight.has(key)) {
    const result = await steamgriddbCoversInFlight.get(key);
    return withStatus ? { covers: rankSteamGridDbGrids(result.grids, orient, limit), networkError: result.networkError } : rankSteamGridDbGrids(result.grids, orient, limit);
  }

  const pending = (async () => {
    try {
      const result = await fetchSteamGridDbGrids(name, orient, appid);
      const grids = result.grids;
      if (grids.length && generation === artworkCacheGeneration) {
        try {
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
          fs.writeFileSync(
            cacheFile,
            JSON.stringify(
              {
                name,
                orientation: orient,
                grids: grids.map((grid) => ({
                  url: String(grid.url),
                  thumb: String(grid.thumb || grid.url),
                  width: Number(grid.width),
                  height: Number(grid.height),
                })),
              },
              null,
              2
            )
          );
        } catch {
          /* cache write failure is non-fatal */
        }
      }
      return result;
    } catch (err) {
      if (!recordSteamGridDbFailure(err, `cover list "${name}"`)) debug.log(`[steamgriddb] cover list failed for "${name}": ${err.message || err}`);
      return { grids: [], networkError: true };
    }
  })();
  steamgriddbCoversInFlight.set(key, pending);
  try {
    const result = await pending;
    const covers = rankSteamGridDbGrids(result.grids, orient, limit);
    return withStatus ? { covers, networkError: result.networkError } : covers;
  } finally {
    steamgriddbCoversInFlight.delete(key);
  }
}

function resetArtworkLookupCaches() {
  artworkCacheGeneration += 1;
  // Clearing caches is also a request to try again: do not leave the transport circuit open, or the
  // first post-clear scan would skip every Steam lookup until the cooldown elapses.
  resetSteamTransportCircuit();
  sgdbCircuit.reset();
  steamdbCoversCircuit.reset();
  steamdbCoversInFlight.clear();
  steamdbCoversQueue = Promise.resolve();
  steamCdnCoversCache.clear();
  steamgriddbCoversInFlight.clear();
}

async function fetchSteamGridDbCover(gameName, steamAppid = '', orientation = 'portrait') {
  const covers = await fetchSteamGridDbCovers(gameName, 1, orientation, steamAppid);
  return (covers[0] && covers[0].url) || null;
}

/*
  SteamGridDB icons: the square logo a game actually has.

  Notification cards paint their thumbnail in a square slot, and neither of the two artworks a Steam
  game ships fits one - a library grid is 2:3, the clienticon is a 32x32 sprite. The community icon
  set is the only source of a real square logo at a usable resolution, so it is asked for first and
  everything else stays a fallback. Cached 30 days per game like the covers, misses included: a game
  nobody has drawn an icon for does not grow one between two notifications.
*/
const steamgriddbIconsDir = path.join(userData, 'steam_cache', 'steamgriddb_icons');
const SGDB_ICONS_TTL = SGDB_COVERS_TTL;
// How long a notification waits on the icon lookup before painting with what it already has. A
// cached answer returns instantly, so this only ever costs the very first card of a given game.
const SGDB_ICON_WAIT_MS = 1200;
// And how long its download may take once it answered. Both budgets are spent only once per game:
// the file lands in the same icon cache every other artwork uses.
const SGDB_ICON_DOWNLOAD_WAIT_MS = 2500;
const { pickSquareIcon } = require('../util/squareLogo.js');

async function fetchSteamGridDbIcon(gameName, steamAppid = '') {
  const name = String(gameName || '').trim();
  const appid = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  if (!name && !appid) return null;
  const generation = artworkCacheGeneration;
  const key = require('crypto').createHash('sha1').update(`${appid}\0${name.toLowerCase()}`).digest('hex');
  const cacheFile = path.join(steamgriddbIconsDir, `${key}.json`);
  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < SGDB_ICONS_TTL) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return cached && cached.url ? cached : null;
    }
  } catch {
    /* stale/corrupt -> refetch */
  }
  if (steamGridDbUnavailable()) return null;

  let icon = null;
  try {
    const resolved = await resolveSteamGridDbGameId(name, appid, 'icon');
    if (!resolved.gameId) {
      // A network failure is not an answer: leave the cache alone so the next notification retries.
      if (resolved.networkError) return null;
    } else {
      const res = await steamGridDbFetch(`${BASE_URL}/icons/game/${resolved.gameId}?types=static`);
      sgdbCircuit.recordSuccess();
      const body = res.ok ? await res.json().catch(() => null) : null;
      icon = pickSquareIcon(body && body.data);
    }
  } catch (err) {
    if (!recordSteamGridDbFailure(err, `icon list "${name || appid}"`)) debug.log(`[steamgriddb] icon list failed for "${name || appid}": ${err.message || err}`);
    return null;
  }

  if (generation === artworkCacheGeneration) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(icon || {}, null, 2));
    } catch {
      /* cache write failure is non-fatal */
    }
  }
  return icon;
}

ipcMain.handle('get-steamgriddb-icon', async (event, gameName, steamAppid) => {
  const icon = await fetchSteamGridDbIcon(gameName, steamAppid);
  return (icon && icon.url) || null;
});

// How many community icons the picker offers. The list is a gallery, not an automatic choice, so
// it keeps everything usable rather than the single best one fetchSteamGridDbIcon() picks.
const SGDB_ICON_PICKER_LIMIT = 36;

/* The whole icon list, largest first, for the icon picker. Deliberately not cached: reusing the
   single-icon cache file would overwrite the answer every notification depends on. */
async function fetchSteamGridDbIcons(gameName, steamAppid = '') {
  const name = String(gameName || '').trim();
  const appid = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  if (!name && !appid) return { icons: [], networkError: false };
  if (steamGridDbUnavailable()) return { icons: [], networkError: true };
  try {
    const resolved = await resolveSteamGridDbGameId(name, appid, 'icon picker');
    if (!resolved.gameId) return { icons: [], networkError: resolved.networkError === true };
    const res = await steamGridDbFetch(`${BASE_URL}/icons/game/${resolved.gameId}?types=static`);
    sgdbCircuit.recordSuccess();
    const body = res.ok ? await res.json().catch(() => null) : null;
    const list = Array.isArray(body && body.data) ? body.data : [];
    const icons = list
      // .ico and animated .webp are read by neither the picker's preview nor the preset that would
      // have to paint the result, so they are dropped rather than offered as a dead tile.
      .filter((asset) => asset && asset.url && /\.(?:png|jpe?g)(?:$|[?#])/i.test(String(asset.url)))
      .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))
      .slice(0, SGDB_ICON_PICKER_LIMIT)
      .map((asset) => ({ url: String(asset.url), thumb: String(asset.thumb || asset.url) }));
    return { icons, networkError: false };
  } catch (err) {
    if (!recordSteamGridDbFailure(err, `icon picker "${name || appid}"`)) {
      debug.log(`[steamgriddb] icon picker list failed for "${name || appid}": ${err.message || err}`);
    }
    return { icons: [], networkError: true };
  }
}

/* The executable's own icon, as a file the picker can paint: for a cracked or brand-new title this
   is regularly the only artwork that exists. Not via app.getFileIcon(), the shell answers with a
   generic glyph instead of nothing; util/exeIcon.js reads the PE's own resources instead. */
// The name is fixed so every reader - this process, the picker, the Watchdog - looks in one place.
const EXECUTABLE_ICON_NAME = 'executable-icon.png';
/* Below this an executable icon buys nothing: blown up into a 68px slot it is the blurry stamp the
   square logo exists to avoid. Small icons still appear in the picker, they just don't auto-win. */
const MIN_EXECUTABLE_ICON_SIDE = 64;
/* At this size the executable is carrying its real, modern icon - the picture Windows itself paints
   for the game on the desktop and in the taskbar - and it beats everything that has to be guessed
   at or cut out of a poster. Below it the icon is a legacy 32/48/128px stamp that only earns its
   place once the community set has missed, which is where the chain already tries it. */
const PREFERRED_EXECUTABLE_ICON_SIDE = 256;

async function fetchExecutableIcon(exePath, appid) {
  const source = String(exePath || '');
  if (!source || !/\.exe$/i.test(source)) return null;
  try {
    const dir = path.join(userData, 'steam_cache', 'icon', String(appid || 'unknown'));
    const target = path.join(dir, EXECUTABLE_ICON_NAME);
    /* Reuse what was extracted last time: this runs on the default path, asked for on every
       notification and page open, so re-reading a 100 MB PE resource section each time is real cost. */
    try {
      const [cached, exe] = [fs.statSync(target), fs.statSync(source)];
      if (cached.mtimeMs >= exe.mtimeMs) {
        const size = require('../util/imageSize.js').imageSize(target);
        return { path: target, width: (size && size.width) || 0, height: (size && size.height) || 0 };
      }
    } catch {
      /* nothing cached yet, or the executable is newer: extract it again */
    }

    const { extractIcon } = require('../util/exeIcon.js');
    const icon = extractIcon(source);
    if (!icon) return null;
    fs.mkdirSync(dir, { recursive: true });
    // A 256x256 entry is already a PNG; smaller ones are DIBs wrapped in a one-image .ico, which
    // nativeImage decodes from disk (it cannot from a buffer) and re-encodes as a paintable PNG.
    if (icon.format === 'png') {
      fs.writeFileSync(target, icon.data);
      return { path: target, width: icon.width, height: icon.height };
    }
    const icoFile = path.join(dir, 'executable-icon.ico');
    fs.writeFileSync(icoFile, icon.data);
    const image = require('electron').nativeImage.createFromPath(icoFile);
    if (!image || image.isEmpty()) return null;
    const png = image.toPNG();
    if (!png || !png.length) return null;
    fs.writeFileSync(target, png);
    return { path: target, width: icon.width, height: icon.height };
  } catch (err) {
    debug.log(`[artwork] executable icon failed for "${source}": ${err.message || err}`);
    return null;
  }
}

/* The game's own Steam artwork, as squares: only the clienticon starts square (header is 2:1, grid
   2:3), so everything else goes through the same square cut the header uses. A clienticon is kept
   as-is, under makeSquareLogo's minimum side but already the real icon. */
async function squareIconCandidates(appid, sources) {
  const { makeSquareLogo, isSquareRatio } = require('../util/squareLogo.js');
  const { imageSize } = require('../util/imageSize.js');
  const out = [];
  for (const candidate of Array.isArray(sources) ? sources : [sources]) {
    const value = String(candidate || '');
    if (!value) continue;
    const local =
      paintableIconPath(value) ||
      paintableIconPath(
        await Promise.race([
          fetchSteamIcon(value, appid).catch(() => ''),
          new Promise((resolve) => setTimeout(() => resolve(''), SGDB_ICON_DOWNLOAD_WAIT_MS)),
        ])
      );
    if (!local) continue;
    let square = '';
    try {
      square = makeSquareLogo(local, appid, { userDataRoot: userData }) || '';
      if (!square) {
        const size = imageSize(local);
        if (size && isSquareRatio(size.width, size.height)) square = local;
      }
    } catch {
      /* an unreadable candidate is simply not offered */
    }
    if (square && !out.includes(square)) out.push(square);
  }
  return out;
}

/* Icon picker options needing the main process: Steam artwork (download+cut), community icons
   (network), executable icon (PE read). The renderer adds what it already has on its side. */
ipcMain.handle('get-icon-options', async (event, { name, steamAppid, cacheAppid, sources, exe } = {}) => {
  const id = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  // A game with no Steam appid still needs its own icon folder: sharing one named "unknown" made
  // the mtime reuse check hand one game's executable icon to the next, and left it out of reach of
  // forget-square-logo. Key it on whatever the rest of the artwork chain keys this game on.
  const iconCacheId = id || String(cacheAppid || steamAppid || '').trim() || 'unknown';
  const toFileUrl = require('../util/iconUrl.js').iconResultToFileUrl;
  const [grids, exeIcon, steam] = await Promise.all([
    fetchSteamGridDbIcons(String(name || ''), id),
    fetchExecutableIcon(exe, iconCacheId),
    squareIconCandidates(id || String(steamAppid || ''), sources),
  ]);
  return {
    grids: grids.icons,
    steam: steam.map(toFileUrl).filter(Boolean),
    exe: (exeIcon && toFileUrl(exeIcon.path)) || '',
    networkError: grids.networkError === true,
  };
});

// The slow half, asked for separately so its tiles can be appended late: SteamDB costs a stealth
// browser launch. Only a real Steam release is queried - any other id scrapes a page with no assets.
ipcMain.handle('get-icon-options-steamdb', async (event, { steamAppid } = {}) => {
  const id = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  if (!id) return [];
  const icons = await fetchSteamDbIcons(id);
  return Array.isArray(icons) ? icons : [];
});

/* Forget everything cached about a game's square logo so "Re-download icon" actually re-fetches.
   Both halves: the SteamGridDB answer (a miss is cached too) and squares cut from local artwork. */
ipcMain.handle('forget-square-logo', async (event, { appid, name } = {}) => {
  const id = String(appid == null ? '' : appid).trim();
  const title = String(name || '').trim();
  try {
    const key = require('crypto').createHash('sha1').update(`${/^\d+$/.test(id) ? id : ''}\0${title.toLowerCase()}`).digest('hex');
    fs.rmSync(path.join(steamgriddbIconsDir, `${key}.json`), { force: true });
  } catch {
    /* nothing cached is the normal case */
  }
  try {
    const iconDir = path.join(userData, 'steam_cache', 'icon', id);
    for (const entry of fs.readdirSync(iconDir)) {
      if (/-logo\.png$/i.test(entry) || entry.toLowerCase() === 'executable-icon.png') fs.rmSync(path.join(iconDir, entry), { force: true });
    }
  } catch {
    /* no per-appid icon folder yet */
  }
  return true;
});

// `steamAppid` is optional: the non-Steam callers (Ubisoft, GOG, Epic) still ask by name only.
ipcMain.handle('get-steamgriddb-cover', async (event, gameName, steamAppid, orientation) => {
  return await fetchSteamGridDbCover(gameName, steamAppid, orientation);
});
ipcMain.handle('get-steamgriddb-cover-status', async (event, gameName, steamAppid, orientation) => {
  const result = await fetchSteamGridDbCovers(gameName, 1, orientation, steamAppid, { withStatus: true });
  return { url: (result.covers[0] && result.covers[0].url) || null, networkError: result.networkError === true };
});

// Cover picker options: the two instant sources only (Steam CDN HEAD probe + SteamGridDB JSON).
// SteamDB is deliberately absent, it costs a stealth-browser launch and would stall the dialog.
ipcMain.handle('get-cover-options', async (event, { name, orientation, steamAppid } = {}) => {
  const gameName = String(name || '').trim();
  const orient = String(orientation || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
  const id = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  const [steam, grids] = await Promise.all([
    id ? fetchSteamCdnCoversDetailed(id, orient) : Promise.resolve({ urls: [], networkError: false }),
    gameName || id ? fetchSteamGridDbCovers(gameName, SGDB_COVER_LIMIT, orient, id, { withStatus: true }) : Promise.resolve({ covers: [], networkError: false }),
  ]);
  return {
    steam: Array.isArray(steam.urls) ? steam.urls : [],
    grids: Array.isArray(grids.covers) ? grids.covers : [],
    networkError: steam.networkError === true || grids.networkError === true,
  };
});

// The slow half of the picker, asked for separately so its tiles can be appended late. Only a real
// Steam release is queried (explicit numeric steamAppid): a non-Steam id (GOG/Xbox/local) would
// scrape a page with no assets and hold the browser tab open for up to 45s.
ipcMain.handle('get-cover-options-steamdb', async (event, { orientation, steamAppid } = {}) => {
  const orient = String(orientation || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
  const id = /^\d+$/.test(String(steamAppid || '').trim()) ? String(steamAppid).trim() : '';
  if (!id) return [];
  const urls = await fetchSteamDbCovers(id, orient);
  return Array.isArray(urls) ? urls : [];
});

// Top-owners SteamID pool. Last-resort seed for the keyless schema/rarity scrape: when no SteamHunters
// owner 100%'d a game, these prolific collectors' public profiles are tried instead. Scraped from
// SteamLadder through the stealth browser (it challenges plain requests) and disk-cached for 7 days.
let topOwnersInFlight = null;
async function fetchTopOwners() {
  const cacheFile = path.join(userData, 'steam_cache', 'topOwners.json');
  const TTL = 7 * 24 * 60 * 60 * 1000;
  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < TTL) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached) && cached.length) return cached;
    }
  } catch {
    /* stale/corrupt -> refetch */
  }
  if (topOwnersInFlight) return topOwnersInFlight;

  topOwnersInFlight = (async () => {
    const topOwners = require(path.join(app.getAppPath(), 'parser/topOwners.js'));
    let page = null;
    const releasePage = await acquirePuppeteerSlot();
    try {
      await startPuppeteer(true, false);
      page = await puppeteerWindow.context.newPage();
      await blockHeavyResources(page);
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36'
      );
      await page.goto(topOwners.DEFAULT_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('a[href^="/profile/"]', { timeout: 12000 }).catch(() => {});
      const html = await page.content();
      const ids = topOwners.extractSteamIdsFromHtml(html, 250);
      if (ids.length >= 10) {
        try {
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify(ids, null, 0));
        } catch {
          /* cache write failure is non-fatal */
        }
        debug.log(`[top-owners] scraped ${ids.length} SteamIDs`);
        return ids;
      }
      debug.log(`[top-owners] not enough SteamIDs found (${ids.length})`);
      return [];
    } catch (err) {
      debug.log(`[top-owners] fetch failed: ${err.message || err}`);
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
      releasePage();
    }
  })();
  try {
    return await topOwnersInFlight;
  } finally {
    topOwnersInFlight = null;
  }
}

ipcMain.handle('get-top-owners', async () => {
  return await fetchTopOwners();
});

// Launch-metadata fallback: when local exe detection fails, learn the process name so the watchdog
// can still detect the game running. Two sources, cheapest first: Steam product info, then a SteamDB
// config-page scrape (stealth browser, SteamDB 403s plain requests). Disk-cached 30 days.
// Returns { process_name, best_process_name, arguments } or null.
const steamdbLaunchInFlight = new Map();

// Steam's own product info carries the same launch options SteamDB republishes, over the anonymous
// connection AW already opens, no browser needed. clientLogOn() never rejects or times out on its
// own, so this whole attempt is explicitly bounded, a Steam outage must fall through to the scrape.
const STEAM_APPINFO_LAUNCH_TIMEOUT_MS = 8000;
async function launchMetadataFromAppInfo(id) {
  const steamdbLaunch = require(path.join(app.getAppPath(), 'parser/steamdbLaunch.js'));
  const attempt = (async () => {
    await clientLogOn();
    const { apps } = await client.getProductInfo([Number(id)], [], false);
    const info = (apps[id] || apps[Number(id)] || {}).appinfo;
    return steamdbLaunch.launchMetadataFromAppInfo(id, info && info.config ? info.config.launch : null);
  })();
  try {
    return await Promise.race([
      attempt,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), STEAM_APPINFO_LAUNCH_TIMEOUT_MS)),
    ]).then((result) => (result === 'timeout' ? null : result));
  } catch (err) {
    debug.log(`[${id}] Steam appinfo launch metadata unavailable: ${err.message || err}`);
    return null;
  }
}

async function fetchSteamDbLaunch(appid) {
  const id = String(appid || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const cacheFile = path.join(userData, 'steam_cache', 'steamdb_launch', `${id}.json`);
  const TTL = 30 * 24 * 60 * 60 * 1000;
  // A miss (unreachable, no launch option) is remembered too, on a much shorter TTL, so a rescan does
  // not pay another headless-browser launch for the same doomed lookup while still retrying same-day.
  const NEGATIVE_TTL = 6 * 60 * 60 * 1000;
  const writeCache = (payload) => {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
    } catch {
      /* cache write failure is non-fatal */
    }
  };
  const rememberMiss = () => writeCache({ miss: true, at: new Date().toISOString() });
  try {
    if (fs.existsSync(cacheFile)) {
      const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && cached.best_process_name) {
        if (age < TTL) return cached;
      } else if (age < NEGATIVE_TTL) {
        return null;
      }
    }
  } catch {
    /* stale/corrupt -> refetch */
  }
  if (steamdbLaunchInFlight.has(id)) return steamdbLaunchInFlight.get(id);

  const pending = (async () => {
    const steamdbLaunch = require(path.join(app.getAppPath(), 'parser/steamdbLaunch.js'));
    // Cheapest usable source first; the scrape below is the last resort for an appid whose
    // product info carries no launch section at all.
    const fromAppInfo = await launchMetadataFromAppInfo(id);
    if (fromAppInfo && fromAppInfo.best_process_name) {
      writeCache(fromAppInfo);
      debug.log(`[${id}] Steam appinfo launch metadata: process_name="${fromAppInfo.process_name}"`);
      return fromAppInfo;
    }
    let page = null;
    const releasePage = await acquirePuppeteerSlot();
    try {
      await startPuppeteer(true, false);
      page = await puppeteerWindow.context.newPage();
      await blockHeavyResources(page);
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'
      );
      await page.goto(`https://steamdb.info/app/${id}/config/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('h2', { timeout: 8000 }).catch(() => {});
      // Pull just the "Launch Options" section HTML; steamdbLaunch parses/ranks it (unit-tested).
      const sectionHtml = await page.evaluate(() => {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const h = Array.from(document.querySelectorAll('h2')).find((el) => norm(el.textContent) === 'Launch Options');
        if (!h) return '';
        let html = h.outerHTML;
        let n = h.nextElementSibling;
        while (n && n.tagName !== 'H2') {
          html += n.outerHTML;
          n = n.nextElementSibling;
        }
        return html;
      });
      const meta = steamdbLaunch.launchMetadataFromHtml(id, sectionHtml);
      if (meta && meta.best_process_name) {
        writeCache(meta);
        debug.log(`[${id}] SteamDB launch metadata: process_name="${meta.process_name}"`);
        return meta;
      }
      debug.log(`[${id}] SteamDB launch metadata: no usable launch option found`);
      rememberMiss();
      return null;
    } catch (err) {
      debug.log(`[${id}] SteamDB launch metadata fetch failed: ${err.message || err}`);
      rememberMiss();
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
      releasePage();
    }
  })();
  steamdbLaunchInFlight.set(id, pending);
  try {
    return await pending;
  } finally {
    steamdbLaunchInFlight.delete(id);
  }
}

ipcMain.handle('get-steamdb-launch', async (event, appid) => {
  return await fetchSteamDbLaunch(appid);
});

async function searchForGameName(info = { appid: '' }) {
  if (info.appid.length === 0) {
    info.title = undefined;
    return;
  }

  let locale = 'en-US';
  let startIndex = 0;
  let matchResult;
  await startPuppeteer(true, false);

  async function scrapePage(startIndex) {
    const page = await puppeteerWindow.context.newPage();

    const url = `https://store.epicgames.com/pt/browse?sortBy=releaseDate&sortDir=DESC&tag=Windows&priceTier=tier3&category=Game&count=40&start=${
      40 * startIndex
    }`;

    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      );
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      await page.waitForFunction(() => !!window.__REACT_QUERY_INITIAL_QUERIES__, { timeout: 15000 });
      const queries = await page.evaluate(() => window.__REACT_QUERY_INITIAL_QUERIES__);
      if (queries.queries) {
        const catalogQuery = queries.queries.find((q) => q?.state?.data?.Catalog?.searchStore?.elements);
        if (catalogQuery) {
          const elements = catalogQuery.state.data.Catalog.searchStore.elements;
          const found = elements.find((el) => el.namespace === info.appid);
          if (found) {
            matchResult = found.title;
          }
        }
      }
    } catch (err) {
      debug.log(`[steam-search] page ${startIndex} failed: ${err.message || err}`);
    } finally {
      await page.close();
    }
    return matchResult;
  }

  async function run(start) {
    const tasks = [];
    for (let i = start; i < start + 5; i++) {
      const startIndex = i;
      tasks.push(scrapePage(startIndex));
    }

    await Promise.all(tasks);
  }

  // Bound the catalog scan: without a cap, a title that never matches (delisted, renamed, region-
  // locked) scrapes Epic's store endlessly. Stop after MAX_PAGES; info.title stays undefined on a miss.
  const MAX_PAGES = 100;
  while (!info.title && startIndex < MAX_PAGES) {
    await run(startIndex);
    info.title = matchResult;
    startIndex += 5;
  }
  return;
}

function searchForSteamAppId(info = { name: '' }) {
  if (info.name.length === 0) {
    info.appid = undefined;
    return;
  }
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  const closeHiddenSearchWindow = () => {
    try {
      if (!win.isDestroyed()) win.close();
    } catch {}
  };
  const searchTimeout = setTimeout(() => {
    if (!info.games) info.games = [];
    closeHiddenSearchWindow();
  }, 30000);
  win.on('closed', () => clearTimeout(searchTimeout));
  win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');
  // Inject JS *before* the page starts executing its own scripts
  win.webContents.on('dom-ready', async () => {
    await win.webContents.executeJavaScript(`
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
      });

      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });

      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.'
      });

      window.chrome = { runtime: {} };
    `);
  });
  // A title with an ampersand, a hash or an accent silently truncated the query and matched the
  // wrong game, or nothing at all.
  win.loadURL(`https://store.steampowered.com/search/?term=${encodeURIComponent(info.name)}&category1=998&ndl=1`);
  win.webContents.on('did-finish-load', async () => {
    let games = undefined;
    try {
      while (!games) {
        games = await win.webContents.executeJavaScript(`
          (() => {
            const rows = document.querySelectorAll('#search_resultsRows a[data-ds-appid]');
            const list = [];

            for (const row of rows) {
              if (list.length >= 10) break;

              const appid = row.getAttribute('data-ds-appid');
              const title = row.querySelector('.title')?.innerText.trim() || '';

              if (appid && title) {
                list.push({ appid, title });
              }
            }

            return list;
          })();
        `);

        await delay(500);
      }
      info.games = games;
    } catch (error) {
      debug.log(`[steam-search] could not find an appid: ${error && error.message ? error.message : error}`);
      if (!info.games) info.games = [];
    } finally {
      closeHiddenSearchWindow();
    }
  });
}

/*
  The installation key (util/appSecret.js): 256 random bits held under Windows DPAPI, replacing the
  passphrase that used to be compiled into this public repository. Resolved once, after 'ready',
  because safeStorage needs the app to be up.

  Deliberately NOT put in process.env: everything AW spawns - games, emulator tooling, Steamless -
  would inherit it. Only the Watchdog gets it, explicitly, in the env of its own spawn.
*/
let cachedAppSecret;
function appSecret() {
  if (cachedAppSecret !== undefined) return cachedAppSecret;
  cachedAppSecret = '';
  try {
    const { safeStorage } = require('electron');
    cachedAppSecret = require(path.join(__dirname, '..', 'util', 'appSecret.js')).ensureSecret(userData, safeStorage);
    if (!cachedAppSecret) debug.log('[secret] safeStorage unavailable - local secrets stay on the legacy key');
  } catch (err) {
    debug.log('[secret] could not resolve the installation key: ' + (err.message || err));
  }
  return cachedAppSecret;
}

// The renderer runs with Node integration, so this hands it nothing it could not read for itself;
// it exists so util/aes.js resolves the same key on both sides without duplicating safeStorage.
ipcMain.on('get-app-secret', (event) => {
  event.returnValue = appSecret();
});

/*
  Session-wide hardening, applied once at startup rather than from inside createMainWindow().

  It used to live in that function, so the nominal path never reached it: a login-item start passes
  --hidden (see electron/ipc.js) and opens no window, and --wintype=overlay / --wintype=notification
  open one that is not the main window. The overlay and the preset popups then ran on a default
  session with Chromium's own permission defaults.

  The User-Agent header was also registered twice with the same body - once here, once per overlay
  creation - and only the last listener of a session survives, so the repeat did nothing except
  guarantee the two would diverge unnoticed.
*/
let sessionHardened = false;
function applySessionHardening() {
  if (sessionHardened) return;
  sessionHardened = true;
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = manifest.config['user-agent'];
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
  // Community notification presets may only reach store CDNs, and only for images. See
  // presetRequestAllowed() for why this is filtered here instead of on a session of their own.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (!presetWebContentsIds.has(details.webContentsId) || presetRequestAllowed(details)) {
      callback({ cancel: false });
      return;
    }
    debug.log(`[overlay-notif] blocked ${details.resourceType} request to ${details.url.slice(0, 120)}`);
    callback({ cancel: true });
  });
  // The app needs no web permissions (camera, mic, geolocation, web-notifications, ...); toasts are
  // native and audio uses <audio>/main-process playback. A compromised renderer gets none.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

// The window the user resized is the window they expect back. Geometry persists to
// <userData>/cfg/mainWindowState.json (same place and shape as overlayBounds.json) and is restored
// on the next open, including a reopen from the tray after the idle release destroyed the window.
function mainWindowStateFile() {
  return path.join(userData, 'cfg', 'mainWindowState.json');
}
function readMainWindowState() {
  try {
    return JSON.parse(fs.readFileSync(mainWindowStateFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}
let lastPersistedMainWindowState = null;
function writeMainWindowState(state) {
  try {
    if (!mainWindowStateChanged(lastPersistedMainWindowState, state)) return;
    fs.mkdirSync(path.dirname(mainWindowStateFile()), { recursive: true });
    fs.writeFileSync(mainWindowStateFile(), JSON.stringify(state), 'utf8');
    lastPersistedMainWindowState = state;
  } catch (e) {
    debug.log('[main-window-state] ' + (e.message || e));
  }
}

function createMainWindow() {
  try {
    if (MainWin) {
      if (MainWin.isMinimized()) MainWin.restore();
      if (!MainWin.isVisible()) MainWin.show();
      MainWin.focus();
      return;
    }
    // A shallow copy: mutating manifest.config.window itself made every reopen inherit whatever the
    // previous window resolved, starting with its icon path.
    let options = { ...manifest.config.window };
    options.show = false;
    options.webPreferences = {
      devTools: manifest.config.debug || false,
      // Full contextIsolation is a separate migration (renderer relies on nodeIntegration for
      // require/remote); until then CSP + output escaping hold the XSS->RCE surface shut.
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      enableWebSQL: false,
      spellcheck: false,
      v8CacheOptions: manifest.config.debug ? 'none' : 'code',
      // Tray daemon: the main UI window spends most of its life hidden/minimized. Let Chromium
      // throttle its background timers then (cuts idle CPU). Safe here because the only renderer
      // timer is the periodic new-game scan (far slower than the ~1/min throttle floor) and WebSocket
      // message handling is unaffected by throttling. The hidden scrape window (searchForSteamAppId)
      // and the overlay/notification windows keep backgroundThrottling:false - they must run hidden.
      backgroundThrottling: true,
      // The renderer needs all three before it can open its log file, and it used to ask for them
      // over synchronous IPC - three round trips that block it behind whatever this process happens
      // to be doing at that moment. Handed over at creation instead; the IPC answers stay for any
      // later caller.
      additionalArguments: [
        `--isDev=${manifest.config.debug ? 'true' : 'false'}`,
        `--userDataPath=${userData}`,
        `--appName=${app.getName()}`,
      ],
    };
    // The manifest's icon path is relative to the app root, but BrowserWindow/fs resolve relative to
    // the working directory; resolve it here and prefer the multi-size .ico (a 256px PNG downscales
    // muddy).
    try {
      const configured = manifest.config.window.icon || 'resources/icon/icon.png';
      const base = path.isAbsolute(configured) ? configured : path.join(__dirname, '..', configured);
      const preferred = process.platform === 'win32' ? base.replace(/\.png$/i, '.ico') : base;
      options.icon = fs.existsSync(preferred) ? preferred : base;
      fs.accessSync(options.icon, fs.constants.F_OK);
    } catch {
      delete options.icon;
    }
    // Restored with setBounds() rather than through the constructor: the constructor's width/height
    // are a content size, getNormalBounds() reports a frame size, and round-tripping one through the
    // other made the window grow by the frame on every restart. setBounds is the exact inverse of
    // what was saved. It runs before the window is ever shown (show: false until ready-to-show), so
    // nothing is painted at the wrong shape first.
    const savedWindowState = readMainWindowState();
    let restoreMaximized = false;
    let restoredWindowBounds = null;
    try {
      const screen = require('electron').screen;
      const savedBounds = savedWindowState && savedWindowState.bounds;
      const workArea = (
        savedBounds && Number.isFinite(Number(savedBounds.x)) && Number.isFinite(Number(savedBounds.y))
          ? screen.getDisplayMatching({
              x: Math.round(Number(savedBounds.x)),
              y: Math.round(Number(savedBounds.y)),
              width: Math.round(Number(savedBounds.width)) || options.width,
              height: Math.round(Number(savedBounds.height)) || options.height,
            })
          : screen.getPrimaryDisplay()
      ).workArea;
      const restored = resolveMainWindowState(manifest.config.window, savedWindowState, { workArea });
      restoredWindowBounds = restored.bounds;
      restoreMaximized = restored.maximized;
      if (restored.bounds) {
        lastPersistedMainWindowState = buildMainWindowState(savedWindowState);
        debug.log(
          `[MainWindow] restoring saved geometry: ${restored.bounds.width}x${restored.bounds.height}` +
            `${restored.bounds.x === undefined ? ' (centred)' : `@${restored.bounds.x},${restored.bounds.y}`}` +
            `${restored.maximized ? ' maximized' : ''}`
        );
      }
    } catch (err) {
      debug.log(`[MainWindow] saved geometry unusable, falling back to defaults (${err.message || err})`);
    }

    const windowCreateStartedAt = Date.now();
    MainWin = new BrowserWindow(options);
    if (restoredWindowBounds) {
      try {
        MainWin.setBounds(restoredWindowBounds);
      } catch (err) {
        debug.log(`[MainWindow] could not apply the saved geometry (${err.message || err})`);
      }
    }
    // Maximizing before the first paint keeps the restore size (the bounds above) as the un-maximize
    // target, which is what the user last dragged the window to.
    if (restoreMaximized) MainWin.maximize();
    getRemoteMain().enable(MainWin.webContents);
    notifyWatchdogOfAppPid();

    // A download started while tray-only has no taskbar button to draw on; opening the window
    // creates one, so hand it the progress already running (renderer re-syncs via get-update-status).
    if (currentUpdateStatus.phase !== 'idle') applyUpdateProgressToWindow(MainWin);

    // BrowserWindow.hide() does not reliably update document.visibilityState on every Electron
    // version, so tell the renderer directly to stop its optional controller polling while tray-only.
    const sendMainWindowVisibility = (visible) => {
      if (!MainWin || MainWin.isDestroyed() || MainWin.webContents.isDestroyed()) return;
      MainWin.webContents.send('main-window-visibility', visible);
    };
    // Hiding to the tray starts the idle-release countdown; showing cancels it. Minimizing does
    // not: it keeps the taskbar button, so the user expects an instant restore and stays "open".
    MainWin.on('show', () => {
      cancelMainWindowRelease();
      sendMainWindowVisibility(true);
    });
    MainWin.on('hide', () => {
      scheduleMainWindowRelease();
      sendMainWindowVisibility(false);
    });
    MainWin.webContents.on('did-finish-load', () => sendMainWindowVisibility(MainWin.isVisible()));

    if (options.frame === false) MainWin.isFrameless = true;

    if (manifest.config.debug) {
      if (openDevTools) MainWin.webContents.openDevTools({ mode: 'undocked' });
      MainWin.isDev = true;
      console.info((({ node, electron, chrome }) => ({ node, electron, chrome }))(process.versions));
      // electron-context-menu is ESM-only in v4+ - must use dynamic import
      import('electron-context-menu').then((mod) => {
        const contextMenuFn = mod.default || mod;
        if (typeof contextMenuFn === 'function') {
          contextMenuFn({
            append: (defaultActions, params, browserWindow) => [
              { role: 'reload', visible: Boolean(params) },
            ],
          });
        }
      }).catch((err) => {
        debug.log(`[window] electron-context-menu init failed: ${err.message || err}`);
      });
    }

    MainWin.webContents.userAgent = manifest.config['user-agent'];

    // External open links: only http(s) reaches the OS - forwarding anything else turned in-page
    // navigation into arbitrary protocol launches (ms-msdt:, search-ms:, UNC…).
    const openExternal = function (event, url) {
      if (url.startsWith('file:///')) return;
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      else debug.log(`[nav] blocked navigation to a non-http(s) scheme: ${String(url).slice(0, 80)}`);
    };
    MainWin.webContents.on('will-navigate', openExternal); //a href

    // Hardening: never let the renderer spawn its own BrowserWindow; route real links to the OS
    // browser instead (a href target="_blank" lands here; 'new-window' no longer exists on Electron >=22).
    MainWin.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

    MainWin.loadFile(manifest.config.window.view);

    let mainWindowShown = false;
    // Window geometry, logged: "wrong shape" reports are otherwise unreconstructable after the fact,
    // and the shape usually comes from the display it landed on.
    const logWindowGeometry = (event) => {
      if (!MainWin || MainWin.isDestroyed()) return;
      try {
        const b = MainWin.getBounds();
        const c = MainWin.getContentBounds();
        const display = require('electron').screen.getDisplayMatching(b);
        debug.log(
          `[MainWindow] ${event}: bounds=${b.width}x${b.height}@${b.x},${b.y} content=${c.width}x${c.height}` +
            ` state=${MainWin.isMinimized() ? 'minimized' : MainWin.isMaximized() ? 'maximized' : 'normal'}` +
            `${MainWin.isFullScreen() ? '/fullscreen' : ''} visible=${MainWin.isVisible()}` +
            ` display=${display.id}@${display.scaleFactor}x`
        );
      } catch (err) {
        debug.log(`[MainWindow] ${event}: geometry unavailable (${err.message || err})`);
      }
    };
    // getNormalBounds() and not getBounds(): while maximized or minimized the latter reports the
    // maximized rectangle, which would be saved as the restore size and make un-maximizing a no-op.
    const persistMainWindowGeometry = () => {
      if (!MainWin || MainWin.isDestroyed() || MainWin.isMinimized() || MainWin.isFullScreen()) return;
      try {
        writeMainWindowState(
          buildMainWindowState({ bounds: MainWin.getNormalBounds(), maximized: MainWin.isMaximized() })
        );
      } catch (err) {
        debug.log(`[main-window-state] geometry unavailable (${err.message || err})`);
      }
    };

    // 'resize'/'move' fire continuously while dragging, so they are logged once the user lets go.
    MainWin.on('resized', () => {
      logWindowGeometry('resized');
      persistMainWindowGeometry();
    });
    MainWin.on('moved', () => {
      logWindowGeometry('moved');
      persistMainWindowGeometry();
    });
    MainWin.on('maximize', () => {
      logWindowGeometry('maximized');
      persistMainWindowGeometry();
    });
    MainWin.on('unmaximize', () => {
      logWindowGeometry('unmaximized');
      persistMainWindowGeometry();
    });
    MainWin.on('minimize', () => logWindowGeometry('minimized'));
    MainWin.on('restore', () => logWindowGeometry('restored'));
    MainWin.on('enter-full-screen', () => logWindowGeometry('enter-full-screen'));
    MainWin.on('leave-full-screen', () => logWindowGeometry('leave-full-screen'));

    const fitMainWindowInWorkArea = () => {
      if (!MainWin || MainWin.isDestroyed()) return;
      // Windows reports a maximized window a few pixels outside the work area on purpose; clamping
      // that back would call setBounds() and silently un-maximize a window restored as maximized.
      if (MainWin.isMaximized() || MainWin.isFullScreen()) return;
      try {
        const bounds = MainWin.getBounds();
        const display = require('electron').screen.getDisplayMatching(bounds);
        const fitted = clampWindowBoundsToWorkArea(bounds, display.workArea);
        if (fitted.x === bounds.x && fitted.y === bounds.y) return;
        MainWin.setBounds(fitted);
        debug.log(`[MainWindow] moved into work area: ${bounds.x},${bounds.y} -> ${fitted.x},${fitted.y}`);
      } catch (err) {
        debug.log(`[MainWindow] could not validate its work area (${err.message || err})`);
      }
    };

    const showMainWindow = (reason) => {
      if (mainWindowShown || !MainWin) return;
      mainWindowShown = true;
      debug.log(
        `[MainWindow] showing (${reason}) - window ready in ${Date.now() - windowCreateStartedAt}ms, process up ${process.uptime().toFixed(1)}s`
      );
      fitMainWindowInWorkArea();
      MainWin.show();
      MainWin.focus();
      logWindowGeometry('shown');
      const net = require('net');
      const PIPE_NAME = '\\\\.\\pipe\\AchievementWatchdogPipe';
      function checkWatchdogStatus(callback) {
        const client = net.createConnection(PIPE_NAME);

        client.on('connect', () => {
          callback(true);
          client.end();
        });

        client.on('error', () => {
          callback(false);
        });
      }
      // Report monitor status to the renderer's connection indicator; no auto-launch here, the daemon
      // already supervises it. Stored + cleared on window close so repeated open/close never leaks intervals.
      clearInterval(watchdogStatusInterval);
      const sendWatchdogStatus = (state) => {
        if (MainWin) MainWin.webContents.send('watchdog-status', state);
      };
      watchdogStatusInterval = setInterval(() => {
        const state = getWatchdogState();
        if (state) return sendWatchdogStatus(state);
        // No supervised child to read a heartbeat from; fall back to the pipe probe.
        checkWatchdogStatus((running) => sendWatchdogStatus(running ? 'running' : 'stopped'));
      }, 5000);
    };

    const isReady = [
      new Promise(function (resolve) {
        MainWin.once('ready-to-show', () => {
          // Only the first window of the session belongs to the boot timeline; a reopen after the
          // idle release is a different measurement and would rewrite this one.
          if (!bootMarks.some(([label]) => label === 'painted')) {
            bootMark('painted');
            debug.log(`[perf][boot] ${bootTimeline()}`);
          }
          debug.log('[MainWindow] ready-to-show');
          return resolve();
        });
      }),
      new Promise(function (resolve) {
        // Clear any handler left behind by a window closed before its renderer reported in:
        // handleOnce only unregisters when it fires, and a second handler on the same channel throws.
        ipcMain.removeHandler('components-loaded');
        ipcMain.handleOnce('components-loaded', () => {
          debug.log('[MainWindow] components-loaded');
          return resolve();
        });
      }),
    ];

    Promise.all(isReady).then(() => showMainWindow('ready'));
    // Resilience: never let a hung/failed renderer keep the window hidden forever; once it can paint,
    // show it after a short grace period even if 'components-loaded' never arrives.
    MainWin.once('ready-to-show', () => {
      setTimeout(() => showMainWindow('fallback-timeout'), 8000);
    });
    // Absolute last resort: show regardless of paint/IPC events so the app is never invisible.
    setTimeout(() => showMainWindow('absolute-timeout'), 15000);

    MainWin.on('close', (event) => {
      // Snap-resizing to a screen edge and double-clicking a border do not always emit 'resized', so
      // the last shape is captured here too rather than only on the drag handlers above.
      persistMainWindowGeometry();
      if (app.isQuiting) return;
      if (configJS?.general?.closeToTray === false) {
        debug.log('[MainWindow] close requested -> quitting app (closeToTray disabled)');
        app.isQuiting = true;
        setImmediate(() => app.quit());
        return;
      }
      event.preventDefault();
      logWindowGeometry('closing');
      debug.log('[MainWindow] close intercepted -> hiding to tray');
      clearInterval(watchdogStatusInterval);
      watchdogStatusInterval = null;
      closePuppeteer().catch(() => {});
      MainWin.hide();
    });

    MainWin.on('closed', () => {
      MainWin = null;
      // Daemon stays alive in the tray; just release the window-bound status poller. The monitor and
      // tray are untouched, so background tracking continues.
      clearInterval(watchdogStatusInterval);
      watchdogStatusInterval = null;
      // Closing mid-scrape would otherwise leave an orphaned headless Chromium resident (the renderer
      // only fires 'close-puppeteer' once the list finishes); tear it down so it can't leak into tray state.
      closePuppeteer().catch(() => {});
    });
  } catch (e) {
    debug.log(`Error creating main window: ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

// In-game overlay manipulation: nudge / snap / click-through toggle + position persistence.
// overlay.html is already drag-movable via -webkit-app-region; these add keyboard fine-positioning
// and a click-through toggle, active only while the overlay is open. Bounds persist to
// <userData>/cfg/overlayBounds.json (like progressMute.json) and restore on next open.
function overlayBoundsFile() {
  return path.join(userData, 'cfg', 'overlayBounds.json');
}
function readOverlayBounds() {
  try {
    return JSON.parse(fs.readFileSync(overlayBoundsFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}
function writeOverlayBounds(patch) {
  try {
    const next = Object.assign(readOverlayBounds(), patch);
    fs.mkdirSync(path.dirname(overlayBoundsFile()), { recursive: true });
    fs.writeFileSync(overlayBoundsFile(), JSON.stringify(next), 'utf8');
  } catch (e) {
    debug.log('[overlay-bounds] ' + (e.message || e));
  }
}
let overlayClickThrough = false;
let overlayAppid = null;
function persistInGameBounds() {
  if (overlayWindow && !overlayWindow.isDestroyed()) writeOverlayBounds({ inGame: overlayWindow.getBounds() });
}
function nudgeOverlay(dx, dy) {
  if (!overlayVisible || !overlayWindow || overlayWindow.isDestroyed()) return;
  const b = overlayWindow.getBounds();
  overlayWindow.setBounds({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
  persistInGameBounds();
}
function snapOverlay(corner) {
  if (!overlayVisible || !overlayWindow || overlayWindow.isDestroyed()) return;
  const { x: ax, y: ay, width: aw, height: ah } = require('electron').screen.getPrimaryDisplay().workArea;
  const b = overlayWindow.getBounds();
  let x = ax;
  let y = ay;
  switch (corner) {
    case 1: x = ax; y = ay; break; // top-left
    case 2: x = ax + aw - b.width; y = ay; break; // top-right
    case 3: x = ax + Math.floor((aw - b.width) / 2); y = ay + Math.floor((ah - b.height) / 2); break; // center
    case 4: x = ax; y = ay + ah - b.height; break; // bottom-left
    case 5: x = ax + aw - b.width; y = ay + ah - b.height; break; // bottom-right
  }
  overlayWindow.setBounds({ x, y, width: b.width, height: b.height });
  persistInGameBounds();
}
function toggleOverlayClickThrough() {
  if (!overlayVisible || !overlayWindow || overlayWindow.isDestroyed()) return;
  overlayClickThrough = !overlayClickThrough;
  overlayWindow.setIgnoreMouseEvents(overlayClickThrough, { forward: true });
}

// Controller-driven overlay control: the Watchdog forwards { overlayControl: { action, payload } }
// over IPC when a controller drives the overlay (see handleMonitorMessage); reuses the keyboard ops.
let overlaySnapIndex = 0;
function moveOverlayRelative(dx, dy) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (!x && !y) return;
  nudgeOverlay(x, y);
}
function cycleOverlaySnapPreset() {
  overlaySnapIndex = (overlaySnapIndex % 5) + 1;
  snapOverlay(overlaySnapIndex);
}
function scrollOverlayPage(direction) {
  if (!overlayVisible || !overlayWindow || overlayWindow.isDestroyed()) return;
  const sign = direction === 'up' ? -1 : 1;
  // The overlay content scrolls inside .scroll-container; nudge it by ~55% of the viewport per repeat.
  overlayWindow.webContents
    .executeJavaScript(
      `(() => { const el = document.querySelector('.scroll-container') || document.scrollingElement || document.body;` +
        ` if (el) el.scrollBy({ top: ${sign} * Math.round(window.innerHeight * 0.55), behavior: 'smooth' }); })();`,
      true
    )
    .catch(() => {});
}
function setOverlayControlMode(active) {
  // No overlayVisible check here on purpose: hideOverlayWindow() calls this to reset click-through
  // state during the hide transition itself, after overlayVisible has already been set false but
  // while the window is still valid - an overlayVisible guard would silently skip that reset.
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // In control mode the overlay must receive stick/dpad-driven moves, so force it interactive
  // (not click-through). Leaving control mode restores the last click-through state.
  if (active) {
    overlayWindow.setIgnoreMouseEvents(false);
  } else {
    overlayWindow.setIgnoreMouseEvents(overlayClickThrough, { forward: true });
  }
}
function handleOverlayControl(action, payload = {}) {
  switch (String(action || '')) {
    case 'move-relative':
      moveOverlayRelative(payload.dx, payload.dy);
      return;
    case 'scroll-page':
      scrollOverlayPage(payload.direction);
      return;
    case 'nudge': {
      const step = 20;
      const map = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] };
      const d = map[payload.direction];
      if (d) nudgeOverlay(d[0], d[1]);
      return;
    }
    case 'snap-cycle':
      cycleOverlaySnapPreset();
      return;
    case 'control-mode':
      setOverlayControlMode(payload.active === true);
      return;
    case 'ui-mode-toggle':
      if (overlayVisible) {
        overlayWindow.webContents.send('overlay-controller-mode', { mode: 'ui' });
      }
      return;
    default:
      return;
  }
}
const OVERLAY_SHORTCUT_KEYS = ['Up', 'Down', 'Left', 'Right', '1', '2', '3', '4', '5', 'C'];
function registerOverlayShortcuts() {
  const reg = (accel, fn) => {
    try {
      globalShortcut.register(accel, fn);
    } catch (e) {
      debug.log('[overlay-shortcut] register failed ' + accel + ': ' + (e.message || e));
    }
  };
  reg('CommandOrControl+Alt+Shift+Up', () => nudgeOverlay(0, -20));
  reg('CommandOrControl+Alt+Shift+Down', () => nudgeOverlay(0, 20));
  reg('CommandOrControl+Alt+Shift+Left', () => nudgeOverlay(-20, 0));
  reg('CommandOrControl+Alt+Shift+Right', () => nudgeOverlay(20, 0));
  reg('CommandOrControl+Alt+Shift+1', () => snapOverlay(1));
  reg('CommandOrControl+Alt+Shift+2', () => snapOverlay(2));
  reg('CommandOrControl+Alt+Shift+3', () => snapOverlay(3));
  reg('CommandOrControl+Alt+Shift+4', () => snapOverlay(4));
  reg('CommandOrControl+Alt+Shift+5', () => snapOverlay(5));
  reg('CommandOrControl+Alt+Shift+C', () => toggleOverlayClickThrough());
}
function unregisterOverlayShortcuts() {
  for (const k of OVERLAY_SHORTCUT_KEYS) {
    try {
      globalShortcut.unregister('CommandOrControl+Alt+Shift+' + k);
    } catch {}
  }
}

// Held here, not the Watchdog: Electron registers global shortcuts for free (the Watchdog would
// need a PowerShell host all session). Idempotent, no drop-and-add that could lose the shortcut.
let overlayHotkeyAccelerator = null;
let overlayHotkeyPressedAt = 0;
// RegisterHotKey was asked for MOD_NOREPEAT; Electron has no equivalent, so a held shortcut would
// toggle the overlay on every key repeat. Ignoring repeats inside one human keypress restores it.
const OVERLAY_HOTKEY_REPEAT_MS = 250;

function registerOverlayHotkey(value) {
  let accelerator;
  try {
    accelerator = toAccelerator(value);
  } catch (err) {
    debug.log(`[hotkey] ${err.message || err}`);
    return;
  }
  if (accelerator === overlayHotkeyAccelerator && globalShortcut.isRegistered(accelerator)) return;
  unregisterOverlayHotkey();
  try {
    const ok = globalShortcut.register(accelerator, () => {
      const now = Date.now();
      if (now - overlayHotkeyPressedAt < OVERLAY_HOTKEY_REPEAT_MS) return;
      overlayHotkeyPressedAt = now;
      notifyMonitorOverlayHotkey();
    });
    if (!ok) {
      debug.log(`[hotkey] ${accelerator} is already registered by another application`);
      return;
    }
    overlayHotkeyAccelerator = accelerator;
    debug.log(`[hotkey] Registered ${accelerator}`);
  } catch (err) {
    debug.log(`[hotkey] could not register ${accelerator}: ${err.message || err}`);
  }
}

function unregisterOverlayHotkey() {
  if (!overlayHotkeyAccelerator) return;
  try {
    globalShortcut.unregister(overlayHotkeyAccelerator);
  } catch {}
  overlayHotkeyAccelerator = null;
}

// When the overlay hotkey is pressed with no game running, the Watchdog sends
// appid=0 + description=open. Resolve the game currently open in the app window
// (or the first library tile) so the overlay still has something to show.
async function resolveOverlayFallbackAppid() {
  if (!MainWin || MainWin.isDestroyed() || MainWin.webContents.isDestroyed()) return null;
  try {
    const id = await MainWin.webContents.executeJavaScript(
      `(() => {
        const open = document.querySelector('#achievement .wrapper > .header');
        const first = document.querySelector('#game-list .game-box[data-appid]');
        return (open && open.dataset.appid) || (first && first.dataset.appid) || '';
      })()`
    );
    return String(id || '').trim() || null;
  } catch (err) {
    debug.log(`[overlay] fallback appid lookup failed: ${err.message || err}`);
    return null;
  }
}

// The overlay is kept alive (hidden) between opens so toggling it is nearly instant.
// "Closing" therefore means hiding; the BrowserWindow itself is only destroyed on app quit,
// a crash, or an explicit recreate (e.g. the overlay HTML changed in dev).
function hideOverlayWindow(reason = 'close') {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const wasVisible = overlayVisible;
  overlayVisible = false;
  overlayAppid = null;
  overlayClickThrough = false;
  unregisterOverlayShortcuts();
  setOverlayControlMode(false);
  try {
    overlayWindow.webContents.send('overlay-visibility', false);
  } catch {}
  try {
    // Drop the loaded achievement DOM while hidden so the reused window stays light.
    overlayWindow.webContents.send('show-overlay', null);
  } catch {}
  try {
    overlayWindow.hide();
  } catch {}
  if (overlayWarmupTimer) clearTimeout(overlayWarmupTimer);
  overlayWarmupTimer = setTimeout(() => {
    overlayWarmupTimer = null;
    if (!overlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
      debug.log('[overlay] warm window released after idle');
      overlayWindow.destroy();
      scheduleIdleTrim('overlay-released');
    }
  }, OVERLAY_WARMUP_KEEP_MS);
  if (typeof overlayWarmupTimer.unref === 'function') overlayWarmupTimer.unref();
  if (wasVisible) notifyMonitorOverlayState(false);
  debug.log(`[overlay] hidden (${reason})`);
}

function sendOverlayPayloads(info) {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayVisible) return;
  overlayWindow.webContents.send('overlay-language', overlayLanguagePayload());
  overlayWindow.webContents.send('overlay-theme', currentThemePayload());
  overlayWindow.webContents.send('overlay-controller-config', overlayControllerConfigPayload());
  overlayWindow.webContents.send('show-overlay', info.game);
}

function showOverlayAfterLoad(info) {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayVisible) return;
  if (overlayWarmupTimer) {
    clearTimeout(overlayWarmupTimer);
    overlayWarmupTimer = null;
  }
  sendOverlayPayloads(info);
  try {
    overlayWindow.webContents.send('overlay-visibility', true);
  } catch {}
  if ((configJS && configJS.controller && configJS.controller.focusOverlay) === true) {
    overlayWindow.show();
    overlayWindow.focus();
  } else {
    overlayWindow.showInactive();
  }
  registerOverlayShortcuts();
  notifyMonitorOverlayState(true);
}

async function createOverlayWindow(info) {
  try {
    if (!info.action) info.action = 'open';
    const isOpen = overlayVisible;
    const request = resolveOverlayRequest({ action: info.action, appid: info.appid, isOpen, openAppid: overlayAppid });

    if (request.action === 'ignore') return;
    if (request.action === 'close') {
      hideOverlayWindow('close');
      return;
    }
    if (request.action === 'refresh') {
      if (!overlayVisible) return;
      overlayWindow.webContents.send('refresh-achievements-table', String(info.appid));
      return;
    }
    if (request.action === 'reopen') {
      // The active game changed while the overlay was open: hide the old contents, then fall
      // through and swap in the new game's achievements without recreating the window.
      hideOverlayWindow('reopen');
    }
    if (request.action === 'fallback') {
      const fallback = await resolveOverlayFallbackAppid();
      if (!fallback) return;
      info.appid = fallback;
    }
    const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;

    // Avoid re-reading options.ini + re-initializing the achievements parser on every toggle.
    // Settings saves already call startEngines(), so a loaded configJS is fresh enough here.
    if (!configJS) await startEngines();
    await getCachedData(info);
    info.game = await getAchievements().getSavedAchievementsForAppid(configJS, { appid: info.appid });
    attachOverlayRarity(info.game);
    attachOverlayLocalIcons(info.game);

    // Fast path: the window already exists (hidden) from a previous open. Swap the data and show.
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayVisible = true;
      overlayAppid = String(info.appid);
      overlayClickThrough = false;
      const savedInGame = readOverlayBounds().inGame;
      if (savedInGame && Number.isFinite(savedInGame.x) && Number.isFinite(savedInGame.y)) {
        overlayWindow.setBounds({
          x: savedInGame.x,
          y: savedInGame.y,
          width: savedInGame.width || 450,
          height: savedInGame.height || 800,
        });
      }
      showOverlayAfterLoad(info);
      return;
    }

    overlayAppid = String(info.appid);
    overlayWindow = new BrowserWindow({
      title: t('achievements-overlay-title', 'Achievements Overlay', 'Overlay de succès'),
      width: 450,
      height: 800,
      x: width - 470,
      y: 20,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      minWidth: 260,
      minHeight: 200,
      focusable: true,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, '../overlayPreload.js'),
        additionalArguments: [`--isDev=${app.isDev ? 'true' : 'false'}`, `--userDataPath=${userData}`],
        contextIsolation: true,
        nodeIntegration: false,
        devTools: manifest.config.debug || false,
        backgroundThrottling: false,
      },
    });

    if (manifest.config.debug) {
      if (openDevTools) overlayWindow.webContents.openDevTools({ mode: 'undocked' });
      overlayWindow.isDev = true;
      console.info((({ node, electron, chrome }) => ({ node, electron, chrome }))(process.versions));
      // electron-context-menu is ESM-only in v4+, must use dynamic import (same as the MainWin path).
      import('electron-context-menu').then((mod) => {
        const contextMenuFn = mod.default || mod;
        if (typeof contextMenuFn === 'function') {
          contextMenuFn({
            append: (defaultActions, params, browserWindow) => [
              { role: 'reload', visible: Boolean(params) },
            ],
          });
        }
      }).catch((err) => {
        debug.log(`[window] electron-context-menu init failed: ${err.message || err}`);
      });
    }

    overlayWindow.webContents.userAgent = manifest.config['user-agent'];

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setFullScreenable(false);
    overlayWindow.setFocusable(true);
    overlayWindow.blur();

    // Restore the user's last overlay position/size (from drag, nudge or snap), if any.
    const savedInGame = readOverlayBounds().inGame;
    if (savedInGame && Number.isFinite(savedInGame.x) && Number.isFinite(savedInGame.y)) {
      overlayWindow.setBounds({
        x: savedInGame.x,
        y: savedInGame.y,
        width: savedInGame.width || 450,
        height: savedInGame.height || 800,
      });
    }
    overlayClickThrough = false; // each open starts interactive (drag/scroll), not click-through

    // Load the bundled overlay (same policy as the main window): a userData copy can be stale and
    // would drift from the app's own view/overlay.html + util/overlayUi.js.
    overlayVisible = true;
    overlayWindow.loadFile(path.join(__dirname, '../view/overlay.html'));
    overlayWindow.webContents.on('did-finish-load', () => {
      showOverlayAfterLoad(info);
    });

    // Persist position/size after a drag (app-region move fires 'moved') or an edge/corner resize.
    overlayWindow.on('moved', persistInGameBounds);
    overlayWindow.on('resize', persistInGameBounds);

    overlayWindow.on('closed', () => {
      overlayWindow = null;
      overlayVisible = false;
      if (overlayWarmupTimer) {
        clearTimeout(overlayWarmupTimer);
        overlayWarmupTimer = null;
      }
      overlayAppid = null;
      overlayClickThrough = false;
      unregisterOverlayShortcuts();
      // Only a real destroy lands here now (app quit / crash / dev reload); normal toggles hide.
      notifyMonitorOverlayState(false);
    });

  } catch (e) {
    debug.log(`Error creating overlay window, ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

function shouldQuitApp() {
  // Resident tray daemon: the app stays alive in the tray with no window. Closing the main window
  // (or finishing notifications/overlay) must NEVER quit the process - only the tray "Quit" item
  // does (it sets app.isQuiting then calls app.quit()).
  return false;
}

function parseArgs(args) {
  args = normalizeWindowArgs(args);
  let windowType = args['wintype'] || 'main'; // overlay (in-game) or main; notifications are Windows system notifications
  let appid = args['appid']; // appid
  let source = args['source'] || 'steam'; // source: steam, epic, gog, luma
  let description = args['description']; // text
  // What was ASKED for, not what will happen: an overlay request carries an action (open/close/
  // refresh) and createOverlayWindow may well decide to do nothing with it.
  debug.log(`${windowType} window request` + (description ? ` (${description})` : ''));
  switch (windowType) {
    case 'overlay':
      createOverlayWindow({ appid, source, action: description });
      break;
    case 'notification':
      // Styled overlay notification, forwarded over IPC (handleMonitorMessage) and rendered as a
      // BrowserWindow inside this resident daemon; no transient process, no self-quit safety net needed.
      enqueueNotificationFromArgs(args);
      break;
    case 'main':
    default:
      // Resident tray daemon: open the UI window on demand (a login-item/`--hidden` start stays tray-only).
      // Startup-only init runs once in 'ready', not here, so reopening never repeats it.
      if (!args.hidden) createMainWindow();
      break;
  }
}

// A toast click activates the app through the registered URI scheme, so the game arrives as a raw
// argv entry ("achievement-watcher://game/480/ACH_WIN") rather than as flags. The identifiers are
// path segments because the URI is embedded verbatim in the toast XML, where a query string's "&"
// would make the notification malformed (see buildActivation in watchdog/notification/transport).
function parseToastActivation(argv) {
  for (const raw of Array.isArray(argv) ? argv : []) {
    const value = String(raw || '');
    if (!value.toLowerCase().startsWith(`${TOAST_PROTOCOL}://game/`)) continue;
    try {
      const url = new URL(value);
      const [appid, achievement] = url.pathname.replace(/^\/+/, '').split('/').map((s) => decodeURIComponent(s || ''));
      if (appid) return { appid, achievement: achievement || '' };
    } catch {
      /* malformed URI - ignore it rather than crash the launch path */
    }
  }
  return null;
}

// Whether the app was already running (second-instance) or cold-started from the notification, wait
// for the main window and ask the renderer to open the game page.
function openGameFromLaunchArgs(args) {
  if (!args || !args.appid) return;
  const tryOpen = (attempt = 0) => {
    if (MainWin && !MainWin.isDestroyed()) {
      const openGame = () => {
        MainWin.webContents.send('open-game', { appid: String(args.appid), achievement: String(args.achievement || '') });
      };
      if (MainWin.webContents.isLoading()) MainWin.webContents.once('did-finish-load', openGame);
      else setTimeout(openGame, 300);
      return;
    }
    if (attempt < 20) setTimeout(() => tryOpen(attempt + 1), 250); // window is still being created
  };
  tryOpen();
}

// Overlay notification (optional transport): spawns a frameless click-through window rendering a
// preset via window.api. Resolves presets from the bundled library, falling back to the default.
const { DEFAULT_PRESET, presetPriority, resolveAvailablePresetName } = require(path.join(__dirname, '../util/notificationPreset.js'));
const gamePreset = require(path.join(__dirname, '../util/gamePreset.js'));
gamePreset.setUserDataPath(userData);

ipcMain.handle('game-preset:get', (event, appid) => gamePreset.getSettings(appid));
ipcMain.handle('game-preset:set', (event, request = {}) => {
  const requested = request.settings && typeof request.settings === 'object' ? request.settings : request;
  const settings = { ...requested };
  // A select change made while the draggable witness is open may arrive before its latest move
  // event reaches the renderer. Preserve the main-process anchor in that narrow race; switching to
  // any non-custom position still removes it normally.
  if (String(settings.position || '') === 'custom' && !gamePreset.normalizeCustomPosition(settings.customPosition)) {
    const current = gamePreset.getSettings(request.appid);
    if (current.position === 'custom' && current.customPosition) settings.customPosition = current.customPosition;
  }
  const ok = gamePreset.setSettings(request.appid, settings);
  const saved = ok ? gamePreset.getSettings(request.appid) : {};
  return { ok, settings: saved, preset: saved.preset || '' };
});

/* Preset folders change only when the designer/importer changes them or a settings panel asks for
   a fresh list; index them once between events so resolving a live unlock costs map lookups only. */
let notificationPresetFolders = null;
function refreshNotificationPresetFolders() {
  const folders = new Map();
  const roots = [usersPresetsDir(), ...bundledPresetRoots(), path.join(__dirname, '../presets')];
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (folders.has(name)) continue;
        const folder = path.join(root, name);
        if (fs.existsSync(path.join(folder, 'index.html'))) folders.set(name, folder);
      }
    } catch {}
  }
  notificationPresetFolders = folders;
  return folders;
}

function invalidateNotificationPresetFolders() {
  notificationPresetFolders = null;
}

function findNotificationPresetFolder(name) {
  const folders = notificationPresetFolders || refreshNotificationPresetFolders();
  return folders.get(String(name || '')) || null;
}

function resolveNotificationPreset(names) {
  const name = resolveAvailablePresetName(names, (candidate) => Boolean(findNotificationPresetFolder(candidate)));
  return { name, folder: findNotificationPresetFolder(name) };
}

function resolvePresetFolder(presetName) {
  return resolveNotificationPreset([String(presetName || DEFAULT_PRESET), DEFAULT_PRESET]).folder;
}

// Read the preset's window size from its <meta width="" height=""> tag (reference convention).
function getPresetDimensions(presetFolder) {
  try {
    const content = fs.readFileSync(path.join(presetFolder, 'index.html'), 'utf8');
    const m = content.match(/<meta\s+width\s*=\s*"(\d+)"\s+height\s*=\s*"(\d+)"\s*\/?>/i);
    if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  } catch (err) {
    debug.log('[overlay-notif] preset dimensions read failed: ' + (err.message || err));
  }
  return { width: 400, height: 200 };
}

function notificationPlacementArea(customAnchor = null) {
  const electronScreen = require('electron').screen;
  try {
    // A custom popup belongs to the display where the user placed it, regardless of where the cursor
    // happens to be when a later achievement unlocks.
    if (customAnchor && Number.isFinite(Number(customAnchor.x)) && Number.isFinite(Number(customAnchor.y))) {
      const savedDisplay = electronScreen.getDisplayNearestPoint({
        x: Math.round(Number(customAnchor.x)),
        y: Math.round(Number(customAnchor.y)),
      });
      // Electron reports these bounds in DIP, so this stays exact on scaled/HiDPI displays.
      if (savedDisplay && savedDisplay.bounds) return savedDisplay.bounds;
    }
    // The cursor is normally over the game that triggered the unlock, so this keeps the popup on
    // that monitor instead of unexpectedly putting it on the primary display.
    const display = electronScreen.getDisplayNearestPoint(electronScreen.getCursorScreenPoint());
    // Full display bounds, not workArea: "bottom" must mean the bottom of the screen, not just above
    // the taskbar. These windows are alwaysOnTop at 'screen-saver' level, so they draw over it anyway.
    if (display && display.bounds) return display.bounds;
  } catch {}
  const primary = electronScreen.getPrimaryDisplay();
  return primary.bounds || primary.workArea;
}

// Place the window inside the target display's usable area. The shared helper clamps both edges,
// including a manually repositioned popup, instead of only protecting the left/top edges.
function computeNotificationBounds(position, width, height, workArea, customAnchor = null) {
  return notificationBounds.placeNotification({
    position,
    width,
    height,
    workArea: workArea || notificationPlacementArea(),
    custom: position === 'custom' ? customAnchor || readOverlayBounds().notif : null,
    // An edge anchor means the edge itself: a preset's window is its <meta> box, already padded with
    // transparent glow/shadow room, so any extra inset here reads as the popup not touching the side
    // it was anchored to.
    margin: 0,
  });
}

// Localized strings used by the notification preset windows (fallback titles/descriptions).
// Reads the active locale JSON directly (the renderer loader is not available in the main
// process); every bundled locale contains the same `watchdog` keys, so a missing per-language
// file degrades to English exactly like the rest of the app.
function loadNotificationStrings() {
  try {
    const lang = String((configJS && configJS.achievement && configJS.achievement.lang) || 'english');
    const langDir = path.join(__dirname, '../locale/lang');
    let data = JSON.parse(fs.readFileSync(path.join(langDir, 'english.json'), 'utf8'));
    if (lang !== 'english') {
      try {
        data = JSON.parse(fs.readFileSync(path.join(langDir, `${lang}.json`), 'utf8'));
      } catch (err) {
        debug.log(`[overlay-notif] locale load failed (${lang}), using English: ${err.message || err}`);
      }
    }
    return (data && data.watchdog) || {};
  } catch (err) {
    debug.log(`[overlay-notif] notification strings unavailable: ${err.message || err}`);
    return {};
  }
}

/*
  Notification presets are third-party HTML: a `.awpreset` from the community gallery is installed
  by presetPackage.js, which validates paths, sizes and extensions but never the markup, and an
  inline <script> is part of what a preset IS. The window is contextIsolation'd with no Node, so the
  script cannot touch the machine - but it could still `fetch()` any host and post the game name,
  the achievement, the timestamps and the viewer's IP somewhere.

  Presets legitimately paint artwork straight off the store CDNs (Steam achievement icons and header
  images arrive as https URLs from the Watchdog), so a blanket block would break them. This is the
  narrow version: from a preset window, an http(s) request is allowed only when it is an image from
  a store CDN. XHR/fetch/websocket/script/stylesheet, and images from anywhere else, are cancelled.

  It filters by webContents id on the DEFAULT session rather than giving these windows a session of
  their own: a BrowserWindow on a non-default session cannot load a file:// page (loadFile answers
  ERR_FAILED), and every preset is a file on disk. Requests from any other window are waved through
  untouched, so nothing else in the app changes.
*/
const NOTIFICATION_IMAGE_HOSTS =
  /(?:^|\.)(?:steamstatic\.com|steampowered\.com|steamcommunity\.com|akamaihd\.net|steamgriddb\.com|gog\.com|gog-statics\.com|epicgames\.com|unrealengine\.com|s-microsoft\.com|xboxlive\.com|ubi\.com|ubisoft\.com)$/i;
const presetWebContentsIds = new Set();

function presetRequestAllowed(details) {
  let url;
  try {
    url = new URL(details.url);
  } catch {
    return true; // not something this can reason about; the other guards still apply
  }
  // file:, data: and blob: are how a preset loads its own files - nothing about that changes here.
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'ws:' && url.protocol !== 'wss:') return true;
  return url.protocol === 'https:' && details.resourceType === 'image' && NOTIFICATION_IMAGE_HOSTS.test(url.hostname);
}

function watchPresetWindow(win) {
  const id = win.webContents.id;
  presetWebContentsIds.add(id);
  win.on('closed', () => presetWebContentsIds.delete(id));
}

function createNotificationWindow(data = {}) {
  const presetFolder = resolvePresetFolder(data.preset);
  if (!presetFolder) {
    debug.log('[overlay-notif] no usable preset found under app/presets');
    return null;
  }
  const presetHtml = path.join(presetFolder, 'index.html');

  const scaleRaw = Number(data.scale);
  const requestedScale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
  const volumeRaw = Number(data.volume);
  const volumePercent = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(200, volumeRaw)) : 100;
  const { width: baseW, height: baseH } = getPresetDimensions(presetFolder);
  const position = data.position || 'center-bottom';
  let customAnchor = null;
  if (position === 'custom') {
    const requestedAnchor = gamePreset.normalizeCustomPosition(data.customPosition);
    const gamePositionAppid = String(data.gamePositionAppid || '');
    const savedGameAnchor = gamePositionAppid ? gamePreset.getSettings(gamePositionAppid).customPosition : null;
    customAnchor = requestedAnchor || savedGameAnchor || readOverlayBounds().notif || null;
  }
  const workArea = notificationPlacementArea(customAnchor);
  // Scale the host window in both directions, then cap the effective scale to the current work
  // area. This keeps small themes tightly anchored and large themes visible instead of clipping.
  const geometry = notificationBounds.fitNotificationScale({
    baseWidth: baseW,
    baseHeight: baseH,
    scale: requestedScale,
    workArea,
    margin: 0,
  });
  const { x, y, width: w, height: h } = computeNotificationBounds(
    position,
    geometry.width,
    geometry.height,
    workArea,
    customAnchor
  );
  const scale = geometry.scale;

  debug.log(
    '[overlay-notif] preset=' +
      path.basename(presetFolder) +
      ' pos=' +
      position +
      ' scale=' +
      requestedScale +
      '→' +
      scale +
      ' volume=' +
      volumePercent +
      '% size=' +
      w +
      'x' +
      h
  );

  const reposition = data.reposition === true;
  const notif = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // Reposition witnesses must be focusable on Windows or their draggable region can let the
    // mouse gesture fall through to the main window behind them. Real notifications stay inert.
    focusable: reposition,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../notificationPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // notificationPreload.js requires only `electron`, which is all a sandboxed preload may use,
      // so a community preset's own script runs in an OS-sandboxed renderer. Verified with a real
      // preset: load, IPC payload and the host's executeJavaScript/insertCSS all still work.
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      // The host owns the scaling (see setZoomFactor below); set it up front so the preset's very
      // first layout already happens at its design size.
      zoomFactor: scale,
    },
  });

  notif.setAlwaysOnTop(true, 'screen-saver');
  notif.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const lockedCustomBounds = position === 'custom' && !reposition ? { x, y, width: w, height: h } : null;
  if (lockedCustomBounds) {
    // A real custom-position notification is click-through and must never be nudged by a preset,
    // focus/workspace transition or accidental native move. Reassert its exact saved bounds both
    // before display and whenever Windows proposes a move.
    notif.on('will-move', (event) => {
      event.preventDefault();
      if (!notif.isDestroyed()) notif.setBounds(lockedCustomBounds, false);
    });
    notif.on('show', () => {
      if (!notif.isDestroyed()) notif.setBounds(lockedCustomBounds, false);
    });
    notif.on('move', () => {
      if (notif.isDestroyed()) return;
      const current = notif.getBounds();
      if (current.x !== lockedCustomBounds.x || current.y !== lockedCustomBounds.y) {
        notif.setBounds(lockedCustomBounds, false);
      }
    });
  }
  watchPresetWindow(notif);
  // Real notifications are click-through; the reposition witness stays interactive so it can be dragged.
  if (reposition) {
    // Be explicit instead of relying on BrowserWindow's default: this window may be created after
    // a click-through notification and Windows otherwise keeps routing the drag to what is behind it.
    notif.setIgnoreMouseEvents(false);
    notif.setFocusable(true);
  } else {
    notif.setIgnoreMouseEvents(true, { forward: true });
  }
  notif.loadFile(presetHtml);

  // Localized fallback labels for presets that render a placeholder when the payload has no
  // display name/description (e.g. the defensive `'Achievement Unlocked'` text in the themes).
  const notifStrings = loadNotificationStrings();

  // Match the proven overlayWindow pattern: show inactively once content is loaded
  // (no reliance on 'ready-to-show', which the working in-game overlay also avoids).
  notif.webContents.on('did-finish-load', () => {
    if (notif.isDestroyed()) return;
    // Scaling belongs to the host: zooming the page by the preset's scale factor lays it out at its
    // design size, filling the window exactly (a self-scaling preset would shrink dense layouts twice).
    // Chromium remembers a zoom level per file, which overrules `zoomFactor`, so reassert it here too.
    notif.webContents.setZoomFactor(scale);
    notif.webContents.send('show-notification', {
      displayName: data.displayName != null ? data.displayName : notifStrings.achievementUnlocked || 'Achievement Unlocked',
      description: data.description != null ? data.description : '',
      // The game the unlock came from. `displayName` carries the ACHIEVEMENT title, so without this
      // a popup could never say where it happened; presets that do not ask for it simply ignore it.
      gameName: data.gameName != null ? String(data.gameName) : '',
      rarityPercent: data.rarityPercent,
      notificationType: data.notificationType || '',
      // Reference-project presets key on these: `isPlatinum` (Xbox Series Platinum diamond) and
      // `headerPath` (Game Cover background). Keep them as aliases of our own fields.
      isPlatinum: String(data.notificationType || '').toLowerCase() === 'platinum',
      iconPath: data.iconPath || data.icon || '',
      gameIconPath: data.gameIconPath || data.gameIcon || '',
      imagePath: data.imagePath || data.image || '',
      headerPath: data.imagePath || data.image || '',
      progress: data.progress || null,
      progressCurrent: data.progress && data.progress.current,
      progressMax: data.progress && data.progress.max,
      progressPercent: data.progress && data.progress.percent,
      position: data.position,
      // Neutral by contract: the page zoom above already renders the preset at the chosen size, and
      // a preset that scales itself on top of it would shrink or enlarge the artwork twice.
      scale: 1,
      // Forwarded so presets that support it can match their animation to the user's duration.
      durationMs: Number.isFinite(Number(data.durationMs)) ? Number(data.durationMs) : undefined,
      fallback: {
        achievementUnlocked: notifStrings.achievementUnlocked || 'Achievement Unlocked',
        achievement: notifStrings.achievement || 'Achievement',
        unknownOperation: notifStrings.unknownOperation || 'Unknown operation',
        unknownReward: notifStrings.unknownReward || 'Unknown reward',
      },
    });
    notif.showInactive();
    // Optional notification sound: volume is 0-200%, use a WebAudio gain node above 100% (Audio.volume
    // caps at 1.0), falling back to clamped Audio.volume if WebAudio is unavailable.
    if (data.soundPath) {
      // In packaged builds the sound lives under app.asar.unpacked (see electron-builder asarUnpack).
      const u = String(data.soundPath).replace(/\\/g, '/').replace('app.asar/', 'app.asar.unpacked/');
      const src = u.startsWith('file://') ? u : 'file:///' + u;
      const gain = volumePercent / 100;
      notif.webContents
        .executeJavaScript(
          '(function(){try{var a=new Audio(' + JSON.stringify(src) + ');var g=' + gain + ';' +
          'try{var C=window.AudioContext||window.webkitAudioContext;if(C&&g!==1){var ctx=new C();var s=ctx.createMediaElementSource(a);var n=ctx.createGain();n.gain.value=g;s.connect(n);n.connect(ctx.destination);}else{a.volume=Math.min(1,g);}}catch(e){a.volume=Math.min(1,g);}' +
          'a.play().catch(function(){});}catch(e){}})();'
        )
        .catch(() => {});
    }
    // Reposition mode: overlay a full-window drag region so the user can place the popup, and persist
    // the chosen top-left as the 'custom' anchor. executeJavaScript is privileged (bypasses preset CSP).
    if (reposition) {
      // The presets have different CSPs. Electron's inserted CSS is not blocked by their
      // `style-src`, unlike assigning `style.cssText` to a dynamically-created element.
      notif.webContents
        .insertCSS(
          '#aw-notification-reposition-drag {' +
            'position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;' +
            '-webkit-app-region: drag !important; cursor: move !important;' +
            'background: rgba(0, 0, 0, 0.001) !important;' +
          '}'
        )
        .then(() =>
          notif.webContents.executeJavaScript(
            "(function(){var d=document.getElementById('aw-notification-reposition-drag');if(!d){d=document.createElement('div');d.id='aw-notification-reposition-drag';document.documentElement.appendChild(d);}})();"
          )
        )
        .catch(() => {});
    }
    // Custom duration: hold on screen by FREEZING all animations ~3s in for the chosen time, then
    // resume (an interval catches newly-started ones too). Close is deferred (ipc.js, awFrozenUntil)
    // so a preset's own self-close can't cut the hold short. 'auto' = no freeze.
    const holdMs = Number.isFinite(Number(data.durationMs)) && Number(data.durationMs) > 0 ? Number(data.durationMs) : 0;
    if (holdMs > 0 && !reposition) {
      const FREEZE_AFTER = 3000;
      notif.awFrozenUntil = Date.now() + FREEZE_AFTER + holdMs + 1200; // +tail so the exit can finish
      notif.webContents
        .executeJavaScript(
          '(function(){var F=' + FREEZE_AFTER + ',H=' + holdMs + ';' +
          'function all(){try{return document.getAnimations?document.getAnimations():[];}catch(e){return [];}}' +
          'setTimeout(function(){' +
          'all().forEach(function(a){try{a.pause();}catch(e){}});' +
          'var iv=setInterval(function(){all().forEach(function(a){try{a.pause();}catch(e){}});},100);' +
          'setTimeout(function(){clearInterval(iv);all().forEach(function(a){try{a.play();}catch(e){}});},H);' +
          '},F);})();'
        )
        .catch(() => {});
    }
  });

  if (reposition) {
    let persistPositionTimer = null;
    const persistNotificationPosition = () => {
      if (notif.isDestroyed()) return;
      const bounds = notif.getBounds();
      const customPosition = { x: bounds.x, y: bounds.y };
      const gameAppid = String(data.repositionGameAppid || '');
      if (!gameAppid) {
        writeOverlayBounds({ notif: customPosition });
        return;
      }
      const settings = gamePreset.getSettings(gameAppid);
      settings.position = 'custom';
      settings.customPosition = customPosition;
      if (!gamePreset.setSettings(gameAppid, settings)) {
        debug.log(`[game-preset] could not save custom position for ${gameAppid}`);
        return;
      }
      if (MainWin && !MainWin.isDestroyed()) {
        MainWin.webContents.send('game-preset:custom-position', { appid: gameAppid, customPosition });
      }
    };
    // `move` is the cross-platform BrowserWindow event and fires on Windows while dragging.
    // `moved` is macOS-specific, so listening only to it silently lost the chosen position here.
    notif.on('move', () => {
      clearTimeout(persistPositionTimer);
      persistPositionTimer = setTimeout(persistNotificationPosition, 80);
    });
    notif.on('close', () => {
      clearTimeout(persistPositionTimer);
      persistNotificationPosition();
    });
  }

  // Safety net: the preset normally self-closes via window.api.closeNotificationWindow(). With a
  // custom duration the catch-all must outlast 3s + hold + exit (never cut short, see ipc.js's defer).
  // 'auto' keeps the 20s catch-all; the reposition witness stays up much longer.
  const customMs = Number(data.durationMs);
  const closeAfter = reposition ? 120000 : Number.isFinite(customMs) && customMs > 0 ? 3000 + customMs + 4000 : 20000;
  const safety = setTimeout(() => {
    if (!notif.isDestroyed()) notif.close();
  }, closeAfter);
  notif.on('closed', () => clearTimeout(safety));

  return notif;
}

// Serial queue: one overlay notification on screen at a time. The next opens once the current
// window closes (each preset closes itself via window.api.closeNotificationWindow()).
let notifQueue = [];
let notifActive = false;
let notifActiveWindow = null;

// Guard against the same overlay notification rendering twice in quick succession: when the app is
// open, this persistent process receives every Watchdog-forwarded notification, so a duplicate spawn
// would stack two identical overlays. Keyed by content within a short window.
const recentNotifKeys = new Map();
function isDuplicateNotification(data) {
  try {
    const progress = data.progress ? `${data.progress.current || 0}/${data.progress.max || 0}` : '';
    const key = [data.displayName || '', data.description || '', data.iconPath || data.icon || '', progress].join('');
    const now = Date.now();
    for (const [k, t] of recentNotifKeys) if (now - t > 5000) recentNotifKeys.delete(k);
    const last = recentNotifKeys.get(key);
    recentNotifKeys.set(key, now);
    return last != null && now - last < 5000;
  } catch {
    return false;
  }
}

/* Every notification (unlock, playtime, progress, Settings preview) enters here, which is why the
   square logo is resolved at this one point; a cached answer costs nothing, a first card waits briefly. */
let squareLogoChain = Promise.resolve();
function enqueueNotification(data) {
  const payload = data || {};
  // Chained rather than fired in parallel: two notifications arriving together must reach the queue
  // in the order they were raised, and one of them having to look its logo up must not overtake the
  // other. The popups are shown one at a time anyway, so the wait costs nothing on screen.
  squareLogoChain = squareLogoChain
    .then(() => withSquareGameLogo(payload).catch(() => payload))
    .then(
      (resolved) => enqueueResolvedNotification(resolved),
      () => enqueueResolvedNotification(payload)
    );
}

function enqueueResolvedNotification(data) {
  data = data || {};
  if (data.test !== true && MainWin && isDuplicateNotification(data)) {
    debug.log('[overlay-notif] duplicate suppressed (app open): ' + (data.displayName || ''));
    // Suppressed because the identical popup is already on screen: the user is being told, so this
    // must not read as a delivery failure and pull a Windows notification in beside it.
    reportNotificationOutcome(data.notifyId, 'rendered', true, 'duplicate');
    return;
  }
  // A Settings test replaces whatever is on screen right away instead of queuing
  // behind it, so preset previews can be chained as fast as the tester clicks.
  if (data.test === true && notifActiveWindow && !notifActiveWindow.isDestroyed()) {
    notifActiveWindow.close();
  }
  notifQueue.push(data);
  processNotificationQueue();
}
function processNotificationQueue() {
  if (notifActive) return;
  const data = notifQueue.shift();
  if (!data) return;
  notifActive = true;
  let win = null;
  try {
    win = createNotificationWindow(data);
  } catch (err) {
    debug.log('[overlay-notif] spawn failed: ' + (err.message || err));
  }
  if (!win) {
    reportNotificationOutcome(data.notifyId, 'rendered', false, 'no-window');
    notifActive = false;
    if (notifQueue.length) {
      setTimeout(processNotificationQueue, 50);
    } else if (shouldQuitApp()) {
      // Unreachable: shouldQuitApp() is a hard false now that the Watchdog is a child of this resident
      // tray daemon, so notifications always render here and nothing needs to quit.
      app.quit();
    }
    return;
  }
  notifActiveWindow = win;
  // The page loading is the last thing this process can actually witness about the popup: the window
  // exists, the preset rendered and showInactive() ran. Anything past that (a game covering it in
  // exclusive full screen) is not observable from here and is not claimed to be.
  if (data.notifyId) {
    win.webContents.once('did-finish-load', () => reportNotificationOutcome(data.notifyId, 'rendered', true, 'shown'));
    win.webContents.once('did-fail-load', (event, code, description) =>
      reportNotificationOutcome(data.notifyId, 'rendered', false, `load-failed:${description || code}`)
    );
  }
  win.on('closed', () => {
    if (notifActiveWindow === win) notifActiveWindow = null;
    notifActive = false;
    setTimeout(processNotificationQueue, 150);
  });
}

ipcMain.on('spawn-overlay-notification', (event, data) => {
  enqueueNotification(data || {});
});

// Settings > Notifications "preview" button next to the hotkey field: opens the real in-game overlay
// with a real game's achievement data so the look (and the configured hotkey binding) can be checked
// without a game actually running. Toggles like the hotkey itself - a second click while it is open
// closes it rather than stacking a duplicate window.
ipcMain.on('overlay-preview', (event, appid) => {
  if (overlayVisible) {
    hideOverlayWindow('preview-toggle');
    return;
  }
  if (!appid) return;
  createOverlayWindow({ appid: String(appid), source: 'steam', action: 'open' });
});

// The overlay header's × button (and Escape, which shares this path). Closing the window is all
// that is needed: its 'closed' handler reports the new state to the monitor, whatever triggered it.
ipcMain.on('overlay-close', () => {
  hideOverlayWindow('close');
});

function normalizeNotificationProgress(args) {
  const max = Number(args.progressMax);
  if (!Number.isFinite(max) || max <= 1) return null;
  const currentRaw = Number(args.progressCurrent);
  const current = Math.max(0, Math.min(max, Number.isFinite(currentRaw) ? currentRaw : 0));
  const percentArg = Number(args.progressPercent);
  const percent = Number.isFinite(percentArg)
    ? Math.max(0, Math.min(100, Math.floor(percentArg)))
    : Math.max(0, Math.min(100, Math.floor((current / max) * 100)));
  return { current, max, percent };
}

// A thumbnail a preset can actually paint: a local file that is still there. A remote URL that was
// never downloaded, or a path to a deleted cover, renders as an empty box - which is what the
// notification looked like for games whose artwork had gone missing.
function paintableIconPath(candidate) {
  const value = String(candidate || '');
  if (!value || /^https?:\/\//i.test(value)) return '';
  try {
    return fs.existsSync(value) ? value : '';
  } catch {
    return '';
  }
}

const localIcons = require('../util/localIcons.js');

/*
  The executable the library resolved for a game, straight from cfg/exeList.db.

  The main process has no game object - a notification carries an appid and a name - but it does
  have the same file the Play button launches from, and that path is what points localIcons at the
  install folder. Read on demand rather than cached: the file changes whenever a scan re-links a
  game, and this runs at most once per notification.

  Several ids are accepted because callers here hold the Steam appid while exeList.db is keyed on
  the library one, and for a namespaced game (SocialClub, Uplay R2) those are not the same value.
*/
function configuredExecutable(...appids) {
  const ids = appids.map((value) => String(value == null ? '' : value).trim()).filter(Boolean);
  if (ids.length === 0) return '';
  try {
    const list = JSON.parse(fs.readFileSync(path.join(userData, 'cfg', 'exeList.db'), 'utf8'));
    if (!Array.isArray(list)) return '';
    for (const id of ids) {
      const entry = list.find((row) => row && String(row.appid) === id);
      if (entry && entry.exe && fs.existsSync(entry.exe)) return String(entry.exe);
    }
    return '';
  } catch {
    return '';
  }
}

/*
  A square logo for a card whose thumbnail is game artwork.

  SteamGridDB's icon set is the only source of a real square logo, so it wins whenever it answers -
  but a first-time lookup must not hold the popup back, so it is given a short window and left to
  finish in the background (populating its cache for the next notification) if it misses it.

  Everything the game already has is then tried in turn, because the first candidate is regularly
  unusable on its own: Steam's 32x32 clienticon is too small to cut anything out of, and a cover the
  user has since deleted is not there at all. Falling through to the poster or the header is what
  keeps a card from ending up with an empty square.
*/
async function resolveSquareGameLogo(appid, gameName, candidates, { ignoreOverride = false, libraryAppid = '', exe = '' } = {}) {
  const { makeSquareLogo } = require('../util/squareLogo.js');
  const localSquare = (source) => {
    try {
      return makeSquareLogo(source, appid, { userDataRoot: userData }) || '';
    } catch {
      return '';
    }
  };

  /*
    A user's own pick outranks every lookup below, and it is resolved here rather than only in the
    page that offers it: this function is what the notification card and the overlay ask, so making
    it the one gate is what keeps a chosen icon the same icon everywhere.

    `ignoreOverride` is how the icon picker shows what "Default" would restore: the same answer,
    minus the decision, so the tile previews the icon rather than describing it.
  */
  if (!ignoreOverride) {
    try {
      const gameIconStore = require('../util/gameIconStore.js');
      // The page stores a pick under the LIBRARY appid, which for a namespaced game (SocialClub,
      // Uplay R2, GOG/Epic) is not the Steam one this function is called with. Both are tried, the
      // same way the Watchdog does it, or the chosen icon is silently ignored for those games.
      const override = gameIconStore.get(appid) || (libraryAppid ? gameIconStore.get(libraryAppid) : null);
      if (override && gameIconStore.isUsable(override)) {
        const asFile = /^file:/i.test(override) ? require('url').fileURLToPath(override) : override;
        const local = paintableIconPath(asFile);
        if (local) return local;
        const downloaded = paintableIconPath(await fetchSteamIcon(override, appid).catch(() => ''));
        if (downloaded) return downloaded;
      }
    } catch (err) {
      debug.log(`[artwork] custom icon lookup failed for "${gameName || appid}": ${err.message || err}`);
    }
  }

  /*
    The game's own executable icon, extracted once and reused by both attempts below.

    A 256px entry is the game's real, modern icon: it is what Windows paints for it on the desktop,
    it needs no network, and it beats a square cut out of a poster - so at that size it is taken
    before anything is looked up. A smaller one is a legacy stamp and keeps its old place in the
    chain, after the community icon set has had its go.
  */
  let executableIcon = null;
  try {
    const executable = String(exe || '') || configuredExecutable(appid, libraryAppid);
    executableIcon = executable ? await fetchExecutableIcon(executable, appid) : null;
  } catch (err) {
    debug.log(`[artwork] executable icon lookup failed for "${gameName || appid}": ${err.message || err}`);
  }
  const executableIconAtLeast = (side) =>
    executableIcon && Math.min(executableIcon.width, executableIcon.height) >= side ? paintableIconPath(executableIcon.path) : '';

  const highResExecutableIcon = executableIconAtLeast(PREFERRED_EXECUTABLE_ICON_SIDE);
  if (highResExecutableIcon) return highResExecutableIcon;

  try {
    const lookup = fetchSteamGridDbIcon(gameName, appid).catch(() => null);
    const icon = await Promise.race([lookup, new Promise((resolve) => setTimeout(() => resolve(null), SGDB_ICON_WAIT_MS))]);
    if (icon && icon.url) {
      const local = await Promise.race([
        fetchSteamIcon(icon.url, appid).catch(() => ''),
        new Promise((resolve) => setTimeout(() => resolve(''), SGDB_ICON_DOWNLOAD_WAIT_MS)),
      ]);
      const square = local ? localSquare(local) : '';
      if (square) return square;
    }
  } catch {
    /* the community icon set is a bonus, never a requirement */
  }

  /*
    A smaller executable icon, still before any of the store artwork.

    That artwork is not icon-shaped: the clienticon is a 32x32 sprite, and everything else is a
    header or a library grid that has to be CUT into a square - which lands on whatever part of a
    poster happens to sit in the middle. Under MIN_EXECUTABLE_ICON_SIDE the exe loses that argument
    too and the chain goes on.
  */
  const usableExecutableIcon = executableIconAtLeast(MIN_EXECUTABLE_ICON_SIDE);
  if (usableExecutableIcon) return usableExecutableIcon;

  let firstPaintable = '';
  for (const candidate of Array.isArray(candidates) ? candidates : [candidates]) {
    const value = String(candidate || '');
    if (!value) continue;
    /*
      A card cannot paint a URL, and it cannot paint a fetch-icon token either: `game.img.icon` is a
      bare Steam content hash and `header` a fragment like "<hash>/header.jpg". Anything that is not
      already a file on disk therefore goes through the same resolver every view uses, which turns
      both shapes into a cached local file. Handing those over unresolved is what left an empty
      square on games whose artwork had never been downloaded.
    */
    const local =
      paintableIconPath(value) ||
      paintableIconPath(
        await Promise.race([
          fetchSteamIcon(value, appid).catch(() => ''),
          new Promise((resolve) => setTimeout(() => resolve(''), SGDB_ICON_DOWNLOAD_WAIT_MS)),
        ])
      );
    if (!local) continue;
    if (!firstPaintable) firstPaintable = local;
    const square = localSquare(local);
    if (square) return square;
  }
  if (firstPaintable) return firstPaintable;
  /*
    Last resort, and the only one that costs no network at all: artwork the game itself ships. A
    player whose connection cannot reach Steam's CDN has nothing above this line - which is exactly
    the state issue #38 describes - and the install folder usually holds a usable logo.
  */
  const shipped = localIcons.gameIconCandidates({ binary: configuredExecutable(appid, libraryAppid) })[0] || '';
  if (shipped) return localSquare(shipped) || shipped;
  // Nothing could be cut: keep the best artwork that at least exists, so the card shows the game
  // rather than a hole. With nothing paintable at all this is '' and the preset hides its thumbnail.
  return firstPaintable;
}

/*
  The same square logo, for the views that paint a game in a square box.

  The achievement page's header icon and the Health panel's notification test both used to resolve
  their own artwork through fetch-icon and take whatever came back: Steam's 32x32 clienticon when
  there was one (a blurry stamp beside a crisp title) and an empty box when there was not. They now
  ask for the answer this module already computes for notifications, so all of them show the same
  logo for a given game and none of them repeats the fallback logic.

  Returns a file URL, exactly like the fetch-icon handler these callers came from, or '' when the
  game has no usable artwork at all - which the caller must render as "no icon", not as a broken one.
*/
ipcMain.handle('resolve-square-logo', async (event, request) => {
  const { appid, libraryAppid, name, sources, ignoreOverride, exe } = request || {};
  try {
    const square = await resolveSquareGameLogo(
      appid == null ? '' : String(appid),
      String(name || ''),
      Array.isArray(sources) ? sources : [sources],
      { ignoreOverride: ignoreOverride === true, libraryAppid: libraryAppid == null ? '' : String(libraryAppid), exe: String(exe || '') }
    );
    return (square && require('../util/iconUrl.js').iconResultToFileUrl(square)) || '';
  } catch (err) {
    debug.log(`[artwork] square logo lookup failed for "${name || appid}": ${err.message || err}`);
    return '';
  }
});

/*
  Give any notification payload - a real unlock or a Settings preview - the square logo its preset
  will paint. Both paths converge on enqueueNotification(), which is why the resolution lives here
  rather than in the Watchdog-facing path alone: a preview that framed a raw 2:3 poster was showing
  the user something no real notification would look like.
*/
async function withSquareGameLogo(data) {
  const payload = data || {};
  const achievementIcon = payload.achievementIconPath || '';
  const primary = payload.iconPath || payload.icon || '';
  // A real achievement icon is already square and already right; only game artwork is reworked.
  if (primary && achievementIcon && primary === achievementIcon) return payload;

  const candidates = [primary, payload.gameIconPath || payload.gameIcon || '', payload.imagePath || payload.image || ''];
  const square = await resolveSquareGameLogo(
    payload.appid == null ? '' : String(payload.appid),
    String(payload.gameName || ''),
    candidates
  );
  if (square === primary) return payload;
  return Object.assign({}, payload, { iconPath: square, icon: square });
}

function resolvePrimaryNotificationIcon({ notificationType, iconPath, gameIconPath, imagePath, progress }) {
  const type = String(notificationType || '').toLowerCase();
  // Playtime: prefer the Steam library art (gameIcon) over the achievement-style `icon`, which is
  // Steam's tiny img_icon_url and renders blurry/low-res next to a high-res header. Keep it as a
  // fallback for the rare appid that has no library art.
  if (type === 'playtime') return gameIconPath || iconPath || imagePath || '';
  if (progress) return iconPath || gameIconPath || imagePath || '';
  return iconPath || imagePath || gameIconPath || '';
}

// Build an overlay notification from the CLI args the Watchdog passes to a `--wintype=notification`
// process. This process never runs startEngines (that's the main-window path), so configJS is null
// here - load the user's overlay settings (preset/position/scale/sound) directly from options.ini so
// the notification respects them. The icon is passed as a URL and resolved from the on-disk cache the
// Watchdog already prefetched into; a short race guards against a slow/offline fetch hanging the
// transient process (it would otherwise never reach window-all-closed and quit).
async function enqueueNotificationFromArgs(args) {
  let cfg = configJS;
  if (!cfg) {
    try {
      // settings.load() is async and must be awaited, or the overlay preset/position/scale/sound are
      // silently ignored (falling back to 'Default', which can be unresolvable → no window).
      cfg = await require(path.join(__dirname, '../settings.js')).load();
    } catch {
      cfg = {};
    }
  }
  const ov = (cfg && cfg.overlay) || {};
  const gameSettings = gamePreset.getSettings(args.appid);
  const notifyId = args.notifyId ? String(args.notifyId) : '';

  const progress = normalizeNotificationProgress(args);
  const notificationType = String(args.notificationType || (progress ? 'progress' : '') || '').toLowerCase();
  // Per-emulator preset overrides ('' = main preset): the source lets Xenia/RPCS3/ShadPS4
  // notifications use their own preset. Rare and 100% are states the chosen preset paints itself.
  const candidates = presetPriority({
    presets: {
      // Set in the game's own panel and read from memory, so an unlock costs no disk read for it.
      game: gameSettings.preset,
      main: ov.notificationPreset || DEFAULT_PRESET,
      xenia: ov.notificationPresetXenia || '',
      rpcs3: ov.notificationPresetRpcs3 || '',
      shadps4: ov.notificationPresetShadps4 || '',
    },
    source: args.source || '',
  });

  /*
    Answer the monitor before fetching any artwork. With no preset folder on disk there is nothing to
    render and saying so immediately is what lets the watchdog put this one notification on a Windows
    toast instead - a report sent after the downloads, or after this popup waited its turn in the
    queue, would arrive far too late to be the difference between one notification and none.
  */
  const { name: preset, folder: presetFolder } = resolveNotificationPreset(candidates);
  if (!presetFolder) {
    debug.log(`[overlay-notif] no usable preset folder for "${candidates.join('", "')}" - telling the monitor this notification cannot be shown`);
    reportNotificationOutcome(notifyId, 'accepted', false, 'no-preset');
    return;
  }
  reportNotificationOutcome(notifyId, 'accepted', true, preset);

  let iconPath = '';
  if (args.icon) {
    try {
      iconPath =
        (await Promise.race([fetchSteamIcon(String(args.icon), args.appid), new Promise((resolve) => setTimeout(() => resolve(''), 4000))])) || '';
    } catch {
      /* icon is optional */
    }
  }

  let gameIconPath = '';
  if (args.gameIcon) {
    try {
      gameIconPath =
        (await Promise.race([fetchSteamIcon(String(args.gameIcon), args.appid), new Promise((resolve) => setTimeout(() => resolve(''), 4000))])) ||
        '';
    } catch {
      /* game art is optional */
    }
  }

  let imagePath = '';
  if (args.image) {
    try {
      imagePath =
        (await Promise.race([fetchSteamIcon(String(args.image), args.appid), new Promise((resolve) => setTimeout(() => resolve(''), 4000))])) || '';
    } catch {
      /* header art is optional */
    }
  }

  const primaryIconPath = resolvePrimaryNotificationIcon({ notificationType, iconPath, gameIconPath, imagePath, progress });

  // Playtime (and any caller passing --silent) must never play the overlay sound.
  const silent = !!args.silent;
  // "Random sound" picks a fresh file from the merged bundled+user sound list for each popup.
  const randomSound = ov.randomSound === true;
  /*
    A preset may name its own sound, which then wins over the one picked in the Notifications tab:
    that is what lets a shared package sound the way its author designed it, and what makes a
    per-emulator or platinum preset able to bring its own fanfare. '' means the preset has no opinion.
    Random sound still overrides everything - it is an explicit "surprise me" for every popup.
  */
  const presetOwnSound = customPreset.presetSound(presetFolder);
  const globalSound = () =>
    randomSound
      ? notificationSounds.pickRandomSound([path.join(__dirname, '../sounds'), userSoundsDir()]) ||
        resolveNotificationSound(ov.notificationSound)
      : resolveNotificationSound(presetOwnSound || ov.notificationSound);
  let chosenSound = '';
  if (!silent) {
    if (gameSettings.sound === gamePreset.SOUND_NONE) chosenSound = '';
    else if (gameSettings.sound === gamePreset.SOUND_RANDOM) {
      chosenSound =
        notificationSounds.pickRandomSound([path.join(__dirname, '../sounds'), userSoundsDir()]) || globalSound();
    } else if (gameSettings.sound) chosenSound = resolveNotificationSound(gameSettings.sound) || globalSound();
    else chosenSound = globalSound();
  }
  if (!gameSettings.sound && presetOwnSound && !silent && !randomSound)
    debug.log(`[overlay-notif] preset "${preset}" brings its own sound: ${presetOwnSound}`);
  const displayName =
    (args.displayName != null && String(args.displayName).trim()) ||
    (args.gameDisplayName != null && String(args.gameDisplayName).trim()) ||
    t('achievement-unlocked', 'Achievement Unlocked', 'Succès débloqué');

  const durSec = ov.notificationDuration === 'auto' || ov.notificationDuration == null ? 0 : Number(ov.notificationDuration) || 0;
  enqueueNotification({
    appid: args.appid == null ? '' : String(args.appid),
    notifyId,
    preset,
    position: gameSettings.position || ov.notificationPosition || 'center-bottom',
    scale: gameSettings.scale || ov.notificationScale || 1,
    customPosition: gameSettings.customPosition || null,
    volume: Number.isFinite(Number(ov.notificationVolume)) ? Number(ov.notificationVolume) : 100,
    durationMs: durSec > 0 ? durSec * 1000 : undefined,
    // Playtime notifications pass the game name in both fields. Keeping the dedicated game-name
    // fallback prevents a lost/empty displayName argument from becoming "Achievement Unlocked".
    displayName,
    // Forwarded as its own field too, for presets that print the game beside what was unlocked.
    gameName: args.gameDisplayName != null ? String(args.gameDisplayName) : '',
    description: args.description != null ? String(args.description) : '',
    rarityPercent: Number.isFinite(Number(args.rarityPercent)) ? Number(args.rarityPercent) : null,
    notificationType,
    iconPath: primaryIconPath,
    achievementIconPath: iconPath,
    gameIconPath,
    imagePath,
    progress,
    soundPath: chosenSound,
  });
}

// Notification sounds live in two places: bundled (app/sounds) and user-imported (<userData>/sounds).
// A user file shadows a bundled file of the same name.
function userSoundsDir() {
  return path.join(userData, 'sounds');
}
/*
  Pictures a preset can use as its background, in one shared folder rather than per preset.

  Same shape as the sounds folder above and for the same reason: the designer can only offer what it
  can list. Writing a preset COPIES the chosen picture into the preset's own folder, so the preset
  itself stays self-contained and an .awpreset carries the image with it.
*/
function userPresetImagesDir() {
  return path.join(userData, 'presets', 'images');
}
function resolveNotificationSound(name) {
  if (!name) return '';
  // A settings file written before the bundled sounds were renamed still names the old file.
  for (const candidate of [name, notificationSounds.renamedSound(name)]) {
    if (!candidate) continue;
    for (const p of [path.join(userSoundsDir(), candidate), path.join(__dirname, '../sounds', candidate)]) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
  }
  return '';
}

// Scratch preset the builder's Preview button renders through. It is a real preset folder (so the
// preview goes through the exact same notification path as a saved one) but a reserved name, hidden
// from every list so it can never be picked, exported or left behind as a "preset" the user made.
const PREVIEW_PRESET_NAME = '__aw-preview__';

// List available preset names (Default Presets + Users Presets) for the settings dropdown.
ipcMain.handle('list-presets', async () => {
  const out = [...refreshNotificationPresetFolders().keys()].filter((name) => name !== PREVIEW_PRESET_NAME);
  out.sort((a, b) => a.localeCompare(b));
  return out;
});

// Preset designer: the schema lives in util/presetSchema.js and the generator in
// util/customPreset.js (pure string work, unit-tested); this file owns file placement and naming.
const customPreset = require(path.join(__dirname, '../util/customPreset.js'));
const { customPresetNumbers, buildCustomPresetHtml, buildCustomPresetCss, sanitizePresetName } = customPreset;
// The two package readers and the SAN importer each pull the zip and semver libraries, and every one
// of them is reached from a file dialog the user has to open first. Loaded when one of those runs.
const presetPackage = lazyRequire(path.join(__dirname, '../util/presetPackage.js'));
const presetSchema = require(path.join(__dirname, '../util/presetSchema.js'));
const sanImport = lazyRequire(path.join(__dirname, '../util/sanImport.js'));

/*
  Where a preset the builder generates is written: <userData>, never the app folder. Once packaged,
  app/presets lives inside app.asar - a single file - so mkdir below it fails with ENOTDIR, which
  broke Preview and Save on every installed build while a dev run worked. Sounds (userSoundsDir) and
  user themes already work this way, and it also means generated presets survive an update.
  The rule itself lives in util/customPreset.js so it can be unit-tested.
*/
const usersPresetsDir = () => customPreset.generatedPresetsDir(userData);

// Read-only preset libraries shipped with the app. Generated presets are looked up first, so
// re-saving under a bundled name shadows it rather than being ignored.
const bundledPresetRoots = () => [
  path.join(__dirname, '../presets/Default Presets'),
  path.join(__dirname, '../presets/Users Presets'),
];

// The builder's own options, stored next to the generated files. Without it a generated preset is
// write-only: the CSS can be read back but the eight slider/colour values that produced it cannot,
// so tweaking a preset meant rebuilding it from memory. Purely additive - the notification engine
// never reads this file, and a preset that predates it simply cannot be re-opened.
const { PRESET_OPTIONS_FILE } = customPreset;

/*
  Put the preset's background picture beside its stylesheet.

  The generated CSS names it as a bare filename relative to style.css, so the file has to be there.
  It is taken from the shared images folder, or left alone when the preset already carries it, which
  is what lets an imported preset be re-saved without its background having to exist twice.
*/
function copyPresetImage(dir, name) {
  if (!name) return;
  const destination = path.join(dir, name);
  try {
    if (fs.existsSync(destination)) return;
    const source = path.join(userPresetImagesDir(), name);
    if (!fs.existsSync(source)) return;
    fs.copyFileSync(source, destination);
  } catch (err) {
    debug.log('[custom-preset] background image not copied: ' + (err.message || err));
  }
}

function writeCustomPreset(name, opts) {
  const dir = path.join(usersPresetsDir(), name);
  const values = customPresetNumbers(opts);
  fs.mkdirSync(dir, { recursive: true });
  copyPresetImage(dir, values.bgImage);
  fs.writeFileSync(path.join(dir, 'index.html'), buildCustomPresetHtml(opts), 'utf8');
  fs.writeFileSync(path.join(dir, 'style.css'), buildCustomPresetCss(opts), 'utf8');
  fs.writeFileSync(path.join(dir, PRESET_OPTIONS_FILE), JSON.stringify({ name, ...values }, null, 2), 'utf8');
  invalidateNotificationPresetFolders();
  return dir;
}

ipcMain.handle('create-custom-preset', async (event, opts = {}) => {
  try {
    const name = sanitizePresetName(opts.name);
    if (!name) return { ok: false, error: 'invalid-name' };
    if (name === PREVIEW_PRESET_NAME) return { ok: false, error: 'reserved-name' };
    const existed = fs.existsSync(path.join(usersPresetsDir(), name, 'index.html'));
    debug.log('[custom-preset] wrote ' + writeCustomPreset(name, opts));
    return { ok: true, name, replaced: existed };
  } catch (err) {
    debug.log('[custom-preset] failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  Presets the app put in "Users Presets" itself, i.e. the ones it may list and delete: generated by
  the builder (options file) or installed from a package (manifest). A preset dropped in that folder
  by hand still carries neither marker and stays untouchable, as it always has.
*/
// Read from customPreset, which exports both: touching presetPackage here would load it (and its zip
// library) on every start, for a constant.
const PRESET_MARKERS = [PRESET_OPTIONS_FILE, customPreset.PRESET_PACKAGE_FILE];
const managedPresetMarker = (name) => PRESET_MARKERS.find((file) => fs.existsSync(path.join(usersPresetsDir(), name, file))) || '';

// `editable` is what the builder can load back into its controls; an imported preset without
// builder options behind it is listed for export and deletion only.
ipcMain.handle('list-custom-presets', async () => {
  try {
    return fs
      .readdirSync(usersPresetsDir())
      .filter((name) => name !== PREVIEW_PRESET_NAME && managedPresetMarker(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, editable: managedPresetMarker(name) === PRESET_OPTIONS_FILE }));
  } catch {
    return [];
  }
});

/*
  Load one managed preset back into the builder. `editable` is false for an imported preset with no
  builder options behind it - its look lives in files a slider cannot reproduce, so the builder shows
  it for export and deletion only rather than loading meaningless defaults over the user's controls.
  null when the preset is not one of ours at all.
*/
ipcMain.handle('read-custom-preset', async (event, name) => {
  const safe = sanitizePresetName(name);
  if (!safe || !managedPresetMarker(safe)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(usersPresetsDir(), safe, PRESET_OPTIONS_FILE), 'utf8'));
    return { name: safe, editable: true, ...customPresetNumbers(parsed) };
  } catch {
    return { name: safe, editable: false };
  }
});

/*
  Delete a preset the app installed. Deliberately narrow: the folder must sit directly under
  "Users Presets" AND carry one of the app's own markers, so a bundled preset (or anything a user
  hand-authored in there) can never be removed through this channel. Without it the builder could
  only ever add to the preset list - a throwaway attempt had to be deleted from Explorer.
*/
ipcMain.handle('delete-custom-preset', async (event, name) => {
  const safe = sanitizePresetName(name);
  if (!safe || safe === PREVIEW_PRESET_NAME) return { ok: false, error: 'invalid-name' };
  const dir = path.join(usersPresetsDir(), safe);
  try {
    if (path.dirname(path.resolve(dir)) !== path.resolve(usersPresetsDir())) return { ok: false, error: 'outside-users-presets' };
    if (!managedPresetMarker(safe)) return { ok: false, error: 'not-generated-here' };
    fs.rmSync(dir, { recursive: true, force: true });
    gamePreset.removePreset(safe);
    invalidateNotificationPresetFolders();
    debug.log('[custom-preset] deleted ' + dir);
    return { ok: true, name: safe };
  } catch (err) {
    debug.log('[custom-preset] delete failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  Rename a preset the app installed. Same narrowness as deleting - the folder must sit directly under
  "Users Presets" and carry one of the app's own markers - plus the one thing a rename adds: the new
  name must be free, so a rename can never merge two presets or overwrite one.

  Only the folder moves. A preset's files never name the preset, so nothing inside has to be
  rewritten; what does have to follow is whichever notification setting pointed at the old name, and
  that is the renderer's job because it owns those menus.
*/
ipcMain.handle('rename-custom-preset', async (event, request = {}) => {
  const from = sanitizePresetName(request.from);
  const to = sanitizePresetName(request.to);
  if (!from || !to || from === PREVIEW_PRESET_NAME || to === PREVIEW_PRESET_NAME) return { ok: false, error: 'invalid-name' };
  if (from === to) return { ok: true, name: to };

  const source = path.join(usersPresetsDir(), from);
  const target = path.join(usersPresetsDir(), to);
  try {
    if (path.dirname(path.resolve(source)) !== path.resolve(usersPresetsDir())) return { ok: false, error: 'outside-users-presets' };
    if (path.dirname(path.resolve(target)) !== path.resolve(usersPresetsDir())) return { ok: false, error: 'outside-users-presets' };
    if (!managedPresetMarker(from)) return { ok: false, error: 'not-generated-here' };
    // Case-insensitive on Windows, so "Slate" to "slate" is the same folder and is allowed through.
    if (fs.existsSync(target) && target.toLowerCase() !== source.toLowerCase()) return { ok: false, error: 'name-taken' };
    fs.renameSync(source, target);
    gamePreset.renamePreset(from, to);
    invalidateNotificationPresetFolders();
    debug.log('[custom-preset] renamed ' + source + ' -> ' + target);
    return { ok: true, name: to, from };
  } catch (err) {
    debug.log('[custom-preset] rename failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

// Render the design currently in the builder without saving it: write the scratch preset and hand
// its reserved name back, so the caller fires an ordinary test notification through it. Previewing
// used to require creating the preset first, which filled the preset list with throwaway attempts.
ipcMain.handle('preview-custom-preset', async (event, opts = {}) => {
  try {
    writeCustomPreset(PREVIEW_PRESET_NAME, opts);
    return { ok: true, name: PREVIEW_PRESET_NAME };
  } catch (err) {
    debug.log('[custom-preset] preview failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  Portable presets (.awpreset): export/import as a single self-contained package. The format lives
  in util/presetPackage.js; this side only resolves folders and drives the file dialogs.
*/

// Strict lookup for export: the preset folder must exist under that exact name. resolvePresetFolder
// is deliberately not reused, since its fallback to "Default" would silently export the wrong preset.
function findPresetFolder(name) {
  for (const root of [usersPresetsDir(), ...bundledPresetRoots()]) {
    const dir = path.join(root, name);
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

/*
  The portable packages - .awpreset, .awtheme and the .san import - are a leaf: every one of them is
  an ipcMain handler and nothing here calls back into them. They live in presetLibrary.js and are
  handed what changes while the app runs as getters, so a theme applied later still reaches the
  overlay window that exists at that moment rather than the one open now.
*/
require('./presetLibrary.js').register({
  userData,
  debug,
  t,
  getConfig: () => configJS,
  getOverlayWindow: () => overlayWindow,
  isOverlayVisible: () => overlayVisible,
  currentThemePayload,
  usersPresetsDir,
  bundledPresetRoots,
  userSoundsDir,
  userPresetImagesDir,
  findPresetFolder,
  invalidateNotificationPresetFolders,
  resolveSquareGameLogo,
  writeCustomPreset,
  PREVIEW_PRESET_NAME,
});

// NOTE: overlay notifications are no longer rendered from an app-side WebSocket bridge. The Watchdog
// now spawns a `--wintype=notification` process for each overlay notification (see watchdog
// notification/toaster.js), so they appear with the main app closed; when the app is open the
// single-instance lock forwards the args to it via 'second-instance'. This avoids the duplicate that
// a still-listening bridge would cause and removes the "app must be open" requirement.

function checkResources() {
  function copyFolderRecursive(src, dst) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dst, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const srcPath = path.join(src, e.name);
      const dstPath = path.join(dst, e.name);
      if (e.isDirectory()) {
        copyFolderRecursive(srcPath, dstPath);
      } else {
        let shouldCopy = false;
        if (!fs.existsSync(dstPath)) shouldCopy = true;
        else {
          try {
            fs.accessSync(dstPath, fs.constants.W_OK);
            const srcStat = fs.statSync(srcPath);
            const dstStat = fs.statSync(dstPath);
            if (srcStat.size !== dstStat.size || srcStat.mtimeMs > dstStat.mtimeMs) shouldCopy = true;
          } catch {}
        }
        if (shouldCopy) fs.copyFileSync(srcPath, dstPath);
      }
    }
  }

  const resourcesPath = path.join(manifest.config.debug ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'userdata'));

  // Media/ is deliberately not copied any more: it held byte-identical duplicates of app/sounds/,
  // and no code path ever read <userData>/Media - notification sounds resolve against the bundled
  // app/sounds plus user-imported <userData>/sounds. An existing Media/ folder from an older install
  // is left in place rather than deleted; it is inert and the user owns that directory.
  const view = path.join(resourcesPath, 'view');
  copyFolderRecursive(view, path.join(userData, 'view'));

  const source = path.join(resourcesPath, 'Source');
  copyFolderRecursive(source, path.join(userData, 'Source'));

  // Startup registration is user-controlled from Settings > General.
}

// ICONDIR: reserved, type, count, then 16 bytes per image, where a 0 width means 256. Only the PNG
// entries are collected, since that is the form addRepresentation takes as a data URL.
function readIcoPngFrames(file) {
  const frames = new Map();
  const buffer = fs.readFileSync(file);
  if (buffer.length < 6) return frames;
  const count = buffer.readUInt16LE(4);
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    if (at + 16 > buffer.length) break;
    const width = buffer.readUInt8(at) || 256;
    const bytes = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    if (offset + bytes > buffer.length) continue;
    const data = buffer.subarray(offset, offset + bytes);
    if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47) frames.set(width, data);
  }
  return frames;
}

/*
  The notification area asks for a 16x16 logical icon, which is 20 real pixels at 125% display
  scaling and 24 at 150%. nativeImage decodes an .ico as one 256x256 bitmap at scale factor 1, so
  the shell shrinks that single picture by 13x and the trophy comes out soft and grey. The file
  already carries a hand-sized frame for every scaling step, so each one is handed over as its own
  representation and Windows draws the pixels that were drawn for it.
*/
function trayIconImage(icoFile) {
  const frames = readIcoPngFrames(icoFile);
  const base = frames.has(16) ? nativeImage.createFromBuffer(frames.get(16), { scaleFactor: 1 }) : null;
  if (!base || base.isEmpty()) return null;
  for (const [scaleFactor, size] of [
    [1.25, 20],
    [1.5, 24],
    [2, 32],
    [2.5, 40],
    [3, 48],
  ]) {
    const frame = frames.get(size);
    if (!frame) continue;
    base.addRepresentation({ scaleFactor, dataURL: `data:image/png;base64,${frame.toString('base64')}` });
  }
  return base;
}

// System tray - the app lives here. Single left-click / "Open" shows the UI window; "Quit" is the only
// way to actually exit (it sets app.isQuiting so before-quit tears down the monitor).
let tray = null;
function createTray() {
  if (tray) return tray;
  try {
    const iconPath = path.join(__dirname, '../resources/icon/icon.ico');
    let image = null;
    try {
      image = trayIconImage(iconPath);
    } catch (err) {
      debug.log(`[tray] icon frames unreadable, falling back to the whole file: ${err.message || err}`);
    }
    if (!image || image.isEmpty()) {
      // Only PNG-encoded frames are collected. An icon rebuilt with a tool that stores the small
      // sizes as BMP would land here and quietly go back to the blurry single-bitmap tray icon.
      debug.log('[tray] no usable 16px PNG frame in icon.ico, drawing the whole file instead');
      image = nativeImage.createFromPath(iconPath);
    }
    tray = new Tray(image.isEmpty() ? iconPath : image);
    tray.setToolTip('Achievement Watcher Next');
    const rebuildMenu = () => {
      const contextMenu = Menu.buildFromTemplate([
        { label: t('open-achievement-watcher', 'Open AW Next', 'Ouvrir AW Next'), click: () => createMainWindow() },
        {
          label: t('restart-background-monitor', 'Restart background monitor', 'Redémarrer le moniteur en arrière-plan'),
          click: () => restartWatchdog(),
        },
        { type: 'separator' },
        {
          label: t('quit', 'Quit', 'Quitter'),
          click: () => {
            app.isQuiting = true;
            app.quit();
          },
        },
      ]);
      tray.setContextMenu(contextMenu);
    };
    rebuildMenu();
    tray.on('click', () => createMainWindow());
    tray.on('double-click', () => createMainWindow());
    debug.log('[tray] created');
  } catch (err) {
    debug.log(`[tray] failed to create: ${err.message || err}`);
  }
  return tray;
}

try {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
  // Registered the first time the updater is actually used, not at boot - see getUpdater().
  registerUpdaterEvents = (autoUpdater) => {
    autoUpdater.on('checking-for-update', () => {
      debug.log('[updater] checking for updates');
      setUpdateStatus({ type: 'checking' });
    });
    autoUpdater.on('update-available', async (info) => {
      // A manifest that names the running version, or an older one, is not an update however it got
      // here - answer it as "up to date" before anything reports an update or downloads an installer.
      if (updateGate.isNotAnUpgrade(info.version, app.getVersion())) {
        debug.log(`[updater] ignoring ${info.version}: not newer than the installed ${app.getVersion()}`);
        manualUpdateResult = 'uptodate';
        manualUpdateCheckPending = false;
        setUpdateStatus({ type: 'not-available' });
        return;
      }
      debug.log(`[updater] update available: ${info.version}`);
      manualUpdateResult = 'available';
      setUpdateStatus({ type: 'available', version: info.version });
      const manual = manualUpdateCheckPending;
      manualUpdateCheckPending = false; // the dialog below already answers a manual check
      // Claim the prompt BEFORE the first await. Checking here and setting the flag after
      // startEngines() let two checks landing in the same tick (the hourly timer racing the Settings
      // button) both walk past the guard and stack two dialogs on the user.
      if (updatePromptOpen) {
        debug.log('[updater] a prompt is already open; ignoring duplicate update-available');
        return;
      }
      updatePromptOpen = true;
      try {
        try {
          await startEngines();
        } catch (err) {
          debug.log(`[updater] config load failed before prompt: ${err.message || err}`);
        }
        if (shouldSuppressUpdatePrompt(info.version, { manual })) return;
        // A game can start between the check being fired and this handler running, and a manual check
        // is a deliberate request that should still answer. Nothing is recorded - the offer is only
        // held back, and the game-exit signal brings it straight back.
        if (!manual && isGameRunning()) {
          debug.log(`[updater] version ${info.version} held back: a game is running`);
          scheduleUpdateCheck(updateGate.INTERVALS.inGame);
          return;
        }
        // "View changelog" is not an answer: showMessageBox closes on any click, so reading the notes
        // reopens the same dialog instead of deciding for the user.
        let response;
        do {
          ({ response } = await dialog.showMessageBox({
            type: 'info',
            title: t('update-available', 'Update Available', 'Mise à jour disponible'),
            message: t('update-available-message', 'A new version ({version}) is available.', 'Une nouvelle version ({version}) est disponible.', { version: info.version }),
            detail: t('download-and-install-it-now', 'Download and install it now?', 'La télécharger et l’installer maintenant ?'),
            buttons: [
              t('download-install', 'Download && Install', 'Télécharger && installer'),
              t('view-changelog', 'View changelog', 'Voir les nouveautés'),
              t('later', 'Later', 'Plus tard'),
              t('skip-this-version', 'Skip this version', 'Ignorer cette version'),
            ],
            defaultId: 0,
            cancelId: 2,
          }));
          if (response === 1) {
            const page = links.releaseTag(info.version);
            debug.log(`[updater] opening the release notes of ${info.version}: ${page}`);
            shell.openExternal(page).catch((err) => debug.log(`[updater] could not open ${page}: ${err.message || err}`));
          }
        } while (response === 1);
        if (response === 0) {
          debug.log(`[updater] user accepted download of ${info.version}${manual ? ' (manual check)' : ''}`);
          updateDownloading = true;
          // The click is the explicit consent, regardless of whether the dialog came from the hourly
          // check or Settings > Check for updates. A manual check alone must not silently install.
          updateAcceptedByUser = true;
          startUpdateDownload(info.version);
        } else if (response === 3) {
          configJS.general.skippedVersion = info.version;
          await settingsJS.save(configJS, { keepMainOwnedKeys: false });
          debug.log(`[updater] version ${info.version} skipped by user`);
          setUpdateStatus({ type: 'reset' });
        } else {
          // "Later" (and the dialog's cancel path, which maps to it).
          await postponeUpdate(info.version);
          setUpdateStatus({ type: 'reset' });
        }
      } finally {
        updatePromptOpen = false;
      }
    });
    autoUpdater.on('update-not-available', (info) => {
      debug.log(`[updater] current version is up to date (${info.version})`);
      manualUpdateResult = 'uptodate';
      // Without this the state machine stays on 'checking' and the title-bar chip shows "Checking..."
      // forever, since being up to date is the one outcome no other event follows.
      setUpdateStatus({ type: 'not-available' });
      if (manualUpdateCheckPending && tray) {
        manualUpdateCheckPending = false;
        try {
          tray.displayBalloon({
            iconType: 'info',
            title: t('achievement-watcher', 'AW Next'),
            content: t('up-to-date', 'You are already using the latest version ({version}).', 'Vous utilisez déjà la dernière version ({version}).', { version: info.version }),
          });
        } catch {}
      }
    });
    // The download can take minutes on a slow line and gives no sign of life otherwise: the window is
    // usually closed (tray daemon) and the app never says it is busy. Every surface that can show it -
    // the taskbar bar, the tray tooltip, the title-bar chip and Settings - is driven from the updater's
    // own byte counter through the shared status, which throttles the broadcast to whole percents.
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.max(0, Math.min(100, Number(progress && progress.percent) || 0));
      setUpdateStatus({
        type: 'progress',
        percent,
        bytesPerSecond: Number(progress && progress.bytesPerSecond) || 0,
        transferred: Number(progress && progress.transferred) || 0,
        total: Number(progress && progress.total) || 0,
      });
      // One line per 10% rather than per chunk, so the log stays readable.
      const step = Math.floor(percent / 10);
      if (step !== updateProgressLogged) {
        updateProgressLogged = step;
        const speed = Math.round((Number(progress && progress.bytesPerSecond) || 0) / 1024);
        debug.log(`[updater] downloading: ${percent.toFixed(0)}% (${speed} KB/s)`);
      }
    });
    // A download the user stopped is not a failure: leave no error on screen and no half state behind.
    autoUpdater.on('update-cancelled', (info) => {
      debug.log(`[updater] download of ${info && info.version} cancelled by the user`);
      updateDownloading = false;
      updateAcceptedByUser = false;
      clearUpdateDownloadProgress();
    });
    autoUpdater.on('error', (err) => {
      const message = summarizeUpdaterError(err);
      // The recovery below re-runs downloadUpdate(), which only means anything while a download is
      // actually in flight. Outside one there is no update info to download and the retry can only
      // fail with "Please check update first", so a stray checksum error stays an ordinary error.
      if (isChecksumMismatchError(err) && updateDownloading) {
        if (checksumRetryInFlight) {
          // The retry's own downloadUpdate() rejection already goes through the catch block below;
          // this is electron-updater's duplicate 'error' emission for that same second failure.
          return;
        }
        checksumRetryInFlight = true;
        debug.log(`[updater] checksum mismatch (${message}); clearing the update cache and retrying the download once`);
        (async () => {
          let cacheDir = '';
          try {
            cacheDir = await clearUpdaterCacheDir();
            debug.log(`[updater] update cache cleared: ${cacheDir}`);
          } catch (clearErr) {
            debug.log(`[updater] could not clear the update cache: ${clearErr.message || clearErr}`);
          }
          try {
            const token = newCancellationToken();
            updateDownloadCancellation = token;
            updateProgressLogged = -1;
            setUpdateStatus({ type: 'download-started', version: currentUpdateStatus.version });
            await autoUpdater.downloadUpdate(token);
            updaterErrorNotified = false; // the retry succeeded; let a future failure notify again
          } catch (retryErr) {
            if (updateDownloadCancellation && updateDownloadCancellation.cancelled) return;
            await notifyChecksumRecoveryFailed(summarizeUpdaterError(retryErr), cacheDir);
          } finally {
            checksumRetryInFlight = false;
          }
        })();
        return;
      }
      notifyUpdateError(message);
    });
    autoUpdater.on('update-downloaded', (info) => {
      updateDownloading = false;
      updateProgressLogged = -1;
      updateDownloadCancellation = null;
      setUpdateStatus({ type: 'downloaded', version: info.version });
      promptDownloadedUpdate(info);
    });
  };
  // Nothing calls the updater before this point, but if that ever changes the listeners still land.
  if (updaterModule) registerUpdaterEvents(updaterModule.autoUpdater);

  promptDownloadedUpdate = async function (info) {
    // "Download && Install" was already explicit consent. Once downloaded, run the NSIS upgrade and
    // relaunch AW; settings/user data live outside the install directory and survive.
    if (updateGate.shouldHoldInstall({ gameRunning: isGameRunning(), acceptedByUser: updateAcceptedByUser })) {
      debug.log(`[updater] upgrade to ${info.version} held back: a game is running`);
      pendingInstallPrompt = info;
      setUpdateStatus({ type: 'held', version: info.version });
      // Saying nothing here is what made this look like a broken updater: the download completes,
      // the install never happens, and the next check offers the same version again.
      notifyUpdateHeldBack(info.version);
      return;
    }
    pendingInstallPrompt = null;
    updateAcceptedByUser = false;
    await startUpdateInstall(info);
  };

  /*
    Hand over to the installer without the app simply vanishing.

    quitAndInstall() closes every window and spawns the NSIS installer. Run silently (/S) that
    installer has no window at all, so for several seconds the machine shows nothing: AW is gone,
    nothing has replaced it, and the honest reading is that it crashed. Two things fix that, and
    both are needed:

      - the installer runs with its own progress page (build/installer.nsh skips the license,
        directory, install-mode and finish pages for an --updated run), so a real window appears and
        stays until the new version is launched. This is NSIS's own UI, not a reimplementation of it;
      - before quitting, the app says what is about to happen on every surface it still owns (the
        title-bar chip, the tray balloon, the taskbar's indeterminate bar) and waits long enough for
        that to be seen, so the gap between the last AW frame and the first installer frame is
        explained rather than blank.

    `general.silentUpdateInstall` restores the old windowless behaviour for anyone who wants it.
  */
  async function startUpdateInstall(info) {
    const silent = !!(configJS && configJS.general && configJS.general.silentUpdateInstall);
    setUpdateStatus({ type: 'installing', version: info.version });
    debug.log(`[updater] installing ${info.version} (${silent ? 'silent' : 'with the installer progress window'}) and restarting`);
    if (tray) {
      try {
        tray.displayBalloon({
          iconType: 'info',
          title: t('achievement-watcher', 'AW Next'),
          content: t(
            'update-installing-detail',
            'Installing version {version}. AW Next closes and reopens on its own - this takes a few seconds.',
            'Installation de la version {version}. AW Next se ferme et se rouvre tout seul, cela prend quelques secondes.',
            { version: info.version }
          ),
        });
      } catch {}
    }
    // Long enough for the chip and the balloon to paint before the windows go away, short enough
    // that nobody experiences it as a hang. A failure to wait must never block the install.
    await new Promise((resolve) => setTimeout(resolve, INSTALL_HANDOVER_MS));
    try {
      getUpdater().quitAndInstall(silent, true);
    } catch (err) {
      // The installer could not be started at all: say so rather than sitting on "installing".
      notifyUpdateError(`could not start the installer: ${err.message || err}`);
    }
  }

  bootMark('init');
  app
    .on('ready', async function () {
      bootMark('ready');
      ipc.window();
      applySessionHardening();
      // Startup-only init for the resident tray daemon (runs once, regardless of --hidden):
      // load config, copy resources, sync the login item, create the tray, then spawn/supervise the monitor.
      try {
        await startEngines();
      } catch (err) {
        debug.log('[startEngines] failed before startup sync: ' + err.message);
      }
      bootMark('config');
      logStartupDiagnostics();
      try {
        checkResources();
      } catch (err) {
        debug.log('[checkResources] failed: ' + err.message);
      }
      bootMark('resources');
      // The window goes up before the rest of the startup work, not after it. Everything below runs
      // on this one thread - the login-item sync touches the registry, the stale-Watchdog sweep shells
      // out to netstat - while the window is a separate process that spends its first second parsing
      // a page and loading its own modules. Opening it first overlaps the two instead of queueing
      // them; nothing below is needed to display a library.
      if (safeMode) startupArgs.hidden = false;
      const startupToast = parseToastActivation(process.argv);
      if (startupToast) startupArgs.hidden = false; // clicking a toast must surface the window
      try {
        parseArgs(startupArgs); // opens the window unless launched with --hidden
        openGameFromLaunchArgs(startupToast || startupArgs); // toast activation on a cold start
      } catch (err) {
        debug.log('[startup] opening the window failed: ' + (err.message || err));
      }
      bootMark('window');
      if (!manifest.config.debug) {
        try {
          ipc.setStartWithWindows(configJS?.general?.startWithWindows !== false);
        } catch (err) {
          debug.log('[startup] failed to sync login item: ' + (err.message || err));
        }
      }
      createTray();
      // electron-updater reads resources/app-update.yml generated by electron-builder. Checking a
      // few seconds after startup keeps the tray responsive; failed checks retry and healthy checks
      // re-run periodically while the app stays resident (see scheduleUpdateCheck). Development
      // runs never contact the release feed.
      if (app.isPackaged) scheduleUpdateCheck(8000);
      if (safeMode) {
        debug.log('[safe-mode] startup monitor/background scans skipped');
      } else {
        if (!watchdogSwept) {
          watchdogSwept = true;
          // Sweep stale detached Watchdogs from older app versions once, before the first launch.
          // They would hold port 8082 / the single-instance lock and double-fire notifications.
          await killWatchdog();
        }
        launchWatchdog();
        scheduleBackgroundAutoFix(); // headless emulator auto-fix while the window stays closed
      }
      bootMark('monitor');
      debug.log(`[perf][boot] ${bootTimeline()}`);
      // Cap the per-appid icon cache off the startup critical path (LRU by access time, ~1 GiB
      // default; no-op when under cap).
      setTimeout(() => {
        try {
          const { pruneIconCache } = require(path.join(__dirname, '../util/iconCache.js'));
          const r = pruneIconCache(path.join(userData, 'steam_cache', 'icon'));
          if (r.count > 0)
            debug.log(`[iconCache] pruned ${r.count} folder(s), freed ${(r.freed / 1048576).toFixed(0)}MB (was ${(r.before / 1048576).toFixed(0)}MB)`);
        } catch (err) {
          debug.log('[iconCache] prune skipped: ' + (err.message || err));
        }
      }, 15000);
    })
    .on('window-all-closed', function () {
      // Resident tray daemon: do NOT quit when the window closes - the tray + background monitor stay
      // alive. The app exits only via the tray "Quit" item.
    })
    .on('web-contents-created', (event, contents) => {
      // Default-deny popups for every window (overlay, notification presets, hidden scrape window).
      // MainWin overrides this right after creation with its own handler that routes http(s) links
      // to the OS browser. (Replaces the dead 'new-window' listener - removed in Electron 22.)
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    })
    .on('second-instance', async (event, argv, cwd) => {
      // A second launch (user re-running the exe, e.g. from the Start menu while it sits hidden in
      // the tray) should surface the UI window.
      debug.log(`[second-instance] argv=${JSON.stringify(argv || [])}`);
      const args = normalizeWindowArgs(minimist(argv.slice(1)));
      if ((args['wintype'] || 'main') === 'main') createMainWindow();
      else parseArgs(args);

      // A toast click re-launches the exe with the achievement-watcher:// URI: surface the window
      // and open the game page even when a first instance was already running.
      openGameFromLaunchArgs(parseToastActivation(argv) || args);
    })
    .on('before-quit', function () {
      // Resident tray daemon: the monitor is our supervised child, so terminate it on a real quit
      // instead of leaking a background process. app.isQuiting also disables the respawn supervisor.
      app.isQuiting = true;
      clearTimeout(monitorRespawnTimer);
      // Hand the overlay shortcut back to the system: nothing is left to act on it, and holding it
      // would deny the combination to whatever the user opens next.
      unregisterOverlayHotkey();
      if (monitorProc) {
        debug.log('[monitor] terminating monitor child on quit');
        try {
          monitorProc.kill();
        } catch {}
        monitorProc = null;
      }
    });
  }
} catch (err) {
  dialog.showErrorBox(
    t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
    `${t('failed', 'Failed.', 'Échec.')}\n${err}`
  );
  app.quit();
}
