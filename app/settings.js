'use strict';

const appPath = __dirname;
const path = require('path');
const ini = require('./util/ini');
const fs = require('fs');
const os = require('os');
const aes = require(path.join(appPath, 'util/aes.js'));
const uiLanguages = require(path.join(appPath, 'locale/uiLanguages.js'));
const controllerLabels = require(path.join(appPath, 'util/controllerLabels.js'));
const themeLayers = require(path.join(appPath, 'util/themeLayers.js'));
const libraryLayout = require(path.join(appPath, 'util/libraryLayout.js'));
const libraryChrome = require(path.join(appPath, 'util/libraryChrome.js'));

function normalizeControllerBindingSetting(value, allowedButtons, fallback) {
  const parsed = controllerLabels.normalizeControllerBinding(value, {
    allowSingle: true,
    maxButtons: 3,
    allowedButtons,
  });
  const rawParts = String(value || '').split('+').filter(Boolean);
  const strict = rawParts.every((part) => {
    const name = controllerLabels.normalizeButtonName(part);
    return name && allowedButtons.includes(name);
  });
  return parsed && parsed.length && strict ? parsed.join('+') : fallback;
}

let filename;
module.exports.setUserDataPath = (p) => {
  if (p) filename = path.join(p, 'cfg/options.ini');
};

/*
  Every section this file reads. options.ini is documented as hand-editable, and a file missing one
  of them (an edit gone wrong, a half-written file, a config from a build that predates a section)
  used to throw on the first `options.<section>.<key>` read. That threw straight into the catch
  below, which replaces the WHOLE config with defaults and writes it back - so one missing header
  silently reset the theme, the Steam account, the sources and the onboarding flag, and destroyed
  the original. A missing section is now an empty one, and only its own keys fall back to defaults.
*/
const SECTIONS = [
  'general',
  'achievement',
  'achievement_source',
  'overlay',
  'notification',
  'notification_toast',
  'notification_transport',
  'notification_advanced',
  'emulator',
  'controller',
  'souvenir',
  'action',
  'steam',
];

function ensureSections(options) {
  for (const name of SECTIONS) {
    const section = options[name];
    if (!section || typeof section !== 'object' || Array.isArray(section)) options[name] = {};
  }
  return options;
}

/*
  Same temp-then-rename as util/librarySnapshot.js. A crash or a full disk during a plain
  writeFileSync leaves a truncated options.ini behind, which is exactly the missing-section file
  ensureSections() has to cope with on the next launch; renaming a complete file into place cannot
  produce one.
*/
function writeOptionsFile(options) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, ini.stringify(options), 'utf8');
    fs.renameSync(temporary, filename);
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
  }
}

