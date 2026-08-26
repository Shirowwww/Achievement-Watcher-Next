'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const uplayR2 = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayR2.js'));
const uplayR2Installer = require(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayR2Installer.js'));
const AdmZip = require('../../app/node_modules/adm-zip');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplayr2-'));
const savedAppData = process.env.APPDATA;
process.env.APPDATA = path.join(temp, 'AppData');

function fakePe(arch, text = '') {
  const buffer = Buffer.alloc(2048);
  buffer.writeUInt16LE(0x5a4d, 0);
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.writeUInt32LE(0x00004550, 0x80);
  buffer.writeUInt16LE(arch === 'x64' ? 0x8664 : 0x014c, 0x84);
  Buffer.from(text, 'latin1').copy(buffer, 0x200);
  return buffer;
}

(async () => {
  try {
    // derivePrefixedIds: a game whose Steam api-names all share one prefix+trailing-digits is supported.
    const consistent = uplayR2.derivePrefixedIds([
      { name: 'Ach_Prologue_1' },
      { name: 'Ach_Prologue_10' },
      { name: 'Ach_Prologue_29' },
    ]);
    assert.deepStrictEqual(consistent, { prefix: 'Ach_Prologue_', count: 3, ids: [1, 10, 29] });

    // Zero padding disappears when the loader rebuilds the key, so two names that differ only by
    // leading zeros are the same objective id. Refuse rather than drop one achievement silently.
    assert.strictEqual(
      uplayR2.derivePrefixedIds([{ name: 'Ach_Prologue_01' }, { name: 'Ach_Prologue_1' }]),
      null,
      'two api-names sharing one objective id should be reported unsupported'
    );

    // Mismatched prefixes across achievements -> unsupported (null), not a guess.
    assert.strictEqual(
      uplayR2.derivePrefixedIds([{ name: 'Ach_Prologue_1' }, { name: 'Ach_Epilogue_2' }]),
      null,
      'a game with more than one prefix family should be reported unsupported'
    );

    // An achievement whose name has no trailing digits breaks the convention entirely.
    assert.strictEqual(
      uplayR2.derivePrefixedIds([{ name: 'Ach_Prologue_1' }, { name: 'ACH_NO_DIGITS' }]),
      null,
      'a name with no trailing digits should be reported unsupported'
    );

    assert.strictEqual(uplayR2.derivePrefixedIds([]), null, 'an empty list is unsupported');
    console.log('PASS: derivePrefixedIds only accepts a single consistent prefix+digits convention');

    // buildAchievementsSchemaJson keys by prefix + objective id, which for an unpadded api-name is the
    // api-name itself.
    const schemaJson = uplayR2.buildAchievementsSchemaJson({
      achievement: {
        list: [
          { name: 'Ach_Prologue_1', displayName: 'Prologue', description: 'Complete the Prologue' },
          { name: 'Ach_Prologue_10', displayName: 'The Ronin' },
        ],
      },
    });
    assert.deepStrictEqual(schemaJson, {
      Ach_Prologue_1: { displayName: 'Prologue', description: 'Complete the Prologue', earned: 0 },
      Ach_Prologue_10: { displayName: 'The Ronin', description: '', earned: 0 },
    });

    // Loader builds without AchKeyPrefix support look the unlock up by the BARE objective id, so the
    // schema they are given has to be keyed that way or every in-game unlock misses.
    assert.deepStrictEqual(
      uplayR2.buildAchievementsSchemaJson(
        { achievement: { list: [{ name: 'Ach_Prologue_1', displayName: 'Prologue', description: 'Complete the Prologue' }] } },
        { keyed: false }
      ),
      { 1: { displayName: 'Prologue', description: 'Complete the Prologue', earned: 0 } }
    );

    /*
      Zero-padded api-names (Assassin's Creed Origins/Odyssey "001", South Park "OEI_ACH_001",
      Starlink "spc_01") must lose the padding: UPC_AchievementUnlock takes the objective id as a
      uint32 and looks up AchKeyPrefix + std::to_string(id), so a padded key is unreachable and the
      whole setup records nothing while still validating.
    */
    assert.deepStrictEqual(
      Object.keys(
        uplayR2.buildAchievementsSchemaJson({
          achievement: { list: [{ name: '001' }, { name: 'OEI_ACH_007' }, { name: 'spc_01' }, { name: 'A0010' }] },
        })
      ),
      ['1', 'OEI_ACH_7', 'spc_1', 'A10']
    );
    assert.deepStrictEqual(
      Object.keys(
        uplayR2.buildAchievementsSchemaJson({ achievement: { list: [{ name: 'OEI_ACH_007' }] } }, { keyed: false })
      ),
      ['7']
    );
    assert.strictEqual(uplayR2.canonicalObjectiveKey('ACH_NO_DIGITS'), 'ACH_NO_DIGITS');
    console.log('PASS: buildAchievementsSchemaJson keys by the objective id the loader rebuilds, padding dropped');

    // resolveSteamMapping: exact uplay_id match (Assassin's Creed II, a real entry in uplay-steam.json).
    const byId = uplayR2.resolveSteamMapping({ appid: 'UPLAY4' });
    assert.strictEqual(byId.steam_appid, 33230);
    assert.strictEqual(byId.uplay_id, '4');
    assert.strictEqual(uplayR2.resolveSteamMapping({ appid: 'uplay-4' }).steam_appid, 33230);

    const automaticIdentity = uplayR2.resolveGameIdentity({
      appid: '7654321',
      steamappid: '7654321',
      name: 'Catalog-resolved Ubisoft Game',
      uplayR2: true,
    });
    assert.strictEqual(automaticIdentity.steamAppid, '7654321');
    assert.strictEqual(automaticIdentity.mapping.steam_appid, 7654321);
    assert.strictEqual(automaticIdentity.mapping.automatic, true);
    assert.strictEqual(automaticIdentity.uplayId, '');
    assert.strictEqual(
      uplayR2.resolveGameIdentity({ appid: '4', steamappid: '4', name: 'Promoted Uplay R2', uplayR2: true }).steamAppid,
      '4',
      'a promoted numeric Steam AppID must not be reinterpreted as Ubisoft product 4'
    );

    // Regression (issue #14): the Steam variant of Far Cry 4 (Ubisoft product 971) has no direct row
    // in uplay-steam.json. It resolves by the archive spec name ("FarCry4" -> "far cry 4") through the
    // mapping's name tier when the install-folder registry key and configurations titles are
    // unavailable - no per-game row may be reintroduced.
    assert.strictEqual(uplayR2.resolveSteamMapping({ appid: 'UPLAY971' }), null);
    const fc4By971 = uplayR2.resolveSteamMapping({ appid: 'UPLAY971', name: 'far cry 4' });
    assert.strictEqual(fc4By971.steam_appid, 298110);
    assert.strictEqual(fc4By971.steam_name, 'Far Cry® 4');
    assert.notStrictEqual(fc4By971.uplay_id, '971', 'resolved by title, not by a 971-specific row');

    // Fuzzy name match should resolve to the same entry without an id.
    const byName = uplayR2.resolveSteamMapping({ name: "Assassin's Creed II" });
    assert.strictEqual(byName.steam_appid, 33230);

    // A repack folder can have an unrelated name; Ubisoft's binary install state still embeds the
    // canonical product title and must win before the folder-name fallback.
    const renamedInstall = path.join(temp, 'Totally Unrelated Repack Folder');
    fs.mkdirSync(renamedInstall, { recursive: true });
    fs.writeFileSync(
      path.join(renamedInstall, 'uplay_install.state'),
      Buffer.concat([Buffer.from([0x0a, 0x24]), Buffer.from("Assassin's Creed Black Flag Resynced"), Buffer.from([0x10, 0x01])])
    );
    const byInstallState = uplayR2.resolveSteamMapping({ gameDir: renamedInstall, name: 'Wrong Folder Name' });
    assert.strictEqual(byInstallState.steam_appid, 3751950);
    assert.strictEqual(byInstallState.uplay_id, '65043');
    assert.strictEqual(
      uplayR2.resolveSteamMapping({ appid: 'UPLAY66088' }).steam_appid,
      3751950,
      'the second Black Flag Resynced product id from upstream issue #118 resolves without replacing the mapping file by hand'
    );

    const officialIdentity = uplayR2.resolveGameIdentity({
      appid: 'uplay-65043',
      ubisoftProductId: '65043',
      name: "Assassin's Creed Black Flag Resynced",
    });
    assert.strictEqual(officialIdentity.uplayId, '65043');
    assert.strictEqual(officialIdentity.steamAppid, '3751950');

    assert.strictEqual(uplayR2.resolveSteamMapping({ appid: 'UPLAY999999999', name: 'Not A Real Game Xyzzy' }), null);
    console.log('PASS: resolveSteamMapping and UI identity normalize native, namespaced and mapped ids');

    // detectEmulator: bounded shallow walk finds the loader dll in a nested Binaries folder.
    // The stub carries the ini key names a real loader binary embeds, because inspectLoader() reads
    // them to decide whether this build understands the achievement redirect at all.
    const MODERN_LOADER = fakePe('x64', 'stub AchSavePath AchSaveType AchKeyPrefix Achievements');
    const LEGACY_LOADER = fakePe('x64', 'stub Achievements SaveType SavePath'); // pre-redirect build
    const gameDir = path.join(temp, 'My Ubisoft Game');
    const dllDir = path.join(gameDir, 'Binaries', 'Win64');
    fs.mkdirSync(dllDir, { recursive: true });
    fs.writeFileSync(path.join(dllDir, 'uplay_r2_loader64.dll'), MODERN_LOADER);
    const emu = uplayR2.detectEmulator(gameDir);
    assert.strictEqual(emu.type, 'uplayR2');
    assert.strictEqual(emu.dll.length, 1);
    assert.strictEqual(uplayR2.hasEmulatorEvidence(gameDir), true, 'Goldberg-only config keys distinguish the emulator from an official loader basename');
    assert.strictEqual(uplayR2.detectEmulator(path.join(temp, 'nonexistent')).type, 'none');
    assert.strictEqual(uplayR2.isUbisoftInstall(gameDir), true, 'a loader-only install is Ubisoft');

    const markerOnlyDir = path.join(temp, 'Unknown Ubisoft Game');
    fs.mkdirSync(markerOnlyDir, { recursive: true });
    fs.writeFileSync(path.join(markerOnlyDir, 'uplay_install.manifest'), 'opaque');
    assert.strictEqual(uplayR2.isUbisoftInstall(markerOnlyDir), true, 'an unmapped marker-only install is still Ubisoft');
    assert.strictEqual(uplayR2.hasEmulatorEvidence(markerOnlyDir), false, 'a launcher marker alone never authorizes emulator repair');
    assert.strictEqual(uplayR2.isUbisoftInstall(path.join(temp, 'nonexistent')), false, 'an ordinary folder is not Ubisoft');

    assert.strictEqual(uplayR2.isUbisoftGame({ source: 'Uplay R2' }), true);
    assert.strictEqual(uplayR2.isUbisoftGame({ system: 'uplay' }), true);
    assert.strictEqual(uplayR2.isUbisoftGame({ uplayR2: true }), true);
    assert.strictEqual(uplayR2.isUbisoftGame({ appid: 'UPLAY65043' }), true);
    assert.strictEqual(uplayR2.isUbisoftGame({ source: 'GBE Fork', appid: '3751950' }), false);
    assert.strictEqual(
      uplayR2.isUplayR2Game({ appid: 'uplay-6100', source: 'Ubisoft Connect', system: 'uplay', data: { type: 'ubisoftOfficial' } }),
      false,
      'official namespaced Ubisoft games must not receive emulator repair'
    );
    assert.strictEqual(uplayR2.isUplayR2Game({ source: 'Uplay R2' }), true);
    assert.strictEqual(uplayR2.isUplayR2Game({ uplayR2: true, appid: '3751950' }), true);
    console.log('PASS: Ubisoft classifier covers loaders, install markers, flags, system and legacy ids');

    const toolPaths = uplayR2.getGameToolPaths({
      appid: '3751950',
      name: "Assassin's Creed Black Flag Resynced",
      gameDir,
      uplayR2: true,
    });
    assert.strictEqual(toolPaths.steamAppid, '3751950');
    assert.strictEqual(toolPaths.uplayId, '65043');
    assert.strictEqual(toolPaths.runtimeDir, dllDir);
    // The loader opens upc_r2.ini first and only falls back to uplay_r2.ini, so that precedence is
    // what INI_NAMES (and therefore the reported config file) must follow.
    assert.strictEqual(uplayR2.INI_NAMES[0], 'upc_r2.ini');
    assert.strictEqual(toolPaths.configFile, path.join(dllDir, 'upc_r2.ini'));
    assert.strictEqual(toolPaths.schemaFile, path.join(dllDir, 'achievements_schema.json'));
    assert.strictEqual(toolPaths.saveDir, path.join(process.env.APPDATA, 'GSE Saves', '3751950'));
    assert.strictEqual(toolPaths.loader.supportsAchRedirect, true, 'the modern stub advertises redirect support');

    const sourceIcon = path.join(__dirname, '..', '..', 'app', 'Source', 'ubisoft.svg');
    assert.ok(fs.existsSync(sourceIcon), 'the Ubisoft source must ship a dedicated icon');
    assert.match(fs.readFileSync(sourceIcon, 'utf8'), /aria-label="Ubisoft Connect"/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8'), /getSourceImg\('ubisoft'\)/);
    console.log('PASS: Ubisoft UI tools expose mapped ids, runtime paths and a dedicated source icon');

    // diagnose(): no dll yet -> NO_UPLAY_R2_DLL, no read/write attempted.
    const emptyDir = path.join(temp, 'Empty Game');
    fs.mkdirSync(emptyDir, { recursive: true });
    const noDllReport = uplayR2.diagnose({ gameDir: emptyDir, appid: 'UPLAY4' });
    assert.strictEqual(noDllReport.ok, false);
    assert.ok(noDllReport.issues.some((i) => i.code === 'NO_UPLAY_R2_DLL'));

    // repair(): full round trip - schema + ini written, DLC/Items/Chunks preserved, GSE Saves pre-created.
    const repair1 = uplayR2.repair({
      dir: dllDir,
      steamAppid: 33230,
      schema: { achievement: { list: [{ name: 'Ach_Prologue_1', displayName: 'Prologue', description: 'Complete the Prologue' }] } },
      prefix: 'Ach_Prologue_',
      accountName: 'Shiro',
      language: 'french',
      logging: true,
    });
    assert.strictEqual(repair1.wroteSchema, true);
    assert.ok(repair1.backupDir, 'first repair records newly created files so the operation can be undone');
    const firstManifest = JSON.parse(fs.readFileSync(path.join(repair1.backupDir, uplayR2.BACKUP_MANIFEST), 'utf8'));
    assert.ok(firstManifest.files.every((entry) => entry.existed === false), 'the first snapshot records that generated files were absent');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(dllDir, 'achievements_schema.json'), 'utf8')),
      { Ach_Prologue_1: { displayName: 'Prologue', description: 'Complete the Prologue', earned: 0 } }
    );

    const expectedSavePath = path.join(process.env.APPDATA, 'GSE Saves', '33230');
    assert.equal(fs.existsSync(expectedSavePath), false, 'repair leaves the external save tree to the runtime, keeping the setup fully reversible');

    for (const iniName of uplayR2.INI_NAMES) {
      const ini = fs.readFileSync(path.join(dllDir, iniName), 'utf8');
      assert.ok(/Achievements\s*=\s*1/.test(ini), `${iniName} should enable Achievements`);
      assert.ok(/AchKeyPrefix\s*=\s*Ach_Prologue_/.test(ini), `${iniName} should set AchKeyPrefix`);
      assert.ok(/AchSaveType\s*=\s*1/.test(ini), `${iniName} should redirect AchSaveType`);
      assert.ok(ini.includes(expectedSavePath), `${iniName} should point AchSavePath at GSE Saves\\33230`);
      assert.ok(/Username\s*=\s*Shiro/.test(ini), `${iniName} should stamp the account name`);
      assert.ok(/Language\s*=\s*fr-FR/.test(ini), `${iniName} should convert the Steam language to a loader locale`);
      assert.ok(/Logging\s*=\s*1/.test(ini), `${iniName} should enable diagnostic logging when requested`);
      assert.ok(/\[DLC\]/.test(ini) && /\[Items\]/.test(ini) && /\[Chunks\]/.test(ini), `${iniName} should keep the DLC/Items/Chunks sections`);
    }
    assert.strictEqual(uplayR2.normalizeLoaderLanguage('latam'), 'es-MX');
    assert.strictEqual(uplayR2.normalizeLoaderLanguage('ukrainian'), 'en-US', 'unsupported loader locales fall back safely');
    console.log('PASS: repair writes achievements_schema.json + patches both ini variants');

    // A second repair must never overwrite the UserId already on disk (would orphan the runtime save),
    // and must back up the previous schema/ini.
    const savedUserId = fs.readFileSync(path.join(dllDir, 'uplay_r2.ini'), 'utf8').match(/UserId\s*=\s*(\S+)/)[1];
    const repair2 = uplayR2.repair({
      dir: dllDir,
      steamAppid: 33230,
      schema: { achievement: { list: [{ name: 'Ach_Prologue_1', displayName: 'Prologue' }, { name: 'Ach_Prologue_10', displayName: 'The Ronin' }] } },
      prefix: 'Ach_Prologue_',
    });
    assert.ok(repair2.backupDir, 'second repair should back up the previous schema/ini');
    assert.ok(fs.existsSync(path.join(repair2.backupDir, 'files', 'achievements_schema.json')));
    const userIdAfter = fs.readFileSync(path.join(dllDir, 'uplay_r2.ini'), 'utf8').match(/UserId\s*=\s*(\S+)/)[1];
    assert.strictEqual(userIdAfter, savedUserId, 'repair must never overwrite an existing UserId');
    assert.strictEqual(Object.keys(repair2.achievementsSchemaJson).length, 2, 'repair should reflect the updated schema');
    console.log('PASS: repair backs up the previous config and never orphans the UserId');

    // diagnose() now reports a valid setup + the runtime save state.
    const goodReport = uplayR2.diagnose({ gameDir, appid: 'UPLAY4' });
    assert.strictEqual(goodReport.ok, true, `expected ok diagnose, got issues: ${JSON.stringify(goodReport.issues)}`);
    assert.strictEqual(goodReport.mapping.steam_appid, 33230);
    assert.ok(goodReport.issues.some((i) => i.code === 'NO_SAVE_YET'), 'no unlocks written yet is expected, not an error');
    console.log('PASS: diagnose reports a fully configured Uplay R2 setup');

    /*
      A schema key the loader can never rebuild is the difference between "records nothing" and
      "records nothing while looking valid". Keys are checked against what this build actually looks
      up: the ini's AchKeyPrefix (empty when the loader ignores that key) plus a plain decimal.
    */
    const schemaOnDisk = path.join(dllDir, 'achievements_schema.json');
    const snapshot = { schema: fs.readFileSync(schemaOnDisk), inis: uplayR2.INI_NAMES.map((n) => [path.join(dllDir, n), fs.readFileSync(path.join(dllDir, n))]) };
    const diagnoseKeys = (keys) => {
      fs.writeFileSync(schemaOnDisk, JSON.stringify(Object.fromEntries(keys.map((k) => [k, { displayName: k, earned: 0 }]))));
      return uplayR2.diagnose({ gameDir, appid: 'UPLAY4' }).issues.filter((i) => i.code === 'SCHEMA_KEYS_NOT_CANONICAL');
    };

    assert.deepStrictEqual(diagnoseKeys(['Ach_Prologue_1', 'Ach_Prologue_10']), [], 'canonical prefixed keys are the supported shape');
    const padded = diagnoseKeys(['Ach_Prologue_01', 'Ach_Prologue_10']);
    assert.strictEqual(padded.length, 1, 'a zero-padded key is unreachable and must be reported');
    assert.ok(padded[0].message.includes('Ach_Prologue_01'), `the offending key should be named: ${padded[0].message}`);
    assert.strictEqual(diagnoseKeys(['NOT_MY_PREFIX_1']).length, 1, 'a key outside the configured prefix is unreachable too');

    // Anno 1800 ships api-names that are bare numbers, so an empty AchKeyPrefix with numeric keys is
    // a correct setup - the old heuristic called it broken and made the repair unfixable.
    uplayR2.repair({ dir: dllDir, gameDir, steamAppid: 33230, prefix: '', backup: false, schema: { achievement: { list: [{ name: '1' }, { name: '2' }] } } });
    const bareReport = uplayR2.diagnose({ gameDir, appid: 'UPLAY4' });
    assert.deepStrictEqual(bareReport.issues.filter((i) => i.code === 'SCHEMA_KEYS_NOT_CANONICAL'), [], 'bare numeric keys with an empty prefix are valid');
    assert.strictEqual(bareReport.ok, true, `expected ok diagnose, got: ${JSON.stringify(bareReport.issues)}`);

    fs.writeFileSync(schemaOnDisk, snapshot.schema);
    for (const [file, bytes] of snapshot.inis) fs.writeFileSync(file, bytes);
    console.log('PASS: diagnose rejects only the schema keys this loader build cannot rebuild');

    // The package cache is validated, not trusted by filename. A non-PE or a 32-bit image wearing a
    // 64-bit loader name is never eligible for installation.
    const cacheDir = path.join(temp, 'cache', 'uplayR2');
    let dlls = uplayR2Installer.ensureEmulatorDlls({ cacheDir });
    assert.strictEqual(dlls.seeded, false, 'an empty cache should report not seeded');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'uplay_r2_loader64.dll'), fakePe('x86', 'Achievements'));
    dlls = uplayR2Installer.ensureEmulatorDlls({ cacheDir });
    assert.strictEqual(dlls.seeded, false);
    assert.strictEqual(dlls.invalid[0].error, 'ARCH_MISMATCH');
    console.log('PASS: uplayR2Installer rejects misleading filenames and wrong-architecture DLLs');

    /*
      Legacy loader (no AchSaveType/AchSavePath/AchKeyPrefix support): writing the redirect keys
      produces an ini that reads as fully configured while the emulator quietly keeps saving to its
      own folder and looks unlocks up by bare objective id - the silent failure behind "the
      achievements don't work". repair() must adapt both the ini it writes and how it keys the schema.
    */
    const legacyDir = path.join(temp, 'Legacy Ubisoft Game');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'upc_r2_loader64.dll'), LEGACY_LOADER);
    const legacyRepair = uplayR2.repair({
      dir: legacyDir,
      steamAppid: 3751950,
      schema: { achievement: { list: [{ name: 'ACObsidian_Ach_1', displayName: 'Last to Leave' }, { name: 'ACObsidian_Ach_7', displayName: 'Fort Fight' }] } },
      prefix: 'ACObsidian_Ach_',
    });
    assert.strictEqual(legacyRepair.loader.supportsAchRedirect, false);
    assert.deepStrictEqual(Object.keys(legacyRepair.achievementsSchemaJson), ['1', '7'], 'a legacy loader gets bare objective ids');
    for (const iniName of uplayR2.INI_NAMES) {
      const ini = fs.readFileSync(path.join(legacyDir, iniName), 'utf8');
      assert.ok(/Achievements\s*=\s*1/.test(ini), `${iniName} should still enable achievements`);
      assert.ok(!/^[ \t]*AchSavePath[ \t]*=[ \t]*\S/m.test(ini), `${iniName} must not claim a redirect the loader ignores`);
    }
    console.log('PASS: repair adapts schema keys and ini keys to a legacy loader build');

    // Reading back what such a build wrote: its own save folder, keyed by bare objective id.
    const legacySaveDir = path.join(process.env.APPDATA, 'Goldberg UplayEmu Saves', '65043');
    fs.mkdirSync(legacySaveDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacySaveDir, 'achievements.json'),
      JSON.stringify({
        1: { displayName: 'Last to Leave', earned: 1, earned_time: 1750000000 },
        7: { displayName: 'Fort Fight', earned: 0 },
      })
    );
    const saveDirs = uplayR2.resolveAchievementSaveDirs({ gameDir: legacyDir, runtimeDir: legacyDir, uplayId: '65043', steamAppid: 3751950 });
    assert.ok(saveDirs.includes(legacySaveDir), `the emulator's default save folder must be a candidate: ${saveDirs.join(', ')}`);
    const legacySave = uplayR2.readAchievementSave(saveDirs);
    assert.strictEqual(legacySave.dir, legacySaveDir);

    const remapped = uplayR2.mapSaveToSchemaKeys(legacySave.entries, {
      prefix: 'ACObsidian_Ach_',
      apiNames: ['ACObsidian_Ach_1', 'ACObsidian_Ach_7', 'ACObsidian_Ach_9'],
    });
    assert.deepStrictEqual(Object.keys(remapped).sort(), ['ACObsidian_Ach_1', 'ACObsidian_Ach_7']);
    assert.strictEqual(remapped.ACObsidian_Ach_1.earned, 1);
    assert.strictEqual(remapped.ACObsidian_Ach_1.earned_time, 1750000000);

    // A save that uses the prefixed keys (modern loader) resolves through the same call, and a key
    // belonging to no achievement in this game's schema is dropped rather than guessed at.
    assert.deepStrictEqual(
      Object.keys(uplayR2.mapSaveToSchemaKeys({ ACObsidian_Ach_7: { earned: 1 }, ACOther_Ach_3: { earned: 1 } }, { prefix: 'ACObsidian_Ach_', apiNames: ['ACObsidian_Ach_7'] })),
      ['ACObsidian_Ach_7']
    );

    /*
      A zero-padded schema (AC Origins/Odyssey) is written unpadded, so the loader's save keys read
      back onto the padded api-names - both the prefixed form and the bare id a legacy build writes.
      An unlock always wins over the seeded earned:0 copy of the same achievement.
    */
    const paddedNames = ['OEI_ACH_001', 'OEI_ACH_007', 'OEI_ACH_010'];
    const paddedInfo = uplayR2.derivePrefixedIds(paddedNames.map((name) => ({ name })));
    const paddedRemap = uplayR2.mapSaveToSchemaKeys(
      {
        OEI_ACH_001: { earned: 0 },
        OEI_ACH_1: { earned: 1, earned_time: 1750000000 },
        OEI_ACH_7: { earned: 1, earned_time: 1750000001 },
        10: { earned: 1, earned_time: 1750000002 },
      },
      { prefix: paddedInfo.prefix, apiNames: paddedNames, canonical: true }
    );
    assert.deepStrictEqual(Object.keys(paddedRemap).sort(), ['OEI_ACH_001', 'OEI_ACH_007', 'OEI_ACH_010']);
    assert.strictEqual(paddedRemap.OEI_ACH_001.earned, 1, 'an unlock must beat the seeded earned:0 entry for the same id');
    assert.strictEqual(paddedRemap.OEI_ACH_010.earned_time, 1750000002, 'a bare objective id resolves onto the padded api-name');

    /*
      The numeric comparison is only ever allowed when derivePrefixedIds proved the ids are unique.
      "ACH_FS_01" and "ACH_FSDLC_1" (a real Steam pair) both reduce to objective id 1, so padded and
      unpadded keys must stay distinct there: each still resolves by its literal digits, exactly as
      before this rule existed, and asking for the numeric path changes nothing.
    */
    const ambiguousNames = ['ACH_FS_01', 'ACH_FSDLC_1'];
    assert.strictEqual(uplayR2.derivePrefixedIds(ambiguousNames.map((name) => ({ name }))), null);
    const ambiguousSave = { '01': { earned: 1 }, 1: { earned: 1 } };
    const literal = uplayR2.mapSaveToSchemaKeys(ambiguousSave, { prefix: '', apiNames: ambiguousNames });
    assert.deepStrictEqual(Object.keys(literal).sort(), ['ACH_FSDLC_1', 'ACH_FS_01'].sort());
    assert.deepStrictEqual(
      uplayR2.mapSaveToSchemaKeys(ambiguousSave, { prefix: '', apiNames: ambiguousNames, canonical: true }),
      literal,
      'a colliding objective id must never change how an entry resolves'
    );
    console.log('PASS: mapSaveToSchemaKeys reads back unpadded objective ids without ever resolving an ambiguous one');

    /*
      Several candidate folders routinely hold an achievements.json at once - the emulator seeds a
      locked copy from the schema, a previous SaveType leaves one behind, and repair() pre-creates the
      redirect target. Stopping at the first file found would let a stale all-zero copy mask the one
      the game is really writing, so the read merges them and an unlock always wins over a lock.
    */
    const staleDir = path.join(legacyDir, 'saves', '65043');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(
      path.join(staleDir, 'achievements.json'),
      JSON.stringify({ 1: { earned: 0 }, 7: { earned: 0 }, 12: { earned: 1, earned_time: 1750000900 } })
    );
    const mergedSave = uplayR2.readAchievementSave(
      uplayR2.resolveAchievementSaveDirs({ gameDir: legacyDir, runtimeDir: legacyDir, uplayId: '65043', steamAppid: 3751950 })
    );
    assert.ok(mergedSave.files.length >= 2, `both saves should be read, got ${JSON.stringify(mergedSave.files)}`);
    assert.equal(mergedSave.entries['1'].earned, 1, 'an unlock in one file must not be masked by a lock in another');
    assert.equal(mergedSave.entries['12'].earned, 1, 'an unlock only present in the second file must still be seen');

    // Same rule for timestamps: the most recent unlock wins.
    fs.writeFileSync(path.join(staleDir, 'achievements.json'), JSON.stringify({ 1: { earned: 1, earned_time: 1760000000 } }));
    const newest = uplayR2.readAchievementSave(
      uplayR2.resolveAchievementSaveDirs({ gameDir: legacyDir, runtimeDir: legacyDir, uplayId: '65043', steamAppid: 3751950 })
    );
    assert.equal(newest.entries['1'].earned_time, 1760000000);
    fs.rmSync(path.join(legacyDir, 'saves'), { recursive: true, force: true });
    console.log('PASS: unlock state is merged across every save folder, never masked by a stale copy');

    // An ini pointing somewhere custom is honoured ahead of the defaults.
    const customSaveDir = path.join(temp, 'custom-saves');
    fs.writeFileSync(path.join(legacyDir, 'upc_r2.ini'), '[Settings]\nAchievements = 1\nSaveType = 2\nSavePath = ' + customSaveDir + '\n');
    assert.strictEqual(
      uplayR2.resolveAchievementSaveDirs({ gameDir: legacyDir, runtimeDir: legacyDir, uplayId: '65043', steamAppid: 3751950 })[0],
      customSaveDir
    );
    console.log('PASS: unlocks are read from wherever the emulator actually writes them, re-keyed to Steam api-names');

    // diagnose() must surface a wiped setup rather than silently reporting 0%: a game update that
    // re-extracts the repack removes achievements_schema.json and restores its own ini.
    fs.rmSync(path.join(legacyDir, 'achievements_schema.json'));
    fs.writeFileSync(path.join(legacyDir, 'upc_r2.ini'), '[Settings]\nAchievements = 0\n');
    const wipedReport = uplayR2.diagnose({ gameDir: legacyDir, appid: 'UPLAY65043' });
    assert.strictEqual(wipedReport.ok, false);
    assert.ok(wipedReport.issues.some((i) => i.code === 'NO_SCHEMA_JSON'), 'a missing schema is an error');
    assert.ok(wipedReport.issues.some((i) => i.code === 'ACHIEVEMENTS_DISABLED'), 'Achievements=0 is an error, not a warning');
    assert.ok(wipedReport.issues.some((i) => i.code === 'LOADER_NO_ACH_REDIRECT'), 'the loader limitation is reported');
    console.log('PASS: diagnose detects a setup wiped by a game update');

    /*
      Full round trip for the shape that used to be a silent no-op: Assassin's Creed Origins ships
      Steam api-names "001".."067", so every key the old builder wrote was one the loader could never
      rebuild from a uint32 objective id. Repair, validate, then read back the save the emulator
      writes - with its seeded earned:0 copy still present, as it is on a re-applied setup.
    */
    const paddedDir = path.join(temp, 'AC Origins');
    fs.mkdirSync(paddedDir, { recursive: true });
    fs.writeFileSync(path.join(paddedDir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements AchKeyPrefix AchSaveType AchSavePath'));
    const paddedList = ['001', '002', '067'].map((name) => ({ name, displayName: `Objective ${name}` }));
    const paddedPrefix = uplayR2.derivePrefixedIds(paddedList);
    assert.deepStrictEqual(paddedPrefix, { prefix: '', count: 3, ids: [1, 2, 67] });

    const paddedRepair = uplayR2.repair({
      dir: paddedDir,
      gameDir: paddedDir,
      steamAppid: 582160,
      prefix: paddedPrefix.prefix,
      schema: { achievement: { list: paddedList } },
    });
    assert.deepStrictEqual(Object.keys(paddedRepair.achievementsSchemaJson), ['1', '2', '67']);

    const paddedReport = uplayR2.diagnose({
      gameDir: paddedDir,
      appid: 582160,
      mapping: { uplay_id: '3539', steam_appid: 582160, steam_name: 'Assassin\'s Creed Origins' },
    });
    assert.strictEqual(paddedReport.ok, true, `expected ok diagnose, got: ${JSON.stringify(paddedReport.issues)}`);
    assert.deepStrictEqual(paddedReport.issues.filter((i) => i.code === 'SCHEMA_KEYS_NOT_CANONICAL'), []);

    const paddedSaveDir = path.join(process.env.APPDATA, 'GSE Saves', '582160');
    fs.mkdirSync(paddedSaveDir, { recursive: true });
    fs.writeFileSync(
      path.join(paddedSaveDir, 'achievements.json'),
      JSON.stringify({ 1: { earned: true, earned_time: 1750000000 }, 2: { earned: 0 }, '067': { earned: 0 }, 67: { earned: true, earned_time: 1750000009 } })
    );
    const paddedSave = uplayR2.readAchievementSave(
      uplayR2.resolveAchievementSaveDirs({ gameDir: paddedDir, runtimeDir: paddedDir, uplayId: '3539', steamAppid: 582160 })
    );
    const paddedMapped = uplayR2.mapSaveToSchemaKeys(paddedSave.entries, {
      prefix: paddedPrefix.prefix,
      apiNames: paddedList.map((a) => a.name),
      canonical: true,
    });
    assert.deepStrictEqual(Object.keys(paddedMapped).sort(), ['001', '002', '067']);
    assert.strictEqual(paddedMapped['001'].earned, true, 'the unlock the emulator wrote as "1" belongs to api-name "001"');
    assert.strictEqual(paddedMapped['067'].earned, true, 'an unlock always beats the seeded earned:0 entry for the same objective');
    assert.strictEqual(paddedMapped['002'].earned, 0);
    console.log('PASS: a zero-padded Steam schema round-trips through repair, diagnose and read-back');

    /*
      Re-applying a fix that changes the keys must also let the loader rebuild its runtime save, which
      it only seeds when the file is absent. The empty leftover goes; anything holding an unlock, or
      still sharing a key with the new schema, is left exactly where it is.
    */
    const staleSaveFile = path.join(paddedSaveDir, 'achievements.json');
    const stale = (contents) => {
      fs.writeFileSync(staleSaveFile, JSON.stringify(contents));
      return uplayR2.removeStaleRuntimeSave(paddedSaveDir, { 1: {}, 2: {}, 67: {} });
    };
    assert.strictEqual(stale({ '001': { earned: 0 }, '002': { earned: 0 } }), true, 'an unreachable, empty runtime save is rebuilt');
    assert.strictEqual(fs.existsSync(staleSaveFile), false);
    assert.strictEqual(stale({ '001': { earned: 1 } }), false, 'a save holding an unlock is never removed');
    assert.strictEqual(stale({ 1: { earned: 0 }, '002': { earned: 0 } }), false, 'a save the new schema still addresses is kept');
    assert.strictEqual(stale({}), false);
    // "constructor" is not a key of the schema, only of every object: an own-property test is what
    // keeps it unreachable-and-removable instead of silently protecting the file.
    assert.strictEqual(stale({ constructor: { earned: 0 } }), true);
    fs.rmSync(staleSaveFile, { force: true });
    assert.strictEqual(uplayR2.removeStaleRuntimeSave(paddedSaveDir, { 1: {} }), false, 'a missing save is not an error');
    assert.strictEqual(uplayR2.removeStaleRuntimeSave('', { 1: {} }), false);
    console.log('PASS: repair only clears a runtime save that provably holds nothing');

    /*
      Games whose Steam api-names carry no objective id at all (Brawlhalla, The Crew 2, ZOMBI, most
      Ubisoft-published indies) used to be refused outright. Ubisoft Connect caches the real objective
      definitions for every product whose achievements page it has shown, so when that archive is on
      disk the ids come from Ubisoft itself, joined to the Steam list on the achievement title.
    */
    const archiveRoot = path.join(temp, 'ubisoft-achievements');
    fs.mkdirSync(archiveRoot, { recursive: true });
    const archive = new AdmZip();
    const locFile = (rows) => Buffer.from(rows.map((row) => row.join('\t')).join('\n') + '\n', 'utf8');
    archive.addFile('en-US_loc.txt', locFile([
      ['7', 'Ruler of the Streets', 'Win a street race'],
      ['12', 'Creative Thinker', 'Build a machine'],
      ['40', 'All Clear', 'Finish the story'],
    ]));
    archive.addFile('fr-FR_loc.txt', locFile([
      ['7', 'Roi de la rue', 'Gagner une course'],
      ['12', 'Esprit creatif', 'Construire une machine'],
    ]));
    fs.writeFileSync(path.join(archiveRoot, '4321_spechash'), archive.toBuffer());

    const unkeyedList = [
      { name: 'Ruler_of_the_Streets', displayName: 'Ruler of the Streets' },
      { name: 'Creative_Thinker', displayName: 'Creative Thinker' },
      { name: 'All_Clear', displayName: 'All Clear' },
    ];
    assert.strictEqual(uplayR2.derivePrefixedIds(unkeyedList), null, 'these api-names carry no objective id');
    const archiveKeying = uplayR2.resolveObjectiveKeying({ achievementList: unkeyedList, uplayId: '4321', achievementsRoot: archiveRoot });
    assert.strictEqual(archiveKeying.origin, 'ubisoft-archive');
    assert.strictEqual(archiveKeying.prefix, '', 'an id taken from Ubisoft needs no api-name prefix');
    assert.deepStrictEqual([...archiveKeying.objectiveIds], [['Ruler_of_the_Streets', '7'], ['Creative_Thinker', '12'], ['All_Clear', '40']]);

    // A localized schema joins on the same archive, because every shipped language is indexed.
    const frenchKeying = uplayR2.resolveObjectiveKeying({
      achievementList: [{ name: 'Creative_Thinker', displayName: 'Esprit creatif' }],
      uplayId: '4321',
      achievementsRoot: archiveRoot,
    });
    assert.deepStrictEqual([...frenchKeying.objectiveIds], [['Creative_Thinker', '12']]);

    // No archive, no convention: still refused, so nothing invented lands in a game folder.
    assert.strictEqual(uplayR2.resolveObjectiveKeying({ achievementList: unkeyedList, uplayId: '4321' , achievementsRoot: path.join(temp, 'nope') }), null);
    assert.strictEqual(uplayR2.resolveObjectiveKeying({ achievementList: unkeyedList, uplayId: '' }), null);

    const archiveDir = path.join(temp, 'The Crew 2');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements AchKeyPrefix AchSaveType AchSavePath'));
    uplayR2.repair({
      dir: archiveDir,
      gameDir: archiveDir,
      steamAppid: 646910,
      prefix: archiveKeying.prefix,
      objectiveIds: archiveKeying.objectiveIds,
      backup: false,
      schema: { achievement: { list: unkeyedList } },
    });
    assert.deepStrictEqual(
      Object.keys(JSON.parse(fs.readFileSync(path.join(archiveDir, uplayR2.ACH_SCHEMA_FILE), 'utf8'))),
      ['7', '12', '40'],
      'the schema is keyed by the objective ids Ubisoft published'
    );
    for (const iniName of uplayR2.INI_NAMES) {
      assert.match(fs.readFileSync(path.join(archiveDir, iniName), 'utf8'), /AchKeyPrefix\s*=\s*$/m, `${iniName} must leave AchKeyPrefix empty`);
    }
    const archiveReport = uplayR2.diagnose({
      gameDir: archiveDir,
      appid: 646910,
      mapping: { uplay_id: '4321', steam_appid: 646910, steam_name: 'The Crew 2' },
    });
    assert.strictEqual(archiveReport.ok, true, `expected ok diagnose, got: ${JSON.stringify(archiveReport.issues)}`);
    assert.deepStrictEqual(archiveReport.issues.filter((i) => i.code === 'SCHEMA_KEYS_NOT_CANONICAL'), []);

    const archiveMapped = uplayR2.mapSaveToSchemaKeys(
      { 7: { earned: true, earned_time: 3 }, 12: { earned: 0 }, 99: { earned: true } },
      { prefix: '', apiNames: unkeyedList.map((a) => a.name), objectiveIds: archiveKeying.objectiveIds }
    );
    assert.deepStrictEqual(Object.keys(archiveMapped).sort(), ['Creative_Thinker', 'Ruler_of_the_Streets']);
    assert.strictEqual(archiveMapped.Ruler_of_the_Streets.earned, true);
    console.log('PASS: a game whose api-names carry no objective id is keyed from Ubisoft own archive');

    /*
      Uplay R1: the same emulator one generation earlier, which is the only one a 2014-2018 Ubisoft
      title ever loads. It keeps the identical achievement contract under its own names - [Uplay]
      instead of [Settings], its own ini and save root - so both generations share this code.
    */
    const r1Dir = path.join(temp, 'Far Cry 4');
    fs.mkdirSync(r1Dir, { recursive: true });
    fs.writeFileSync(path.join(r1Dir, 'upc_r1_loader64.dll'), fakePe('x64', 'Achievements AchKeyPrefix AchSaveType AchSavePath'));
    assert.strictEqual(uplayR2.flavourForDir(r1Dir).id, 'r1', 'the loader on disk names the generation');
    assert.strictEqual(uplayR2.flavourForDll('upc_r2_loader.dll').id, 'r2');
    assert.strictEqual(uplayR2.flavourForDll('steam_api64.dll'), null);

    const r1List = [{ name: 'FarCry4_Ach_1' }, { name: 'FarCry4_Ach_60' }];
    const r1Keying = uplayR2.resolveObjectiveKeying({ achievementList: r1List, uplayId: '420' });
    const r1Repair = uplayR2.repair({
      dir: r1Dir,
      gameDir: r1Dir,
      steamAppid: 298110,
      prefix: r1Keying.prefix,
      objectiveIds: r1Keying.objectiveIds,
      backup: false,
      logging: true,
      schema: { achievement: { list: r1List } },
    });
    assert.strictEqual(r1Repair.ini.flavour, 'r1');
    assert.deepStrictEqual(Object.keys(r1Repair.achievementsSchemaJson), ['FarCry4_Ach_1', 'FarCry4_Ach_60']);

    for (const iniName of uplayR2.FLAVOURS.r1.iniNames) {
      const ini = fs.readFileSync(path.join(r1Dir, iniName), 'utf8');
      assert.match(ini, /^\[Uplay\]/m, `${iniName} keeps the R1 section, not [Settings]`);
      assert.match(ini, /Achievements\s*=\s*1/, `${iniName} enables achievements`);
      assert.match(ini, /AchKeyPrefix\s*=\s*FarCry4_Ach_/, `${iniName} sets the key prefix`);
      assert.match(ini, /AchSaveType\s*=\s*1/, `${iniName} redirects the achievement save`);
      assert.ok(ini.includes(path.join(process.env.APPDATA, 'GSE Saves', '298110')), `${iniName} points at GSE Saves`);
      assert.match(ini, /Logging\s*=\s*1/, `${iniName} carries the diagnostic switch`);
    }
    for (const iniName of uplayR2.FLAVOURS.r2.iniNames) {
      assert.strictEqual(fs.existsSync(path.join(r1Dir, iniName)), false, `${iniName} belongs to the other generation and must not appear`);
    }

    const r1Report = uplayR2.diagnose({
      gameDir: r1Dir,
      appid: 'UPLAY420',
      mapping: { uplay_id: '420', steam_appid: 298110, steam_name: 'Far Cry 4' },
    });
    assert.strictEqual(r1Report.flavour, 'r1');
    assert.strictEqual(r1Report.ok, true, `expected ok diagnose, got: ${JSON.stringify(r1Report.issues)}`);

    // Its own default save root is a candidate, and a save written there reads back.
    const r1SaveDir = path.join(process.env.APPDATA, 'R1 UplayEmu Saves', '420');
    const r1Dirs = uplayR2.resolveAchievementSaveDirs({ gameDir: r1Dir, runtimeDir: r1Dir, uplayId: '420', steamAppid: 298110 });
    assert.ok(
      r1Dirs.some((dir) => path.normalize(dir).toLowerCase() === path.normalize(r1SaveDir).toLowerCase()),
      `the R1 save root must be probed: ${r1Dirs.join(', ')}`
    );
    fs.mkdirSync(r1SaveDir, { recursive: true });
    fs.writeFileSync(path.join(r1SaveDir, 'achievements.json'), JSON.stringify({ FarCry4_Ach_60: { earned: 1, earned_time: 1750000000 } }));
    const r1Save = uplayR2.readAchievementSave(r1Dirs);
    const r1Mapped = uplayR2.mapSaveToSchemaKeys(r1Save.entries, { prefix: r1Keying.prefix, apiNames: r1List.map((a) => a.name), canonical: true });
    assert.strictEqual(r1Mapped.FarCry4_Ach_60.earned, 1);
    console.log('PASS: an Uplay R1 install is configured, validated and read through the same code as R2');
    // A leftover DLL from the other generation is dead weight the game never loads. Letting it into
    // the capability probe would strip the redirect the active loader does support.
    fs.writeFileSync(path.join(r1Dir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements only, an old crack left behind'));
    const mixed = uplayR2.diagnose({
      gameDir: r1Dir,
      appid: 'UPLAY420',
      mapping: { uplay_id: '420', steam_appid: 298110, steam_name: 'Far Cry 4' },
      flavour: 'r1',
    });
    assert.strictEqual(mixed.flavour, 'r1');
    assert.strictEqual(mixed.loader.supportsAchRedirect, true, 'the R1 loader in use still supports the redirect');
    assert.deepStrictEqual(mixed.issues.filter((i) => i.code === 'LOADER_NO_ACH_REDIRECT'), []);
    fs.rmSync(path.join(r1Dir, 'upc_r2_loader64.dll'));
    console.log('PASS: a leftover loader from the other generation never degrades the active one');

    /*
      The loader log is the only record of what the GAME asked for, and it separates the two failures
      that look identical from outside: a game that never calls the achievement API, and one that
      calls it naming an objective the schema does not carry.
    */
    const logFile = path.join(r1Dir, uplayR2.FLAVOURS.r1.logFile);
    // The log is only consulted while nothing has unlocked yet: with progress on record there is
    // nothing to explain. Clear the save this test wrote earlier so that branch is reachable.
    fs.rmSync(path.join(r1SaveDir, 'achievements.json'), { force: true });
    const diagnoseWithLog = (body) => {
      if (body === null) fs.rmSync(logFile, { force: true });
      else fs.writeFileSync(logFile, body);
      return uplayR2.diagnose({
        gameDir: r1Dir,
        appid: 'UPLAY420',
        mapping: { uplay_id: '420', steam_appid: 298110, steam_name: 'Far Cry 4' },
        flavour: 'r1',
      }).issues;
    };

    assert.ok(diagnoseWithLog(null).some((i) => i.code === 'NO_LOADER_LOG'), 'with no log, say how to get one');

    const quiet = diagnoseWithLog('[00:00:00.000][INFO]  UPLAY_Start => aUplayId (420)\nParsing achievements schema...\n');
    assert.ok(quiet.some((i) => i.code === 'LOADER_LOG_NO_ACH_CALL'), 'the game never asked: this fix cannot serve it');
    assert.deepStrictEqual(quiet.filter((i) => i.code === 'LOADER_LOG_UNKNOWN_OBJECTIVE'), []);

    const wrong = diagnoseWithLog('[00:00:00.000][INFO]  UPLAY_ACH_EarnAchievement => overlapped (0), achievementId (4242)\n');
    const mismatch = wrong.find((i) => i.code === 'LOADER_LOG_UNKNOWN_OBJECTIVE');
    assert.ok(mismatch, 'an objective the schema lacks means the mapping is wrong, not the game');
    assert.ok(mismatch.message.includes('4242'), `the report must name the id: ${mismatch && mismatch.message}`);

    const known = diagnoseWithLog('[00:00:00.000][INFO]  UPLAY_ACH_EarnAchievement => achievementId (1)\n');
    assert.deepStrictEqual(known.filter((i) => i.code === 'LOADER_LOG_UNKNOWN_OBJECTIVE'), [], 'an id the schema carries is not a problem');
    assert.deepStrictEqual(known.filter((i) => i.code === 'LOADER_LOG_NO_ACH_CALL'), []);
    /*
      The R2 loader words its unlock line differently from R1, and builds the format on the stack
      rather than holding it whole, so it is easy to conclude from a scan of the binary that it never
      names the objective at all:

        R1  UPLAY_ACH_EarnAchievement => achievementId (42)
        R2  UPC_AchievementUnlock => inId (42)

      Both are read. The count is kept separately, because a log cut off by the bounded tail read
      still proves the game asked, which is what convicts a setup sitting at 0%.
    */
    const r2Dir = path.join(temp, 'Avatar Frontiers of Pandora');
    fs.mkdirSync(r2Dir, { recursive: true });
    fs.writeFileSync(path.join(r2Dir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements AchKeyPrefix AchSaveType AchSavePath'));
    uplayR2.repair({
      dir: r2Dir,
      gameDir: r2Dir,
      steamAppid: 2840770,
      prefix: 'AFOP_Ach_',
      schema: { achievement: { list: [{ name: 'AFOP_Ach_1' }, { name: 'AFOP_Ach_2' }] } },
    });
    const r2LogFile = path.join(r2Dir, uplayR2.FLAVOURS.r2.logFile);
    const r2Issues = (body) => {
      fs.writeFileSync(r2LogFile, body);
      return uplayR2.diagnose({
        gameDir: r2Dir,
        appid: 2840770,
        mapping: { uplay_id: '4740', steam_appid: 2840770, steam_name: 'Avatar: Frontiers of Pandora' },
        flavour: 'r2',
      }).issues;
    };

    const r2Wrong = r2Issues(
      '[09:48:47.475][INFO]  UPC_Init -> inVersion (33557249), appid (4740)\n' +
        '[10:02:11.100][INFO]  UPC_AchievementUnlock => inId (4242)\n'
    );
    const r2Named = r2Wrong.find((i) => i.code === 'LOADER_LOG_UNKNOWN_OBJECTIVE');
    assert.ok(r2Named, `an R2 log names its objective too: ${JSON.stringify(r2Wrong)}`);
    assert.ok(r2Named.message.includes('4242'), `the report must name the id: ${r2Named && r2Named.message}`);

    const r2Known = r2Issues('[10:02:11.100][INFO]  UPC_AchievementUnlock => inId (1)\n');
    assert.deepStrictEqual(r2Known.filter((i) => i.code === 'LOADER_LOG_UNKNOWN_OBJECTIVE'), [], 'an id the schema carries is not a problem');

    // A log whose unlock lines lost their id still proves the game asked, and that alone is a verdict.
    const r2Cut = r2Issues('[10:02:11.100][INFO]  UPC_AchievementUnlock\n[10:07:42.900][INFO]  UPC_AchievementUnlock\n');
    const notRecorded = r2Cut.find((i) => i.code === 'LOADER_LOG_UNLOCK_NOT_RECORDED');
    assert.ok(notRecorded, 'a game that asked and recorded nothing must not be reported as healthy');
    assert.ok(notRecorded.message.includes('2 achievements'), `the count is what is left to say: ${notRecorded && notRecorded.message}`);
    assert.deepStrictEqual(r2Cut.filter((i) => i.code === 'LOADER_LOG_NO_ACH_CALL'), [], 'the game did ask');

    const silent = r2Issues('[09:48:47.475][INFO]  UPC_Init -> inVersion (33557249), appid (4740)\n');
    assert.ok(silent.some((i) => i.code === 'LOADER_LOG_NO_ACH_CALL'), 'no call at all is the other verdict, and stays');
    assert.deepStrictEqual(silent.filter((i) => i.code === 'LOADER_LOG_UNLOCK_NOT_RECORDED'), []);
    fs.rmSync(r2LogFile, { force: true });

    fs.rmSync(logFile, { force: true });
    console.log('PASS: the loader log separates a game that never asks from a mapping that is wrong');

    /*
      The install's own answer to "which Ubisoft product am I?". The shipped uplay-steam table cannot
      list a game that did not exist when it was written, and the product id is what every save folder
      is named after - so a game absent from the table could be identified as a Steam release and
      still have nowhere to watch. The game states the id itself on startup: R2 logs it as
      "UPC_Init -> ... appid (N)", R1 as "UPLAY_Start => aUplayId (N)".
    */
    const idDir = fs.mkdtempSync(path.join(temp, 'declared-id-'));
    assert.strictEqual(uplayR2.readInstalledProductId(idDir), '', 'an install that says nothing stays unidentified');

    fs.writeFileSync(path.join(idDir, 'uplay_r1.ini'), '[Uplay]\nAchievements = 1\nGameUplayId = 777\n');
    assert.strictEqual(uplayR2.readInstalledProductId(idDir), '777', 'a repack stating the id in its ini is believed');

    fs.writeFileSync(path.join(idDir, 'upc_r1.log'), '[00:00:00.000][INFO]  UPLAY_Start => aUplayId (3539)\n');
    assert.strictEqual(uplayR2.readInstalledProductId(idDir), '3539', "the game's own startup value outranks the ini");

    const r2IdDir = fs.mkdtempSync(path.join(temp, 'declared-id-r2-'));
    fs.writeFileSync(path.join(r2IdDir, 'upc_r2.ini'), '[Settings]\nAchievements = 1\n');
    fs.writeFileSync(path.join(r2IdDir, 'upc_r2.log'), '[00:00:00.000][INFO]  UPC_Init -> inVersion (33557249), appid (4740)\n');
    assert.strictEqual(uplayR2.readInstalledProductId(r2IdDir), '4740', 'the R2 loader states it in its own wording');
    console.log('PASS: an install states its own Ubisoft product id, table or no table');

    /*
      The cheap gate in front of the recursive evidence walk. A library scan asks it of every install
      folder it resolves, so it must answer from one readdir and must not recurse.
    */
    const plainDir = fs.mkdtempSync(path.join(temp, 'not-uplay-'));
    fs.writeFileSync(path.join(plainDir, 'game.exe'), 'x');
    assert.strictEqual(uplayR2.looksLikeUplayInstall(plainDir), false);
    assert.strictEqual(uplayR2.looksLikeUplayInstall(''), false);
    assert.strictEqual(uplayR2.looksLikeUplayInstall(path.join(plainDir, 'nope')), false, 'a missing folder is not an install');
    fs.writeFileSync(path.join(plainDir, 'uplay_r1.ini'), '[Uplay]\n');
    assert.strictEqual(uplayR2.looksLikeUplayInstall(plainDir), true);
    console.log('PASS: a Uplay install is recognised from one directory listing');


  } finally {
    if (savedAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = savedAppData;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
