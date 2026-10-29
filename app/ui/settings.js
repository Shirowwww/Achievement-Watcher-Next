'use strict';

const remote = require('@electron/remote');
const path = require('path');
// app.js is loaded immediately after this file as a classic script and declares `const fs` in the
// same global lexical scope. Keep a settings-specific name here or Chromium rejects all of app.js.
const settingsFs = require('fs');

const appPath = remote.app.getAppPath();
const { escapeHtml } = require(path.join(appPath, 'util/escapeHtml.js'));
const userThemes = require(path.join(appPath, 'util/userThemes.js'));
const themeLayers = require(path.join(appPath, 'util/themeLayers.js'));
const themeMock = require(path.join(appPath, 'util/themeMock.js'));
const themeFonts = require(path.join(appPath, 'util/themeFonts.js'));
const DEFAULT_THEME_COLOR = themeLayers.BUILTIN_COLORS.default.bg;
const emulatorFixEligibility = require(path.join(appPath, 'util/emulatorFixEligibility.js'));
const { panelToClose } = require(path.join(appPath, 'util/panelEscape.js'));
const { focusTrapTarget } = require(path.join(appPath, 'util/panelFocus.js'));
const { t } = require(path.join(appPath, 'locale/t.js'));
// Renamed from the module's own name: the main window loads app.js and every ui/*.js as classic
// scripts sharing one global scope, and app.js already declares `libraryChrome` (see
// test/integration/rendererScope.test.js).
const settingsLibraryChrome = require(path.join(appPath, 'util/libraryChrome.js'));
const settingsSteamId64 = require(path.join(appPath, 'util/steamId64.js'));
const settingsRarityTiers = require(path.join(appPath, 'util/rarityTiers.js'));
const libraryRefresh = require(path.join(appPath, 'util/libraryRefresh.js'));
const { renamedSound, tierSound } = require(path.join(appPath, 'util/notificationSounds.js'));
const interfaceMode = require(path.join(appPath, 'util/interfaceMode.js'));
const settingsContainers = require(path.join(appPath, 'util/settingsContainers.js'));
const settingsDependencies = require(path.join(appPath, 'util/settingsDependencies.js'));
const { legacyPresetAlias } = require(path.join(appPath, 'util/notificationPreset.js'));
const notificationPlacement = require(path.join(appPath, 'util/notificationPlacement.js'));
const { describeFolderDiagnosis } = require(path.join(appPath, 'util/folderDiagnosis.js'));
const clipProfile = require(path.join(appPath, 'util/clipProfile.js'));
const { prefixFolder } = require(path.join(appPath, 'util/prefixFolder.js'));
// Where OBS points a Browser source. The Watchdog serves the selected preset at /obs on its own
// websocket listener, whose port is fixed in watchdog/websocket.js - the two are kept in step by
// test/core/obsSourceUrl.test.js rather than by a second setting nobody would ever change.
const OBS_SOURCE_URL = 'http://127.0.0.1:8082/obs';

/*
  Switching automatic repair on is the moment to mention the antivirus, and the only one.

  Once it is on, the files are written during a scan: no dialog, nothing on screen, and an alert that
  nobody connects back to a setting they changed days earlier. The alert itself cannot be prevented -
  these files replace a game's Steam or Ubisoft library, which is the shape detection looks for, and
  it fires the moment they are written, whether they were downloaded or shipped with the app. What
  can be done is to say so first, and offer the exclusion before anything is written rather than after.
*/
async function confirmAutomaticEmulatorFix() {
  let defenderActive = false;
  try {
    defenderActive = await require('electron').ipcRenderer.invoke('defender:is-active');
  } catch {
    /* an unanswered probe only costs the exclusion button */
  }

  const buttons = [t('cancel', 'Cancel', 'Annuler')];
  const actions = ['cancel'];
  if (defenderActive) {
    buttons.push(t('av-allow-in-defender', 'Allow in Windows Defender', 'Autoriser dans Windows Defender'));
    actions.push('exclude');
  }
  buttons.push(t('autofix-enable', 'Turn it on', 'Activer'));
  actions.push('enable');

  const answer = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'question',
    title: t('autofix-confirm-title', 'Repair newly detected games automatically?', 'Réparer automatiquement les nouveaux jeux détectés ?'),
    message: t(
      'autofix-confirm-message',
      'Emulator files will be written into the folder of every newly detected game that needs them, during a scan.',
      'Des fichiers d’émulateur seront écrits dans le dossier de chaque nouveau jeu détecté qui en a besoin, pendant un scan.'
    ),
    detail: t(
      'autofix-confirm-detail',
      'Expect your antivirus to flag them. These files replace a game’s Steam or Ubisoft library, which is exactly what detection engines look for, and the alert appears the moment they are written - while a scan is running, with nothing on screen to connect it to. They are safe, nothing is sent anywhere, and they are the files installed with the app.',
      'Attends-toi à ce que ton antivirus les signale. Ces fichiers remplacent la bibliothèque Steam ou Ubisoft du jeu, ce qui est précisément ce que cherchent les antivirus, et l’alerte arrive au moment de l’écriture : pendant un scan, sans rien à l’écran qui permette de faire le lien. Ils sont sains, rien n’est envoyé nulle part, et ce sont les fichiers installés avec l’app.'
    ),
    buttons,
    defaultId: buttons.length - 1,
    cancelId: 0,
    noLink: true,
  });

  const picked = actions[answer];
  if (picked === 'cancel') return false;
  // Said here, so the scan does not say it again the first time the setting acts.
  if (app.config && app.config.emulator) app.config.emulator.autoApplyNotice = true;
  if (picked === 'exclude') {
    const folder = path.join(remote.app.getPath('userData'), 'cache');
    const result = await require('electron')
      .ipcRenderer.invoke('defender:add-exclusion', folder)
      .catch(() => ({ ok: false }));
    // Declining the UAC prompt is an answer about the exclusion, not about the setting: the user
    // asked for automatic repair either way, and is told what the exclusion does and does not cover.
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: result && result.ok ? 'info' : 'warning',
      title: t('av-exclusion-added-title', 'Exclusion added', 'Exclusion ajoutée'),
      message:
        result && result.ok
          ? t(
              'autofix-exclusion-added',
              'Windows Defender will leave this app’s own copies alone. The copy written into a game folder can still be flagged.',
              'Windows Defender laissera tranquilles les copies de l’app. Celle écrite dans le dossier d’un jeu peut encore être signalée.'
            )
          : t('av-exclusion-failed', 'The exclusion could not be added. Add it by hand in Windows Security, then try again.', "L'exclusion n'a pas pu être ajoutée. Ajoute-la à la main dans Sécurité Windows, puis réessaie."),
      detail: folder,
      noLink: true,
    });
  }
  return true;
}

// Sentinel for "Random"; has no extension so it can never collide with a real filename (SOUND_RE in presetSchema.js).
const RANDOM_SOUND_VALUE = '__random__';
// The global dropdown uses '' for silence, but a per-game blank means "inherit". This distinct
// value lets one game explicitly mute its popup while every other game keeps the global sound.
const NO_SOUND_VALUE = '__none__';
// The rows that override the unlock sound for one kind of popup, or for one emulator's games.
const TIER_SOUND_SELECTS = '#option_overlaySoundRare, #option_overlaySoundPlatinum, #option_overlaySoundProgress';
const EMULATOR_SOUND_SELECTS = {
  '#option_overlaySoundXenia': 'notificationSoundXenia',
  '#option_overlaySoundRpcs3': 'notificationSoundRpcs3',
  '#option_overlaySoundShadps4': 'notificationSoundShadps4',
  '#option_overlaySoundKytyps5': 'notificationSoundKytyps5',
};
const PICKED_SOUND_SELECTS = [TIER_SOUND_SELECTS, ...Object.keys(EMULATOR_SOUND_SELECTS)].join(', ');

/*
  The library half of a log export: counts for the whole library, and a read-only Game Health report
  for the games most likely behind a bug report (util/gameHealthDigest.js). Built only on click.
  `gameList` and `collectGameHealthSignals` come from app.js and ui/gameHealthPanel.js, which share
  this page's scope; a game whose report fails is noted and the others still go out.
*/
async function logExportLibraryReport() {
  try {
    const gameHealthDigest = require(path.join(appPath, 'util/gameHealthDigest.js'));
    const gameHealth = require(path.join(appPath, 'util/gameHealth.js'));
    const games = typeof gameList !== 'undefined' && Array.isArray(gameList) ? gameList : [];
    const reports = [];
    for (const game of gameHealthDigest.pickGames(games)) {
      try {
        const signals = await collectGameHealthSignals(game.appid, { readOnly: true });
        reports.push(gameHealthDigest.digestEntry(gameHealth.deriveHealth(signals), game));
      } catch (err) {
        reports.push({ appid: String(game.appid), name: game.name || '', error: String((err && err.message) || err) });
      }
    }
    return { library: gameHealthDigest.librarySummary(games), gameHealth: reports };
  } catch (err) {
    debug.log(`[export-logs] library report failed: ${err}`);
    return null;
  }
}

// Frames are created on first use, not shipped in the page: an empty iframe is still a live
// document, and the six of these cost 4.6 MB of renderer memory for panels most users never open.
function ensureFrame(wrap, { id = '', title = '' } = {}) {
  if (!wrap) return null;
  const existing = wrap.querySelector('iframe');
  if (existing) return existing;
  const frame = document.createElement('iframe');
  if (id) frame.id = id;
  if (title) frame.title = title;
  frame.tabIndex = -1;
  frame.setAttribute('scrolling', 'no');
  wrap.appendChild(frame);
  return frame;
}

// Labels set imperatively (outside loader.js's DOM walk) register here so a language change replays them.
const localeRefreshers = [];
function registerLocaleRefresh(apply) {
  localeRefreshers.push(apply);
  apply();
}
// Repaints an account card's state labels after a language change. The locale also reloads on every
// library refresh, so a result the user is still reading (an import summary, an error) stays put.
function repaintAccountState(status, paint) {
  const message = status.text() === status.data('stateText') ? null : { text: status.text(), cls: status.attr('class') };
  paint();
  status.data('stateText', status.text());
  if (message) status.attr('class', message.cls).text(message.text);
}

window.refreshSettingsLocaleText = () => {
  for (const apply of localeRefreshers) {
    try {
      apply();
    } catch (err) {
      debug.log(`settings i18n refresh failed: ${err}`);
    }
  }
};

let listeningHotkey = false;
// What had the keyboard focus before Settings opened, so closing it puts the user back there.
let focusBeforeSettings = null;

// The focused element, looking through shadow roots (the title bar's buttons live in one).
function deepActiveElement() {
  let element = document.activeElement;
  while (element && element.shadowRoot && element.shadowRoot.activeElement) element = element.shadowRoot.activeElement;
  return element;
}
let keysDown = new Set();
let keys = '';
let holdingKeysCheck = null;
// Notifications tab auto-saves on every change once the form is populated; this guard prevents
// the initial `.val(...).change()` population from triggering a save storm / saving stale values.
let settingsReady = false;
let notifAutosaveTimer = null;
const SETTINGS_SAVE_TIMEOUT_MS = 30000;

// Simple hides tabs/rows with a class, never detaches them: loader.js binds `li:nth-child(n)`, so
// moving rows would re-label the UI. Switching mode never writes or resets a hidden control's value.
function currentInterfaceMode() {
  return interfaceMode.resolve(typeof app !== 'undefined' ? app.config : null);
}

// A niche source folds away only while on and contributing no games; reads saved config, not the
// <select>, since this can run before the form is populated.
function applySourceVisibility(mode) {
  const enabled = (typeof app !== 'undefined' && app.config && app.config.achievement_source) || {};
  let librarySources = [];
  try {
    // gameList belongs to app.js, which shares this script scope but evaluates after this file.
    if (typeof gameList !== 'undefined' && Array.isArray(gameList)) librarySources = gameList.map((game) => game && game.source);
  } catch (err) {
    debug.log(`interface mode: library sources unavailable (${err})`);
  }

  const hide = new Set(interfaceMode.hiddenOptionalSources({ mode, enabled, librarySources }));
  for (const key of Object.keys(interfaceMode.OPTIONAL_SOURCES)) {
    $(`#option_${key}`).closest('li').toggleClass(interfaceMode.HIDDEN_CLASS, hide.has(key));
  }
}

// A section whose rows are all folded away would be a bare header; hide it too. Sections gated as a
// whole with data-advanced are already handled by the blanket toggle in applyInterfaceMode.
function foldEmptySections(hidden) {
  $('#settings .box section.content .arrow-list').each(function () {
    if ($(this).closest(`[${interfaceMode.ADVANCED_ATTRIBUTE}]`).length) return;
    const rows = $(this).children('ul').children('li');
    if (rows.length) $(this).toggleClass(hidden, rows.not(`.${hidden}`).length === 0);
  });
}

function applyInterfaceMode() {
  const mode = currentInterfaceMode();
  const simple = interfaceMode.isSimple(mode);
  const hidden = interfaceMode.HIDDEN_CLASS;

  $('#settings').attr('data-interface-mode', mode);

  for (const view of interfaceMode.ADVANCED_VIEWS) {
    $(`#settingNav li[data-view='${view}']`).toggleClass(hidden, simple);
    $(`#settings .box section.content[data-view='${view}']`).toggleClass(hidden, simple);
  }
  // Group headers above hidden tabs would otherwise be left labelling nothing.
  $('#nav-group-emulator').toggleClass(hidden, simple);
  $('#nav-group-advanced').toggleClass(hidden, simple);
  $(`#settings [${interfaceMode.ADVANCED_ATTRIBUTE}], #game-config [${interfaceMode.ADVANCED_ATTRIBUTE}]`).toggleClass(hidden, simple);
  applySourceVisibility(mode);
  foldEmptySections(hidden);

  // The header has no room for a caption, so what each side does is a tooltip on the side itself.
  const hints = {
    simple: t('interface-mode-hint-simple', 'Showing the everyday essentials.', 'Affiche l’essentiel du quotidien.'),
    advanced: t('interface-mode-hint-advanced', 'Showing everything AW Next can do.', 'Affiche tout ce que fait AW Next.'),
  };
  $('#settings-mode .settings-mode-switch button').each(function () {
    const own = $(this).attr('data-mode');
    const selected = own === mode;
    $(this).toggleClass('is-selected', selected).attr('aria-checked', String(selected)).attr('title', hints[own] || '');
  });

  // The Help topic counter is "matches / topics"; hiding topics changes the denominator.
  if (window.AchievementHelp && typeof window.AchievementHelp.applyHelpSearch === 'function') {
    try {
      window.AchievementHelp.applyHelpSearch($, $('#help-search-input').val() || '');
    } catch (err) {
      debug.log(`help search refresh after a mode switch failed: ${err}`);
    }
  }

  // Switching to Simple while sitting on a tab that just disappeared would leave the panel blank.
  const active = $('#settingNav li[data-view].active');
  if (!active.length || active.hasClass(hidden)) {
    $(`#settingNav li[data-view]:not(.${hidden})`).first().trigger('click');
  }
}

// Persists immediately, like the Notifications tab: a control flipped to see its result saves on flip.
function setInterfaceMode(mode) {
  const normalized = interfaceMode.normalize(mode);
  if (!normalized || normalized === currentInterfaceMode()) return;
  if (!app.config.general) app.config.general = {};
  app.config.general.interfaceMode = normalized;
  applyInterfaceMode();
  settings.setUserDataPath(ipcRenderer.sendSync('get-user-data-path-sync'));
  settings.save(app.config).catch((err) => debug.log(err));
}

window.applyInterfaceMode = applyInterfaceMode;

// Built-ins switch <html data-theme>; user/Custom/.awtheme themes inject CSS via the shared style
// element. Resolves once applied: deleting a theme must await it, or its image handles stay open.
function applyThemeValue(value) {
  if (userThemes.usesInjectedCss(value)) {
    document.documentElement.dataset.theme = 'default';
  } else {
    document.documentElement.dataset.theme = value || 'default';
  }
  return ipcRenderer
    .invoke('get-theme-payload', value || 'default')
    .then((payload) => {
      const css = [payload && payload.appCss ? payload.appCss : '', payload && payload.userCss ? payload.userCss : ''].join('\n');
      userThemes.applyCss(css);
    })
    .catch(() => userThemes.applyCss(''));
}

// A theme picked by hand crossfades instead of snapping. The fade waits for the injected CSS, so a
// custom theme lands in one step; reduced motion and a hidden window switch at once.
function fadeTheme(apply) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden;
  if (still || typeof document.startViewTransition !== 'function') return apply();
  return document.startViewTransition(apply).updateCallbackDone;
}

// Eighteen built-ins is too many to choose from cold, so the picker opens on a short contrasting
// set and folds the rest behind "More themes…": they carry data-more, and ui/selectMenu.js opens
// them in place inside the list.
const PRIMARY_THEMES = [
  ['default', 'Steam Blue'],
  ['light', 'Light'],
  ['oled', 'OLED Black'],
  ['graphite', 'Graphite'],
  ['nord', 'Nord'],
  ['dracula', 'Dracula'],
  ['gruvbox', 'Gruvbox'],
];
const MORE_THEMES = [
  ['tokyonight', 'Tokyo Night'],
  ['catppuccin', 'Catppuccin Mocha'],
  ['rosepine', 'Rosé Pine'],
  ['synthwave', "Synthwave '84"],
  ['everforest', 'Everforest'],
  ['ocean', 'Ocean'],
];

// Plain rows on purpose: a native <select> can't control swatch rendering, so a color tint fights
// Chromium's own highlight for the selected row.
function themeOption(value, label) {
  return $('<option>').attr('value', value).text(label);
}

// Imported .awtheme entries, kept so the Delete button knows whether the selected theme is one the
// app installed and may remove. Refreshed with the dropdown.
let installedThemes = [];

// "Custom…" is a permanent scratch slot, never a theme name; Save writes a separate theme and
// leaves this row free for the next idea.
function customThemeLabel() {
  return t('themeCustom', 'Custom…', 'Personnalisé…');
}

// Populate the theme dropdown: the built-ins + Custom + any imported .awtheme + any user theme in
// <userData>\themes.
function populateThemeSelect(preferred) {
  const sel = $('#option_theme');
  const wanted = preferred || (app.config.general && app.config.general.theme) || 'default';
  sel.empty().attr('data-more-label', t('themeMore', 'More themes…', 'Plus de thèmes…'));
  for (const [value, label] of PRIMARY_THEMES) sel.append(themeOption(value, label));
  // The list opens unfolded when one of these is the applied theme, so it is never hidden.
  for (const [value, label] of MORE_THEMES) sel.append(themeOption(value, label).attr('data-more', ''));
  sel.append($('<option>').attr('value', 'custom').text(customThemeLabel()));
  // Both lists in one round trip: saved and imported themes are the same kind of entry here.
  Promise.all([ipcRenderer.invoke('list-installed-themes').catch(() => []), ipcRenderer.invoke('list-user-themes').catch(() => [])])
    .then(([imported, themes]) => {
      installedThemes = Array.isArray(imported) ? imported : [];
      installedThemes.forEach((theme) => sel.append(themeOption(theme.value, theme.name)));
      (themes || []).forEach((theme) =>
        sel.append($('<option>').attr('value', userThemes.valueFor(theme.name)).text(`${t('themeUserPrefix', 'User: ', 'Utilisateur : ')}${theme.name}`))
      );
      const matches = sel.find('option').filter(function () {
        return $(this).val() === wanted;
      });
      sel.val(matches.length ? wanted : 'default').change();
    })
    .catch(() => sel.val(wanted).change());
}

