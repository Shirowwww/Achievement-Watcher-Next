'use strict';

/*
  The configuration GBE Fork actually runs with, not just the files beside its dll (#196). Read the
  way dll/settings_parser.cpp load_all_config_settings() does in release-2026_09_27: the four
  configs.*.ini of steam_settings are merged into one table keyed by section and key, the first file
  to name a key wins. Then either the save folder's own settings (local_save_path or GseSavePath,
  which override) or the global %APPDATA%\<saves folder>\settings\configs.*.ini (which only fill the
  keys still unset) - never both. Classic Goldberg reads plain .txt files instead.
*/

const fs = require('fs');
const path = require('path');
const winHosts = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const { parseIni } = require(path.join(__dirname, '..', 'util', 'emuIni.js'));

const CONFIG_FILES = ['configs.app.ini', 'configs.main.ini', 'configs.overlay.ini', 'configs.user.ini'];
const DEFAULT_SAVES_FOLDER = 'GSE Saves';
const CLASSIC_SAVES_FOLDER = 'Goldberg SteamEmu Saves';

// Classic Goldberg's identity files: steam_settings forces, the global settings folder sets.
const CLASSIC_USER_FILES = [
  { key: 'account_name', local: 'force_account_name.txt', global: 'account_name.txt' },
  { key: 'language', local: 'force_language.txt', global: 'language.txt' },
  { key: 'account_steamid', local: 'force_steamid.txt', global: 'user_steam_id.txt' },
];

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// Every live `key=value` of one file, as [section, key, value]. Comments never count.
function iniEntries(text) {
  const entries = [];
  for (const section of parseIni(text).sections) {
    for (const line of section.body) {
      if (/^\s*[;#]/.test(line)) continue;
      const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*?)\s*$/);
      if (m) entries.push([section.key, m[1].toLowerCase(), m[2]]);
    }
  }
  return entries;
}

// `overwrite` mirrors merge_ini(ini, true): the save folder's settings replace what came before.
function mergeFolder(table, dir, scope, { overwrite = false } = {}) {
  const read = [];
  if (!dir) return read;
  for (const name of CONFIG_FILES) {
    const file = path.join(dir, name);
    const text = readText(file);
    if (text == null) continue;
    read.push(file);
    // Within one file the last line wins (SimpleIni without multi-keys); across files, the first.
    const own = new Map(iniEntries(text).map(([section, key, value]) => [`${section}::${key}`, value]));
    for (const [id, value] of own) if (overwrite || !table.has(id)) table.set(id, { value, scope, file });
  }
  return read;
}

function firstLine(file) {
  const text = readText(file);
  return text == null ? null : text.split(/\r?\n/)[0].trim();
}

function appdataOf(hosts) {
  for (const host of hosts || []) {
    const appdata = winHosts.hostPath(host, 'APPDATA');
    if (appdata) return appdata;
  }
  return null;
}

function relativeTo(base, value) {
  if (!value) return '';
  const spelled = process.platform === 'win32' ? value : value.replace(/\\/g, '/');
  return path.isAbsolute(spelled) ? path.resolve(spelled) : path.resolve(base, spelled);
}

/*
  { lookup(section, key) -> { value, scope: 'local' | 'save' | 'global', file } | null, globalDir,
  saveSettingsDir, files }. `emulator` is goldberg.detectEmulator's shape ('gbe' | 'goldberg').
*/
function resolve({ steamSettings, emulator = 'gbe', hosts = null, env = process.env } = {}) {
  const table = new Map();
  const result = { globalDir: null, saveSettingsDir: null, files: [] };
  const lookup = (section, key) => table.get(`${String(section).toLowerCase()}::${String(key).toLowerCase()}`) || null;
  // Every key the merged table holds under one section, as { key, value, scope, file }.
  const section = (name) => {
    const prefix = `${String(name).toLowerCase()}::`;
    return [...table].filter(([id]) => id.startsWith(prefix) && !id.slice(prefix.length).includes('::')).map(([id, entry]) => ({ key: id.slice(prefix.length), ...entry }));
  };
  // Which of the four files any scope provided, by name: the "is there a main config" question.
  const hasFile = (name) => result.files.some((file) => path.basename(file).toLowerCase() === String(name).toLowerCase());
  const done = () => ({ ...result, lookup, section, hasFile });
  if (!steamSettings) return done();
  const appdata = appdataOf(hosts || winHosts.hostsFor(steamSettings));

  if (emulator === 'goldberg') {
    result.globalDir = appdata ? path.join(appdata, CLASSIC_SAVES_FOLDER, 'settings') : null;
    for (const entry of CLASSIC_USER_FILES) {
      const local = path.join(steamSettings, entry.local);
      const global = result.globalDir ? path.join(result.globalDir, entry.global) : null;
      const localValue = firstLine(local);
      const globalValue = global ? firstLine(global) : null;
      if (localValue) table.set(`user::general::${entry.key}`, { value: localValue, scope: 'local', file: local });
      else if (globalValue) table.set(`user::general::${entry.key}`, { value: globalValue, scope: 'global', file: global });
    }
    // A GBE build over a classic-shaped folder still reads configs.*.ini.
  }

  const programPath = path.dirname(steamSettings);
  result.files.push(...mergeFolder(table, steamSettings, 'local'));
  const savesFolder = (lookup('user::saves', 'saves_folder_name') || {}).value || DEFAULT_SAVES_FOLDER;
  const savePath = String((env && env.GseSavePath) || '').trim() || (lookup('user::saves', 'local_save_path') || {}).value || '';
  if (savePath) {
    result.saveSettingsDir = path.join(relativeTo(programPath, savePath), 'settings');
    result.files.push(...mergeFolder(table, result.saveSettingsDir, 'save', { overwrite: true }));
  } else if (appdata) {
    const globalDir = path.join(appdata, savesFolder, 'settings');
    if (emulator !== 'goldberg') result.globalDir = globalDir;
    result.files.push(...mergeFolder(table, globalDir, 'global'));
  }
  return done();
}

// configs.app.ini's [app::dlcs] as the emulator sees it: 'unlock-all', 'explicit' or 'none'.
function dlcMode(effective) {
  const entries = effective ? effective.section('app::dlcs') : [];
  if (entries.some((entry) => entry.key === 'unlock_all' && /^\s*1\s*$/.test(entry.value))) return 'unlock-all';
  return entries.some((entry) => /^\d+$/.test(entry.key)) ? 'explicit' : 'none';
}

// A key the running emulator gets a non-empty value for, wherever it came from.
function answered(effective, section, key) {
  const entry = effective && effective.lookup(section, key);
  return entry && String(entry.value).trim() ? entry : null;
}

module.exports = { resolve, answered, dlcMode, CONFIG_FILES, DEFAULT_SAVES_FOLDER };
