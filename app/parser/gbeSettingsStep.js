'use strict';

/*
  Game Health's "Complete the emulator settings": the configuration half of what the old
  achievement-data repair wrote, now a step the user asks for on its own (#194, #196). It writes
  only the files the diagnosis names, fills only the keys the emulator gets no value for (local
  steam_settings, the save folder's settings or the global GSE Saves settings, see
  gbeEffectiveConfig), and keeps a game's own identity unless the user agrees to replace it.
*/

const fs = require('fs');
const path = require('path');
const goldberg = require(path.join(__dirname, 'goldberg.js'));
const gbeEffectiveConfig = require(path.join(__dirname, 'gbeEffectiveConfig.js'));
const awManagedConfig = require(path.join(__dirname, '..', 'util', 'awManagedConfig.js'));
const winHosts = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const { parseIni, readIniSectionValues } = require(path.join(__dirname, '..', 'util', 'emuIni.js'));

const MAIN_CODES = new Set(['NO_MAIN_CONFIG', 'NO_NEW_APP_TICKET', 'NO_GC_TOKEN', 'UNKNOWN_STATS_REJECTED']);
const DLC_CODES = new Set(['NO_DLC_CONFIG', 'BAD_DLC_CONFIG']);
// The keys that can tie a game to its saves: never replaced without the user saying so.
const IDENTITY_KEYS = [
  ['account_steamid', 'accountSteamId', 'user::general'],
  ['account_name', 'accountName', 'user::general'],
  ['language', 'language', 'user::general'],
  ['local_save_path', 'localSavePath', 'user::saves'],
];
const DEFAULTS = { accountName: 'Player', language: 'english' };

