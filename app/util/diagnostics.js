'use strict';

/*
  The diagnostics.txt of a log export, gathered once at the Export click. Values are chosen by allow
  rules, never masked after the fact, so a setting added later stays out until someone judges it safe.
  Dependency-injected so the tests run without Electron.
*/

const nodeFs = require('fs');
const path = require('path');

const NETWORK_TIMEOUT_MS = 4000;
const JSON_CHECK_MAX_BYTES = 5 * 1024 * 1024;

// What a report needs reached: schemas, achievement icons, covers, rarity, artwork. GetServerInfo
// also answers with Steam's clock, which is what the clock section compares against.
const NETWORK_TARGETS = [
  { name: 'steam-api', url: 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/' },
  { name: 'steam-achievement-icons', url: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/480/winner.jpg' },
  { name: 'steam-store-art', url: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg' },
  { name: 'steam-fastly-art', url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/header.jpg' },
  { name: 'steamcommunity', url: 'https://steamcommunity.com/stats/480/achievements/' },
  { name: 'steamhunters', url: 'https://steamhunters.com/api/apps/480/achievements' },
  { name: 'steamgriddb', url: 'https://www.steamgriddb.com/' },
];

// Sections worth reading in a report. [general] carries the user name and [steam] a legacy key,
// so only their harmless keys pass the per-key rules below.
const SETTINGS_SECTIONS = [
  'general',
  'overlay',
  'achievement',
  'achievement_source',
  'emulator',
  'notification',
  'notification_toast',
  'notification_transport',
  'notification_advanced',
  'souvenir',
  'action',
  'controller',
];
// A hotkey is a key binding, not a credential, so "key" alone is matched only as an api key.
const SENSITIVE_KEY = /user|name|steamid|id$|^key$|api_?key|token|secret|pass|mail|path|dir|target|cwd|url|webhook/i;
const SAFE_STRING = /^[\w .,+#()-]{0,48}$/;
// Kept as "set" or "not set": that a launch action exists matters, where it points does not.
const PRESENCE_ONLY = { action: ['target'] };

// Files whose content is a credential: they are listed by size only, never opened.
const UNREAD_FILES = /secret|auth|token|\.key$/i;

function settingValue(key, value) {
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value !== 'string' || SENSITIVE_KEY.test(key)) return undefined;
  if (/^(true|false)$/i.test(value) || /^-?\d+(\.\d+)?$/.test(value)) return value;
  return SAFE_STRING.test(value) && !/[\\/:]/.test(value) ? value : '[hidden]';
}

function settingsSnapshot(config = {}) {
  const out = {};
  for (const section of SETTINGS_SECTIONS) {
    const values = config && config[section];
    if (!values || typeof values !== 'object') continue;
    const kept = {};
    for (const [key, value] of Object.entries(values)) {
      if ((PRESENCE_ONLY[section] || []).includes(key)) {
        kept[key] = value ? 'set' : 'not set';
        continue;
      }
      const safe = settingValue(key, value);
      if (safe !== undefined) kept[key] = safe;
    }
    out[section] = kept;
  }
  return out;
}

async function probeOne(target, { fetchImpl, timeoutMs, now }) {
  const started = now();
  try {
    const res = await fetchImpl(target.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    let serverTime = null;
    if (target.name === 'steam-api' && res.ok) {
      const body = await res.json().catch(() => null);
      serverTime = Number(body && body.servertime) || null;
    } else if (res.body && typeof res.body.cancel === 'function') {
      // Only the status matters: the body of an image or a page is left unread.
      await res.body.cancel().catch(() => {});
    }
    return { name: target.name, ok: res.ok, status: res.status, ms: now() - started, serverTime };
  } catch (err) {
    const cause = err && err.cause && err.cause.code;
    return { name: target.name, ok: false, status: 0, ms: now() - started, error: cause || (err && err.name) || String(err) };
  }
}

// All targets at once, so the whole probe costs one timeout at worst.
async function probeNetwork({ fetchImpl = globalThis.fetch, targets = NETWORK_TARGETS, timeoutMs = NETWORK_TIMEOUT_MS, now = Date.now } = {}) {
  if (typeof fetchImpl !== 'function') return [];
  return Promise.all(targets.map((target) => probeOne(target, { fetchImpl, timeoutMs, now })));
}

/*
  An unlock whose timestamp reads as too old is dropped without a toast, so a PC clock that drifts
  from Steam's looks exactly like "notifications never come". Steam's servertime is in seconds.
*/
function clockReport({ now = new Date(), steamServerTime = null, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offset) % 60).padStart(2, '0');
  return {
    utc: now.toISOString(),
    timeZone: timeZone || 'unknown',
    utcOffset: `${sign}${hh}:${mm}`,
    steamSkewSeconds: steamServerTime ? Math.round(now.getTime() / 1000 - steamServerTime) : 'not measured',
  };
}

function displaysReport(displays = [], primaryId = null) {
  return displays.map((display, index) => ({
    index,
    primary: display.id === primaryId,
    size: `${display.size.width}x${display.size.height}`,
    workArea: `${display.workArea.width}x${display.workArea.height} at ${display.workArea.x},${display.workArea.y}`,
    scale: display.scaleFactor,
    rotation: display.rotation || 0,
  }));
}

// Where the program runs from, as a kind rather than a path: an install under Program Files is the
// known cause of "won't launch", and a portable copy keeps its data somewhere else.
function installLocation(execPath = '', env = {}) {
  const key = String(execPath).toLowerCase();
  const under = (value) => value && key.startsWith(String(value).toLowerCase());
  if (under(env.ProgramFiles) || under(env['ProgramFiles(x86)'])) return 'program-files';
  if (under(env.LOCALAPPDATA)) return 'per-user';
  if (env.APPIMAGE) return 'appimage';
  return 'other';
}

function installReport({ execPath, env = {}, isPackaged, portable, openAtLogin, locale, registryBackend, watchdog } = {}) {
  return {
    packaged: !!isPackaged,
    portable: !!portable,
    location: installLocation(execPath, env),
    startsWithSystem: !!openAtLogin,
    locale: locale || 'unknown',
    // Inherited by the GUI it breaks the launch: the first thing to rule out on "nothing opens".
    electronRunAsNodeSet: !!env.ELECTRON_RUN_AS_NODE,
    registry: registryBackend || 'n/a',
    watchdog: watchdog || 'n/a',
  };
}

// Windows can mute toasts for every app or for this one, and neither shows anywhere in the app.
function windowsNotificationReport({ readInteger, aumid } = {}) {
  if (typeof readInteger !== 'function') return null;
  const read = (key, value) => {
    try {
      return readInteger('HKCU', key, value);
    } catch {
      return null;
    }
  };
  const describe = (value) => (value === 0 ? 'off' : value === null || value === undefined ? 'default (on)' : 'on');
  const base = 'Software\\Microsoft\\Windows\\CurrentVersion';
  return {
    toastsForAllApps: describe(read(`${base}\\PushNotifications`, 'ToastEnabled')),
    toastsForThisApp: aumid ? describe(read(`${base}\\Notifications\\Settings\\${aumid}`, 'Enabled')) : 'unknown',
  };
}

function fileEntry(fs, dir, name) {
  const full = path.join(dir, name);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const entry = { name, bytes: stat.size };
  if (UNREAD_FILES.test(name) || stat.size > JSON_CHECK_MAX_BYTES) return entry;
  if (/\.(json|db)$/i.test(name)) {
    try {
      const text = fs.readFileSync(full, 'utf8').trim();
      // Some .db stores are line-delimited: only a whole-document JSON file is judged here.
      if (/^[[{]/.test(text) && !/\n[[{]/.test(text)) JSON.parse(text);
      entry.parses = true;
    } catch {
      entry.parses = false;
    }
  }
  return entry;
}

function countEntries(fs, dir) {
  try {
    return fs.readdirSync(dir).length;
  } catch {
    return null;
  }
}

// cfg/ by name and size (a damaged store shows as parses: false), steam_cache/ by entry count, and
// the free space left, since a full disk breaks the caches and backups with no clear error.
function storageReport({ fs = nodeFs, userData } = {}) {
  if (!userData) return null;
  const cfgDir = path.join(userData, 'cfg');
  const cacheDir = path.join(userData, 'steam_cache');
  let cfgNames = [];
  let cacheNames = [];
  try {
    cfgNames = fs.readdirSync(cfgDir).sort();
  } catch {}
  try {
    cacheNames = fs.readdirSync(cacheDir).sort();
  } catch {}
  const cache = {};
  for (const name of cacheNames) {
    const count = countEntries(fs, path.join(cacheDir, name));
    if (count !== null) cache[name] = count;
  }
  let freeBytes = 'unknown';
  try {
    const stats = fs.statfsSync(userData);
    freeBytes = stats.bavail * stats.bsize;
  } catch {}
  return { freeBytes, cfg: cfgNames.map((name) => fileEntry(fs, cfgDir, name)).filter(Boolean), steamCacheEntries: cache };
}

function formatValue(value) {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// key: value lines under a [section] header, the shape about.txt already uses.
function formatDiagnostics(sections = {}) {
  const lines = [];
  for (const [title, body] of Object.entries(sections)) {
    if (body === null || body === undefined) continue;
    lines.push(`[${title}]`);
    if (Array.isArray(body)) {
      for (const item of body) lines.push(`  ${formatValue(item)}`);
    } else if (typeof body === 'object') {
      for (const [key, value] of Object.entries(body)) lines.push(`  ${key}: ${formatValue(value)}`);
    } else {
      lines.push(`  ${body}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  NETWORK_TARGETS,
  settingsSnapshot,
  probeNetwork,
  clockReport,
  displaysReport,
  installReport,
  installLocation,
  windowsNotificationReport,
  storageReport,
  formatDiagnostics,
};
