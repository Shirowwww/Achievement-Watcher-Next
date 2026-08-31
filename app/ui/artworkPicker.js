'use strict';

/*
  The cover and icon pickers of the game screen, and the header-icon context menu that opens them,
  lifted out of app.js. Another classic page script: it shares one global lexical scope with app.js,
  so these functions stay reachable by name from the menus there, and `path`, `appPath`, `remote`,
  `debug`, `t` and the artwork helpers come from the scripts the page loads first.
*/

// Does this image actually load? An empty painted box is worse than no tile, so drop art the CDN
// no longer serves. Bounded so a stalled request can't hold "Loading..." open indefinitely.
function imagePreviewReady(value) {
  const preview = imageDisplayUrl(value);
  if (!/^(?:https?|file|data):/i.test(preview) || typeof Image !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 8000);
    const image = new Image();
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = preview;
  });
}

/*
  A gallery-ready URL for one candidate, or null. Schema values like "library_600x900.jpg" or a bare
  content hash are fetch-icon tokens, not browser-ready URLs; resolve via the icon cache first.
  Shared by the cover and icon pickers.
*/
async function resolvePickerPreview(url, cacheAppid) {
  let preview = String(url || '').trim();
  if (!/^(?:https?|file|data):/i.test(preview) && !path.isAbsolute(preview)) {
    preview = await ipcRenderer.invoke('fetch-icon', preview, cacheAppid).catch(() => null);
    if (!preview || preview === url) return null;
  }
  return (await imagePreviewReady(preview)) ? imageDisplayUrl(preview) : null;
}