module.exports.load = () => {
  let options;
  try {
    options = ensureSections(ini.parse(fs.readFileSync(filename, 'utf8')));

    // Steam schemas are fully keyless now. Do not keep a removed credential alive in memory or
    // write it back the next time another setting is saved.
    delete options.steam.apiKey;

    if (!uiLanguages.has(options.achievement.lang)) {
      try {
        let locale = navigator.language || navigator.userLanguage || 'en';
        options.achievement.lang = uiLanguages.bestForLocale(locale).api;
      } catch (err) {
        options.achievement.lang = 'english';
      }
    }

    if (typeof options.username !== 'string' && typeof options.general.username !== 'string') {
      options.general.username = options.username || options.general.username || os.userInfo().username || 'User';
    }

    if (typeof options.general.skippedVersion !== 'string') {
      options.general.skippedVersion = 'none';
    }

    // Postpone stores version + deadline, so it expires on its own and never hides a newer release.
    if (typeof options.general.updatePostponedVersion !== 'string') {
      options.general.updatePostponedVersion = '';
    }
    if (typeof options.general.updatePostponedUntil !== 'number' || !Number.isFinite(options.general.updatePostponedUntil)) {
      options.general.updatePostponedUntil = Number(options.general.updatePostponedUntil) || 0;
    }

    if (typeof options.general.onboardingCompleted !== 'boolean') {
      // Reaching this branch means a settings file already existed. Treat it as an upgraded
      // profile; only the missing-file defaults below should launch first-run onboarding.
      options.general.onboardingCompleted = true;
    }
    // interfaceMode controls UI scope only (util/interfaceMode.js). Upgraded profiles default to
    // 'advanced' so existing tabs don't vanish; profiles still onboarding get '' to force a choice.
    if (options.general.interfaceMode !== 'simple' && options.general.interfaceMode !== 'advanced') {
      options.general.interfaceMode = options.general.onboardingCompleted === true ? 'advanced' : '';
    }
    if (typeof options.general.startWithWindows !== 'boolean') {
      options.general.startWithWindows = true;
    }
    if (typeof options.general.disableHardwareAccel !== 'boolean') {
      options.general.disableHardwareAccel = false;
    }
    if (typeof options.general.closeToTray !== 'boolean') {
      options.general.closeToTray = true;
    }
    // Right-click uninstall menu on game tiles (Settings > General). Default ON: discoverable out
    // of the box, and every action still asks for confirmation.
    if (typeof options.general.uninstallContextMenu !== 'boolean') {
      options.general.uninstallContextMenu = true;
    }
    // Theme values: built-in ids, 'custom', 'user:<name>' or 'pack:<name>' (all must validate here,
    // or an imported/pack theme silently reverts on reload). Not disk-checked: this runs on every
    // load, and the theme layer already falls back safely on a bad value.
    if (
      typeof options.general.theme !== 'string' ||
      (!Object.keys(themeLayers.BUILTIN_COLORS).includes(options.general.theme) &&
        options.general.theme !== 'custom' &&
        !/^user:.+$/i.test(options.general.theme) &&
        !/^pack:.+$/i.test(options.general.theme))
    ) {
      options.general.theme = 'default';
    }

    // overlay = the in-game achievement overlay (Ctrl+Shift+K). Configs saved under the old
    // buggy default (Ctrl+Shift+O) are migrated back to K here.
    if (typeof options.overlay.hotkey !== 'string') {
      options.overlay.hotkey = 'Ctrl+Shift+K';
    } else if (options.overlay.hotkey === 'Ctrl+Shift+O') {
      options.overlay.hotkey = 'Ctrl+Shift+K';
    }
    // Overlay notification preset. A saved name that no longer matches one is NOT rewritten here:
    // resolvePresetFolder() remaps a removed bundled preset only after checking for a user preset.
    if (typeof options.overlay.notificationPreset !== 'string') {
      options.overlay.notificationPreset = 'AW Next';
    }
    // Optional per-type preset overrides ('' = use notificationPreset): rare unlocks (≤10%) and
    // the platinum/100% popup can each render with their own preset (e.g. Xbox Series Rare/Platinum).
    if (typeof options.overlay.notificationPresetXenia !== 'string') {
      options.overlay.notificationPresetXenia = '';
    }
    if (typeof options.overlay.notificationPresetRpcs3 !== 'string') {
      options.overlay.notificationPresetRpcs3 = '';
    }
    if (typeof options.overlay.notificationPresetShadps4 !== 'string') {
      options.overlay.notificationPresetShadps4 = '';
    }
    if (typeof options.overlay.notificationPosition !== 'string') {
      options.overlay.notificationPosition = 'center-bottom';
    }
    // INI values come back as strings (only booleans are type-coerced), so numbers must go through
    // Number() before validating, or a typeof check would reset a valid value on every reload.
    {
      const scl = Number(options.overlay.notificationScale);
      options.overlay.notificationScale = Number.isFinite(scl) && scl > 0 ? scl : 1;
    }
    if (typeof options.overlay.notificationSound !== 'string') {
      options.overlay.notificationSound = '';
    }
    // Randomize the overlay notification sound from the merged bundled+user sound list.
    if (typeof options.overlay.randomSound !== 'boolean') {
      options.overlay.randomSound = false;
    }
    // Notification sound volume (percent, 0–200). Overlay audio can boost above 100%; the
    // PowerShell player used for custom toast sounds clamps that part to 100%.
    {
      const vol = Number(options.overlay.notificationVolume);
      options.overlay.notificationVolume = Number.isFinite(vol) ? Math.max(0, Math.min(200, vol)) : 100;
    }
    // Overlay-notification on-screen duration: 'auto' (preset self-closes) or a number of seconds (force-close cap).
    {
      const dur = Number(options.overlay.notificationDuration);
      options.overlay.notificationDuration = Number.isFinite(dur) && dur > 0 ? dur : 'auto';
    }
    delete options.overlay.position;
    delete options.overlay.progressPosition;
    delete options.overlay.playtimePosition;
    delete options.overlay.preset;
    delete options.overlay.scale;
    delete options.overlay.duration;

    // Native controller → overlay control (Tier 4). Opt-in: loads the koffi/HID stack in the Watchdog
    // only when enabled. Bindings are stored as "BUTTON+BUTTON+BUTTON" strings the watchdog parses.
    if (!options.controller || typeof options.controller !== 'object') options.controller = {};
    if (typeof options.controller.enabled !== 'boolean') {
      options.controller.enabled = false;
    }
    if (typeof options.controller.appNavigation !== 'boolean') {
      options.controller.appNavigation = true;
    }
    if (!['auto', 'xinput', 'gameinput'].includes(options.controller.backend)) {
      options.controller.backend = 'auto';
    }
    options.controller.layout = controllerLabels.normalizeControllerLayout(options.controller.layout);
    options.controller.toggleBinding = normalizeControllerBindingSetting(
      options.controller.toggleBinding,
      controllerLabels.TOGGLE_ALLOWED,
      'BACK+START+LEFT_SHOULDER'
    );
    options.controller.uiModeBinding = normalizeControllerBindingSetting(
      options.controller.uiModeBinding,
      controllerLabels.MODE_ALLOWED,
      'LEFT_SHOULDER+X'
    );
    options.controller.controlModeBinding = normalizeControllerBindingSetting(
      options.controller.controlModeBinding,
      controllerLabels.MODE_ALLOWED,
      'LEFT_SHOULDER+RIGHT_SHOULDER'
    );
    delete options.controller.windowModeBinding;
    if (typeof options.controller.focusOverlay !== 'boolean') {
      options.controller.focusOverlay = false;
    }
    if (typeof options.controller.sendEscapeOnControllerOpen !== 'boolean') {
      options.controller.sendEscapeOnControllerOpen = false;
    }
    if (typeof options.controller.debugLogging !== 'boolean') {
      options.controller.debugLogging = false;
    }

    options.achievement.libraryLayout = libraryLayout.normalize(
      options.achievement.libraryLayout,
      options.achievement.thumbnailPortrait === true
    );
    // Keep the legacy flag synchronized for cover selection paths shared with older configs.
    options.achievement.thumbnailPortrait = libraryLayout.isPortrait(options.achievement.libraryLayout);

    /*
      Library customization (issue #56): how big a tile is, how tight the grid around it is, and
      which pieces of chrome on it are drawn. Clamped rather than rejected, so a
      hand-edited options.ini can only ever be out of range, never break the layout.
    */
    options.achievement.libraryTileScale = libraryChrome.normalizeTileScale(options.achievement.libraryTileScale);
    options.achievement.libraryDensity = libraryChrome.normalizeDensity(options.achievement.libraryDensity);
    for (const toggle of libraryChrome.TOGGLES) {
      if (typeof options.achievement[toggle.key] !== 'boolean') options.achievement[toggle.key] = true;
    }

    if (typeof options.achievement.showHidden !== 'boolean') {
      options.achievement.showHidden = false;
    }

    if (typeof options.achievement.mergeDuplicate !== 'boolean') {
      options.achievement.mergeDuplicate = true;
    }

    if (typeof options.achievement.timeMergeRecentFirst !== 'boolean') {
      options.achievement.timeMergeRecentFirst = false;
    }

    if (typeof options.achievement.hideZero !== 'boolean') {
      options.achievement.hideZero = false;
    }
    if (typeof options.achievement.goldbergDownloadIcons !== 'boolean') {
      options.achievement.goldbergDownloadIcons = false;
    }

    if (options.achievement_source.legitSteam != 0 && options.achievement_source.legitSteam != 1 && options.achievement_source.legitSteam != 2) {
      options.achievement_source.legitSteam = 0;
    }

    if (typeof options.achievement_source.steamEmu !== 'boolean') {
      options.achievement_source.steamEmu = true;
    }

    if (typeof options.achievement_source.socialClub !== 'boolean') {
      options.achievement_source.socialClub = true;
    }

    if (typeof options.achievement_source.greenLuma !== 'boolean') {
      options.achievement_source.greenLuma = true;
    }

    if (typeof options.achievement_source.rpcs3 !== 'boolean') {
      options.achievement_source.rpcs3 = true;
    }

    if (typeof options.achievement_source.shadps4 !== 'boolean') {
      options.achievement_source.shadps4 = true;
    }

    if (typeof options.achievement_source.xenia !== 'boolean') {
      options.achievement_source.xenia = true;
    }

    if (typeof options.achievement_source.xlln !== 'boolean') {
      options.achievement_source.xlln = true;
    }

    if (typeof options.achievement_source.lumaPlay !== 'boolean') {
      options.achievement_source.lumaPlay = true;
    }

    if (typeof options.achievement_source.gog !== 'boolean') {
      options.achievement_source.gog = true;
    }

    if (typeof options.achievement_source.gogOfficial !== 'boolean') {
      options.achievement_source.gogOfficial = true;
    }

    if (typeof options.achievement_source.ubisoftOfficial !== 'boolean') {
      options.achievement_source.ubisoftOfficial = true;
    }

    if (typeof options.achievement_source.epic !== 'boolean') {
      options.achievement_source.epic = true;
    }

    // Was an on/off switch before it could tell an installed game from one the account owns. On
    // meant every installed Epic game, which is what "installed" is now.
    if (typeof options.achievement_source.epicOfficial === 'boolean') {
      options.achievement_source.epicOfficial = options.achievement_source.epicOfficial ? 2 : 0;
    }
    if (
      options.achievement_source.epicOfficial != 0 &&
      options.achievement_source.epicOfficial != 1 &&
      options.achievement_source.epicOfficial != 2
    ) {
      options.achievement_source.epicOfficial = 2;
    }

    if (typeof options.achievement_source.ea !== 'boolean') {
      options.achievement_source.ea = true;
    }

    // Was an on/off switch before it could tell an installed game from one the account merely owns.
    // On meant everything that was imported, which is what "owned" is now.
    if (typeof options.achievement_source.xboxPc === 'boolean') {
      options.achievement_source.xboxPc = options.achievement_source.xboxPc ? 2 : 0;
    }
    if (options.achievement_source.xboxPc != 0 && options.achievement_source.xboxPc != 1 && options.achievement_source.xboxPc != 2) {
      options.achievement_source.xboxPc = 2;
    }

    if (typeof options.achievement_source.importCache !== 'boolean') {
      options.achievement_source.importCache = true;
    }

    //Emulator (GBE Fork setup) - new section, may be absent in older configs.
    if (!options.emulator || typeof options.emulator !== 'object') options.emulator = {};
    if (typeof options.emulator.autoApplyNewGames !== 'boolean') {
      // Migrate the short-lived General-tab key; installs without either key default to OFF - the
      // automatic full setup (DLL swap) is opt-in, so AW never touches game files unprompted.
      options.emulator.autoApplyNewGames =
        typeof options.achievement.autoApplyNewGames === 'boolean' ? options.achievement.autoApplyNewGames : false;
    }
    // ColdClient was removed: AW always applies the emulator standalone (DLL swap). Normalize any
    // stale stored 'coldclient' value back to the single supported mode.
    options.emulator.mode = 'regular';
    if (typeof options.emulator.steamlessAutoUnpack !== 'boolean') options.emulator.steamlessAutoUnpack = false;
    if (typeof options.emulator.steamlessExperimental !== 'boolean') options.emulator.steamlessExperimental = false;
    if (typeof options.emulator.autoApplyCrackFix !== 'boolean') options.emulator.autoApplyCrackFix = false;
    // Whether the antivirus notice for automatic repair has been given. Absent means it has not:
    // configs that turned the setting on before the notice existed get it once, from the scan.
    if (typeof options.emulator.autoApplyNotice !== 'boolean') options.emulator.autoApplyNotice = false;
    if (options.emulator.steamSettingsMode !== 'simple' && options.emulator.steamSettingsMode !== 'advanced') options.emulator.steamSettingsMode = 'simple';
    if (typeof options.emulator.createLaunchBat !== 'boolean') options.emulator.createLaunchBat = true;
    if (typeof options.emulator.apiCheckBypass !== 'boolean') options.emulator.apiCheckBypass = false;
    if (typeof options.emulator.checkUpdates !== 'boolean') options.emulator.checkUpdates = true;
    if (options.emulator.login !== 'anonymous' && options.emulator.login !== 'steam') options.emulator.login = 'anonymous';
    if (typeof options.emulator.loginAccountName !== 'string') options.emulator.loginAccountName = '';
    if (typeof options.emulator.loginPassword !== 'string') options.emulator.loginPassword = '';
    if (typeof options.emulator.steamId !== 'string') options.emulator.steamId = '';
    if (typeof options.emulator.uplayUsername !== 'string') options.emulator.uplayUsername = '';
    const uplayLanguages = new Set([
      'auto', 'en-US', 'fr-FR', 'de-DE', 'es-ES', 'es-MX', 'it-IT', 'pt-BR', 'pt-PT', 'pl-PL',
      'ru-RU', 'ja-JP', 'zh-CN', 'zh-TW', 'ko-KR', 'th-TH',
    ]);
    if (!uplayLanguages.has(options.emulator.uplayLanguage)) options.emulator.uplayLanguage = 'auto';
    if (typeof options.emulator.uplayLogging !== 'boolean') options.emulator.uplayLogging = true;

    if (typeof options.notification.notify !== 'boolean') {
      options.notification.notify = true;
    }

    if (typeof options.notification.rumble !== 'boolean') {
      options.notification.rumble = true;
    }

    if (typeof options.notification.notifyOnProgress !== 'boolean') {
      options.notification.notifyOnProgress = true;
    }

    if (typeof options.notification.playtime !== 'boolean') {
      // Enable playtime on a new profile without changing the preference of upgraded profiles.
      options.notification.playtime = options.general.onboardingCompleted !== true;
    }

    if (typeof options.notification.platinum !== 'boolean') {
      options.notification.platinum = true;
    }

    if (
      options.notification_toast.customToastAudio != '0' &&
      options.notification_toast.customToastAudio != '1' &&
      options.notification_toast.customToastAudio != '2'
    ) {
      options.notification_toast.customToastAudio = '1';
    }
    delete options.notification_toast.toastSouvenir; // souvenir feature removed

    if (typeof options.notification_toast.groupToast !== 'boolean') {
      options.notification_toast.groupToast = false;
    }

    if (typeof options.notification_toast.urgent !== 'boolean') {
      options.notification_toast.urgent = false;
    }

    // Drop legacy display-transport flags. `mode` is intentionally NOT dropped: it is the
    // notification delivery mode, persisted and validated a few lines below.
    delete options.notification_transport.chromium;
    delete options.notification_transport.toast;
    delete options.notification_transport.gntp;

    // WinRT (faster native toast) and balloon (toast fallback) are internal auto-details of the
    // toast path - not surfaced in the UI but still honored by the toaster.
    if (typeof options.notification_transport.winRT !== 'boolean') {
      options.notification_transport.winRT = true;
    }

    if (typeof options.notification_transport.balloon !== 'boolean') {
      options.notification_transport.balloon = true;
    }

    // Websocket broadcast to external clients - independent of the chosen display mode.
    if (typeof options.notification_transport.websocket !== 'boolean') {
      options.notification_transport.websocket = true;
    }

    // Delivery mode: 'auto' (Watchdog picks per event, see watchdog/notification/transportPolicy.js),
    // 'toast', 'overlay', or 'both'. A saved choice is never rewritten, only unset/corrupt defaults to 'auto'.
    if (!['auto', 'toast', 'overlay', 'both'].includes(options.notification_transport.mode)) {
      options.notification_transport.mode = 'auto';
    }
    delete options.notification_transport.overlay;

    if (isNaN(options.notification_advanced.timeTreshold)) {
      options.notification_advanced.timeTreshold = 10;
    }

    if (isNaN(options.notification_advanced.tick)) {
      options.notification_advanced.tick = 600;
    }

    if (typeof options.notification_advanced.checkIfProcessIsRunning !== 'boolean') {
      options.notification_advanced.checkIfProcessIsRunning = true;
    }

    if (typeof options.notification_advanced.iconPrefetch !== 'boolean') {
      options.notification_advanced.iconPrefetch = true;
    }

    if (typeof options.steam.main !== 'string') {
      options.steam.main = '0';
    }

    //Souvenir - drop the stale flat keys (OBS video stays removed); keep the simple screenshot section.
    delete options.souvenir_screenshot;
    delete options.souvenir_video;
    if (!options.souvenir || typeof options.souvenir !== 'object') options.souvenir = {};
    if (typeof options.souvenir.screenshot !== 'boolean') options.souvenir.screenshot = false;
    if (typeof options.souvenir.dir !== 'string') options.souvenir.dir = '';
    if (options.souvenir.hdr !== 'auto' && options.souvenir.hdr !== 'off') options.souvenir.hdr = 'auto';
    delete options.souvenir.combineNotif; // simplified: capture always includes whatever is on screen

    if (typeof options.action.target !== 'string') {
      options.action.target = '';
    }

    if (typeof options.action.cwd !== 'string') {
      options.action.cwd = '';
    }

    if (typeof options.action.hide !== 'boolean') {
      options.action.hide = true;
    }

    // Emulator Steam-login password - AES-encrypted on disk.
    if (options.emulator && typeof options.emulator.loginPassword === 'string' && options.emulator.loginPassword.includes(':')) {
      try {
        options.emulator.loginPassword = aes.decrypt(options.emulator.loginPassword);
      } catch {
        options.emulator.loginPassword = '';
      }
    }

  } catch (err) {
    console.log(`failed to load settings: ${err}`);
    // Everything below replaces the user's whole configuration with defaults. Keep whatever was
    // there as options.ini.bak first: it is the only copy, and a file this code could not read is
    // still one a person can.
    try {
      if (filename && fs.existsSync(filename)) fs.copyFileSync(filename, `${filename}.bak`);
    } catch {}
    options = {
      general: {
        username: os.userInfo().username || 'User',
        skippedVersion: 'none',
        updatePostponedVersion: '',
        updatePostponedUntil: 0,
        onboardingCompleted: false,
        interfaceMode: '', // '' until onboarding asks; 'simple' | 'advanced' afterwards
        startWithWindows: true,
        disableHardwareAccel: false,
        closeToTray: true,
        uninstallContextMenu: true,
        theme: 'default',
      },
      overlay: {
        hotkey: 'Ctrl+Shift+K',
        notificationPreset: 'AW Next',
        notificationPresetXenia: '',
        notificationPresetRpcs3: '',
        notificationPresetShadps4: '',
        notificationPosition: 'center-bottom',
        notificationScale: 1,
        notificationSound: '',
        randomSound: false,
        notificationVolume: 100,
        notificationDuration: 'auto',
      },
      achievement: {
        libraryLayout: 'default',
        libraryTileScale: 1,
        libraryDensity: 1,
        libraryShowTitle: true,
        libraryShowProgress: true,
        libraryShowSource: true,
        libraryShowHealth: true,
        libraryShowAchievementButton: true,
        libraryShowConfigButton: true,
        thumbnailPortrait: false,
        showHidden: false,
        mergeDuplicate: true,
        timeMergeRecentFirst: false,
        hideZero: false,
        showPlayButton: true,
        goldbergDownloadIcons: false,
      },
      achievement_source: {
        legitSteam: 0,
        steamEmu: true,
        socialClub: true,
        greenLuma: true,
        rpcs3: true,
        shadps4: true,
        xenia: true,
        xlln: true,
        lumaPlay: true,
        gog: true,
        gogOfficial: true,
        ubisoftOfficial: true,
        epic: true,
        epicOfficial: 2,
        ea: true,
        xboxPc: 2,
        importCache: true,
      },
      emulator: {
        autoApplyNewGames: false, // opt-in: one-shot full setup for newly detected unconfigured emulated games (off = never touch game files unprompted)
        mode: 'regular', // standalone DLL swap - the only mode (ColdClient was removed)
        steamlessAutoUnpack: false, // run Steamless on the game exe before patching
        steamlessExperimental: false, // pass --realign for heavily-protected exes
        autoApplyCrackFix: false, // opt-in: try a confident CrakFiles community-crack match (confident name only, backed-up, idempotent) - off by default since it downloads/overwrites game files
        autoApplyNotice: false, // whether the antivirus notice for automatic repair has been given
        steamSettingsMode: 'simple', // 'simple' (AW fetch: DLC + achievements) | 'advanced' (generate_emu_config: + depots/languages)
        createLaunchBat: true, // legacy, unused (ColdClient removed) - kept so saved configs round-trip
        apiCheckBypass: false, // opt-in: drop SteamAutoCrack's Steam API ownership-check bypass proxy (winmm.dll) for games that re-check the original DLL/exe after the swap
        checkUpdates: true, // force a same-day GBE Fork release re-check before applying
        login: 'anonymous', // 'anonymous' | 'steam' (generate_emu_config richer data - throwaway account!)
        loginAccountName: '', // optional Steam login username (throwaway account)
        loginPassword: '', // optional Steam login password - AES-encrypted on disk
        steamId: '', // optional account_steamid override for configs.user.ini ('' = let GBE pick)
        uplayUsername: '', // optional Uplay R2 Username override ('' = use the general username)
        uplayLanguage: 'auto', // 'auto' follows the achievement language, otherwise a loader locale code
        // On by default: the loader's log is the only record of which objective a game asked to
        // unlock, which Game health needs. It grows fast (17 KB/s measured), so repair() caps the file.
        uplayLogging: true,
      },
      notification: {
        notify: true,
        rumble: true,
        notifyOnProgress: true,
        playtime: true,
        platinum: true,
      },
      notification_toast: {
        customToastAudio: '1',
        groupToast: false,
        urgent: false,
      },
      notification_transport: {
        winRT: true,
        balloon: true,
        websocket: true,
        mode: 'auto',
      },
      notification_advanced: {
        timeTreshold: 10,
        tick: 600,
        checkIfProcessIsRunning: true,
        iconPrefetch: true,
      },
      controller: {
        enabled: false,
        appNavigation: true,
        backend: 'auto',
        layout: 'auto',
        toggleBinding: 'BACK+START+LEFT_SHOULDER',
        uiModeBinding: 'LEFT_SHOULDER+X',
        controlModeBinding: 'LEFT_SHOULDER+RIGHT_SHOULDER',
        focusOverlay: false,
        sendEscapeOnControllerOpen: false,
        debugLogging: false,
      },
      souvenir: {
        screenshot: false,
        dir: '',
        hdr: 'auto',
      },
      action: {
        target: '',
        cwd: '',
        hide: true,
      },
      steam: { main: '0' },
    };

    try {
      let locale = navigator.language || navigator.userLanguage || 'en';
      options.achievement.lang = uiLanguages.bestForLocale(locale).api;
    } catch (err) {
      options.achievement.lang = 'english';
    }
    writeOptionsFile(options);
  }

  return options;
};

