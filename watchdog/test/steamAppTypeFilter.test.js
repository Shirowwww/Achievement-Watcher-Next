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

// One read of appinfo.vdf per parse used to happen per appid: a 27,606-row index then kept the
// monitor's event loop blocked for about 17 minutes at every start (#137).
test('judging a whole game index reads the Steam catalogue once', async (t) => {
  const steamPath = await monitor.resolveSteamCataloguePath();
  if (!steamPath) return t.skip('no local Steam catalogue on this machine');
  const fs = require('fs');
  const path = require('path');
  const appInfo = require('../../app/parser/steamAppInfo.js');
  const catalogue = path.join(steamPath, 'appcache', 'appinfo.vdf').toLowerCase();

  // Appids no other test here has judged, so none is cached yet: games, tools, unknown ids.
  const appids = ['570', '730', '228980', '1070560', '1493710', '888888881', '888888882', 'ab12cd34ef56ab12cd34ef56ab12cd34'];
  for (let i = 0; i < 300; i++) appids.push(String(700000000 + i));
  const expected = new Map(appids.map((appid) => [appid, appInfo.isLibraryGame(steamPath, appid) === false]));
  appInfo.releaseCache();

  const realRead = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function (file, ...rest) {
    if (String(file).toLowerCase() === catalogue) reads++;
    return realRead.call(this, file, ...rest);
  };
  try {
    monitor.judgeSteamAppTypes(appids);
    for (const appid of appids) assert.equal(monitor.isNonGameSteamApp(appid), expected.get(appid), `verdict changed for ${appid}`);
  } finally {
    fs.readFileSync = realRead;
  }
  assert.equal(reads, 1, 'the catalogue must be parsed once for the whole list, not once per appid');
  assert.ok([...expected.values()].some(Boolean), 'the list must hold at least one non-game for the check to mean anything');
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
