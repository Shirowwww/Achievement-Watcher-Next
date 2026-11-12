'use strict';

// regodit is ESM-only (koffi); load it lazily and use the SYNC API - under the pinned koffi the async
// DWORD write segfaults after storing `total`, which is why `last` never reached the registry.
const { loadRegodit: loadRegedit } = require('../util/regodit.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { userDataDir } = require('../util/userData.js');
const { PLAYTIME_REGISTRY_ROOT } = require(sharedAppModulePath('util/dataLayout.js'));

module.exports = async (appID, time) => {
  if (process.platform !== 'win32') {
    const playtimeFile = require(sharedAppModulePath('util/playtimeFile.js'));
    playtimeFile.addSession(playtimeFile.playtimeFile(userDataDir()), appID, time);
    return;
  }
  const regedit = await loadRegedit();
  // AW Next uses its own registry namespace so neither predecessor's uninstaller can wipe playtime
  // data. Counters from the older namespaces are copied forward once, on first launch, by
  // migratePlaytimeRegistry() in app/util/migrateUserData.js.
  const key = `${PLAYTIME_REGISTRY_ROOT}/${appID}`;

  // The counter is an unsigned DWORD: a negative or absurd duration would not raise an error, it
  // would wrap the stored total, so the addition is clamped rather than trusted.
  const current = Math.max(0, +regedit.regQueryIntegerValue('HKCU', key, 'total') || 0);
  const played = Number.isFinite(Number(time)) ? Math.max(0, Math.floor(Number(time))) : 0;
  const now = Math.floor(Date.now() / 1000);
  // The game page shows the first launch. Only a game with nothing recorded yet is having it now.
  const known = ['last', 'first'].some((name) => (+regedit.regQueryIntegerValue('HKCU', key, name) || 0) > 0);
  if (current === 0 && !known) regedit.regWriteDwordValue('HKCU', key, 'first', Math.max(0, now - played));
  regedit.regWriteDwordValue('HKCU', key, 'total', Math.min(current + played, 0xffffffff));
  regedit.regWriteDwordValue('HKCU', key, 'last', now);
};
