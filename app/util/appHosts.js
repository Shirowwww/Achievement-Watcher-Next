'use strict';

const path = require('path');
const reg = require(path.join(__dirname, 'reg.js'));
const winHosts = require(path.join(__dirname, 'winHosts.js'));

// The hosts of winHosts.js as the app sees them: on Windows, this machine's registry and Documents
// folder are read through reg.js, exactly as the sources always did.
function appHosts() {
  return winHosts.listHosts({
    nativeDocuments: () => reg.readRegistryStringAndExpand('HKCU', winHosts.SHELL_FOLDERS_KEY, 'Personal'),
    nativeRegistry: { value: reg.readRegistryValue, subkeys: reg.listRegistryAllSubkeys, valueNames: reg.ListRegistryAllValues },
  });
}

// Every host's Documents folders: the shell folder first (often redirected, to OneDrive say), then
// <profile>\Documents, where a game that ignores the redirection still writes.
function documentsFolders(hosts = appHosts()) {
  const folders = [];
  const add = (dir) => {
    if (dir && !folders.some((known) => winHosts.pathKey(known) === winHosts.pathKey(dir))) folders.push(dir);
  };
  for (const host of hosts) {
    try {
      add(host.documents());
    } catch {
      /* an unreadable shell folder is "unknown", not a failed scan */
    }
    add(winHosts.hostPath(host, 'USERPROFILE', 'Documents'));
  }
  return folders;
}

// The Documents folder a game folder's configs mean by "My Documents": its own prefix's, else the
// first host's (this machine on Windows).
function documentsFor(dir) {
  return documentsFolders(winHosts.hostsFor(dir, appHosts()))[0] || null;
}

// The host a library entry was found in, from the id it recorded; entries recorded before hosts
// existed carry none and mean this machine.
function hostById(id) {
  const hosts = appHosts();
  return hosts.find((host) => host.id === id) || hosts[0];
}

module.exports = { appHosts, documentsFolders, documentsFor, hostById };
