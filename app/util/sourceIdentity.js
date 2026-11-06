'use strict';

/*
  What a game's `source` label means, in one table: the library badge and icon, the store that
  owns it, the console it splits under, the emulator platform presets, sounds and Exophase follow,
  and where its rarity may come from. One row per label a parser or the Watchdog emits; a platform
  emitting two labels ('GOG Galaxy' and 'gog') has two rows, so each says exactly what it does.
  Loaded by the renderer, the main process and the Watchdog: it requires nothing.
*/

// A platform's badge and icon, shared by every label of it.
const PLAYSTATION = { family: 'playstation', icon: 'playstation.svg' };
const XBOX_CONSOLE = { family: 'xbox', icon: 'xbox.svg', brand: 'xbox' };
const UBISOFT = { family: 'ubisoft', icon: 'ubisoft.svg' };
// Labels that legitimately end on the Steam badge: Steam via an emulator or a crack, plus placeholders.
const STEAM = { family: 'steam' };

/*
  Fields: family (library badge), icon (file under Source/), purchased (store that owns the copy),
  console (profile panel split), platform (emulator presets, sounds, Exophase, Sony's trophy API),
  emulatorData (artwork and rarity come from the emulator's own data, keyed on the game's appid),
  rarity ('cache-only': never asked of Steam; 'library-seeded': the Watchdog only reads the sidecar),
  brand (console logo on the header icon), launchable (false: an account list, no PC executable).
*/
const SOURCE_ROWS = {
  'rpcs3 emulator': { ...PLAYSTATION, console: 'playstation-3', platform: 'rpcs3', emulatorData: true },
  'ps3 recomp': { ...PLAYSTATION, console: 'playstation-3', platform: 'rpcs3', emulatorData: true },
  'shadps4 emulator': { ...PLAYSTATION, console: 'playstation-4', platform: 'shadps4', emulatorData: true },
  // PC ports of PS4 games are the PS4 titles Exophase lists, under the PS4 emulator's platform.
  'ps4 recomp': { ...PLAYSTATION, console: 'playstation-4', platform: 'shadps4', emulatorData: true },
  'kytyps5 emulator': { ...PLAYSTATION, console: 'playstation-5', platform: 'kytyps5', emulatorData: true },
  'playstation network': { ...PLAYSTATION, rarity: 'cache-only', launchable: false },
  'xenia emulator': { ...XBOX_CONSOLE, console: 'xbox-360', platform: 'xenia', emulatorData: true },
  'xbox 360 recomp': { ...XBOX_CONSOLE, console: 'xbox-360', platform: 'xenia', emulatorData: true },
  xlivelessness: { ...XBOX_CONSOLE, emulatorData: true },
  'xbox pc': { family: 'xbox', icon: 'xbox.svg', purchased: 'xbox', rarity: 'cache-only' },
  // Short spellings the Watchdog and older index entries carry; they only name the platform.
  rpcs3: { platform: 'rpcs3' },
  shadps4: { platform: 'shadps4' },
  kytyps5: { platform: 'kytyps5' },
  kyty: { platform: 'kytyps5' },
  xenia: { platform: 'xenia' },
  epic: { family: 'epic', icon: 'epic.svg', rarity: 'library-seeded' },
  'epic-official': { family: 'epic', icon: 'epic.svg', purchased: 'epic', rarity: 'cache-only' },
  gog: { family: 'gog', icon: 'gog.svg', rarity: 'library-seeded' },
  'gog galaxy': { family: 'gog', icon: 'gog.svg', purchased: 'gog', rarity: 'cache-only' },
  'gog-official': { rarity: 'cache-only' },
  'goldberg socialclub': { family: 'socialclub', icon: 'socialclub.svg' },
  ea: { family: 'ea', icon: 'ea.svg', purchased: 'ea', rarity: 'cache-only' },
  'anadius (ea)': { family: 'ea', icon: 'ea.svg' },
  retroachievements: { family: 'retroachievements', icon: 'retroachievements.svg', rarity: 'cache-only', launchable: false },
  'pc port': { family: 'pcport', icon: 'pcport.svg', emulatorData: true },
  'ubisoft connect': { ...UBISOFT, purchased: 'ubisoft', rarity: 'cache-only' },
  uplay: { ...UBISOFT, purchased: 'ubisoft', rarity: 'cache-only' },
  lumaplay: { ...UBISOFT, rarity: 'cache-only' },
  'rune uplay': { ...UBISOFT, rarity: 'cache-only' },
  ubisoft: { ...UBISOFT, rarity: 'library-seeded' },
  markerpatch: { ...STEAM, emulatorData: true },
  madnesspatch: { ...STEAM, emulatorData: true },
  ...Object.fromEntries(
    [
      'achievement watcher : watchdog', 'ali213', 'catherine', 'codex', 'creamapi', 'empress', 'gbe fork', 'ff7 (2013)',
      'goldberg', 'goldberg steamemu', 'goldberg (empress)', 'greenluma', 'hoodlum', 'manual', 'onlinefix', 'razor1911',
      'reloaded - 3dm', 'rld!', 'rune', 'skidrow', 'smartsteamemu', 'steam', 'steam-emulator', 'tenoke', 'unconfigured',
      'universelan',
    ].map((label) => [label, STEAM])
  ),
};

// The trophy service each console's lists live under in Sony's trophy API.
const TROPHY_SERVICE_BY_PLATFORM = { rpcs3: 'trophy', shadps4: 'trophy', kytyps5: 'trophy2' };

// The user's own Steam library is labelled "Steam (<account>)".
const STEAM_ACCOUNT_LABEL = /^steam \(/;

const NO_ROW = Object.freeze({});

function rowOf(label) {
  const key = String(label == null ? '' : label).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SOURCE_ROWS, key) ? SOURCE_ROWS[key] : NO_ROW;
}

function isClassifiedSource(label) {
  return rowOf(label) !== NO_ROW;
}

// The library badge kind, or '' for the Steam badge (a Steam emulator, or a label nobody listed).
function libraryBadgeOf(label) {
  const family = rowOf(label).family || '';
  return family === 'steam' ? '' : family;
}

// The icon file under Source/, or '' for the default Steam one.
function sourceIconFile(label) {
  return rowOf(label).icon || '';
}

// The store a copy with this label was bought on, or '' when the label says nothing about owning it.
function purchasedPlatformOf(label) {
  if (STEAM_ACCOUNT_LABEL.test(String(label || '').trim().toLowerCase())) return 'steam';
  return rowOf(label).purchased || '';
}

const consoleGroupOf = (label) => rowOf(label).console || '';
const emulatorPlatformOf = (label) => rowOf(label).platform || null;
const trophyServiceOf = (label) => TROPHY_SERVICE_BY_PLATFORM[rowOf(label).platform] || '';
const readsEmulatorData = (label) => rowOf(label).emulatorData === true;
const rarityPolicyOf = (label) => rowOf(label).rarity || '';
const consoleBrandOf = (label) => rowOf(label).brand || '';
const isLaunchable = (label) => rowOf(label).launchable !== false;

module.exports = {
  isClassifiedSource,
  libraryBadgeOf,
  sourceIconFile,
  purchasedPlatformOf,
  consoleGroupOf,
  emulatorPlatformOf,
  trophyServiceOf,
  readsEmulatorData,
  rarityPolicyOf,
  consoleBrandOf,
  isLaunchable,
};
