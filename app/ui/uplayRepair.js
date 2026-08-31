'use strict';

/*
  The renderer side of the Uplay R1/R2 repair: fetching the emulator package, choosing and writing
  the Steam mapping, and the one entry point the context menu, Game Health and "Fix all" all go
  through. Lifted out of app.js as another classic page script sharing its global lexical scope, so
  the callers still reach these by name and the background scanner still calls the same installer
  transaction directly.
*/

async function ensureUplayR2Package({ interactive = true, forceImport = false } = {}) {
  const cacheDir = path.join(getUserDataPath(), 'cache/uplayR2');
  let bundledError = null;
  if (!forceImport) {
    try {
      return await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir, log: debug });
    } catch (err) {
      bundledError = err;
      debug.error(`[uplayR2] bundled package could not be imported => ${formatErr(err)}`);
    }
  }
  let cache = uplayR2Installer.ensureEmulatorDlls({ cacheDir });
  if (cache.seeded && !forceImport) return cache;
  if (!interactive) {
    const invalid = cache.invalid.map((entry) => `${entry.name || path.basename(entry.file)}: ${entry.error}`).join(', ');
    const failure = new Error(`Uplay R1/R2 package is not available${bundledError ? ` (${formatErr(bundledError)})` : invalid ? ` (${invalid})` : ''}`);
    // Carry the cause forward: a caller that can explain an antivirus should not lose the one fact
    // that tells it to, just because the wrapper rephrased the message.
    if (isEmulatorPackageBlocked(bundledError)) {
      failure.code = bundledError.code;
      failure.folder = bundledError.folder;
    }
    throw failure;
  }

  /*
    An antivirus took the loaders AW Next installs with itself. Asking someone to go and find a
    package on their disk is the wrong question then - the right one is "allow this, and I will put
    them back", which is what the antivirus dialog offers.
  */
  if (isEmulatorPackageBlocked(bundledError)) {
    await reportEmulatorPackageBlocked(bundledError, { retry: () => ensureUplayR2Package({ interactive, forceImport }) });
    return null;
  }

  /*
    These loaders ship with the app, so restoring them is one button and no decision - that is the
    answer for almost everyone reaching this dialog, and it is what it now leads with. Picking a
    package by hand stays for people running their own build of the loader.
  */
  const buttons = [t('cancel', 'Cancel', 'Annuler'), t('select-file', 'Select file…', 'Sélectionner le fichier…')];
  buttons.push(t('uplay-r2-restore-bundled', 'Restore the app’s own files', 'Restaurer les fichiers de l’app'));
  const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'warning',
    title: t('uplay-r2-dll-not-seeded', 'Uplay R1/R2 dll not seeded', 'DLL Uplay R1/R2 manquantes'),
    message: t('no-files-found-in-the-uplay-r2-cache', 'No files found in the Uplay R1/R2 cache.', 'Aucun fichier trouvé dans le cache Uplay R1/R2.'),
    detail: [
      t(
        'uplay-r2-restore-detail',
        'These loaders are installed with the app, so they can simply be put back. Selecting a package by hand is only needed to use your own build of the loader.',
        'Ces loaders sont installés avec l’app, ils peuvent donc simplement être remis en place. Sélectionner un paquet à la main ne sert qu’à utiliser ta propre version du loader.'
      ),
      t(
        'copy-the-uplay-r2-loader-64-dll-upc-r2-loader-64-dll-files-into-',
        'Select your Uplay R1/R2 package once. AW Next will import only validated x86/x64 loader DLLs into:\n{dir}',
        'Sélectionne une fois ton paquet Uplay R1/R2. AW Next importera uniquement les DLL x86/x64 validées dans :\n{dir}',
        { dir: cacheDir }
      ),
      // Why the automatic attempt did not work, rather than leaving the user to guess it never ran.
      bundledError ? formatErr(bundledError) : '',
      cache.invalid.length ? cache.invalid.map((entry) => `${entry.name || path.basename(entry.file)}: ${entry.error}`).join('\n') : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    buttons,
    defaultId: buttons.length - 1,
    cancelId: 0,
    noLink: true,
  });
  if (choice === buttons.length - 1) {
    try {
      const restored = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir, log: debug, replaceExisting: true });
      if (!restored.complete) throw new Error('The files installed with the app did not provide every Uplay R1/R2 loader');
      return restored;
    } catch (err) {
      // The restore hits the same files, so it can hit the same antivirus - and this is the moment
      // the exclusion offer is worth most, since the user is one press away from being done.
      if (isEmulatorPackageBlocked(err)) {
        await reportEmulatorPackageBlocked(err, { retry: () => ensureUplayR2Package({ interactive, forceImport }) });
        return null;
      }
      throw err;
    }
  }
  if (choice !== 1) return null;
  const picked = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
    title: t('select-file', 'Select file…', 'Sélectionner le fichier…'),
    properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
    filters: [
      { name: t('archives', 'Archives', 'Archives'), extensions: ['7z', 'zip'] },
      { name: 'Uplay R1/R2 DLL', extensions: ['dll'] },
    ],
  });
  if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return null;
  for (const packagePath of picked.filePaths) {
    await uplayR2Installer.importPackage({ packagePath, cacheDir, log: debug });
  }
  cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir, log: debug });
  if (!cache.seeded) throw new Error('The selected package contained no compatible Uplay R1/R2 loader');
  return cache;
}

