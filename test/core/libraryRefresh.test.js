'use strict';

/*
  Closing Settings with OK rebuilt the whole library every time: the grid was emptied, the memo of
  which AppIDs failed to resolve was dropped, and a full scan ran again. Changing a theme colour cost
  exactly as much as changing a game source.

  These tests describe which settings really decide what the library contains, and - just as
  important - which do not, since a setting wrongly listed here brings the reload straight back.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const libraryRefresh = require('../../app/util/libraryRefresh.js');

const BASE = Object.freeze({
  achievement: {
    lang: 'english',
    showHidden: false,
    mergeDuplicate: true,
    timeMergeRecentFirst: false,
    hideZero: false,
    libraryLayout: 'default',
  },
  achievement_source: { steamEmu: true, gog: true, epicOfficial: 2 },
  steam: { main: '0' },
  general: { username: 'Shirow', theme: 'default' },
});

const signature = (config, folders = {}) => libraryRefresh.signature({ config, ...folders });
const changed = (mutate, folders) => {
  const next = JSON.parse(JSON.stringify(BASE));
  mutate(next);
  return libraryRefresh.needsRescan(signature(BASE), signature(next, folders));
};

test('an unchanged panel does not rebuild the library', () => {
  assert.equal(libraryRefresh.needsRescan(signature(BASE), signature(JSON.parse(JSON.stringify(BASE)))), false);
});

test('every setting that decides what the grid holds forces a rescan', () => {
  assert.equal(changed((c) => (c.achievement.lang = 'french')), true, 'the schema is cached per language');
  assert.equal(changed((c) => (c.achievement.showHidden = true)), true, 'hidden achievements are read at scan time');
  assert.equal(changed((c) => (c.achievement.mergeDuplicate = false)), true, 'merging decides how many cards exist');
  assert.equal(changed((c) => (c.achievement.timeMergeRecentFirst = true)), true, 'which unlock time survives a merge');
  assert.equal(changed((c) => (c.achievement.hideZero = true)), true, 'games are filtered out as the grid is built');
  assert.equal(changed((c) => (c.achievement_source.gog = false)), true, 'a source switch adds or removes games');
  assert.equal(changed((c) => (c.achievement_source.xboxPc = 2)), true, 'a source added later counts too');
  assert.equal(changed((c) => (c.steam.main = '76561198000000000')), true, 'the legit-Steam account is read during the scan');
  assert.equal(changed((c) => (c.general.username = 'Someone')), true, 'the profile band is rebuilt with the list');
});

test('a watched folder changing forces a rescan, and its display fields do not', () => {
  const folders = (userDirs) => ({ userDirs, libraryDirs: [] });
  const base = signature(BASE, folders([{ path: 'C:/Games', enabled: true }]));

  assert.equal(libraryRefresh.needsRescan(base, signature(BASE, folders([{ path: 'C:/Games', enabled: true }, { path: 'D:/More' }]))), true);
  assert.equal(libraryRefresh.needsRescan(base, signature(BASE, folders([]))), true, 'removing one counts');
  assert.equal(libraryRefresh.needsRescan(base, signature(BASE, folders([{ path: 'C:/Games', enabled: false }]))), true, 'so does turning one off');

  // Same folders, written differently or listed in another order: nothing to rescan for.
  assert.equal(libraryRefresh.needsRescan(base, signature(BASE, folders([{ path: 'C:\\Games\\', enabled: true }]))), false);
  assert.equal(
    libraryRefresh.needsRescan(
      signature(BASE, folders([{ path: 'C:/Games' }, { path: 'D:/More' }])),
      signature(BASE, folders([{ path: 'D:/More' }, { path: 'C:/Games' }]))
    ),
    false,
    'the order rows appear in is not a setting'
  );
  // A row carries UI-only fields; they must not count as a change.
  assert.equal(libraryRefresh.needsRescan(base, signature(BASE, folders([{ path: 'C:/Games', enabled: true, label: 'Games', open: true }]))), false);
});

test('nothing that only changes how the library looks forces a rescan', () => {
  // These are all applied live while Settings is open, or are about another part of the app. If one
  // of them starts rebuilding the grid, the reload this module exists to remove is back.
  assert.equal(changed((c) => (c.general.theme = 'oled')), false, 'theme');
  assert.equal(changed((c) => (c.achievement.libraryTileScale = 1.6)), false, 'tile size');
  assert.equal(changed((c) => (c.achievement.libraryDensity = 0)), false, 'grid density');
  assert.equal(changed((c) => (c.achievement.libraryShowTitle = false)), false, 'tile chrome');
  assert.equal(changed((c) => (c.achievement.showPlayButton = false)), false, 'the Play button');
  assert.equal(changed((c) => (c.achievement.goldbergDownloadIcons = true)), false, 'an emulator-setup option');
  // Switching view swaps a class and re-requests the covers of the tiles already on screen. The
  // toolbar picker has always done that without a scan; Settings calls the same function now.
  assert.equal(changed((c) => (c.achievement.libraryLayout = 'portrait')), false, 'the library view');
  assert.equal(changed((c) => ((c.notification = { notify: false }), undefined)), false, 'notifications');
  assert.equal(changed((c) => ((c.overlay = { hotkey: 'Ctrl+K' }), undefined)), false, 'the overlay');
  assert.equal(changed((c) => ((c.controller = { enabled: true }), undefined)), false, 'the controller');
  assert.equal(changed((c) => ((c.general.closeToTray = false), undefined)), false, 'closing to tray');
});

test('a config missing whole sections is comparable rather than a crash', () => {
  for (const value of [undefined, null, {}, 'not a config']) {
    assert.equal(typeof libraryRefresh.signature({ config: value }), 'string');
  }
  assert.equal(libraryRefresh.needsRescan(libraryRefresh.signature({}), libraryRefresh.signature({ config: {} })), false);
});

test('OK rebuilds the library only on a real change, and Cancel keeps its own rule', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');

  // The snapshot has to be taken when the panel opens, and again once the folder rows are on screen:
  // reading a folder list before it is populated makes every OK look like a change.
  assert.match(source, /function takeLibrarySnapshot\(folders\)/);
  assert.match(source, /Promise\.all\(\[userDirsShown, libraryDirsShown\]\)\.then\(\(\) => takeLibrarySnapshot\(foldersFromDom\(\)\)\)/);

  const save = source.slice(source.indexOf("$('#btn-settings-save').click"));
  // The library view is applied to the existing tiles instead of counting as a reason to rescan.
  assert.match(save, /window\.applyLibraryView\(app\.config\.achievement\.libraryLayout, previousLayout\)/);
  assert.match(save, /libraryRefresh\.needsRescan\(librarySnapshotOnOpen, after\) \|\| window\.__awBlacklistDirty === true/);
  assert.match(save, /if \(rescan\) resetUI\(\);\s*else closeSettingsPanel\(\);/);

  // Cancel already only rebuilt on an un-blacklist, and still must.
  const cancel = source.slice(source.indexOf("$('#btn-settings-cancel"), source.indexOf("$('#btn-settings-save').click"));
  assert.match(cancel, /if \(window\.__awBlacklistDirty\) \{[\s\S]*?app\.onStart\(\);/);
  assert.equal((cancel.match(/resetUI\(\)/g) || []).length, 0, 'Cancel must never rebuild the library on its own');
});

test('a switch that comes back from the form as a string is not a change', () => {
  /*
    The bug that made the whole thing a no-op on the first try: saving reads every switch out of a
    <select>, so a source stored as the number 2 came back as "2" and a boolean as "true". Compared
    literally, every OK looked like a change and rebuilt the library exactly as before.
  */
  const asForm = JSON.parse(JSON.stringify(BASE));
  asForm.achievement_source.epicOfficial = '2';
  asForm.achievement_source.steamEmu = 'true';
  asForm.achievement_source.gog = 'true';
  asForm.achievement.showHidden = 'false';
  asForm.achievement.mergeDuplicate = 'true';
  asForm.achievement.timeMergeRecentFirst = 'false';
  asForm.achievement.hideZero = 'false';

  assert.equal(libraryRefresh.needsRescan(signature(BASE), signature(asForm)), false);

  // The values still have to be compared: "2" and "1" are not the same source setting.
  asForm.achievement_source.epicOfficial = '1';
  assert.equal(libraryRefresh.needsRescan(signature(BASE), signature(asForm)), true);
});