function withSettingsTimeout(promise, label, timeoutMs = SETTINGS_SAVE_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

(function ($, window, document) {
  $(function () {
    const transientStatusTimers = new WeakMap();

    // Starting a new action cancels both phases of the previous timeout so an older callback can't
    // erase the newer message.
    function setTransientStatus(result, message, options = {}) {
      const node = result && result[0];
      if (!node) return;

      const previousTimer = transientStatusTimers.get(node);
      if (previousTimer) clearTimeout(previousTimer);

      result.removeClass('is-hiding').text(message || '').attr('aria-hidden', message ? 'false' : 'true');
      if (!message || options.sticky) {
        transientStatusTimers.delete(node);
        return;
      }

      const visibleFor = Number.isFinite(options.duration) ? options.duration : 4500;
      const fadeTimer = setTimeout(() => {
        result.addClass('is-hiding');
        const clearTimer = setTimeout(() => {
          result.text('').removeClass('is-hiding').attr('aria-hidden', 'true');
          transientStatusTimers.delete(node);
        }, 180);
        transientStatusTimers.set(node, clearTimer);
      }, visibleFor);
      transientStatusTimers.set(node, fadeTimer);
    }

    function forceShowOnboardingDom() {
      $('#settings .box').hide();
      $('#settings').hide();
      if ($('title-bar')[0]) $('title-bar')[0].inSettings = false;
      try {
        const langs = require(path.join(appPath, 'locale/uiLanguages.js'));
        const current = app.config?.achievement?.lang || 'english';
        const selector = $('#onboard-language');
        if (selector.length && selector.children().length === 0) {
          for (const language of langs.all()) {
            selector.append(
              $('<option>')
                .attr('value', language.api)
                .attr('title', language.displayName)
                .text(language.native || language.displayName)
            );
          }
        }
        if (selector.length) selector.val(langs.has(current) ? current : 'english');
      } catch (err) {
        debug.log(`fallback onboarding language fill failed: ${err}`);
      }
      $('#onboarding').attr('aria-hidden', 'false').show();
      $('.onboarding-step').removeClass('active');
      $(".onboarding-step[data-step='0']").addClass('active');
      $('.onboarding-steps button').removeClass('active');
      $(".onboarding-steps button[data-step='0']").addClass('active');
      $('#onboarding-prev').prop('disabled', true);
    }

    function requestOnboardingOpen() {
      window.__awPendingOnboardingOpen = true;
      if (typeof window.openAchievementWatcherOnboarding === 'function') {
        window.__awPendingOnboardingOpen = false;
        window.openAchievementWatcherOnboarding(true);
        setTimeout(() => {
          if (!$('#onboarding').is(':visible')) forceShowOnboardingDom();
        }, 0);
        return;
      }
      window.dispatchEvent(new CustomEvent('aw-open-onboarding', { detail: { force: true } }));
      setTimeout(() => {
        if (typeof window.openAchievementWatcherOnboarding === 'function') {
          window.__awPendingOnboardingOpen = false;
          window.openAchievementWatcherOnboarding(true);
        } else {
          debug.log('onboarding open requested before onboarding module was ready');
        }
        if (!$('#onboarding').is(':visible')) forceShowOnboardingDom();
      }, 80);
    }

    function normalizeKey(e) {
      const key = e.key;
      if (key === ' ') return 'Space';
      if (key === 'Control') return 'Ctrl';
      if (key === 'Meta') return 'Cmd';
      return key.length === 1 ? key.toUpperCase() : key;
    }

    function updateEmulatorUi() {
      const advanced = $('#option_steamSettingsMode').val() === 'advanced';
      const steamLogin = advanced && $('#option_login').val() === 'steam';
      const steamless = $('#option_steamlessAutoUnpack').val() === 'true';

      $('#option_login').closest('li').toggleClass('is-inactive', !advanced).attr('aria-disabled', String(!advanced));
      // What the automatic fix does only matters while it runs at all.
      const autoFix = $('#option_autoApplyNewGames').val() === 'true';
      $('#option_autoApplyMode').closest('li').toggleClass('is-inactive', !autoFix).attr('aria-disabled', String(!autoFix));
      $('#option_steamlessExperimental').closest('li').toggleClass('is-inactive', !steamless).attr('aria-disabled', String(!steamless));
      $('#emulator-login').toggleClass('is-visible', steamLogin).attr('aria-hidden', String(!steamLogin));

      $('#options-emulator2 select').each(function () {
        $(this).closest('li').toggleClass('is-on', $(this).val() === 'true').toggleClass('is-off', $(this).val() === 'false');
      });

      // Name and Steam ID are only written behind "Write account name and language" (issue #123).
      const stamp = $('#option_stampIdentity').val() === 'true';
      $('#emulator-identity-name, #emulator-identity-steamid, #emulator-identity-steamid-random').prop('disabled', !stamp);
      $('#emulator-identity-switch').toggle(!stamp);
    }

    // A typo in a Steam ID would land in every game a fix touches, so the field says so while typing.
    function showSteamIdStatus() {
      const input = $('#emulator-identity-steamid');
      const value = String(input.val() || '').trim();
      const valid = settingsSteamId64.isSteamId64(value);
      const wrong = !!value && !valid;
      input.toggleClass('is-error', wrong).attr('aria-invalid', String(wrong));
      $('#emulator-identity-steamid-status')
        .toggleClass('is-ok', valid)
        .toggleClass('is-error', wrong)
        .text(
          !value
            ? ''
            : valid
              ? t('emu-steamid-valid', 'Valid Steam ID', 'Steam ID valide')
              : t('emu-steamid-invalid', 'Not a Steam ID: 17 digits starting with 7656119', 'Pas un Steam ID : 17 chiffres commençant par 7656119')
        );
    }

    // The threshold rows stay folded on "Default"; "Custom" unfolds only the active mode's rows.
    function updateRarityUi() {
      const mode = settingsRarityTiers.normalizeMode($('#option_rarityMode').val());
      const custom = $('#rarityThresholdsChoice').val() === 'custom';
      $('#settings li[data-rarity-rows]').each(function () {
        $(this).toggle(custom && $(this).attr('data-rarity-rows') === mode);
      });
      renderRaritySample();
    }

    // Three badges under the choice say what it does with the current bounds: rare tiers stop at the
    // rare limit, trophy mode gives every achievement one.
    function renderRaritySample() {
      const mode = settingsRarityTiers.normalizeMode($('#option_rarityMode').val());
      const v = readRaritySliders();
      const badges =
        mode === 'trophy'
          ? [['gold', `< ${v.trophyGoldBelow}%`], ['silver', `< ${v.trophySilverBelow}%`], ['bronze', `≥ ${v.trophySilverBelow}%`]]
          : [['gold', `≤ ${v.rareGoldMax}%`], ['silver', `≤ ${v.rareSilverMax}%`], ['bronze', `≤ ${v.rareMax}%`]];
      $('#rarity-mode-sample')
        .empty()
        .append(badges.map(([tier, label]) => $('<span>').addClass(`rarity-sample trophy-${tier}`).append($('<i>').addClass('fas fa-trophy'), $('<b>').text(label))));
    }

    // The choice is not stored: a profile whose values all equal the defaults reads as "Default".
    const RARITY_DEFAULTS = { ...settingsRarityTiers.TROPHY_DEFAULTS, ...settingsRarityTiers.RARE_DEFAULTS };
    const RARITY_SELECTS = { goldBelow: 'trophyGoldBelow', silverBelow: 'trophySilverBelow', rareGoldMax: 'rareGoldMax', rareSilverMax: 'rareSilverMax', rareMax: 'rareMax' };

    // The threshold sliders, read back as numbers; the select sweep in the save handler skips them.
    function readRaritySliders() {
      const values = {};
      for (const option of Object.values(RARITY_SELECTS)) values[option] = Number($(`#option_${option}`).val());
      return values;
    }

    function showRaritySliders(values) {
      for (const [option, value] of Object.entries(values)) {
        $(`#option_${option}`).val(String(value));
        $(`[data-rarity-value="${option}"]`).text(`${value}%`);
      }
      renderRaritySample();
    }

    function syncRarityThresholdsChoice() {
      const current = settingsRarityTiers.gradingFrom(app.config.achievement).thresholds;
      const custom = Object.keys(RARITY_DEFAULTS).some((key) => current[key] !== RARITY_DEFAULTS[key]);
      const shown = {};
      for (const [key, option] of Object.entries(RARITY_SELECTS)) shown[option] = current[key];
      showRaritySliders(shown);
      $('#rarityThresholdsChoice').val(custom ? 'custom' : 'default');
      updateRarityUi();
    }

    function onRarityThresholdsChoice() {
      if ($('#rarityThresholdsChoice').val() === 'default') {
        const defaults = {};
        for (const [key, option] of Object.entries(RARITY_SELECTS)) defaults[option] = RARITY_DEFAULTS[key];
        showRaritySliders(defaults);
      }
      updateRarityUi();
    }

    // A slider that would cross its neighbour pushes it instead: gold at 10% puts silver at 11%.
    $('#settings').on('input', '.rarity-slider input[type="range"]', function () {
      const changed = this.id.replace('option_', '');
      const mode = changed.startsWith('trophy') ? 'trophy' : 'rare';
      const linked = settingsRarityTiers.BOUND_KEYS[mode].map(([key]) => key);
      const values = readRaritySliders();
      const pushed = settingsRarityTiers.pushBounds(mode, values, changed);
      showRaritySliders(Object.fromEntries(linked.map((key) => [key, pushed[key]])));
    });

    // Rows that only matter while another switch is on are dimmed, never hidden: the value stays and
    // is still saved. The rules are in util/settingsDependencies.js.
    function updateDependentRows() {
      const values = {};
      for (const id of settingsDependencies.watchedControls()) values[id] = $(`#${id}`).val();
      const inactive = settingsDependencies.inactiveControls(values);
      for (const id of settingsDependencies.dimmableControls()) {
        const off = inactive.has(id);
        // An emulator line holds two controls; only the one a rule names dims.
        $(`#${id}`).closest('.emu-pick, li').toggleClass('is-inactive', off).attr('aria-disabled', String(off));
      }
    }
    $('#settings').on('change.dependentRows', 'select', updateDependentRows);

    /*
      Two save models live side by side: the Notification tab writes as you change it, everything else
      waits for Save. The footer says which one you are in, and Cancel only reads "Cancel" while it
      still has something to throw away. Edits are tracked loosely (any change, or a click on a
      button, outside the autosaved and read-only tabs), so a doubt keeps the safe label.
    */
    const AUTOSAVE_VIEWS = ['notification'];
    const UNTRACKED_VIEWS = [...AUTOSAVE_VIEWS, 'help', 'presets'];
    // Tabs whose own changes never wait for the footer Save (presets have their own button).
    const SAVE_BUTTON_HIDDEN_VIEWS = [...AUTOSAVE_VIEWS, 'presets'];
    let settingsDirty = false;
    let savedFlashTimer = null;

    function renderSaveState() {
      const view = $('#settingNav li[data-view].active').attr('data-view');
      const state = AUTOSAVE_VIEWS.includes(view) ? 'auto' : settingsDirty ? 'dirty' : '';
      const text = {
        auto: localeText('settings.notification.info.autoSave'),
        dirty: localeText('settings.common.unsaved'),
      }[state];
      const box = $('#settings-save-state').attr('data-state', state);
      box.find('em').text(text || '');
      box.find('i').attr('class', state === 'dirty' ? 'fas fa-circle' : 'fas fa-check-circle');
      const cancelLabel = localeText(settingsDirty ? 'settings.common.cancel' : 'settings.common.close');
      if (cancelLabel) document.getElementById('btn-settings-cancel').textContent = cancelLabel;
      // A Save button next to "saved automatically" reads as a contradiction; it stays while another
      // tab still has something to save.
      $('#btn-settings-save').toggle(settingsDirty || !SAVE_BUTTON_HIDDEN_VIEWS.includes(view));
    }
    registerLocaleRefresh(renderSaveState);

    function markSettingsDirty(event) {
      if (!settingsReady || settingsDirty) return;
      if ($(event.target).closest(UNTRACKED_VIEWS.map((view) => `section.content[data-view='${view}']`).join(', ')).length) return;
      settingsDirty = true;
      renderSaveState();
    }
    $('#settings').on('change.dirty input.dirty', '.content :input', markSettingsDirty);
    $('#settings').on('click.dirty', '.content button, .content .btn', markSettingsDirty);

    window.flashSettingsSaved = function () {
      const box = $('#settings-save-state').addClass('is-flash');
      clearTimeout(savedFlashTimer);
      savedFlashTimer = setTimeout(() => box.removeClass('is-flash'), 1000);
    };

    // Re-render the Help tab's live values after a user change (never during form population).
    function refreshHelpPreview() {
      if (!settingsReady || !$('#settings').is(':visible')) return;
      if (!window.AchievementHelp || typeof window.AchievementHelp.render !== 'function') return;
      try {
        window.AchievementHelp.render($);
      } catch (err) {
        debug.log(`help preview refresh failed: ${err}`);
      }
    }

    function splitControllerBinding(value) {
      return String(value || '').split('+').map((part) => part.trim().toUpperCase()).filter(Boolean);
    }

    function fillControllerBindingSelect(select, allowedButtons, includeNone) {
      const layout = $('#option_controllerLayout').val() || 'auto';
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const locale = String(
        (window.app && window.app.config && window.app.config.achievement && window.app.config.achievement.lang) ||
          'english'
      );
      const previous = select.val();
      select.empty();
      if (includeNone) {
        select.append($('<option>').attr('value', '').text(select.attr('data-none') || '-'));
      }
      allowedButtons.forEach((button) => {
        select.append(
          $('<option>')
            .attr('value', button)
            .text(window.ControllerLabels.buttonLabel(layout, button, gamepads, locale))
        );
      });
      if (previous && select.find(`option[value="${previous}"]`).length) select.val(previous);
    }

    function populateControllerBindingOptions() {
      const labels = window.ControllerLabels;
      if (!labels) return;
      [
        ['#option_controllerToggle1', '#option_controllerToggle2', '#option_controllerToggle3', labels.TOGGLE_ALLOWED],
        ['#option_controllerUi1', '#option_controllerUi2', '#option_controllerUi3', labels.MODE_ALLOWED],
        ['#option_controllerMove1', '#option_controllerMove2', '#option_controllerMove3', labels.MODE_ALLOWED],
      ].forEach(([firstId, secondId, thirdId, allowed]) => {
        fillControllerBindingSelect($(firstId), allowed, false);
        fillControllerBindingSelect($(secondId), allowed, true);
        fillControllerBindingSelect($(thirdId), allowed, true);
      });
    }

    function setControllerBinding(firstId, secondId, thirdId, value) {
      const parts = splitControllerBinding(value);
      $(firstId).val(parts[0] || '');
      $(secondId).val(parts[1] || '');
      $(thirdId).val(parts[2] || '');
    }

    function readControllerBinding(firstId, secondId, thirdId, fallback) {
      const first = $(firstId).val();
      const second = $(secondId).val();
      const third = $(thirdId).val();
      const buttons = [first, second, third].filter(Boolean);
      return buttons.length ? buttons.join('+') : fallback;
    }

    window.addEventListener('gamepadconnected', populateControllerBindingOptions);
    window.addEventListener('gamepaddisconnected', populateControllerBindingOptions);
    $(document).on('locale-labels-changed', populateControllerBindingOptions);

    $('#btn-onboarding-open')
      .off('click.awOnboardingOpen')
      .on('click.awOnboardingOpen', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestOnboardingOpen();
      });

    const captureOnboardingOpen = (event) => {
        const target = event.target && event.target.closest ? event.target.closest('#btn-onboarding-open, .onboarding-settings-row .action-right') : null;
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        requestOnboardingOpen();
    };
    document.addEventListener('pointerdown', captureOnboardingOpen, true);
    document.addEventListener('mousedown', captureOnboardingOpen, true);

    /*
      What the library's contents depended on when Settings opened. Compared again on OK so the panel
      only rebuilds the grid when something that decides its rows actually moved (util/libraryRefresh.js).
      The folder lists are filled asynchronously, so their half of the snapshot is taken once they are.
    */
    let librarySnapshotOnOpen = '';

    function foldersFromDom() {
      const read = (selector) => $(selector).map(function () { return folderEntryFromRow(this); }).get();
      return { userDirs: read('#settings #dirlist > li'), libraryDirs: read('#settings #libdirlist > li') };
    }

    function takeLibrarySnapshot(folders) {
      librarySnapshotOnOpen = libraryRefresh.signature({ config: app.config, ...folders });
    }

    /*
      The exit mirror of the opening animation: a short compositor-only fade, then the caller hides
      the panel. A timer, not animationend, which a hidden window may never deliver.
    */
    const SETTINGS_CLOSE_MS = 220;
    function animateSettingsClose(done) {
      const modal = $('#settings');
      modal.removeClass('is-opening').addClass('is-closing');
      setTimeout(() => {
        done();
        modal.removeClass('is-closing');
      }, SETTINGS_CLOSE_MS);
    }

    // Put the panel away and leave the library alone. Everything resetUI() does beyond this is about
    // rebuilding the grid, which closing Settings does not by itself require.
    function closeSettingsPanel() {
      $('#settings').hide();
      const first = $('#settingNav li[data-view]').first();
      $('#settingNav li[data-view]').removeClass('active');
      first.addClass('active');
      $('#settings .box section.content').removeClass('active');
      $(`#settings .box section.content[data-view='${first.data('view')}']`).addClass('active');
      $('title-bar')[0].inSettings = false;
      const back = focusBeforeSettings;
      focusBeforeSettings = null;
      if (back && back.isConnected) back.focus({ preventScroll: true });
    }

    $('title-bar').on('open-settings', function () {
      focusBeforeSettings = deepActiveElement();
      this.inSettings = true;
      settingsReady = false; // suppress auto-save while we populate the form below
      settingsDirty = false;
      listeningHotkey = false;
      keysDown.clear();
      // Clear every nav <li> (including .nav-group section labels) so a stray .active never
      // paints the accent pill behind a group header.
      $('#settingNav li').removeClass('active');
      $('#settingNav li[data-view="general"]').addClass('active');
      $('#settings .box section.content').removeClass('active');
      $("#settings .box section.content[data-view='general']").addClass('active');
      applyInterfaceMode();
      $('#game-config').hide();
      const settingsModal = $('#settings');
      const settingsBox = $('#settings .box');
      settingsModal.removeClass('is-opening is-closing').show();
      settingsBox.stop(true, true).show();
      // Restart the compositor-only entrance animation when Settings is reopened.
      void settingsModal[0].offsetWidth;
      settingsModal.addClass('is-opening');
      // Reopening starts from the full list, not from whatever was typed last time.
      if (typeof window.resetSettingsSearch === 'function') window.resetSettingsSearch();
      // Idempotent: sections already wired keep their key and are skipped.
      if (typeof window.initCollapsibleSections === 'function') window.initCollapsibleSections();
      // Rows are built lazily, so the derived control names and icon roles are applied per open too.
      if (typeof window.refreshAccessibleNames === 'function') window.refreshAccessibleNames();
      renderBlacklistManager().catch((err) => debug.log(err));
      // Keyboard focus moves into the panel, otherwise Tab keeps walking the library behind it.
      const entry = $('#settingNav li.active')[0];
      if (entry) entry.focus({ preventScroll: true });

      for (let option in app.config.achievement) {
        if ($(`#option_${option} option[value="${app.config.achievement[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.achievement[option].toString()).change();
        }
      }
      fillLibraryChromeUi();
      if (!app.config.general) app.config.general = {};
      $('#option_startWithWindows').val(String(app.config.general.startWithWindows !== false)).change();
      $('#option_disableHardwareAccel').val(String(app.config.general.disableHardwareAccel === true)).change();
      $('#option_disableAutoRefresh').val(String(app.config.achievement.disableAutoRefresh === true)).change();
      $('#option_closeToTray').val(String(app.config.general.closeToTray !== false)).change();
      $('#option_uninstallContextMenu').val(String(app.config.general.uninstallContextMenu !== false)).change();
      $('#option_autoUpdate').val(String(app.config.general.autoUpdate === true)).change();
      if (!app.config.controller) app.config.controller = {};
      $('#option_controllerEnabled').val(String(app.config.controller.enabled === true)).change();
      $('#option_controllerAppNavigation').val(String(app.config.controller.appNavigation !== false)).change();
      $('#option_controllerBackend').val(app.config.controller.backend || 'auto').change();
      $('#option_controllerLayout').val(app.config.controller.layout || 'auto');
      populateControllerBindingOptions();
      setControllerBinding('#option_controllerToggle1', '#option_controllerToggle2', '#option_controllerToggle3', app.config.controller.toggleBinding || 'BACK+START+LEFT_SHOULDER');
      setControllerBinding('#option_controllerUi1', '#option_controllerUi2', '#option_controllerUi3', app.config.controller.uiModeBinding || 'LEFT_SHOULDER+X');
      setControllerBinding('#option_controllerMove1', '#option_controllerMove2', '#option_controllerMove3', app.config.controller.controlModeBinding || 'LEFT_SHOULDER+RIGHT_SHOULDER');
      $('#option_controllerFocusOverlay').val(String(app.config.controller.focusOverlay === true)).change();
      $('#option_controllerSendEscape').val(String(app.config.controller.sendEscapeOnControllerOpen === true)).change();
      $('#option_controllerLayout').off('.controllerBindings').on('change.controllerBindings', populateControllerBindingOptions);
      populateThemeSelect();
      if (window.AchievementHelp && typeof window.AchievementHelp.render === 'function') {
        try {
          window.AchievementHelp.render($);
        } catch (err) {
          debug.log(`help render on open failed: ${err}`);
        }
      }
      // The saved startup preference is authoritative; repair a mismatched login item.
      const startupPreference = app.config.general.startWithWindows !== false;
      ipcRenderer
        .invoke('startup:get-start-with-windows')
        .then((enabled) => {
          if (enabled === startupPreference) return null;
          debug.log(`startup: login item (${enabled}) disagrees with the saved preference (${startupPreference}); re-applying`);
          return ipcRenderer.invoke('startup:set-start-with-windows', startupPreference);
        })
        .catch((err) => debug.log(`startup:get-start-with-windows failed: ${err}`));

      for (let option in app.config.achievement_source) {
        // steamHiddenLibraries is a list of paths, not a select value; a quote in one would break the selector.
        if (typeof app.config.achievement_source[option] === 'object') continue;
        if ($(`#option_${option} option[value="${app.config.achievement_source[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.achievement_source[option].toString()).change();
        }
      }

      for (let option in app.config.emulator) {
        if ($(`#option_${option} option[value="${app.config.emulator[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.emulator[option].toString()).change();
        }
      }
      $('#option_autoApplyNewGamesUplay').val(String(app.config.emulator.autoApplyNewGames === true));
      if (app.config.emulator) {
        $('#emulator-login-user').val(app.config.emulator.loginAccountName || '');
        $('#emulator-login-pass').val(app.config.emulator.loginPassword || '');
        $('#emulator-identity-name')
          .val(app.config.emulator.accountName || '')
          .attr('placeholder', (app.config.general && app.config.general.username) || 'Player');
        $('#emulator-identity-steamid').val(app.config.emulator.accountSteamId || '');
        $('#emulator-identity-saves').val(app.config.emulator.savePath || '');
        showSteamIdStatus();
      }
      updateEmulatorUi();
      syncRarityThresholdsChoice();

      $('#hotkey').text(app.config.overlay.hotkey);

      for (let option in app.config.notification) {
        if ($(`#option_${option} option[value="${app.config.notification[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.notification[option].toString()).change();
        }
      }

      for (let option in app.config.notification_toast) {
        if ($(`#option_${option} option[value="${app.config.notification_toast[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.notification_toast[option].toString()).change();
        }
      }

      for (let option in app.config.notification_transport) {
        if ($(`#option_${option} option[value="${app.config.notification_transport[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.notification_transport[option].toString()).change();
        }
      }

      // Overlay (in-game) notification controls - enable lives in notification_transport, the look in
      // overlay.notification*. The preset dropdown is filled from the bundled preset library.
      const cfgOverlay = app.config.overlay || {};
      $('#option_notifMode').val(app.config.notification_transport.mode || 'auto').change();
      $('#option_overlayPosition').val(cfgOverlay.notificationPosition || 'center-bottom').change();
      $('#option_overlayScale').val(String(cfgOverlay.notificationScale || 1)).change();
      $('#option_overlayOpacity').val(String(cfgOverlay.notificationOpacity || 100)).change();
      $('#option_overlayEdgeGap').val(String(notificationPlacement.normalizeEdgeGap(cfgOverlay.notificationEdgeGap))).change();
      $('#option_overlayProgressPosition').val(cfgOverlay.notificationProgressPosition || '').change();
      $('#option_overlayProgressScale').val(String(cfgOverlay.notificationProgressScale || '')).change();
      $('#option_overlayVolume').val(String(cfgOverlay.notificationVolume != null ? cfgOverlay.notificationVolume : 100)).change();
      $('#option_overlayDuration').val(String(cfgOverlay.notificationDuration || 'auto')).change();
      const cfgSouvenir = app.config.souvenir || {};
      $('#option_souvenirScreenshot').val(String(cfgSouvenir.screenshot === true)).change();
      $('#option_souvenirHdr').val(cfgSouvenir.hdr === 'off' ? 'off' : 'auto').change();
      const souvenirDir = cfgSouvenir.dir && cfgSouvenir.dir.trim() ? cfgSouvenir.dir : souvenirDefaultDir();
      $('#souvenir-dir-display').text(souvenirDir);
      $('#btn-souvenir-dir').attr('title', souvenirDir);
      const cfgClip = clipProfile.normalize(cfgSouvenir);
      $('#option_clip').val(String(cfgClip.clip)).change();
      $('#option_clipSeconds').val(String(cfgClip.clipSeconds));
      $('#option_clipCodec').val(cfgClip.clipCodec).change();
      $('#option_clipResolution').val(cfgClip.clipResolution).change();
      $('#option_clipFps').val(String(cfgClip.clipFps)).change();
      $('#option_clipQuality').val(cfgClip.clipQuality).change();
      $('#option_clipAudio').val(cfgClip.clipAudio).change();
      if (process.platform === 'linux') {
        $('#option_clipEngine').val(cfgClip.clipEngine).change();
        showClipEngineStatus();
      } else {
        $('#clip-engine-row').remove();
      }
      const clipDir = cfgClip.clipDir || clipDefaultDir();
      $('#clip-dir-display').text(clipDir);
      $('#btn-clip-dir').attr('title', clipDir);
      updateClipReadouts();
      // Arm auto-save only after both asynchronous lists are populated.
      const presetsReady = ipcRenderer
        .invoke('list-presets')
        .then((presets) => {
          const list = presets && presets.length ? presets : ['AW Next', 'Deck'];
          const sel = $('#option_overlayPreset');
          sel.empty();
          list.forEach((name) => {
            sel.append($('<option>').attr('value', name).text(name));
          });
          // A preset name that was since redesigned away resolves to its replacement (notificationPreset.js);
          // the dropdown must land there too, or the setting looks empty while the popup renders fine.
          const savedPreset = cfgOverlay.notificationPreset || 'AW Next';
          const shownPreset = list.includes(savedPreset)
            ? savedPreset
            : list.includes(legacyPresetAlias(savedPreset))
              ? legacyPresetAlias(savedPreset)
              : 'AW Next';
          sel.val(shownPreset);
          // Per-type overrides: same preset list plus a "same as main" ('' value) first entry.
          for (const [id, value] of [
            ['#option_overlayPresetXenia', cfgOverlay.notificationPresetXenia || ''],
            ['#option_overlayPresetRpcs3', cfgOverlay.notificationPresetRpcs3 || ''],
            ['#option_overlayPresetShadps4', cfgOverlay.notificationPresetShadps4 || ''],
            ['#option_overlayPresetKytyps5', cfgOverlay.notificationPresetKytyps5 || ''],
          ]) {
            const typeSel = $(id);
            typeSel.empty();
            typeSel.append($('<option>').attr('value', '').text(typeSel.attr('data-lang-same') || ''));
            list.forEach((name) => {
              typeSel.append($('<option>').attr('value', name).text(name));
            });
            typeSel.val(list.includes(value) ? value : list.includes(legacyPresetAlias(value)) ? legacyPresetAlias(value) : '');
          }
        })
        .catch(() => {});
      const soundsReady = ipcRenderer
        .invoke('list-sounds')
        .then((sounds) => {
          // A settings file written before the bundled sounds were renamed still names the old file:
          // without this the dropdown would read "None" while the old name kept playing.
          const picked = cfgOverlay.notificationSound || '';
          const shown = sounds && sounds.includes(picked) ? picked : renamedSound(picked) || picked;
          $('#option_overlaySoundRare').val('').attr('data-value', cfgOverlay.notificationSoundRare || '');
          $('#option_overlaySoundPlatinum').val('').attr('data-value', cfgOverlay.notificationSoundPlatinum || '');
          $('#option_overlaySoundProgress').val('').attr('data-value', cfgOverlay.notificationSoundProgress || '');
          for (const [id, key] of Object.entries(EMULATOR_SOUND_SELECTS)) $(id).val('').attr('data-value', cfgOverlay[key] || '');
          fillSoundDropdown(sounds, cfgOverlay.randomSound === true ? RANDOM_SOUND_VALUE : shown);
          refreshUserSounds();
        })
        .catch(() => {});

      populateLegitUsers(app.config.steam.main || '0');
      populateSteamLibraries(app.config.achievement_source.steamHiddenLibraries);

      // Snapshot the settings half now and the folders once they are on screen; a folder list read
      // before it is populated would look empty and make every OK a change.
      takeLibrarySnapshot(foldersFromDom());
      $('#settings #dirlist').empty();
      // Every saved folder is shown, recognised by userDir.check() or not: OK saves the rows on screen,
      // so a folder hidden here (a game the scan reads, a drive not plugged in) was deleted by any OK.
      const userDirsShown = (userDir.getEntries ? userDir.getEntries() : userDir.get())
        .then((userDirList) => {
          for (const dir of userDirList) {
            try {
              populateUserDirList({ ...dir, dir: dir.path, reverse: true });
            } catch (err) {
              debug.log(err);
            }
          }
        })
        .catch((err) => {
          debug.log(err);
        });

      $('#settings #libdirlist').empty();
      const libraryDirsShown = (libraryDirs.getEntries ? libraryDirs.getEntries() : libraryDirs.get())
        .then((libraryDirList) => {
          for (const libraryDir of libraryDirList) {
            const dir = typeof libraryDir === 'string' ? libraryDir : libraryDir.path;
            populateLibraryDirList({ ...(typeof libraryDir === 'object' ? libraryDir : {}), dir, reverse: true });
          }
        })
        .catch((err) => {
          debug.log(err);
        });
      Promise.all([userDirsShown, libraryDirsShown]).then(() => takeLibrarySnapshot(foldersFromDom()));

      // Debug tab diagnostics: major versions only to stay one short row; the tooltip carries the
      // exact build numbers for a bug report. Wrapped so a failure here can't block Settings opening.
      try {
        const major = (v) => String(v || '').split('.')[0];
        $('#diag-versions')
          .text(`AW Next ${remote.app.getVersion()} · Electron ${major(process.versions.electron)} · Node ${major(process.versions.node)} · Chrome ${major(process.versions.chrome)}`)
          .attr(
            'title',
            `Achievement Watcher Next ${remote.app.getVersion()}\nElectron ${process.versions.electron} · Node ${process.versions.node} · Chrome ${process.versions.chrome}`
          );
      } catch (err) {
        debug.log(err);
      }

      // Arm Notifications auto-save only once the async preset/sound dropdowns are loaded, or
      // populate-time change events would persist stale/empty values.
      Promise.all([presetsReady, soundsReady]).then(() => {
        settingsReady = true;
        updateDependentRows();
        renderSaveState();
        refreshHelpPreview();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (!listeningHotkey) return;
      keysDown.add(normalizeKey(e));
      keys = Array.from(keysDown).join(' + ');
      $('#hotkey').text(keys);
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      if (!listeningHotkey) return;
      keysDown.delete(normalizeKey(e));
      // Only the last key released should repaint the label: without cancelling, a three-key combo
      // leaves three timers racing to write what they each saw.
      clearTimeout(holdingKeysCheck);
      holdingKeysCheck = setTimeout(() => {
        if (keysDown.size > 0) {
          keys = Array.from(keysDown).join(' + ');
          $('#hotkey').text(keys);
        }
      }, 250);
      if (keysDown.size === 0) {
        listeningHotkey = false;
        refreshHelpPreview();
      }
    });

    $('#btn-hotkey-edit').click(function () {
      listeningHotkey = true;
      $('#hotkey').text('...');
    });

    // Preview the real overlay for the selected or first game.
    $('#btn-hotkey-preview').click(function () {
      const openAppid = $('#achievement .wrapper > .header').attr('data-appid');
      const fallbackAppid = $('#game-list .game-box[data-appid]').first().data('appid');
      const previewAppid = openAppid || fallbackAppid;
      if (!previewAppid) return;
      ipcRenderer.send('overlay-preview', String(previewAppid));
    });

    // Debug tab: diagnostics shortcuts
    $('#open-logs').click(function () {
      try {
        const userDataPath = ipcRenderer.sendSync('get-user-data-path-sync');
        remote.shell.openPath(path.join(userDataPath, 'logs'));
      } catch (err) {
        debug.log(err);
      }
    });
    // Bundles into a .zip via the main process: copying log files by hand while the app runs risks
    // catching half-written lines, since the daemon/monitor/notification processes keep appending.
    $('#export-logs').click(async function () {
      const btn = $(this);
      const result = $('#export-logs-result');
      if (btn.hasClass('busy')) return;
      btn.addClass('busy');
      setTransientStatus(result, t('export-logs-running', 'Collecting logs…', 'Collecte des journaux…'), { sticky: true });
      try {
        const summary = await ipcRenderer.invoke('export-logs', await logExportLibraryReport());
        if (summary && summary.ok) {
          // Sticky: the destination path is the whole point of the message, and it is longer than
          // anyone can read inside the usual 4.5s fade.
          const written = t('export-logs-done', '{count} log file(s) written to {path}', '{count} fichier(s) de journal écrits dans {path}', {
            count: summary.count,
            path: summary.path,
          });
          const masked = t(
            'export-logs-masked',
            'Your user name, keys and tokens were masked. Read the files before posting them publicly.',
            'Ton nom d’utilisateur, tes clés et tes jetons ont été masqués. Relis les fichiers avant de les publier.'
          );
          setTransientStatus(result, `${written}. ${masked}`, { sticky: true });
        } else if (summary && summary.canceled) {
          setTransientStatus(result, '');
        } else {
          setTransientStatus(
            result,
            t('export-logs-failed', 'Could not export the logs: {error}', 'Impossible d’exporter les journaux : {error}', {
              error: (summary && summary.error) || 'unknown',
            }),
            { duration: 6500 }
          );
        }
      } catch (err) {
        debug.log(err);
        setTransientStatus(
          result,
          t('export-logs-failed', 'Could not export the logs: {error}', 'Impossible d’exporter les journaux : {error}', { error: `${err}` }),
          { duration: 6500 }
        );
      } finally {
        btn.removeClass('busy');
      }
    });
    $('#open-userdata').click(function () {
      try {
        remote.shell.openPath(ipcRenderer.sendSync('get-user-data-path-sync'));
      } catch (err) {
        debug.log(err);
      }
    });
    // The updater's own broadcasts own these two labels; a manual check borrows them for a few
    // seconds to show its result, then hands them back. Before that hand-back existed a check
    // restored whatever text it happened to find, so a stale "downloading 0%" left behind by a
    // failed check was repainted by every retry and never went away.
    let manualCheckOwnsLabels = false;
    let manualCheckClearTimer = null;
    let lastSettingsUpdateStatus = null;

    function updateStatusLabels() {
      return $('#check-for-updates-label, #footer-update-status');
    }

    async function runUpdateCheck(btn, label) {
      if (btn.hasClass('busy')) return;
      btn.addClass('busy');
      manualCheckOwnsLabels = true;
      clearTimeout(manualCheckClearTimer);
      label
        .removeClass('update-ok update-error update-info')
        .addClass('update-info')
        .text(t('checking-for-updates', 'Checking…', 'Vérification…'));
      try {
        const result = await ipcRenderer.invoke('check-for-updates');
        if (!result || !result.ok) {
          const msg =
            result && result.error === 'dev-build'
              ? t('update-unavailable-dev', 'Unavailable in dev build', 'Indisponible en version dev')
              : result && result.error === 'download-in-progress'
                ? t('update-download-in-progress', 'Already downloading…', 'Téléchargement déjà en cours…')
                : t('update-check-failed', 'Check failed', 'Échec de la vérification');
          label.removeClass('update-info').addClass('update-error').text(msg);
        } else if (result.status === 'available') {
          label.removeClass('update-info').addClass('update-ok').text(t('update-available-short', 'Update available', 'Mise à jour disponible'));
        } else if (result.status === 'uptodate') {
          label.removeClass('update-info').addClass('update-ok').text(t('update-up-to-date-short', 'Up to date', 'À jour'));
        } else {
          label.removeClass('update-info').addClass('update-ok').text(t('update-checked', 'Check done', 'Vérifié'));
        }
      } catch (err) {
        debug.log(err);
        label.removeClass('update-info').addClass('update-error').text(t('update-check-failed', 'Check failed', 'Échec de la vérification'));
      } finally {
        btn.removeClass('busy');
        manualCheckClearTimer = setTimeout(() => {
          manualCheckClearTimer = null;
          manualCheckOwnsLabels = false;
          renderSettingsUpdateStatus();
        }, 4500);
      }
    }
    $('#check-for-updates').click(function () {
      runUpdateCheck($(this), $('#check-for-updates-label'));
    });
    $('#footer-check-updates').click(function () {
      runUpdateCheck($(this), $('#footer-update-status'));
    });
    // Every phase the updater can broadcast, so leaving a live one always clears the label instead
    // of leaving the last live text on screen. Settings' copy of renderUpdateStatus in app.js.
    function settingsUpdateStatusView(state) {
      if (!state) return null;
      switch (state.phase) {
        case 'downloading':
          if (state.percent >= 100) return { cls: 'update-info', text: t('update-verifying-title', 'Checking the download', 'Vérification du téléchargement') };
          return {
            cls: 'update-info',
            text: t('downloading-update', 'downloading update {percent}%', 'téléchargement de la mise à jour {percent} %', { percent: Math.round(state.percent) }),
          };
        case 'installing':
          return { cls: 'update-info', text: t('update-installing-short', 'Installing update…', 'Installation de la mise à jour…') };
        case 'ready':
        case 'held':
          return { cls: 'update-ok', text: t('update-ready', 'Update Ready', 'Mise à jour prête') };
        case 'error':
          if (state.version) return { cls: 'update-error', text: t('update-failed-title', 'The update did not complete', "La mise à jour n'a pas abouti") };
          return { cls: 'update-error', text: t('update-check-failed', 'Check failed', 'Échec de la vérification') };
        default:
          return null; // idle, checking and available say nothing worth a permanent line here
      }
    }

    // Both status labels track the shared updater state live (not a raw percentage), so they also
    // report the install step.
    function renderSettingsUpdateStatus(state) {
      if (state) lastSettingsUpdateStatus = state;
      if (manualCheckOwnsLabels) return; // repainted when the manual result fades
      const view = settingsUpdateStatusView(lastSettingsUpdateStatus);
      const labels = updateStatusLabels().removeClass('update-info update-ok update-error');
      labels.text(view ? view.text : '');
      if (view) labels.addClass(view.cls);
    }
    ipcRenderer.on('update-status', (event, state) => renderSettingsUpdateStatus(state));
    // Turned on from the update window: a later Settings save must not write the old value back.
    ipcRenderer.on('auto-update-enabled', () => {
      if (!app.config.general) app.config.general = {};
      app.config.general.autoUpdate = true;
      $('#option_autoUpdate').val('true').change();
    });
    // Opening Settings mid-download must show the download, not an idle button.
    ipcRenderer.invoke('get-update-status').then(renderSettingsUpdateStatus).catch(() => {});

    // Clears every disposable cache (see util/clearableCaches.js for the allowlist); never touches
    // game data, settings, backups, presets, theme images, logs, or the Uplay R2 loader cache.
    $('#clear-update-cache').click(async function () {
      const btn = $(this);
      const result = $('#clear-update-cache-result');
      if (btn.hasClass('busy')) return;
      const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
        type: 'question',
        buttons: [t('clear-cache', 'Clear caches', 'Vider les caches'), t('cancel', 'Cancel', 'Annuler')],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: t('clear-update-cache-label', 'Clear caches', 'Vider les caches'),
        message: t(
          'clear-update-cache-confirm',
          'Delete every re-downloadable cache (update files, Steam/Ubisoft schema & icon cache, downloaded emulator-fix tools)? Your settings, saves, backups and manually placed files are never touched - everything cleared here is simply re-fetched or re-downloaded automatically when needed.',
          'Supprimer tous les caches retéléchargeables (fichiers de mise à jour, cache des schémas et icônes Steam/Ubisoft, outils de correction d’émulateur téléchargés) ? Vos réglages, sauvegardes, backups et fichiers placés manuellement ne sont jamais touchés - tout ce qui est vidé ici est simplement retéléchargé automatiquement en cas de besoin.'
        ),
      });
      if (confirm.response !== 0) return;
      btn.addClass('busy').css('pointer-events', 'none');
      setTransientStatus(result, '');
      try {
        const res = await ipcRenderer.invoke('clear-update-cache');
        const appCacheCount = (res && Array.isArray(res.clearedCaches) && res.clearedCaches.length) || 0;
        const cacheCleared = !!(res && Array.isArray(res.clearedCaches) && res.clearedCaches.includes('steam_cache'));
        if (!res || !res.ok) {
          setTransientStatus(
            result,
            res && res.error === 'download-in-progress'
              ? t('update-download-in-progress', 'Already downloading…', 'Téléchargement déjà en cours…')
              : t('clear-update-cache-failed', 'Could not clear the update cache.', 'Impossible de vider le cache de mise à jour.'),
            { duration: 6500 }
          );
        } else if (!res.updateCleared && appCacheCount === 0) {
          setTransientStatus(result, t('clear-update-cache-empty', 'Nothing to clear - no cached update files found.', 'Rien à vider - aucun fichier de mise à jour en cache.'));
        } else if (res.updateCleared && appCacheCount > 0) {
          setTransientStatus(
            result,
            t(
              'clear-update-cache-done-all',
              'Cleared {count} cache folder(s), including the update cache in {folder}.',
              'Vidé {count} dossier(s) de cache, y compris le cache de mise à jour dans {folder}.',
              { count: appCacheCount + 1, folder: res.updateFolder }
            )
          );
        } else if (res.updateCleared) {
          setTransientStatus(result, t('clear-update-cache-done', 'Update cache cleared: {folder}', 'Cache de mise à jour vidé : {folder}', { folder: res.updateFolder }));
        } else {
          setTransientStatus(result, t('clear-update-cache-done-apps', 'Cleared {count} cache folder(s).', 'Vidé {count} dossier(s) de cache.', { count: appCacheCount }));
        }
        if (cacheCleared) {
          setTransientStatus(result, t('force-recheck-started', 'Checking achievement lists…', 'Recherche de nouveaux succès…'), { sticky: true });
          await app.onStart({ forceAchievementRecheck: true, preserveExistingOnFailure: true });
          setTransientStatus(result, t('force-recheck-done', 'Achievement lists checked.', 'Vérification des listes de succès terminée.'));
        }
      } catch (err) {
        debug.log(err);
        setTransientStatus(result, t('clear-update-cache-failed', 'Could not clear the update cache.', 'Impossible de vider le cache de mise à jour.'), { duration: 6500 });
      } finally {
        btn.removeClass('busy').css('pointer-events', 'initial');
      }
    });

    // Settings > Advanced: forces the achievement self-repair (normally every 3 days) to run right
    // now for the whole library, via a normal rescan with the cooldown bypassed.
    $('#force-achievement-recheck').click(async function () {
      const btn = $(this);
      const result = $('#force-achievement-recheck-result');
      if (btn.hasClass('busy')) return;
      btn.addClass('busy').css('pointer-events', 'none');
      setTransientStatus(result, t('force-recheck-started', 'Checking for new achievements…', 'Recherche de nouveaux succès…'), { sticky: true });
      try {
        await app.onStart({ forceAchievementRecheck: true });
        setTransientStatus(result, t('force-recheck-done', 'Check complete.', 'Vérification terminée.'));
      } catch (err) {
        debug.log(err);
        setTransientStatus(result, t('force-recheck-failed', 'Check failed: {error}', 'Échec de la vérification : {error}', { error: err && err.message ? err.message : err }), {
          duration: 6500,
        });
      } finally {
        btn.removeClass('busy').css('pointer-events', 'initial');
      }
    });

    // Scan a library folder for Goldberg/GBE installs and report which ones are missing their schema.
    $('#scan-gbe').click(async function () {
      const result = $('#scan-gbe-result');
      try {
        const goldberg = require(path.join(appPath, 'parser/goldberg.js'));
        const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
          title: t('select-a-game-library-folder-to-scan', 'Select a game-library folder to scan'),
          buttonLabel: t('scan', 'Scan', 'Analyser'),
          properties: ['openDirectory', 'dontAddToRecent'],
        });
        if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return;
        result.text(t('scanning', 'Scanning…', 'Analyse…'));
        const found = goldberg.findCompatibleGames(picked.filePaths[0]);
        if (found.length === 0) {
          result.text(t('scan-no-gbe-installs', 'No Goldberg / GBE Fork installs found in that folder.', 'Aucune installation Goldberg / GBE Fork trouvée dans ce dossier.'));
          return;
        }
        const unconfigured = found.filter((g) => !g.hasSchema);
        const emuLabel = { gbe: 'GBE Fork', goldberg: 'Goldberg', none: 'unknown' };
        const detail = found
          .map((g) => `${g.appid || '?'} · ${emuLabel[g.emulator] || g.emulator} - ${g.hasSchema ? `${g.schemaCount} achievements` : 'MISSING achievements.json'}\n  ${g.steamSettings}`)
          .join('\n');
        result.text(
          t(
            'scan-found-count',
            'Found {found} install(s); {missing} missing their achievements.json schema.',
            '{found} installation(s) trouvée(s) ; {missing} sans schéma achievements.json.',
            { found: found.length, missing: unconfigured.length }
          )
        );
        remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          type: unconfigured.length ? 'warning' : 'info',
          title: t('goldberg-gbe-fork-scan', 'Goldberg / GBE Fork scan', 'Analyse Goldberg / GBE Fork'),
          message: t('scan-found-message', '{found} install(s) found - {missing} unconfigured', '{found} installation(s) trouvée(s) - {missing} non configurée(s)', {
            found: found.length,
            missing: unconfigured.length,
          }),
          detail,
          buttons: [t('ok', 'OK', 'OK')],
          noLink: true,
        });
      } catch (err) {
        result.text(t('scan-failed-x', 'Scan failed: {error}', 'Échec de l’analyse : {error}', { error: err }));
        debug.log(err);
      }
    });

    /*
      Library tiles (issue #56). Not part of the generic "#options-ui select" sweep below: this card
      lives in Appearance and two of its rows are sliders, so it reads and writes its own controls.
      Both scales are stored as a multiplier (1 = the shipped layout) and shown as a percentage.
    */
    const LIBRARY_TOGGLES = settingsLibraryChrome.TOGGLES.map((toggle) => toggle.key);

    // What the controls currently say, in the shape app.config.achievement stores. Normalized here
    // so the preview, the save and the settings file can never disagree about a value.
    function readLibraryChromeUi() {
      const chrome = {
        libraryTileScale: settingsLibraryChrome.normalizeTileScale(Number($('#option_libraryTileScale').val()) / 100),
        libraryDensity: settingsLibraryChrome.normalizeDensity(Number($('#option_libraryDensity').val()) / 100),
      };
      for (const key of LIBRARY_TOGGLES) chrome[key] = $(`#option_${key}`).val() !== 'false';
      chrome.libraryPlaytimeUnits = settingsLibraryChrome.normalizePlaytimeUnits($('#option_libraryPlaytimeUnits').val());
      return chrome;
    }

    // Shows it without committing it: closing with Cancel re-applies app.config, which the controls
    // have not touched.
    function previewLibraryChrome() {
      const chrome = readLibraryChromeUi();
      $('#library-size-value').text(`${Math.round(chrome.libraryTileScale * 100)}%`);
      $('#library-density-value').text(`${Math.round(chrome.libraryDensity * 100)}%`);
      if (typeof window.applyLibraryChrome === 'function') window.applyLibraryChrome(chrome);
    }

    function fillLibraryChromeUi() {
      const settings = app.config.achievement || {};
      $('#option_libraryTileScale').val(Math.round(settingsLibraryChrome.normalizeTileScale(settings.libraryTileScale) * 100));
      $('#option_libraryDensity').val(Math.round(settingsLibraryChrome.normalizeDensity(settings.libraryDensity) * 100));
      for (const key of LIBRARY_TOGGLES) $(`#option_${key}`).val(String(settings[key] !== false)).change();
      $('#option_libraryPlaytimeUnits').val(settingsLibraryChrome.normalizePlaytimeUnits(settings.libraryPlaytimeUnits)).change();
      previewLibraryChrome();
    }

    $('#option_libraryTileScale, #option_libraryDensity').on('input change', previewLibraryChrome);
    $([...LIBRARY_TOGGLES, 'libraryPlaytimeUnits'].map((key) => `#option_${key}`).join(', ')).on('change', previewLibraryChrome);

    // Escape closes the topmost panel like Cancel does. Anything with its own Escape (a prompt, the
    // cover picker, a search field, a hotkey being recorded) gets the key first and is left alone.
    $(document).on('keydown.panelEscape', function (event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const panel = panelToClose({
        gameConfigOpen: $('#game-config').is(':visible'),
        settingsOpen: $('#settings').is(':visible'),
        onboardingOpen: $('#onboarding').is(':visible'),
        promptOpen: document.querySelector('.aw-prompt-overlay') !== null,
        recordingHotkey: listeningHotkey,
        themePreviewOpen: $('#theme-preview').is(':visible'),
      });
      if (panel === 'theme-preview') return void closeThemePreview();
      const cancel = panel === 'game-config' ? $('#btn-game-config-cancel') : panel === 'settings' ? $('#btn-settings-cancel') : null;
      // Cancel locks itself while it fades the panel out; a second Escape must not start it again.
      if (cancel && cancel.css('pointer-events') !== 'none') cancel.trigger('click');
    });

    // The library stays in the DOM under the scrim, so Tab has to be kept inside the open panel.
    document.addEventListener('focusin', function (event) {
      const gameConfig = $('#game-config').is(':visible');
      const panel = gameConfig ? $('#game-config .box')[0] : $('#settings').is(':visible') ? $('#settings .box')[0] : null;
      const target = focusTrapTarget({
        panel,
        landed: event.target,
        exempt: '.aw-prompt-overlay, .aw-color-popover, .pd-cv-tour, .pg-backdrop, #onboarding, #theme-preview, .simple-modal, title-bar',
        preferred: gameConfig ? '#game-config-tabs button.active' : '#settingNav li.active',
      });
      if (target) target.focus({ preventScroll: true });
    });

    // The open tab is a CSS class; mirror it for screen readers wherever that class changes.
    const settingNav = document.getElementById('settingNav');
    const markCurrentTab = () => {
      for (const item of settingNav.querySelectorAll('li[data-view]')) {
        if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      }
    };
    new MutationObserver(markCurrentTab).observe(settingNav, { attributes: true, attributeFilter: ['class'], subtree: true });
    markCurrentTab();

    $('#btn-settings-cancel, #settings .overlay').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');
      animateSettingsClose(() => {
        closeSettingsPanel();
        self.css('pointer-events', 'initial');
        // Cancel reverts an unsaved theme preview back to the persisted choice.
        applyThemeValue((app.config.general && app.config.general.theme) || 'default');
        // Same for the live library preview: app.config still holds what was saved.
        if (typeof window.applyLibraryChrome === 'function') window.applyLibraryChrome(app.config.achievement);
        // The Custom theme editor saves live; restore the snapshot taken when it opened.
        if (customThemeSnapshot) {
          ipcRenderer
            // Colours only, and deliberately no name: the slot's name is not something the editor
            // changes any more, so a restore that carried one would be inventing a change to undo.
            .invoke('save-custom-theme', { theme: customThemeSnapshot })
            .then((payload) => {
              if (payload && payload.appCss) userThemes.applyCss(payload.appCss);
              ipcRenderer.send('theme-changed', 'custom');
            })
            .catch((err) => debug.log(`custom theme restore failed: ${err}`));
        }
        // Games were un-blacklisted while Settings was open: refresh the library once, now.
        if (window.__awBlacklistDirty) {
          window.__awBlacklistDirty = false;
          app.onStart();
        }
      });
    });

    $('#btn-settings-save').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      // Read before the form is collected below, which overwrites it: applyLibraryView needs to know
      // which view we are coming FROM to decide whether the covers have to be re-requested.
      const previousLayout = app.config.achievement.libraryLayout;

      app.config.overlay.hotkey = $('#hotkey').text();
      $(settingsContainers.rightsOf(settingsContainers.GENERAL))
        .children('select')
        .each(function () {
          try {
            // These General-tab selects persist under `general`, not `achievement` - handled explicitly below.
            if (
              $(this)[0].id === 'option_startWithWindows' ||
              $(this)[0].id === 'option_disableHardwareAccel' ||
              $(this)[0].id === 'option_closeToTray' ||
              $(this)[0].id === 'option_uninstallContextMenu' ||
              $(this)[0].id === 'option_autoUpdate' ||
              $(this)[0].id === 'option_theme' ||
              $(this)[0].id === 'rarityThresholdsChoice'
            )
              return;
            if ($(this)[0].id !== '' && $(this).val() !== '') {
              app.config.achievement[$(this)[0].id.replace('option_', '')] =
                $(this).val() === 'true' ? true : $(this).val() === 'false' ? false : $(this).val();
            }
          } catch (e) {
            debug.log(e);
            debug.log('error while reading general settings ui');
          }
        });
      // Same switch as the toolbar picker: apply the view to the tiles already on screen (and
      // re-request their covers if the orientation changed) instead of rebuilding the library.
      if (typeof window.applyLibraryView === 'function') window.applyLibraryView(app.config.achievement.libraryLayout, previousLayout);
      Object.assign(app.config.achievement, readLibraryChromeUi());
      Object.assign(app.config.achievement, readRaritySliders());
      if (typeof window.applyLibraryChrome === 'function') window.applyLibraryChrome(app.config.achievement);
      // Profile card (Appearance): outside the General containers, so it is read here.
      app.config.achievement.profileCompact = $('#option_profileCompact').val() === 'true';
      if (typeof window.applyProfileCompact === 'function') window.applyProfileCompact(app.config.achievement.profileCompact);
      // Translated titles are painted, not scanned: switching them on or off needs no rescan.
      if (typeof window.refreshGameTitles === 'function') window.refreshGameTitles();
      // Shows or hides the trophy row right away (Settings > General).
      if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
      if (!app.config.general) app.config.general = {};
      app.config.general.disableHardwareAccel = $('#option_disableHardwareAccel').val() === 'true';
      app.config.achievement.disableAutoRefresh = $('#option_disableAutoRefresh').val() === 'true';
      app.config.general.closeToTray = $('#option_closeToTray').val() !== 'false';
      app.config.general.uninstallContextMenu = $('#option_uninstallContextMenu').val() !== 'false';
      app.config.general.autoUpdate = $('#option_autoUpdate').val() === 'true';
      app.config.general.theme = $('#option_theme').val() || 'default';

      if (!app.config.controller) app.config.controller = {};
      app.config.controller.enabled = $('#option_controllerEnabled').val() === 'true';
      app.config.controller.appNavigation = $('#option_controllerAppNavigation').val() === 'true';
      app.config.controller.backend = $('#option_controllerBackend').val() || 'auto';
      app.config.controller.layout = $('#option_controllerLayout').val() || 'auto';
      app.config.controller.toggleBinding = readControllerBinding('#option_controllerToggle1', '#option_controllerToggle2', '#option_controllerToggle3', 'BACK+START+LEFT_SHOULDER');
      app.config.controller.uiModeBinding = readControllerBinding('#option_controllerUi1', '#option_controllerUi2', '#option_controllerUi3', 'LEFT_SHOULDER+X');
      app.config.controller.controlModeBinding = readControllerBinding('#option_controllerMove1', '#option_controllerMove2', '#option_controllerMove3', 'LEFT_SHOULDER+RIGHT_SHOULDER');
      app.config.controller.focusOverlay = $('#option_controllerFocusOverlay').val() === 'true';
      app.config.controller.sendEscapeOnControllerOpen = $('#option_controllerSendEscape').val() === 'true';
      document.dispatchEvent(new Event('controller-settings-changed'));

      $(settingsContainers.rightsOf(settingsContainers.SOURCE))
        .children('select')
        .each(function () {
          try {
            if ($(this)[0].id !== '' && $(this).val() !== '') {
              app.config.achievement_source[$(this)[0].id.replace('option_', '')] =
                $(this).val() === 'true' ? true : $(this).val() === 'false' ? false : $(this).val();
            }
          } catch (e) {
            debug.log(e);
            debug.log('error while reading ach source settings ui');
          }
        });

      // Both live in the Steam account card, not in #options-source, so the sweep above never sees
      // them. Read by id instead: the pair belongs next to the account that makes them work.
      app.config.achievement_source.steamAccountOwned = $('#option_steamAccountOwned').val() === 'true';
      app.config.achievement_source.steamAccountFamily = $('#option_steamAccountFamily').val() === 'true';
      // Every hidden folder has a row (populateSteamLibraries shows the ones Steam no longer lists),
      // so reading the rows back cannot drop one.
      const hiddenLibraries = readHiddenSteamLibraries();
      if (hiddenLibraries) app.config.achievement_source.steamHiddenLibraries = hiddenLibraries;

      // #options-uplay carries the Uplay loader's own settings and was never collected here, so a
      // change to one was read back on the next open and silently reverted.
      $('#options-emulator .right, #options-emulator2 .right, #options-uplay .right')
        .children('select')
        .each(function () {
          try {
            if ($(this)[0].id === 'option_goldbergDownloadIcons') return;
            // A mirror of option_autoApplyNewGames, kept in step by its own change handler. Reading
            // it here would invent an emulator.autoApplyNewGamesUplay key that nothing consumes.
            if ($(this)[0].id === 'option_autoApplyNewGamesUplay') return;
            if ($(this)[0].id !== '' && $(this).val() !== '') {
              app.config.emulator[$(this)[0].id.replace('option_', '')] =
                $(this).val() === 'true' ? true : $(this).val() === 'false' ? false : $(this).val();
            }
          } catch (e) {
            debug.log(e);
            debug.log('error while reading emulator settings ui');
          }
        });
      app.config.achievement.goldbergDownloadIcons = $('#option_goldbergDownloadIcons').val() === 'true';
      app.config.emulator.mode = 'regular';
      // Steam login fields (username plain, password AES-encrypted on disk by settings.js).
      if (app.config.emulator) {
        app.config.emulator.loginAccountName = $('#emulator-login-user').val().trim();
        app.config.emulator.loginPassword = $('#emulator-login-pass').val();
        app.config.emulator.accountName = String($('#emulator-identity-name').val() || '').trim();
        const steamId = String($('#emulator-identity-steamid').val() || '').trim();
        // An invalid id never replaces the last good one; the field already says why.
        if (!steamId || settingsSteamId64.isSteamId64(steamId)) app.config.emulator.accountSteamId = steamId;
        // Only an absolute folder can be written as local_save_path; anything else means the default.
        const savePath = String($('#emulator-identity-saves').val() || '').trim();
        app.config.emulator.savePath = path.isAbsolute(savePath) ? savePath : '';
      }

      $('#options-notify-common .right')
        .children('select')
        .each(function () {
          try {
            // groupToast and urgent sit in the common group visually but persist under
            // notification_toast.
            if ($(this)[0].id === 'option_groupToast' || $(this)[0].id === 'option_urgent') return;
            if ($(this)[0].id !== '' && $(this).val() !== '') {
              app.config.notification[$(this)[0].id.replace('option_', '')] =
                $(this).val() === 'true' ? true : $(this).val() === 'false' ? false : $(this).val();
            }
          } catch (e) {
            debug.log(e);
            debug.log('error while reading notification common settings ui');
          }
        });

      if ($('#option_groupToast').val() !== '') {
        app.config.notification_toast.groupToast = $('#option_groupToast').val() === 'true';
      }
      if ($('#option_urgent').val() !== '') {
        app.config.notification_toast.urgent = $('#option_urgent').val() === 'true';
      }

      $('#options-notify-transport .right')
        .children('select')
        .each(function () {
          try {
            if ($(this)[0].id !== '' && $(this).val() !== '') {
              app.config.notification_transport[$(this)[0].id.replace('option_', '')] =
                $(this).val() === 'true' ? true : $(this).val() === 'false' ? false : $(this).val();
            }
          } catch (e) {
            debug.log(e);
            debug.log('error while reading notification transport settings ui');
          }
        });

      app.config.steam.main = $('#options-mainSteam .right select').val();

      let userDirList = [];
      $('#settings #dirlist > li').each(function () {
        userDirList.push(folderEntryFromRow(this));
      });

      let libraryDirList = [];
      $('#settings #libdirlist > li').each(function () {
        libraryDirList.push(folderEntryFromRow(this));
      });

      const startWithWindows = $('#option_startWithWindows').val() === 'true';
      const applyStartup = ipcRenderer
        .invoke('startup:set-start-with-windows', startWithWindows)
        .then(() => {
          if (!app.config.general) app.config.general = {};
          app.config.general.startWithWindows = startWithWindows;
        })
        .catch((err) => {
          const wrapped = new Error(err && err.message ? err.message : String(err));
          wrapped.isStartupSettingError = true;
          throw wrapped;
        });

      settings.setUserDataPath(ipcRenderer.sendSync('get-user-data-path-sync'));
      withSettingsTimeout(Promise.all([userDir.save(userDirList), libraryDirs.save(libraryDirList), applyStartup]), 'Saving folders/startup')
        .then(() => withSettingsTimeout(settings.save(app.config), 'Writing options.ini'))
        .then(() => {
          closeThemeEditor();
          ipcRenderer.send('theme-changed', $('#option_theme').val() || 'default');
          /*
            Rebuild the library only when this OK changed something the library's contents depend on
            (util/libraryRefresh.js), or when a game was un-blacklisted while the panel was open.
            resetUI() empties the grid, forgets which AppIDs failed to resolve and runs a full scan;
            paying that for a theme colour is what made every OK feel like a reload.
          */
          const after = libraryRefresh.signature({ config: app.config, userDirs: userDirList, libraryDirs: libraryDirList });
          const rescan = libraryRefresh.needsRescan(librarySnapshotOnOpen, after) || window.__awBlacklistDirty === true;
          window.__awBlacklistDirty = false;
          animateSettingsClose(() => {
            self.css('pointer-events', 'initial');
            if (rescan) resetUI();
            else closeSettingsPanel();
          });
        })
        .catch((err) => {
          animateSettingsClose(() => {
            $('#settings').hide();
            let elem = $('#settingNav li[data-view]').first();
            $('#settingNav li[data-view]').removeClass('active');
            elem.addClass('active');
            $('#settings .box section.content').removeClass('active');
            $("#settings .box section.content[data-view='" + elem.data('view') + "']").addClass('active');
            self.css('pointer-events', 'initial');
            $('title-bar')[0].inSettings = false;

            remote.dialog.showMessageBoxSync({
              type: 'error',
              title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
              message:
                err && err.isStartupSettingError
                  ? t('errorUpdatingStartupSetting', 'Error while updating the startup setting.', 'Erreur lors de la mise à jour du paramètre de démarrage.')
                  : t('errorSavingSettings', 'Error while saving settings.', 'Erreur lors de l’enregistrement des paramètres.'),
              detail: `${err}`,
            });
          });
        });
    });

    $('#settings .arrow-list .next').click(function () {
      let sel = $(this).parent('.right').find('select')[0];
      let i = sel.selectedIndex;
      sel.options[++i % sel.options.length].selected = true;

      if ('createEvent' in document) {
        let evt = document.createEvent('HTMLEvents');
        // Native <select> change events bubble. Keep the synthetic arrow-control event equivalent so
        // dependent settings (and delegated auto-save handlers) react immediately.
        evt.initEvent('change', true, true);
        sel.dispatchEvent(evt);
      } else {
        sel.fireEvent('onchange');
      }
    });

    $('#settings .arrow-list .previous').click(function () {
      let sel = $(this).parent('.right').find('select')[0];
      let i = sel.selectedIndex;
      if (i <= 0) {
        i = sel.options.length;
      }
      sel.options[--i % sel.options.length].selected = true;

      if ('createEvent' in document) {
        let evt = document.createEvent('HTMLEvents');
        evt.initEvent('change', true, true);
        sel.dispatchEvent(evt);
      } else {
        sel.fireEvent('onchange');
      }
    });

    // Validates against the real GSE tool using AppID 480 (Spacewar) as a harmless target; Steam
    // Guard/email/captcha prompts forward to the in-app modal, and `-tok` lets GSE keep the refresh token.
    $('#emulator-login-test').click(async function () {
      const button = $(this);
      const status = $('#emulator-login-test-status');
      const emuText = {
        missing: t('emu-login-missing', 'Enter the Steam username and password first.', "Renseigne d'abord l'identifiant et le mot de passe Steam."),
        running: t('emu-login-running', 'Connecting to Steam… Enter the Steam Guard code if requested.', "Connexion à Steam… Saisis le code Steam Guard s'il est demandé."),
        success: t('emu-login-success', 'Steam login successful. The generate_emu_config refresh token was saved.', 'Connexion Steam réussie. Le refresh token generate_emu_config a été sauvegardé.'),
        failed: t('emu-login-failed', 'Steam login failed', 'Échec de la connexion Steam'),
      };
      const username = $('#emulator-login-user').val().trim();
      const password = $('#emulator-login-pass').val();
      const setStatus = (text, cls = '') => status.removeClass('success error').addClass(cls).text(text || '');
      if (!username || !password) {
        setStatus(emuText.missing, 'error');
        return;
      }
      if (button.hasClass('disabled')) return;
      button.addClass('disabled').css('pointer-events', 'none');
      setStatus(emuText.running, 'running');
      let generated = null;
      try {
        const userData = ipcRenderer.sendSync('get-user-data-path-sync');
        const genEmu = require(path.join(appPath, 'parser/genEmuConfig.js'));
        let preferredTag = null;
        try { preferredTag = settingsFs.readFileSync(path.join(userData, 'cache/gse_fork/latest.txt'), 'utf8').trim() || null; } catch {}
        const tool = await genEmu.ensureGenerateEmuConfig({
          cacheDir: path.join(userData, 'cache/gse_emu_config'),
          preferredTag,
          log: debug,
        });
        const onPrompt = async (question) => {
          if (typeof window.awPromptText !== 'function') throw new Error('2FA prompt UI is unavailable');
          return window.awPromptText(`Steam / GSE - ${question}`, '', /password/i.test(question) ? 'password' : 'text');
        };
        generated = await genEmu.generate({
          tool,
          appid: '480',
          login: { username, password },
          onPrompt,
          timeout: 300000,
          log: debug,
        });
        setStatus(emuText.success, 'success');
      } catch (err) {
        debug.log(`[emulator-login-test] ${err}`);
        setStatus(`${emuText.failed}: ${err.message || err}`, 'error');
      } finally {
        if (generated && generated.workDir) {
          try { settingsFs.rmSync(generated.workDir, { recursive: true, force: true }); } catch {}
        }
        button.removeClass('disabled').css('pointer-events', '');
      }
    });

    // One wording on every account card: "Connected: <name>", or "Connected" when the service names nobody.
    const accountConnectedAs = (name) => (name ? t('account-connected-as', 'Connected: {name}', 'Connecté : {name}', { name }) : t('connected', 'Connected', 'Connecté'));

    // Epic account connect: shows unlock state for installed Epic games (epic-official source).
    // The login window and encrypted token storage live in the main process (init.js epic:* IPC).
    (function wireEpicConnect() {
      const T = () =>
        ({
          connectedAs: accountConnectedAs,
          notConnected: t('epic-not-connected', 'Not connected', 'Non connecté'),
          connecting: t('epic-connecting', 'Opening the Epic sign-in window…', 'Ouverture de la fenêtre de connexion Epic…'),
          connected: t('epic-connected', 'Epic account connected.', 'Compte Epic connecté.'),
          cancelled: t('epic-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
          failed: t('epic-failed', 'Epic sign-in failed', 'Échec de la connexion Epic'),
          disconnected: t('epic-disconnected', 'Epic account disconnected.', 'Compte Epic déconnecté.'),
        });
      const status = $('#epic-connect-status');
      const badge = $('#epic-connect-badge');
      const connectBtn = $('#epic-connect-btn');
      const disconnectBtn = $('#epic-disconnect-btn');
      const setStatus = (text, cls = '') => status.removeClass('success error running').addClass(cls).text(text || '');
      let lastStatus = null;

      // Static card labels, kept out of loader.js's fragile nth-child i18n; registered so a
      // language change repaints them.
      registerLocaleRefresh(function applyEpicLabels() {
        $('#epic-connect-title').text(t('epic-title', 'Epic Games account', 'Compte Epic Games'));
        $('#epic-connect-desc').text(
          t(
            'epic-desc',
            'Optional. Connecting shows which achievements you have already unlocked in installed Epic games; names, descriptions and rarity work without it. Your token is stored encrypted on this PC.',
            'Optionnel. La connexion affiche les succès que vous avez déjà débloqués dans les jeux Epic installés ; les noms, descriptions et la rareté fonctionnent sans elle. Votre jeton est stocké chiffré sur ce PC.'
          )
        );
        $('#epic-connect-btn-hint').text(t('epic-btn-hint', 'opens the Epic sign-in window', 'ouvre la fenêtre de connexion Epic'));
        $('#epic-connect-badge-label').text(t('connected', 'Connected', 'Connecté'));
        $('#epic-disconnect-btn-label').text(t('disconnect', 'Disconnect', 'Déconnecter'));
        // The button and status line depend on the account state, so they are repainted from the
        // last one read; otherwise a language picked in the first-run guide left them in the old one.
        if (lastStatus) repaintAccountState(status, () => paintStatus(lastStatus));
      });

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('epic:auth-status')) || {};
        } catch {}
        lastStatus = s;
        paintStatus(s);
        status.data('stateText', status.text());
      }

      function paintStatus(s) {
        if (s.connected) {
          badge.show();
          disconnectBtn.show();
          $('#epic-connect-btn-label').text(t('epic-reconnect', 'Reconnect', 'Reconnecter'));
          setStatus(T().connectedAs(s.displayName), 'success');
        } else {
          badge.hide();
          disconnectBtn.hide();
          $('#epic-connect-btn-label').text(t('epic-connect', 'Connect Epic account', 'Connecter le compte Epic'));
          if (!status.hasClass('error')) setStatus(T().notConnected);
        }
      }

      connectBtn.off('click').on('click', async function () {
        if (connectBtn.hasClass('disabled')) return;
        connectBtn.addClass('disabled').css('pointer-events', 'none');
        setStatus(T().connecting, 'running');
        try {
          const res = (await ipcRenderer.invoke('epic:login')) || {};
          if (res.ok) setStatus(T().connected, 'success');
          else if (res.error === 'window-closed') setStatus(T().cancelled, 'error');
          else setStatus(`${T().failed}${res.error ? ': ' + res.error : ''}`, 'error');
        } catch (err) {
          setStatus(`${T().failed}: ${err.message || err}`, 'error');
        } finally {
          connectBtn.removeClass('disabled').css('pointer-events', '');
          refresh();
        }
      });

      disconnectBtn.off('click').on('click', async function () {
        try {
          await ipcRenderer.invoke('epic:logout');
          setStatus(T().disconnected);
        } catch (err) {
          setStatus(`${err.message || err}`, 'error');
        }
        refresh();
      });

      refresh();
    })();

    // Gives AW the real owned/Family library that the ghost-game filter reads. The Valve sign-in
    // window and encrypted session live in the main process (init.js steam:* IPC); no password here.
    (function wireSteamConnect() {
      const T = () => ({
        connectedAs: accountConnectedAs,
        notConnected: t('steam-not-connected', 'Not connected', 'Non connecté'),
        connecting: t('steam-connecting', 'Opening the Steam sign-in window…', 'Ouverture de la fenêtre de connexion Steam…'),
        connected: t('steam-connected', 'Steam account connected.', 'Compte Steam connecté.'),
        cancelled: t('steam-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
        failed: t('steam-failed', 'Steam sign-in failed', 'Échec de la connexion Steam'),
        disconnected: t('steam-disconnected', 'Steam account disconnected.', 'Compte Steam déconnecté.'),
        needsReconnect: t('steam-needs-reconnect', 'Session expired, reconnect needed.', 'Session expirée, reconnexion nécessaire.'),
      });
      const status = $('#steam-connect-status');
      const badge = $('#steam-connect-badge');
      const connectBtn = $('#steam-connect-btn');
      const disconnectBtn = $('#steam-disconnect-btn');
      const setStatus = (text, cls = '') => status.removeClass('success error running').addClass(cls).text(text || '');
      let lastStatus = null;

      registerLocaleRefresh(function applySteamLabels() {
        $('#steam-connect-title').text(t('steam-title', 'Steam account', 'Compte Steam'));
        $('#steam-connect-desc').text(
          t(
            'steam-desc',
            'Optional. Connect your Steam account to see your real library (Steam Family included) and hide games you no longer own. Sign-in happens on Valve’s own page; the session stays encrypted on this PC.',
            'Optionnel. Connecte ton compte Steam pour voir ta vraie bibliothèque (famille Steam comprise) et masquer les jeux que tu ne possèdes plus. La connexion se fait sur la page de Valve ; la session reste chiffrée sur ce PC.'
          )
        );
        $('#steam-connect-btn-hint').text(t('steam-btn-hint', 'opens the Steam sign-in window', 'ouvre la fenêtre de connexion Steam'));
        $('#steam-connect-badge-label').text(t('connected', 'Connected', 'Connecté'));
        $('#steam-disconnect-btn-label').text(t('disconnect', 'Disconnect', 'Déconnecter'));
        $('#steam-stale-label').text(
          t('steam-hide-stale', 'Hide games no longer in your Steam library', 'Masquer les jeux qui ne sont plus dans ta bibliothèque Steam')
        );
        $('#steam-stale-help').text(
          t(
            'steam-hide-stale-help',
            'Requires a connected Steam account. Games installed on this PC and games shared through Steam Family are never hidden.',
            'Nécessite un compte Steam connecté. Les jeux installés sur ce PC et ceux partagés via la famille Steam ne sont jamais masqués.'
          )
        );
        // These two select labels are the same Enabled/Disabled ones loader.js sets on every other
        // select; reading them back avoids two more translations saying the same thing.
        const common = (window.appLocale && window.appLocale.settings && window.appLocale.settings.common) || {};
        $('#steam-hide-stale option[value="true"]').text(common.enable || 'Enabled');
        $('#steam-hide-stale option[value="false"]').text(common.disable || 'Disabled');

        $('#steam-libraries-title').text(t('steam-libraries-title', 'Steam libraries', 'Bibliothèques Steam'));
        $('#steam-libraries-help').text(
          t(
            'steam-libraries-help',
            'Switch a library off to leave its games out of every collection, for example a drive you keep connected as storage. They come back when you switch it on again.',
            'Désactive une bibliothèque pour retirer ses jeux de toutes les collections, par exemple un disque que tu gardes branché pour le stockage. Ils reviennent quand tu la réactives.'
          )
        );
        $('#steam-libraries-list select option[value="true"]').text(common.enable || 'Enabled');
        $('#steam-libraries-list select option[value="false"]').text(common.disable || 'Disabled');

        $('#steam-import-owned-label').text(t('steam-import-owned', 'Add the games you own', 'Ajouter les jeux que tu possèdes'));
        $('#steam-import-owned-help').text(
          t(
            'steam-import-owned-help',
            'Lists your whole Steam library, including games that were never installed on this PC. A large library makes the first scan much longer.',
            'Liste toute ta bibliothèque Steam, y compris les jeux jamais installés sur ce PC. Avec une grosse bibliothèque, le premier scan est nettement plus long.'
          )
        );
        $('#steam-import-family-label').text(
          t('steam-import-family', 'Add the games shared with you through Steam Family', 'Ajouter les jeux partagés avec toi via la famille Steam')
        );
        $('#steam-import-family-help').text(
          t(
            'steam-import-family-help',
            'Games another member of your Steam Family owns and shares with you. They carry the Steam Family badge.',
            'Les jeux qu’un autre membre de ta famille Steam possède et partage avec toi. Ils portent le badge famille Steam.'
          )
        );
        for (const id of ['#option_steamAccountOwned', '#option_steamAccountFamily']) {
          $(`${id} option[value="true"]`).text(common.enable || 'Enabled');
          $(`${id} option[value="false"]`).text(common.disable || 'Disabled');
        }
        // Same as the Epic card: the state-dependent labels follow a language change too.
        if (lastStatus) repaintAccountState(status, () => paintStatus(lastStatus));
      });

      // Hiding ghost games is on by default; hideStaleEnabled() carries that default, this select
      // only reflects and then writes it.
      const staleSelect = $('#steam-hide-stale');
      // Read from localStorage rather than window.hideStaleEnabled: sort.js may not be loaded yet
      // here, and a select left at its default would look uninitialized.
      staleSelect.val(localStorage.showStaleSteamGames === 'true' ? 'false' : 'true');
      staleSelect.off('change').on('change', function () {
        localStorage.showStaleSteamGames = $(this).val() === 'true' ? 'false' : 'true';
        window.applyStaleFilter?.();
        window.refreshProfileStats?.({ animate: true });
      });

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('steam:auth-status')) || {};
        } catch {}
        lastStatus = s;
        paintStatus(s);
        status.data('stateText', status.text());
      }

      function paintStatus(s) {
        // With no account connected nothing can be a ghost entry, so the row would promise nothing.
        $('#steam-stale-card').toggle(!!s.connected);
        // The library import also needs the official Steam source on: the games it adds are Steam
        // games, and discovery skips it unless that source lists owned games. Hidden rather than
        // shown doing nothing.
        $('#steam-library-card').toggle(!!s.connected && $('#option_legitSteam').val() === '2');
        if (s.connected) {
          badge.toggle(!s.needsReconnect);
          disconnectBtn.show();
          $('#steam-connect-btn-label').text(t('steam-reconnect', 'Reconnect', 'Reconnecter'));
          if (s.needsReconnect) setStatus(T().needsReconnect, 'error');
          else setStatus(T().connectedAs(s.persona || s.steamid), 'success');
        } else {
          badge.hide();
          disconnectBtn.hide();
          $('#steam-connect-btn-label').text(t('steam-connect', 'Connect Steam account', 'Connecter le compte Steam'));
          if (!status.hasClass('error')) setStatus(T().notConnected);
        }
      }

      connectBtn.off('click').on('click', async function () {
        if (connectBtn.hasClass('disabled')) return;
        connectBtn.addClass('disabled').css('pointer-events', 'none');
        setStatus(T().connecting, 'running');
        try {
          const res = (await ipcRenderer.invoke('steam:login')) || {};
          if (res.ok) setStatus(T().connected, 'success');
          else if (res.error === 'login-cancelled') setStatus(T().cancelled, 'error');
          else setStatus(`${T().failed}${res.error ? ': ' + res.error : ''}`, 'error');
        } catch (err) {
          setStatus(`${T().failed}: ${err.message || err}`, 'error');
        } finally {
          connectBtn.removeClass('disabled').css('pointer-events', '');
          refresh();
        }
      });

      disconnectBtn.off('click').on('click', async function () {
        try {
          await ipcRenderer.invoke('steam:logout');
          setStatus(T().disconnected);
        } catch (err) {
          setStatus(`${err.message || err}`, 'error');
        }
        refresh();
      });

      // Turning the official Steam source off while Settings is open takes the import rows with it.
      $('#option_legitSteam').off('change.steamLibraryCard').on('change.steamLibraryCard', refresh);
      $('#option_legitSteam').off('change.steamLibraries').on('change.steamLibraries', toggleSteamLibrariesCard);

      refresh();
    })();

    // Xbox PC account card (Settings > Sources): connect Microsoft/Xbox Network, then import the
    // library. Import progress arrives as `xbox-pc:import-progress` IPC events.
    (function () {
      const T = () =>
        ({
          connectedAs: accountConnectedAs,
          notConnected: t('xbox-not-connected', 'Not connected', 'Non connecté'),
          connecting: t('xbox-connecting', 'Opening the Microsoft sign-in window…', 'Ouverture de la fenêtre de connexion Microsoft…'),
          connected: t('xbox-connected', 'Xbox account connected.', 'Compte Xbox connecté.'),
          cancelled: t('xbox-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
          failed: t('xbox-failed', 'Xbox sign-in failed', 'Échec de la connexion Xbox'),
          disconnected: t('xbox-disconnected', 'Xbox account disconnected.', 'Compte Xbox déconnecté.'),
          importing: t('xbox-importing', 'Importing the Xbox PC library…', 'Importation de la bibliothèque Xbox…'),
          imported: (r) =>
            // An import that wrote nothing used to report three zeroes, which says the same thing
            // whether the account has no PC game or the history never arrived. Say which it was.
            (r?.created || 0) + (r?.updated || 0) === 0
              ? t(
                  'xbox-imported-none',
                  'Nothing to import: {titles} PC titles found, {skipped} without achievements, {failed} failed.',
                  'Rien à importer : {titles} titres PC trouvés, {skipped} sans succès, {failed} en échec.',
                  {
                    titles: r?.pcTitles || 0,
                    skipped: r?.skipped || 0,
                    failed: r?.failed || 0,
                  }
                )
              : t('xbox-imported', 'Import complete: {created} created, {updated} updated, {failed} failed.', 'Importation terminée : {created} créé(s), {updated} mis à jour, {failed} échec(s).', {
                  created: r?.created || 0,
                  updated: r?.updated || 0,
                  failed: r?.failed || 0,
                }),
          importFailed: t('xbox-import-failed', 'Xbox library import failed', 'Échec de l’importation Xbox'),
        });
      const status = $('#xbox-connect-status');
      const badge = $('#xbox-connect-badge');
      const connectBtn = $('#xbox-connect-btn');
      const importBtn = $('#xbox-import-btn');
      const disconnectBtn = $('#xbox-disconnect-btn');
      const setStatus = (text, cls = '') => status.removeClass('success error running').addClass(cls).text(text || '');
      let lastStatus = null;

      registerLocaleRefresh(function applyXboxLabels() {
        $('#xbox-connect-title').text(t('xbox-title', 'Xbox PC account', 'Compte Xbox PC'));
        $('#xbox-connect-desc').text(
          t(
            'xbox-desc',
            'Optional. Imports your Xbox PC library (Game Pass and Microsoft Store): achievements, unlock state and rarity come from Xbox Network and are cached locally. Your session token is stored encrypted on this PC.',
            'Optionnel. Importe votre bibliothèque Xbox PC (Game Pass et Microsoft Store) : succès, état de déblocage et rareté viennent de Xbox Network et sont mis en cache localement. Votre jeton est stocké chiffré sur ce PC.'
          )
        );
        $('#xbox-connect-btn-hint').text(t('xbox-btn-hint', 'opens the Microsoft sign-in window', 'ouvre la fenêtre de connexion Microsoft'));
        $('#xbox-import-btn-label').text(t('xbox-import-btn-label', 'Import Xbox PC library', 'Importer la bibliothèque Xbox PC'));
        $('#xbox-import-btn-hint').text(t('xbox-import-btn-hint', 'fetch achievements from Xbox Network', 'récupère les succès depuis Xbox Network'));
        $('#xbox-connect-badge-label').text(t('connected', 'Connected', 'Connecté'));
        $('#xbox-disconnect-btn-label').text(t('disconnect', 'Disconnect', 'Déconnecter'));
        // Same as the Epic card: the state-dependent labels follow a language change too.
        if (lastStatus) repaintAccountState(status, () => paintStatus(lastStatus));
      });

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('xbox-pc:status')) || {};
        } catch {}
        lastStatus = s;
        paintStatus(s);
        status.data('stateText', status.text());
      }

      function paintStatus(s) {
        if (s.connected) {
          badge.show();
          importBtn.show();
          disconnectBtn.show();
          $('#xbox-connect-btn-label').text(t('xbox-reconnect', 'Reconnect', 'Reconnecter'));
          setStatus(T().connectedAs(s.gamertag), 'success');
        } else {
          badge.hide();
          importBtn.hide();
          disconnectBtn.hide();
          $('#xbox-connect-btn-label').text(t('xbox-connect', 'Connect Xbox account', 'Connecter le compte Xbox'));
          if (!status.hasClass('error')) setStatus(T().notConnected);
        }
      }

      connectBtn.off('click').on('click', async function () {
        if (connectBtn.hasClass('disabled')) return;
        connectBtn.addClass('disabled').css('pointer-events', 'none');
        setStatus(T().connecting, 'running');
        try {
          const res = (await ipcRenderer.invoke('xbox-pc:login')) || {};
          if (res.ok) setStatus(T().connected, 'success');
          else if (res.error === 'window-closed') setStatus(T().cancelled, 'error');
          else setStatus(`${T().failed}${res.error ? ': ' + res.error : ''}`, 'error');
        } catch (err) {
          setStatus(`${T().failed}: ${err.message || err}`, 'error');
        } finally {
          connectBtn.removeClass('disabled').css('pointer-events', '');
          refresh();
        }
      });

      importBtn.off('click').on('click', async function () {
        if (importBtn.hasClass('disabled')) return;
        importBtn.addClass('disabled').css('pointer-events', 'none');
        setStatus(T().importing, 'running');
        try {
          const res = (await ipcRenderer.invoke('xbox-pc:import', { lang: app.config?.achievement?.lang || 'english' })) || {};
          if (res.ok) {
            setStatus(T().imported(res.result), 'success');
            app.onStart(); // refresh the library so newly imported titles appear
          } else {
            setStatus(`${T().importFailed}${res.error ? ': ' + res.error : ''}`, 'error');
          }
        } catch (err) {
          setStatus(`${T().importFailed}: ${err.message || err}`, 'error');
        } finally {
          importBtn.removeClass('disabled').css('pointer-events', '');
        }
      });

      ipcRenderer.on('xbox-pc:import-progress', (_event, p) => {
        if (p && p.detail) setStatus(`${T().importing} ${p.current}/${p.total} - ${p.detail}`, 'running');
      });

      disconnectBtn.off('click').on('click', async function () {
        try {
          await ipcRenderer.invoke('xbox-pc:disconnect');
          setStatus(T().disconnected);
        } catch (err) {
          setStatus(`${err.message || err}`, 'error');
        }
        refresh();
      });

      refresh();
    })();

    // RetroAchievements account card (Settings > Sources): a username and a Web API key, checked by
    // the main process before they are kept. Import progress arrives as IPC events.
    (function () {
      const KEY_PAGE = 'https://retroachievements.org/settings';
      const status = $('#retroachievements-connect-status');
      const badge = $('#retroachievements-connect-badge');
      const fields = $('#retroachievements-fields');
      const userInput = $('#retroachievements-username');
      const keyInput = $('#retroachievements-apikey');
      const connectBtn = $('#retroachievements-connect-btn');
      const importBtn = $('#retroachievements-import-btn');
      const disconnectBtn = $('#retroachievements-disconnect-btn');
      const setStatus = (text, cls = '') => status.removeClass('success error running').addClass(cls).text(text || '');
      const busy = (button, on) => button.toggleClass('disabled', on).css('pointer-events', on ? 'none' : '');
      const { errorText, importText } = require(path.join(appPath, 'util/retroAchievementsMessages.js'));
      let lastStatus = null;

      registerLocaleRefresh(function applyRetroAchievementsLabels() {
        $('#retroachievements-connect-desc').text(
          t(
            'retroachievements-desc',
            'Optional. Imports the games you played on emulators with RetroAchievements, and announces new unlocks while an emulator is running. Your Web API key is stored encrypted on this PC.',
            'Optionnel. Importe les jeux auxquels tu as joué sur émulateur avec RetroAchievements, et annonce les nouveaux succès pendant qu’un émulateur tourne. Ta clé Web API est stockée chiffrée sur ce PC.'
          )
        );
        $('#retroachievements-username-label').text(t('retroachievements-username', 'Username', 'Nom d’utilisateur'));
        $('#retroachievements-apikey-label').text(t('retroachievements-apikey', 'Web API key', 'Clé Web API'));
        $('#retroachievements-connect-btn-label').text(t('retroachievements-connect', 'Connect account', 'Connecter le compte'));
        $('#retroachievements-import-btn-label').text(t('retroachievements-import-btn-label', 'Import library', 'Importer la bibliothèque'));
        $('#retroachievements-import-btn-hint').text(
          t('retroachievements-import-btn-hint', 'fetch your games from RetroAchievements', 'récupère tes jeux depuis RetroAchievements')
        );
        $('#retroachievements-connect-badge-label').text(t('connected', 'Connected', 'Connecté'));
        $('#retroachievements-disconnect-btn-label').text(t('disconnect', 'Disconnect', 'Déconnecter'));
        // Same as the Epic card: the "Connected as" line follows a language change too.
        if (lastStatus) repaintAccountState(status, () => paintStatus(lastStatus));
      });

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('retroachievements:status')) || {};
        } catch {}
        lastStatus = s;
        paintStatus(s);
        status.data('stateText', status.text());
      }

      function paintStatus(s) {
        badge.toggle(!!s.connected);
        importBtn.toggle(!!s.connected);
        disconnectBtn.toggle(!!s.connected);
        // Not toggle(): its inline display:block would undo the two-column grid of the fields.
        fields.css('display', s.connected ? 'none' : '');
        connectBtn.toggle(!s.connected);
        // Disconnected, the line keeps whatever it last said ("disconnected", an error).
        if (s.connected) setStatus(accountConnectedAs(s.username), 'success');
      }

      async function runImport() {
        busy(importBtn, true);
        setStatus(t('retroachievements-importing', 'Importing the RetroAchievements library…', 'Importation de la bibliothèque RetroAchievements…'), 'running');
        try {
          const res = (await ipcRenderer.invoke('retroachievements:import')) || {};
          if (!res.ok) {
            setStatus(errorText(res.error), 'error');
            return;
          }
          const r = res.result || {};
          const summary = importText(r);
          setStatus(summary.text, summary.kind);
          if ((r.created || 0) + (r.updated || 0) > 0) app.onStart(); // show the new and updated games
        } catch (err) {
          setStatus(errorText(err.message || String(err)), 'error');
        } finally {
          busy(importBtn, false);
        }
      }

      connectBtn.off('click').on('click', async function () {
        if (connectBtn.hasClass('disabled')) return;
        const username = String(userInput.val() || '').trim();
        const apiKey = String(keyInput.val() || '').trim();
        if (!username || !apiKey) {
          // The key is only shown on the account's own settings page, so that is where this goes.
          remote.shell.openExternal(KEY_PAGE);
          setStatus(
            t(
              'retroachievements-missing',
              'Enter your username and the Web API key shown on retroachievements.org/settings (now open in your browser).',
              'Saisis ton nom d’utilisateur et la clé Web API affichée sur retroachievements.org/settings (ouverte dans ton navigateur).'
            ),
            'error'
          );
          return;
        }
        busy(connectBtn, true);
        setStatus(t('retroachievements-connecting', 'Checking the account…', 'Vérification du compte…'), 'running');
        try {
          const res = (await ipcRenderer.invoke('retroachievements:connect', { username, apiKey })) || {};
          if (res.ok) {
            keyInput.val('');
            await refresh();
            // A first connection with nothing imported yet would leave the library empty until a
            // second click, so the import starts on its own.
            await runImport();
          } else {
            setStatus(errorText(res.error), 'error');
          }
        } catch (err) {
          setStatus(errorText(err.message || String(err)), 'error');
        } finally {
          busy(connectBtn, false);
        }
      });

      importBtn.off('click').on('click', function () {
        if (!importBtn.hasClass('disabled')) runImport();
      });

      ipcRenderer.on('retroachievements:import-progress', (_event, p) => {
        if (p && p.rateLimitedMs) {
          setStatus(
            t(
              'retroachievements-rate-wait',
              'RetroAchievements asks to slow down: the import resumes in {minutes} min ({current}/{total}).',
              'RetroAchievements demande de ralentir : l’import reprend dans {minutes} min ({current}/{total}).',
              { minutes: Math.max(1, Math.ceil(p.rateLimitedMs / 60000)), current: p.current || 0, total: p.total || 0 }
            ),
            'running'
          );
        } else if (p && p.detail) {
          setStatus(
            `${t('retroachievements-importing', 'Importing the RetroAchievements library…', 'Importation de la bibliothèque RetroAchievements…')} ${p.current}/${p.total} - ${p.detail}`,
            'running'
          );
        }
      });

      disconnectBtn.off('click').on('click', async function () {
        try {
          await ipcRenderer.invoke('retroachievements:disconnect');
          setStatus(t('retroachievements-disconnected', 'RetroAchievements account disconnected.', 'Compte RetroAchievements déconnecté.'));
        } catch (err) {
          setStatus(`${err.message || err}`, 'error');
        }
        refresh();
      });

      // The first-start guide connects the same account; this card is built once and must follow.
      window.addEventListener('aw-accounts-changed', refresh);
      refresh();
    })();

    // PlayStation account card (Settings > Sources): Sony's sign-in window, for official trophy rates.
    (function () {
      const status = $('#psn-connect-status');
      const badge = $('#psn-connect-badge');
      const connectBtn = $('#psn-connect-btn');
      const importBtn = $('#psn-import-btn');
      const disconnectBtn = $('#psn-disconnect-btn');
      const setStatus = (text, cls = '') => status.removeClass('success error running').addClass(cls).text(text || '');
      const { psnImportErrorText, psnImportText } = require(path.join(appPath, 'util/psnMessages.js'));
      let lastStatus = null;

      registerLocaleRefresh(function applyPsnLabels() {
        $('#psn-connect-title').text(t('psn-title', 'PlayStation account', 'Compte PlayStation'));
        $('#psn-connect-desc').text(
          t(
            'psn-desc',
            "Optional. Imports your PlayStation games and trophies, and shows PlayStation's own trophy rates for the games on your PSN account. Your session token is stored encrypted on this PC.",
            'Optionnel. Importe tes jeux et trophées PlayStation, et affiche les pourcentages officiels PlayStation pour les jeux de ton compte PSN. Ton jeton est stocké chiffré sur ce PC.'
          )
        );
        $('#psn-connect-btn-hint').text(t('psn-btn-hint', 'opens the Sony sign-in window', 'ouvre la fenêtre de connexion Sony'));
        $('#psn-import-btn-label').text(t('retroachievements-import-btn-label', 'Import library', 'Importer la bibliothèque'));
        $('#psn-import-btn-hint').text(t('psn-import-btn-hint', 'fetch your games and trophies from PSN', 'récupère tes jeux et trophées depuis le PSN'));
        $('#psn-add-label').text(t('psn-add-label', 'Add a PlayStation game you do not own', 'Ajouter un jeu PlayStation que tu n’as pas'));
        $('#psn-add-search').attr('placeholder', t('manual-game-name', 'Game name', 'Nom du jeu'));
        $('#psn-connect-badge-label').text(t('connected', 'Connected', 'Connecté'));
        $('#psn-disconnect-btn-label').text(t('disconnect', 'Disconnect', 'Déconnecter'));
        if (lastStatus) repaintAccountState(status, () => paintStatus(lastStatus));
      });

      function paintStatus(s) {
        badge.toggle(!!s.connected);
        importBtn.toggle(!!s.connected);
        $('#psn-add').toggle(!!s.connected);
        disconnectBtn.toggle(!!s.connected);
        $('#psn-connect-btn-label').text(s.connected ? t('xbox-reconnect', 'Reconnect', 'Reconnecter') : t('psn-connect', 'Connect PlayStation account', 'Connecter le compte PlayStation'));
        if (s.connected) setStatus(accountConnectedAs(s.onlineId), 'success');
        else if (!status.hasClass('error')) setStatus(t('xbox-not-connected', 'Not connected', 'Non connecté'));
      }

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('psn:status')) || {};
        } catch {}
        lastStatus = s;
        paintStatus(s);
        status.data('stateText', status.text());
      }

      connectBtn.off('click').on('click', async function () {
        if (connectBtn.hasClass('disabled')) return;
        connectBtn.addClass('disabled').css('pointer-events', 'none');
        setStatus(t('psn-connecting', 'Opening the Sony sign-in window…', 'Ouverture de la fenêtre de connexion Sony…'), 'running');
        try {
          const res = (await ipcRenderer.invoke('psn:login')) || {};
          if (res.ok) {
            setStatus(t('psn-connected', 'PlayStation account connected.', 'Compte PlayStation connecté.'), 'success');
            await refresh();
            runImport();
          } else if (res.error === 'window-closed') setStatus(t('xbox-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'), 'error');
          else setStatus(`${t('psn-failed', 'PlayStation sign-in failed', 'Échec de la connexion PlayStation')}${res.error ? ': ' + res.error : ''}`, 'error');
        } catch (err) {
          setStatus(`${t('psn-failed', 'PlayStation sign-in failed', 'Échec de la connexion PlayStation')}: ${err.message || err}`, 'error');
        } finally {
          connectBtn.removeClass('disabled').css('pointer-events', '');
          refresh();
        }
      });

      disconnectBtn.off('click').on('click', async function () {
        try {
          await ipcRenderer.invoke('psn:logout');
          setStatus(t('psn-disconnected', 'PlayStation account disconnected.', 'Compte PlayStation déconnecté.'));
        } catch (err) {
          setStatus(`${err.message || err}`, 'error');
        }
        refresh();
      });

      async function runImport() {
        importBtn.addClass('disabled').css('pointer-events', 'none');
        setStatus(t('psn-importing', 'Importing the PlayStation library…', 'Importation de la bibliothèque PlayStation…'), 'running');
        try {
          const res = (await ipcRenderer.invoke('psn:import')) || {};
          if (!res.ok) {
            setStatus(psnImportErrorText(res.error), 'error');
            return;
          }
          const summary = psnImportText(res.result);
          setStatus(summary.text, summary.kind);
          if ((res.result.created || 0) + (res.result.updated || 0) > 0) app.onStart(); // show the new and updated games
        } catch (err) {
          setStatus(psnImportErrorText(err.message || String(err)), 'error');
        } finally {
          importBtn.removeClass('disabled').css('pointer-events', '');
        }
      }

      importBtn.off('click').on('click', function () {
        if (!importBtn.hasClass('disabled')) runImport();
      });

      // The catalog search: typed words wait a moment, and an answer to an older query is dropped.
      const addStatus = $('#psn-add-status');
      const addResults = $('#psn-add-results');
      const setAddStatus = (text, cls = '') => addStatus.removeClass('error').addClass(cls).text(text || '');
      let searchTimer = null;
      let searchSeq = 0;
      const SEARCH_RETRY_MS = 3000;

      const removeLabel = () => t('psn-add-remove', 'Remove', 'Retirer');

      // An added list can go again in one click; the account's own lists only show they are there.
      function setRowButton(button, game) {
        button.off('click').prop('disabled', false).removeClass('primary secondary');
        if (game.added) button.addClass('secondary').text(removeLabel()).on('click', () => removeGame(game, button));
        else if (game.inLibrary) button.addClass('secondary').prop('disabled', true).text(t('psn-add-owned', 'In library', 'Dans la bibliothèque'));
        else button.addClass('primary').text(t('blacklist-add-button', 'Add', 'Ajouter')).on('click', () => addGame(game, button));
      }

      function renderResults(results) {
        addResults.empty();
        for (const game of results) {
          const button = $('<button type="button" class="inline-action-btn">');
          setRowButton(button, game);
          addResults.append(
            $('<li>').append(
              $('<img alt="" loading="lazy">').attr('src', game.icon || ''),
              $('<span class="psn-add-name">').text(game.name).attr('title', game.name),
              $('<span class="psn-add-platform">').text(game.platform),
              button
            )
          );
        }
      }

      async function runSearch(query) {
        const seq = ++searchSeq;
        if (!addResults.children().length) setAddStatus(t('psn-add-searching', 'Searching…', 'Recherche…'));
        const res = (await ipcRenderer.invoke('psn:catalog-search', query).catch((err) => ({ ok: false, error: err.message }))) || {};
        if (seq !== searchSeq) return;
        if (!res.ok) {
          addResults.empty();
          setAddStatus(psnImportErrorText(res.error), 'error');
          return;
        }
        renderResults(res.results);
        // The first catalog load fills in the background: the answer grows while it runs.
        if (res.loading) {
          setAddStatus(t('psn-add-loading', 'Loading the catalog in the background: {count} lists so far.', 'Chargement du catalogue en arrière-plan : {count} listes pour l’instant.', { count: res.count }));
          searchTimer = setTimeout(() => seq === searchSeq && runSearch(query), SEARCH_RETRY_MS);
          return;
        }
        setAddStatus(res.results.length ? '' : t('psn-add-none', 'No PlayStation trophy list has this name.', 'Aucune liste de trophées PlayStation ne porte ce nom.'));
      }

      async function addGame(game, button) {
        button.prop('disabled', true).text(t('psn-add-adding', 'Adding…', 'Ajout…'));
        const res = (await ipcRenderer.invoke('psn:add-game', game.id).catch((err) => ({ ok: false, error: err.message }))) || {};
        if (!res.ok) {
          button.prop('disabled', false).text(t('blacklist-add-button', 'Add', 'Ajouter'));
          setAddStatus(psnImportErrorText(res.error), 'error');
          return;
        }
        setRowButton(button, { ...game, inLibrary: true, added: true });
        setAddStatus(t('psn-add-done', '{name} is in your library.', '{name} est dans ta bibliothèque.', { name: res.game.name }));
        app.onStart();
      }

      async function removeGame(game, button) {
        button.prop('disabled', true);
        const res = (await ipcRenderer.invoke('psn:remove-game', game.id).catch((err) => ({ ok: false, error: err.message }))) || {};
        if (!res.ok) {
          setRowButton(button, game);
          setAddStatus(psnImportErrorText(res.error), 'error');
          return;
        }
        setRowButton(button, { ...game, inLibrary: false, added: false });
        setAddStatus(t('psn-add-removed', '{name} left your library.', '{name} a quitté ta bibliothèque.', { name: res.game.name }));
        app.onStart();
      }

      // With nothing typed, the list shows the games added before, ready to be removed.
      async function showAddedGames() {
        const seq = ++searchSeq;
        const res = (await ipcRenderer.invoke('psn:added-games').catch(() => null)) || {};
        if (seq !== searchSeq) return;
        renderResults(res.ok ? res.results : []);
        setAddStatus('');
      }

      $('#psn-add-search').on('input', function () {
        clearTimeout(searchTimer);
        const query = String($(this).val() || '').trim();
        if (query.length < 2) {
          showAddedGames();
          return;
        }
        searchTimer = setTimeout(() => runSearch(query), 350);
      });

      showAddedGames();

      // The background check found new or changed lists.
      ipcRenderer.on('psn:library-changed', () => app.onStart());

      ipcRenderer.on('psn:import-progress', (_event, p) => {
        if (p && p.detail) setStatus(`${t('psn-importing', 'Importing the PlayStation library…', 'Importation de la bibliothèque PlayStation…')} ${p.current}/${p.total} - ${p.detail}`, 'running');
      });

      window.addEventListener('aw-accounts-changed', refresh);
      refresh();
    })();

    // Bind on the controls themselves as well as using a bubbling event above. This keeps the
    // dependency UI reliable for keyboard changes, programmatic population and the arrow buttons.
    $('#options-emulator select, #options-emulator2 select').on('change', updateEmulatorUi);
    $('#emulator-identity-steamid').on('input', showSteamIdStatus);
    $('#emulator-identity-steamid-random').on('click', () => {
      $('#emulator-identity-steamid').val(settingsSteamId64.randomSteamId64()).trigger('input').trigger('change');
    });
    $('#emulator-identity-saves-pick').on('click', async () => {
      const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'] });
      if (!picked.canceled && picked.filePaths && picked.filePaths[0]) $('#emulator-identity-saves').val(picked.filePaths[0]).trigger('change');
    });
    $('#emulator-identity-saves-reset').on('click', () => $('#emulator-identity-saves').val('').trigger('change'));
    $('#option_rarityMode').on('change', updateRarityUi);
    $('#rarityThresholdsChoice').on('change', onRarityThresholdsChoice);
    $('#option_autoApplyNewGames, #option_autoApplyNewGamesUplay').on('change', async function (event) {
      const value = $(this).val();
      $('#option_autoApplyNewGames, #option_autoApplyNewGamesUplay').not(this).val(value);
      // Only a real click or keypress: this handler is also fired programmatically while the panel
      // is being filled in, and warning somebody about a setting they are only being shown is noise.
      if (!event.originalEvent || value !== 'true') return;
      if (!(await confirmAutomaticEmulatorFix())) {
        $('#option_autoApplyNewGames, #option_autoApplyNewGamesUplay').val('false');
      }
    });

    // Custom theme editor (Settings > General > Custom…)
    const CUSTOM_LAYER_META = [
      {
        id: 'bg',
        icon: 'fa-desktop',
        label: t('theme-layer-bg', 'Window background', 'Fond de la fenêtre'),
        hint: t('theme-layer-bg-hint', 'Behind the whole app', "Derrière toute l'interface"),
      },
      {
        id: 'header',
        icon: 'fa-grip-lines',
        label: t('theme-layer-header', 'Top bar', 'Barre du haut'),
        hint: t('theme-layer-header-hint', 'The thin bar at the very top', 'La fine barre tout en haut'),
      },
      {
        id: 'panel',
        icon: 'fa-th-list',
        label: t('theme-layer-panel', 'Library panel', 'Panneau de bibliothèque'),
        hint: t('theme-layer-panel-hint', 'The big panel with the game list', 'Le grand panneau avec la liste des jeux'),
      },
      {
        id: 'card',
        icon: 'fa-clone',
        label: t('theme-layer-card', 'Cards & rows', 'Cartes et lignes'),
        hint: t('theme-layer-card-hint', 'Game tiles, achievement rows, dialogs', 'Tuiles de jeux, lignes de succès, dialogues'),
      },
      {
        id: 'settings',
        icon: 'fa-cog',
        label: t('theme-layer-settings', 'Settings window', 'Fenêtre de réglages'),
        hint: t('theme-layer-settings-hint', 'The window you are reading now', 'La fenêtre que tu lis actuellement'),
      },
      {
        id: 'text',
        icon: 'fa-font',
        label: t('theme-layer-text', 'Text', 'Texte'),
        hint: t('theme-layer-text-hint', 'Main text color', 'Couleur du texte principal'),
      },
      {
        id: 'muted',
        icon: 'fa-paragraph',
        label: t('theme-layer-muted', 'Muted text', 'Texte atténué'),
        hint: t('theme-layer-muted-hint', 'Secondary text and labels', 'Textes secondaires et libellés'),
      },
      {
        id: 'border',
        icon: 'fa-border-all',
        label: t('theme-layer-border', 'Borders', 'Bordures'),
        hint: t('theme-layer-border-hint', 'Lines around panels and controls', 'Lignes autour des panneaux et contrôles'),
      },
      {
        id: 'accent',
        icon: 'fa-palette',
        label: t('theme-layer-accent', 'Accent', 'Accentuation'),
        hint: t('theme-layer-accent-hint', 'Buttons, highlights, progress', 'Boutons, surlignages, progression'),
      },
    ];
    const CUSTOM_FIT_LABELS = {
      cover: t('theme-fit-cover', 'Cover', 'Couvrir'),
      contain: t('theme-fit-contain', 'Contain', 'Contenir'),
      repeat: t('theme-fit-repeat', 'Repeat', 'Répéter'),
      fill: t('theme-fit-fill', 'Stretch', 'Étirer'),
    };
    const CUSTOM_EFFECT_LABELS = {
      veil: t('theme-effect-veil', 'Colored veil', 'Voile coloré'),
      blur: t('theme-effect-blur', 'Blur', 'Flou'),
    };
    const CUSTOM_IMAGE_LAYERS = themeLayers.IMAGE_LAYER_IDS;
    // The four colours that make a theme come first; the other layers wait in a folded group.
    const CUSTOM_MAIN_LAYERS = ['bg', 'card', 'text', 'accent'];
    function gradientAngleFromDom(row) {
      const n = Number(row.find('.theme-layer-gradient-angle').val());
      return Number.isFinite(n) ? n : 180;
    }
    let customThemeDraft = null;
    let customThemeSnapshot = null;
    let customThemeSaveTimer = null;
    // `editingValue` (the theme being shown) decides whether an edit is written or only previewed
    // (see scheduleCustomThemeSave); `editingBase` travels into a saved theme's manifest unchanged.
    let editingValue = '';
    let editingBase = '';

    // What the picker currently calls the selected theme, with the "…" of an invitation trimmed off.
    function selectedThemeLabel() {
      return $('#option_theme option:selected').text().replace(/…$/, '').trim();
    }

    // The picker's name for a built-in; the Custom slot and anything unknown start from Steam Blue,
    // the colours a fresh Custom theme opens with.
    function builtinThemeLabel(key) {
      const entry = [...PRIMARY_THEMES, ...MORE_THEMES].find(([value]) => value === key);
      return entry ? entry[1] : PRIMARY_THEMES[0][1];
    }

    // "Steam Blue 2", then "Steam Blue 3": the first number no saved or imported theme uses yet.
    function freeThemeName(base) {
      const taken = new Set(installedThemes.map((theme) => String(theme.name).toLowerCase()));
      $('#option_theme option').each(function () {
        const name = userThemes.parseValue($(this).val());
        if (name) taken.add(name.toLowerCase());
      });
      let number = 2;
      while (taken.has(`${base} ${number}`.toLowerCase())) number += 1;
      return `${base} ${number}`;
    }

    function customThemeFromDom() {
      const draft = {};
      for (const meta of CUSTOM_LAYER_META) {
        const row = $(`#theme-customizer-layers .theme-layer-row[data-layer="${meta.id}"]`);
        if (!row.length) continue;
        const current = (customThemeDraft && customThemeDraft[meta.id]) || {};
        // `<input type="color">` has no alpha channel, so the opacity slider carries that half and
        // the two recombine into the #rrggbbaa the theme actually stores.
        const alphaInput = row.find('.theme-layer-alpha');
        const alpha = alphaInput.length ? Number(alphaInput.val()) : themeLayers.colorAlpha(current.color);
        const layer = {
          color: themeLayers.colorWithAlpha(row.find('.theme-layer-color').val() || current.color || DEFAULT_THEME_COLOR, alpha),
        };
        if (CUSTOM_IMAGE_LAYERS.includes(meta.id)) {
          layer.image = current.image || '';
          layer.fit = row.find('.theme-layer-fit').val() || current.fit || 'cover';
          const grad = (current.gradient && typeof current.gradient === 'object' ? current.gradient : {});
          layer.gradient = {
            enabled: row.find('.theme-layer-gradient-enabled').is(':checked'),
            from: row.find('.theme-layer-gradient-from').val() || grad.from || layer.color || current.color || DEFAULT_THEME_COLOR,
            to: row.find('.theme-layer-gradient-to').val() || grad.to || grad.from || layer.color || current.color || DEFAULT_THEME_COLOR,
            angle: gradientAngleFromDom(row),
          };
          layer.effect = {
            enabled: row.find('.theme-layer-effect-enabled').is(':checked'),
            type: row.find('.theme-layer-effect-type').val() === 'blur' ? 'blur' : 'veil',
            color: row.find('.theme-layer-effect-color').val() || '#000000',
            opacity: Number(row.find('.theme-layer-effect-opacity').val() || 40),
            blur: Number(row.find('.theme-layer-effect-blur').val() || 8),
            blurImage: (current.effect && current.effect.blurImage) || '',
          };
        }
        draft[meta.id] = layer;
      }
      return draft;
    }

    function renderCustomThemeLayers(theme) {
      customThemeDraft = theme;
      const container = $('#theme-customizer-layers');
      // A re-render (reset, image picked) must not fold the group the user just opened.
      const moreOpen = container.find('.theme-customizer-more').prop('open') === true;
      container.empty();
      const more = $('<details>').addClass('theme-customizer-more').prop('open', moreOpen);
      more.append($('<summary>').text(t('theme-layers-more', 'Fine-tuning', 'Réglages fins')));
      const ordered = [
        ...CUSTOM_MAIN_LAYERS.map((id) => CUSTOM_LAYER_META.find((meta) => meta.id === id)),
        ...CUSTOM_LAYER_META.filter((meta) => !CUSTOM_MAIN_LAYERS.includes(meta.id)),
      ];
      for (const meta of ordered) {
        const layer = (theme && theme[meta.id]) || {};
        const effect = layer.effect || {};
        const row = $('<div>').addClass('theme-layer-row').attr('data-layer', meta.id);
        const previewImage =
          effect.enabled === true && effect.type === 'blur' && effect.blurImage ? effect.blurImage : layer.image || '';
        const grad = (layer.gradient && typeof layer.gradient === 'object' ? layer.gradient : {});
        const gradAngle = Number.isFinite(Number(grad.angle)) ? Number(grad.angle) : 180;
        // An image is painted by the layer instead of the gradient (see gradientActive in
        // themeLayers.js), so the swatch must not keep showing a gradient the window will not use.
        const gradStyle = grad.enabled === true && !layer.image
          ? `linear-gradient(${gradAngle}deg, ${grad.from || layer.color || DEFAULT_THEME_COLOR} 0%, ${grad.to || grad.from || layer.color || DEFAULT_THEME_COLOR} 100%)`
          : '';
        // The swatch paints the checkerboard itself and composites the layer over it in ::after,
        // so what the row shows is these two custom properties, never the element's own background.
        const previewStyle =
          `--swatch-color:${gradStyle ? 'transparent' : (layer.color || DEFAULT_THEME_COLOR)};` +
          (previewImage
            ? `--swatch-image:${gradStyle ? gradStyle + ',' : ''}${require(path.join(appPath, 'util/cssUrl.js')).cssUrl(require('url').pathToFileURL(previewImage).href)};`
            : gradStyle
            ? `--swatch-image:${gradStyle};`
            : '--swatch-image:none;');
        // The swatch is the colour picker: the input covers it, invisible, so one click opens it.
        // The picker only understands #rrggbb: feeding it the stored #rrggbbaa makes Chromium reject
        // the value and fall back to black, which is how a translucent layer would lose its colour.
        const preview = $('<label>').addClass('theme-layer-preview').attr('style', previewStyle);
        preview.append(
          $('<input>')
            .attr({ type: 'color', 'aria-label': meta.label })
            .addClass('theme-layer-color')
            .val(themeLayers.colorWithoutAlpha(layer.color || DEFAULT_THEME_COLOR))
        );
        // Remember the resolved preview image (source or blur copy) so the live gradient
        // refresh can rebuild the swatch exactly like the real renderer does.
        row.data('previewImage', previewImage);
        // The hint gets its own line under the label/controls: the label column is only ~80px wide,
        // too narrow to wrap the sentence in place without a five-line ribbon.
        const label = $('<div>')
          .addClass('theme-layer-label')
          .html(`<i class="fas ${meta.icon}"></i><div class="theme-layer-label-text"><div class="theme-layer-name">${escapeHtml(meta.label)}</div></div>`);
        const hint = $('<div>').addClass('theme-layer-hint').text(meta.hint || '');
        const controls = $('<div>').addClass('theme-layer-controls');
        const layerAlpha = themeLayers.colorAlpha(layer.color);
        const alphaGroup = $('<label>')
          .addClass('theme-layer-alpha-group')
          .attr('title', t('theme-layer-opacity', 'Opacity', 'Opacité'));
        // Named on screen, not only in a tooltip: a bare slider beside a swatch said nothing.
        alphaGroup.append(
          $('<span>').addClass('theme-layer-alpha-label').text(t('theme-layer-opacity', 'Opacity', 'Opacité')),
          $('<input>')
            .attr('type', 'range')
            .attr('min', '0')
            .attr('max', '100')
            .addClass('theme-layer-alpha')
            .val(layerAlpha),
          $('<span>').addClass('theme-layer-alpha-value').text(`${layerAlpha}%`)
        );
        controls.append(alphaGroup);
        if (CUSTOM_IMAGE_LAYERS.includes(meta.id)) {
          const gradientToggle = $('<label>').addClass('theme-layer-effect-toggle theme-layer-gradient-toggle');
          gradientToggle.append(
            $('<input>').attr('type', 'checkbox').addClass('theme-layer-gradient-enabled').prop('checked', grad.enabled === true)
          );
          gradientToggle.append($('<span>').text(t('theme-layer-gradient', 'Gradient', 'Dégradé')));
          controls.append(gradientToggle);

          const gradientPanel = $('<div>').addClass('theme-layer-effect theme-layer-gradient-panel' + (grad.enabled === true ? ' open' : ''));
          gradientPanel.data('gradient', grad).data('baseColor', layer.color || DEFAULT_THEME_COLOR);
          const angleLabels = {
            0: t('theme-gradient-angle-0', 'Bottom → Top', 'Bas → Haut'),
            45: t('theme-gradient-angle-45', 'Bottom-left → Top-right', 'Bas-gauche → Haut-droite'),
            90: t('theme-gradient-angle-90', 'Left → Right', 'Gauche → Droite'),
            135: t('theme-gradient-angle-135', 'Top-left → Bottom-right', 'Haut-gauche → Bas-droite'),
            180: t('theme-gradient-angle-180', 'Top → Bottom', 'Haut → Bas'),
            270: t('theme-gradient-angle-270', 'Top-right → Bottom-left', 'Haut-droite → Bas-gauche'),
          };
          const fromGroup = $('<div>').addClass('theme-layer-effect-group');
          fromGroup.append($('<label>').text(t('theme-gradient-from', 'From', 'De')));
          fromGroup.append($('<input>').attr('type', 'color').addClass('theme-layer-gradient-from').val(grad.from || layer.color || DEFAULT_THEME_COLOR));
          const toGroup = $('<div>').addClass('theme-layer-effect-group');
          toGroup.append($('<label>').text(t('theme-gradient-to', 'To', 'À')));
          toGroup.append($('<input>').attr('type', 'color').addClass('theme-layer-gradient-to').val(grad.to || grad.from || layer.color || DEFAULT_THEME_COLOR));
          // Styled like the effect-type select but deliberately a different class: sharing it made
          // row.find('.theme-layer-effect-type') return this angle select instead.
          const angleSelect = $('<select>').addClass('theme-layer-gradient-angle');
          for (const [deg, labelText] of Object.entries(angleLabels)) {
            angleSelect.append($('<option>').attr('value', deg).text(labelText));
          }
          angleSelect.val(String(grad.angle && angleLabels[grad.angle] ? grad.angle : 180));
          const angleGroup = $('<div>').addClass('theme-layer-effect-group');
          angleGroup.append($('<label>').text(t('theme-gradient-direction', 'Direction', 'Direction')));
          angleGroup.append(angleSelect);
          gradientPanel.append(fromGroup, toGroup, angleGroup);
          // Must live outside the one-line controls row (a nowrap flex container), or a flex child
          // forced to 100% width would overlap the other controls even while collapsed.
          row.data('gradientPanel', gradientPanel);

          const pick = $('<button>')
            .attr('type', 'button')
            .addClass('theme-layer-image btn')
            .text(t('theme-layer-choose-image', 'Image…', 'Image…'));
          const clear = $('<button>')
            .attr('type', 'button')
            .addClass('theme-layer-clear-image')
            .attr('title', t('theme-layer-remove-image', 'Remove image', "Retirer l'image"))
            .text('×');
          const filename = $('<span>').addClass('theme-layer-filename').text(layer.image ? path.basename(layer.image) : '');
          const fit = $('<select>').addClass('theme-layer-fit');
          for (const [value, labelText] of Object.entries(CUSTOM_FIT_LABELS)) {
            fit.append($('<option>').attr('value', value).text(labelText));
          }
          fit.val(layer.fit || 'cover');
          fit.prop('disabled', !layer.image);
          clear.prop('disabled', !layer.image);
          controls.append(pick, filename, clear, fit);

          const effectToggle = $('<label>').addClass('theme-layer-effect-toggle');
          effectToggle.append(
            $('<input>').attr('type', 'checkbox').addClass('theme-layer-effect-enabled').prop('checked', effect.enabled === true)
          );
          effectToggle.append($('<span>').text(t('theme-effect-label', 'Effect', 'Effet')));

          const effectPanel = $('<div>').addClass('theme-layer-effect theme-layer-effect-panel' + (effect.enabled === true ? ' open' : ''));
          const effectType = $('<select>').addClass('theme-layer-effect-type');
          for (const [value, labelText] of Object.entries(CUSTOM_EFFECT_LABELS)) {
            effectType.append($('<option>').attr('value', value).text(labelText));
          }
          effectType.val(effect.type === 'blur' ? 'blur' : 'veil');

          const veilGroup = $('<div>').addClass('theme-layer-effect-group veil-group').toggle(effect.type !== 'blur');
          veilGroup.append(
            $('<label>').text(t('theme-effect-color-label', 'Color', 'Couleur')),
            $('<input>').attr('type', 'color').addClass('theme-layer-effect-color').val(effect.color || '#000000')
          );
          veilGroup.append(
            $('<label>').text(t('theme-effect-opacity-label', 'Opacity', 'Opacité')),
            $('<input>')
              .attr('type', 'range')
              .attr('min', '0')
              .attr('max', '100')
              .addClass('theme-layer-effect-opacity')
              .val(effect.opacity != null ? effect.opacity : 40),
            $('<span>').addClass('theme-layer-effect-value').text((effect.opacity != null ? effect.opacity : 40) + '%')
          );

          const blurGroup = $('<div>').addClass('theme-layer-effect-group blur-group').toggle(effect.type === 'blur');
          blurGroup.append(
            $('<label>').text(t('theme-effect-blur-label', 'Intensity', 'Intensité')),
            $('<input>')
              .attr('type', 'range')
              .attr('min', '0')
              .attr('max', '40')
              .addClass('theme-layer-effect-blur')
              .val(effect.blur != null ? effect.blur : 8),
            $('<span>').addClass('theme-layer-effect-value').text((effect.blur != null ? effect.blur : 8) + 'px')
          );

          effectPanel.append(effectType, veilGroup, blurGroup);
          controls.append(effectToggle);
          row.data('effectPanel', effectPanel);
        }
        row.append(preview, label, controls, hint);
        const gradientPanelEl = row.data('gradientPanel');
        if (gradientPanelEl) row.append(gradientPanelEl);
        const effectPanelEl = row.data('effectPanel');
        if (effectPanelEl) row.append(effectPanelEl);
        // With an image, keep the image picker and its controls on one line in place of the
        // color picker; removing the image brings the color picker back.
        if (CUSTOM_IMAGE_LAYERS.includes(meta.id)) {
          const hasImage = !!layer.image;
          // An image or an enabled gradient replaces the color, so the swatch stops opening the picker.
          row.find('.theme-layer-color').prop('disabled', hasImage || grad.enabled === true);
          row.find('.theme-layer-alpha-group').toggle(!hasImage);
          row.find('.theme-layer-alpha').prop('disabled', grad.enabled === true);
          // A gradient never applies while an image is set (it would paint over it), so its toggle
          // hides with the color picker; the stored gradient itself is left alone.
          row.find('.theme-layer-gradient-toggle').toggle(!hasImage);
          if (hasImage) row.find('.theme-layer-gradient-panel').removeClass('open');
          row.find('.theme-layer-image').show();
          row.find('.theme-layer-filename, .theme-layer-clear-image, .theme-layer-fit').toggle(hasImage);
        }
        (CUSTOM_MAIN_LAYERS.includes(meta.id) ? container : more).append(row);
      }
      container.append(more);
    }

    // Sanitized with exactly the rules themeLayers.js applies on disk, so the field's text after a
    // save still matches what was typed.
    function themeNameFromDom() {
      return themeLayers.sanitizeCustomThemeName($('#theme-customizer-name').val());
    }

    // Save has nothing to write without a name, so it says so rather than inventing one.
    function refreshThemeNameState() {
      const named = Boolean(themeNameFromDom());
      $('#theme-customizer-name').toggleClass('is-missing', !named).attr('aria-invalid', named ? 'false' : 'true');
      // The block carries it too: the hint is no longer a sibling of the input, so the stylesheet
      // has to read the state from something that contains both.
      $('.theme-name-field').toggleClass('is-missing', !named);
      $('#btn-save-theme').prop('disabled', !named);
      $('#theme-customizer-name-hint').text(
        t('theme-name-required', 'Name your theme to show it in the list and export it.', 'Nomme ton thème pour l’afficher dans la liste et l’exporter.')
      );
      return named;
    }

    // On the Custom slot an edit is the slot's own content and is written immediately; on anything
    // else it is only a preview draft until Save turns it into a theme of its own.
    function scheduleCustomThemeSave() {
      clearTimeout(customThemeSaveTimer);
      customThemeSaveTimer = setTimeout(async () => {
        const draft = customThemeFromDom();
        try {
          const channel = editingValue === 'custom' ? 'save-custom-theme' : 'preview-theme-model';
          const payload = await ipcRenderer.invoke(channel, editingValue === 'custom' ? { theme: draft } : draft);
          if (payload && payload.appCss) userThemes.applyCss(payload.appCss);
          if (payload && payload.customTheme && customThemeDraft) {
            // Keep the generated blur paths without re-rendering (avoids losing focus mid-drag).
            for (const id of CUSTOM_IMAGE_LAYERS) {
              const next = payload.customTheme[id];
              if (next && next.effect && customThemeDraft[id]) customThemeDraft[id].effect.blurImage = next.effect.blurImage;
            }
          }
          // The overlay follows the draft too, so what is being designed is what would be shown.
          if (payload && payload.overlayCss) ipcRenderer.send('theme-preview', payload);
        } catch (err) {
          debug.log(`theme draft failed: ${err}`);
        }
      }, 250);
    }

    $('#theme-customizer-name').on('input', refreshThemeNameState);

    // The hint under the field comes from the locale, and the language can change with the editor
    // open, so it is re-read whenever the loader publishes new labels.
    $(document).on('locale-labels-changed', refreshThemeNameState);

    function updateEffectPanel(row) {
      const enabled = row.find('.theme-layer-effect-enabled').is(':checked');
      row.find('.theme-layer-effect-panel').toggleClass('open', enabled);
      const isBlur = row.find('.theme-layer-effect-type').val() === 'blur';
      row.find('.veil-group').toggle(enabled && !isBlur);
      row.find('.blur-group').toggle(enabled && isBlur);
    }

    // The layer model comes from the main process for a built-in, Custom or on-disk theme alike; a
    // `user:` stylesheet is raw CSS with no model, so the editor stays shut for it.
    function openThemeEditor(value) {
      const opening = String(value || 'custom');
      editingValue = opening;
      $('#theme-customizer').show();
      // What the last save reported was about the theme being left, not the one being opened.
      setThemeSaveStatus('');
      ipcRenderer
        .invoke('get-theme-model', opening)
        .then((model) => {
          // Guard against out-of-order IPC replies: two selections close together can settle in
          // either order, and a stale answer must not overwrite a newer editingValue's layers.
          if (editingValue !== opening) return;
          if (!model) return closeThemeEditor();
          const theme = model.theme || themeLayers.defaultCustomTheme();
          customThemeSnapshot = opening === 'custom' ? theme : null;
          editingBase = model.base || (Object.prototype.hasOwnProperty.call(themeLayers.BUILTIN_COLORS, opening) ? opening : '');
          renderCustomThemeLayers(theme);
          // Save with the name untouched updates this theme; changing it first creates a new one. A
          // built-in or the unnamed Custom slot has no name of its own, so it gets a free copy name.
          $('#theme-customizer-name').val(model.name || freeThemeName(builtinThemeLabel(editingBase)));
          refreshThemeNameState();
        })
        .catch((err) => debug.log(`theme load failed: ${err}`));
    }

    function closeThemeEditor() {
      $('#theme-customizer').hide();
      clearTimeout(customThemeSaveTimer);
      customThemeSnapshot = null;
      editingValue = '';
      editingBase = '';
    }

    $('#theme-customizer-layers').on('input change', '.theme-layer-color, .theme-layer-fit', () => scheduleCustomThemeSave());

    // Mirrors the color onto our custom preview box, which otherwise only updates on initial render.
    $('#theme-customizer-layers').on('input change', '.theme-layer-color', function () {
      refreshLayerSwatch($(this).closest('.theme-layer-row'));
    });

    // The swatch is drawn over a checkerboard, so "40%" and "black" render as different pictures.
    $('#theme-customizer-layers').on('input change', '.theme-layer-alpha', function () {
      const row = $(this).closest('.theme-layer-row');
      row.find('.theme-layer-alpha-value').text(`${$(this).val()}%`);
      refreshLayerSwatch(row);
      scheduleCustomThemeSave();
    });

    // The swatch shows the color as it will actually be composited - alpha included.
    function refreshLayerSwatch(row) {
      const base = row.find('.theme-layer-color').val() || DEFAULT_THEME_COLOR;
      const alphaInput = row.find('.theme-layer-alpha');
      const alpha = alphaInput.length ? Number(alphaInput.val()) : 100;
      setSwatch(row, { color: themeLayers.colorWithAlpha(base, alpha) });
    }

    // `.css()` cannot be trusted with custom properties across jQuery versions, and these two carry
    // the whole swatch, so they are set straight on the style declaration.
    function setSwatch(row, { color, image } = {}) {
      const el = row.find('.theme-layer-preview')[0];
      if (!el) return;
      if (color !== undefined) el.style.setProperty('--swatch-color', color);
      if (image !== undefined) el.style.setProperty('--swatch-image', image);
    }

    $('#theme-customizer-layers').on('change', '.theme-layer-effect-enabled', function () {
      updateEffectPanel($(this).closest('.theme-layer-row'));
      scheduleCustomThemeSave();
    });

    $('#theme-customizer-layers').on('change', '.theme-layer-effect-type', function () {
      updateEffectPanel($(this).closest('.theme-layer-row'));
      scheduleCustomThemeSave();
    });

    $('#theme-customizer-layers').on('input', '.theme-layer-effect-color, .theme-layer-effect-opacity, .theme-layer-effect-blur', function () {
      const row = $(this).closest('.theme-layer-row');
      if ($(this).hasClass('theme-layer-effect-opacity')) {
        row.find('.veil-group .theme-layer-effect-value').text($(this).val() + '%');
      } else if ($(this).hasClass('theme-layer-effect-blur')) {
        row.find('.blur-group .theme-layer-effect-value').text($(this).val() + 'px');
      }
      scheduleCustomThemeSave();
    });

    // Gradient editor: keep the collapsed panel, the layer preview and the saved theme
    // in sync while the user picks the two colors and the direction.
    function refreshGradientPreview(row) {
      const alphaInput = row.find('.theme-layer-alpha');
      const baseColor = themeLayers.colorWithAlpha(
        row.find('.theme-layer-color').val() || DEFAULT_THEME_COLOR,
        alphaInput.length ? Number(alphaInput.val()) : 100
      );
      const imageSet = !!row.data('previewImage');
      const enabled = row.find('.theme-layer-gradient-enabled').is(':checked') && !imageSet;
      const from = row.find('.theme-layer-gradient-from').val() || baseColor;
      const to = row.find('.theme-layer-gradient-to').val() || from;
      const angle = gradientAngleFromDom(row);
      const layers = [];
      if (enabled) layers.push(`linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`);
      const imageSrc = row.data('previewImage') || '';
      if (imageSrc) layers.push(require(path.join(appPath, 'util/cssUrl.js')).cssUrl(imageSrc));
      // An enabled gradient replaces the layer's base color entirely (the generated app/overlay
      // CSS drops the opaque color backdrop too), so the swatch must not keep the base color.
      setSwatch(row, {
        color: enabled ? 'transparent' : baseColor,
        image: layers.length ? layers.join(',') : 'none',
      });
    }

    $('#theme-customizer-layers').on('change', '.theme-layer-gradient-enabled', function () {
      const row = $(this).closest('.theme-layer-row');
      const panel = row.find('.theme-layer-gradient-panel');
      panel.toggleClass('open', this.checked);
      // Keep the picker in place (no layout shift) but disable it while the gradient replaces it.
      row.find('.theme-layer-color, .theme-layer-alpha').prop('disabled', this.checked);
      if (this.checked) {
        // A freshly enabled gradient follows the layer color unless the user already
        // picked custom colors for it (detected by comparing with the stored base color).
        const grad = panel.data('gradient') || {};
        const base = panel.data('baseColor') || DEFAULT_THEME_COLOR;
        if ((!grad.from || grad.from === base) && (!grad.to || grad.to === base)) {
          const color = row.find('.theme-layer-color').val() || DEFAULT_THEME_COLOR;
          row.find('.theme-layer-gradient-from').val(color);
          row.find('.theme-layer-gradient-to').val(color);
        }
      }
      refreshGradientPreview(row);
      scheduleCustomThemeSave();
    });

    $('#theme-customizer-layers').on('input', '.theme-layer-gradient-from, .theme-layer-gradient-to, .theme-layer-gradient-angle', function () {
      refreshGradientPreview($(this).closest('.theme-layer-row'));
      scheduleCustomThemeSave();
    });

    $('#theme-customizer-layers').on('click', '.theme-layer-image', async function () {
      const layer = $(this).closest('.theme-layer-row').data('layer');
      try {
        const result = await ipcRenderer.invoke('pick-theme-image', layer);
        if (result && result.ok) {
          // Refresh the draft from the live DOM first so changing only the image never
          // resets unsaved color/effect edits made in other rows.
          const draft = customThemeFromDom();
          if (draft[layer]) {
            draft[layer].image = result.file;
            renderCustomThemeLayers(draft);
          }
          scheduleCustomThemeSave();
        }
      } catch (err) {
        debug.log(`theme image pick failed: ${err}`);
      }
    });

    $('#theme-customizer-layers').on('click', '.theme-layer-clear-image', function () {
      const layer = $(this).closest('.theme-layer-row').data('layer');
      const draft = customThemeFromDom();
      if (draft[layer] && draft[layer].image) {
        draft[layer].image = '';
        renderCustomThemeLayers(draft);
        scheduleCustomThemeSave();
      }
    });

    // Puts back the theme the editor was opened on (read back from the main process), not a
    // generic default; the Custom slot has nothing to go back to, so it stays default.
    $('#theme-customizer-reset').on('click', async function () {
      if (!editingValue || editingValue === 'custom') {
        renderCustomThemeLayers(themeLayers.defaultCustomTheme());
        scheduleCustomThemeSave();
        return;
      }
      try {
        const model = await ipcRenderer.invoke('get-theme-model', editingValue);
        renderCustomThemeLayers((model && model.theme) || themeLayers.defaultCustomTheme());
      } catch (err) {
        debug.log(`theme reset failed: ${err}`);
        renderCustomThemeLayers(themeLayers.defaultCustomTheme());
      }
      scheduleCustomThemeSave();
    });

    function setThemeSaveStatus(message, kind) {
      $('#theme-save-status').text(message || '').removeClass('ok error').addClass(kind || '');
    }

    // A name clash is never overwritten silently, only via explicit Replace (same two-step as import).
    $('#btn-save-theme').on('click', async function () {
      const name = themeNameFromDom();
      if (!name) {
        refreshThemeNameState();
        $('#theme-customizer-name').trigger('focus');
        return;
      }
      const self = $(this);
      self.prop('disabled', true);
      try {
        const request = { name, theme: customThemeFromDom(), base: editingBase };
        let res = await ipcRenderer.invoke('save-theme-as', request);

        if (res && !res.ok && res.error === 'duplicate') {
          const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
            type: 'question',
            buttons: [t('replace-theme', 'Replace', 'Remplacer'), t('cancel', 'Cancel', 'Annuler')],
            defaultId: 1,
            cancelId: 1,
            title: t('save-theme-duplicate-title', 'Theme already exists', 'Ce theme existe déjà'),
            message: t('import-theme-duplicate-message', 'A theme named “{name}” is already installed.', 'Un theme nommé « {name} » est déjà installé.', {
              name: res.name || name,
            }),
            detail: t(
              'save-theme-duplicate-detail',
              'Replacing overwrites it with what the editor is showing. To keep both, give this one another name.',
              'Remplacer l’écrase par ce que montre l’éditeur. Pour garder les deux, donne un autre nom à celui-ci.'
            ),
            noLink: true,
          });
          if (choice !== 0) {
            setThemeSaveStatus('');
            self.prop('disabled', false);
            return;
          }
          res = await ipcRenderer.invoke('save-theme-as', { ...request, overwrite: true });
        }

        if (res && res.ok) {
          // Selecting it rebuilds the picker and fires the change handler, which applies it and
          // reopens the editor on the theme that now exists rather than on the draft.
          populateThemeSelect(res.value);
          setThemeSaveStatus(t('save-theme-done', 'Theme saved: {name}', 'Theme enregistré : {name}', { name: res.name }), 'ok');
        } else {
          setThemeSaveStatus(themeErrorText(res), 'error');
        }
      } catch (err) {
        debug.log(err);
        setThemeSaveStatus(themeErrorText({ error: String(err) }), 'error');
      }
      self.prop('disabled', false);
      refreshThemeNameState();
    });

    // Portable themes (.awtheme): Import validates the package in the main process and only touches
    // storage once the user agrees. A user stylesheet has no model, so Export refuses it.
    function setThemeLibraryStatus(message, kind) {
      $('#theme-library-status').text(message || '').removeClass('ok error').addClass(kind || '');
    }

    function installedTheme(value) {
      const name = userThemes.parsePackValue(value);
      return name ? installedThemes.find((theme) => theme.name === name) || null : null;
    }

    // The card belongs to themes a person owns (Custom, imported); a built-in is not theirs to
    // export or delete, so the card is simply absent there, not disabled.
    function refreshThemeLibraryControls() {
      const value = String($('#option_theme').val() || 'default');
      const imported = installedTheme(value);
      // Shown for every theme the app can write out except a user stylesheet, built-ins included;
      // Export itself refuses a built-in and explains why.
      const shown = userThemes.parseValue(value) === null;
      $('#theme-library').toggle(shown);
      $('#btn-export-theme').prop('disabled', !shown);
      $('#btn-delete-theme').prop('hidden', !imported);
      // Only on the way out: the picker settles asynchronously after an import, so clearing on
      // every call would wipe the message the import had just written.
      if (!shown) setThemeLibraryStatus('');
    }

    function themeErrorText(res) {
      const error = String((res && res.error) || '');
      if (error === 'app-too-old') {
        return t('import-theme-app-too-old', 'This theme needs AW Next {version} or newer.', 'Ce theme nécessite AW Next {version} ou plus récent.', {
          version: (res && res.requires) || '',
        });
      }
      if (error === 'format-too-new') {
        return t(
          'import-theme-format-too-new',
          'This theme file was made by a newer version of AW Next.',
          'Ce fichier de theme a été créé par une version plus récente d’AW Next.'
        );
      }
      if (error === 'css-theme-not-exportable') {
        return t(
          'export-theme-css-unsupported',
          'A stylesheet theme cannot be exported. Share the .css file itself instead.',
          'Un theme CSS ne peut pas être exporté. Partage plutôt le fichier .css lui-même.'
        );
      }
      // The one refusal the user can act on immediately, so it says what to do rather than what
      // went wrong.
      if (error === 'theme-name-required') {
        return t('theme-name-required', 'Name your theme to show it in the list and export it.', 'Nomme ton thème pour l’afficher dans la liste et l’exporter.');
      }
      // A built-in exported under its own name would shadow that built-in on another machine.
      if (error === 'reserved-name') {
        return t(
          'export-theme-reserved-name',
          'A built-in theme keeps its name. Give this one a name of your own in the editor below, then export it.',
          'Un thème intégré garde son nom. Donne-lui un nom à toi dans l’éditeur ci-dessous, puis exporte-le.'
        );
      }
      const invalid = t('import-theme-invalid', 'This file is not a valid theme package.', 'Ce fichier n’est pas un paquet de theme valide.');
      return error ? `${invalid} (${error})` : invalid;
    }

    $('#btn-export-theme').on('click', async function () {
      const value = String($('#option_theme').val() || 'default');
      const self = $(this);
      // An unnamed Custom theme is stopped here (not just in the file dialog) so focus lands on the
      // field that fixes it.
      if (value === 'custom' && !refreshThemeNameState()) {
        setThemeLibraryStatus(themeErrorText({ error: 'theme-name-required' }), 'error');
        $('#theme-customizer-name').trigger('focus');
        return;
      }
      self.css('pointer-events', 'none');
      try {
        const known = installedTheme(value);
        const res = await ipcRenderer.invoke('export-theme', {
          value,
          // An imported theme keeps its own name through a re-export; anything else uses the editor
          // field, falling back to the picker's row label for a built-in.
          name: known ? known.name : themeNameFromDom() || selectedThemeLabel(),
        });
        if (res && res.ok) {
          setThemeLibraryStatus(t('export-theme-done', 'Theme exported: {name}', 'Theme exporté : {name}', { name: res.name }), 'ok');
        } else if (!res || !res.canceled) {
          setThemeLibraryStatus(themeErrorText(res), 'error');
        }
      } catch (err) {
        debug.log(err);
        setThemeLibraryStatus(themeErrorText({ error: String(err) }), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    // `pendingThemeFile` is the package the preview frame is showing; installed only on confirm,
    // and cancelling removes the unpacked copy it was drawn from.
    let pendingThemeFile = '';
    let themePreviewResize = null;
    let themePreviewOpener = null;

    // Lays the sample out at the gallery's render size, then scales to fit, so the preview matches
    // what the published card shows instead of re-flowing at its own width.
    function fitThemePreview() {
      const wrap = document.querySelector('#theme-preview .theme-preview-frame');
      if (!wrap) return;
      // The sample's own proportions, so the stylesheet can cap the picture by the window's height
      // and still hand back a box of exactly this shape.
      wrap.style.setProperty('--theme-preview-w', String(themeMock.DESIGN.width));
      wrap.style.setProperty('--theme-preview-h', String(themeMock.DESIGN.height));
      wrap.style.setProperty('--theme-preview-ratio', String(themeMock.DESIGN.width / themeMock.DESIGN.height));
      const width = wrap.clientWidth;
      if (!width) return;
      wrap.style.setProperty('--theme-preview-scale', String(width / themeMock.DESIGN.width));
    }

    function closeThemePreview({ discard = true } = {}) {
      pendingThemeFile = '';
      $('#theme-preview').hide().attr('aria-hidden', 'true');
      if (themePreviewOpener && themePreviewOpener.isConnected) themePreviewOpener.focus({ preventScroll: true });
      themePreviewOpener = null;
      // Removed rather than blanked: this modal is opened once per import, and a blank frame still
      // holds a document for the rest of the session.
      const frame = document.getElementById('theme-preview-frame');
      if (frame) frame.remove();
      if (themePreviewResize) {
        themePreviewResize.disconnect();
        themePreviewResize = null;
      }
      if (discard) ipcRenderer.invoke('discard-theme-preview').catch(() => {});
    }

    function themePreviewRow(label, value) {
      return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
    }

    // The same five layers the gallery card shows, so a theme reads consistently everywhere and
    // the actual colors (which a screenshot can't convey precisely) are visible.
    function themePalette(theme) {
      const chips = ['bg', 'header', 'panel', 'card', 'accent']
        .map((id) => (theme && theme[id] ? themeLayers.colorWithoutAlpha(theme[id].color) : ''))
        .filter(Boolean)
        .map((color) => `<i style="background:${escapeHtml(color)}"></i>`)
        .join('');
      return chips ? `<span class="theme-preview-swatches">${chips}</span>` : '';
    }

    function showThemePreview(result) {
      const manifest = result.manifest || {};
      pendingThemeFile = result.file || '';

      const images = (manifest.assets && manifest.assets.length) || 0;
      const rows = [themePreviewRow(t('theme-preview-name', 'Name', 'Nom'), manifest.name || '')];
      if (manifest.author) rows.push(themePreviewRow(t('theme-preview-author', 'By', 'Par'), manifest.author));
      if (manifest.description) rows.push(themePreviewRow(t('theme-preview-description', 'Description', 'Description'), manifest.description));
      if (manifest.version) rows.push(themePreviewRow(t('theme-preview-version', 'Version', 'Version'), manifest.version));
      if (manifest.tags && manifest.tags.length) {
        rows.push(themePreviewRow(t('theme-preview-tags', 'Tags', 'Étiquettes'), manifest.tags.join(', ')));
      }
      rows.push(
        `<dt>${escapeHtml(t('theme-preview-palette', 'Palette', 'Palette'))}</dt><dd>${themePalette(result.theme)}</dd>`
      );
      // How much of the file is pictures, since that is the part a reader is trusting rather than
      // reading: "3 images, 240 KB" says more than either number alone.
      rows.push(
        themePreviewRow(
          t('theme-preview-images', 'Images', 'Images'),
          images
            ? `${images} (${Math.max(1, Math.round((result.bytes || 0) / 1024))} KB)`
            : t('theme-preview-no-images', 'None, colours only', 'Aucune, couleurs seules')
        )
      );
      rows.push(
        themePreviewRow(
          t('theme-preview-requires', 'Requires', 'Nécessite'),
          (manifest.app && manifest.app.minVersion) || t('theme-preview-any-version', 'Any version', 'Toute version')
        )
      );
      $('#theme-preview-meta').html(rows.join(''));
      $('#theme-preview-note').text(
        result.installed
          ? t('theme-preview-replaces', 'A theme of this name is already installed.', 'Un theme de ce nom est déjà installé.')
          : t('theme-preview-note', 'Nothing is installed until you confirm.', 'Rien n’est installé tant que tu ne confirmes pas.')
      );

      // srcdoc document, so it inherits the page's CSP: own markup only, no script allowed to run.
      const frame = ensureFrame(document.querySelector('#theme-preview .theme-preview-frame'), {
        id: 'theme-preview-frame',
        title: 'theme preview',
      });
      if (frame) {
        frame.srcdoc = themeMock.buildThemeMock(result.theme, {
          // The frame runs under `default-src 'none'`, so its own typefaces must be carried inline.
          fontCss: themeFonts.themeMockFontCss(),
          labels: {
            library: t('theme-mock-library', 'Library', 'Bibliothèque'),
            achievements: t('theme-mock-achievements', 'Achievements', 'Succès'),
            settings: t('theme-mock-settings', 'Settings', 'Réglages'),
            theme: t('theme-mock-theme', 'Theme', 'Thème'),
            apply: t('theme-mock-apply', 'Apply', 'Appliquer'),
            cancel: t('cancel', 'Cancel', 'Annuler'),
            unlocked: t('theme-mock-unlocked', 'Unlocked', 'Débloqué'),
            locked: t('theme-mock-locked', 'Locked', 'Verrouillé'),
            rare: t('theme-mock-rare', 'Rare', 'Rare'),
            games: t('theme-mock-games', 'games', 'jeux'),
            earned: t('theme-mock-earned', 'achievements', 'succès'),
            complete: t('theme-mock-complete', 'complete', 'terminé'),
          },
        });
      }
      themePreviewOpener = document.activeElement;
      $('#theme-preview').show().attr('aria-hidden', 'false');
      document.getElementById('theme-preview-cancel').focus({ preventScroll: true });
      // Shown first, then measured: the wrapper has no width while the modal is display:none.
      fitThemePreview();
      const wrap = document.querySelector('#theme-preview .theme-preview-frame');
      if (wrap && typeof ResizeObserver === 'function') {
        themePreviewResize = new ResizeObserver(fitThemePreview);
        themePreviewResize.observe(wrap);
      }
    }

    async function applyImportedTheme(file) {
      let res = await ipcRenderer.invoke('import-theme', { file });
      // A name clash changes nothing until the user picks: replace the theme, or keep both.
      if (res && !res.ok && res.error === 'duplicate') {
        const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'question',
          buttons: [
            t('keep-both-themes', 'Keep both', 'Garder les deux'),
            t('replace-theme', 'Replace', 'Remplacer'),
            t('cancel', 'Cancel', 'Annuler'),
          ],
          defaultId: 0,
          cancelId: 2,
          title: t('import-theme-duplicate-title', 'Theme already exists', 'Ce theme existe déjà'),
          message: t('import-theme-duplicate-message', 'A theme named “{name}” is already installed.', 'Un theme nommé « {name} » est déjà installé.', {
            name: res.name || '',
          }),
          detail: t(
            'import-theme-duplicate-detail',
            'Keep both installs the imported theme under a new name. Replace overwrites the installed one.',
            'Garder les deux installe le theme importé sous un nouveau nom. Remplacer écrase celui déjà installé.'
          ),
          noLink: true,
        });
        if (choice === 2) return null;
        res = await ipcRenderer.invoke('import-theme', { file, duplicate: choice === 1 ? 'replace' : 'rename' });
      }
      return res;
    }

    $('#btn-import-theme').on('click', async function () {
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const res = await ipcRenderer.invoke('preview-theme', {});
        if (res && res.ok) {
          setThemeLibraryStatus('');
          showThemePreview(res);
        } else if (!res || !res.canceled) {
          setThemeLibraryStatus(themeErrorText(res), 'error');
        }
      } catch (err) {
        debug.log(err);
        setThemeLibraryStatus(themeErrorText({ error: String(err) }), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    $('#theme-preview-cancel').on('click', () => closeThemePreview());
    $('#theme-preview .overlay').on('click', () => closeThemePreview());

    $('#theme-preview-apply').on('click', async function () {
      const file = pendingThemeFile;
      if (!file) return closeThemePreview();
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const res = await applyImportedTheme(file);
        // The preview folder is dropped by the import itself; cancelling the clash dialog is the
        // only path that still owns it.
        closeThemePreview({ discard: !res || !res.ok });
        if (res && res.ok) {
          // Selecting it rebuilds the dropdown and fires the change handler, which applies it.
          populateThemeSelect(res.value);
          setThemeLibraryStatus(t('import-theme-done', 'Theme imported: {name}', 'Theme importé : {name}', { name: res.name }), 'ok');
        } else if (res) {
          setThemeLibraryStatus(themeErrorText(res), 'error');
        }
      } catch (err) {
        debug.log(err);
        closeThemePreview();
        setThemeLibraryStatus(themeErrorText({ error: String(err) }), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    $('#btn-delete-theme').on('click', async function () {
      const value = String($('#option_theme').val() || '');
      const known = installedTheme(value);
      if (!known) return;
      const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: [t('delete', 'Delete', 'Supprimer'), t('cancel', 'Cancel', 'Annuler')],
        defaultId: 1,
        cancelId: 1,
        title: t('delete-theme-title', 'Delete theme', 'Supprimer le theme'),
        message: t('delete-theme-message', 'Delete the theme “{name}”?', 'Supprimer le theme « {name} » ?', { name: known.name }),
        detail: t(
          'delete-theme-detail',
          'The theme and the images it came with are removed from disk. This cannot be undone.',
          'Le theme et les images qu’il contenait sont supprimés du disque. Cette action est irréversible.'
        ),
        noLink: true,
      });
      if (choice !== 0) return;
      // Must await the theme swap before deleting the folder: Windows refuses to delete a folder
      // whose images the window still has open (EPERM otherwise).
      const wasSelected = String($('#option_theme').val() || '');
      populateThemeSelect('default');
      await applyThemeValue('default');
      try {
        const res = await ipcRenderer.invoke('delete-installed-theme', known.name);
        if (res && res.ok) {
          // Rebuild the picker AFTER the folder is gone, not only before, or the deleted theme's
          // row stays listed until the next rebuild.
          populateThemeSelect('default');
          setThemeLibraryStatus(t('delete-theme-done', 'Theme deleted: {name}', 'Theme supprimé : {name}', { name: res.name }), 'ok');
        } else {
          // Nothing was removed, so put the user back where they were.
          populateThemeSelect(wasSelected);
          applyThemeValue(wasSelected);
          setThemeLibraryStatus(themeErrorText(res), 'error');
        }
      } catch (err) {
        debug.log(err);
        setThemeLibraryStatus(themeErrorText({ error: String(err) }), 'error');
      }
    });

    // Live theme preview: applying on change lets the user see the theme before committing with OK;
    // Cancel restores whatever is saved in the config.
    $('#option_theme').on('change', function () {
      const value = $(this).val() || 'default';
      fadeTheme(() => applyThemeValue(value));
      // Every theme is editable except a user stylesheet, which has no color model to edit.
      if (userThemes.parseValue(value)) closeThemeEditor();
      else openThemeEditor(value);
      refreshThemeLibraryControls();
      ipcRenderer.send('theme-changed', value);
    });

    // Only where arrows exist to step: `.right` is also a layout class on the Presets tab's action
    // rows, and swallowing the wheel there broke scrolling across the bottom of that tab.
    $('#settings .arrow-list .right').on('wheel', function (event) {
      const stepper = $(this).find(event.originalEvent.deltaY > 0 ? '.next' : '.previous');
      if (!stepper.length) return;
      event.preventDefault();
      stepper.trigger('click');
    });

    $('#option_lang').mouseover(function () {
      let self = $(this);
      let tooltip = self.find('option:selected').data('tooltip');
      self.attr('title', tooltip);
    });

    $('#settings-mode .settings-mode-switch button').on('click', function () {
      setInterfaceMode($(this).attr('data-mode'));
      // The rows a search can see depend on the mode.
      const query = $('#settings-search-input').val();
      if (query) applySettingsSearch(query);
    });

    $('#settingNav li[data-view]').click(function () {
      let self = $(this);
      if (self.hasClass('active')) return;
      self.css('pointer-events', 'none');
      let view = self.data('view');

      $('#settingNav li[data-view]').removeClass('active');
      self.addClass('active');

      $('#settings .box section.content').removeClass('active settings-view-opening');
      $("#settings .box section.content[data-view='" + view + "']").addClass('active settings-view-opening').scrollTop(0);

      self.css('pointer-events', 'initial');
      renderSaveState();
    });

    $('#settings').on('change.helpPreview', 'select', refreshHelpPreview);

    // Cards fold under their header; collapse state is per section and persisted. Nothing is moved
    // or removed, since the i18n loader binds labels positionally.
    const sectionRules = require(path.join(appPath, 'util/settingsSections.js'));
    const SECTION_STATE_KEY = 'settingsCollapsedSections';
    const SECTION_DEFAULTS_KEY = 'settingsSectionDefaults';

    function readCollapsedSections() {
      try {
        const stored = JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || 'null');
        const resolved = sectionRules.resolveCollapsed(stored, localStorage.getItem(SECTION_DEFAULTS_KEY));
        if (resolved.changed) writeCollapsedSections(resolved.keys);
        return resolved.keys;
      } catch (err) {
        debug.log(`settings sections: unreadable stored state (${err})`);
      }
      return new Set(sectionRules.DEFAULT_COLLAPSED);
    }

    function writeCollapsedSections(keys) {
      try {
        localStorage.setItem(SECTION_STATE_KEY, JSON.stringify([...keys]));
        localStorage.setItem(SECTION_DEFAULTS_KEY, String(sectionRules.DEFAULTS_VERSION));
      } catch (err) {
        debug.log(`settings sections: could not persist state (${err})`);
      }
    }

    function setSectionCollapsed(section, collapsed, animate = false) {
      const el = $(section);
      const oldTimer = el.data('sectionAnimationTimer');
      if (oldTimer) clearTimeout(oldTimer);
      el.removeClass('is-opening');
      el.toggleClass('is-collapsed', collapsed);
      const header = sectionRules.headerFor($, section);
      if (header) header.attr('aria-expanded', collapsed ? 'false' : 'true');
      if (!collapsed && animate) {
        // Force a fresh animation even after repeatedly closing and reopening the same card.
        void el[0].offsetWidth;
        el.addClass('is-opening');
        el.data(
          'sectionAnimationTimer',
          setTimeout(() => el.removeClass('is-opening').removeData('sectionAnimationTimer'), 200)
        );
      }
    }

    function initCollapsibleSections() {
      const collapsed = readCollapsedSections();
      $('#settings .box section.content[data-view]').each(function () {
        const view = $(this).attr('data-view');
        sectionRules.sectionsIn($, this).each(function (index) {
          const section = $(this);
          const header = sectionRules.headerFor($, this);
          if (!header || section.data('sectionKey')) return; // already wired
          const key = sectionRules.sectionKey($, this, view, index);
          section.addClass('settings-section').data('sectionKey', key);
          header.addClass('settings-section-header').attr({ role: 'button', tabindex: '0' });
          // The chevron is appended once and points down when open, sideways when closed.
          if (!header.children('.settings-section-arrow').length) {
            header.append('<i class="fas fa-chevron-down settings-section-arrow" aria-hidden="true"></i>');
          }
          setSectionCollapsed(this, collapsed.has(key));
        });
      });
    }

    function toggleSection(section) {
      const key = $(section).data('sectionKey');
      if (!key) return;
      const collapsed = readCollapsedSections();
      const nowCollapsed = !$(section).hasClass('is-collapsed');
      if (nowCollapsed) collapsed.add(key);
      else collapsed.delete(key);
      setSectionCollapsed(section, nowCollapsed, true);
      writeCollapsedSections(collapsed);
    }

    window.initCollapsibleSections = initCollapsibleSections;
    initCollapsibleSections();

    $('#settings').on('click', '.settings-section-header', function () {
      toggleSection($(this).closest('.settings-section'));
    });
    $('#settings').on('keydown', '.settings-section-header', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      toggleSection($(this).closest('.settings-section'));
    });

    // Typing filters every tab at once; rows are hidden with a class, never removed, since
    // positional i18n requires the DOM structure to survive.
    const searchRules = require(path.join(appPath, 'util/settingsSearch.js'));

    function clearSettingsSearch() {
      $('#settings').removeClass('searching no-search-result');
      $('#settings .box .content').removeClass('search-hidden');
      $('#settings .box .content .search-hidden').removeClass('search-hidden');
      $('#settingNav li[data-view]').removeClass('no-match').find('.nav-count').text('');
      $('#settings-search-advanced').prop('hidden', true);
    }

    // Simple mode folds rows away; say so when a search would have matched them.
    function showAdvancedMatches(rawQuery) {
      const count = interfaceMode.isSimple(currentInterfaceMode()) ? searchRules.countModeHiddenMatches($, rawQuery) : 0;
      const box = $('#settings-search-advanced');
      box.prop('hidden', count === 0);
      if (count === 0) return;
      box.find('p').text(localeText('settings.search.advancedMore', { count }));
      box.find('b').text(localeText('settings.search.advancedShow'));
    }

    $('#settings-search-advanced button').on('click', function () {
      $(`#settings-mode .settings-mode-switch button[data-mode='${interfaceMode.ADVANCED}']`).trigger('click');
    });

    function applySettingsSearch(rawQuery) {
      if (searchRules.parseTerms(rawQuery).length === 0) {
        clearSettingsSearch();
        return;
      }

      $('#settings').addClass('searching');
      const { total, perView, labelPerView } = searchRules.filterSections($, rawQuery);
      showAdvancedMatches(rawQuery);

      for (const [view, count] of Object.entries(perView)) {
        const navItem = $(`#settingNav li[data-view='${view}']`);
        navItem.find('.nav-count').text(count);
        navItem.toggleClass('no-match', count === 0);
      }

      $('#settings').toggleClass('no-search-result', total === 0);

      // Land the user on results rather than on an empty tab, but never yank them off a tab that
      // still has matches - that would fight their own typing.
      if (total > 0 && $('#settingNav li.active').hasClass('no-match')) {
        const named = $('#settingNav li[data-view]:not(.no-match)').filter(function () {
          return labelPerView[$(this).attr('data-view')] > 0;
        });
        (named.length ? named : $('#settingNav li[data-view]:not(.no-match)')).first().trigger('click');
      }
    }

    let searchDebounce = null;
    $('#settings-search-input').on('input', function () {
      const value = $(this).val();
      clearTimeout(searchDebounce);
      // Filtering walks every row of every tab; debouncing keeps fast typing from re-running it per
      // keystroke while still feeling immediate.
      searchDebounce = setTimeout(() => applySettingsSearch(value), 80);
    });

    $('#settings-search-input').on('keydown', function (e) {
      // The first Escape clears the field; with nothing to clear it goes on and closes Settings.
      if (e.key === 'Escape' && $(this).val()) {
        e.stopPropagation();
        $(this).val('');
        clearSettingsSearch();
      }
    });

    $('#settings-search-clear').click(function () {
      $('#settings-search-input').val('').focus();
      clearSettingsSearch();
    });

    // Ctrl+F while Settings is open goes to the field, matching every other search box in the app.
    $(document).on('keydown', function (e) {
      if (!$('#settings').is(':visible')) return;
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'f') {
        e.preventDefault();
        $('#settings-search-input').focus().select();
      }
    });

    // Reopening Settings should start from a clean slate rather than the last search.
    window.resetSettingsSearch = function () {
      $('#settings-search-input').val('');
      clearSettingsSearch();
    };

    // Tell the user what a freshly added save/config folder actually contains: run the real scan on
    // it and report the game count, so "added but nothing shows up" stops being a mystery.
    async function reportFolderScan(dir) {
      const result = $('#folder-action-result');
      result.text(result.attr('data-running') || t('scanning', 'Scanning…', 'Analyse…'));
      try {
        const found = await userDir.scan(dir);
        const count = Array.isArray(found) ? found.length : 0;
        result.text(
          count > 0
            ? `${result.attr('data-done') || t('scan-complete', 'Scan complete.', 'Analyse terminée.')} (${count})`
            : result.attr('data-invalid') || t('no-game-found', 'No game found.', 'Aucun jeu trouvé.')
        );
      } catch (err) {
        debug.log(err);
        result.text('');
      }
    }

    // On Linux these folders are read inside every Wine and Proton prefix: show them as paths there.
    if (process.platform === 'linux') {
      $('#defaultdir .path').each(function () {
        const folder = prefixFolder($(this).children('.constant').text());
        if (!folder) return;
        $(this).children('.constant').text(folder);
        this.lastChild.textContent = this.lastChild.textContent.replace(/\\/g, '/');
      });
    }

    $('#addCustomDir').click(async function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      try {
        let dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'showHiddenFiles'] });

        if (dialog.filePaths.length > 0) {
          debug.log(`Adding folder: ${dialog.filePaths}`);

          const diagnosis = await userDir.diagnose(dialog.filePaths[0]);
          if (diagnosis.accepted) {
            // A folder picked inside a game is kept as the game's own folder.
            const accepted = diagnosis.canonicalPath || dialog.filePaths[0];
            populateUserDirList({ dir: accepted, origin: 'manual' });
            reportFolderScan(accepted);
          } else {
            // Say why, not just no: a rejected folder and a folder AW never looked at used to be
            // indistinguishable to the user.
            debug.log(`-> Invalid folder (${diagnosis.code}): ${JSON.stringify(diagnosis.evidence)}`);
            remote.dialog.showMessageBoxSync({
              type: 'warning',
              title: t('invalid-folder', 'Invalid folder', 'Dossier invalide'),
              message: describeFolderDiagnosis(diagnosis, t),
              // The old selector matched nothing, so every rejection threw inside .replace instead.
              detail: String($('#folder-add-info').text() || '').replace(/\s{2,}/g, ' ').trim(),
            });
          }
        } else {
          debug.log('Adding folder: User Cancel');
        }
      } catch (err) {
        remote.dialog.showMessageBoxSync({
          type: 'error',
          title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
          message: t('error-adding-custom-folder', 'Error adding custom folder', 'Erreur lors de l\'ajout du dossier personnalisé'),
          detail: `${err}`,
        });
      }

      self.css('pointer-events', 'initial');
    });

    $('#addLibraryDir').click(async function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      try {
        let dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'showHiddenFiles'] });

        if (dialog.filePaths.length > 0) {
          debug.log(`Adding library folder: ${dialog.filePaths}`);
          populateLibraryDirList({ dir: dialog.filePaths[0], origin: 'manual' });
        } else {
          debug.log('Adding library folder: User Cancel');
        }
      } catch (err) {
        remote.dialog.showMessageBoxSync({
          type: 'error',
          title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
          message: t('error-adding-library-folder', 'Error adding library folder', 'Erreur lors de l\'ajout du dossier de bibliothèque'),
          detail: `${err}`,
        });
      }

      self.css('pointer-events', 'initial');
    });

    // Generate emulator configs for the watched/library folders, then rescan.
    $('#generate-configs').click(async function () {
      const self = $(this);
      const result = $('#generate-configs-result');
      self.css('pointer-events', 'none');
      try {
        // 1) persist the folders currently listed in the UI so the scan uses them
        let userDirList = [];
        $('#settings #dirlist > li').each(function () {
          userDirList.push(folderEntryFromRow(this));
        });
        let libraryDirList = [];
        $('#settings #libdirlist > li').each(function () {
          libraryDirList.push(folderEntryFromRow(this));
        });
        settings.setUserDataPath(ipcRenderer.sendSync('get-user-data-path-sync'));
        await Promise.all([userDir.save(userDirList), libraryDirs.save(libraryDirList)]);

        // 2) quick Goldberg/GBE count across the library folders for a summary (the full scan below
        //    covers every source, not just these)
        let found = [];
        try {
          const goldberg = require(path.join(appPath, 'parser/goldberg.js'));
          for (const entry of libraryDirList.filter((item) => item.enabled)) {
            const dir = entry.path;
            try {
              found = found.concat(goldberg.findCompatibleGames(dir));
            } catch (e) {
              debug.log(e);
            }
          }
        } catch (e) {
          debug.log(e);
        }
        const uniqueFound = [...new Map(found.map((game) => [path.resolve(game.gameDir).toLowerCase(), game])).values()];
        // This pass only ever configures games with no setup at all (it runs unattended, so it must
        // never overwrite one); already-configured games are pointed at Advanced > Fix all games.
        const inspected = uniqueFound.map((game) => ({ game, eligibility: emulatorFixEligibility.inspect({ gameDir: game.gameDir }) }));
        const eligible = inspected.filter((entry) => !entry.game.hasSchema && entry.eligibility.eligible);
        const alreadyConfigured = inspected.filter((entry) => entry.eligibility.reason === 'existing-fix').length;
        const unconfigured = eligible.length;
        if (unconfigured === 0) {
          result.text(
            alreadyConfigured > 0
              ? t(
                  'no-config-eligible-games-configured',
                  '{count} Steam-compatible install(s) found - all of them already have a setup. To rebuild those, use Advanced > Fix all games.',
                  '{count} installation(s) compatible(s) Steam détectée(s) - toutes ont déjà une configuration. Pour les régénérer, utilise Avancé > Réparer tous les jeux.',
                  { count: alreadyConfigured }
                )
              : t('no-config-eligible-games', 'No unconfigured Steam game without an existing fix was found.', 'Aucun jeu Steam sans fix existant ne nécessite de configuration.')
          );
          return;
        }
        const autoFixEnabled = app.config?.emulator?.autoApplyNewGames !== false;
        const detail = autoFixEnabled
          ? t(
              'generate-configs-detail-auto-fix',
              'This starts a full scan now. During that scan, AW Next applies the GBE/Goldberg auto-fix to detected games with a known install folder. Repairs run in the background: scan again if a freshly fixed game does not show as ready yet.',
              "Le bouton lance un scan complet maintenant. Pendant ce scan, AW Next applique l'auto-fix GBE/Goldberg aux jeux détectés qui ont un dossier d'installation connu. Les réparations se font en arrière-plan : relance un scan si un jeu vient juste d'être corrigé et n'apparaît pas encore comme prêt."
            )
          : t(
              'generate-configs-detail-scan-only',
              'This only starts a full detection scan. Automatic repair is disabled in Emulator configuration > Automatically fix newly detected games.',
              'Le bouton lance seulement un scan complet pour détecter les jeux. La réparation automatique est désactivée dans Configuration émulateur > Corriger automatiquement les nouveaux jeux détectés.'
            );
        const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: autoFixEnabled ? 'info' : 'warning',
          title: t('generate-configs', 'Generate configs', 'Génération des configs'),
          message: t('x-emulated-game-s-found-in-your-libraries-x-without-achievements', '{found} Steam-compatible install(s) found - {missing} have no existing fix and are eligible.', '{found} installation(s) compatible(s) Steam détectée(s) - {missing} sans fix existant et éligible(s).', {
            found: uniqueFound.length,
            missing: unconfigured,
          }),
          // Say what happens to the rest, so the two numbers add up instead of leaving a silent gap.
          detail: alreadyConfigured > 0
            ? `${detail}\n\n${t('generate-configs-detail-configured', '{count} install(s) already have a setup and are left untouched - Advanced > Fix all games rebuilds those.', '{count} installation(s) ont déjà une configuration et ne sont pas touchées - Avancé > Réparer tous les jeux les régénère.', { count: alreadyConfigured })}`
            : detail,
          buttons: [t('start-scan', 'Start scan', 'Lancer le scan'), t('cancel', 'Cancel', 'Annuler')],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        if (choice !== 0) return;

        // 3) full rescan - discovers the folders and applies the one-shot emulator fix to unconfigured games
        result.text(
          autoFixEnabled
            ? t('scan-started-auto-fix', 'Scan started - {count} eligible unconfigured game(s) will receive an initial GBE config.', 'Scan lancé - {count} jeu(x) éligible(s) sans configuration recevront une config GBE initiale.', { count: unconfigured })
            : t('scan-started-scan-only', 'Scan started - automatic repair is disabled, no files will be changed.', 'Scan lancé - réparation automatique désactivée, aucun fichier ne sera modifié.')
        );
        resetUI();
      } catch (err) {
        result.text(t('generate-configs-failed-x', 'Generate configs failed: {error}', 'Génération impossible : {error}', { error: err }));
        remote.dialog.showMessageBoxSync({ type: 'error', title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'), message: t('error-generating-configs', 'Error generating configs', 'Erreur lors de la génération des configs'), detail: `${err}` });
      } finally {
        self.css('pointer-events', 'initial');
      }
    });

    // Adding or removing a scan root changes which `local-<hash>` ids can be traced back to a
    // folder, so the resolver's cached folder map has to be rebuilt on the next lookup.
    $(document).on('folder-rescan-locations-changed', function () {
      if (typeof blacklist.forgetLocalInstallIndex === 'function') blacklist.forgetLocalInstallIndex();
    });

    // The game-fix row is MarkerPatch's switch and drives the hidden MadnessPatch and PC Ports rows:
    // one choice on screen, one key per scanner in options.ini. Only a user's change spreads, so a
    // profile that set them apart by hand keeps its values until the switch is touched.
    $('#option_markerpatch').on('change', function () {
      if (settingsReady) $('#option_madnesspatch, #option_pcports').val($(this).val());
    });

    $('#smartFind').click(async function () {
      let self = $(this);
      self.css('pointer-events', 'none');
      $('#wrap-dirlist .loading-overlay').show();
      $('#addCustomDir').css('pointer-events', 'none');
      $('#btn-settings-save').css('pointer-events', 'none');

      debug.log('auto-finding folder(s) ...');
      const result = $('#folder-action-result');
      result.text(result.attr('data-running') || '');
      // Diff the lists before/after so the summary reports what Smart Find actually added.
      const before = $('#settings #dirlist > li').length + $('#settings #libdirlist > li').length;

      try {
        const detectedSaveDirs = userDir.findEntries ? await userDir.findEntries() : (await userDir.find()).map((path) => ({ path }));
        for (const entry of detectedSaveDirs) {
          const dir = entry.path || entry;
          debug.log(`Found folder: ${dir}`);
          if (await userDir.check(dir)) {
            populateUserDirList({ ...entry, dir, origin: 'auto' });
          } else {
            debug.log('-> Invalid folder');
          }
        }
        if (libraryDirs.find) {
          const detectedLibraries = libraryDirs.findEntries ? await libraryDirs.findEntries() : (await libraryDirs.find()).map((path) => ({ path }));
          for (const entry of detectedLibraries) {
            const dir = entry.path || entry;
            debug.log(`Found library folder: ${dir}`);
            populateLibraryDirList({ ...entry, dir, origin: 'auto' });
          }
        }
        const added = Math.max(0, $('#settings #dirlist > li').length + $('#settings #libdirlist > li').length - before);
        result.text(`${result.attr('data-done') || ''} (${added})`);
      } catch (err) {
        result.text('');
        remote.dialog.showMessageBoxSync({
          type: 'error',
          title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
          message: t('error-while-auto-finding-folder-s', 'Error while auto-finding folder(s)', 'Erreur lors de la recherche automatique de dossiers'),
          detail: `${err}`,
        });
      }

      self.css('pointer-events', 'initial');
      $('#wrap-dirlist .loading-overlay').hide();
      $('#addCustomDir').css('pointer-events', 'initial');
      $('#btn-settings-save').css('pointer-events', 'initial');
    });

    const blacklistLabel = t('blacklist-add-placeholder', 'Steam App ID', 'ID d’app Steam');
    $('#blacklist-add-input').attr({ placeholder: blacklistLabel, 'aria-label': blacklistLabel });
    $('#blacklist-add-btn span').text(t('blacklist-add-button', 'Add', 'Ajouter'));
    $('#blacklist-add-help').text(
      t(
        'blacklist-appid-help',
        "The Steam App ID is the number in the game's Steam store address: store.steampowered.com/app/ID",
        "L'ID d'app Steam est le nombre dans l'adresse de la page Steam du jeu : store.steampowered.com/app/ID"
      )
    );

    // Resolve missing numeric blacklist names with a short, cacheable Steam lookup.
    const BLACKLIST_NAME_LOOKUP_TIMEOUT_MS = 8000;
    async function resolveBlacklistNameOnline(appid) {
      const id = String(appid ?? '').trim();
      if (!/^\d+$/.test(id)) return '';
      try {
        const name = await Promise.race([
          ipcRenderer.invoke('get-steam-data', { appid: Number(id), type: 'name' }),
          new Promise((resolve) => setTimeout(() => resolve(''), BLACKLIST_NAME_LOOKUP_TIMEOUT_MS)),
        ]);
        return typeof name === 'string' ? name.trim() : '';
      } catch (err) {
        debug.log(`blacklist: online name lookup failed for ${id}: ${err}`);
        return '';
      }
    }

    // Render hidden games, backfilling missing names locally and then online.
    async function renderBlacklistManager() {
      const listEl = $('#blacklist-manager');
      const emptyEl = $('#blacklist-empty');
      listEl.empty();
      let entries = [];
      try {
        entries = await blacklist.getUserDetailed();
      } catch (err) {
        debug.log(err);
      }
      emptyEl.text(entries.length === 0 ? listEl.attr('data-empty') || '' : '');
      const unresolved = [];
      for (const entry of entries) {
        const li = $('<li>');
        const nameEl = $('<span class="name">')
          .text(entry.name || String(entry.appid))
          .attr('title', String(entry.appid))
          .appendTo(li);
        if (!entry.name) unresolved.push({ appid: entry.appid, nameEl });
        $('<span class="appid">').text(entry.appid).appendTo(li);
        // Worded, not a bare icon: an undo arrow alone did not say it brings the game back.
        $('<button type="button" class="inline-action-btn"><i class="fas fa-undo"></i> <span></span></button>')
          .find('span')
          .text(listEl.attr('data-restore') || '')
          .end()
          .on('click', async function () {
            const btn = $(this);
            btn.css('pointer-events', 'none');
            try {
              await blacklist.remove(entry.appid);
              window.__awBlacklistDirty = true;
              await renderBlacklistManager();
            } catch (err) {
              debug.log(err);
              btn.css('pointer-events', 'initial');
            }
          })
          .appendTo(li);
        listEl.append(li);
      }
      // Deliberately not awaited: the rows are already on screen from local data, and the callers
      // that await this render (opening Settings, restoring a game) must not sit on the network.
      resolveMissingBlacklistNames(unresolved).catch((err) => debug.log(err));
    }

    async function resolveMissingBlacklistNames(pendingRows) {
      for (const pending of pendingRows) {
        // Sequential on purpose: an appid-only blacklist would otherwise fire a burst of store
        // lookups at once, and each one is already cached after the first success.
        const name = await resolveBlacklistNameOnline(pending.appid);
        if (!name) continue;
        // The list may have been re-rendered (or Settings closed) while this was in flight.
        if (pending.nameEl.closest('body').length) pending.nameEl.text(name);
        try {
          await blacklist.setName(pending.appid, name);
        } catch (err) {
          debug.log(err);
        }
      }
    }
    window.renderBlacklistManager = renderBlacklistManager;

    $('#blacklist-add-btn').click(async function () {
      const input = $('#blacklist-add-input');
      const appid = String(input.val() || '').trim();
      if (!/^\d+$/.test(appid)) return;
      try {
        // No name to hand over: add() resolves one from the local sources itself, and the render
        // below fills in anything only Steam knows. Neither step blocks this click.
        await blacklist.add(appid, '');
        input.val('');
        await renderBlacklistManager();
      } catch (err) {
        debug.log(err);
      }
    });

    $('#blacklist_reset').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      blacklist
        .reset()
        .then(() => {
          if ($('#achievement').is(':visible')) {
            $('#btn-previous').trigger('click');
          }
          $('#game-config').hide();
          $('#settings').hide();
          $('#game-list ul').empty();
          self.css('pointer-events', 'initial');
          $('#win-settings').css('pointer-events', 'initial');
          $('#user-info').css('opacity', 0).css('pointer-events', 'none').prop('inert', true);
          $('#game-list .isEmpty').hide();
          let elem = $('#settingNav li[data-view]').first();
          $('#settingNav li[data-view]').removeClass('active');
          elem.addClass('active');
          $('#settings .box section.content').removeClass('active');
          $("#settings .box section.content[data-view='" + elem.data('view') + "']").addClass('active');
          if (app.args.appid) app.args.appid = null;
          app.onStart();
        })
        .catch((err) => {
          self.css('pointer-events', 'initial');
          remote.dialog.showMessageBoxSync({
            type: 'error',
            title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
            message: t('error-while-trying-to-reset-user-blacklist', 'Could not bring the removed games back', 'Impossible de remettre les jeux retirés'),
            detail: `${err}`,
          });
        });
    });

    // Auto-save notification controls, excluding customizer sliders.
    $("#settings .box section.content[data-view='notification']").on('change', 'select, #option_overlayVolume', autosaveNotifications);
    $('#option_overlayEdgeGap').on('change', autosaveNotifications);

    /*
      Distance from the edge: the label follows the slider, and a test popup on screen follows it too
      while it is dragged. With none on screen the first move opens one, so the change is always seen.
    */
    // A test popup goes through the notification queue and takes a few seconds to show.
    const EDGE_GAP_WAIT_STEP_MS = 200;
    const EDGE_GAP_WAIT_MAX_MS = 10000;
    let edgeGapPopupPending = false;
    const currentEdgeGap = () => notificationPlacement.normalizeEdgeGap($('#option_overlayEdgeGap').val());
    function updateOverlayEdgeGapLabel() {
      $('#overlayEdgeGap-value').text(`${currentEdgeGap()} px`);
    }
    // How many popups on screen moved to the slider's current value.
    function moveEdgeGapPopups() {
      return ipcRenderer.invoke('preview-notification-edge-gap', currentEdgeGap()).catch((err) => {
        debug.log(`edge gap preview failed: ${err && (err.message || err)}`);
        return 0;
      });
    }
    // Opens one popup, then puts it at the value the slider holds once it shows.
    async function openEdgeGapPopup() {
      edgeGapPopupPending = true;
      try {
        ipcRenderer.send('spawn-overlay-notification', overlayTestData('toast'));
        for (let waited = 0; waited < EDGE_GAP_WAIT_MAX_MS; waited += EDGE_GAP_WAIT_STEP_MS) {
          await new Promise((resolve) => setTimeout(resolve, EDGE_GAP_WAIT_STEP_MS));
          if (await moveEdgeGapPopups()) return;
        }
      } finally {
        edgeGapPopupPending = false;
      }
    }
    async function previewOverlayEdgeGap() {
      updateOverlayEdgeGapLabel();
      // A Custom popup keeps its dragged spot, so the distance has nothing to show there.
      if (!settingsReady || edgeGapPopupPending || $('#option_overlayPosition').val() === 'custom') return;
      if (!(await moveEdgeGapPopups())) openEdgeGapPopup();
    }
    $('#option_overlayEdgeGap').on('input', previewOverlayEdgeGap);
    $('#option_overlayEdgeGap').on('change', updateOverlayEdgeGapLabel);

    // Collapse overlay-only controls when toast-only mode is selected.
    function animateOverlaySettingCollapse(el, visible) {
      const $el = $(el);
      if (!$el.length) return;
      const collapsed = $el.hasClass('overlay-setting-collapsed');
      if (visible === !collapsed) return;
      if (visible) {
        $el.css('max-height', '0px');
        $el.removeClass('overlay-setting-collapsed');
        void $el[0].offsetHeight;
        $el.css('max-height', $el[0].scrollHeight + 'px');
        setTimeout(() => {
          if (!$el.hasClass('overlay-setting-collapsed')) $el.css('max-height', '');
        }, 320);
      } else {
        $el.css('max-height', '');
        const height = $el[0].scrollHeight;
        $el.css('max-height', height + 'px');
        void $el[0].offsetHeight;
        $el.addClass('overlay-setting-collapsed');
        setTimeout(() => $el.css('max-height', ''), 320);
      }
    }

    function updateOverlayOptionsVisibility() {
      const mode = $('#option_notifMode').val() || 'auto';
      const visible = mode !== 'toast';
      // Only what a popup looks like folds away: the Sounds and Emulators cards serve toasts too.
      $('#options-notify-overlay > li:not(:first-child)').each(function () {
        animateOverlaySettingCollapse(this, visible);
      });
      $('#options-notify-progress, #options-notify-obs').each(function () {
        animateOverlaySettingCollapse($(this).closest('.notify-card')[0], visible);
      });
    }
    // Presets style the in-game overlay; on Windows-toast-only transport nothing a preset describes
    // is ever drawn, so the whole tab hides rather than offering an authoring surface with no effect.
    function updatePresetTabVisibility() {
      const unused = ($('#option_notifMode').val() || 'auto') === 'toast';
      $("#settingNav li[data-view='presets']").toggleClass(interfaceMode.HIDDEN_CLASS, unused);
      $("#settings .box section.content[data-view='presets']").toggleClass(interfaceMode.HIDDEN_CLASS, unused);
      if (unused && $("#settingNav li[data-view='presets']").hasClass('active')) {
        $("#settingNav li[data-view='notification']").trigger('click');
      }
    }
    $('#option_notifMode').on('change', function () {
      updateOverlayOptionsVisibility();
      updatePresetTabVisibility();
    });
    updateOverlayOptionsVisibility();

    // Send notification test requests through the watchdog websocket.
    function setNotificationTestBusy(btn, busy) {
      const button = $(btn || []);
      if (!button.length) return;
      button.toggleClass('is-running', busy).attr('aria-busy', String(busy)).prop('disabled', busy);
      const icon = button.find('i').first();
      if (busy) {
        if (!icon.attr('data-notification-test-icon')) icon.attr('data-notification-test-icon', icon.attr('class') || 'fas fa-bell');
        icon.attr('class', 'fas fa-spinner fa-spin');
      } else {
        icon.attr('class', icon.attr('data-notification-test-icon') || 'fas fa-bell').removeAttr('data-notification-test-icon');
      }
    }

    /*
      Fire and forget, unlike runNotificationTest: the preview the user asked for has already been
      drawn by the time this runs, so a Watchdog that is down or a feed nobody is listening to is
      not a failed test and must not raise a dialog over a preview that worked.
    */
    function broadcastNotificationTest(kind, game) {
      try {
        const ws = new WebSocket('ws://localhost:8082');
        const close = () => {
          try {
            ws.close();
          } catch {}
        };
        ws.onerror = close;
        ws.onmessage = close;
        ws.onopen = () => ws.send(JSON.stringify({ cmd: 'broadcast-test', kind, game: game || undefined }));
        setTimeout(close, 5000);
      } catch (err) {
        debug.log(`notification broadcast test failed: ${err && (err.message || err)}`);
      }
    }

    function runNotificationTest(cmd, btn, game) {
      return new Promise((resolve, reject) => setTimeout(() => {
        const ws = new WebSocket('ws://localhost:8082');
        let settled = false;
        const finish = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          if (err) reject(err);
          else resolve();
        };
        const timeout = setTimeout(() => finish(new Error('Notification test timed out')), 15000);
        ws.onerror = (err) => {
          remote.dialog.showMessageBoxSync({
            type: 'error',
            title: t('websocket-connection-error', 'WebSocket Connection Error', 'Erreur de connexion WebSocket'),
            message: t('notification-test-failure', 'Notification Test Failure.', 'Échec du test de notification.'),
            detail: t('error-in-connection-establishment-net-err-connection-refused-nis', 'Error in connection establishment: net::ERR_CONNECTION_REFUSED\nIs Watchdog Running ?'),
          });
          finish(err);
        };

        ws.onopen = () => {
          ws.onmessage = (evt) => {
            try {
              let res = JSON.parse(evt.data);
              // This socket also receives the notification feed, test sample included, often before
              // the reply (#126): only the answer to this command settles the test.
              if (!res || res.cmd !== cmd) return;
              if (res.success === true) {
                finish();
              } else if (res.success === false && res.error) {
                throw res.error;
              } else {
                throw 'Unexpected response';
              }
            } catch (err) {
              ws.close();
              remote.dialog.showMessageBoxSync({
                type: 'error',
                title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
                message: t('notification-test-failure', 'Notification Test Failure.', 'Échec du test de notification.'),
                detail: `${err}`,
              });
              finish(err);
            }
          };
          try {
            ws.send(JSON.stringify(game ? { cmd, game } : { cmd }));
          } catch (err) {
            ws.close();
            remote.dialog.showMessageBoxSync({
              type: 'error',
              title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
              message: t('notification-test-failure', 'Notification Test Failure.', 'Échec du test de notification.'),
              detail: `${err}`,
            });
            finish(err);
          }
        };
      }, 50));
    }

    // Random rarity for the "rare" test: one of the three tiers presets style (gold ≤5%,
    // silver ≤10%, bronze ≤15%), rounded to one decimal like the real watchdog path.
    function randomRareRarity() {
      const tiers = [
        { min: 0.1, max: 5.0 },
        { min: 5.1, max: 10.0 },
        { min: 10.1, max: 15.0 },
      ];
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      return Math.round((tier.min + Math.random() * (tier.max - tier.min)) * 10) / 10;
    }
    // Build a notification test payload using the current overlay settings.
    function overlayTestData(kind, notificationOverrides, label, game, rarePercent) {
      // One preset renders every kind of notification: a rare unlock and a 100% completion are
      // states the preset itself paints, not separate presets to pick.
      const overrides =
        typeof notificationOverrides === 'string'
          ? { preset: notificationOverrides }
          : notificationOverrides && typeof notificationOverrides === 'object'
            ? notificationOverrides
            : {};
      const gameScoped = Boolean(
        notificationOverrides && typeof notificationOverrides === 'object' && !Array.isArray(notificationOverrides)
      );
      // The Settings form populates lazily, so a preview from a game's panel before it opens must
      // read the saved config instead of its still-empty controls; once ready, the controls win.
      const cfgOverlay = (app.config && app.config.overlay) || {};
      const globalPreset = settingsReady
        ? $('#option_overlayPreset').val() || cfgOverlay.notificationPreset || 'AW Next'
        : cfgOverlay.notificationPreset || 'AW Next';
      const globalSound = settingsReady
        ? $('#option_overlaySound').val() || ''
        : cfgOverlay.randomSound === true
          ? RANDOM_SOUND_VALUE
          : cfgOverlay.notificationSound || '';
      const globalPosition = settingsReady
        ? $('#option_overlayPosition').val() || cfgOverlay.notificationPosition || 'center-bottom'
        : cfgOverlay.notificationPosition || 'center-bottom';
      const globalScale = settingsReady
        ? parseFloat($('#option_overlayScale').val()) || Number(cfgOverlay.notificationScale) || 1
        : Number(cfgOverlay.notificationScale) || 1;
      const controlVolume = Number($('#option_overlayVolume').val());
      const configuredVolume = Number(cfgOverlay.notificationVolume);
      const globalVolume = Math.max(
        0,
        Math.min(
          200,
          settingsReady && Number.isFinite(controlVolume)
            ? controlVolume
            : Number.isFinite(configuredVolume)
              ? configuredVolume
              : 100
        )
      );
      const preset = overrides.preset || globalPreset;
      const presetLabel = label || preset;
      const soundChoice = Object.prototype.hasOwnProperty.call(overrides, 'sound')
        ? overrides.sound
        : globalSound;
      const notificationType = kind === 'toast' || kind === 'rare' ? 'achievement' : kind;
      const rarePct = kind === 'rare' ? rarePercent || randomRareRarity() : null;
      // The rare and 100% tests play the sound those popups would, unless the game picked its own.
      // The progress sound wins over a game's own sound, as it does live, but not over a muted game.
      const gameKeepsSound = Object.prototype.hasOwnProperty.call(overrides, 'sound')
        && (notificationType !== 'progress' || overrides.sound === NO_SOUND_VALUE);
      const tierChoice = gameKeepsSound
        ? ''
        : tierSound(
            {
              notificationSoundRare: settingsReady ? $('#option_overlaySoundRare').val() : cfgOverlay.notificationSoundRare,
              notificationSoundPlatinum: settingsReady ? $('#option_overlaySoundPlatinum').val() : cfgOverlay.notificationSoundPlatinum,
              notificationSoundProgress: settingsReady ? $('#option_overlaySoundProgress').val() : cfgOverlay.notificationSoundProgress,
            },
            { notificationType, rarityPercent: rarePct }
          );
      const sound = soundForPreview(soundChoice);
      // Same resolution as a live popup, so a progress preview lands where real progress would.
      const placement = notificationPlacement.resolvePlacement({
        kind: notificationType,
        game: {
          position: overrides.position,
          scale: overrides.scale,
          customPosition: gameScoped ? overrides.customPosition : null,
        },
        global: {
          position: globalPosition,
          scale: globalScale,
          progressPosition: settingsReady ? $('#option_overlayProgressPosition').val() : cfgOverlay.notificationProgressPosition,
          progressScale: settingsReady ? $('#option_overlayProgressScale').val() : cfgOverlay.notificationProgressScale,
        },
      });
      const texts = {
        toast: {
          displayName: t('test-toast-name', 'Achievement Unlocked', 'Succès débloqué'),
          description: t('test-toast-desc', 'Notification test - {preset} preset', 'Test de notification - preset {preset}', { preset: presetLabel }),
        },
        rare: {
          displayName: t('test-rare-name', 'Rare Achievement', 'Succès rare'),
          description: t('test-rare-desc', 'Rare · {percent}% of players', 'Rare · {percent} % des joueurs', { percent: rarePct }),
        },
        progress: {
          displayName: t('test-progress-name', 'Progress', 'Progression'),
          description: t('test-progress-desc', '3 / 10', '3 / 10'),
        },
        playtime: {
          displayName: t('test-playtime-name', 'Hollow Knight', 'Hollow Knight'),
          description: t('test-playtime-desc', 'You played for 42 minutes', 'Vous avez joué pendant 42 minutes'),
        },
        platinum: {
          displayName: t('test-platinum-name', 'Platinum!', 'Trophée Platine'),
          description: t('test-platinum-desc', '100% completed', '100 % complété'),
        },
      };
      const durRaw = $('#option_overlayDuration').val();
      const durSec = durRaw === 'auto' || !durRaw ? 0 : parseInt(durRaw, 10) || 0;
      const achievementIcon = path.join(appPath, 'resources/img/achievement.svg');
      // The overlay has no game-name field, only `displayName` (the achievement title), so naming
      // the game in the description is the only way a preview can say which game it is.
      const gameIcon = (game && game.icon) || path.join(appPath, 'resources/icon/icon.png');
      if (game && game.name) {
        texts.playtime.displayName = game.name;
        for (const kindName of ['toast', 'rare', 'progress', 'platinum']) texts[kindName].description = game.name;
      }
      return Object.assign(
        {
          // Test notifications may replace the current overlay immediately (and are never
          // deduplicated), so the tester can chain preset previews without waiting.
          test: true,
          preset,
          // The previewed game, so the host resolves the same square logo a real notification for
          // that game would get instead of framing whatever artwork the preview happened to carry.
          appid: (game && game.appid) || '',
          // Only a preview launched from a game's own panel may consult its custom anchor; a
          // generic preview that merely borrows artwork stays at the global custom position.
          // A separated progress popup has its own anchor, so it never consults the game's one.
          gamePositionAppid:
            gameScoped && game && placement.anchor === 'notif' ? String(game.libraryAppid || game.appid || '') : '',
          customPosition: placement.customPosition,
          customAnchor: placement.anchor,
          // `image` is the alias createNotificationWindow() maps onto imagePath/headerPath, which is
          // what the Game Cover preset paints its background from.
          image: (game && game.image) || '',
          // The game the unlock came from, for presets that print it. A generic test has no game, so
          // it names a sample one rather than leaving the row a preset asked for empty.
          gameName: (game && game.name) || t('preset-sample-game', 'Sample Game', 'Jeu d’exemple'),
          // A rare unlock is a normal achievement notification carrying a rarityPercent.
          notificationType,
          rarityPercent: rarePct,
          position: placement.position,
          scale: placement.scale,
          edgeGap: notificationPlacement.normalizeEdgeGap(settingsReady ? $('#option_overlayEdgeGap').val() : cfgOverlay.notificationEdgeGap),
          volume: globalVolume,
          durationMs: durSec > 0 ? durSec * 1000 : undefined,
          // The primary icon. A preview has no per-achievement art, so a game-scoped one shows the
          // game's icon rather than the generic placeholder badge.
          iconPath: kind === 'playtime' || game ? gameIcon : achievementIcon,
          achievementIconPath: achievementIcon,
          gameIconPath: gameIcon,
          progress: kind === 'progress' ? { current: 3, max: 10, percent: 30 } : null,
          // Playtime notifications never play a sound, so its test mirrors that behaviour.
          soundPath: kind === 'playtime' ? '' : resolveSoundFile(tierChoice ? soundForPreview(tierChoice) : sound),
        },
        texts[kind] || texts.toast
      );
    }
    // Routes a test through the picked transport(s) (toast / overlay / both). `game` is optional:
    // a test from a game's own panel previews that game's name and artwork.
    async function fireNotificationTest(kind, btn, modeOverride, notificationOverrides, game) {
      const mode = modeOverride || $('#option_notifMode').val() || 'auto';
      if ($(btn).hasClass('is-running')) return;
      setNotificationTestBusy(btn, true);
      try {
        // A test with no game of its own borrows one from the library, so it previews real cover
        // art instead of the generic badge (falls back to the placeholder on a fresh install).
        if (!game) {
          try {
            const sample = await ipcRenderer.invoke('notification-sample-art');
            if (sample && sample.icon) game = sample;
          } catch {}
        }
        // A preview is one notification. In "Both" mode prefer the styled overlay preview; the
        // Windows transport remains directly testable by selecting Windows notification.
        if (mode === 'toast') await runNotificationTest(kind + '-test', btn, game);
        else {
          ipcRenderer.send('spawn-overlay-notification', overlayTestData(kind, notificationOverrides, null, game));
          // The overlay preview is drawn by this app's own main process, so it never reaches the
          // Watchdog and never reaches the notification feed - which is what the OBS browser source
          // renders. Ask the Watchdog to put the same sample on the feed, so one Test button checks
          // the popup and the stream in every mode, not only "Windows notification".
          broadcastNotificationTest(kind, game);
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      } catch (err) {
        debug.log(`notification test failed: ${err && (err.message || err)}`);
      } finally {
        setNotificationTestBusy(btn, false);
      }
    }
    // Shared by the first-run guide and the per-game health panel, so the rendering and Watchdog
    // protocol stay in one place.
    window.testAchievementWatcherNotification = function (mode, button, notificationOverrides, game, kind = 'toast') {
      // 'auto' previews the overlay: with the app in the foreground and no game covering the screen,
      // that is exactly what Automatic selects at this moment, so the preview stays truthful.
      const transport = ['auto', 'toast', 'overlay', 'both'].includes(mode) ? mode : 'auto';
      const notificationKind = ['toast', 'rare', 'progress', 'playtime', 'platinum'].includes(kind) ? kind : 'toast';
      return fireNotificationTest(notificationKind, button, transport, notificationOverrides, game);
    };
    $('#notify_test').click(function () {
      fireNotificationTest('toast', this);
    });
    $('#notify_rare_test').click(function () {
      fireNotificationTest('rare', this);
    });
    $('#notify_progress_test').click(function () {
      fireNotificationTest('progress', this);
    });
    $('#notify_playtime_test').click(function () {
      fireNotificationTest('playtime', this);
    });
    $('#notify_platinum_test').click(function () {
      fireNotificationTest('platinum', this);
    });
    // Preview a sound at the configured overlay volume (0–200%). >100% needs a WebAudio gain node
    // (Audio.volume caps at 1.0) - mirrors how the real notification window plays it (init.js).
    let previewAudioCtx = null;
    // Resolves "Random" to an actual sound file (picked fresh each call) rather than silence.
    function soundForPreview(name) {
      if (name === NO_SOUND_VALUE) return '';
      if (name !== RANDOM_SOUND_VALUE) return name;
      const pool = $('#option_overlaySound option')
        .map(function () {
          return $(this).attr('value');
        })
        .get()
        .filter((value) => value && value !== RANDOM_SOUND_VALUE && value !== NO_SOUND_VALUE);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';
    }
    function previewSoundAtVolume(name) {
      const file = resolveSoundFile(soundForPreview(name));
      if (!file) return;
      const raw = parseInt($('#option_overlayVolume').val(), 10);
      const gain = Math.max(0, Math.min(2, (Number.isFinite(raw) ? raw : 100) / 100));
      try {
        const audio = new Audio('file:///' + file.replace(/\\/g, '/'));
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx && gain !== 1) {
            if (!previewAudioCtx) previewAudioCtx = new Ctx();
            const srcNode = previewAudioCtx.createMediaElementSource(audio);
            const gainNode = previewAudioCtx.createGain();
            gainNode.gain.value = gain;
            srcNode.connect(gainNode);
            gainNode.connect(previewAudioCtx.destination);
          } else {
            audio.volume = Math.min(1, gain);
          }
        } catch (e) {
          audio.volume = Math.min(1, gain);
        }
        audio.play().catch(() => {});
      } catch (e) {}
    }
    // Preview the overlay sound when the dropdown is changed by the user.
    $('#option_overlaySound').on('change', function () {
      updateDeleteSoundButton();
      const v = $(this).val();
      if (!v) return;
      previewSoundAtVolume(v);
    });
    // Volume slider: live % label while dragging; on release (change), preview the selected sound at
    // the new volume so the user hears what they set (auto-save is the delegated handler above).
    function updateOverlayVolumeLabel() {
      const v = parseInt($('#option_overlayVolume').val(), 10);
      $('#overlayVolume-value').text((Number.isFinite(v) ? v : 100) + '%');
    }
    // The clip length slider saves on release like the volume one; the delegated auto-save above
    // only covers the volume slider by id.
    $('#option_clipSeconds').on('input', updateClipReadouts);
    $('#option_clipSeconds').on('change', autosaveNotifications);
    $('#options-notify-clip').on('change', 'select', updateClipReadouts);
    $('#option_overlayVolume').on('input', updateOverlayVolumeLabel);
    $('#option_overlayVolume').on('change', function () {
      updateOverlayVolumeLabel();
      if (!settingsReady) return; // form is being populated - not a user interaction
      previewSoundAtVolume($('#option_overlaySound').val());
    });
    // Mouse wheel nudges the slider one step, then commits via a debounced change so the
    // preview + auto-save fire once instead of on every tick.
    let volumeWheelCommit = null;
    $('#option_overlayVolume').on('wheel', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const el = this;
      const step = parseInt(el.step, 10) || 5;
      const dir = event.originalEvent.deltaY > 0 ? -1 : 1;
      el.value = Math.max(0, Math.min(200, (parseInt(el.value, 10) || 0) + dir * step));
      updateOverlayVolumeLabel();
      clearTimeout(volumeWheelCommit);
      volumeWheelCommit = setTimeout(() => $(el).trigger('change'), 350);
    });

    // Only a sound the user imported can be deleted, since a bundled one comes back with the app.
    let userSounds = new Set();
    async function refreshUserSounds() {
      try {
        userSounds = new Set((await ipcRenderer.invoke('list-user-sounds')) || []);
      } catch (e) {
        debug.log(e);
        userSounds = new Set();
      }
      updateDeleteSoundButton();
    }
    function updateDeleteSoundButton() {
      $('#btn-delete-sound').prop('hidden', !userSounds.has(String($('#option_overlaySound').val() || '')));
    }
    // The sound dropdown is rebuilt from several places (first paint, import, delete); they must all
    // produce the same list, or one of them silently drops the "Random sound" entry.
    function fillSoundDropdown(sounds, selected) {
      const sel = $('#option_overlaySound');
      sel.empty();
      sel.append($('<option>').attr('value', '').text(sel.attr('data-lang-none') || ''));
      sel.append($('<option>').attr('value', RANDOM_SOUND_VALUE).text(sel.attr('data-lang-random') || ''));
      (sounds || []).forEach((n) => sel.append($('<option>').attr('value', n).text(n.replace(/\.[^.]+$/, ''))));
      if (selected != null) sel.val(selected);
      updateDeleteSoundButton();
      fillTierSoundDropdowns(sounds);
    }
    // The rare, 100%, progress and emulator rows offer the same files, plus "Same as ..." ('') and "None".
    function fillTierSoundDropdowns(sounds) {
      $(PICKED_SOUND_SELECTS).each(function () {
        const sel = $(this);
        const wanted = String(sel.val() || sel.attr('data-value') || '');
        sel.empty();
        sel.append($('<option>').attr('value', '').text(sel.attr('data-lang-same') || ''));
        sel.append($('<option>').attr('value', NO_SOUND_VALUE).text($('#option_overlaySound').attr('data-lang-none') || ''));
        (sounds || []).forEach((n) => sel.append($('<option>').attr('value', n).text(n.replace(/\.[^.]+$/, ''))));
        const shown = (sounds || []).includes(wanted) ? wanted : renamedSound(wanted) || wanted;
        sel.val(sel.find(`option[value="${CSS.escape(shown)}"]`).length ? shown : '');
        sel.removeAttr('data-value');
      });
    }
    $(PICKED_SOUND_SELECTS).on('change', function () {
      const v = $(this).val();
      if (settingsReady && v && v !== NO_SOUND_VALUE) previewSoundAtVolume(v);
    });

    // Import a custom notification sound: copy it into <userData>/sounds, then refresh the dropdown and
    // select it (the change triggers a preview + the Notifications-tab auto-save).
    $('#btn-import-sound').click(async function () {
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const name = await ipcRenderer.invoke('import-sound');
        if (name) {
          fillSoundDropdown(await ipcRenderer.invoke('list-sounds'), name);
          await refreshUserSounds();
          $('#option_overlaySound').change();
        }
      } catch (e) {
        debug.log(e);
      }
      self.css('pointer-events', 'initial');
    });

    // Delete the imported sound the dropdown is on, then fall back to "None" so no setting is left
    // naming a file that no longer exists.
    $('#btn-delete-sound').click(async function () {
      const name = String($('#option_overlaySound').val() || '');
      if (!userSounds.has(name)) return;
      const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: [t('delete', 'Delete', 'Supprimer'), t('cancel', 'Cancel', 'Annuler')],
        defaultId: 1,
        cancelId: 1,
        title: t('delete-sound-title', 'Delete sound', 'Supprimer le son'),
        message: t('delete-sound-message', 'Delete the sound “{name}”?', 'Supprimer le son « {name} » ?', { name }),
        detail: t(
          'delete-sound-detail',
          'The imported sound file is removed from disk. This cannot be undone.',
          'Le fichier son importé sera supprimé du disque. Cette action est irréversible.'
        ),
        noLink: true,
      });
      if (choice !== 0) return;
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const res = await ipcRenderer.invoke('delete-sound', name);
        if (res && res.ok) {
          fillSoundDropdown(await ipcRenderer.invoke('list-sounds'), '');
          await refreshUserSounds();
          $('#option_overlaySound').change();
        }
      } catch (e) {
        debug.log(e);
      }
      self.css('pointer-events', 'initial');
    });

    // Reposition the overlay notification popup through the same draggable witness for global and
    // per-game placement. The main process chooses the storage destination from repositionGameAppid.
    function spawnNotificationReposition(notificationOverrides, game, gameAppid = '', anchor = 'notif') {
      const progress = anchor === 'progressNotif';
      const data = overlayTestData(progress ? 'progress' : 'toast', notificationOverrides, null, game);
      data.position = 'custom';
      data.reposition = true;
      data.customAnchor = progress ? anchor : 'notif';
      data.repositionAnchor = data.customAnchor;
      data.repositionGameAppid = progress ? '' : String(gameAppid || '');
      data.gamePositionAppid = data.repositionGameAppid;
      data.durationMs = undefined;
      data.soundPath = '';
      ipcRenderer.send('spawn-overlay-notification', data);
    }
    window.repositionAchievementWatcherNotification = function (notificationOverrides, game, gameAppid) {
      spawnNotificationReposition(notificationOverrides, game, gameAppid);
    };
    $('#btn-overlay-reposition').click(function () {
      spawnNotificationReposition();
      // Make sure the dropdown reflects that custom positioning is now in use.
      $('#option_overlayPosition').val('custom').change();
    });
    /*
      Centres the popup being placed on one axis. With none on screen it opens one first and centres
      it as soon as it shows: the witness goes through the notification queue, so it is not immediate.
    */
    const CENTER_WAIT_STEP_MS = 150;
    const CENTER_WAIT_MAX_MS = 5000;
    async function centerNotificationReposition(axis) {
      $('#option_overlayPosition').val('custom').change();
      const center = () => ipcRenderer.invoke('center-notification-reposition', axis).catch((err) => {
        debug.log(`centring the popup failed: ${err && (err.message || err)}`);
        return 0;
      });
      if (await center()) return;
      spawnNotificationReposition();
      for (let waited = 0; waited < CENTER_WAIT_MAX_MS; waited += CENTER_WAIT_STEP_MS) {
        await new Promise((resolve) => setTimeout(resolve, CENTER_WAIT_STEP_MS));
        if (await center()) return;
      }
    }
    $('#btn-overlay-center-x').click(() => centerNotificationReposition('x'));
    $('#btn-overlay-center-y').click(() => centerNotificationReposition('y'));
    $('#btn-overlay-progress-reposition').click(function () {
      // Selected first, so the witness already takes the progress scale.
      $('#option_overlayProgressPosition').val('custom').change();
      spawnNotificationReposition(null, null, '', 'progressNotif');
    });

    // Pick a custom folder for souvenir screenshots (empty = default Pictures\Achievement Watcher Next).
    $('#btn-souvenir-dir').click(async function () {
      try {
        const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'dontAddToRecent'] });
        if (res.canceled || !res.filePaths || !res.filePaths.length) return;
        if (!app.config.souvenir) app.config.souvenir = {};
        app.config.souvenir.dir = res.filePaths[0];
        $('#souvenir-dir-display').text(res.filePaths[0]);
        $('#btn-souvenir-dir').attr('title', res.filePaths[0]);
        autosaveNotifications();
      } catch (e) {
        debug.log(e);
      }
    });

    // Open the folder the screenshots are actually written to. It only exists once something has
    // been saved there, so create it first rather than have the click do nothing.
    $('#btn-souvenir-open').click(function () {
      try {
        const configured = app.config.souvenir && app.config.souvenir.dir ? app.config.souvenir.dir.trim() : '';
        const dir = configured || souvenirDefaultDir();
        settingsFs.mkdirSync(dir, { recursive: true });
        remote.shell.openPath(dir);
      } catch (e) {
        debug.log(e);
      }
    });

    // The clip folder works like the screenshot one, with Videos\Achievement Watcher Next as default.
    $('#btn-clip-dir').click(async function () {
      try {
        const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'dontAddToRecent'] });
        if (res.canceled || !res.filePaths || !res.filePaths.length) return;
        if (!app.config.souvenir) app.config.souvenir = {};
        app.config.souvenir.clipDir = res.filePaths[0];
        $('#clip-dir-display').text(res.filePaths[0]);
        $('#btn-clip-dir').attr('title', res.filePaths[0]);
        autosaveNotifications();
      } catch (e) {
        debug.log(e);
      }
    });

    $('#btn-clip-open').click(function () {
      try {
        const dir = clipProfile.normalize(app.config.souvenir || {}).clipDir || clipDefaultDir();
        settingsFs.mkdirSync(dir, { recursive: true });
        remote.shell.openPath(dir);
      } catch (e) {
        debug.log(e);
      }
    });

    // The preset choice lives with the other notification settings; the designer is a separate
    // workshop tab, so this row carries a button through to it rather than merging the two.
    $('#btn-open-presets').on('click', function () {
      $("#settingNav li[data-view='presets']").trigger('click');
    });

    /*
      The OBS browser source. The address is the Watchdog's own websocket listener, which serves the
      selected preset as a page at /obs - the port is fixed there (websocket.js), so it is written
      out rather than read back over IPC. The button copies it because that is the only thing anyone
      does with it: paste it into a Browser source in OBS.
    */
    // "Does it work at all" answered before OBS is involved: the same page, in the real browser,
    // asking the feed for a sample unlock every ten seconds.
    $('#btn-preview-obs-url').attr('href', `${OBS_SOURCE_URL}/?test=1`);
    $('#btn-copy-obs-url').on('click', function () {
      const button = $(this);
      const label = $('#lbl-obsSourceCopy');
      copyText(OBS_SOURCE_URL).then((written) => {
        // Say what happened: the clipboard can be held by another process, and a tick that appears
        // anyway teaches people to paste an address that was never copied.
        const done = String(label.attr('data-lang-copied') || '');
        if (written && done) label.text(done);
        button.toggleClass('primary', written === true);
        setTimeout(() => {
          label.text(String(label.attr('data-lang-copy') || label.text()));
          button.removeClass('primary');
        }, 2000);
      });
    });

    require(path.join(appPath, 'ui/presetDesigner.js')).createPresetDesigner({
      $,
      app,
      debug,
      t,
      ensureFrame,
      registerLocaleRefresh,
      resolveSoundFile,
      overlayTestData,
      previewSoundAtVolume,
      updatePresetTabVisibility,
    });

    $('#option_mergeDuplicate')
      .parent('.right')
      .find('.previous, .next')
      .click(function () {
        $('#option_importCache').val($('#option_mergeDuplicate').val());
      });
  });
})(window.jQuery, window, document);