function localValues(steamSettings) {
  try {
    const doc = parseIni(fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8'));
    return { 'user::general': readIniSectionValues(doc, 'user::general'), 'user::saves': readIniSectionValues(doc, 'user::saves') };
  } catch {
    return { 'user::general': {}, 'user::saves': {} };
  }
}

/*
  What the step would write, read before anything changes. `identity` is goldberg.userIdentity()
  for Settings as they are; `stamp` is Settings' "Write account name and language". Returns
  { writes, user: { fill, replace }, conflicts } - a conflict is a value of the game's own the
  stamped identity would replace, which the caller asks about.
*/
function plan({ steamSettings, gameDir, codes = [], manageDlc = false, identity = {}, stamp = false, emulator = 'gbe', hosts = null } = {}) {
  const wanted = new Set(codes);
  const writes = [];
  if (wanted.has('NO_APPID_TXT')) writes.push('steam_appid.txt');
  if (manageDlc && [...DLC_CODES].some((code) => wanted.has(code))) writes.push('configs.app.ini');
  if ([...MAIN_CODES].some((code) => wanted.has(code))) writes.push('configs.main.ini');

  const effective = gbeEffectiveConfig.resolve({ steamSettings, emulator, hosts: hosts || winHosts.hostsFor(gameDir || steamSettings) });
  const local = localValues(steamSettings);
  const fill = {};
  const replace = {};
  const conflicts = [];
  for (const [key, option, section] of IDENTITY_KEYS) {
    const value = identity[option] != null && String(identity[option]).trim() ? String(identity[option]).trim() : '';
    const own = local[section][key];
    if (own != null && String(own).trim()) {
      if (stamp && value && String(own).trim() !== value) {
        replace[option] = value;
        conflicts.push({ key, current: String(own).trim(), wanted: value });
      }
      continue;
    }
    // Answered by the global or save-folder settings: a local copy would only shadow it (#196).
    if (gbeEffectiveConfig.answered(effective, section, key)) continue;
    if (value) fill[option] = value;
  }
  // The emulator needs a name and a language somewhere; its own defaults when Settings has none.
  if (wanted.has('NO_USER_CONFIG') || wanted.has('BAD_USER_CONFIG')) {
    for (const [option, key] of [['accountName', 'account_name'], ['language', 'language']]) {
      if (!fill[option] && !local['user::general'][key] && !gbeEffectiveConfig.answered(effective, 'user::general', key)) fill[option] = DEFAULTS[option];
    }
  }
  const fixesPlaceholder = wanted.has('PLACEHOLDER_SAVE_PATH');
  if (Object.keys(fill).length > 0 || conflicts.length > 0 || fixesPlaceholder) writes.push('configs.user.ini');
  if (wanted.has('AW_LAUNCH_APPID')) writes.push('steam_appid.txt (Steam shortcut)');
  return { steamSettings, writes, user: { fill, replace, fixesPlaceholder }, conflicts, codes: [...wanted] };
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/*
  Apply a plan. `replaceIdentity` is the user's answer about `plan.conflicts`. Every file that
  exists is copied into .aw-backups/<stamp>/ before it changes, supported_languages.txt included,
  and the files created are listed in created.json there; repairJournal keeps the undo itself.
*/
async function apply({ plan: planned, appid, fetchDlc = null, replaceIdentity = false } = {}) {
  const steamSettings = planned && planned.steamSettings;
  if (!steamSettings) throw new Error('apply: no steam_settings target');
  const backupDir = path.join(steamSettings, '.aw-backups', backupStamp());
  const files = ['steam_appid.txt', 'configs.app.ini', 'configs.main.ini', 'configs.user.ini', 'supported_languages.txt'].map((name) => path.join(steamSettings, name));
  const before = new Map(files.filter((file) => fs.existsSync(file)).map((file) => [file, fs.readFileSync(file)]));
  for (const [file, content] of before) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, path.basename(file)), content);
  }
  fs.mkdirSync(steamSettings, { recursive: true });
  const result = { steamSettings, backupDir: null, written: [], created: [], removedLaunchAppIds: [] };
  const writes = new Set(planned.writes);

  if (writes.has('steam_appid.txt') && /^[0-9]+$/.test(String(appid ?? '')) && !fs.existsSync(path.join(steamSettings, 'steam_appid.txt'))) {
    fs.writeFileSync(path.join(steamSettings, 'steam_appid.txt'), String(appid));
  }
  if (writes.has('configs.app.ini')) {
    let dlcs = [];
    try {
      if (typeof fetchDlc === 'function' && appid != null) dlcs = (await fetchDlc(appid)) || [];
    } catch {
      /* offline: unlock_all alone answers the ownership check */
    }
    goldberg.writeDlcConfig({ steamSettings, dlcs: Array.isArray(dlcs) ? dlcs : [] });
  }
  if (writes.has('configs.main.ini')) goldberg.writeMainConfig({ steamSettings });
  if (writes.has('configs.user.ini')) {
    const values = { ...planned.user.fill, ...(replaceIdentity ? planned.user.replace : {}) };
    goldberg.writeUserConfig({ steamSettings, ...values });
  }
  if (writes.has('steam_appid.txt (Steam shortcut)')) {
    try {
      result.removedLaunchAppIds = awManagedConfig.stripLaunchAppIds(steamSettings).map((entry) => entry.file);
    } catch {
      /* a locked file stays reported by the next diagnosis */
    }
  }

  for (const file of files) {
    const name = path.basename(file);
    if (!fs.existsSync(file)) continue;
    if (!before.has(file)) {
      result.created.push(name);
      result.written.push(name);
    } else if (!before.get(file).equals(fs.readFileSync(file))) result.written.push(name);
    // An untouched file needs no copy: the folder then shows exactly what changed.
    else fs.rmSync(path.join(backupDir, name), { force: true });
  }
  if (result.created.length > 0) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'created.json'), JSON.stringify(result.created, null, 2));
  }
  if (fs.existsSync(backupDir) && fs.readdirSync(backupDir).length === 0) fs.rmSync(backupDir, { recursive: true, force: true });
  if (fs.existsSync(backupDir)) result.backupDir = backupDir;
  return result;
}

module.exports = { plan, apply, IDENTITY_KEYS };
