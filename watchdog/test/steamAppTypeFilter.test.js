'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const monitor = require('../playtime/monitor.js');

// Steam sells apps/tools beside games; owning one reads as a game starting, inflating playtime and
// holding "a game is running" for the whole session. Tests run against the real appcache/appinfo.vdf
// since the point is Steam's own answer, not a project list; they skip without a local Steam install.

const KNOWN_APPLICATIONS = [
  ['1812620', 'DSX'],
  ['993090', 'Lossless Scaling'],
  ['431960', 'Wallpaper Engine'],
  ['250820', 'SteamVR'],
];
const KNOWN_GAMES = [
  ['391540', 'Undertale'],
  ['4000', "Garry's Mod"],
];

test('Steam applications and tools are not treated as running games', async (t) => {
  const steamPath = await monitor.resolveSteamCataloguePath();
  if (!steamPath) return t.skip('no local Steam catalogue on this machine');

  for (const [appid, name] of KNOWN_APPLICATIONS) {
    assert.equal(monitor.isNonGameSteamApp(appid), true, `${name} (${appid}) should not count as a game`);
  }
});

test('real games are still tracked', async (t) => {
  const steamPath = await monitor.resolveSteamCataloguePath();
  if (!steamPath) return t.skip('no local Steam catalogue on this machine');

  for (const [appid, name] of KNOWN_GAMES) {
    assert.equal(monitor.isNonGameSteamApp(appid), false, `${name} (${appid}) must stay tracked`);
  }
});

test('an appid the catalogue does not know stays tracked', async (t) => {
  const steamPath = await monitor.resolveSteamCataloguePath();
  if (!steamPath) return t.skip('no local Steam catalogue on this machine');

  // Must never regress: isLibraryGame returns null (not false) for a cracked/non-Steam copy or an
  // appid newer than the cache, so an unknown app must stay tracked rather than excluded.
  assert.equal(monitor.isNonGameSteamApp('999999999'), false, 'an unknown appid must not be excluded');
  assert.equal(monitor.isNonGameSteamApp(''), false, 'an empty appid must not be excluded');
  assert.equal(monitor.isNonGameSteamApp(null), false, 'a missing appid must not be excluded');
});