// Show alternate SteamDB and SteamGridDB covers for a game.
function openCoverPicker(game, appid, coverCacheAppid) {
  const portraitView = !!(app.config && app.config.achievement && app.config.achievement.thumbnailPortrait);
  const pickerOrientation = portraitView ? 'portrait' : 'landscape';
  const img = (game && game.img) || {};
  const defaultUrl = portraitView ? img.portrait || img.header || img.landscape : img.header || img.landscape || img.portrait;
  const overrideUrl = coverOverrideFor(appid, pickerOrientation);
  const currentUrl = overrideUrl || defaultUrl;
  const overlay = document.createElement('div');
  overlay.className = 'aw-prompt-overlay aw-cover-picker-overlay';
  const box = document.createElement('div');
  box.className = 'aw-prompt aw-cover-picker';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('chooseAnotherCoverTitle', 'Choose another cover', 'Choisir une autre jaquette'));
  const head = document.createElement('div');
  head.className = 'aw-prompt-heading';
  const icon = document.createElement('div');
  icon.className = 'aw-prompt-icon';
  icon.innerHTML = '<i class="fas fa-images"></i>';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'aw-prompt-title';
  titleWrap.textContent = t('chooseAnotherCoverTitle', 'Choose another cover', 'Choisir une autre jaquette');
  head.append(icon, titleWrap);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'aw-prompt-button secondary aw-cover-picker-close';
  closeBtn.textContent = '×';
  closeBtn.title = t('cancel', 'Cancel', 'Annuler');
  head.append(closeBtn);
  const status = document.createElement('div');
  status.className = 'aw-cover-picker-status';
  status.setAttribute('aria-live', 'polite');
  const statusMessage = document.createElement('span');
  statusMessage.textContent = t('coverPickerLoading', 'Loading covers…', 'Chargement des jaquettes…');
  const retrySourcesButton = document.createElement('button');
  retrySourcesButton.type = 'button';
  retrySourcesButton.className = 'aw-prompt-button secondary aw-cover-picker-retry';
  retrySourcesButton.textContent = t('retry-artwork', 'Retry', 'Réessayer');
  retrySourcesButton.hidden = true;
  status.append(statusMessage, retrySourcesButton);
  const grid = document.createElement('div');
  grid.className = 'aw-cover-picker-grid';
  const actions = document.createElement('div');
  actions.className = 'aw-prompt-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'aw-prompt-button secondary';
  cancelBtn.textContent = t('cancel', 'Cancel', 'Annuler');
  actions.append(cancelBtn);
  box.append(head, status, grid, actions);
  overlay.append(box);

  const done = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  closeBtn.onclick = done;
  cancelBtn.onclick = done;
  overlay.onmousedown = (ev) => {
    if (ev.target === overlay) done();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      done();
    }
  };
  document.addEventListener('keydown', onKey);

  // Show the gallery even when loading its options fails.
  document.body.append(overlay);

  const seenUrls = new Set();
  let providerTileCount = 0;
  const resolvePreview = (url) => resolvePickerPreview(url, coverCacheAppid);
  const addTile = (url, source, previewUrl = url) => {
    const key = String(url || '').trim();
    if (!key || seenUrls.has(key)) return;
    seenUrls.add(key);
    const tile = document.createElement('div');
    tile.className = 'aw-cover-picker-tile';
    if (!portraitView) tile.classList.add('aw-landscape');
    const preview = path.isAbsolute(String(previewUrl || '')) ? pathToFileURL(previewUrl).href : previewUrl;
    tile.style.backgroundImage = cssUrl(preview);
    tile.title = url;
    const tag = document.createElement('span');
    tag.className = 'aw-cover-picker-source';
    tag.textContent = source;
    tile.append(tag);
    tile.onclick = async () => {
      try {
        // Bound downloads and fall back to the remote URL on failure.
        const local = await Promise.race([
          ipcRenderer.invoke('fetch-icon', url, coverCacheAppid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('fetch-icon timeout')), 15000)),
        ]).catch((err) => {
          debug.warn(`[cover] picker download failed (${err.message || err}) - applying remote URL`);
          return null;
        });
        // Persist the provider URL, not the disposable downloaded preview: the next render
        // repopulates steam_cache, and a dead source can then fall through to the normal chain.
        const target = coverStore.persist(String(appid), url, getUserDataPath(), pickerOrientation);
        if (!target) throw new Error('selected cover could not be persisted');
        reloadCoverOverrides();
        applyCoverBackground(String(appid), local && local !== url ? local : target);
      } catch (err) {
        debug.warn(`[cover] picker apply failed => ${err}`);
      }
      done();
    };
    grid.append(tile);
  };
  const addProviderTile = async (url, source, previewUrl = url) => {
    try {
      const key = String(url || '').trim();
      if (!key) return false;
      if (seenUrls.has(key)) return true;
      if (!(await resolvePreview(previewUrl))) return false;
      const before = seenUrls.size;
      addTile(url, source, previewUrl);
      if (seenUrls.size > before) providerTileCount += 1;
      return seenUrls.size > before;
    } catch (err) {
      debug.warn(`[cover] picker preview failed (${source}) => ${err}`);
      return false;
    }
  };

  // Resolved independently from the provider lookup: schema values like "library_600x900.jpg" are
  // fetch-icon tokens, not URLs. Current/Default stay offered even if their value no longer resolves.
  const paintedCover = () => cssUrlValue($(`#game-header-${appid}`).first().css('background-image'));
  const addResolvedTile = async (url, source) => {
    const preview = (await resolvePreview(url)) || paintedCover();
    if (preview) addTile(url, source, preview);
  };
  const currentTilePromise = currentUrl ? addResolvedTile(currentUrl, t('currentCover', 'Current', 'Actuelle')) : Promise.resolve();
  // Once an override is set, the schema default drops out of currentUrl - without a dedicated tile
  // it would only reappear via "Reset cover to default" in the context menu. Chained rather than
  // awaited so the gallery keeps its order while the dialog opens immediately; the catch is what
  // turns a failed tile into one log line instead of an unhandled rejection.
  (overrideUrl && defaultUrl && defaultUrl !== overrideUrl
    ? currentTilePromise.then(() => addResolvedTile(defaultUrl, t('defaultCover', 'Default', 'Par défaut')))
    : currentTilePromise
  ).catch((err) => debug.warn(`[cover] could not add a cover tile => ${err}`));

  const steamCoverId = /^\d+$/.test(String((game && (game.steamappid || game.appid)) || ''))
    ? String(game.steamappid || game.appid)
    : '';

  let pendingSources = 0;
  let failedSources = 0;
  let sourceAttempt = 0;
  const refreshStatus = () => {
    if (providerTileCount > 0) {
      status.remove();
      return;
    }
    if (!status.isConnected) box.insertBefore(status, grid);
    if (pendingSources > 0) {
      statusMessage.textContent = t('coverPickerLoading', 'Loading covers…', 'Chargement des jaquettes…');
      retrySourcesButton.hidden = true;
      return;
    }
    statusMessage.textContent = failedSources
      ? t(
          'cover-picker-fetch-failed',
          'Could not fetch alternative covers. Check your connection and retry.',
          'Impossible de récupérer les jaquettes alternatives. Vérifiez votre connexion et réessayez.'
        )
      : t('noCoversFound', 'No alternative covers found.', 'Aucune jaquette alternative trouvée.');
    retrySourcesButton.hidden = false;
  };
  const sourceSettled = (attempt, failed) => {
    if (attempt !== sourceAttempt) return;
    pendingSources -= 1;
    if (failed) failedSources += 1;
    refreshStatus();
  };
  const startSourceLoad = () => {
    const attempt = ++sourceAttempt;
    pendingSources = 2;
    failedSources = 0;
    refreshStatus();

    // Two lookups on purpose: instant sources (Steam CDN, SteamGridDB) paint the gallery fast, while
    // the SteamDB scrape (browser launch) appends tiles later instead of holding the dialog open.
    const fastOptions = ipcRenderer.invoke('get-cover-options', {
      name: game.name,
      orientation: pickerOrientation,
      // Only a real Steam release should hit the CDN probe - a non-Steam numeric id (GOG/Xbox)
      // would just 404 on every asset path.
      steamAppid: steamCoverId,
    });

    let fastFailed = false;
    let fastNetworkUnavailable = false;
    fastOptions
      .then(async (opts = {}) => {
        fastNetworkUnavailable = opts.networkError === true;
        fastFailed = fastNetworkUnavailable;
        const steamUrls = Array.isArray(opts.steam) ? opts.steam : [];
        const steamResults = await Promise.all(steamUrls.map((url) => addProviderTile(url, 'Steam')));
        // Tiles preview the SteamGridDB thumbnail; the full-size url is only downloaded on click.
        const gridCovers = Array.isArray(opts.grids) ? opts.grids : [];
        const gridResults = await Promise.all(
          gridCovers.map((cover) =>
            addProviderTile(cover && cover.url, 'SteamGridDB', (cover && cover.thumb) || (cover && cover.url))
          )
        );
        const candidates = steamUrls.length + gridCovers.length;
        if (candidates > 0 && !steamResults.some(Boolean) && !gridResults.some(Boolean)) fastFailed = true;
      })
      .catch((err) => {
        fastFailed = true;
        fastNetworkUnavailable = true;
        debug.warn(`[cover] picker options failed => ${err}`);
      })
      .then(() => {
        sourceSettled(attempt, fastFailed);
        // SteamDB launches a browser scrape - skip it entirely once the fast providers proved the
        // network unavailable (used to queue offline scans behind 45s SteamDB pages).
        if (!steamCoverId || fastNetworkUnavailable) {
          sourceSettled(attempt, true);
          return null;
        }
        let steamdbFailed = false;
        return ipcRenderer
          .invoke('get-cover-options-steamdb', { orientation: pickerOrientation, steamAppid: steamCoverId })
          .then(async (urls) => {
            const candidates = Array.isArray(urls) ? urls : [];
            const results = await Promise.all(candidates.map((url) => addProviderTile(url, 'SteamDB')));
            if (candidates.length > 0 && !results.some(Boolean)) steamdbFailed = true;
          })
          .catch((err) => {
            steamdbFailed = true;
            debug.warn(`[cover] picker SteamDB options failed => ${err}`);
          })
          .then(() => sourceSettled(attempt, steamdbFailed));
      });
  };
  retrySourcesButton.onclick = () => startSourceLoad();
  startSourceLoad();
}

