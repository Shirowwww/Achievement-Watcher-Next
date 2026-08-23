'use strict';

/*
  What the optional Steam account is worth once it is connected: the ghost-game switch, the playtime
  Steam already knows about, and the two links that should open in the client when it is running.

  Every one of these is a wire between files - markup to renderer to main process - so what is
  checked here is that the wire exists. Each of them has been disconnected at least once without a
  single unit test noticing, because each half was perfectly correct on its own.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const { parse } = require(path.join(appDir, 'node_modules', 'node-html-parser'));

const document = parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
const settings = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const achievements = fs.readFileSync(path.join(appDir, 'parser', 'achievements.js'), 'utf8');

test('the ghost-game switch is an Advanced setting, on by default', () => {
  const advanced = document.querySelector('section[data-view="advanced"]');
  assert.ok(advanced, 'the Advanced section is gone');

  const card = advanced.querySelector('#steam-stale-card');
  assert.ok(card, 'the ghost-game card must live in Advanced: it is not an everyday choice');
  assert.match(card.getAttribute('style') || '', /display\s*:\s*none/, 'it starts hidden, before the account is known');

  const select = card.querySelector('#steam-hide-stale');
  assert.ok(select, 'the switch is missing');
  const on = select.querySelectorAll('option').find((option) => option.getAttribute('value') === 'true');
  assert.ok(on && on.hasAttribute('selected'), 'hiding ghost games is the default');
});

test('the switch only exists for a connected account, and hides nothing without one', () => {
  // The card is shown by the account state, never by the setting.
  assert.match(settings, /\$\('#steam-stale-card'\)\.toggle\(!!s\.connected\)/);

  const sort = fs.readFileSync(path.join(appDir, 'ui', 'sort.js'), 'utf8');
  const enabled = sort.slice(sort.indexOf('function hideStaleEnabled()'));
  assert.match(enabled.slice(0, enabled.indexOf('\n}')), /undefined'\) return true/, 'the default is on');

  /*
    Nothing is marked stale without a positive ownership list, so with no account the class the
    filter applies matches nothing. That is the invariant that makes "on by default" safe.
  */
  const { classify } = require(path.join(appDir, 'parser', 'steamAccount.js'));
  const nothingKnown = classify({ owned: [], family: [], installed: [], listed: ['440', '570'] });
  assert.deepEqual([...nothingKnown.values()], ['owned', 'owned'], 'an empty owned list must mark nothing stale');
});

test('the playtime Steam knows about reaches the local counter on every refresh', () => {
  // Read from the library response...
  const account = fs.readFileSync(path.join(appDir, 'parser', 'steamAccount.js'), 'utf8');
  assert.match(account, /playtime_forever/, 'the owned-games response carries the minutes');
  assert.match(account, /library\.playtime\.set\(id, \{ seconds: minutes \* 60/);
  assert.match(account, /playtime: Object\.fromEntries\(library\.playtime\)/, 'and the cache has to carry it too');

  // ...seeded before the rows are built, or the value would only appear on the next scan...
  const refresh = achievements.slice(achievements.indexOf('async function refreshSteamOwnership'));
  assert.match(refresh.slice(0, refresh.indexOf('\n}')), /await seedPlaytimeFromSteamLibrary\(library\.playtime\)/);
  const seedAt = achievements.indexOf('await refreshSteamOwnership(appidList)');
  const buildAt = achievements.indexOf('callbackProgress(0, finalList.length)');
  assert.ok(seedAt > -1 && buildAt > -1 && seedAt < buildAt, 'seeding must happen before the list is built');

  // ...and only ever upwards, so a machine that played more than Steam saw keeps its own figure.
  const playtime = fs.readFileSync(path.join(appDir, 'parser', 'playtime.js'), 'utf8');
  assert.match(playtime, /const total = Math\.max\(localSeconds, steamSeconds\)/);
});

test('a connected account without a steamid repairs itself instead of going quiet', () => {
  const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
  const handler = init.slice(init.indexOf("ipcMain.handle('steam:ensure-token'"));
  assert.match(handler.slice(0, handler.indexOf('\n});')), /steamAuth\.recoverSteamId\(/, 'the library call is refused without one');

  const status = init.slice(init.indexOf("ipcMain.handle('steam:auth-status'"));
  assert.match(status.slice(0, status.indexOf('\n});')), /steamAuth\.refreshPersona\(/, 'a nameless card should not stay nameless');
});

test('the store and hub links ask whether Steam is running, and say so in the option it reads', () => {
  const links = fs.readFileSync(path.join(appDir, 'util', 'steamClientLinks.js'), 'utf8');
  assert.match(links, /clientRunning/, 'the module reads clientRunning');

  const opener = appSource.slice(appSource.indexOf('async function openSteamTarget'));
  const body = opener.slice(0, opener.indexOf('\n}'));
  assert.match(body, /invoke\('steam:is-running'\)/, 'asked fresh on every click');
  assert.match(body, /build\(appid, \{ clientRunning: running \}\)/, 'and the answer has to reach the module');

  // Both menu entries go through it: passing an option the module ignores sent every link to the
  // browser, which is exactly what "Steam link does nothing useful" looked like.
  assert.match(appSource, /openSteamTarget\(steamClientLinks\.steamStoreUrl, catalogAppid\)/);
  assert.match(appSource, /openSteamTarget\(steamClientLinks\.steamGameHubUrl, catalogAppid\)/);
  assert.ok(!/hasClient/.test(appSource), 'no caller may still pass the old option name');
});