function boolifyValue(v) {
  return v === 'true' ? true : v === 'false' ? false : v;
}

// Mirrors defaultDir() in watchdog/notification/souvenir.js (the Watchdog writes the file), so the
// two must agree or the UI would show a folder nothing is saved to.
function souvenirDefaultDir() {
  try {
    return path.join(remote.app.getPath('pictures'), 'Achievement Watcher Next');
  } catch (e) {
    return 'Pictures\\Achievement Watcher Next';
  }
}

// Mirrors defaultDir() in watchdog/notification/clip.js, for the same reason.
function clipDefaultDir() {
  try {
    return path.join(remote.app.getPath('videos'), 'Achievement Watcher Next');
  } catch (e) {
    return 'Videos\\Achievement Watcher Next';
  }
}

// Resolve a notification sound name to an absolute path. User-imported sounds (in <userData>/sounds)
// take priority over the bundled ones (app/sounds), matching the main process's resolveNotificationSound.
function resolveSoundFile(name) {
  if (!name) return '';
  try {
    const ud = ipcRenderer.sendSync('get-user-data-path-sync');
    const userPath = path.join(ud, 'sounds', name);
    if (settingsFs.existsSync(userPath)) return userPath;
  } catch (e) {}
  return path.join(appPath, 'sounds', name);
}

