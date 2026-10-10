'use strict';

/*
  Windows launchers installed inside a Wine prefix on Linux: GOG Galaxy's databases and the Epic
  launcher's manifests sit in the prefix's drive_c, its registry in system.reg, and every Windows
  path they store is turned into the prefix's own folder.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const { withWinePrefix, LINUX_ONLY } = require('../helpers/winePrefix.js');
const gogOfficial = require('../../app/parser/gogOfficial.js');
const epicOfficial = require('../../app/parser/epicOfficial.js');
const launcherLibraries = require('../../app/parser/launcherLibraries.js');

const CLIENT_ID = '53652320436400298';
const USER_ID = '53435691055014860';

// The Galaxy tables and columns gogOfficial reads, filled the way Galaxy fills them.
function buildGalaxy(ctx) {
  const storage = ctx.write(path.join(ctx.programData, 'GOG.com', 'Galaxy', 'storage', 'galaxy-2.0.db'), '');
  fs.rmSync(storage);
  const db = new DatabaseSync(storage);
  db.exec(`
    CREATE TABLE ProductAuthorizations (productId INTEGER, clientId TEXT);
    CREATE TABLE InstalledBaseProducts (productId INTEGER, installationPath TEXT);
    CREATE TABLE ProductsToReleaseKeys (gogId INTEGER, releaseKey TEXT);
    CREATE TABLE LimitedDetails (productId INTEGER, title TEXT, languageId INTEGER, stored_at INTEGER);
    CREATE TABLE PlayTasks (id INTEGER, gameReleaseKey TEXT, isPrimary INTEGER, "order" INTEGER, typeId INTEGER);
    CREATE TABLE PlayTaskTypes (id INTEGER, type TEXT);
    CREATE TABLE PlayTaskLaunchParameters (playTaskId INTEGER, executablePath TEXT);
    INSERT INTO ProductAuthorizations VALUES (1207658924, '${CLIENT_ID}');
    INSERT INTO InstalledBaseProducts VALUES (1207658924, 'C:\\GOG Games\\The Witcher');
    INSERT INTO ProductsToReleaseKeys VALUES (1207658924, 'gog_1207658924');
    INSERT INTO LimitedDetails VALUES (1207658924, 'The Witcher', 16, 1000);
    INSERT INTO PlayTaskTypes VALUES (1, 'BuiltInPrimary');
    INSERT INTO PlayTasks VALUES (10, 'gog_1207658924', 1, 0, 1);
    INSERT INTO PlayTaskLaunchParameters VALUES (10, 'C:\\GOG Games\\The Witcher\\System\\witcher.exe');
  `);
  db.close();

  const gameplayDb = path.join(ctx.localAppData, 'GOG.com', 'Galaxy', 'Applications', CLIENT_ID, 'Gameplay', USER_ID, 'gameplay.db');
  fs.mkdirSync(path.dirname(gameplayDb), { recursive: true });
  const gameplay = new DatabaseSync(gameplayDb);
  gameplay.exec(`
    CREATE TABLE database_info (key TEXT, value TEXT);
    CREATE TABLE achievement (id INTEGER, key TEXT, name TEXT, description TEXT, visible_while_locked INTEGER,
      unlock_time TEXT, image_url_locked TEXT, image_url_unlocked TEXT, rarity REAL, rarity_level_slug TEXT);
    INSERT INTO database_info VALUES ('achievements_retrieved', '1');
    INSERT INTO achievement VALUES (1, 'ACH_FIRST', 'First', 'Do it', 1, '2026-10-14T12:00:00+00:00', '', '', 50, 'common');
  `);
  gameplay.close();

  const exe = ctx.write(path.join(ctx.driveC, 'GOG Games', 'The Witcher', 'System', 'witcher.exe'), '');
  return { gameplayDb, exe };
}

test('GOG Galaxy installed in a prefix lists its played games, with their folders in drive_c', LINUX_ONLY, async () => {
  await withWinePrefix(async (ctx) => {
    const { gameplayDb, exe } = buildGalaxy(ctx);

    const records = await gogOfficial.scan();
    assert.equal(records.length, 1);
    assert.equal(records[0].appid, '1207658924');
    assert.equal(records[0].data.title, 'The Witcher');
    assert.equal(records[0].data.gameplayDbPath, gameplayDb);
    assert.equal(records[0].data.gameDir, path.join(ctx.driveC, 'GOG Games', 'The Witcher'));
    assert.equal(records[0].data.exe, exe);
    assert.equal(gogOfficial.getAchievements(records[0]).ACH_FIRST.earned, true);
  });
});

test('the Epic launcher in a prefix lists its installs, and its folder becomes a library root', LINUX_ONLY, async () => {
  await withWinePrefix(async (ctx) => {
    const library = path.join(ctx.driveC, 'Games', 'Epic');
    ctx.write(path.join(library, 'Fortnite', 'FortniteGame', 'Binaries', 'Win64', 'FortniteLauncher.exe'), '');
    fs.mkdirSync(path.join(library, 'Control'), { recursive: true });
    ctx.write(
      path.join(ctx.programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests', 'A1.item'),
      JSON.stringify({
        DisplayName: 'Fortnite',
        AppName: 'Fortnite',
        CatalogNamespace: 'fn',
        CatalogItemId: '4fe75bbc5a674f4f9b356b5c90567da5',
        InstallLocation: 'C:\\Games\\Epic\\Fortnite',
        LaunchExecutable: 'FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe',
      })
    );

    const [entry] = epicOfficial._internal.localInstallIndex();
    assert.equal(entry.installLocation, path.join(library, 'Fortnite'));
    assert.equal(entry.executablePath, path.join(library, 'Fortnite', 'FortniteGame', 'Binaries', 'Win64', 'FortniteLauncher.exe'));
    assert.equal(entry.processName, 'FortniteLauncher.exe');

    const roots = launcherLibraries.discoverLauncherLibraryRoots();
    assert.deepEqual(roots, [{ path: library, detector: 'Epic Games library' }]);
  });
});

test('GOG Galaxy and Ubisoft Connect registry entries of a prefix name folders in its drive_c', LINUX_ONLY, async () => {
  await withWinePrefix(async (ctx) => {
    ctx.writeHive('HKLM', [
      '[Software\\\\WOW6432Node\\\\GOG.com\\\\Games\\\\1207658924] 1791978481',
      '"path"="C:\\\\GOG Games\\\\The Witcher"',
      '',
      '[Software\\\\WOW6432Node\\\\Ubisoft\\\\Launcher\\\\Installs\\\\5595] 1791978481',
      '"InstallDir"="C:/Program Files (x86)/Ubisoft/Ubisoft Game Launcher/games/Far Cry 6/"',
    ]);

    assert.deepEqual(launcherLibraries.gogInstallLocations(), [path.join(ctx.driveC, 'GOG Games', 'The Witcher')]);
    assert.deepEqual(launcherLibraries.ubisoftInstallLocations(), [
      path.join(ctx.driveC, 'Program Files (x86)', 'Ubisoft', 'Ubisoft Game Launcher', 'games', 'Far Cry 6'),
    ]);
  });
});