// Icon counterpart of the cover picker, same dialog. Sources append in order (current, SteamGridDB,
// Steam artwork, install-folder images), so the offline last one still lands in the right place.
function openIconPicker(game, appid, iconCacheAppid, exePath) {
  const overlay = document.createElement('div');
  overlay.className = 'aw-prompt-overlay aw-cover-picker-overlay';
  const box = document.createElement('div');
  box.className = 'aw-prompt aw-cover-picker aw-icon-picker';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const title = t('chooseAnotherIconTitle', 'Choose another icon', "Choisir une autre icône");
  box.setAttribute('aria-label', title);
  const head = document.createElement('div');
  head.className = 'aw-prompt-heading';
  const icon = document.createElement('div');
  icon.className = 'aw-prompt-icon';
  icon.innerHTML = '<i class="fas fa-icons"></i>';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'aw-prompt-title';
  titleWrap.textContent = title;
  head.append(icon, titleWrap);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'aw-prompt-button secondary aw-cover-picker-close';
  closeBtn.textContent = '×';
  closeBtn.title = t('cancel', 'Cancel', 'Annuler');
  head.append(closeBtn);
  const status = document.createElement('div');
  status.className = 'aw-cover-picker-status';
  status.setAttribute('aria-live', 'polite');
  const statusMessage = document.createElement('span');
  statusMessage.textContent = t('iconPickerLoading', 'Loading icons…', 'Chargement des icônes…');
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'aw-prompt-button secondary aw-cover-picker-retry';
  retryButton.textContent = t('retry-artwork', 'Retry', 'Réessayer');
  retryButton.hidden = true;
  status.append(statusMessage, retryButton);
  const grid = document.createElement('div');
  grid.className = 'aw-cover-picker-grid';
  const actions = document.createElement('div');
  actions.className = 'aw-prompt-actions';
  // The manual route also lives inside the gallery: no need to close and right-click again if
  // nothing here is usable.
  const browseBtn = document.createElement('button');
  browseBtn.className = 'aw-prompt-button secondary';
  browseBtn.textContent = t('choose-local-image', 'Choose local image…', 'Choisir une image locale…');
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'aw-prompt-button secondary';
  cancelBtn.textContent = t('cancel', 'Cancel', 'Annuler');
  actions.append(browseBtn, cancelBtn);
  box.append(head, status, grid, actions);
  overlay.append(box);

  const done = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') done();
  };
  closeBtn.onclick = done;
  cancelBtn.onclick = done;
  overlay.onmousedown = (ev) => {
    if (ev.target === overlay) done();
  };
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);

  browseBtn.onclick = () => {
    if (chooseLocalGameIcon(game, appid)) done();
  };

  const seenUrls = new Set();
  let providerTileCount = 0;
  const addTile = (key, source, previewUrl, onPick) => {
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key);
    const tile = document.createElement('div');
    tile.className = 'aw-cover-picker-tile aw-square';
    tile.style.backgroundImage = cssUrl(imageDisplayUrl(previewUrl));
    tile.title = key;
    const tag = document.createElement('span');
    tag.className = 'aw-cover-picker-source';
    tag.textContent = source;
    tile.append(tag);
    tile.onclick = () => {
      onPick();
      done();
    };
    grid.append(tile);
    return true;
  };
  const addProviderTile = async (url, source, previewUrl = url) => {
    try {
      const key = String(url || '').trim();
      if (!key) return false;
      if (seenUrls.has(key)) return true;
      const preview = await resolvePickerPreview(previewUrl, iconCacheAppid);
      if (!preview) return false;
      // What's stored isn't always what was listed: a remote URL is kept as the source, but a
      // schema token is meaningless outside fetch-icon, so its resolved file is stored instead.
      const applyValue = /^https?:/i.test(key) ? key : preview;
      if (addTile(key, source, preview, () => applyGameIconSelection(game, appid, applyValue))) providerTileCount += 1;
      return true;
    } catch (err) {
      debug.warn(`[icon] picker preview failed (${source}) => ${err}`);
      return false;
    }
  };

  let attempt = 0;
  const refreshStatus = (pending, failed) => {
    if (providerTileCount > 0) {
      status.remove();
      return;
    }
    if (!status.isConnected) box.insertBefore(status, grid);
    if (pending) {
      statusMessage.textContent = t('iconPickerLoading', 'Loading icons…', 'Chargement des icônes…');
      retryButton.hidden = true;
      return;
    }
    statusMessage.textContent = failed
      ? t(
          'icon-picker-fetch-failed',
          'Could not fetch alternative icons. Check your connection and retry.',
          'Impossible de récupérer les icônes alternatives. Vérifie ta connexion et réessaie.'
        )
      : t('noIconsFound', 'No alternative icon found.', 'Aucune icône alternative trouvée.');
    retryButton.hidden = false;
  };

  // The icon this game would have with no pick at all, offered as the first tile. Clicking it
  // clears the override instead of storing one, so the game follows its own artwork again.
  const addDefaultTile = async (run) => {
    let resolved = '';
    try {
      resolved = await ipcRenderer.invoke('resolve-square-logo', {
        appid: iconCacheAppid,
        libraryAppid: appid,
        name: game.name || '',
        sources: headerIconSourcesFor(game),
        exe: exePath || '',
        ignoreOverride: true,
      });
    } catch (err) {
      debug.warn(`[icon] default icon lookup failed => ${err}`);
    }
    if (run !== attempt || !resolved) return;
    const preview = await resolvePickerPreview(resolved, iconCacheAppid);
    if (run !== attempt || !preview) return;
    const overridden = !!gameIconOverrideFor(appid);
    // With nothing overridden, the default IS what's on screen, so label it that way instead of
    // offering to restore something already there.
    const label = overridden ? t('defaultCover', 'Default', 'Par défaut') : t('currentCover', 'Current', 'Actuelle');
    if (addTile(resolved, label, preview, () => resetGameIcon(game, appid))) providerTileCount += 1;
  };

  const startSourceLoad = async () => {
    const run = ++attempt;
    refreshStatus(true, false);

    // Local sources cost a readdir and always answer, so paint them before the network is asked
    // anything: the gallery stays usable with no connection at all.
    await addDefaultTile(run);
    if (run !== attempt) return;
    const currentUrl = gameIconOverrideFor(appid) || '';
    if (currentUrl) await addProviderTile(currentUrl, t('currentCover', 'Current', 'Actuelle'));
    for (const localUrl of localGameIconUrls(game)) {
      if (run !== attempt) return;
      await addProviderTile(localUrl, t('iconSourceGameFolder', 'Game folder', 'Dossier du jeu'));
    }
    if (run !== attempt) return;
    refreshStatus(true, false);

    const steamAppid = /^\d+$/.test(String(iconCacheAppid || '')) ? String(iconCacheAppid) : '';
    let failed = false;
    try {
      // The host cuts the game's own Steam artwork into squares before it gets here; offering raw
      // tokens filled the gallery with library covers instead (a 2:3 grid or 2:1 header isn't an icon).
      const options = await ipcRenderer.invoke('get-icon-options', {
        name: game.name || '',
        steamAppid,
        // Same id every other artwork lookup for this game uses, so a Steam-appid-less game still
        // caches its executable icon under its own folder.
        cacheAppid: String(iconCacheAppid || ''),
        sources: headerIconSourcesFor(game),
        exe: exePath || '',
      });
      if (run !== attempt) return;
      const opts = options || {};
      if (opts.exe) await addProviderTile(opts.exe, t('iconSourceExecutable', 'Executable', 'Exécutable'));
      for (const url of Array.isArray(opts.steam) ? opts.steam : []) {
        if (run !== attempt) return;
        await addProviderTile(url, 'Steam');
      }
      for (const asset of Array.isArray(opts.grids) ? opts.grids : []) {
        if (run !== attempt) return;
        await addProviderTile(asset && asset.url, 'SteamGridDB', (asset && asset.thumb) || (asset && asset.url));
      }
      failed = opts.networkError === true && providerTileCount === 0;
    } catch (err) {
      failed = true;
      debug.warn(`[icon] picker options failed => ${err}`);
    }
    if (run !== attempt) return;
    refreshStatus(false, failed);

    // SteamDB last, appended when it finishes: it costs a browser launch, and holding the gallery
    // on "Loading" for it would undo painting everything else immediately.
    if (!steamAppid) return;
    try {
      const urls = await ipcRenderer.invoke('get-icon-options-steamdb', { steamAppid });
      if (run !== attempt) return;
      for (const url of Array.isArray(urls) ? urls : []) {
        if (run !== attempt) return;
        await addProviderTile(url, 'SteamDB');
      }
    } catch (err) {
      debug.warn(`[icon] picker SteamDB options failed => ${err}`);
    }
    if (run !== attempt) return;
    refreshStatus(false, failed);
  };
  retryButton.onclick = () => startSourceLoad();
  startSourceLoad();
}

