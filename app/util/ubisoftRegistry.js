'use strict';

const path = require('path');
const { appHosts } = require(path.join(__dirname, 'appHosts.js'));

/*
  What Ubisoft Connect records in the registry, read on every host (this machine, or each Wine prefix
  on Linux) with its Windows paths turned into local ones.
*/

const INSTALLS_ROOTS = ['Software/WOW6432Node/Ubisoft/Launcher/Installs', 'Software/Ubisoft/Launcher/Installs'];
const LAUNCHER_KEYS = [
  ['HKLM', 'Software/WOW6432Node/Ubisoft/Launcher'],
  ['HKLM', 'Software/Ubisoft/Launcher'],
  ['HKCU', 'Software/WOW6432Node/Ubisoft/Launcher'],
  ['HKCU', 'Software/Ubisoft/Launcher'],
];

function localDir(host, hive, key) {
  const value = String(host.regValue(hive, key, 'InstallDir') || '').trim();
  return value ? host.localPath(value) : null;
}

// Every product Ubisoft Connect recorded as installed: [{ id, dir }]. The launcher leaves stale entries
// behind after an uninstall, so a caller that needs proof checks that `dir` exists.
function installs(hosts = appHosts()) {
  const found = [];
  for (const host of hosts) {
    for (const hive of ['HKLM', 'HKCU']) {
      for (const root of INSTALLS_ROOTS) {
        for (const id of host.regSubkeys(hive, root)) {
          const dir = localDir(host, hive, `${root}/${id}`);
          if (dir) found.push({ id: String(id), dir });
        }
      }
    }
  }
  return found;
}

// Where one product was installed, read directly from its key: '' when no host records it.
function installDir(id, hosts = appHosts()) {
  for (const host of hosts) {
    for (const hive of ['HKLM', 'HKCU']) {
      for (const root of INSTALLS_ROOTS) {
        const dir = localDir(host, hive, `${root}/${id}`);
        if (dir) return dir;
      }
    }
  }
  return '';
}

// The launcher's own install folder on every host, most likely first.
function launcherDirs(hosts = appHosts()) {
  const dirs = [];
  for (const host of hosts) {
    for (const [hive, key] of LAUNCHER_KEYS) {
      const dir = localDir(host, hive, key);
      if (dir && !dirs.includes(dir)) dirs.push(dir);
    }
  }
  return dirs;
}

module.exports = { installs, installDir, launcherDirs };