// Read every Notifications-tab control back into app.config. Mirrors the per-section logic of the
// OK-save handler but scoped to the notification view so it can run on every change (auto-save).
function readNotificationSettings() {
  $('#options-notify-common .right')
    .children('select')
    .each(function () {
      // persist under notification_toast (handled below)
      if (this.id === 'option_groupToast' || this.id === 'option_urgent') return;
      if (this.id !== '' && $(this).val() !== '') app.config.notification[this.id.replace('option_', '')] = boolifyValue($(this).val());
    });
  $('#options-notify-transport .right')
    .children('select')
    .each(function () {
      if (this.id !== '' && $(this).val() !== '') app.config.notification_transport[this.id.replace('option_', '')] = boolifyValue($(this).val());
    });
  // Group-by-game and urgent sit in the common group visually but persist under notification_toast.
  if ($('#option_groupToast').val() !== '') app.config.notification_toast.groupToast = boolifyValue($('#option_groupToast').val());
  if ($('#option_urgent').val() !== '') app.config.notification_toast.urgent = boolifyValue($('#option_urgent').val());

  // Overlay (in-game) notification - enable in notification_transport, look in overlay.notification*.
  app.config.notification_transport.mode = $('#option_notifMode').val() || 'auto';
  if (!app.config.overlay) app.config.overlay = {};
  app.config.overlay.notificationPreset = $('#option_overlayPreset').val() || 'AW Next';
  app.config.overlay.notificationPresetXenia = $('#option_overlayPresetXenia').val() || '';
  app.config.overlay.notificationPresetRpcs3 = $('#option_overlayPresetRpcs3').val() || '';
  app.config.overlay.notificationPresetShadps4 = $('#option_overlayPresetShadps4').val() || '';
  app.config.overlay.notificationPresetKytyps5 = $('#option_overlayPresetKytyps5').val() || '';
  app.config.overlay.notificationPosition = $('#option_overlayPosition').val() || 'center-bottom';
  app.config.overlay.notificationScale = parseFloat($('#option_overlayScale').val()) || 1;
  app.config.overlay.notificationOpacity = parseInt($('#option_overlayOpacity').val(), 10) || 100;
  app.config.overlay.notificationEdgeGap = notificationPlacement.normalizeEdgeGap($('#option_overlayEdgeGap').val());
  app.config.overlay.notificationProgressPosition = notificationPlacement.normalizeProgressPosition($('#option_overlayProgressPosition').val());
  app.config.overlay.notificationProgressScale = notificationPlacement.normalizeProgressScale($('#option_overlayProgressScale').val());
  // 'Random' lives in the sound list now, so one control writes both keys: the flag the
  // notification path reads, and the filename it falls back to when the flag is off.
  const chosenSound = $('#option_overlaySound').val() || '';
  app.config.overlay.randomSound = chosenSound === RANDOM_SOUND_VALUE;
  app.config.overlay.notificationSound = chosenSound === RANDOM_SOUND_VALUE ? '' : chosenSound;
  // An unfilled list (the sound folder could not be read) keeps the saved choice.
  for (const [id, key] of [
    ['#option_overlaySoundRare', 'notificationSoundRare'],
    ['#option_overlaySoundPlatinum', 'notificationSoundPlatinum'],
    ['#option_overlaySoundProgress', 'notificationSoundProgress'],
    ...Object.entries(EMULATOR_SOUND_SELECTS),
  ]) {
    if ($(id).find('option').length > 0) app.config.overlay[key] = String($(id).val() || '');
  }
  const volRaw = parseInt($('#option_overlayVolume').val(), 10);
  app.config.overlay.notificationVolume = Number.isFinite(volRaw) ? volRaw : 100;
  const durRaw = $('#option_overlayDuration').val();
  app.config.overlay.notificationDuration = durRaw === 'auto' || !durRaw ? 'auto' : parseInt(durRaw, 10) || 'auto';

  // Souvenir screenshot - dir is set by its own folder-picker button and preserved here.
  if (!app.config.souvenir) app.config.souvenir = {};
  app.config.souvenir.screenshot = $('#option_souvenirScreenshot').val() === 'true';
  app.config.souvenir.hdr = $('#option_souvenirHdr').val() === 'off' ? 'off' : 'auto';
  Object.assign(app.config.souvenir, readClipSettings());
}

