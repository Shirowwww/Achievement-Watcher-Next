'use strict';

/*
  Quiver Launcher (github.com/SirDiabo/QuiverLauncher) keeps a library of PC ports and
  recompilations. Its data folder, the Velopack install root on Windows and the XDG data folder on
  Linux, holds apps.json (the games in the library) and settings.json, whose AppsPath moves the
  install folder. A game sits in its own installPath, else in <install folder>/<folderName>. Read
  only, synchronous and dependency-free: the Watchdog loads this file too.
*/

const fs = require('fs');
const path = require('path');
const { listHosts, hostPath, pathKey } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const DATA_FOLDER = 'QuiverLauncher';
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
  const local = (value) => (host && typeof host.localPath === 'function' ? host.localPath(value) : value) || '';
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

// Every Quiver library on this system, one per host that has one.
function libraries(hosts = listHosts()) {
  const found = [];
  for (const host of hosts) {
    const root = hostPath(host, 'LOCALAPPDATA', DATA_FOLDER);
    const library = root ? readLibrary(root, host) : null;
    if (library) found.push(library);
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

module.exports = { DATA_FOLDER, readLibrary, libraries, installedFolders };