async function detectedGameExe(game, gameDir) {
  const configured = await exeList.get(game && game.appid);
  const candidates = [(configured && configured.exe) || '', (game && game.exe) || ''];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const full = path.isAbsolute(candidate) ? candidate : path.join(gameDir, candidate);
    if (fs.existsSync(full)) return full;
  }
  const detected = exeDetect.detect(gameDir, (game && game.name) || '', { dllPaths: uplayR2.detectEmulator(gameDir).dll });
  return (detected && detected.full) || '';
}

function uplayR2IniOptions() {
  const emulator = app.config?.emulator || {};
  return {
    accountName: String(emulator.uplayUsername || '').trim() || app.config?.general?.username,
    language: emulator.uplayLanguage && emulator.uplayLanguage !== 'auto' ? emulator.uplayLanguage : app.config?.achievement?.lang,
    logging: emulator.uplayLogging === true,
  };
}

async function selectUplayR2SteamMapping({ game, gameDir, appid } = {}) {
  const record = game && typeof game === 'object' ? game : {};
  const identity = uplayR2.resolveGameIdentity(record, appid);
  const ranked = await steamParser.findAppidCandidatesByName(record.name || path.basename(gameDir || ''), 6);
  const hints = uplayR2.findSteamAppidHints(gameDir);
  const candidates = [];
  const add = (candidate, hinted = false) => {
    const value = String(candidate && candidate.appid ? candidate.appid : '').trim();
    if (!/^\d+$/.test(value) || candidates.some((entry) => entry.appid === value)) return;
    candidates.push({
      appid: value,
      name: String((candidate && candidate.name) || `Steam AppID ${value}`),
      hinted,
    });
  };
  for (const hint of hints) {
    const known = ranked.find((candidate) => String(candidate.appid) === String(hint.appid));
    add(known || { appid: hint.appid, name: `Steam AppID ${hint.appid}` }, true);
  }
  for (const candidate of ranked) add(candidate);
  if (candidates.length === 0) return null;

  const labels = candidates.map((candidate) => `${candidate.name} (${candidate.appid})${candidate.hinted ? ' [steam_appid.txt]' : ''}`);
  const skipped = labels.length;
  const picked = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'question',
    title: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
    message: t('which-game-is-x', 'Which game is "{name}"?', 'Quel jeu est « {name} » ?', {
      name: record.name || path.basename(gameDir || ''),
    }),
    detail: t(
      'uplay-no-steam-match',
      'This Ubisoft game has no known match in uplay-steam.json.',
      "Ce jeu Ubisoft n'a pas de correspondance connue dans uplay-steam.json."
    ),
    buttons: [...labels, t('skip', 'Skip', 'Ignorer')],
    defaultId: 0,
    cancelId: skipped,
    noLink: true,
  });
  if (picked < 0 || picked >= candidates.length) return null;
  const selected = candidates[picked];
  return {
    uplay_id: identity.uplayId,
    steam_appid: Number(selected.appid),
    steam_name: selected.name,
    manual: true,
    pendingOverride: true,
  };
}

async function replaceUplayR2SteamMapping({ game, gameDir, appid, box = null } = {}) {
  const mapping = await selectUplayR2SteamMapping({ game, gameDir, appid });
  if (!mapping) return null;
  setGameBoxBusy(box, t('fetching-the-steam-schema', 'Fetching the Steam schema…', 'Récupération du schéma Steam…'));
  const schema = await steamParser.getGameData({
    appID: mapping.steam_appid,
    lang: app.config?.achievement?.lang || 'english',
    showHidden: true,
  });
  if (!uplayR2.resolveObjectiveKeying({ achievementList: (schema && schema.achievement && schema.achievement.list) || [], uplayId: mapping.uplay_id })) {
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('unsupported-game', 'Unsupported game', 'Jeu non pris en charge'),
      message: t(
        'uplay-prefix-pattern-mismatch',
        "This game's Steam achievement names don't follow the required <prefix><digits> pattern.",
        'Les noms de succès Steam de ce jeu ne suivent pas le format <préfixe><chiffres> requis.'
      ),
      noLink: true,
    });
    return null;
  }
  const saved = uplayR2.saveSteamMappingOverride({
    gameDir,
    uplayId: mapping.uplay_id,
    steamAppid: mapping.steam_appid,
    steamName: (schema && schema.name) || mapping.steam_name,
  });
  remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'info',
    title: t('identify-game-title', 'Identify the game (Steam AppID)', 'Identifier le jeu (AppID Steam)'),
    message: t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
      appid: saved.steam_appid,
      name: saved.steam_name,
    }),
    noLink: true,
  });
  return saved;
}

