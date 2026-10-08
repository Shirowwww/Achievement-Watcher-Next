'use strict';

const onboardingFs = require('fs');
const merge = require('deepmerge');
const onboardingAvatar = require(path.join(appPath, 'components/userAvatar/avatar.js'));
const onboardingAvatarStore = require(path.join(appPath, 'util/avatarStore.js'));
const uiLanguages = require(path.join(appPath, 'locale/uiLanguages.js'));
const onboardingInterfaceMode = require(path.join(appPath, 'util/interfaceMode.js'));
const onboardingFolderDiagnosis = require(path.join(appPath, 'util/folderDiagnosis.js')).describeFolderDiagnosis;
const onboardingT = require(path.join(appPath, 'locale/t.js')).t;
const onboardingDetect = require(path.join(appPath, 'util/onboardingDetect.js'));

(function ($, window, document) {
  const STEP_COUNT = 6;
  const onboardingTextCache = new Map();
  let step = 0;
  let addedSaveDirs = [];
  let addedLibraryDirs = [];
  let visitedSteps = new Set([0]);
  let languageChosenThisSession = false;
  // The interface-mode answer for this run. Deliberately starts empty even when a mode is already
  // stored: reopening the guide re-asks rather than showing a pre-ticked card.
  let chosenInterfaceMode = '';
  let smartFindRunning = false;
  let persistRunning = false;
  let openedFromSettings = false;
  // Auto-config gate: at first run, proactively detect candidate save folders when the folders step is
  // first shown so the user reviews/trims real candidates instead of starting from an empty list.
  let isFirstRunSession = false;
  let autoDetectedThisSession = false;
  // Detection report shown on the Games step and reused by the last one. `detectRun` drops the
  // answer of a scan that a newer one has already replaced.
  let detection = null;
  let detectRun = 0;
  const folderScanCache = new Map();
  let focusBeforeOpen = null;

  function localizedText() {
    const lang = uiLanguages.has(app.config?.achievement?.lang) ? app.config.achievement.lang : 'english';
    if (onboardingTextCache.has(lang)) return onboardingTextCache.get(lang);

    try {
      const englishBundle = JSON.parse(onboardingFs.readFileSync(path.join(appPath, 'locale/lang/english.json'), 'utf8'));
      const english = englishBundle.onboarding || {};
      let requestedBundle = englishBundle;
      let requested = english;
      if (lang !== 'english') {
        try {
          requestedBundle = JSON.parse(onboardingFs.readFileSync(path.join(appPath, `locale/lang/${lang}.json`), 'utf8'));
          requested = requestedBundle.onboarding || {};
        } catch (err) {
          // A broken or missing per-language file degrades to English, exactly like locale/loader.js.
          debug.log(err);
        }
      }
      const localized = merge(english, requested, {
        arrayMerge: (dest, src) => src,
        isEmpty: (a) => a === null || a === '',
      });
      // Reuse the already translated Settings labels without duplicating locale keys.
      localized.theme = requestedBundle.settings?.general?.theme?.name || englishBundle.settings?.general?.theme?.name || 'Theme';
      localized.themeHint = requestedBundle.settings?.general?.theme?.description || englishBundle.settings?.general?.theme?.description || '';
      localized.preset = requestedBundle.settings?.notification?.option?.overlayPreset || englishBundle.settings?.notification?.option?.overlayPreset || 'Preset';
      localized.presetHint = requestedBundle.settings?.notification?.option?.overlayPresetDesc || englishBundle.settings?.notification?.option?.overlayPresetDesc || '';
      localized.manualSource = requestedBundle.dialogs?.['manual-source'] || englishBundle.dialogs?.['manual-source'] || 'Manual';
      // The first-run dropdown and the Settings row are the same setting, so the automatic mode is
      // named from the Settings label rather than from a second key that could drift away from it.
      localized.notificationAuto =
        requestedBundle.settings?.notification?.option?.mode?.value?.auto ||
        englishBundle.settings?.notification?.option?.mode?.value?.auto ||
        'Automatic';
      // Same idea for the sources step: every row is a real Settings row, so its description and
      // its none/installed/owned wording come from there rather than from a second set of keys.
      localized.sourceText = merge(englishBundle.settings?.source || {}, requestedBundle.settings?.source || {}, {
        arrayMerge: (dest, src) => src,
        isEmpty: (a) => a === null || a === '',
      });
      onboardingTextCache.set(lang, localized);
      return localized;
    } catch (err) {
      debug.log(err);
      return null;
    }
  }

  function text() {
    // localizedText() already degrades to English when a per-language file fails to
    // load (same policy as locale/loader.js); only an unreadable English file returns
    // null, and in that case the whole UI is broken anyway. Keep an object so callers
    // never crash on that catastrophic path.
    return localizedText() || {};
  }

  function boolValue(v) {
    return v === 'true';
  }

  function normalizeDir(dir) {
    return path.normalize(String(dir || '')).toLowerCase();
  }

  function setStatus(message, kind) {
    $('#onboarding-status').removeClass('success error running').addClass(kind || '').text(message || '');
  }

  // Folder search and scan messages stay on the Games step; the footer is for gates and saving.
  function setFolderStatus(message, kind) {
    $('#onboarding-folder-status').removeClass('success error running').addClass(kind || '').text(message || '');
  }

  function fill(template, params) {
    return String(template || '').replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
  }

  // The step that holds `selector`, found by markup so inserting a step never moves a gate or a
  // jump target onto the wrong one. -1 rather than NaN: showStep() clamps it to a real step.
  function stepOf(selector) {
    const found = parseInt($(selector).closest('.onboarding-step').attr('data-step'), 10);
    return Number.isFinite(found) ? found : -1;
  }

  function updateProgress() {
    const t = text();
    const percent = ((step + 1) / STEP_COUNT) * 100;
    $('#onboarding-progress-text').text(`${step + 1} / ${STEP_COUNT}`);
    $('#onboarding-progress-fill').css('width', `${percent}%`);
    $('.onboarding-steps button').each(function (index) {
      const current = index === step;
      $(this)
        .toggleClass('is-complete', !current && visitedSteps.has(index))
        .attr('aria-current', current ? 'step' : null)
        .attr('aria-label', `${index + 1} / ${STEP_COUNT}: ${t.steps[index]}`);
    });
  }

  // The dialog is modal, so Tab must wrap inside it instead of walking into the page behind.
  function trapFocus(event) {
    const items = $('#onboarding .box')
      .find('a[href], button, input, select, summary, [tabindex]')
      .filter(function () {
        return !this.disabled && this.tabIndex >= 0 && $(this).is(':visible');
      })
      .get();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = items.includes(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  function focusStep() {
    const activeStep = $(`.onboarding-step[data-step='${step}']`);
    const target = activeStep.find('input, select, button, a').filter(':visible').first();
    if (target.length) setTimeout(() => target.trigger('focus'), 0);
  }

  function setSmartFindBusy(isBusy) {
    const button = $('#onboard-smart-find');
    const icon = button.find('i');
    smartFindRunning = isBusy;
    button.prop('disabled', isBusy).attr('aria-busy', String(isBusy)).toggleClass('is-running', isBusy);
    icon.toggleClass('fa-search-plus', !isBusy).toggleClass('fa-spinner fa-spin', isBusy);
  }

  function setPersistBusy(isBusy) {
    persistRunning = isBusy;
    $('#onboarding-next, #onboarding-prev, #onboarding-close').prop('disabled', isBusy);
    $('#onboarding').attr('aria-busy', String(isBusy));
    if (!isBusy) updateStepButtons();
  }

  function applyText() {
    const t = text();
    $('#onboarding-settings-label').text(t.settingsLabel);
    $('#btn-onboarding-open span').text(t.settingsButton);
    $('#onboarding-settings-help').text(t.settingsHelp);
    $('#onboarding-eyebrow').text(t.eyebrow);
    $('.onboarding-steps').attr('aria-label', t.navLabel);
    $('.onboarding-steps button').each(function (index) {
      $(this).find('span').text(t.steps[index]);
    });
    $('#onboard-welcome-title').text(t.welcomeTitle);
    $('#onboard-welcome-copy').text(t.welcomeCopy);
    $('#onboard-language-label').text(t.language);
    $('#onboard-language-hint').text(t.languageHint);
    $('#onboard-mode-title').text(t.modeTitle);
    $('#onboard-mode-copy').text(t.modeCopy);
    $('#onboard-mode-simple-title').text(t.modeSimple);
    $('#onboard-mode-simple-copy').text(t.modeSimpleCopy);
    $('#onboard-mode-advanced-title').text(t.modeAdvanced);
    $('#onboard-mode-advanced-copy').text(t.modeAdvancedCopy);
    $('#onboard-mode-hint').text(t.modeHint);
    $('#onboard-profile-title').text(t.profileTitle);
    $('#onboard-profile-copy').text(t.profileCopy);
    $('#onboard-username-label').text(t.username);
    $('#onboard-main-steam-label').text(t.mainSteam);
    $('#onboard-avatar-pick span').text(t.avatarPick);
    $('#onboard-avatar-clear span').text(t.avatarDefault);
    $('#onboard-avatar-hint').text(t.avatarHint);
    $('#onboard-folders-title').text(t.foldersTitle);
    $('#onboard-folders-copy').text(t.foldersCopy);
    $('#onboard-detect-title').text(t.detectTitle);
    $('#onboard-add-save-dir span').text(t.addSave);
    $('#onboard-smart-find span').text(t.smartFind);
    $('#onboard-add-library-dir span').text(t.addLibrary);
    $('#onboard-smart-find-hint').text(t.smartFindHint);
    $('#onboard-add-save-dir-hint').text(t.addSaveHint);
    $('#onboard-add-library-dir-hint').text(t.addLibraryHint);
    $('#onboard-save-list-title').text(t.saveList);
    $('#onboard-library-list-title').text(t.libraryList);
    $('#onboard-sources-title').text(t.sourcesTitle);
    $('#onboard-sources-copy').text(t.sourcesCopy);
    $('#onboard-sources-emulator-title').text(t.sourcesEmulators);
    $('#onboard-sources-emulator-copy').text(t.sourcesEmulatorsCopy);
    translateSourceRows(t);
    $('#onboard-settings-title').text(t.settingsTitle);
    $('#onboard-settings-copy').text(t.settingsCopy);
    $('#onboard-theme-label').text(t.theme);
    $('#onboard-theme-hint').text(t.themeHint);
    $('#onboard-notification-mode-label').text(t.notifications);
    // Icon-only beside the select, so the label lives in the tooltip and the accessible name.
    $('#onboard-notification-test').attr({ title: t.notificationTest, 'aria-label': t.notificationTest });
    $('#onboard-notification-test span').text(t.notificationTest);
    $('#onboard-preset-label').text(t.preset);
    $('#onboard-preset-hint').text(t.presetHint);
    $('#onboard-playtime-label').text(t.playtime);
    $('#onboard-auto-fix-label').text(t.autoFix);
    $('#onboard-hidden-label').text(t.hidden);
    $('#onboard-merge-label').text(t.merge);
    $('#onboard-notification-mode-hint').text(t.notificationsHint);
    $('#onboard-playtime-hint').text(t.playtimeHint);
    $('#onboard-auto-fix-hint').text(t.autoFixHint);
    $('#onboard-hidden-hint').text(t.hiddenHint);
    $('#onboard-merge-hint').text(t.mergeHint);
    $('#onboard-accounts-title').text(t.accountsTitle);
    $('#onboard-accounts-copy').text(t.accountsCopy);
    $('#onboard-more-label').text(t.moreOptions);
    $('#onboard-ready-title').text(t.readyTitle);
    $('#onboard-ready-copy').text(t.readyCopy);
    $('#onboard-features-title').text(t.featuresTitle);
    $('#onboard-feat-overlay-title').text(t.overlayTitle);
    $('#onboard-feat-overlay-copy').text(fill(t.overlayCopy, { hotkey: app.config.overlay?.hotkey || 'Ctrl+Shift+K' }));
    $('#onboard-feat-collections-title').text(t.collectionsTitle);
    $('#onboard-feat-collections-copy').text(t.collectionsCopy);
    $('#onboard-feat-trophy-title').text(t.trophyTitle);
    $('#onboard-feat-trophy-copy').text(t.trophyCopy);
    $('#onboard-feat-clips-title').text(t.clipsTitle);
    $('#onboard-feat-clips-copy').text(t.clipsCopy);
    $('#onboard-feat-backup-title').text(t.backupTitle);
    $('#onboard-feat-backup-copy').text(t.backupCopy);
    $('#onboard-summary-reopen').text(t.summaryReopen);
    $("#onboard-notification-mode option[value='auto']").text(t.notificationAuto);
    $("#onboard-notification-mode option[value='toast']").text(t.toast);
    $("#onboard-notification-mode option[value='overlay']").text(t.overlay);
    $("#onboard-notification-mode option[value='both']").text(t.both);
    $("#onboard-playtime option[value='true'], #onboard-auto-fix option[value='true'], #onboard-merge option[value='true']").text(t.enabled);
    $("#onboard-playtime option[value='false'], #onboard-auto-fix option[value='false'], #onboard-merge option[value='false']").text(t.disabled);
    $("#onboard-hidden option[value='true']").text(t.show);
    $("#onboard-hidden option[value='false']").text(t.hide);
    $('#onboarding-prev span').text(t.back);
    $("#onboard-main-steam option[value='0']").text(t.none);
    updateStepButtons();
    updateProgress();
    renderDirLists();
    renderDetection();
    updateSourcesCount();
    if (step === stepOf('#onboard-recap')) renderRecap();
    // Relabels the account buttons after a language change; show() covers the first open.
    if ($('#onboarding').is(':visible')) refreshAccounts();
  }

  /*
    Interface mode. Nothing is ticked until the user ticks it - the cards carry no default state and
    the guide will not move past this step while `chosenInterfaceMode` is empty.
  */
  function renderInterfaceMode() {
    const cards = $('#onboarding .onboarding-mode-card');
    cards.each(function (index) {
      const selected = $(this).data('mode') === chosenInterfaceMode;
      // Roving tabindex of a radio group: one tab stop, arrows move inside it.
      const stop = chosenInterfaceMode ? selected : index === 0;
      $(this)
        .toggleClass('is-selected', selected)
        .attr({ 'aria-checked': String(selected), tabindex: stop ? '0' : '-1' });
    });
    $('#onboarding').toggleClass('is-simple', onboardingInterfaceMode.isSimple(chosenInterfaceMode));
  }

  function moveInterfaceMode(card, delta) {
    const cards = $('#onboarding .onboarding-mode-card');
    const next = cards.eq((cards.index(card) + delta + cards.length) % cards.length);
    setInterfaceMode(next.data('mode'));
    next.trigger('focus');
  }

  function setInterfaceMode(mode) {
    chosenInterfaceMode = onboardingInterfaceMode.normalize(mode);
    renderInterfaceMode();
    applyModeToGuide();
    if (chosenInterfaceMode) setStatus('', '');
  }

  /*
    The later steps follow the mode picked here, with the same rules as Settings. Auto-fix lives in
    the Emulator tab, which Simple never shows, so offering it here would let a Simple user switch
    on something that rewrites game files and then find no switch to turn it off. The niche sources
    fold away exactly as they do in Settings > Sources. No mode chosen yet counts as Advanced.
  */
  function applyModeToGuide() {
    const simple = onboardingInterfaceMode.isSimple(chosenInterfaceMode);
    $('#onboard-auto-fix').closest('label').toggle(!simple);

    const enabled = {};
    for (const key of Object.keys(onboardingInterfaceMode.OPTIONAL_SOURCES)) {
      enabled[key] = boolValue($(`#onboard-src-${key}`).val());
    }
    let librarySources = [];
    try {
      // gameList belongs to app.js, which shares this script scope.
      if (typeof gameList !== 'undefined' && Array.isArray(gameList)) librarySources = gameList.map((game) => game && game.source);
    } catch (err) {
      debug.log(`onboarding: library sources unavailable (${err})`);
    }
    const hidden = new Set(onboardingInterfaceMode.hiddenOptionalSources({ mode: chosenInterfaceMode, enabled, librarySources }));
    for (const key of Object.keys(onboardingInterfaceMode.OPTIONAL_SOURCES)) {
      $(`#onboard-src-${key}`).closest('.onboarding-source-row').toggle(!hidden.has(key));
    }
    // A group whose every row folded away would leave an empty box behind.
    $('#onboarding .onboarding-source-group')
      .not('.onboarding-accounts')
      .each(function () {
        const rows = $(this).find('.onboarding-source-row');
        const visible = rows.filter(function () {
          return this.style.display !== 'none';
        });
        $(this).toggle(rows.length === 0 || visible.length > 0);
      });
  }

  function enabledSourceCount() {
    return SOURCE_ROWS.filter((row) => {
      const raw = $(`#onboard-src-${row.key}`).val();
      return row.tri ? (parseInt(raw, 10) || 0) > 0 : boolValue(raw);
    }).length;
  }

  function updateSourcesCount() {
    $('#onboard-sources-more').text(fill(text().sourcesMore, { count: enabledSourceCount() }));
  }

  /*
    Optional sign-ins, driving the same main-process flows as the account cards in Settings >
    Sources (init.js steam:* / epic:* IPC). Every label is one those cards already translate.
  */
  const ACCOUNTS = {
    steam: {
      status: 'steam:auth-status',
      login: 'steam:login',
      cancelled: 'login-cancelled',
      name: (state) => state.persona || state.steamid,
      // Aliased to t so the locale lint recognizes these as translated calls.
      text: () => {
        const t = onboardingT;
        return {
          connect: t('steam-connect', 'Connect Steam account', 'Connecter le compte Steam'),
          reconnect: t('steam-reconnect', 'Reconnect', 'Reconnecter'),
          connectedAs: (n) => t('steam-connected-as', 'Connected{suffix}', 'Connecté{suffix}', { suffix: n ? ': ' + n : '' }),
          notConnected: t('steam-not-connected', 'Not connected', 'Non connecté'),
          connecting: t('steam-connecting', 'Opening the Steam sign-in window…', 'Ouverture de la fenêtre de connexion Steam…'),
          cancelled: t('steam-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
          failed: t('steam-failed', 'Steam sign-in failed', 'Échec de la connexion Steam'),
          needsReconnect: t('steam-needs-reconnect', 'Session expired, reconnect needed.', 'Session expirée, reconnexion nécessaire.'),
        };
      },
    },
    xbox: {
      status: 'xbox-pc:status',
      login: 'xbox-pc:login',
      cancelled: 'window-closed',
      name: (state) => state.gamertag,
      // The Xbox PC source shows nothing until the library is imported, so connecting does both.
      afterLogin: importXboxLibrary,
      // Aliased to t so the locale lint recognizes these as translated calls.
      text: () => {
        const t = onboardingT;
        return {
          connect: t('xbox-connect', 'Connect Xbox account', 'Connecter le compte Xbox'),
          reconnect: t('xbox-reconnect', 'Reconnect', 'Reconnecter'),
          connectedAs: (n) => t('xbox-connected-as', 'Connected{suffix}', 'Connecté{suffix}', { suffix: n ? ': ' + n : '' }),
          notConnected: t('xbox-not-connected', 'Not connected', 'Non connecté'),
          connecting: t('xbox-connecting', 'Opening the Microsoft sign-in window…', 'Ouverture de la fenêtre de connexion Microsoft…'),
          cancelled: t('xbox-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
          failed: t('xbox-failed', 'Xbox sign-in failed', 'Échec de la connexion Xbox'),
          importing: t('xbox-importing', 'Importing the Xbox PC library…', 'Importation de la bibliothèque Xbox…'),
          importFailed: t('xbox-import-failed', 'Xbox library import failed', 'Échec de l’importation Xbox'),
        };
      },
    },
    epic: {
      status: 'epic:auth-status',
      login: 'epic:login',
      cancelled: 'window-closed',
      name: (state) => state.displayName,
      // Aliased to t so the locale lint recognizes these as translated calls.
      text: () => {
        const t = onboardingT;
        return {
          connect: t('epic-connect', 'Connect Epic account', 'Connecter le compte Epic'),
          reconnect: t('epic-reconnect', 'Reconnect', 'Reconnecter'),
          connectedAs: (n) => t('epic-connected-as', 'Connected{suffix}', 'Connecté{suffix}', { suffix: n ? ': ' + n : '' }),
          notConnected: t('epic-not-connected', 'Not connected', 'Non connecté'),
          connecting: t('epic-connecting', 'Opening the Epic sign-in window…', 'Ouverture de la fenêtre de connexion Epic…'),
          cancelled: t('epic-cancelled', 'Sign-in cancelled.', 'Connexion annulée.'),
          failed: t('epic-failed', 'Epic sign-in failed', 'Échec de la connexion Epic'),
        };
      },
    },
  };

  function setAccountStatus(key, message, kind) {
    $(`#onboard-${key}-status`)
      .removeClass('success error')
      .addClass(kind || '')
      .text(message || '');
  }

  async function refreshAccount(key) {
    const account = ACCOUNTS[key];
    const labels = account.text();
    let state = {};
    try {
      state = (await ipcRenderer.invoke(account.status)) || {};
    } catch (err) {
      debug.log(`onboarding: ${key} status unavailable (${err})`);
    }
    $(`#onboard-${key}-connect span`).text(state.connected ? labels.reconnect : labels.connect);
    if (state.connected) connectedAccounts.add(key);
    else connectedAccounts.delete(key);
    if (state.connected && state.needsReconnect && labels.needsReconnect) setAccountStatus(key, labels.needsReconnect, 'error');
    else if (state.connected && !$(`#onboard-${key}-status`).hasClass('success')) setAccountStatus(key, labels.connectedAs(account.name(state)), 'success');
    else if (!$(`#onboard-${key}-status`).hasClass('error')) setAccountStatus(key, labels.notConnected);
  }

  function refreshAccounts() {
    for (const key of Object.keys(ACCOUNTS)) refreshAccount(key);
  }

  async function connectAccount(key) {
    const account = ACCOUNTS[key];
    const labels = account.text();
    const button = $(`#onboard-${key}-connect`);
    if (button.prop('disabled')) return;
    button.prop('disabled', true);
    setAccountStatus(key, labels.connecting);
    try {
      const result = (await ipcRenderer.invoke(account.login)) || {};
      if (result.ok && account.afterLogin) return await account.afterLogin(key, labels);
      if (result.ok) setAccountStatus(key, '');
      else if (result.error === account.cancelled) setAccountStatus(key, labels.cancelled, 'error');
      else setAccountStatus(key, `${labels.failed}${result.error ? ': ' + result.error : ''}`, 'error');
    } catch (err) {
      setAccountStatus(key, `${labels.failed}: ${err.message || err}`, 'error');
    } finally {
      button.prop('disabled', false);
      refreshAccount(key);
    }
  }

  // Same import as the Settings card. The summary line comes from the Settings strings, and a
  // library already on screen is rebuilt; while the guide is open, Finish rebuilds it anyway.
  async function importXboxLibrary(key, labels) {
    setAccountStatus(key, labels.importing);
    try {
      const res = (await ipcRenderer.invoke('xbox-pc:import', { lang: app.config?.achievement?.lang || 'english' })) || {};
      if (!res.ok) {
        setAccountStatus(key, `${labels.importFailed}${res.error ? ': ' + res.error : ''}`, 'error');
        return;
      }
      const r = res.result || {};
      setAccountStatus(key, onboardingT('xbox-imported', 'Import complete: {created} created, {updated} updated, {failed} failed.', 'Importation terminée : {created} créé(s), {updated} mis à jour, {failed} échec(s).', {
        created: r.created || 0,
        updated: r.updated || 0,
        failed: r.failed || 0,
      }), 'success');
      if (!$('#onboarding').is(':visible')) app.onStart();
    } catch (err) {
      setAccountStatus(key, `${labels.importFailed}: ${err.message || err}`, 'error');
    }
  }

  // The step that owns the mode cards (and the language), found by markup rather than by a
  // hard-coded index so inserting another step never silently moves the gate onto the wrong one.
  function interfaceModeStep() {
    return stepOf('#onboarding .onboarding-mode-choice');
  }

  function populateLanguageSelect(selected) {
    const current = selected || app.config.achievement?.lang || 'english';
    const t = text();
    const selector = $('#onboard-language');
    selector.empty();
    if (isFirstRunSession && !languageChosenThisSession) {
      selector.append($('<option>').attr('value', '').text(t.languagePlaceholder));
    }
    for (const language of uiLanguages.all()) {
      selector.append(
        $('<option>')
          .attr('value', language.api)
          .attr('title', language.displayName)
          .text(language.native || language.displayName)
      );
    }
    if (isFirstRunSession && !languageChosenThisSession) {
      selector.val('');
      return;
    }
    selector.val(uiLanguages.has(current) ? current : 'english');
  }

  function populateMainSteamSelect(selected) {
    const t = text();
    const selector = $('#onboard-main-steam');
    selector.empty().append($('<option>').attr('value', '0').text(t.none));
    try {
      const list = ipcRenderer.sendSync('get-steam-user-list') || [];
      for (const user of list) selector.append($('<option>').attr('value', user.user).text(user.name));
    } catch (err) {
      debug.log(err);
    }
    selector.val(selected || '0');
  }

  async function refreshAvatarPreview() {
    const preview = $('#onboard-avatar-preview');
    try {
      const avatar = await onboardingAvatar.getAvatar();
      preview.css('background-image', `url("${avatar}")`);
    } catch {
      preview.css('background-image', 'url("../resources/img/avatar.png")');
    }
  }

  /*
    The sources step. Each key is a real achievement_source setting, so the labels and descriptions
    are read straight from the Settings translations rather than duplicated: a brand name needs no
    translation, and every description here is already carried by all 28 locales.

    `tri` marks the three sources that store 0/1/2 (none / installed on this PC / everything the
    account owns) instead of a boolean.
  */
  const SOURCE_ROWS = [
    { key: 'legitSteam', tri: true, fallback: 0 },
    { key: 'xboxPc', tri: true, fallback: 2 },
    { key: 'epicOfficial', tri: true, fallback: 2 },
    { key: 'gogOfficial', fallback: true },
    { key: 'ubisoftOfficial', fallback: true },
    { key: 'ea', fallback: true },
    { key: 'steamEmu', fallback: true },
    { key: 'greenLuma', fallback: true },
    { key: 'lumaPlay', fallback: true },
    { key: 'socialClub', fallback: true },
    { key: 'gog', fallback: true },
    { key: 'epic', fallback: true },
    { key: 'rpcs3', fallback: true },
    { key: 'shadps4', fallback: true },
    { key: 'xenia', fallback: true },
    { key: 'xlln', fallback: true },
    { key: 'markerpatch', fallback: true },
    { key: 'madnesspatch', fallback: true },
    { key: 'retroAchievements', fallback: true },
    { key: 'importCache', fallback: true },
  ];

  function translateSourceRows(t) {
    const settingsSource = t.sourceText || {};
    const values = (settingsSource.legitSteam && settingsSource.legitSteam.value) || {};
    for (const row of SOURCE_ROWS) {
      const entry = settingsSource[row.key] || {};
      $(`#onboard-src-${row.key}-hint`).text(entry.description || '');
      if (row.tri) {
        $(`#onboard-src-${row.key} option[value='0']`).text(values.none || t.none);
        $(`#onboard-src-${row.key} option[value='1']`).text(values.installed || t.installed);
        $(`#onboard-src-${row.key} option[value='2']`).text(values.owned || t.owned);
      } else {
        $(`#onboard-src-${row.key} option[value='true']`).text(t.enabled);
        $(`#onboard-src-${row.key} option[value='false']`).text(t.disabled);
      }
    }
    // Rows with a translated Settings name expose a label slot; brand names stay in the markup.
    for (const row of SOURCE_ROWS) {
      const name = (settingsSource[row.key] || {}).name;
      if (name) $(`#onboard-src-${row.key}-name`).text(name);
    }
    const official = settingsSource.officialPlatforms || {};
    if (official.title) $('#onboard-sources-official-title').text(official.title);
    if (official.description) $('#onboard-sources-official-copy').text(official.description);
  }

  function populateValues() {
    populateLanguageSelect(app.config.achievement?.lang || 'english');
    $('#onboard-username').val(app.config.general?.username || os.userInfo().username || 'User');
    populateMainSteamSelect(app.config.steam?.main || '0');
    $('#onboard-notification-mode').val(app.config.notification_transport?.mode || 'auto');
    $('#onboard-playtime').val(String(app.config.notification?.playtime ?? true));
    for (const row of SOURCE_ROWS) {
      const stored = app.config.achievement_source?.[row.key];
      $(`#onboard-src-${row.key}`).val(String(stored ?? row.fallback));
    }
    $('#onboard-auto-fix').val(String(app.config.emulator?.autoApplyNewGames ?? false));
    $('#onboard-hidden').val(String(app.config.achievement?.showHidden ?? false));
    $('#onboard-merge').val(String(app.config.achievement?.mergeDuplicate ?? true));
    const theme = app.config.general?.theme || 'default';
    const themeSelect = $('#onboard-theme').empty();
    $('#option_theme option').each(function () {
      themeSelect.append($('<option>').attr('value', this.value).text($(this).text()));
    });
    themeSelect.val(themeSelect.find(`option[value="${theme}"]`).length ? theme : 'default');
    const presetSelect = $('#onboard-notification-preset').empty();
    ipcRenderer
      .invoke('list-presets')
      .then((presets) => {
        const list = Array.isArray(presets) && presets.length ? presets : ['AW Next', 'Deck'];
        list.forEach((name) => presetSelect.append($('<option>').attr('value', name).text(name)));
        const selected = app.config.overlay?.notificationPreset || 'AW Next';
        presetSelect.val(list.includes(selected) ? selected : list[0]);
      })
      .catch(() => presetSelect.append($('<option>').attr('value', 'AW Next').text('AW Next')));
    refreshAvatarPreview();
  }

  function renderDirLists() {
    const t = text();
    const render = (selector, rows) => {
      const list = $(selector);
      list.empty();
      if (!rows.length) {
        list.append($('<li>').addClass('empty').text(t.emptyList));
        return;
      }
      rows.forEach((dir, index) => {
        const entry = typeof dir === 'string' ? { path: dir, origin: 'manual' } : dir;
        const item = $('<li>').attr('data-origin', entry.origin || 'manual');
        item.append($('<span>').text(entry.path));
        const automatic = entry.origin === 'auto';
        const origin = $('<small>')
          .addClass(`folder-origin ${automatic ? 'auto' : 'manual'}`)
          .attr('title', automatic ? t.smartFind : t.manualSource)
          .attr('aria-label', automatic ? t.smartFind : t.manualSource)
          .append($('<i>').addClass(`fas ${automatic ? 'fa-magic' : 'fa-hand-pointer'}`).attr('aria-hidden', 'true'));
        item.append(origin);
        item.append(
          $('<button>')
            .attr('type', 'button')
            .attr('title', t.close)
            .html('<i class="fas fa-times"></i>')
            .on('click', () => {
              rows.splice(index, 1);
              renderDirLists();
              scheduleDetection();
            })
        );
        list.append(item);
      });
    };
    render('#onboard-save-dir-list', addedSaveDirs);
    render('#onboard-library-dir-list', addedLibraryDirs);
  }

  function addSaveDir(value, metadata = {}) {
    const entry = typeof value === 'string' ? { path: value, ...metadata } : { ...value };
    entry.origin = entry.origin || 'manual';
    entry.enabled = entry.enabled !== false;
    const normalized = normalizeDir(entry.path);
    if (!normalized || addedSaveDirs.some((item) => normalizeDir(item.path) === normalized)) return;
    addedSaveDirs.push({ notify: true, ...entry });
    renderDirLists();
    scheduleDetection();
  }

  function addLibraryDir(value, metadata = {}) {
    const entry = typeof value === 'string' ? { path: value, ...metadata } : { ...value };
    entry.origin = entry.origin || 'manual';
    entry.enabled = entry.enabled !== false;
    const normalized = normalizeDir(entry.path);
    if (!normalized || addedLibraryDirs.some((item) => normalizeDir(item.path || item) === normalized)) return;
    addedLibraryDirs.push(entry);
    renderDirLists();
    scheduleDetection();
  }

  /*
    "Found on this PC". Launchers are read from their own files, folders by scanning each one the
    guide will save, so the numbers are what the first scan will start from. A launcher whose
    Sources switch is off is still listed, marked off, because that is the surprise worth avoiding.
  */
  const DETECT_ROWS = [
    { key: 'steam', name: 'Steam', icon: 'fab fa-steam', source: 'legitSteam' },
    { key: 'gog', name: 'GOG Galaxy', icon: 'brand-icon brand-gog', source: 'gogOfficial' },
    { key: 'epic', name: 'Epic Games', icon: 'brand-icon brand-epic', source: 'epicOfficial' },
    { key: 'ubisoft', name: 'Ubisoft Connect', icon: 'brand-icon brand-ubisoft', source: 'ubisoftOfficial' },
  ];
  const DETECT_PARALLEL_SCANS = 4;
  let detectRunning = false;
  let detectTimer = null;
  let savedFolderCount = 0;

  function launcherReaders() {
    const parser = (name) => require(path.join(appPath, `parser/${name}.js`));
    return {
      steam: () => {
        const library = parser('steamLibrary');
        return onboardingDetect.steamInstalledAppids({ libraryAppsDirs: () => library.libraryAppsDirs(library.steamClientDir()), readdir: onboardingFs.readdirSync });
      },
      gog: () => parser('gogOfficial').scan(),
      epic: () => parser('epicOfficial').scan(),
      ubisoft: () => parser('ubisoftOfficial').scan(),
    };
  }

  function sourceIsOff(key) {
    const raw = $(`#onboard-src-${key}`).val();
    return raw === '0' || raw === 'false';
  }

  async function scanFolderOnce(dir) {
    const key = normalizeDir(dir);
    if (!folderScanCache.has(key)) {
      try {
        folderScanCache.set(key, (await userDir.scan(dir)) || []);
      } catch (err) {
        debug.log(`onboarding: could not scan ${dir} (${err})`);
        folderScanCache.set(key, []);
      }
    }
    return folderScanCache.get(key);
  }

  async function refreshDetection() {
    const run = ++detectRun;
    detectRunning = true;
    renderDetection();
    try {
      const launchers = await onboardingDetect.collectLaunchers(launcherReaders());
      const [saved, libraries] = await Promise.all([
        userDir.getEntries ? userDir.getEntries() : userDir.get(),
        libraryDirs.getEntries ? libraryDirs.getEntries() : libraryDirs.get(),
      ]);
      const dirs = [...mergeSaveDirs(saved, addedSaveDirs), ...mergeLibraryDirs(libraries, addedLibraryDirs)].filter((entry) => entry && entry.path && entry.enabled !== false);
      // Launchers answer at once: show them while the folders are still being read.
      detection = onboardingDetect.buildReport({ launchers, folders: [] });
      renderDetection();
      const lists = await onboardingDetect.mapLimit(dirs, DETECT_PARALLEL_SCANS, (entry) => scanFolderOnce(entry.path), () => run !== detectRun);
      if (run !== detectRun) return;
      savedFolderCount = dirs.length;
      detection = onboardingDetect.buildReport({ launchers, folders: lists });
    } catch (err) {
      debug.log(`onboarding: detection failed (${err})`);
    }
    if (run !== detectRun) return;
    detectRunning = false;
    renderDetection();
    if (step === stepOf('#onboard-recap')) renderRecap();
  }

  function scheduleDetection() {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(refreshDetection, 250);
  }

  function renderDetection() {
    const t = text();
    const list = $('#onboard-detect-list').empty();
    const total = $('#onboard-detect-total').removeClass('is-found');
    const note = $('#onboard-detect-note').empty().prop('hidden', true);
    if (!detection) {
      total.text(detectRunning ? t.smartRunning : '');
      return;
    }
    const append = (icon, name, found, label) =>
      list.append(
        $('<li>')
          .toggleClass('is-found', found)
          .toggleClass('is-empty', !found)
          .append($('<i>').addClass(icon).attr('aria-hidden', 'true'), $('<span>').text(name), $('<span>').text(label))
      );
    let offFound = false;
    for (const row of DETECT_ROWS) {
      const count = detection.launchers[row.key] || 0;
      const off = count > 0 && sourceIsOff(row.source);
      offFound = offFound || (row.key === 'steam' && off);
      append(row.icon, row.name, count > 0, count > 0 ? fill(t.detectInstalled, { count }) + (off ? ` · ${t.detectOff}` : '') : t.detectNone);
    }
    const emulators = detection.emulators;
    const emulatorLabel = emulators.games > 0 ? fill(t.detectFolders, { games: emulators.games, folders: emulators.folders }) : detectRunning ? t.smartRunning : t.detectNone;
    append('fas fa-file-alt', t.detectEmulators, emulators.games > 0, emulatorLabel);
    total.toggleClass('is-found', detection.total > 0).text(detectRunning ? t.smartRunning : detection.total > 0 ? fill(t.detectTotal, { count: detection.total }) : t.detectNothing);
    if (offFound) {
      note.prop('hidden', false).append(
        $('<span>').text(t.detectSteamOff + ' '),
        $('<button>')
          .attr('type', 'button')
          .text(t.detectReviewSources)
          .on('click', () => {
            $('#onboard-sources-details').prop('open', true);
            showStep(stepOf('#onboard-sources-details'));
          })
      );
    }
  }

  const connectedAccounts = new Set();

  function renderRecap() {
    const t = text();
    const language = uiLanguages.all().find((entry) => entry.api === $('#onboard-language').val());
    const mode = chosenInterfaceMode === 'simple' ? t.modeSimple : chosenInterfaceMode === 'advanced' ? t.modeAdvanced : t.none;
    const folders = savedFolderCount || addedSaveDirs.length + addedLibraryDirs.length;
    const games = detection ? detection.total : 0;
    const accounts = [...connectedAccounts].map((key) => ({ steam: 'Steam', xbox: 'Xbox', epic: 'Epic Games' })[key]);
    const sources = fill(t.summarySources, { count: enabledSourceCount() }) + (accounts.length ? ` · ${fill(t.summaryAccounts, { names: accounts.join(', ') })}` : '');
    const theme = $('#onboard-theme option:selected').text();
    const alerts = $('#onboard-notification-mode option:selected').text();
    const rows = [
      { icon: 'fa-language', text: `${language ? language.native || language.displayName : ''} · ${mode}`, target: interfaceModeStep() },
      {
        icon: games > 0 ? 'fa-check-circle' : 'fa-exclamation-circle',
        warning: games === 0,
        text: games > 0 ? fill(t.summaryGames, { count: games, folders }) : t.summaryNoGames,
        target: stepOf('#onboard-smart-find'),
      },
      { icon: 'fa-shield-alt', text: sources, target: stepOf('#onboard-sources-details') },
      { icon: 'fa-bell', text: fill(t.summaryLook, { theme, notifications: alerts }), target: stepOf('#onboard-theme') },
    ];
    const list = $('#onboard-recap').empty();
    for (const row of rows) {
      const change = $('<button>')
        .attr({ type: 'button', 'aria-label': `${t.summaryChange}: ${row.text}` })
        .text(t.summaryChange)
        .on('click', () => showStep(row.target));
      list.append($('<li>').toggleClass('is-warning', Boolean(row.warning)).append($('<i>').addClass(`fas ${row.icon}`).attr('aria-hidden', 'true'), $('<span>').text(row.text), change));
    }
  }

  // Scan a freshly added folder and report what it contains, so picking the wrong folder is obvious
  // immediately instead of silently accepting anything.
  async function reportFolderScan(dir) {
    setFolderStatus(text().smartRunning, 'running');
    try {
      const found = await userDir.scan(dir);
      const count = Array.isArray(found) ? found.length : 0;
      setFolderStatus(count > 0 ? fill(text().folderGames, { count }) : text().invalidFolder, count > 0 ? 'success' : '');
    } catch (err) {
      debug.log(err);
      setFolderStatus('', '');
    }
  }

  async function pickSaveDir() {
    try {
      const dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'showHiddenFiles'] });
      if (!dialog.filePaths || dialog.filePaths.length === 0) return;
      const diagnosis = await userDir.diagnose(dialog.filePaths[0]);
      if (diagnosis.accepted) {
        const accepted = diagnosis.canonicalPath || dialog.filePaths[0];
        addSaveDir(accepted);
        reportFolderScan(accepted);
      } else {
        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'warning',
          title: 'AW Next',
          message: text().invalidFolder,
          // Which folder, and why it cannot be used - the guide is where a first-run user is most
          // likely to point AW at a game folder that keeps nothing readable.
          detail: onboardingFolderDiagnosis(diagnosis, onboardingT),
        });
      }
    } catch (err) {
      debug.log(err);
    }
  }

  async function smartFindDirs() {
    if (smartFindRunning) return;
    setSmartFindBusy(true);
    setFolderStatus(text().smartRunning, 'running');
    const before = addedSaveDirs.length + addedLibraryDirs.length;
    try {
      const foundSaveDirs = userDir.findEntries ? await userDir.findEntries() : (await userDir.find()).map((path) => ({ path, origin: 'auto' }));
      for (const dir of foundSaveDirs) {
        try {
          if (await userDir.check(dir.path)) addSaveDir(dir);
        } catch (err) {
          debug.log(err);
        }
      }
      if (libraryDirs.find) {
        const foundLibraryDirs = libraryDirs.findEntries ? await libraryDirs.findEntries() : (await libraryDirs.find()).map((path) => ({ path, origin: 'auto' }));
        for (const dir of foundLibraryDirs) {
          addLibraryDir(dir);
        }
      }
      const added = Math.max(0, addedSaveDirs.length + addedLibraryDirs.length - before);
      setFolderStatus(added > 0 ? fill(text().smartFound, { count: added }) : text().smartNone, added > 0 ? 'success' : '');
    } catch (err) {
      setFolderStatus(`${err}`, 'error');
      debug.log(err);
    } finally {
      setSmartFindBusy(false);
      scheduleDetection();
    }
  }

  async function pickLibraryDir() {
    try {
      const dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), { properties: ['openDirectory', 'showHiddenFiles'] });
      if (!dialog.filePaths || dialog.filePaths.length === 0) return;
      addLibraryDir(dialog.filePaths[0]);
    } catch (err) {
      debug.log(err);
    }
  }

  function showStep(nextStep) {
    // Leaving the first step forward needs both answers. Going back is always allowed, so the
    // guide can be re-read without being trapped here.
    const modeStep = interfaceModeStep();
    if (modeStep >= 0 && step === modeStep && nextStep > modeStep) {
      if (isFirstRunSession && !uiLanguages.has($('#onboard-language').val())) {
        setStatus(text().languageRequired, 'error');
        $('#onboard-language').trigger('focus');
        return;
      }
      if (!chosenInterfaceMode) {
        setStatus(text().modeRequired, 'error');
        $('#onboarding .onboarding-mode-card[tabindex="0"]').first().trigger('focus');
        return;
      }
    }
    step = Math.max(0, Math.min(STEP_COUNT - 1, nextStep));
    visitedSteps.add(step);
    setStatus('', '');
    $('.onboarding-step').removeClass('active');
    $(`.onboarding-step[data-step='${step}']`).addClass('active');
    $('.onboarding-steps button').removeClass('active');
    $(`.onboarding-steps button[data-step='${step}']`).addClass('active');
    updateStepButtons();
    updateProgress();
    maybeAutoDetectFolders();
    // The folder search ends in a detection run of its own; any other first visit starts one.
    const needsDetection = (step === stepOf('#onboard-detect') || step === stepOf('#onboard-recap')) && !detection && !detectRunning;
    if (needsDetection && !smartFindRunning) refreshDetection();
    if (step === stepOf('#onboard-recap')) renderRecap();
    if (step === stepOf('#onboard-detect')) renderDetection();
    focusStep();
  }

  // First time the folders step is reached during a first-run session, kick off the smart-find scan so
  // detected candidate folders are presented for review (the auto-config gate). Runs at most once and
  // never on a manual reopen from Settings (so it doesn't re-scan every time you open the guide).
  function maybeAutoDetectFolders() {
    if (!isFirstRunSession || autoDetectedThisSession) return;
    if ($(`.onboarding-step[data-step='${step}']`).find('#onboard-smart-find').length === 0) return;
    autoDetectedThisSession = true;
    smartFindDirs();
  }

  function updateStepButtons() {
    const t = text();
    $('#onboarding-prev').prop('disabled', step === 0);
    $('#onboarding-next span').text(step === STEP_COUNT - 1 ? t.finish : t.next);
    $('#onboarding-next i').toggleClass('fa-check', step === STEP_COUNT - 1).toggleClass('fa-chevron-right', step !== STEP_COUNT - 1);
    // Two dismiss affordances, always visible: the corner button and a plain-text one in the footer.
    // Both save what is already chosen; a reopened guide edits live settings, so closing keeps them.
    const dismiss = isFirstRunSession ? t.skip : t.close;
    $('#onboarding-close').attr({ title: dismiss, 'aria-label': dismiss });
    $('#onboarding-skip span').text(isFirstRunSession ? t.skipSetup : t.saveClose);
    $('#onboarding-skip').toggle(step !== STEP_COUNT - 1);
  }

  function mergeSaveDirs(existing, additions) {
    const seen = new Set();
    const result = [];
    for (const entry of existing || []) {
      if (!entry || !entry.path) continue;
      const key = normalizeDir(entry.path);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(entry);
    }
    for (const entry of additions) {
      const key = normalizeDir(entry.path);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(entry);
    }
    return result;
  }

  function mergeLibraryDirs(existing, additions) {
    const seen = new Set();
    const result = [];
    for (const raw of existing || []) {
      const dir = typeof raw === 'string' ? { path: raw, origin: 'manual', enabled: true } : raw;
      const key = normalizeDir(dir.path);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(dir);
    }
    for (const dir of additions) {
      const key = normalizeDir(dir.path);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(dir);
    }
    return result;
  }

  /*
    strict: Finish. Needs a language and an interface mode, and says so otherwise.
    not strict: Skip. Saves whatever was chosen so far and leaves the rest as it was: an unanswered
    mode stays unset, which the app resolves to Advanced rather than hiding anything from someone
    who never asked for Simple.
  */
  async function persist(markComplete = true, { strict = true } = {}) {
    if (persistRunning) return false;
    const t = text();
    setPersistBusy(true);
    setStatus(t.saving, 'running');
    try {
      if (!app.config.general) app.config.general = {};
      if (!app.config.steam) app.config.steam = {};
      if (!app.config.achievement_source) app.config.achievement_source = {};
      if (!app.config.notification) app.config.notification = {};
      if (!app.config.notification_transport) app.config.notification_transport = {};
      if (!app.config.overlay) app.config.overlay = {};
      if (!app.config.emulator) app.config.emulator = {};
      if (!app.config.achievement) app.config.achievement = {};

      let language = $('#onboard-language').val();
      if (!uiLanguages.has(language)) {
        if (strict) {
          setStatus(t.languageRequired, 'error');
          return false;
        }
        language = uiLanguages.has(app.config.achievement.lang) ? app.config.achievement.lang : 'english';
      }
      if (!chosenInterfaceMode && strict) {
        setStatus(t.modeRequired, 'error');
        const modeStep = interfaceModeStep();
        if (modeStep >= 0) showStep(modeStep);
        return false;
      }
      if (chosenInterfaceMode) app.config.general.interfaceMode = chosenInterfaceMode;
      app.config.achievement.lang = language;
      app.config.general.username = $('#onboard-username').val().trim() || app.config.general.username || os.userInfo().username || 'User';
      app.config.general.onboardingCompleted = markComplete;
      app.config.steam.main = $('#onboard-main-steam').val() || '0';
      app.config.notification_transport.mode = $('#onboard-notification-mode').val() || 'auto';
      app.config.overlay.notificationPreset = $('#onboard-notification-preset').val() || app.config.overlay.notificationPreset || 'AW Next';
      app.config.general.theme = $('#onboard-theme').val() || 'default';
      app.config.notification.playtime = boolValue($('#onboard-playtime').val());
      for (const row of SOURCE_ROWS) {
        const raw = $(`#onboard-src-${row.key}`).val();
        app.config.achievement_source[row.key] = row.tri ? parseInt(raw, 10) || 0 : boolValue(raw);
      }
      // Simple never offered the row (see applyModeToGuide), so the stored value stays as it was.
      if (!onboardingInterfaceMode.isSimple(chosenInterfaceMode)) app.config.emulator.autoApplyNewGames = boolValue($('#onboard-auto-fix').val());
      app.config.achievement.showHidden = boolValue($('#onboard-hidden').val());
      app.config.achievement.mergeDuplicate = boolValue($('#onboard-merge').val());

      settings.setUserDataPath(ipcRenderer.sendSync('get-user-data-path-sync'));
      const [currentSaveDirs, currentLibraryDirs] = await Promise.all([
        userDir.getEntries ? userDir.getEntries() : userDir.get(),
        libraryDirs.getEntries ? libraryDirs.getEntries() : libraryDirs.get(),
      ]);
      await Promise.all([
        userDir.save(mergeSaveDirs(currentSaveDirs, addedSaveDirs)),
        libraryDirs.save(mergeLibraryDirs(currentLibraryDirs, addedLibraryDirs)),
        settings.save(app.config),
      ]);
      $('#user-info .info .name').text(app.config.general.username);
      setStatus(t.saved, 'success');
      return true;
    } catch (err) {
      setStatus(t.saveError, 'error');
      debug.log(err);
      return false;
    } finally {
      setPersistBusy(false);
    }
  }

  async function finish() {
    if (!(await persist(true))) return;
    hide();
    // Settings is built once at startup, so a mode chosen here has to be pushed onto it.
    if (typeof window.applyInterfaceMode === 'function') window.applyInterfaceMode();
    resetUI();
  }

  async function skip() {
    const firstRun = isFirstRunSession;
    if (!(await persist(true, { strict: false }))) return;
    if (typeof window.applyInterfaceMode === 'function') window.applyInterfaceMode();
    hide({ returnToSettings: true });
    // The first scan was held back for the guide, so leaving it by any door starts that scan.
    if (firstRun) resetUI();
  }

  function hide({ returnToSettings = false } = {}) {
    const restoreSettings = returnToSettings && openedFromSettings;
    $('#onboarding').attr('aria-hidden', 'true').hide();
    setStatus('', '');
    openedFromSettings = false;
    if (restoreSettings) $('title-bar').trigger('open-settings');
    else if (focusBeforeOpen && document.contains(focusBeforeOpen)) focusBeforeOpen.focus();
    focusBeforeOpen = null;
  }

  function show(force) {
    if (!force && app.config.general?.onboardingCompleted === true) return;
    openedFromSettings = Boolean(force && $('#settings').is(':visible'));
    focusBeforeOpen = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    isFirstRunSession = !force; // auto-detect candidates only on the genuine first-run guide
    autoDetectedThisSession = false;
    languageChosenThisSession = false;
    detection = null;
    detectRunning = false;
    detectRun += 1;
    folderScanCache.clear();
    $('#onboarding details').prop('open', false);
    chosenInterfaceMode = isFirstRunSession ? '' : onboardingInterfaceMode.normalize(app.config.general?.interfaceMode);
    addedSaveDirs = [];
    addedLibraryDirs = [];
    visitedSteps = new Set([0]);
    applyText();
    populateValues();
    renderInterfaceMode();
    applyModeToGuide();
    renderDirLists();
    $('#settings .box').hide();
    $('#settings').hide();
    if ($('title-bar')[0]) $('title-bar')[0].inSettings = false;
    $('#onboarding').toggleClass('is-first-run', isFirstRunSession).attr('aria-hidden', 'false').show();
    refreshAccounts();
    showStep(0);
  }

  window.openAchievementWatcherOnboarding = show;
  window.addEventListener('aw-open-onboarding', (event) => {
    window.__awPendingOnboardingOpen = false;
    show(event.detail && event.detail.force !== false);
  });

  $(function () {
    applyText();
    if (window.__awPendingOnboardingOpen) {
      window.__awPendingOnboardingOpen = false;
      setTimeout(() => show(true), 0);
    }
    $('#onboarding-prev').on('click', () => showStep(step - 1));
    $('#onboarding-next').on('click', () => {
      if (step === STEP_COUNT - 1) finish();
      else showStep(step + 1);
    });
    $('#onboarding-close, #onboarding .overlay').on('click', skip);
    $('.onboarding-steps button').on('click', function () {
      showStep(parseInt($(this).data('step'), 10));
    });
    $(document).on('click', '#btn-onboarding-open', (event) => {
      event.preventDefault();
      event.stopPropagation();
      show(true);
    });
    $('#onboarding').on('click', '.onboarding-mode-card', function () {
      setInterfaceMode($(this).data('mode'));
    });
    $('#onboard-steam-connect').on('click', () => connectAccount('steam'));
    $('#onboard-xbox-connect').on('click', () => connectAccount('xbox'));
    $('#onboard-epic-connect').on('click', () => connectAccount('epic'));
    $('#onboard-add-save-dir').on('click', pickSaveDir);
    $('#onboard-smart-find').on('click', smartFindDirs);
    $('#onboard-add-library-dir').on('click', pickLibraryDir);
    $('#onboard-avatar-pick').on('click', async () => {
      try {
        const dialog = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
          properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'],
          filters: [{ name: 'Image', extensions: ['jpeg', 'jpg', 'png', 'gif', 'bmp'] }],
        });
        if (!dialog.filePaths || dialog.filePaths.length === 0) return;
        const avatar = await onboardingAvatar.imageFileToBase64(dialog.filePaths[0]);
        onboardingAvatarStore.setAvatar(avatar);
        await refreshAvatarPreview();
        const avatarEl = document.querySelector('user-avatar');
        if (avatarEl && typeof avatarEl.update === 'function') avatarEl.update();
      } catch (err) {
        debug.log(err);
      }
    });
    $('#onboard-avatar-clear').on('click', async () => {
      onboardingAvatarStore.clearAvatar();
      await refreshAvatarPreview();
      const avatarEl = document.querySelector('user-avatar');
      if (avatarEl && typeof avatarEl.update === 'function') avatarEl.update();
    });
    $('#onboard-notification-test').on('click', function () {
      if (typeof window.testAchievementWatcherNotification !== 'function') {
        debug.log('notification test is not ready yet');
        return;
      }
      window.testAchievementWatcherNotification(
        $('#onboard-notification-mode').val() || 'auto',
        this,
        $('#onboard-notification-preset').val() || 'AW Next'
      );
    });
    $('#onboard-theme').on('change', function () {
      const selected = $(this).val() || 'default';
      document.documentElement.dataset.theme = selected === 'custom' || /^user:/i.test(selected) ? 'default' : selected;
    });
    $('#onboard-language').on('change', function () {
      if (!app.config.achievement) app.config.achievement = {};
      app.config.achievement.lang = $(this).val() || 'english';
      languageChosenThisSession = uiLanguages.has(app.config.achievement.lang);
      applyText();
      populateLanguageSelect(app.config.achievement.lang);
    });
    $('#onboarding-skip').on('click', skip);
    $('#onboarding select[id^="onboard-src-"]').on('change', () => {
      updateSourcesCount();
      renderDetection();
    });
    $('#onboard-username').on('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      showStep(step + 1);
    });
    $('#onboarding').on('keydown', '.onboarding-mode-card', function (event) {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      moveInterfaceMode(this, delta);
    });
    $(document).on('keydown.awOnboarding', (event) => {
      if (!$('#onboarding').is(':visible')) return;
      if (event.key === 'Tab') return trapFocus(event);
      // A first run has no Escape: closing the guide there is a decision, not a reflex.
      if (event.key !== 'Escape' || isFirstRunSession || persistRunning) return;
      event.preventDefault();
      skip();
    });

    setTimeout(() => show(false), 600);
  });
})(window.jQuery, window, document);
