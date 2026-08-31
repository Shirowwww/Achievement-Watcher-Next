'use strict';

/*
  The Game Health panel of the game screen, lifted out of app.js so that file holds the library and
  the game screen and nothing else. This is a classic page script like the rest of ui/: it shares
  one global lexical scope with app.js, so the helpers below stay reachable by name from the click
  handlers there, and `path`, `appPath`, `remote`, `debug`, `gameList` and `t` come from the scripts
  the page loads first. Everything that decides a state, an explanation or an action still lives in
  util/gameHealth.js, where it can be tested without a window.
*/

// The per-game report behind the tools button. Signal collection lives here (needs the renderer's
// game list, config, userData paths); every state/explanation/action decision is in util/gameHealth.js so it can be tested headless.
const gameHealth = require(path.join(appPath, 'util/gameHealth.js'));
const gameHealthRepair = require(path.join(appPath, 'util/gameHealthRepair.js'));
// Libraries whose unlocks come from the platform itself. Their watchdog watcher polls the account,
// so none of the process-tracking or Steam-emulator reasoning applies to them.
const OFFICIAL_PLATFORM_SOURCES = /^(?:steam\s*\(|gog(?:\s|$)|gog galaxy|epic(?:-official)?$|ea$|ubisoft connect|xbox)/i;
function isOfficialPlatformSource(source) {
  return OFFICIAL_PLATFORM_SOURCES.test(String(source || '').trim());
}

// Tab labels re-applied on every open, not once at startup: the panel outlives a language change,
// and locale/loader.js doesn't know about these tabs, so a one-shot binding would freeze them.
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

// Everything Game Health reasons about, read once per panel open. Anything unavailable stays absent
// rather than guessed at, since deriveHealth() reports only on the signals it is given.
async function collectGameHealthSignals(appid) {
  const game = gameList.find((g) => g.appid == appid) || {};
  let cfg = { exe: '', args: '' };
  try {
    cfg = (await exeList.get(appid)) || cfg;
  } catch (err) {
    debug.log(`[health] exeList lookup failed for ${appid} => ${formatErr(err)}`);
  }

  // steam.js stamps this on the cached schema every time it re-reads the list from Steam.
  const achievementsCheckedAt = Number(game.descBackfilledAt) || 0;
  const exe = cfg.exe || (game.exeConfident ? game.exe : '') || '';
  const exeExists = !!exe && fs.existsSync(exe);

  /*
    A known executable is a known install folder: the scan resolves gameDir from the library it
    found the game in, so a game only known through its emulator save folder (or one the user
    located by hand) had none, and every check below that needs the folder - the emulator setup,
    the Uplay layer, the crack loader - was skipped as if the game were not installed at all.
  */
  let gameDir = game.gameDir || '';
  let gameDirExists = !!gameDir && fs.existsSync(gameDir);
  if (!gameDirExists && exeExists) {
    const derived = await resolveGameDirFromExe(exe);
    if (derived) {
      gameDir = derived;
      gameDirExists = true;
      // Carried into the in-memory game as well: the repairs offered by this report, "Open the game
      // folder" and the appid fix all read game.gameDir, and would still act on nothing.
      game.gameDir = derived;
    }
  }
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

  // A repaired Uplay R1/R2 game writes unlocks to a GSE Saves folder AW Next picked itself, so that
  // save alone proves nothing about Goldberg unless a dual-layer repack has real evidence of its own.
  const usesUplayLayer = uplayR2.isUplayR2Game(game, appid);

  // A folder served by a known crack loader (ALI213, OnlineFix, TENOKE, SmartSteamEmu, ...) supplies
  // its own Steam emulation, so measuring it against Goldberg would misreport "no achievement list".
  const foreignLoader = gameDirExists ? crackLoaderDetect.detectWorkingCrackLoader(gameDir) : null;

  // Only diagnose a Goldberg/GBE setup when one is actually there: a steam_settings folder or a
  // replaced steam_api dll on disk, or a save already being read out of GSE/Goldberg.
  let goldbergReport = null;
  let emulated = false;
  if (!isConsole && !isUbisoft && !foreignLoader && gameDirExists) {
    try {
      const emu = goldberg.detectEmulator(gameDir);
      const hasSetupOnDisk = emu.type !== 'none' || !!emu.steamSettings || emu.dll.length > 0;
      if (hasSetupOnDisk || (readsGoldbergSave && !usesUplayLayer)) {
        emulated = true;
        goldbergReport = { ...goldberg.diagnose({ gameDir, appid: writableAppid, schema: game }), dllCount: emu.dll.length };
      }
    } catch (err) {
      debug.log(`[health] goldberg diagnose failed for ${appid} => ${formatErr(err)}`);
    }
  }

  let uplayReport = null;
  if (usesUplayLayer && gameDirExists) {
    try {
      // Undo, before anything is reported, a Ticket line an earlier AW Next build wrote into a
      // folder whose loader has no Ticket setting to read it from. It never did anything, and the
      // panel would otherwise show a warning and a button for a setting that was never real.
      if (uplayR2.removeUnsupportedTicket(gameDir)) debug.log(`[health] ${appid} removed a Ticket line this loader cannot read`);
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
    exeExists,
    achievements: { total: (game.achievement && game.achievement.total) || 0, unlocked: (game.achievement && game.achievement.unlocked) || 0 },
    emulated,
    achievementsCheckedAt,
    saveSources,
    goldberg: goldbergReport,
    uplay: uplayReport,
    // Which crack loader is already serving this game, if any: it decides whether a Uplay setup in
    // the same folder is broken or simply unused.
    crackLoader: foreignLoader ? { name: foreignLoader.name } : null,
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
      return t('gh-why-uplay-broken', 'The Ubisoft emulator setup for this game is incomplete, so unlocks are not being recorded. Use the Uplay R1/R2 repair button below.', "La configuration de l'émulateur Ubisoft de ce jeu est incomplète : les déblocages ne sont pas enregistrés. Utilise le bouton de réparation Uplay R1/R2 ci-dessous.", p);
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

// Simple mode: one plain outcome per check, in the words a player would use. No paths, no process
// names, no appid, no transport name - those are what Technical details is for.
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
      if (p.servedBy) return t('gh-simple-emulator-ok', 'Achievement support is set up', 'Prise en charge des succès configurée');
      // Offline achievements were just switched on and the game has not run since: say so, or the
      // row goes green with a "turn it off" button beside it and no word about why.
      if (p.ticket === 'pending') return t('gh-ticket-pending', 'Offline achievements on - launch the game once', 'Succès hors connexion activés, lance le jeu une fois');
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
      // Working, but not the way the setting alone suggests, so say which: "no overlay appeared"
      // reads as a fault otherwise. Comparison lives in gameHealth.js; Simple only picks the sentence.
      if (p.fallbackActive)
        return t('gh-simple-notifications-fallback', 'Working - Windows fallback active', 'Fonctionnel - repli Windows actif');
      return t('gh-simple-notifications-ok', 'Notifications working', 'Notifications opérationnelles');
    }
  }
}

// The emulator's display name: "gbe"/"goldberg" are internal ids that must never reach the UI, the
// product names stay identical in every language, and "no emulator" reuses the diagnosis translation.
function gameHealthEmulatorLabel(emulator, loader) {
  // The emulator that actually supplied the dll, when it could be named: "goldberg" is the shape of
  // an unconfigured setup, not a claim about who wrote it.
  if (loader) return String(loader);
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
    case 'session':
      return t('gh-issue-session', 'offline achievements', 'succès hors connexion');
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
      return gameHealthEmulatorLabel(p.emulator, p.loader);
    case 'uplay': {
      if (p.servedBy) {
        return t('gh-value-served-by', 'served by {emulator}', 'pris en charge par {emulator}', { emulator: p.servedBy });
      }
      const mapping = p.steamAppid
        ? t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
            appid: p.steamAppid,
            name: p.steamName || `Steam App ${p.steamAppid}`,
          })
        : '';
      const problems = p.topics && p.topics.length ? p.topics.map(gameHealthIssueTopicLabel).join(' · ') : '';
      const ticket =
        p.ticket === 'pending' ? t('gh-ticket-pending', 'Offline achievements on - launch the game once', 'Succès hors connexion activés, lance le jeu une fois') : '';
      return [mapping, problems, ticket].filter(Boolean).join(' · ') || gameHealthIssueTopicLabel('mapping');
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
      return t('gh-action-repair-uplay', 'Repair Ubisoft achievement support', 'Réparer la prise en charge des succès Ubisoft');
    case gameHealth.ACTION.REPAIR_UPLAY_TICKET:
      return t('gh-action-uplay-ticket', 'Enable achievements offline', 'Activer les succès hors connexion');
    case gameHealth.ACTION.REMOVE_UPLAY_TICKET:
      return t('gh-action-uplay-ticket-off', 'Turn offline achievements off', 'Désactiver les succès hors connexion');
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
  // The library dot shows this same state, so the tile behind the panel is corrected as it is drawn.
  const reportAppid = String(root.attr('data-appid') || '');
  if (reportAppid) rememberGameHealthState(reportAppid, report.state);

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

// The report is being (re)collected. Also used on its own while a repair waits for the library to
// be re-read: the panel has to look busy for that wait, not finished and wrong.
function showGameHealthChecking() {
  const root = $('#game-health');
  const chip = root.find('.gh-state').attr('data-state', 'loading');
  // Restore the spinner: a previous report for another game replaced it with its own state icon.
  chip.find('i').attr('class', 'fas fa-circle-notch fa-spin');
  chip.find('.gh-state-label').text(t('gh-loading', 'Checking…', 'Vérification…'));
  root.find('.gh-explanation').text('');
  root.find('.gh-checks').empty();
  root.find('.gh-actions').empty();
}

/*
  Repairs that wrote files also changed what the last library scan believes about this game: its
  achievement list, the folders its unlocks are read from, whether it counts as installed. The
  report re-reads the disk itself, but those come from the scan - which is why the panel used to
  need a manual refresh (F5) before it told the truth about a game it had just repaired. Actions
  that only flip a setting (mute, watch, test) change nothing the scan reported, and skip this.
*/
const GAME_HEALTH_ACTIONS_NEEDING_RESCAN = new Set([
  gameHealth.ACTION.REPAIR_DATA,
  gameHealth.ACTION.REPAIR_UPLAY,
  gameHealth.ACTION.REPAIR_UPLAY_TICKET,
  gameHealth.ACTION.REMOVE_UPLAY_TICKET,
  gameHealth.ACTION.INSTALL_RUNTIME,
  gameHealth.ACTION.FIX_APPID,
]);

async function refreshLibraryAfterGameHealthRepair() {
  try {
    await app.onStart();
  } catch (err) {
    // A scan that fails leaves the previous library in place; the report below is still worth
    // painting, so this must not become the error the user is shown for their repair.
    debug.error(`[health] the library could not be re-read after a repair => ${formatErr(err)}`);
  }
}

async function renderGameHealth(appid) {
  const root = $('#game-health');
  root.attr('data-appid', String(appid));
  const chip = root.find('.gh-state');
  showGameHealthChecking();
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

  /*
    Locate the game. The picker opens from here rather than by jumping to the Executable tab: the
    answer belongs to the report the user is looking at, and returning true re-runs that report
    with the executable - and the install folder derived from it - in place.
  */
  if (action === gameHealth.ACTION.CHOOSE_EXE) {
    return !!(await pickGameExecutable(appid));
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
      debug.error(`[health] Uplay R1/R2 repair failed for ${appid} => ${formatErr(err)}`);
      // An antivirus taking the loader is not a failure of the repair, and saying so sends the user
      // looking for a bug here instead of at the alert their antivirus just showed them.
      if (await reportEmulatorPackageBlocked(err, { retry: () => runGameHealthAction(appid, action, button) })) return false;
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('uplay-r2-install-failed', 'Uplay R1/R2 repair failed', 'Échec de la réparation Uplay R1/R2'),
        message: t('could-not-install-or-configure-goldberg-uplay-r2', 'Could not install or configure Goldberg Uplay R1/R2.', "Impossible d'installer ou de configurer Goldberg Uplay R1/R2."),
        detail: formatErr(err),
      });
      return false;
    }
  }

  /*
    Some Ubisoft titles only report achievements once they believe they are signed in, and the loader
    answers that question from one ini key it otherwise leaves empty. This writes it, and takes it
    back on a second press - it is one line either way, so a game it does not suit loses nothing.
  */
  if (action === gameHealth.ACTION.REPAIR_UPLAY_TICKET || action === gameHealth.ACTION.REMOVE_UPLAY_TICKET) {
    if (!game.gameDir || !fs.existsSync(game.gameDir)) return false;
    // What the panel offered, not what the folder happens to hold: the two are the same by
    // construction (deriveHealth picks the action from the key on disk), and following the button
    // is what guarantees the dialog says what the button said.
    const removing = action === gameHealth.ACTION.REMOVE_UPLAY_TICKET;
    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'question',
      title: removing
        ? t('gh-ticket-remove-title', 'Turn offline achievements back off?', 'Désactiver les succès hors connexion ?')
        : t('gh-ticket-confirm-title', 'Enable achievements offline?', 'Activer les succès hors connexion ?'),
      message: removing
        ? t('gh-ticket-remove-message', 'This game will believe it is signed out again, and stop recording achievements.', 'Ce jeu se croira de nouveau déconnecté et cessera d’enregistrer ses succès.')
        : t(
            'gh-ticket-confirm-message',
            'This game has never asked the emulator to unlock anything, which is how a title behaves when it thinks it is signed out.',
            'Ce jeu n’a jamais demandé de déblocage à l’émulateur, ce qui est le comportement d’un titre qui se croit déconnecté.'
          ),
      detail: removing
        ? t(
            'gh-ticket-remove-detail',
            'The line AW Next added to the emulator settings beside the game is removed, and nothing else changes. Achievements already recorded are kept. You can turn this back on at any time.',
            'La ligne ajoutée par AW Next aux réglages de l’émulateur à côté du jeu est retirée, et rien d’autre ne change. Les succès déjà enregistrés sont conservés. Tu peux la remettre quand tu veux.'
          )
        : t(
            'gh-ticket-confirm-detail',
            'One line is added to the emulator settings beside the game. It is a placeholder, not a real Ubisoft session: no account is involved and nothing is sent anywhere. Launch the game once, then check this panel again.',
            'Une ligne est ajoutée aux réglages de l’émulateur à côté du jeu. C’est une valeur de remplacement, pas une vraie session Ubisoft : aucun compte n’est utilisé et rien n’est envoyé nulle part. Lance le jeu une fois, puis reviens voir ce panneau.'
          ),
      buttons: [
        t('cancel', 'Cancel', 'Annuler'),
        removing
          ? t('gh-ticket-remove-confirm', 'Turn it off', 'Désactiver')
          : t('gh-action-uplay-ticket', 'Enable achievements offline', 'Activer les succès hors connexion'),
      ],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return false;

    try {
      const written = uplayR2.setSessionTicket({ dir: game.gameDir, enabled: !removing });
      debug.log(`[health] ${appid} session ticket ${removing ? 'removed' : 'written'} in ${written.files.length} file(s)`);
      return true;
    } catch (err) {
      debug.error(`[health] session ticket failed for ${appid} => ${formatErr(err)}`);
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'error',
        title: t('repair-failed', 'Repair failed', 'Échec de la réparation'),
        message: t('gh-action-failed', 'That repair could not be completed.', 'Cette réparation n’a pas pu être effectuée.'),
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
      cacheDir: path.join(getUserDataPath(), 'cache/gse_fork'),
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
