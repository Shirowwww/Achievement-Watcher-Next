'use strict';

// regodit is ESM-only (koffi); load it lazily and use the SYNC API - under the pinned koffi the async
// DWORD write segfaults after storing `total`, which is why `last` never reached the registry.
let regeditPromise = null;
const loadRegedit = () => regeditPromise || (regeditPromise = import('regodit'));

module.exports = async (appID, time) => {
  const regedit = await loadRegedit();
  // AW Next uses its own registry namespace so neither predecessor's uninstaller can wipe playtime
  // data. Counters from the older namespaces are copied forward once, on first launch, by
  // migratePlaytimeRegistry() in app/util/migrateUserData.js.
  const key = 'Software/Achievement Watcher Next/Playtime/Steam/' + appID;

  // The counter is an unsigned DWORD: a negative or absurd duration would not raise an error, it
  // would wrap the stored total, so the addition is clamped rather than trusted.
  const current = Math.max(0, +regedit.regQueryIntegerValue('HKCU', key, 'total') || 0);
  const played = Number.isFinite(Number(time)) ? Math.max(0, Math.floor(Number(time))) : 0;
  regedit.regWriteDwordValue('HKCU', key, 'total', Math.min(current + played, 0xffffffff));
  regedit.regWriteDwordValue('HKCU', key, 'last', Math.floor(Date.now() / 1000));
};