// Record a picked icon and repaint the header. Remote picks are stored as their source URL (bytes
// stay disposable cache), exactly like a picked cover.
function applyGameIconSelection(game, appid, url) {
  try {
    const stored = gameIconStore.persist(String(appid), url, getUserDataPath(), undefined);
    if (!stored) throw new Error('selected icon could not be persisted');
    reloadGameIconOverrides();
    // paintGameHeaderIcon downloads a remote pick via the icon cache itself, so this one call both
    // stores the selection and puts it on screen.
    paintGameHeaderIcon(game);
    return true;
  } catch (err) {
    debug.warn(`[icon] apply failed => ${err}`);
    remote.dialog.showMessageBox({
      type: 'error',
      message: t('could-not-set-icon', 'Could not set icon: {error}', "Impossible de définir l'icône : {error}", { error: err.message || err }),
    });
    return false;
  }
}

// Drop the pick and go back to the game's own resolved icon. Shared by the context menu and the
// picker's "Default" tile, so both undo a choice the same way.
async function resetGameIcon(game, appid) {
  gameIconStore.remove(String(appid));
  reloadGameIconOverrides();
  await paintGameHeaderIcon(game);
}

// The manual route, shared by the context menu and the picker's own button.
function chooseLocalGameIcon(game, appid) {
  const files = remote.dialog.showOpenDialogSync({
    title: t('choose-icon-image', 'Choose icon image', "Choisir une image d'icône"),
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
  });
  if (!files || !files[0]) return false;
  return applyGameIconSelection(game, appid, pathToFileURL(files[0]).href);
}