test('the toolbar picker and the Settings row switch the view through the same code', () => {
  /*
    They used to be two implementations of one action: the toolbar swapped the class and reloaded the
    covers, while Settings rebuilt the whole library. The same setting behaved differently depending
    on where you changed it.
  */
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');

  assert.match(app, /function applyLibraryView\(nextValue, previousValue = app\.config\.achievement\.libraryLayout\)/);
  assert.match(app, /window\.applyLibraryView = applyLibraryView;/);
  // An orientation change is the only thing that costs anything: portrait and landscape artwork differ.
  const view = app.slice(app.indexOf('function applyLibraryView(nextValue'), app.indexOf('window.applyLibraryView ='));
  assert.match(view, /if \(libraryLayout\.isPortrait\(previousMode\) !== libraryLayout\.isPortrait\(nextMode\)\) refreshLibraryCovers\(nextMode\)/);

  // Both callers go through it, and neither keeps a copy of the logic.
  const picker = app.slice(app.indexOf("$('#library-layout-select')"), app.indexOf("$('#game-list').off('.awLibrary')"));
  assert.match(picker, /applyLibraryView\(\$\(this\)\.val\(\)\)/);
  assert.doesNotMatch(picker, /refreshLibraryCovers/, 'the picker must not reimplement the switch');
  /*
    Settings collects its whole form into app.config before applying anything, so by then the config
    already holds the NEW view. Reading the old one from there would compare a value with itself and
    skip the cover reload: the grid switched to portrait while still showing landscape artwork.
  */
  assert.match(settings, /const previousLayout = app\.config\.achievement\.libraryLayout;/);
  assert.match(settings, /window\.applyLibraryView\(app\.config\.achievement\.libraryLayout, previousLayout\)/);
  const collect = settings.slice(settings.indexOf('const previousLayout'), settings.indexOf('window.applyLibraryView'));
  assert.ok(collect.includes("$('#options-ui .right')"), 'the previous view must be read before the form overwrites it');
});
