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
const scanScopeTools = require(path.join(appPath, 'parser/scanScope.js'));
const emulatorFixEligibility = require(path.join(appPath, 'util/emulatorFixEligibility.js'));
const { t } = require(path.join(appPath, 'locale/t.js'));
const { renamedSound } = require(path.join(appPath, 'util/notificationSounds.js'));
const interfaceMode = require(path.join(appPath, 'util/interfaceMode.js'));
const { legacyPresetAlias } = require(path.join(appPath, 'util/notificationPreset.js'));
const { describeFolderDiagnosis } = require(path.join(appPath, 'util/folderDiagnosis.js'));

// Sentinel for "Random"; has no extension so it can never collide with a real filename (SOUND_RE in presetSchema.js).
const RANDOM_SOUND_VALUE = '__random__';
// The global dropdown uses '' for silence, but a per-game blank means "inherit". This distinct
// value lets one game explicitly mute its popup while every other game keeps the global sound.
const NO_SOUND_VALUE = '__none__';

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

// A niche source folds away only while off and contributing no games; reads saved config, not the
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

// Eighteen built-ins is too many to choose from cold, so the picker opens on a short contrasting
// set and keeps the rest behind "More themes…", appended to the same <select> on expand.
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
// One sentinel toggles the list both ways; only its label changes.
const MORE_THEMES_VALUE = '__more-themes__';
let themeListExpanded = false;
// Last theme the user actually selected, so toggling the list can restore a preview that has not
// been saved yet instead of snapping back to the persisted value.
let themeSelection = null;

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
  sel.empty();
  for (const [value, label] of PRIMARY_THEMES) sel.append(themeOption(value, label));
  if (themeListExpanded) {
    for (const [value, label] of MORE_THEMES) sel.append(themeOption(value, label));
  } else {
    // Collapsing must never hide the theme that is actually applied, so a selection from the long
    // list stays on show as an eighth row while the other extras fold away.
    const active = MORE_THEMES.find(([value]) => value === wanted);
    if (active) sel.append(themeOption(active[0], active[1]));
  }
  // The toggle sits after whatever it controls, so it reads as "…and more" / "…show fewer".
  sel.append(
    $('<option>')
      .attr('value', MORE_THEMES_VALUE)
      .text(themeListExpanded ? t('themeFewer', 'Fewer themes…', 'Moins de thèmes…') : t('themeMore', 'More themes…', 'Plus de thèmes…'))
  );
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
      $('#option_steamlessExperimental').closest('li').toggleClass('is-inactive', !steamless).attr('aria-disabled', String(!steamless));
      $('#emulator-login').toggleClass('is-visible', steamLogin).attr('aria-hidden', String(!steamLogin));

      $('#options-emulator2 select').each(function () {
        $(this).closest('li').toggleClass('is-on', $(this).val() === 'true').toggleClass('is-off', $(this).val() === 'false');
      });
    }

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

    $('title-bar').on('open-settings', function () {
      this.inSettings = true;
      settingsReady = false; // suppress auto-save while we populate the form below
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
      settingsModal.removeClass('is-opening').show();
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

      for (let option in app.config.achievement) {
        if ($(`#option_${option} option[value="${app.config.achievement[option]}"]`).length > 0) {
          $(`#option_${option}`).val(app.config.achievement[option].toString()).change();
        }
      }
      if (!app.config.general) app.config.general = {};
      $('#option_startWithWindows').val(String(app.config.general.startWithWindows !== false)).change();
      $('#option_disableHardwareAccel').val(String(app.config.general.disableHardwareAccel === true)).change();
      $('#option_closeToTray').val(String(app.config.general.closeToTray !== false)).change();
      $('#option_uninstallContextMenu').val(String(app.config.general.uninstallContextMenu !== false)).change();
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
      }
      updateEmulatorUi();

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
      $('#option_overlayVolume').val(String(cfgOverlay.notificationVolume != null ? cfgOverlay.notificationVolume : 100)).change();
      $('#option_overlayDuration').val(String(cfgOverlay.notificationDuration || 'auto')).change();
      const cfgSouvenir = app.config.souvenir || {};
      $('#option_souvenirScreenshot').val(String(cfgSouvenir.screenshot === true)).change();
      $('#option_souvenirHdr').val(cfgSouvenir.hdr === 'off' ? 'off' : 'auto').change();
      const souvenirDir = cfgSouvenir.dir && cfgSouvenir.dir.trim() ? cfgSouvenir.dir : souvenirDefaultDir();
      $('#souvenir-dir-display').text(souvenirDir);
      $('#btn-souvenir-dir').attr('title', souvenirDir);
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
          fillSoundDropdown(sounds, cfgOverlay.randomSound === true ? RANDOM_SOUND_VALUE : shown);
          refreshUserSounds();
        })
        .catch(() => {});

      populateLegitUsers(app.config.steam.main || '0');

      $('#settings #dirlist').empty();
      (userDir.getEntries ? userDir.getEntries() : userDir.get())
        .then(async (userDirList) => {
          for (let dir of userDirList) {
            try {
              if (await userDir.check(dir.path)) populateUserDirList({ ...dir, dir: dir.path, reverse: true });
            } catch (err) {
              debug.log(err);
            }
          }
        })
        .catch((err) => {
          debug.log(err);
        });

      $('#settings #libdirlist').empty();
      (libraryDirs.getEntries ? libraryDirs.getEntries() : libraryDirs.get())
        .then((libraryDirList) => {
          for (const entry of libraryDirList) {
            const dir = typeof entry === 'string' ? entry : entry.path;
            populateLibraryDirList({ ...(typeof entry === 'object' ? entry : {}), dir, reverse: true });
          }
        })
        .catch((err) => {
          debug.log(err);
        });

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
        const summary = await ipcRenderer.invoke('export-logs');
        if (summary && summary.ok) {
          // Sticky: the destination path is the whole point of the message, and it is longer than
          // anyone can read inside the usual 4.5s fade.
          setTransientStatus(
            result,
            t('export-logs-done', '{count} log file(s) written to {path}', '{count} fichier(s) de journal écrits dans {path}', {
              count: summary.count,
              path: summary.path,
            }),
            { sticky: true }
          );
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
    async function runUpdateCheck(btn, label) {
      if (btn.hasClass('busy')) return;
      btn.addClass('busy');
      const previousText = label.text();
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
          label.removeClass('update-info').addClass('update-ok').text(previousText || t('update-checked', 'Check done', 'Vérifié'));
        }
      } catch (err) {
        debug.log(err);
        label.removeClass('update-info').addClass('update-error').text(t('update-check-failed', 'Check failed', 'Échec de la vérification'));
      } finally {
        btn.removeClass('busy');
        setTimeout(() => {
          label.removeClass('update-ok update-error update-info').text('');
          if (previousText) label.text(previousText);
        }, 4500);
      }
    }
    $('#check-for-updates').click(function () {
      runUpdateCheck($(this), $('#check-for-updates-label'));
    });
    $('#footer-check-updates').click(function () {
      runUpdateCheck($(this), $('#footer-update-status'));
    });
    // Both status labels track the shared updater state live (not a raw percentage), so they also
    // report the install step. Settings' copy of renderUpdateStatus in app.js (title bar).
    function renderSettingsUpdateStatus(state) {
      const labels = $('#check-for-updates-label, #footer-update-status');
      if (!state) return;
      if (state.phase === 'downloading') {
        labels
          .removeClass('update-ok update-error')
          .addClass('update-info')
          .text(t('downloading-update', 'downloading update {percent}%', 'téléchargement de la mise à jour {percent} %', { percent: Math.round(state.percent) }));
      } else if (state.phase === 'installing') {
        labels
          .removeClass('update-ok update-error')
          .addClass('update-info')
          .text(t('update-installing-short', 'Installing update…', 'Installation de la mise à jour…'));
      } else if (state.phase === 'ready' || state.phase === 'held') {
        labels.removeClass('update-info update-error').addClass('update-ok').text(t('update-ready', 'Update Ready', 'Mise à jour prête'));
      }
    }
    ipcRenderer.on('update-status', (event, state) => renderSettingsUpdateStatus(state));
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

    $('#btn-settings-cancel, #settings .overlay').click(function () {
      let self = $(this);
      self.css('pointer-events', 'none');
      $('#settings .box').fadeOut(() => {
        $('#settings').hide();
        let elem = $('#settingNav li[data-view]').first();
        $('#settingNav li[data-view]').removeClass('active');
        elem.addClass('active');
        $('#settings .box section.content').removeClass('active');
        $("#settings .box section.content[data-view='" + elem.data('view') + "']").addClass('active');
        self.css('pointer-events', 'initial');
        $('title-bar')[0].inSettings = false;
        // Cancel reverts an unsaved theme preview back to the persisted choice.
        applyThemeValue((app.config.general && app.config.general.theme) || 'default');
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

      app.config.overlay.hotkey = $('#hotkey').text();
      $('#options-ui .right')
        .children('select')
        .each(function (index) {
          try {
            // These General-tab selects persist under `general`, not `achievement` - handled explicitly below.
            if (
              $(this)[0].id === 'option_startWithWindows' ||
              $(this)[0].id === 'option_disableHardwareAccel' ||
              $(this)[0].id === 'option_closeToTray' ||
              $(this)[0].id === 'option_uninstallContextMenu' ||
              $(this)[0].id === 'option_theme'
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
      app.config.achievement.thumbnailPortrait = app.config.achievement.libraryLayout === 'portrait';
      if (!app.config.general) app.config.general = {};
      app.config.general.disableHardwareAccel = $('#option_disableHardwareAccel').val() === 'true';
      app.config.general.closeToTray = $('#option_closeToTray').val() !== 'false';
      app.config.general.uninstallContextMenu = $('#option_uninstallContextMenu').val() !== 'false';
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

      $('#options-source .right')
        .children('select')
        .each(function (index) {
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
      }

      $('#options-notify-common .right')
        .children('select')
        .each(function (index) {
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
        .each(function (index) {
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
          $('#settings .box').fadeOut(() => {
            self.css('pointer-events', 'initial');
            resetUI();
          });
        })
        .catch((err) => {
          $('#settings .box').fadeOut(() => {
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

    // Epic account connect: shows unlock state for installed Epic games (epic-official source).
    // The login window and encrypted token storage live in the main process (init.js epic:* IPC).
    (function wireEpicConnect() {
      const T = () =>
        ({
          connectedAs: (n) => t('epic-connected-as', 'Connected{suffix}', 'Connecté{suffix}', { suffix: n ? ': ' + n : '' }),
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
      });

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('epic:auth-status')) || {};
        } catch {}
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
        connectedAs: (n) => t('steam-connected-as', 'Connected{suffix}', 'Connecté{suffix}', { suffix: n ? ': ' + n : '' }),
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
        // With no account connected nothing can be a ghost entry, so the row would promise nothing.
        $('#steam-stale-card').toggle(!!s.connected);
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

      refresh();
    })();

    // Xbox PC account card (Settings > Sources): connect Microsoft/Xbox Network, then import the
    // library. Import progress arrives as `xbox-pc:import-progress` IPC events.
    (function () {
      const T = () =>
        ({
          connectedAs: (n) => t('xbox-connected-as', 'Connected{suffix}', 'Connecté{suffix}', { suffix: n ? ': ' + n : '' }),
          notConnected: t('xbox-not-connected', 'Not connected', 'Non connecté'),
          connecting: t('xbox-connecting', 'Opening the Microsoft sign-in window…', 'Ouverture de la fenêtre de connexion Microsoft…'),
          connected: t('xbox-connected', 'Xbox account connected.', 'Compte Xbox connecté.'),
          cancelled: t('xbox-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
          failed: t('xbox-failed', 'Xbox sign-in failed', 'Échec de la connexion Xbox'),
          disconnected: t('xbox-disconnected', 'Xbox account disconnected.', 'Compte Xbox déconnecté.'),
          importing: t('xbox-importing', 'Importing the Xbox PC library…', 'Importation de la bibliothèque Xbox…'),
          imported: (r) =>
            t('xbox-imported', 'Import complete: {created} created, {updated} updated, {failed} failed.', 'Importation terminée : {created} créé(s), {updated} mis à jour, {failed} échec(s).', {
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
      });

      async function refresh() {
        let s = {};
        try {
          s = (await ipcRenderer.invoke('xbox-pc:status')) || {};
        } catch {}
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

    // Bind on the controls themselves as well as using a bubbling event above. This keeps the
    // dependency UI reliable for keyboard changes, programmatic population and the arrow buttons.
    $('#options-emulator select, #options-emulator2 select').on('change', updateEmulatorUi);
    $('#option_autoApplyNewGames, #option_autoApplyNewGamesUplay').on('change', function () {
      const value = $(this).val();
      $('#option_autoApplyNewGames, #option_autoApplyNewGamesUplay').not(this).val(value);
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
      container.empty();
      for (const meta of CUSTOM_LAYER_META) {
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
        const preview = $('<div>').addClass('theme-layer-preview').attr('style', previewStyle);
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
        // The picker only understands #rrggbb: feeding it the stored #rrggbbaa makes Chromium reject
        // the value and fall back to black, which is how a translucent layer would lose its colour.
        controls.append(
          $('<input>').attr('type', 'color').addClass('theme-layer-color').val(themeLayers.colorWithoutAlpha(layer.color || DEFAULT_THEME_COLOR))
        );
        const alphaGroup = $('<label>')
          .addClass('theme-layer-alpha-group')
          .attr('title', t('theme-layer-opacity', 'Opacity', 'Opacité'));
        alphaGroup.append(
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
          // An image replaces the color visually, so the picker hides; an enabled gradient just
          // disables it in place, to avoid shifting the row controls.
          row.find('.theme-layer-color').toggle(!hasImage).prop('disabled', grad.enabled === true);
          row.find('.theme-layer-alpha-group').toggle(!hasImage);
          row.find('.theme-layer-alpha').prop('disabled', grad.enabled === true);
          // A gradient never applies while an image is set (it would paint over it), so its toggle
          // hides with the color picker; the stored gradient itself is left alone.
          row.find('.theme-layer-gradient-toggle').toggle(!hasImage);
          if (hasImage) row.find('.theme-layer-gradient-panel').removeClass('open');
          row.find('.theme-layer-image').show();
          row.find('.theme-layer-filename, .theme-layer-clear-image, .theme-layer-fit').toggle(hasImage);
        }
        container.append(row);
      }
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
          // Save with the name untouched updates this theme; changing it first creates a new one.
          $('#theme-customizer-name').val(model.name || selectedThemeLabel());
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
      const shown = value !== MORE_THEMES_VALUE && userThemes.parseValue(value) === null;
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
      if (value === 'custom' && !refreshCustomThemeNameState()) {
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
      $('#theme-preview').show().attr('aria-hidden', 'false');
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
      // The toggle row is a command, not a theme: it folds the built-ins in or out, restores the
      // interrupted selection, and reopens the dropdown synchronously on the same click.
      if (value === MORE_THEMES_VALUE) {
        const previous = themeSelection || (app.config.general && app.config.general.theme) || 'default';
        themeListExpanded = !themeListExpanded;
        populateThemeSelect(previous);
        $(this).val(previous);
        try {
          this.showPicker();
        } catch {
          /* showPicker needs a user gesture and is not in every runtime: the list is rebuilt either
             way, so the user just reopens the dropdown themselves */
        }
        return;
      }
      themeSelection = value;
      applyThemeValue(value);
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
    });

    $('#settings').on('change.helpPreview', 'select', refreshHelpPreview);

    // Cards fold under their header; collapse state is per section and persisted. Nothing is moved
    // or removed, since the i18n loader binds labels positionally.
    const sectionRules = require(path.join(appPath, 'util/settingsSections.js'));
    const SECTION_STATE_KEY = 'settingsCollapsedSections';

    function readCollapsedSections() {
      try {
        const stored = JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || 'null');
        if (Array.isArray(stored)) return new Set(stored);
      } catch (err) {
        debug.log(`settings sections: unreadable stored state (${err})`);
      }
      return new Set(sectionRules.DEFAULT_COLLAPSED);
    }

    function writeCollapsedSections(keys) {
      try {
        localStorage.setItem(SECTION_STATE_KEY, JSON.stringify([...keys]));
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
    }

    function applySettingsSearch(rawQuery) {
      if (searchRules.parseTerms(rawQuery).length === 0) {
        clearSettingsSearch();
        return;
      }

      $('#settings').addClass('searching');
      const { total, perView } = searchRules.filterSections($, rawQuery);

      for (const [view, count] of Object.entries(perView)) {
        const navItem = $(`#settingNav li[data-view='${view}']`);
        navItem.find('.nav-count').text(count);
        navItem.toggleClass('no-match', count === 0);
      }

      $('#settings').toggleClass('no-search-result', total === 0);

      // Land the user on results rather than on an empty tab, but never yank them off a tab that
      // still has matches - that would fight their own typing.
      if (total > 0 && $('#settingNav li.active').hasClass('no-match')) {
        $('#settingNav li[data-view]:not(.no-match)').first().trigger('click');
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
      if (e.key === 'Escape') {
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

    $('#addCustomDir').click(async function () {
      let self = $(this);
      self.css('pointer-events', 'none');

      try {
        let dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'showHiddenFiles'] });

        if (dialog.filePaths.length > 0) {
          debug.log(`Adding folder: ${dialog.filePaths}`);

          const diagnosis = await userDir.diagnose(dialog.filePaths[0]);
          if (diagnosis.accepted) {
            populateUserDirList({ dir: dialog.filePaths[0], origin: 'manual' });
            reportFolderScan(dialog.filePaths[0]);
          } else {
            // Say why, not just no: a rejected folder and a folder AW never looked at used to be
            // indistinguishable to the user.
            debug.log(`-> Invalid folder (${diagnosis.code}): ${JSON.stringify(diagnosis.evidence)}`);
            remote.dialog.showMessageBoxSync({
              type: 'warning',
              title: t('invalid-folder', 'Invalid folder', 'Dossier invalide'),
              message: describeFolderDiagnosis(diagnosis, t),
              detail: $("#settings .content[data-view='folder'] > .controls .info p")
                .html()
                .replace(/\s{2,}/g, '')
                .replace(/<br>/g, '\n'),
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

    // Rescans only the user-selected locations; the scope is ephemeral to the parser call, so
    // folder preferences and tiles outside the scope stay untouched.
    let folderRescanBusy = false;
    const folderRescanKey = scanScopeTools.directoryKey;
    function getFolderRescanLocations() {
      const locations = new Map();
      const add = (value, kind) => {
        const dir = String(value || '').trim();
        const key = folderRescanKey(dir);
        if (!key) return;
        const record = locations.get(key) || { path: dir, user: false, library: false };
        record[kind] = true;
        locations.set(key, record);
      };
      $('#settings #dirlist > li').each(function () {
        if ($(this).attr('data-enabled') !== 'false') add($(this).find('.path > span').first().text(), 'user');
      });
      $('#settings #libdirlist > li').each(function () {
        if ($(this).attr('data-enabled') !== 'false') add($(this).find('.path > span').first().text(), 'library');
      });
      return [...locations.values()];
    }
    function updateFolderRescanControls() {
      const inputs = $('#folder-rescan-list input[type="checkbox"]');
      const hasSelection = inputs.filter(':checked').length > 0;
      $('#folder-rescan-select-all').prop('disabled', folderRescanBusy || inputs.length === 0);
      $('#folder-rescan-select-none').prop('disabled', folderRescanBusy || inputs.length === 0);
      $('#folder-rescan-run').prop('disabled', folderRescanBusy || !hasSelection);
    }
    function renderFolderRescanLocations() {
      const list = $('#folder-rescan-list');
      const selected = new Set(
        list
          .find('input[type="checkbox"]:checked')
          .map(function () {
            return String($(this).attr('data-folder-key') || '');
          })
          .get()
      );
      const keepSelection = list.children().length > 0;
      const locations = getFolderRescanLocations();
      list.empty();
      if (locations.length === 0) {
        $('#folder-rescan-result').text(t('rescan-no-folders', 'Add a folder before rescanning.', 'Ajoute un dossier avant de relancer une analyse.'));
        updateFolderRescanControls();
        return;
      }
      for (const location of locations) {
        const key = folderRescanKey(location.path);
        const icon = location.user && location.library ? 'fa-layer-group' : location.library ? 'fa-folder-open' : 'fa-save';
        const row = $('<li>').addClass('folder-rescan-location');
        const label = $('<label>');
        const input = $('<input>', { type: 'checkbox' })
          .attr('data-folder-key', key)
          .attr('data-user', location.user ? 'true' : 'false')
          .attr('data-library', location.library ? 'true' : 'false')
          .attr('aria-label', location.path)
          .prop('checked', keepSelection ? selected.has(key) : true);
        label.append(input, $('<i>').addClass(`fas ${icon}`), $('<span>').attr('title', location.path).text(location.path));
        row.append(label).appendTo(list);
      }
      if (!keepSelection) $('#folder-rescan-result').empty();
      updateFolderRescanControls();
    }
    function selectedFolderRescanScope() {
      const scope = { userDirs: [], libraryDirs: [] };
      $('#folder-rescan-list input[type="checkbox"]:checked').each(function () {
        const path = $(this).siblings('span').text();
        if ($(this).attr('data-user') === 'true') scope.userDirs.push(path);
        if ($(this).attr('data-library') === 'true') scope.libraryDirs.push(path);
      });
      return scope;
    }
    function saveCurrentFolderLists() {
      const userDirList = [];
      const libraryDirList = [];
      $('#settings #dirlist > li').each(function () {
        userDirList.push(folderEntryFromRow(this));
      });
      $('#settings #libdirlist > li').each(function () {
        libraryDirList.push(folderEntryFromRow(this));
      });
      settings.setUserDataPath(ipcRenderer.sendSync('get-user-data-path-sync'));
      return withSettingsTimeout(Promise.all([userDir.save(userDirList), libraryDirs.save(libraryDirList)]), 'Saving folders for selected rescan');
    }
    $('#folder-rescan-list').on('change', 'input[type="checkbox"]', function () {
      $('#folder-rescan-result').empty();
      updateFolderRescanControls();
    });
    $('#folder-rescan-select-all').click(function () {
      $('#folder-rescan-list input[type="checkbox"]').prop('checked', true).trigger('change');
    });
    $('#folder-rescan-select-none').click(function () {
      $('#folder-rescan-list input[type="checkbox"]').prop('checked', false).trigger('change');
    });
    $('#folder-rescan-run').click(async function () {
      if (folderRescanBusy) return;
      const scope = selectedFolderRescanScope();
      const count = scope.userDirs.length + scope.libraryDirs.filter((dir) => !scope.userDirs.some((userDir) => folderRescanKey(userDir) === folderRescanKey(dir))).length;
      const result = $('#folder-rescan-result');
      if (count === 0) {
        result.text(t('rescan-no-selection', 'Select at least one folder.', 'Sélectionne au moins un dossier.'));
        updateFolderRescanControls();
        return;
      }
      folderRescanBusy = true;
      updateFolderRescanControls();
      result.text(t('rescan-started', 'Rescanning {count} selected folder(s)…', 'Analyse des {count} dossier(s) sélectionné(s)…', { count }));
      try {
        await saveCurrentFolderLists();
        await app.onStart({ scanScope: scope });
        result.text(t('rescan-complete', 'Selected folders rescanned.', 'Dossiers sélectionnés analysés.'));
      } catch (err) {
        debug.log(err);
        result.text(t('rescan-failed', 'Selected-folder scan failed: {error}', 'Échec de l’analyse des dossiers sélectionnés : {error}', { error: err && err.message ? err.message : err }));
      } finally {
        folderRescanBusy = false;
        updateFolderRescanControls();
      }
    });
    $(document).on('folder-rescan-locations-changed', renderFolderRescanLocations);
    // Adding or removing a scan root changes which `local-<hash>` ids can be traced back to a
    // folder, so the resolver's cached folder map has to be rebuilt on the next lookup.
    $(document).on('folder-rescan-locations-changed', function () {
      if (typeof blacklist.forgetLocalInstallIndex === 'function') blacklist.forgetLocalInstallIndex();
    });
    renderFolderRescanLocations();

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
        $('<button type="button" class="inline-action-btn"><i class="fas fa-undo"></i></button>')
          .attr('title', listEl.attr('data-restore') || '')
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
          $('#game-list .loading .progressBar').attr('data-percent', 0);
          $('#game-list .loading .progressBar > .meter').css('width', '0%');
          self.css('pointer-events', 'initial');
          $('#win-settings').css('pointer-events', 'initial');
          $('#game-list .loading').show();
          $('#user-info').css('opacity', 0).css('pointer-events', 'none');
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
            message: t('error-while-trying-to-reset-user-blacklist', 'Error while trying to reset user blacklist', 'Erreur lors de la réinitialisation de la liste noire'),
            detail: `${err}`,
          });
        });
    });

    // Auto-save notification controls, excluding customizer sliders.
    $("#settings .box section.content[data-view='notification']").on('change', 'select, #option_overlayVolume', autosaveNotifications);

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
      // Sound controls also apply to Windows toasts.
      const KEEP_VISIBLE_OVERLAY_IDS = new Set(['lbl-overlaySound', 'lbl-overlayVolume']);
      $('#options-notify-overlay > li:not(:first-child)').each(function () {
        const labelId = $(this).find('[id^="lbl-overlay"]').first().attr('id') || '';
        animateOverlaySettingCollapse(this, visible || KEEP_VISIBLE_OVERLAY_IDS.has(labelId));
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
                if (res.cmd === cmd) {
                  if (res.success === true) {
                  finish();
                } else if (res.success === false && res.error) {
                  throw res.error;
                } else {
                  throw 'Unexpected response';
                }
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

    // Random rarity for the "rare" test: one of the three tiers presets style (gold <3%,
    // silver <6%, bronze ≤10%), rounded to one decimal like the real watchdog path.
    function randomRareRarity() {
      const tiers = [
        { min: 0.1, max: 2.9 },
        { min: 3.0, max: 5.9 },
        { min: 6.0, max: 10.0 },
      ];
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      return Math.round((tier.min + Math.random() * (tier.max - tier.min)) * 10) / 10;
    }
    // Build a notification test payload using the current overlay settings.
    function overlayTestData(kind, notificationOverrides, label, game) {
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
      const sound = soundForPreview(soundChoice);
      const position = overrides.position || globalPosition;
      const overrideScale = Number(overrides.scale);
      const scale =
        Number.isFinite(overrideScale) && overrideScale > 0 ? overrideScale : globalScale;
      const rarePct = kind === 'rare' ? randomRareRarity() : null;
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
          gamePositionAppid: gameScoped && game ? String(game.libraryAppid || game.appid || '') : '',
          customPosition: gameScoped && overrides.position === 'custom' ? overrides.customPosition || null : null,
          // `image` is the alias createNotificationWindow() maps onto imagePath/headerPath, which is
          // what the Game Cover preset paints its background from.
          image: (game && game.image) || '',
          // The game the unlock came from, for presets that print it. A generic test has no game, so
          // it names a sample one rather than leaving the row a preset asked for empty.
          gameName: (game && game.name) || t('preset-sample-game', 'Sample Game', 'Jeu d’exemple'),
          // A rare unlock is a normal achievement notification carrying a rarityPercent.
          notificationType: kind === 'toast' || kind === 'rare' ? 'achievement' : kind,
          rarityPercent: rarePct,
          position,
          scale,
          volume: globalVolume,
          durationMs: durSec > 0 ? durSec * 1000 : undefined,
          // The primary icon. A preview has no per-achievement art, so a game-scoped one shows the
          // game's icon rather than the generic placeholder badge.
          iconPath: kind === 'playtime' || game ? gameIcon : achievementIcon,
          achievementIconPath: achievementIcon,
          gameIconPath: gameIcon,
          progress: kind === 'progress' ? { current: 3, max: 10, percent: 30 } : null,
          // Playtime notifications never play a sound, so its test mirrors that behaviour.
          soundPath: kind === 'playtime' ? '' : resolveSoundFile(sound),
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
    }

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
    function spawnNotificationReposition(notificationOverrides, game, gameAppid = '') {
      const data = overlayTestData('toast', notificationOverrides, null, game);
      data.position = 'custom';
      data.reposition = true;
      data.repositionGameAppid = String(gameAppid || '');
      data.gamePositionAppid = String(gameAppid || '');
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

    // The preview is the REAL preset (same markup, engine and stylesheet the notification window
    // loads) rendered in an iframe, so it cannot drift from what an unlock actually looks like.
    const presetSchema = require(path.join(appPath, 'util/presetSchema.js'));
    const presetGenerator = require(path.join(appPath, 'util/customPreset.js'));
    const presetTemplates = require(path.join(appPath, 'util/presetTemplates.js'));
    const presetPanel = require(path.join(appPath, 'util/presetPanel.js'));

    // Value formatting for the readout beside each slider. Purely cosmetic: the stored value is
    // always what the schema says.
    function presetReadout(property, value) {
      // Both kinds of percentage: a 0-1 factor shown as 20-100%, and a slider that is already one.
      if (property.percent) return Math.round(value * 100) + '%';
      if (property.scale === 100) return Math.round(value) + '%';
      if (property.key === 'duration') return (value / 1000).toFixed(value % 1000 ? 1 : 0) + 's';
      return String(value) + (property.unit === 'deg' ? '°' : property.unit || '');
    }

    // The one place that reads the designer's controls; the preview, Create and Export all work
    // from this, so none of them can show a different design.
    function readPresetOptions() {
      const options = {};
      for (const property of presetSchema.PRESET_PROPERTIES) {
        const control = $('#pd-' + property.key);
        if (!control.length) continue;
        const raw = control.val();
        if (property.type === 'number') {
          const number = parseFloat(raw);
          options[property.key] = property.percent ? number / 100 : number;
        } else {
          options[property.key] = raw;
        }
      }
      return presetSchema.normalizeOptions(options);
    }

    // Put a full set of options into the controls. Anything missing falls back to its default, so
    // this also serves as "reset".
    function writePresetOptions(options) {
      const values = presetSchema.normalizeOptions(options);
      for (const property of presetSchema.PRESET_PROPERTIES) {
        const control = $('#pd-' + property.key);
        if (!control.length) continue;
        const value = values[property.key];
        control.val(property.type === 'number' && property.percent ? Math.round(value * 100) : String(value));
      }
      refreshPresetControls();
    }

    // Readouts, and the fields that only apply in one mode (the second gradient colour, artwork
    // dimming): shown doing something or not shown at all.
    function refreshPresetControls() {
      const values = readPresetOptions();
      for (const property of presetSchema.PRESET_PROPERTIES) {
        if (property.type === 'number') $('#pd-val-' + property.key).text(presetReadout(property, values[property.key]));
      }
      $('#options-notify-designer .pd-field[data-shown-for]').each(function () {
        const [key, allowed] = String($(this).attr('data-shown-for')).split(':');
        $(this).prop('hidden', !String(allowed).split(',').includes(String(values[key])));
      });
      return values;
    }

    // Sample payloads matching createNotificationWindow(); artwork/icon are inlined as data URIs
    // since the preview frame is a srcdoc document where file:// images aren't reliably loadable.
    let previewState = 'normal';
    let previewView = 'card';
    function fileAsDataUri(file, mime) {
      try {
        return `data:${mime};base64,${settingsFs.readFileSync(file).toString('base64')}`;
      } catch (e) {
        return '';
      }
    }
    let previewIcon = '';
    // Preview artwork is one of the user's own game headers (what a notification is actually seen
    // over); an empty library falls back to a painted scene rather than the app logo.
    let previewArt = null;
    // Width/height read straight from the PNG or JPEG header bytes, cheaper than an image library.
    function imageDimensions(file) {
      try {
        const buffer = settingsFs.readFileSync(file);
        if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
          return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
        }
        if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
          // Walk the segment chain to the frame header, which is the only one carrying the size.
          for (let at = 2; at + 9 < buffer.length; ) {
            if (buffer[at] !== 0xff) return null;
            const marker = buffer[at + 1];
            const length = buffer.readUInt16BE(at + 2);
            const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
            if (isFrame) return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
            at += 2 + length;
          }
        }
      } catch (e) {
        debug.log(e);
      }
      return null;
    }

    function previewArtwork() {
      if (previewArt !== null) return previewArt;
      previewArt = '';
      try {
        const userData = ipcRenderer.sendSync('get-user-data-path-sync');
        const candidates = [];
        // covers/ only exists once a custom cover was picked; its absence is not worth a stack trace.
        const covers = path.join(userData, 'covers');
        const names = settingsFs.existsSync(covers) ? settingsFs.readdirSync(covers) : [];
        for (const name of names) {
          if (/\.(png|jpe?g|webp)$/i.test(name)) candidates.push(path.join(covers, name));
        }
        // Landscape first: a header fills the card, where a portrait cover is cropped to a sliver of
        // itself. Read from the file header rather than pulling in an image library for one number.
        const landscape = candidates.filter((file) => {
          const size = imageDimensions(file);
          return size && size.width > size.height;
        });
        const pool = landscape.length ? landscape : candidates;
        if (pool.length) {
          const file = pool[Math.floor(Math.random() * pool.length)];
          previewArt = fileAsDataUri(file, /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
        }
      } catch (e) {
        debug.log(e);
      }
      return previewArt;
    }
    function previewPayload() {
      if (!previewIcon) previewIcon = fileAsDataUri(path.join(appPath, 'resources/img/achievement.svg'), 'image/svg+xml');
      const artwork = previewArtwork();
      const base = {
        iconPath: previewIcon,
        imagePath: artwork,
        gameIconPath: artwork,
        // Presets that print the game name get a sample too, or the row they asked for would preview
        // empty and look broken.
        gameName: t('preset-sample-game', 'Sample Game', 'Jeu d’exemple'),
        scale: 1,
      };
      if (previewState === 'rare') {
        return Object.assign(base, {
          displayName: t('test-rare-name', 'Rare Achievement', 'Succès rare'),
          description: t('test-rare-desc', 'Rare · {percent}% of players', 'Rare · {percent} % des joueurs', { percent: 1.4 }),
          notificationType: 'achievement',
          rarityPercent: 1.4,
        });
      }
      if (previewState === 'completion') {
        return Object.assign(base, {
          displayName: t('test-platinum-name', 'Platinum!', 'Trophée Platine'),
          description: t('test-platinum-desc', '100% completed', '100 % complété'),
          notificationType: 'platinum',
          isPlatinum: true,
        });
      }
      if (previewState === 'progress') {
        return Object.assign(base, {
          displayName: t('test-progress-name', 'Progress', 'Progression'),
          description: t('test-progress-desc', '3 / 10', '3 / 10'),
          notificationType: 'progress',
          progress: { current: 3, max: 10, percent: 30 },
        });
      }
      return Object.assign(base, {
        displayName: t('test-toast-name', 'Achievement Unlocked', 'Succès débloqué'),
        description: t('preset-sample-detail', 'Sample achievement description', 'Exemple de description de succès'),
        notificationType: 'achievement',
      });
    }

    // Preset background pictures live in <userData>/presets/images; the srcdoc preview needs data
    // URIs, so `presetAssetUrl` resolves and caches them (the stylesheet rebuilds on every slider move).
    let presetImages = [];
    const presetImageUris = new Map();

    function refreshPresetImages(selected) {
      return ipcRenderer
        .invoke('list-preset-images')
        .then((images) => {
          presetImages = images || [];
          const sel = $('#pd-bgImage');
          if (!sel.length) return;
          const keep = selected != null ? selected : sel.val() || '';
          sel.empty();
          sel.append($('<option>').attr('value', '').text(sel.attr('data-lang-none') || ''));
          const names = presetImages.map((image) => image.name);
          // A preset can name a picture no longer in the folder; keep it listed so re-saving
          // doesn't silently drop the background.
          if (keep && !names.includes(keep)) names.push(keep);
          names.sort((a, b) => a.localeCompare(b));
          names.forEach((name) => sel.append($('<option>').attr('value', name).text(name)));
          sel.val(names.includes(keep) ? keep : '');
          // The list arrives after the controls were written; repaint the preview now in case its
          // background picture had not yet reached the menu when the design was applied.
          if (sel.val()) updatePreviewStyles(readPresetOptions());
        })
        .catch((err) => debug.log(err));
    }

    function presetAssetUrl(name) {
      if (!name) return '';
      if (presetImageUris.has(name)) return presetImageUris.get(name);
      const image = presetImages.find((entry) => entry.name === name);
      const mime = /\.png$/i.test(name)
        ? 'image/png'
        : /\.gif$/i.test(name)
          ? 'image/gif'
          : /\.webp$/i.test(name)
            ? 'image/webp'
            : /\.bmp$/i.test(name)
              ? 'image/bmp'
              : 'image/jpeg';
      const uri = image ? fileAsDataUri(image.file, mime) : '';
      presetImageUris.set(name, uri);
      return uri;
    }

    // The generated stylesheet as the PREVIEW needs it. The only difference from what is written to
    // disk is how a preset's own picture is addressed; every other value is identical.
    const previewCss = (values) => presetGenerator.buildCustomPresetCss(values, { assetUrl: presetAssetUrl });

    const previewFrame = () => ensureFrame(document.getElementById('pd-frame-wrap'), { id: 'pd-frame', title: 'preview' });

    // Only needed when the frame must be re-created (play-through, first render); editing a
    // property swaps the stylesheet inside the existing document instead, to keep slider drags cheap.
    function renderPreviewDocument(values, { hold = true } = {}) {
      const frame = previewFrame();
      if (!frame) return;
      frame.srcdoc = presetGenerator.buildPresetPreviewHtml(values, { hold, assetUrl: presetAssetUrl });
      frame.onload = () => {
        try {
          frame.contentWindow.awPreviewApply(previewPayload());
        } catch (e) {
          debug.log(e);
        }
      };
      layoutPreview(values);
    }

    // Swap only the generated stylesheet in the live document. No reload, no animation restart.
    function updatePreviewStyles(values) {
      const frame = previewFrame();
      let styleEl = null;
      try {
        styleEl = frame && frame.contentDocument && frame.contentDocument.getElementById('aw-preview-css');
      } catch (e) {
        styleEl = null;
      }
      if (!styleEl) {
        renderPreviewDocument(values);
        return;
      }
      styleEl.textContent = previewCss(values);
      if (previewView === 'compare') renderComparePreviews(values);
      layoutPreview(values);
    }

    // Re-feed the sample payload so the state classes and the entry animation are applied again.
    function replayPreview() {
      const frame = previewFrame();
      try {
        if (frame && frame.contentWindow && frame.contentWindow.awPreviewApply) {
          frame.contentWindow.awPreviewApply(previewPayload());
          return;
        }
      } catch (e) {
        debug.log(e);
      }
      renderPreviewDocument(readPresetOptions());
    }

    // The stage has no width until the tab is laid out, so a popup scaled to a zero-width stage
    // would render as nothing; fall back to a sensible width until the layout observer re-runs.
    function measuredStageWidth() {
      // Clear a width Screen view may have narrowed, or each pass would measure the previous
      // layout's shrunk width and shrink it further.
      const node = document.querySelector('#options-notify-designer .pd-stage');
      if (node) node.style.width = '';
      const measured = $('#options-notify-designer .pd-stage').width();
      return measured > 80 ? measured - 28 : 360;
    }

    // The stage has a height ceiling too; read it from the stylesheet, not the box, since the box
    // is about to be resized to what this decides.
    const STAGE_PADDING = 12; // .pd-stage padding, both sides

    function stageCeiling(padding = STAGE_PADDING) {
      const node = document.querySelector('#options-notify-designer .pd-stage');
      if (!node) return 170;
      const cap = parseFloat(getComputedStyle(node).maxHeight);
      return Number.isFinite(cap) && cap > 60 ? cap - padding * 2 : 170;
    }

    // Fits the stage to what the popup needs at the zoom that fits, not a flat share of the panel.
    function fitStageTo(contentHeight, padding = STAGE_PADDING) {
      const node = document.querySelector('#options-notify-designer .pd-stage');
      if (!node) return;
      const style = getComputedStyle(node);
      const floor = parseFloat(style.minHeight) || 96;
      const cap = parseFloat(style.maxHeight) || 300;
      const wanted = Math.ceil(contentHeight) + padding * 2;
      node.style.height = Math.round(Math.max(floor, Math.min(cap, wanted))) + 'px';
    }

    function layoutPreview(values) {
      const frame = previewFrame();
      const wrap = document.getElementById('pd-frame-wrap');
      const screen = document.getElementById('pd-screen');
      if (!frame || !wrap || !screen) return;
      const box = presetGenerator.presetBoxSize(values || readPresetOptions());
      frame.width = box.width;
      frame.height = box.height;
      frame.style.width = box.width + 'px';
      frame.style.height = box.height + 'px';

      const stageWidth = measuredStageWidth();
      let zoom;
      if (previewView === 'compare') {
        // The compare rows own the stage; the single card is hidden by the stylesheet.
        screen.classList.remove('is-screen');
        screen.style.width = '';
        $('#pd-resolution').prop('hidden', true);
        $('#pd-placement').prop('hidden', true);
        $('#pd-size-note').text(`${box.width}×${box.height}`);
        return;
      }
      if (previewView === 'screen') {
        screen.classList.add('is-screen');
        // Fit the shorter of width/height, not just width: a full-width 16:9 box would be taller
        // than the stage and clip the position picker's top/bottom anchors.
        const displayWidth = Math.max(120, Math.min(stageWidth, Math.floor((stageCeiling(0) * 16) / 9)));
        screen.style.width = displayWidth + 'px';
        const stageNode = document.querySelector('#options-notify-designer .pd-stage');
        if (stageNode) stageNode.style.width = displayWidth + 'px';
        fitStageTo((displayWidth * 9) / 16, 0);
        const resolution = parseInt($('#pd-resolution').val(), 10) || 1920;
        const userScale = parseFloat($('#option_overlayScale').val()) || 1;
        zoom = (displayWidth / resolution) * userScale;
      } else {
        screen.classList.remove('is-screen');
        screen.style.width = '';
        // Never larger than life, and never taller than the stage will let it be.
        zoom = Math.min(1, stageWidth / box.width, stageCeiling() / box.height);
        fitStageTo(box.height * zoom);
      }
      frame.style.transform = `scale(${zoom})`;
      wrap.style.width = Math.round(box.width * zoom) + 'px';
      wrap.style.height = Math.round(box.height * zoom) + 'px';
      $('#pd-resolution').prop('hidden', previewView !== 'screen');
      // Where the popup lands and how big it is only change the picture in the Screen view; the card
      // view draws it alone at whatever zoom fits the stage.
      $('#pd-placement').prop('hidden', previewView !== 'screen');
      if (previewView === 'screen') placePreviewInScreen(wrap, screen);
      else {
        wrap.style.left = '';
        wrap.style.top = '';
      }
      // Shows the popup's real size and the zoom it was shrunk to fit, so 70% doesn't read as "the
      // design is small". A custom position is drawn at bottom-centre with a label, never guessed.
      const custom = previewView === 'screen' && String($('#option_overlayPosition').val()) === 'custom';
      const customLabel = custom ? ` · ${$("#option_overlayPosition option[value='custom']").text()}` : '';
      $('#pd-size-note').text(`${box.width}×${box.height} · ${Math.round(zoom * 100)}%${customLabel}`);
    }

    // Mirror of util/notificationBounds.placeNotification for the mock screen. Its 2px edge margin is
    // below one preview pixel at these scales, so the anchors are exact without repeating it.
    function placePreviewInScreen(wrap, screen) {
      const position = String($('#option_overlayPosition').val() || 'center-bottom');
      const free = { x: Math.max(0, screen.clientWidth - wrap.offsetWidth), y: Math.max(0, screen.clientHeight - wrap.offsetHeight) };
      const horizontal = position.includes('left') ? 0 : position.includes('right') ? free.x : free.x / 2;
      const vertical = position.includes('top') ? 0 : position.includes('middle') ? free.y / 2 : free.y;
      wrap.style.left = Math.round(horizontal) + 'px';
      wrap.style.top = Math.round(vertical) + 'px';
    }

    // Repaints on the next frame rather than every input event: a dragged slider fires continuously.
    let previewPending = null;
    function schedulePreview() {
      if (previewPending) return;
      previewPending = setTimeout(() => {
        previewPending = null;
        updatePreviewStyles(refreshPresetControls());
        // Changing a mode can bring a control back (the icon radius returns with the rounded shape),
        // and a control that reappears while the panel is filtered has to be filtered too.
        if (String($('#pd-search').val() || '')) filterDesigner($('#pd-search').val());
      }, 40);
    }

    $('#options-notify-designer').on('input change', 'input, select', function () {
      if (this.id === 'pd-load' || this.id === 'pd-name' || this.id === 'pd-resolution' || this.id === 'pd-search') return;
      schedulePreview();
      recordPresetHistory();
    });
    // The main process copies the picture into the shared folder and hands back the name it ended
    // up under, which is what the preset stores.
    $('#btn-import-preset-image').click(async function (event) {
      event.preventDefault();
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const name = await ipcRenderer.invoke('import-preset-image');
        if (name) {
          presetImageUris.delete(name);
          await refreshPresetImages(name);
          // Picking a picture without switching to the mode that draws it would do nothing visible.
          if ($('#pd-bgMode').val() !== 'image') $('#pd-bgMode').val('image');
          updatePreviewStyles(refreshPresetControls());
          replayPreview();
        }
      } catch (err) {
        debug.log(err);
      }
      self.css('pointer-events', 'initial');
    });

    // The one property the card cannot show: play it when chosen, like the Notifications tab does.
    $('#pd-sound').on('change', function () {
      const chosen = String($(this).val() || '');
      if (chosen) previewSoundAtVolume(chosen);
    });
    $('#pd-resolution').on('change', () => layoutPreview());

    // Filters by hiding, never moving a control (same rule as Settings search, for the same
    // positional-i18n reason); the filter logic itself lives in util/presetPanel.js.
    function filterDesigner(query) {
      const result = presetPanel.filterFields($, '#options-notify-designer', query);
      $('#pd-no-match').prop('hidden', !result.filtering || result.total > 0);
      return result.total;
    }

    $('#pd-search').on('input', function () {
      filterDesigner($(this).val());
    });
    // Escape clears the filter rather than leaving the panel half hidden with an empty-looking box.
    $('#pd-search').on('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!String($(this).val() || '')) return;
      event.stopPropagation();
      $(this).val('');
      filterDesigner('');
    });

    // The undo stack itself is in util/presetPanel.js; here decides what counts as a state, when
    // one settles, and how one is restored.
    const presetHistory = presetPanel.createHistory(80);
    let historyTimer = null;
    let historyRestoring = false;

    function updateHistoryButtons() {
      $('#btn-preset-undo').prop('disabled', !presetHistory.canUndo());
      $('#btn-preset-redo').prop('disabled', !presetHistory.canRedo());
    }

    // Dragging a slider is one gesture, not one step per pixel, so a state settles before it counts.
    function recordPresetHistory() {
      if (historyRestoring) return;
      clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        historyTimer = null;
        if (presetHistory.record(JSON.stringify(readPresetOptions()))) updateHistoryButtons();
      }, 400);
    }

    // Starting again from a saved preset, a template or a reset is a new history, not a step in the
    // old one: undoing across a load would silently mix two designs.
    function resetPresetHistory() {
      clearTimeout(historyTimer);
      historyTimer = null;
      presetHistory.reset(JSON.stringify(readPresetOptions()));
      updateHistoryButtons();
    }

    function stepPresetHistory(back) {
      // A pending record would otherwise land on top of the step just taken.
      clearTimeout(historyTimer);
      historyTimer = null;
      const state = back ? presetHistory.undo() : presetHistory.redo();
      if (state == null) return;

      historyRestoring = true;
      try {
        const values = JSON.parse(state);
        writePresetOptions(values);
        refreshPresetSounds(values.sound || '');
        refreshPresetImages(values.bgImage || '');
        updatePreviewStyles(readPresetOptions());
        replayPreview();
        filterDesigner($('#pd-search').val());
      } finally {
        historyRestoring = false;
      }
      updateHistoryButtons();
    }

    $('#btn-preset-undo').click(() => stepPresetHistory(true));
    $('#btn-preset-redo').click(() => stepPresetHistory(false));

    // Ctrl+Z/Y, but only while the designer tab is on screen and focus is not in a text field where
    // the browser's own undo is what the user means.
    $(document).on('keydown', function (event) {
      if (!event.ctrlKey || event.altKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (!$("#settings .content[data-view='presets']").is(':visible')) return;
      const focused = document.activeElement;
      if (focused && /^(?:input|textarea)$/i.test(focused.tagName) && !/^(?:range|color|checkbox|radio)$/i.test(focused.type || '')) return;
      event.preventDefault();
      stepPresetHistory(key === 'z' && !event.shiftKey);
    });

    // Collapsible groups, and the per-group Advanced disclosure.
    $('#options-notify-designer').on('click', '.pd-group-head', function () {
      $(this).closest('.pd-group').toggleClass('is-open');
    });
    $('#options-notify-designer').on('click', '.pd-more', function () {
      const advanced = $(this).closest('.pd-group-body').find('.pd-adv');
      advanced.prop('hidden', !advanced.prop('hidden'));
      $(this).toggleClass('is-on', !advanced.prop('hidden'));
    });

    $('#pd-view button').on('click', function () {
      previewView = String($(this).attr('data-view') || 'card');
      $('#pd-view button').removeClass('is-on');
      $(this).addClass('is-on');
      document.getElementById('pd-stage').setAttribute('data-view', previewView);
      if (previewView === 'compare') renderComparePreviews(readPresetOptions());
      layoutPreview();
    });

    // Seeing all three states side by side answers "does it look DIFFERENT?", not just "what does
    // a rare unlock look like?".
    function comparePayload(state) {
      const kept = previewState;
      previewState = state;
      const payload = previewPayload();
      previewState = kept;
      return payload;
    }

    // Marks which of the compared rows the state switch points at, since Compare shows all of them.
    function markCurrentCompareRow() {
      $('#pd-compare .pd-compare-row').each(function () {
        $(this).toggleClass('is-current', String($(this).attr('data-state') || '') === previewState);
      });
    }

    function renderComparePreviews(values) {
      const rows = document.querySelectorAll('#pd-compare .pd-compare-row');
      if (!rows.length) return;
      markCurrentCompareRow();
      const box = presetGenerator.presetBoxSize(values);
      const stageWidth = measuredStageWidth();
      // Fits height as well as width (fitting width alone ran tall popups off the bottom); these
      // numbers must agree with .pd-compare in the stylesheet, the only other place the grid is described.
      const COLUMNS = 2;
      const COL_GAP = 14;
      const ROW_GAP = 10;
      const LABEL_ROOM = 18; // the state name now sits above its popup rather than beside it
      const count = rows.length;
      const gridRows = Math.ceil(count / COLUMNS);
      const cellWidth = (stageWidth - COL_GAP * (COLUMNS - 1)) / COLUMNS;
      const cellHeight = Math.max(24, (stageCeiling() - ROW_GAP * (gridRows - 1)) / gridRows - LABEL_ROOM);
      const zoom = Math.min(1, cellWidth / box.width, cellHeight / box.height);
      fitStageTo((Math.ceil(box.height * zoom) + LABEL_ROOM) * gridRows + ROW_GAP * (gridRows - 1));
      const document_ = presetGenerator.buildPresetPreviewHtml(values, { assetUrl: presetAssetUrl });
      for (const row of rows) {
        const wrap = row.querySelector('.pd-compare-frame');
        const frame = ensureFrame(wrap, { title: String(row.getAttribute('data-state') || 'normal') });
        if (!frame) continue;
        frame.width = box.width;
        frame.height = box.height;
        frame.style.width = box.width + 'px';
        frame.style.height = box.height + 'px';
        frame.style.transform = `scale(${zoom})`;
        wrap.style.width = Math.round(box.width * zoom) + 'px';
        wrap.style.height = Math.round(box.height * zoom) + 'px';
        const payload = comparePayload(String(row.getAttribute('data-state') || 'normal'));
        // Already loaded: feed it again rather than reloading, so editing stays as cheap as one card.
        try {
          if (frame.contentWindow && frame.contentWindow.awPreviewApply) {
            const style = frame.contentDocument.getElementById('aw-preview-css');
            if (style) style.textContent = previewCss(values);
            frame.contentWindow.awPreviewApply(payload);
            continue;
          }
        } catch (e) {
          debug.log(e);
        }
        frame.onload = () => {
          try {
            frame.contentWindow.awPreviewApply(payload);
          } catch (e) {
            debug.log(e);
          }
        };
        frame.srcdoc = document_;
      }
    }

    // A notification is seen over a game, not the app's own panel colour, and a design that reads
    // well on dark can vanish on a bright scene, so the backdrop is a preview control.
    $('#pd-backdrop button').on('click', function () {
      $('#pd-backdrop button').removeClass('is-on');
      $(this).addClass('is-on');
      const backdrop = String($(this).attr('data-backdrop') || 'checker');
      const stage = document.getElementById('pd-stage');
      stage.setAttribute('data-backdrop', backdrop);
      // The artwork backdrop is the same game header the preview payload carries; with an empty
      // library the stylesheet's painted scene stands in for it.
      const artwork = backdrop === 'artwork' ? previewArtwork() : '';
      stage.style.backgroundImage = artwork ? `url("${artwork}")` : '';
    });

    $('#pd-state button').on('click', function () {
      previewState = String($(this).attr('data-state') || 'normal');
      $('#pd-state button').removeClass('is-on');
      $(this).addClass('is-on');
      // Looking at the rare or completion card is when its colours are worth having in reach, and
      // they live in a group that starts collapsed - so asking for the state opens it.
      if (previewState === 'rare' || previewState === 'completion' || previewState === 'progress') {
        $("#options-notify-designer .pd-group[data-group='state']").addClass('is-open');
      }
      // In Compare every state is on screen at once, so asking for one marks it rather than
      // swapping to it - the switch keeps meaning something in a view that shows them all.
      if (previewView === 'compare') markCurrentCompareRow();
      replayPreview();
    });

    // Play the whole thing once - entry, hold and exit at the preset's own timings - then go back to
    // holding the card on screen so the controls stay usable.
    let previewPlayTimer = null;
    $('#pd-play').on('click', function () {
      const values = readPresetOptions();
      clearTimeout(previewPlayTimer);
      renderPreviewDocument(values, { hold: false });
      // Re-read the controls when it ends rather than restoring the design as it was at Play, since
      // an edit made during playback should not appear to vanish.
      previewPlayTimer = setTimeout(() => renderPreviewDocument(readPresetOptions()), values.duration + 400);
    });

    // Mirrors the Notifications tab's position setting rather than adding a second one: a preset
    // does not own where notifications appear.
    function refreshPresetAnchors() {
      const scale = String($('#option_overlayScale').val() || '1');
      if ($('#pd-scale').val() !== scale) $('#pd-scale').val(scale);
      const position = String($('#option_overlayPosition').val() || 'center-bottom');
      $('#pd-anchors button').each(function () {
        const pos = String($(this).attr('data-pos'));
        $(this).toggleClass('is-on', pos === position);
        // The grid is nine unlabelled cells, so each one borrows the wording the position setting
        // already has in this language rather than adding nine strings to translate.
        $(this).attr('title', $(`#option_overlayPosition option[value='${pos}']`).text());
      });
      if (previewView === 'screen') layoutPreview();
    }
    // The preset choice lives with the other notification settings; the designer is a separate
    // workshop tab, so this row carries a button through to it rather than merging the two.
    $('#btn-open-presets').on('click', function () {
      $("#settingNav li[data-view='presets']").trigger('click');
    });

    $('#pd-anchors button').on('click', function () {
      $('#option_overlayPosition').val(String($(this).attr('data-pos'))).change();
      refreshPresetAnchors();
    });
    // Mirrors the Notification tab's scale setting here since it is only judgeable next to the
    // design; changing it from either place changes the one setting.
    $('#pd-scale').on('change', function () {
      $('#option_overlayScale').val(String($(this).val())).change();
      layoutPreview();
    });
    $('#option_overlayPosition, #option_overlayScale').on('change', refreshPresetAnchors);

    // Green means a preset was actually written/renamed/deleted/exported; a message that only
    // describes the controls' current state stays 'info' so it doesn't read as "saved".
    function setPresetStatus(message, state) {
      $('#pd-status')
        .text(message || '')
        .removeClass('is-ok is-error')
        .addClass(state === 'ok' ? 'is-ok' : state === 'error' ? 'is-error' : '');
    }

    // The preset's own sound list: the same files the Notifications tab offers, plus a first entry
    // meaning "whatever the app is set to", which is what a preset with no opinion stores.
    function refreshPresetSounds(selected) {
      return ipcRenderer
        .invoke('list-sounds')
        .then((sounds) => {
          const sel = $('#pd-sound');
          const keep = selected != null ? selected : sel.val() || '';
          sel.empty();
          sel.append($('<option>').attr('value', '').text(sel.attr('data-lang-app') || ''));
          (sounds || []).forEach((name) => sel.append($('<option>').attr('value', name).text(name.replace(/\.[^.]+$/, ''))));
          sel.val((sounds || []).includes(keep) ? keep : '');
        })
        .catch((err) => debug.log(err));
    }

    // `{ name, editable }`: an imported preset is listed too (export/delete) but not editable, since
    // regenerating its files from the controls would destroy artwork they cannot reproduce.
    let generatedPresets = [];
    const managedPresetNames = () => generatedPresets.map((preset) => preset.name);
    const isEditablePreset = (name) =>
      generatedPresets.some((preset) => preset.editable && preset.name.toLowerCase() === String(name || '').toLowerCase());

    // Creating a preset that already exists replaces it, so the button says so: "Create" for a new
    // name, "Update" once the typed name matches a preset the designer generated.
    function updateCreateButtonMode() {
      const name = ($('#pd-name').val() || '').trim();
      const known = Boolean(name) && isEditablePreset(name);
      const label = known ? $('#pd-lbl-create').attr('data-update') : $('#pd-lbl-create').attr('data-create');
      if (label) $('#pd-lbl-create').text(label);
      $('#btn-create-preset').find('i').attr('class', known ? 'fas fa-save' : 'fas fa-plus');
    }

    async function refreshGeneratedPresetList(selected) {
      try {
        generatedPresets = (await ipcRenderer.invoke('list-custom-presets')) || [];
      } catch (err) {
        debug.log(err);
        generatedPresets = [];
      }
      const sel = $('#pd-load');
      sel.empty();
      sel.append($('<option>').attr('value', '').text(sel.attr('data-new') || ''));
      generatedPresets.forEach((preset) => sel.append($('<option>').attr('value', preset.name).text(preset.name)));
      sel.val(managedPresetNames().includes(selected) ? selected : '');
      updateCreateButtonMode();
      updateDeleteButtonVisibility();
    }

    // Deleting and renaming only ever apply to a preset the app installed, so the buttons appear once
    // one is actually loaded - never next to a bundled preset or a half-typed new name.
    function updateDeleteButtonVisibility() {
      const loaded = String($('#pd-load').val() || '');
      const managed = Boolean(loaded) && managedPresetNames().includes(loaded);
      $('#btn-delete-preset').toggle(managed);
      $('#btn-rename-preset').toggle(managed);
    }

    // Rebuilds the main preset menu AND the per-type overrides, or a freshly imported preset stays
    // unpickable for rare/platinum/emulator notifications.
    const DEFAULT_PRESET_NAME = 'AW Next';
    const OVERLAY_PRESET_TYPE_IDS = [
      '#option_overlayPresetXenia',
      '#option_overlayPresetRpcs3',
      '#option_overlayPresetShadps4',
    ];
    async function refreshOverlayPresetMenu(preferred) {
      const presets = (await ipcRenderer.invoke('list-presets')) || [];
      const names = presets.length ? presets : [DEFAULT_PRESET_NAME, 'Default'];
      const sel = $('#option_overlayPreset');
      const previous = sel.val();
      sel.empty();
      names.forEach((n) => sel.append($('<option>').attr('value', n).text(n)));
      const wanted = [preferred, previous, DEFAULT_PRESET_NAME].find((n) => n && names.includes(n)) || names[0];
      sel.val(wanted).change();
      for (const id of OVERLAY_PRESET_TYPE_IDS) {
        const typeSel = $(id);
        const kept = typeSel.val();
        typeSel.empty();
        typeSel.append($('<option>').attr('value', '').text(typeSel.attr('data-lang-same') || ''));
        names.forEach((n) => typeSel.append($('<option>').attr('value', n).text(n)));
        const next = names.includes(kept) ? kept : '';
        typeSel.val(next);
        // Only when an override pointed at a preset that no longer exists, so the reset is persisted
        // without every refresh triggering a save of settings nobody touched.
        if (next !== kept) typeSel.change();
      }
      return names;
    }

    // Renames the loaded preset and moves every setting that pointed at the old name, or a stale
    // pointer would silently fall back to the default preset next time it fired.
    $('#btn-rename-preset').click(async function () {
      const from = String($('#pd-load').val() || '');
      const to = ($('#pd-name').val() || '').trim();
      if (!from) return;
      if (!to || to === from) {
        setPresetStatus($('#pd-status').attr('data-err') || '', 'error');
        $('#pd-name').trigger('focus');
        return;
      }

      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const res = await ipcRenderer.invoke('rename-custom-preset', { from, to });
        if (res && res.ok) {
          // Which menus were on the old name, read before the lists are rebuilt under them.
          const followed = [];
          const wasMain = String($('#option_overlayPreset').val() || '') === from;
          for (const id of OVERLAY_PRESET_TYPE_IDS) {
            if (String($(id).val() || '') === from) followed.push(id);
          }
          await refreshOverlayPresetMenu(wasMain ? res.name : undefined);
          for (const id of followed) $(id).val(res.name).change();
          await refreshGeneratedPresetList(res.name);
          $('#pd-name').val(res.name);
          updateCreateButtonMode();
          setPresetStatus(`${$('#pd-status').attr('data-renamed') || ''} ${res.name}`.trim(), 'ok');
        } else {
          setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
        }
      } catch (err) {
        debug.log(err);
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    $('#btn-delete-preset').click(async function () {
      const name = String($('#pd-load').val() || '');
      if (!name) return;
      const self = $(this);
      const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: [t('delete', 'Delete', 'Supprimer'), t('cancel', 'Cancel', 'Annuler')],
        defaultId: 1,
        cancelId: 1,
        title: t('delete-preset-title', 'Delete preset', 'Supprimer le preset'),
        message: t('delete-preset-message', 'Delete the preset "{name}"?', 'Supprimer le preset « {name} » ?', { name }),
        detail: t('delete-preset-detail', 'The preset files are removed from disk. This cannot be undone.', 'Les fichiers du preset seront supprimés du disque. Cette action est irréversible.'),
        noLink: true,
      });
      if (confirmed !== 0) return;
      self.css('pointer-events', 'none');
      try {
        const res = await ipcRenderer.invoke('delete-custom-preset', name);
        if (res && res.ok) {
          // The deleted preset may have been the selected one; rebuild both lists and fall back.
          await refreshOverlayPresetMenu();
          $('#pd-name').val('');
          await refreshGeneratedPresetList('');
          setPresetStatus(`${$('#pd-status').attr('data-deleted') || ''} ${name}`.trim(), 'ok');
        } else {
          setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
        }
      } catch (err) {
        debug.log(err);
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });
    $('#pd-name').on('input', updateCreateButtonMode);

    // Back to the designer's own defaults, without touching what is saved on disk: a draft that has
    // gone wrong is otherwise only recoverable by reloading a saved preset.
    $('#btn-reset-preset').click(function () {
      applyDesignToControls({});
      setPresetStatus($('#pd-status').attr('data-reset') || '', 'info');
    });

    // A template is an ordinary set of options; the name field is left alone, since a starting
    // point is a look, not a preset, and overwriting a typed name would lose the user's work.
    function applyDesignToControls(options) {
      writePresetOptions(options);
      const values = presetSchema.normalizeOptions(options);
      refreshPresetSounds(values.sound || '');
      refreshPresetImages(values.bgImage || '');
      updatePreviewStyles(readPresetOptions());
      replayPreview();
      // A load, a template or a reset starts a design rather than continuing one: undoing across it
      // would step back into a different preset's values.
      resetPresetHistory();
      filterDesigner($('#pd-search').val());
    }

    function buildTemplateChips() {
      const list = $('#pd-templates');
      if (!list.length) return;
      list.empty();
      for (const template of presetTemplates.PRESET_TEMPLATES) {
        // A swatch showing the template's own colours, so the row reads as designs rather than words.
        const values = presetSchema.normalizeOptions(template.options);
        const swatch = $('<span class="pd-template-swatch">').css({
          background: values.bgMode === 'gradient' ? `linear-gradient(135deg, ${values.bg}, ${values.bg2})` : values.bg,
          'border-color': values.accent,
        });
        list.append(
          $('<button type="button" class="pd-template">')
            .attr('data-template', template.name)
            .append(swatch)
            .append($('<span>').text(template.name))
        );
      }
    }

    $('#options-notify-designer').on('click', '.pd-template', function () {
      const name = String($(this).attr('data-template') || '');
      const options = presetTemplates.templateOptions(name);
      if (!options) return;
      $('#options-notify-designer .pd-template').removeClass('is-on');
      $(this).addClass('is-on');
      applyDesignToControls(options);
      setPresetStatus(`${$('#pd-status').attr('data-template') || ''} ${name}`.trim(), 'info');
    });

    // A design nobody would have thought to try. Constrained rather than uniform-random: one hue
    // drives the accent and the background is built around it, so the result is a design, not noise.
    $('#btn-random-preset').click(function () {
      $('#options-notify-designer .pd-template').removeClass('is-on');
      applyDesignToControls(presetTemplates.randomPresetOptions());
      setPresetStatus($('#pd-status').attr('data-randomized') || '', 'info');
    });

    // Riffs on a preset without overwriting it: keeps the design, frees the name, and clears the
    // picker so the next Create adds a preset instead of replacing the one it was based on.
    $('#btn-duplicate-preset').click(function () {
      const source = ($('#pd-name').val() || '').trim() || String($('#pd-load').val() || '');
      if (!source) {
        setPresetStatus($('#pd-status').attr('data-err') || '', 'error');
        return;
      }
      let candidate = `${source} (2)`;
      for (let index = 2; index < 100 && managedPresetNames().some((name) => name.toLowerCase() === candidate.toLowerCase()); index += 1) {
        candidate = `${source} (${index + 1})`;
      }
      $('#pd-load').val('');
      $('#pd-name').val(candidate.slice(0, 48));
      updateCreateButtonMode();
      updateDeleteButtonVisibility();
      setPresetStatus(`${$('#pd-status').attr('data-duplicated') || ''} ${$('#pd-name').val()}`.trim(), 'info');
    });

    // Puts a managed preset into the designer's controls. Returns 'editable', 'imported' or 'failed'.
    // Shared by the picker and by Import, since a programmatic selection fires no change event.
    async function loadPresetIntoBuilder(name) {
      const opts = await ipcRenderer.invoke('read-custom-preset', name);
      if (!opts) return 'failed';
      // An imported preset with no builder options behind it cannot be reproduced from the controls,
      // so leave them alone: Create then makes a new preset instead of overwriting unrebuildable artwork.
      if (opts.editable === false) {
        $('#pd-name').val('');
        updateCreateButtonMode();
        updateDeleteButtonVisibility();
        return 'imported';
      }
      $('#pd-name').val(opts.name || name);
      $('#options-notify-designer .pd-template').removeClass('is-on');
      applyDesignToControls(opts);
      updateCreateButtonMode();
      updateDeleteButtonVisibility();
      return 'editable';
    }

    $('#pd-load').on('change', async function () {
      const name = String($(this).val() || '');
      updateDeleteButtonVisibility();
      if (!name) {
        setPresetStatus('');
        return;
      }
      try {
        const outcome = await loadPresetIntoBuilder(name);
        if (outcome === 'failed') setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
        else if (outcome === 'imported') setPresetStatus($('#pd-status').attr('data-imported-only') || '', 'info');
        else setPresetStatus(`${$('#pd-status').attr('data-loaded') || ''} ${name}`.trim(), 'info');
      } catch (err) {
        debug.log(err);
        setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
      }
    });

    // Renders the design as a real overlay popup without saving it first: only a real popup shows
    // it over whatever is on screen, at the configured position, scale and sound.
    $('#btn-preview-preset').click(async function () {
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        // Preview whatever the picker holds. An imported preset has no control values behind it, so
        // it must preview by name rather than by building a scratch preset from the (unrelated) controls.
        const loaded = String($('#pd-load').val() || '');
        const kind = previewState === 'completion' ? 'platinum' : previewState === 'normal' ? 'toast' : previewState;
        if (loaded && !isEditablePreset(loaded)) {
          setPresetStatus('');
          ipcRenderer.send('spawn-overlay-notification', overlayTestData(kind, loaded, loaded));
          self.css('pointer-events', 'initial');
          return;
        }
        const options = readPresetOptions();
        const res = await ipcRenderer.invoke('preview-custom-preset', options);
        if (res && res.ok) {
          setPresetStatus('');
          // Only name the design when the user actually named it, or the picker's "New preset…"
          // placeholder leaks into the preview text.
          const label = ($('#pd-name').val() || '').trim();
          const data = overlayTestData(kind, res.name, label);
          // A preset that names its own sound is what a real unlock would play, so the preview does
          // too - otherwise the one thing the designer cannot show inline stays untested.
          if (options.sound) data.soundPath = resolveSoundFile(options.sound);
          ipcRenderer.send('spawn-overlay-notification', data);
        } else {
          setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
        }
      } catch (e) {
        debug.log(e);
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + e).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    $('#btn-create-preset').click(async function () {
      const self = $(this);
      const status = $('#pd-status');
      const name = ($('#pd-name').val() || '').trim();
      if (!name) {
        setPresetStatus(status.attr('data-err') || '', 'error');
        return;
      }
      self.css('pointer-events', 'none');
      try {
        const res = await ipcRenderer.invoke('create-custom-preset', Object.assign({ name }, readPresetOptions()));
        if (res && res.ok) {
          // Refresh the preset dropdown and select the new preset (autosave persists the choice).
          await refreshOverlayPresetMenu(res.name);
          await refreshGeneratedPresetList(res.name);
          const done = res.replaced ? status.attr('data-updated') : status.attr('data-ok');
          setPresetStatus(`${done || ''} ${res.name}`.trim(), 'ok');
        } else {
          setPresetStatus(((status.attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
        }
      } catch (e) {
        debug.log(e);
        setPresetStatus(((status.attr('data-fail') || '') + ': ' + e).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    // Import validates the package in the main process and only then touches preset storage.
    function importErrorText(res) {
      const error = String((res && res.error) || '');
      if (error === 'app-too-old') {
        return t(
          'import-preset-app-too-old',
          'This preset needs AW Next {version} or newer.',
          'Ce preset nécessite AW Next {version} ou plus récent.',
          { version: (res && res.requires) || '' }
        );
      }
      if (error === 'format-too-new') {
        return t(
          'import-preset-format-too-new',
          'This preset package was made by a newer version of AW Next.',
          'Ce paquet de preset a été créé par une version plus récente d’AW Next.'
        );
      }
      const invalid = t('import-preset-invalid', 'This file is not a valid preset package.', 'Ce fichier n’est pas un paquet de preset valide.');
      return error ? `${invalid} (${error})` : invalid;
    }

    // Exports what the preview is showing, under the Name field; an imported preset exports from
    // disk instead, since its look lives in files the controls cannot describe.
    $('#btn-export-preset').click(async function () {
      const loaded = String($('#pd-load').val() || '');
      // An imported preset is exported as it stands; anything the designer can read is exported from
      // the controls, so an unsaved draft packages what is on screen.
      const request =
        loaded && !isEditablePreset(loaded)
          ? { name: loaded }
          : { name: ($('#pd-name').val() || '').trim() || loaded, options: readPresetOptions() };
      if (!request.name) {
        setPresetStatus($('#pd-status').attr('data-err') || '', 'error');
        return;
      }
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        const res = await ipcRenderer.invoke('export-preset', request);
        if (res && res.ok) setPresetStatus(`${$('#pd-status').attr('data-exported') || ''} ${res.name}`.trim(), 'ok');
        else if (!res || !res.canceled) setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
      } catch (err) {
        debug.log(err);
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    $('#btn-import-preset').click(async function () {
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        let res = await ipcRenderer.invoke('import-preset', {});
        // A name clash changes nothing until the user picks: replace the preset, or keep both.
        if (res && !res.ok && res.error === 'duplicate') {
          const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
            type: 'question',
            buttons: [
              t('keep-both-presets', 'Keep both', 'Garder les deux'),
              t('replace-preset', 'Replace', 'Remplacer'),
              t('cancel', 'Cancel', 'Annuler'),
            ],
            defaultId: 0,
            cancelId: 2,
            title: t('import-preset-duplicate-title', 'Preset already exists', 'Ce preset existe déjà'),
            message: t('import-preset-duplicate-message', 'A preset named "{name}" is already installed.', 'Un preset nommé « {name} » est déjà installé.', {
              name: res.name || '',
            }),
            detail: t(
              'import-preset-duplicate-detail',
              'Keep both installs the imported preset under a new name. Replace overwrites the installed one.',
              'Garder les deux installe le preset importé sous un nouveau nom. Remplacer écrase celui déjà installé.'
            ),
            noLink: true,
          });
          if (choice === 2) {
            setPresetStatus('');
            self.css('pointer-events', 'initial');
            return;
          }
          res = await ipcRenderer.invoke('import-preset', { file: res.file, duplicate: choice === 1 ? 'replace' : 'rename' });
        }

        if (res && res.ok) {
          await refreshOverlayPresetMenu(res.name);
          await refreshGeneratedPresetList(res.name);
          // Selecting it in code fires no change event, so load it into the controls explicitly or
          // the designer keeps showing whatever draft was there before the import.
          await loadPresetIntoBuilder(res.name);
          setPresetStatus(`${$('#pd-status').attr('data-imported') || ''} ${res.name}`.trim(), 'ok');
        } else if (!res || !res.canceled) {
          setPresetStatus(importErrorText(res), 'error');
        }
      } catch (err) {
        debug.log(err);
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    // An import is never refused over a property AW Next cannot draw: it converts what maps and
    // reports the rest. Keys are printed as SAN spells them so the user can find them there.
    function sanReportDetail(report) {
      if (!report) return '';
      const lines = [];
      lines.push(t('import-san-carried', '{count} settings carried over.', '{count} reglages repris.', { count: (report.mapped || []).length }));

      const byCode = new Map();
      for (const entry of report.skipped || []) {
        if (!byCode.has(entry.code)) byCode.set(entry.code, []);
        byCode.get(entry.code).push(entry.key);
      }
      const missing = (report.assets || []).filter((entry) => entry.code === 'asset-missing').map((entry) => entry.name || '?');
      const refused = (report.assets || []).filter((entry) => entry.code === 'asset-rejected').map((entry) => entry.name);

      const sections = [
        ['unsupported', t('import-san-unsupported', 'Not drawn by an AW Next popup: {keys}', 'Non dessine par une popup AW Next : {keys}')],
        ['app-setting', t('import-san-app-setting', 'A setting of the app rather than part of a preset: {keys}', 'Un reglage de l’application, pas du preset : {keys}')],
        ['unknown', t('import-san-unknown', 'Not recognised by this version: {keys}', 'Non reconnu par cette version : {keys}')],
      ];
      const skipped = [];
      for (const [code, template] of sections) {
        const keys = byCode.get(code);
        if (keys && keys.length) skipped.push('  ' + template.replace('{keys}', keys.join(', ')));
      }
      if (missing.length) {
        skipped.push('  ' + t('import-san-asset-missing', 'Missing from the theme file: {names}', 'Absent du fichier de theme : {names}').replace('{names}', missing.join(', ')));
      }
      if (refused.length) {
        skipped.push('  ' + t('import-san-asset-rejected', 'Refused as an unsupported file: {names}', 'Refuse car le fichier n’est pas pris en charge : {names}').replace('{names}', refused.join(', ')));
      }
      if (skipped.length) {
        lines.push('');
        lines.push(t('import-san-skipped', 'Not carried over:', 'Non repris :'));
        lines.push(...skipped);
      }

      if ((report.notes || []).includes('base-layout') && report.sanPreset) {
        lines.push('');
        lines.push(
          t(
            'import-san-base-layout',
            'The theme was built on SAN\u2019s "{name}" card. AW Next draws its own, so the layout is not the one you had; the colours, motion and effects are.',
            'Le thème était bâti sur la carte « {name} » de SAN. AW Next dessine la sienne : la disposition n’est donc pas celle que vous aviez, les couleurs, le mouvement et les effets si.',
            { name: report.sanPreset }
          )
        );
      }
      if ((report.notes || []).includes('states-merged')) {
        lines.push('');
        lines.push(
          t(
            'import-san-states-merged',
            'SAN keeps a separate theme for rare and 100% unlocks. AW Next paints both states from this one preset, so check its Rare & completion colours.',
            'SAN garde un theme distinct pour les succes rares et le 100 %. AW Next peint ces deux etats avec ce seul preset : verifiez ses couleurs Rare et completion.'
          )
        );
      }
      lines.push('');
      lines.push(
        t(
          'import-san-installed',
          'It is now an ordinary preset: open it under "Edit a preset" to change anything.',
          'C’est desormais un preset ordinaire : ouvrez-le sous « Modifier un preset » pour tout ajuster.'
        )
      );
      return lines.join('\n');
    }

    $('#btn-import-san').click(async function () {
      const self = $(this);
      self.css('pointer-events', 'none');
      try {
        let res = await ipcRenderer.invoke('import-san-theme', {});
        // Same two-step as an .awpreset import: a name clash changes nothing until the user picks.
        if (res && !res.ok && res.error === 'duplicate') {
          const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
            type: 'question',
            buttons: [
              t('keep-both-presets', 'Keep both', 'Garder les deux'),
              t('replace-preset', 'Replace', 'Remplacer'),
              t('cancel', 'Cancel', 'Annuler'),
            ],
            defaultId: 0,
            cancelId: 2,
            title: t('import-preset-duplicate-title', 'Preset already exists', 'Ce preset existe déjà'),
            message: t('import-preset-duplicate-message', 'A preset named "{name}" is already installed.', 'Un preset nommé « {name} » est déjà installé.', {
              name: res.name || '',
            }),
            detail: t(
              'import-preset-duplicate-detail',
              'Keep both installs the imported preset under a new name. Replace overwrites the installed one.',
              'Garder les deux installe le preset importé sous un nouveau nom. Remplacer écrase celui déjà installé.'
            ),
            noLink: true,
          });
          if (choice === 2) {
            setPresetStatus('');
            self.css('pointer-events', 'initial');
            return;
          }
          res = await ipcRenderer.invoke('import-san-theme', { file: res.file, duplicate: choice === 1 ? 'replace' : 'rename' });
        }

        if (res && res.ok) {
          await refreshOverlayPresetMenu(res.name);
          await refreshGeneratedPresetList(res.name);
          await loadPresetIntoBuilder(res.name);
          setPresetStatus(`${$('#pd-status').attr('data-imported') || ''} ${res.name}`.trim(), 'ok');
          remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
            type: 'info',
            title: t('import-san-report-title', 'Theme imported', 'Theme importe'),
            message: res.name,
            detail: sanReportDetail(res.report),
            noLink: true,
          });
        } else if (!res || !res.canceled) {
          const error = String((res && res.error) || '');
          const invalid = t('import-san-invalid', 'This file is not a Steam Achievement Notifier theme.', 'Ce fichier n’est pas un theme Steam Achievement Notifier.');
          setPresetStatus(error ? `${invalid} (${error})` : invalid, 'error');
        }
      } catch (err) {
        debug.log(err);
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
      }
      self.css('pointer-events', 'initial');
    });

    buildTemplateChips();
    refreshGeneratedPresetList().catch((err) => debug.log(err));
    refreshPresetSounds('');
    refreshPresetImages('');
    refreshPresetControls();
    renderPreviewDocument(readPresetOptions());
    refreshPresetAnchors();
    updatePresetTabVisibility();
    // Re-measure whenever the stage's width actually changes, since it is only measurable once the
    // tab is laid out; guarded on width change, or laying out would observe itself forever.
    let lastStageWidth = 0;
    const stageNode = document.querySelector('#options-notify-designer .pd-stage');
    if (stageNode && typeof ResizeObserver === 'function') {
      new ResizeObserver((entries) => {
        const width = Math.round(entries[0].contentRect.width);
        if (width === lastStageWidth) return;
        lastStageWidth = width;
        layoutPreview();
      }).observe(stageNode);
    }
    // The locale loader can run after this file wired the picker up (and again on a language
    // change), so re-render the runtime-worded controls whenever it publishes new labels.
    $(document).on('locale-labels-changed', function () {
      refreshGeneratedPresetList(String($('#pd-load').val() || '')).catch((err) => debug.log(err));
      refreshPresetSounds();
      refreshPresetImages();
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
  app.config.overlay.notificationPosition = $('#option_overlayPosition').val() || 'center-bottom';
  app.config.overlay.notificationScale = parseFloat($('#option_overlayScale').val()) || 1;
  // 'Random' lives in the sound list now, so one control writes both keys: the flag the
  // notification path reads, and the filename it falls back to when the flag is off.
  const chosenSound = $('#option_overlaySound').val() || '';
  app.config.overlay.randomSound = chosenSound === RANDOM_SOUND_VALUE;
  app.config.overlay.notificationSound = chosenSound === RANDOM_SOUND_VALUE ? '' : chosenSound;
  const volRaw = parseInt($('#option_overlayVolume').val(), 10);
  app.config.overlay.notificationVolume = Number.isFinite(volRaw) ? volRaw : 100;
  const durRaw = $('#option_overlayDuration').val();
  app.config.overlay.notificationDuration = durRaw === 'auto' || !durRaw ? 'auto' : parseInt(durRaw, 10) || 'auto';

  // Souvenir screenshot - dir is set by its own folder-picker button and preserved here.
  if (!app.config.souvenir) app.config.souvenir = {};
  app.config.souvenir.screenshot = $('#option_souvenirScreenshot').val() === 'true';
  app.config.souvenir.hdr = $('#option_souvenirHdr').val() === 'off' ? 'off' : 'auto';
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
    settings.save(app.config).catch((err) => debug.log(err));
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
  applyFolderRowMetadata(elem, options, false);

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
          elem.find('.path').attr('title', filePaths[0]);
          elem.find('.path span').text(filePaths[0]);
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
            detail: $("#settings .content[data-view='folder'] > .controls .info p")
              .html()
              .replace(/\s{2,}/g, '')
              .replace(/<br>/g, '\n'),
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
  applyFolderRowMetadata(elem, options, true);

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

function applyFolderRowMetadata(elem, options, library) {
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
    .attr('aria-label', automatic ? detectedLabel : manualLabel)
    .append($('<i>').addClass(`fas ${automatic ? 'fa-magic' : 'fa-hand-pointer'}`).attr('aria-hidden', 'true'));
  elem
    .find('.path')
    .append(origin);
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