// One renderer Uplay R1/R2 repair entry point for the context menu, Game Health, and Fix all. The
// background scanner calls the same installer transaction directly; validation is identical.
async function applyUplayR2Repair({ game, gameDir, appid, box = null, interactive = true, showResult = true } = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) throw new Error(`Uplay R1/R2 game folder not found: ${gameDir || '(missing)'}`);
  const id = appid != null ? appid : game && game.appid;
  const setBusy = (message) => setGameBoxBusy(box, message);
  const record = game && typeof game === 'object' ? game : {};
  const recordData = record.data && typeof record.data === 'object' ? record.data : {};
  const recordedDir = record.gameDir || recordData.gameDir || '';
  const persistedAtThisInstall =
    !!(record.uplayR2 || recordData.uplayR2 || /uplay r2|goldberg uplay|lumaplay|^uplay$/i.test(String(record.source || ''))) &&
    !!recordedDir &&
    path.resolve(recordedDir).toLowerCase() === path.resolve(gameDir).toLowerCase();
  const trustedInstall = persistedAtThisInstall || uplayR2Installer.canAdoptInstall({ gameDir });
  if (!trustedInstall) {
    throw new Error('This folder is a Ubisoft Connect installation; refusing to replace an official Uplay loader');
  }
  setBusy(t('resolving-the-steam-equivalent', 'Resolving the Steam equivalent…', 'Résolution du jeu Steam…'));
  const identity = uplayR2.resolveGameIdentity({ ...record, appid: id, gameDir }, id);
  let mapping = identity.mapping;
  if (!mapping && interactive) mapping = await selectUplayR2SteamMapping({ game, gameDir, appid: id });
  if (!mapping) {
    if (interactive) {
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        title: t('no-steam-equivalent-found', 'No Steam equivalent found', 'Jeu Steam introuvable'),
        message: t('uplay-no-steam-match', 'This Ubisoft game has no known match in uplay-steam.json.', "Ce jeu Ubisoft n'a pas de correspondance connue dans uplay-steam.json."),
        detail: t('the-uplay-r2-fix-needs-the-steam-version-of-the-game-to-fetch-th', 'The Uplay R1/R2 fix needs the Steam version of the game to fetch the achievement schema.', 'Le fix Uplay R1/R2 a besoin de la version Steam du jeu pour récupérer le schéma des succès.'),
      });
      return null;
    }
    throw new Error('No trusted Steam mapping for this Ubisoft game');
  }

  setBusy(t('fetching-the-steam-schema', 'Fetching the Steam schema…', 'Récupération du schéma Steam…'));
  const schema = await steamParser.getGameData({
    appID: mapping.steam_appid,
    lang: app.config?.achievement?.lang || 'english',
    showHidden: true,
  });
  const achievementList = (schema && schema.achievement && schema.achievement.list) || [];
  // Objective keying needs Ubisoft's own achievement data (the launcher only downloads it once its
  // achievements page has been opened); fetch it from Ubisoft's public endpoint instead.
  await ubisoftOfficial.ensureAchievementsArchive(mapping.uplay_id).catch(() => '');
  const prefixInfo = uplayR2.resolveObjectiveKeying({ achievementList, uplayId: mapping.uplay_id });
  if (!prefixInfo) {
    if (interactive) {
      remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        title: t('unsupported-game', 'Unsupported game', 'Jeu non pris en charge'),
        message: t('uplay-prefix-pattern-mismatch', "This game's Steam achievement names don't follow the required <prefix><digits> pattern.", 'Les noms de succès Steam de ce jeu ne suivent pas le format <préfixe><chiffres> requis.'),
        detail: t('the-automatic-goldberg-uplay-r2-mapping-cannot-be-generated-for-', 'The automatic Goldberg Uplay R1/R2 mapping cannot be generated for this game.', 'Le mappage automatique vers Goldberg Uplay R1/R2 ne peut pas être généré pour ce jeu.'),
      });
      return null;
    }
    throw new Error('Steam achievement names cannot be mapped safely to Ubisoft objective IDs');
  }

  const emu = uplayR2.detectEmulator(gameDir);
  const installed = uplayR2.inspectInstalledLoaders(emu.dll);
  // A game loads only the emulator generation its exe imports, so the install decides which
  // package to seed - never assumed.
  const detectedExe = await detectedGameExe(game, gameDir);
  const flavour = uplayR2Installer.detectInstallFlavour({ gameDir, loaderPaths: emu.dll, exePath: detectedExe }) || 'r2';
  const loaderCacheDir = path.join(getUserDataPath(), `cache/${uplayR2Installer.packageFor(flavour).cacheName}`);
  const existingRuntimeDirs = [...new Set(emu.dll.map((file) => path.dirname(file)))];
  const existingSetupFiles = existingRuntimeDirs.flatMap((dir) =>
    [uplayR2.ACH_SCHEMA_FILE, ...uplayR2.INI_NAMES]
      .map((name) => path.join(dir, name))
      .filter((file) => fs.existsSync(file))
  );
  const existingRepairFiles = [...new Set([...emu.dll, ...existingSetupFiles])];
  const hasExistingUplayFix = emu.dll.length > 0;
  let reapplyConfirmed = false;
  if (interactive && hasExistingUplayFix) {
    const proceed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      title: t('reapply-gbe-title', 'Re-apply the emulator fix?', 'Ré-appliquer le fix émulateur ?'),
      message: t(
        'reapply-gbe-message',
        'This game already has a setup ({name}). Re-applying replaces it with a freshly generated one.',
        'Ce jeu a déjà une configuration ({name}). La ré-appliquer la remplace par une configuration régénérée.',
        { name: uplayR2.resolveFlavour(flavour).label }
      ),
      detail: `${existingRepairFiles.join('\n')}\n${t(
        'reapply-gbe-detail',
        'The current files are backed up first and can be restored from the repair controls.',
        'Les fichiers actuels sont sauvegardés au préalable et peuvent être restaurés depuis les contrôles de réparation.'
      )}`,
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('reapply-gbe-button', 'Re-apply', 'Ré-appliquer')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (proceed !== 1) return null;
    reapplyConfirmed = true;
  }
  let installPlan = null;
  let cache = null;
  try {
    cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir: loaderCacheDir, flavour, log: debug });
  } catch (err) {
    debug.log(`[${id}] uplayR2: loader cache unavailable => ${formatErr(err)}`);
  }
  const customReplacementRequired = !!cache && cache.customNames.some((name) =>
    emu.dll.some((file) => path.basename(file).toLowerCase() === name && !uplayR2Installer.sameFileBytes(file, cache.files[name]))
  );
  const loaderMustBeInstalled = emu.dll.length === 0 || !installed.supportsAchievements || !installed.architectureValid || customReplacementRequired;
  if (loaderMustBeInstalled) {
    cache = cache || (await ensureUplayR2Package({ interactive }));
    if (!cache) return null;
    installPlan = uplayR2Installer.planInstall({
      gameDir,
      dlls: cache,
      loaderPaths: emu.dll,
      exePath: detectedExe,
      trustedInstall,
    });
    if (!installPlan.safe && interactive && installPlan.issues.some((issue) => issue.code === 'PACKAGE_MISSING_LOADER')) {
      cache = await ensureUplayR2Package({ interactive, forceImport: true });
      if (!cache) return null;
      installPlan = uplayR2Installer.planInstall({ gameDir, dlls: cache, loaderPaths: emu.dll, exePath: detectedExe, trustedInstall });
    }
    if (!installPlan.safe) throw new Error(`No safe Uplay R1/R2 loader target: ${installPlan.issues.map((issue) => issue.code).join(', ')}`);
  } else if (!installed.supportsAchRedirect) {
    try {
      cache = await uplayR2Installer.ensureBundledEmulatorDlls({ cacheDir: loaderCacheDir, flavour, log: debug });
      const candidate = uplayR2Installer.planInstall({ gameDir, dlls: cache, loaderPaths: emu.dll, exePath: detectedExe, trustedInstall });
      const improvesEveryTarget = candidate.safe && candidate.targets.every((target) => uplayR2.inspectLoader(target.source).supportsAchRedirect);
      if (interactive && improvesEveryTarget) {
        const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'question',
          title: t('update-the-uplay-r2-loader', 'Update the Uplay R1/R2 loader?', 'Mettre à jour le loader Uplay R1/R2 ?'),
          message: t('uplay-r2-old-loader-message', 'This game uses a loader too old to redirect achievements.', 'Ce jeu utilise un loader trop ancien pour rediriger les succès.'),
          detail: t('uplay-r2-old-loader-detail', "The fix works without updating: AW Next reads the emulator's own save folder.\n\nUpdating enables the redirect into GSE Saves, but replaces a DLL the game currently launches with (the original is kept in the repair backup).", "Le correctif fonctionne sans mise à jour : AW Next lit le dossier de sauvegarde de l'émulateur.\n\nMettre à jour le loader permet la redirection vers GSE Saves, mais remplace une DLL avec laquelle le jeu se lance actuellement (l'originale est conservée dans la sauvegarde de réparation)."),
          buttons: [t('keep-current-loader', 'Keep the current loader', 'Garder le loader actuel'), t('update-loader', 'Update', 'Mettre à jour')],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (choice === 1) installPlan = candidate;
      }
    } catch (err) {
      debug.log(`[${id}] uplayR2: optional loader update unavailable => ${formatErr(err)}`);
    }
  }

  const runtimeDirs = installPlan
    ? [...new Set(installPlan.targets.map((target) => target.dir))]
    : [...new Set(emu.dll.map((file) => path.dirname(file)))];
  if (interactive && !reapplyConfirmed) {
    const detail = [
      t('diagnosis-steam-appid', 'Steam AppID: {appid} ({name})', 'Steam AppID : {appid} ({name})', {
        appid: mapping.steam_appid,
        name: mapping.steam_name,
      }),
      ...((installPlan && installPlan.targets) || []).map((target) => `${target.name} (${target.arch}) → ${target.dir}`),
      ...runtimeDirs.map((dir) => `${uplayR2.ACH_SCHEMA_FILE}, ${uplayR2.INI_NAMES.join(', ')} → ${dir}`),
    ].join('\n');
    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'question',
      title: t('apply-emulator-fix-uplay-r2', 'Apply the Ubisoft achievement fix…', 'Appliquer le correctif de succès Ubisoft…'),
      message: t(
        'apply-the-emulator-fix-to-x-detected-game-s-existing-files-are-b',
        'Apply the emulator fix to {count} detected game(s)? Existing files are backed up before being overwritten.',
        'Appliquer le fix émulateur à {count} jeu(x) détecté(s) ? Les fichiers existants sont sauvegardés avant d’être écrasés.',
        { count: 1 }
      ),
      detail,
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('gh-action-repair-uplay', 'Repair Ubisoft achievement support', 'Réparer la prise en charge des succès Ubisoft')],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (confirmed !== 1) return null;
  }

  setBusy(t('configuring-achievements', 'Configuring (achievements)…', 'Configuration (succès)…'));
  const iniOptions = uplayR2IniOptions();
  const result = uplayR2Installer.repairInstallation({
    gameDir,
    installPlan,
    loaderPaths: emu.dll,
    steamAppid: mapping.steam_appid,
    uplayId: mapping.uplay_id,
    name: (game && game.name) || mapping.steam_name,
    mapping,
    schema,
    prefix: prefixInfo.prefix,
    objectiveIds: prefixInfo.objectiveIds,
    ...iniOptions,
    log: debug,
  });
  if (mapping.pendingOverride) {
    mapping = uplayR2.saveSteamMappingOverride({
      gameDir,
      uplayId: mapping.uplay_id,
      steamAppid: mapping.steam_appid,
      steamName: mapping.steam_name,
    });
  }

  if (interactive && showResult) {
    const mapped = Math.max(0, ...result.repairs.map((repair) => Object.keys(repair.achievementsSchemaJson).length));
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'info',
      title: t('uplay-r2-installed', 'Uplay R1/R2 installed', 'Uplay R1/R2 installé'),
      message: t('uplay-r2-installed-message', '{installedLabel} - {mapped} achievement(s) mapped', '{installedLabel} - {mapped} succès mappé(s)', {
        installedLabel: result.install.installed > 0
          ? t('dllsInstalled', '{count} dll(s) installed', '{count} dll(s) installée(s)', { count: result.install.installed })
          : t('emulator-fix-applied', 'Emulator fix applied', 'Fix émulateur appliqué'),
        mapped,
      }),
      detail: `${runtimeDirs.join('\n')}${result.backupDir ? `\n${t('diagnosis-config-backed-up', 'Previous config backed up: {path}', 'Configuration précédente sauvegardée : {path}', { path: result.backupDir })}` : ''}`,
      noLink: true,
    });
  }
  return { ...result, mapping, schema, prefix: prefixInfo.prefix };
}