function readClipSettings() {
  return clipProfile.normalize({
    clip: $('#option_clip').val(),
    clipSeconds: $('#option_clipSeconds').val(),
    clipCodec: $('#option_clipCodec').val(),
    clipResolution: $('#option_clipResolution').val(),
    clipFps: $('#option_clipFps').val(),
    clipQuality: $('#option_clipQuality').val(),
    clipAudio: $('#option_clipAudio').val(),
    // Linux only; elsewhere the row is gone and the setting keeps its saved value.
    clipEngine: $('#option_clipEngine').length ? $('#option_clipEngine').val() : app.config.souvenir && app.config.souvenir.clipEngine,
    // Set by the folder picker, not by a control.
    clipDir: (app.config.souvenir && app.config.souvenir.clipDir) || '',
  });
}

// The card follows its controls: only the switch while clips are off, and the length readout and
// size estimate while they move. Sizes are for this screen, never recorded above.
function updateClipReadouts() {
  const clip = readClipSettings();
  $('#options-notify-clip').toggleClass('clip-off', !clip.clip);
  // Each Linux recorder ignores one control (see app.css); gpu-screen-recorder records the whole screen.
  const linuxEngine = process.platform === 'linux' ? clip.clipEngine : null;
  $('#options-notify-clip').attr('data-clip-engine', linuxEngine);
  const recorded = linuxEngine === 'gpu' ? { ...clip, clipResolution: 'native' } : clip;
  $('#clipSeconds-value').text(localeText('settings.notification.option.clipSecondsValue', { seconds: clip.clipSeconds }) || `${clip.clipSeconds} s`);
  const ratio = window.devicePixelRatio || 1;
  const screen = { width: Math.round(window.screen.width * ratio), height: Math.round(window.screen.height * ratio) };
  const native = localeText('settings.notification.option.clipResolutionNative');
  if (native) $("#option_clipResolution option[value='native']").text(`${native} (${screen.height}p)`);
  const size = Math.max(1, Math.round(clipProfile.estimateMegabytes(recorded, screen)));
  $('#clip-estimate').text(localeText('settings.notification.option.clipEstimateValue', { size }) || `${size} MB`);
}