/*
  Keys under [general] that only the main process ever writes: which update was skipped, and until
  when one was postponed. The renderer holds its own copy of the settings for the whole session and
  saves it whole, so without this a later save of any unrelated setting wrote back the stale values
  it had loaded and silently undid "skip this version". The main process passes
  { keepMainOwnedKeys: false } when it is the one changing them.
*/
const MAIN_OWNED_GENERAL_KEYS = ['skippedVersion', 'updatePostponedVersion', 'updatePostponedUntil'];

function carryMainOwnedKeys(options) {
  let onDisk;
  try {
    onDisk = ini.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    return; // no file yet, or unreadable: there is nothing to preserve
  }
  const stored = (onDisk && onDisk.general) || {};
  if (!options.general) options.general = {};
  for (const key of MAIN_OWNED_GENERAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) options.general[key] = stored[key];
    else delete options.general[key];
  }
}

module.exports.MAIN_OWNED_GENERAL_KEYS = MAIN_OWNED_GENERAL_KEYS;

module.exports.save = (config, { keepMainOwnedKeys = true } = {}) => {
  return new Promise((resolve, reject) => {
    let options;
    try {
      options = JSON.parse(JSON.stringify(config)); // deep copy: mutations below must not touch the caller's object.
      if (keepMainOwnedKeys) carryMainOwnedKeys(options);

      // Encrypt the emulator Steam-login password before it touches disk (kept plaintext in memory).
      if (options.emulator && typeof options.emulator.loginPassword === 'string' && options.emulator.loginPassword.length > 0) {
        options.emulator.loginPassword = aes.encrypt(config.emulator.loginPassword);
      }

      if (!options.steam) options.steam = {};
      delete options.steam.apiKey;

    } catch (err) {
      return reject(err);
    }
    writeOptionsFile(options);
    // Tell the main process to reload its cached config (loaded once at startup, kept in memory
    // otherwise). Also require()d by the main process itself, where ipcRenderer is absent, so guard it.
    try {
      const { ipcRenderer } = require('electron');
      if (ipcRenderer) ipcRenderer.send('config-saved');
    } catch {}
    return resolve();
  });
};
