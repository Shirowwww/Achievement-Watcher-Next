'use strict';

/*
  On Linux every Proton prefix is a host of its own, and a Steam player has dozens: the guide's
  Games step froze the window for minutes (Discord report, Arch/KDE) because each root list was
  de-duplicated by comparing every new path with every earlier one. A fake set of hosts stands in
  for those prefixes so the test runs on every system.
*/
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const APP = path.join(__dirname, '../../app');
const PREFIXES = 120;

function fakeHost(index, base = path.join(path.sep, 'steam', 'compatdata', String(200000 + index), 'pfx')) {
  const profile = path.join(base, 'drive_c', 'users', 'steamuser');
  return {
    id: `proton:${base}`,
    root: base,
    env: {
      APPDATA: path.join(profile, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
      PUBLIC: path.join(base, 'drive_c', 'users', 'Public'),
      PROGRAMDATA: path.join(base, 'drive_c', 'ProgramData'),
      USERPROFILE: profile,
    },
    documents: () => path.join(profile, 'Documents'),
  };
}

// saveRoots reads appHosts() when it is loaded: load a fresh copy that sees the fake hosts.
function saveRootsWithHosts(hosts) {
  const appHostsPath = require.resolve(path.join(APP, 'util/appHosts.js'));
  const saveRootsPath = require.resolve(path.join(APP, 'parser/saveRoots.js'));
  const appHosts = require(appHostsPath);
  const original = appHosts.appHosts;
  appHosts.appHosts = () => hosts;
  delete require.cache[saveRootsPath];
  try {
    return require(saveRootsPath);
  } finally {
    appHosts.appHosts = original;
    delete require.cache[saveRootsPath];
  }
}

test('a Steam player with many Proton prefixes gets every root list in under 1.5 seconds', () => {
  const hosts = Array.from({ length: PREFIXES }, (_, i) => fakeHost(i));
  // The same prefix listed twice (two users of one prefix share its Public folders) adds nothing.
  hosts.push(fakeHost(0));
  const saveRoots = saveRootsWithHosts(hosts);

  const started = Date.now();
  const libraries = saveRoots.profileLibraryRoots();
  const saves = saveRoots.defaultSteamEmuSaveRoots();
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 1500, `root lists took ${elapsed}ms for ${hosts.length} hosts`);
  assert.equal(new Set(libraries).size, libraries.length, 'a library root is listed twice');
  assert.equal(new Set(saves).size, saves.length, 'a save root is listed twice');
  // Nothing is lost by de-duplicating: every prefix keeps its own Games folder.
  for (let i = 0; i < PREFIXES; i++) {
    assert.ok(libraries.includes(path.join(hosts[i].env.USERPROFILE, 'Games')), `prefix ${i} lost its Games folder`);
  }
});