// Linux: whether gpu-screen-recorder is installed, and what the software recorder cost last time.
async function showClipEngineStatus() {
  const status = await ipcRenderer.invoke('souvenir:linux-status').catch(() => null);
  if (!status) return;
  const parts = [localeText(status.gsr ? 'settings.notification.option.clipEngineGpuFound' : 'settings.notification.option.clipEngineGpuMissing')];
  if (status.softwareCost && Number.isFinite(status.softwareCost.cpuPercent)) {
    parts.push(localeText('settings.notification.option.clipEngineCost', { cpu: status.softwareCost.cpuPercent }));
  }
  $('#clip-engine-status').text(parts.filter(Boolean).join(' '));
}

// Debounced auto-save for the Notifications tab. No-op until the form has finished populating.
function autosaveNotifications() {
  if (!settingsReady) return;
  try {
    readNotificationSettings();
  } catch (e) {
    debug.log(e);
    return;
  }
  clearTimeout(notifAutosaveTimer);
  notifAutosaveTimer = setTimeout(() => {
    settings.setUserDataPath(ipcRenderer.sendSync('get-user-data-path-sync'));
    settings
      .save(app.config)
      .then(() => {
        if (typeof window.flashSettingsSaved === 'function') window.flashSettingsSaved();
      })
      .catch((err) => debug.log(err));
  }, 200);
}