// Right-click the square logo to change it, same four actions as the cover submenu. Bound per page
// render (namespaced, so the previous handler goes with it) since the element is shared.
function bindGameHeaderIconMenu(game) {
  const appid = String(game.appid);
  const iconCacheAppid = String(game.steamappid || game.appid);
  $(HEADER_ICON_SELECTOR)
    .attr('title', t('rightClickToChangeIcon', 'Right-click to change this icon', "Clic droit pour changer cette icône"))
    .off('contextmenu.awGameIcon')
    .on('contextmenu.awGameIcon', async function (event) {
      event.preventDefault();
      const { Menu, MenuItem } = remote;
      const menu = new Menu();
      let exePath = '';
      try {
        exePath = gameExecutablePath(game, (await exeList.get(appid))?.exe || '');
      } catch {
        /* no configured executable is normal; the picker simply skips that source */
      }

      menu.append(
        new MenuItem({
          label: t('chooseAnotherIcon', 'Choose another icon…', "Choisir une autre icône…"),
          click() {
            openIconPicker(game, appid, iconCacheAppid, exePath);
          },
        })
      );
      menu.append(
        new MenuItem({
          label: t('choose-local-image', 'Choose local image…', 'Choisir une image locale…'),
          click() {
            chooseLocalGameIcon(game, appid);
          },
        })
      );
      menu.append(
        new MenuItem({
          label: t('re-download-icon', 'Re-download icon', "Retélécharger l'icône"),
          async click() {
            try {
              gameIconStore.remove(appid);
              reloadGameIconOverrides();
              // Forget the cached answer too, or the same picture comes straight back out of
              // steam_cache instead of being looked up again.
              await ipcRenderer.invoke('forget-square-logo', { appid: iconCacheAppid, name: game.name || '' }).catch(() => null);
              await paintGameHeaderIcon(game);
            } catch (err) {
              debug.warn(`[icon] redownload failed => ${err}`);
            }
          },
        })
      );
      if (gameIconOverrideFor(appid)) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(
          new MenuItem({
            label: t('reset-icon-to-default', 'Reset icon to default', "Réinitialiser l'icône"),
            click() {
              resetGameIcon(game, appid);
            },
          })
        );
      }
      menu.popup({ window: remote.getCurrentWindow() });
    });
}
