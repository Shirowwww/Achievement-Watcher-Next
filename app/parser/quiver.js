'use strict';

/*
  Quiver Launcher (github.com/SirDiabo/QuiverLauncher) keeps a library of PC ports and
  recompilations. Its data folder, the Velopack install root on Windows and the XDG data folder on
  Linux, holds apps.json (the games in the library) and settings.json, whose AppsPath moves the
  install folder. A game sits in its own installPath, else in <install folder>/<folderName>. Quiver 4
  (tgeorgiadis/quiver-launcher) keeps installs.json in <APPDATA>/com.quiverlauncher.app instead. Read
  only, synchronous and dependency-free: the Watchdog loads this file too.
*/

const fs = require('fs');
const path = require('path');
const { listHosts, hostPath, pathKey } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const DATA_FOLDER = 'QuiverLauncher';
// Tauri's app data folder: %APPDATA% on Windows, ~/.local/share on Linux, the Flatpak's included.
const V4_DATA_FOLDER = 'com.quiverlauncher.app';
const V4_CUSTOM_ID = /^(?:github|gitlab):([^/\s]+\/[^\s]+)$/i;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_APPS = 5000;
// Older libraries kept their games in these sections instead of one "apps" array.
const LEGACY_SECTIONS = ['standard', 'experimental', 'custom'];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// A plain file, bounded, parsed; null for anything else.
function readJson(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_JSON_BYTES) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

// One folder name, never a path: apps.json is a file anyone can edit.
function isFolderName(name) {
  return Boolean(name) && name !== '.' && name !== '..' && !/[\\/:\u0000]/.test(name);
}

// A Windows path Quiver wrote, as this host reads it (a Wine prefix); as written without a host.
const localOf = (host) => (value) => (host && typeof host.localPath === 'function' ? host.localPath(value) : value) || '';

function appsOf(library) {
  if (Array.isArray(library)) return library;
  if (!library || typeof library !== 'object') return [];
  return ['apps', ...LEGACY_SECTIONS].flatMap((key) => (Array.isArray(library[key]) ? library[key] : []));
}

/*
  One Quiver data folder as { root, installs: [{ name, repository, folderName, dir }] }, or null when
  it holds no library. `host` turns a Windows path written by Quiver into one this system can read
  (a Wine prefix); it defaults to the paths as written.
*/
function readLibrary(root, host = null) {
  const library = readJson(path.join(root, 'apps.json'));
  if (!library) return null;
  const local = localOf(host);
  const settings = readJson(path.join(root, 'settings.json'));
  const customFolder = settings && text(settings.AppsPath) ? local(text(settings.AppsPath)) : '';
  const appsFolder = customFolder && path.isAbsolute(customFolder) ? customFolder : path.join(root, 'Apps');
  const installs = [];
  for (const app of appsOf(library).slice(0, MAX_APPS)) {
    if (!app || typeof app !== 'object') continue;
    const folderName = text(app.folderName);
    const installPath = text(app.installPath) ? local(text(app.installPath)) : '';
    const dir = installPath && path.isAbsolute(installPath) ? installPath : isFolderName(folderName) ? path.join(appsFolder, folderName) : '';
    if (dir) installs.push({ name: text(app.name), repository: text(app.repository), folderName, dir });
  }
  return { root, installs };
}

// The name the player gave a Quiver 4 app, by its id, from library.json.
function v4Names(root) {
  const library = readJson(path.join(root, 'library.json'));
  const names = new Map();
  for (const item of Array.isArray(library) ? library.slice(0, MAX_APPS) : []) {
    const name = item && item.overrides ? text(item.overrides.name) : '';
    if (name && typeof item.id === 'string') names.set(item.id, name);
  }
  return names;
}

/*
  One Quiver 4 data folder as readLibrary gives one. An app sits in the folder 3.x kept it in (`dir`),
  else in <apps folder>/<group parts>/<folder>; the apps folder is apps-folder.json's, else <data>/apps.
  Only a custom app's id names its repository: a catalog app is told by its executable.
*/
function readInstalls(root, host = null) {
  const installs = readJson(path.join(root, 'installs.json'));
  if (!installs || typeof installs !== 'object' || Array.isArray(installs)) return null;
  const local = localOf(host);
  const saved = readJson(path.join(root, 'apps-folder.json'));
  const moved = saved && text(saved.path) ? local(text(saved.path)) : '';
  const appsFolder = moved && path.isAbsolute(moved) ? moved : path.join(root, 'apps');
  const names = v4Names(root);
  const found = [];
  for (const [id, install] of Object.entries(installs).slice(0, MAX_APPS)) {
    if (!install || typeof install !== 'object') continue;
    const kept = text(install.dir) ? local(text(install.dir)) : '';
    const folder = text(install.folder);
    const groupPath = text(install.group);
    const group = groupPath ? groupPath.split('/').map((part) => part.trim()) : [];
    const placed = isFolderName(folder) && group.every(isFolderName) ? path.join(appsFolder, ...group, folder) : '';
    const dir = kept && path.isAbsolute(kept) ? kept : placed;
    const custom = V4_CUSTOM_ID.exec(id);
    if (dir) found.push({ name: names.get(id) || '', repository: custom ? custom[1] : '', folderName: folder, dir });
  }
  return { root, installs: found };
}

// Every Quiver library on this system, 3.x's and 4's, one per host that has one.
function libraries(hosts = listHosts()) {
  const found = [];
  for (const host of hosts) {
    const root = hostPath(host, 'LOCALAPPDATA', DATA_FOLDER);
    const library = root ? readLibrary(root, host) : null;
    if (library) found.push(library);
    const v4Root = hostPath(host, 'APPDATA', V4_DATA_FOLDER);
    const v4 = v4Root ? readInstalls(v4Root, host) : null;
    if (v4) found.push(v4);
  }
  return found;
}

// The folders of the games Quiver has installed, each once, missing ones left out.
function installedFolders(hosts) {
  const seen = new Set();
  const folders = [];
  for (const library of libraries(hosts)) {
    for (const install of library.installs) {
      const key = pathKey(install.dir);
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        if (fs.statSync(install.dir).isDirectory()) folders.push(install);
      } catch {
        /* listed but not installed */
      }
    }
  }
  return folders;
}

module.exports = { DATA_FOLDER, V4_DATA_FOLDER, readLibrary, readInstalls, libraries, installedFolders };