function populateUserDirList(option) {
  let dir = option.dir || option.path || '';
  if (!dir) return;

  let options = {
    dir,
    notify: true,
    reverse: option.reverse || false,
    origin: option.origin === 'auto' ? 'auto' : 'manual',
    detector: option.detector || '',
    enabled: option.enabled !== false,
  };

  let alreadyInList = false;
  $('#settings #dirlist > li').each(function () {
    let dir = $(this).find('.path span').text();
    if (path.normalize(dir) == path.normalize(options.dir)) {
      alreadyInList = true;
      return false; //break out of each() loop
    }
  });

  if (alreadyInList) {
    debug.log('-> Already in list');
    return;
  }

  let template = `<li>
                <div class="path" title="${escapeHtml(options.dir)}"><span>${escapeHtml(options.dir)}</span></div>
                <div class="controls">
                  <ul>
                    <li class="edit"><i class="fas fa-pen"></i></li>
                    <li class="trash"><i class="fas fa-trash-alt"></i></li>
                  </ul>
                </div>
              </li>`;

  if (options.reverse) {
    $('#settings #dirlist').append(template);
  } else {
    $('#settings #dirlist').prepend(template);
  }

  let elem = options.reverse ? $('#settings #dirlist > li').last() : $('#settings #dirlist > li').first();
  applyFolderRowMetadata(elem, options);

  $(document).trigger('folder-rescan-locations-changed');

  if (elem.find('.path span').width() >= 350 || options.dir.length > 42) {
    elem.find('.path').addClass('overflow');
  }

  elem.find('.controls .trash').click(function () {
    elem.remove();
    $(document).trigger('folder-rescan-locations-changed');
  });
  elem.find('.controls .edit').click(async function () {
    let path = elem.find('.path span').text();

    let filePaths = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      defaultPath: path,
      properties: ['openDirectory', 'showHiddenFiles'],
    });
    try {
      if (filePaths) {
        debug.log(`Editing folder to: ${filePaths}`);

        const diagnosis = await userDir.diagnose(filePaths[0]);
        if (diagnosis.accepted) {
          const accepted = diagnosis.canonicalPath || filePaths[0];
          elem.find('.path').attr('title', accepted);
          elem.find('.path span').text(accepted);
          elem.find('.path').removeClass('overflow');
          if (elem.find('.path span').width() >= 350) {
            elem.find('.path').addClass('overflow');
          }
          $(document).trigger('folder-rescan-locations-changed');
          debug.log('-> Edited');
        } else {
          debug.log(`-> Invalid folder (${diagnosis.code})`);
          remote.dialog.showMessageBoxSync({
            type: 'warning',
            title: t('invalid-folder', 'Invalid folder', 'Dossier invalide'),
            message: describeFolderDiagnosis(diagnosis, t),
            // The old selector matched nothing, so every rejection threw inside .replace instead.
            detail: String($('#folder-add-info').text() || '').replace(/\s{2,}/g, ' ').trim(),
          });
        }
      } else {
        debug.log('Editing folder: User Cancel');
      }
    } catch (err) {
      remote.dialog.showMessageBoxSync({
        type: 'error',
        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
        message: t('error-editing-custom-folder', 'Error editing custom folder', 'Erreur lors de la modification du dossier personnalisé'),
        detail: `${err}`,
      });
    }
  });
}

function populateLibraryDirList(option) {
  let dir = option.dir || option.path || '';
  if (!dir) return;

  let options = {
    dir,
    reverse: option.reverse || false,
    origin: option.origin === 'auto' ? 'auto' : 'manual',
    detector: option.detector || '',
    enabled: option.enabled !== false,
  };

  let alreadyInList = false;
  $('#settings #libdirlist > li').each(function () {
    let dir = $(this).find('.path span').text();
    if (path.normalize(dir) == path.normalize(options.dir)) {
      alreadyInList = true;
      return false; //break out of each() loop
    }
  });

  if (alreadyInList) {
    debug.log('-> Already in list');
    return;
  }

  let template = `<li>
                <div class="path" title="${escapeHtml(options.dir)}"><span>${escapeHtml(options.dir)}</span></div>
                <div class="controls">
                  <ul>
                    <li class="edit"><i class="fas fa-pen"></i></li>
                    <li class="trash"><i class="fas fa-trash-alt"></i></li>
                  </ul>
                </div>
              </li>`;

  if (options.reverse) {
    $('#settings #libdirlist').append(template);
  } else {
    $('#settings #libdirlist').prepend(template);
  }

  let elem = options.reverse ? $('#settings #libdirlist > li').last() : $('#settings #libdirlist > li').first();
  applyFolderRowMetadata(elem, options);

  $(document).trigger('folder-rescan-locations-changed');

  if (elem.find('.path span').width() >= 350 || options.dir.length > 42) {
    elem.find('.path').addClass('overflow');
  }

  elem.find('.controls .trash').click(function () {
    elem.remove();
    $(document).trigger('folder-rescan-locations-changed');
  });
  elem.find('.controls .edit').click(function () {
    let dirPath = elem.find('.path span').text();

    let filePaths = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      defaultPath: dirPath,
      properties: ['openDirectory', 'showHiddenFiles'],
    });
    try {
      if (filePaths) {
        debug.log(`Editing library folder to: ${filePaths}`);
        elem.find('.path').attr('title', filePaths[0]);
        elem.find('.path span').text(filePaths[0]);
        elem.find('.path').removeClass('overflow');
        if (elem.find('.path span').width() >= 350) {
          elem.find('.path').addClass('overflow');
        }
        $(document).trigger('folder-rescan-locations-changed');
        debug.log('-> Edited');
      } else {
        debug.log('Editing library folder: User Cancel');
      }
    } catch (err) {
      remote.dialog.showMessageBoxSync({
        type: 'error',
        title: t('unexpected-error', 'Unexpected Error', 'Erreur inattendue'),
        message: t('error-editing-library-folder', 'Error editing library folder', 'Erreur lors de la modification du dossier de bibliothèque'),
        detail: `${err}`,
      });
    }
  });
}

// The Windows folders listed under "Folders checked automatically", expanded. Linux reads them in
// every prefix instead, so there is no single path to compare against there.
let defaultWatchedFolders = null;
function isDefaultWatchedFolder(dir) {
  if (process.platform !== 'win32' || !dir) return false;
  if (!defaultWatchedFolders) {
    defaultWatchedFolders = new Set();
    $('#defaultdir > li:not([data-linux-only]) .path').each(function () {
      const expanded = $(this)
        .text()
        .trim()
        .replace(/%([^%]+)%/g, (whole, name) => process.env[name] || whole);
      if (!expanded.includes('%') && !expanded.includes('*')) defaultWatchedFolders.add(path.normalize(expanded).toLowerCase());
    });
  }
  return defaultWatchedFolders.has(path.normalize(String(dir)).replace(/[\\/]+$/, '').toLowerCase());
}

function applyFolderRowMetadata(elem, options) {
  elem
    .attr('data-origin', options.origin)
    .attr('data-detector', options.detector || '')
    .attr('data-enabled', String(options.enabled !== false))
    .toggleClass('source-disabled', options.enabled === false);
  const detectedLabel = $('#smartFind-label').text() || 'Smart Find';
  const manualLabel = t('manual-source', 'Manual', 'Manuel');
  const automatic = options.origin === 'auto';
  const origin = $('<small>')
    .addClass(`folder-origin ${automatic ? 'auto' : 'manual'}`)
    .attr('title', automatic ? detectedLabel : manualLabel)
    .attr('role', 'img')
    .attr('aria-label', automatic ? detectedLabel : manualLabel)
    .append($('<i>').addClass(`fas ${automatic ? 'fa-magic' : 'fa-hand-pointer'}`).attr('aria-hidden', 'true'));
  elem
    .find('.path')
    .append(origin);
  // Smart Find adds folders AW Next already watches on its own; say so rather than hide the row,
  // since OK saves exactly the rows on screen.
  if (isDefaultWatchedFolder(options.dir)) {
    elem
      .find('.path')
      .append($('<small>').addClass('folder-also-watched').text(t('folder-also-watched', 'Also watched automatically', 'Aussi surveillé automatiquement')));
  }
  const toggle = $('<li>')
    .addClass('source-toggle')
    .append($('<i>').addClass(`fas ${options.enabled === false ? 'fa-toggle-off' : 'fa-toggle-on'}`));
  elem.find('.controls ul').prepend(toggle);
  toggle.on('click', function () {
    const enabled = elem.attr('data-enabled') !== 'true';
    elem.attr('data-enabled', String(enabled)).toggleClass('source-disabled', !enabled);
    $(this).find('i').toggleClass('fa-toggle-on', enabled).toggleClass('fa-toggle-off', !enabled);
    $(document).trigger('folder-rescan-locations-changed');
  });
}

function folderEntryFromRow(row) {
  const elem = $(row);
  return {
    path: elem.find('.path > span').first().text(),
    notify: true,
    origin: elem.attr('data-origin') === 'auto' ? 'auto' : 'manual',
    detector: elem.attr('data-detector') || '',
    enabled: elem.attr('data-enabled') !== 'false',
  };
}

// Every Steam library folder on this PC, plus each hidden one Steam no longer lists (a drive removed
// from Steam), so that none can be dropped by reading the rows back on save.
function steamLibraryFolders(hidden) {
  const steamLibrary = require(path.join(appPath, 'parser/steamLibrary.js'));
  let roots = [];
  try {
    roots = steamLibrary.libraryRoots(steamLibrary.steamClientDir());
  } catch (err) {
    debug.log(`[steam] library folders unreadable => ${err}`);
  }
  for (const dir of hidden) {
    // Each folder inside the other: the same folder, whatever its case or trailing separator.
    if (!roots.some((root) => steamLibrary.isInsideAnyFolder(root, [dir]) && steamLibrary.isInsideAnyFolder(dir, [root]))) roots.push(dir);
  }
  return roots.map((dir) => ({ dir, shown: !steamLibrary.isInsideAnyFolder(dir, hidden) }));
}

function steamLibraryRow({ dir, shown }) {
  const common = (window.appLocale && window.appLocale.settings && window.appLocale.settings.common) || {};
  const arrow = (side, icon) => $('<div>').addClass(side).append($('<span class="arrow">').append($('<i>').addClass(`fas ${icon}`)));
  const select = $('<select autocomplete="off">')
    .append($('<option value="true">').text(common.enable || 'Enabled'))
    .append($('<option value="false">').text(common.disable || 'Disabled'))
    .val(shown ? 'true' : 'false');
  const step = () => {
    select.val(select.val() === 'true' ? 'false' : 'true');
    select[0].dispatchEvent(new Event('change', { bubbles: true }));
  };
  return $('<li>')
    .attr('data-dir', dir)
    .append($('<div class="left">').append($('<i class="fas fa-folder"></i>'), ' ', $('<span>').text(dir)))
    .append($('<div class="right">').append(arrow('previous', 'fa-chevron-left').on('click', step), select, arrow('next', 'fa-chevron-right').on('click', step)));
}

function populateSteamLibraries(hidden) {
  const list = $('#steam-libraries-list').empty();
  const folders = steamLibraryFolders(Array.isArray(hidden) ? hidden : []);
  folders.forEach((folder) => list.append(steamLibraryRow(folder)));
  // A single library has nothing to choose between unless it is the one that was hidden.
  list.attr('data-useful', String(folders.length > 1 || folders.some((folder) => !folder.shown)));
  list.attr('data-rendered', 'true');
  toggleSteamLibrariesCard();
}

function toggleSteamLibrariesCard() {
  const useful = $('#steam-libraries-list').attr('data-useful') === 'true';
  $('#steam-libraries-card').toggle(useful && $('#option_legitSteam').val() !== '0');
}

// The folders switched off, or null when the rows were never drawn (the saved list then stands).
function readHiddenSteamLibraries() {
  const list = $('#steam-libraries-list');
  if (list.attr('data-rendered') !== 'true') return null;
  return list
    .children('li')
    .filter((_, row) => $(row).find('select').val() === 'false')
    .map((_, row) => $(row).attr('data-dir'))
    .get();
}

function populateLegitUsers(selected) {
  let list = ipcRenderer.sendSync('get-steam-user-list');
  let selector = $('#option_mainSteam');
  let defaultOption = selector.find('option[value="0"]');
  defaultOption.prop('selected', selected === '0');
  selector.empty();
  selector.append(defaultOption);
  if (!list || list.length === 0) {
    // Fetched over the network; offline it comes back empty. Keep the saved account selectable
    // so a save while offline doesn't overwrite it with "0".
    if (selected && selected !== '0') {
      selector.append($('<option>').attr('value', selected).prop('selected', true).text(selected));
      defaultOption.prop('selected', false);
    }
    return;
  }
  for (let user of list)
    selector.append(
      $('<option>')
        .attr('value', user.user)
        .prop('selected', selected === user.user)
        .text(user.name)
    );
}
