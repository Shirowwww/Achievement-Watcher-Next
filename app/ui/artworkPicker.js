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

/*
  The header band of the game dialogs (playtime, covers): the game's art behind its icon, the
  dialog title and the game name. The library's painted cover shows at once; Steam's hero art and
  the game icon replace the placeholders when they arrive, and a missing one just leaves the glyph.
*/
function gameDialogBand({ glyph, title, subtitle, game, appid }) {
  const band = document.createElement('div');
  band.className = 'aw-band';
  const icon = document.createElement('span');
  icon.className = 'aw-band-icon';
  icon.innerHTML = `<i class="fas ${glyph}" aria-hidden="true"></i>`;
  const text = document.createElement('div');
  text.className = 'aw-band-text';
  const heading = document.createElement('div');
  heading.className = 'aw-band-title';
  heading.textContent = title;
  text.append(heading);
  if (subtitle) {
    const sub = document.createElement('div');
    sub.className = 'aw-band-subtitle';
    sub.textContent = subtitle;
    text.append(sub);
  }
  band.append(icon, text);
  paintGameBand(band, icon, game, appid).catch((err) => debug.warn(`[dialog] band artwork failed => ${err}`));
  return band;
}

// Wide key art without a logo, made for a banner: Steam's library hero, else SteamGridDB's best hero
// (the host caches that lookup per game, so a second dialog costs nothing).
async function bandHeroArt(game, appid) {
  const steam = await steamHeroBackground(game).catch(() => null);
  if (steam) return steam;
  const images = await ipcRenderer
    .invoke('get-images-for-game', { name: game.name || '', platform: 'PC', gameId: String(game.steamappid || appid) })
    .catch((err) => {
      debug.warn(`[dialog] SteamGridDB hero lookup failed => ${err}`);
      return null;
    });
  if (!images || !images.background) return null;
  return resolvePickerPreview(images.background, String(game.steamappid || appid));
}

async function paintGameBand(band, icon, game, appid) {
  const setArt = (url) => {
    if (!url) return;
    band.style.setProperty('--band-art', cssUrl(url));
    band.classList.add('has-art');
  };
  const paintedCover = cssUrlValue($(`#game-header-${appid}`).first().css('background-image'));
  if (!game) {
    setArt(paintedCover);
    return;
  }
  const iconSource = gameIconOverrideFor(appid) || (game.img && game.img.icon);
  const [hero, iconUrl] = await Promise.all([
    bandHeroArt(game, appid),
    iconSource ? resolvePickerPreview(iconSource, String(game.steamappid || appid)) : null,
  ]);
  if (!band.isConnected) return;
  // The cover is the last resort: its logo and title, blown up behind the band, read as noise.
  setArt(hero ? imageDisplayUrl(hero) : paintedCover);
  // The icon picker previews its pick in this slot: a late answer here must not paint over it.
  if (iconUrl && !icon.dataset.picked) {
    icon.style.setProperty('--band-icon', cssUrl(iconUrl));
    icon.classList.add('has-icon');
  }
}

// The size the cover really has in the library: the painted tile when it is on screen, otherwise
// the default tile of the current view (a hidden or filtered-out game has no box to measure).
// The library tile's picture: rounded like the card on top, a little less where the title starts.
const DEFAULT_TILE_RADIUS = '12px 12px 9px 9px';

function libraryCoverSize(appid, portrait) {
  const header = document.getElementById(`game-header-${appid}`);
  const rect = header ? header.getBoundingClientRect() : null;
  // A tile of the other shape is mid re-render after a view switch: trust the defaults then.
  const tileIsPortrait = rect && rect.height > rect.width;
  if (rect && rect.width > 0 && rect.height > 0 && tileIsPortrait === portrait) {
    return { width: Math.round(rect.width), height: Math.round(rect.height), radius: getComputedStyle(header).borderRadius };
  }
  return portrait ? { width: 172, height: 258, radius: DEFAULT_TILE_RADIUS } : { width: 250, height: 117, radius: DEFAULT_TILE_RADIUS };
}

function libraryProgressOf(appid) {
  const header = document.getElementById(`game-header-${appid}`);
  const box = header && header.closest('.game-box');
  const bar = box && box.querySelector('.progressBar');
  const percent = Number(bar && bar.dataset.percent);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
}

// SteamDB lists each capsule twice (300x450 and its _2x 600x900): keep the sharper one only.
function sharpestCapsules(urls) {
  const listed = new Set(urls);
  return urls.filter((url) => {
    const sharper = String(url).replace(/(\.[a-z0-9]+)(\?.*)?$/i, '_2x$1$2');
    return sharper === url || !listed.has(sharper);
  });
}

// The right-hand pane: the chosen picture in a copy of its library tile, at the tile's own size,
// with the three ways it can sit in that tile.
function coverPreviewPane(game, appid, size, fit, onFit) {
  const pane = document.createElement('aside');
  pane.className = 'aw-cover-preview';
  const label = document.createElement('div');
  label.className = 'aw-cover-preview-label';
  label.textContent = t('cover-preview', 'Preview', 'Aperçu');
  const card = document.createElement('div');
  card.className = 'aw-cover-preview-card';
  card.style.width = `${size.width}px`;
  const art = document.createElement('div');
  art.className = 'aw-cover-preview-art';
  art.style.height = `${size.height}px`;
  art.style.borderRadius = size.radius;
  const info = document.createElement('div');
  info.className = 'aw-cover-preview-info';
  const name = document.createElement('div');
  name.className = 'aw-cover-preview-name';
  name.textContent = (game && game.name) || '';
  const progress = libraryProgressOf(appid) ?? 0;
  const bar = document.createElement('div');
  bar.className = 'aw-cover-preview-bar';
  const meter = document.createElement('span');
  meter.style.width = `${progress}%`;
  bar.append(meter);
  const percent = document.createElement('span');
  percent.className = 'aw-cover-preview-percent';
  percent.textContent = formatPercentValue(progress);
  const progressRow = document.createElement('div');
  progressRow.className = 'aw-cover-preview-progress';
  progressRow.append(bar, percent);
  info.append(name, progressRow);
  card.append(art, info);

  const fitLabel = document.createElement('div');
  fitLabel.className = 'aw-cover-preview-label';
  fitLabel.textContent = t('cover-fit', 'Fit in the tile', 'Dans la tuile');
  const fits = document.createElement('div');
  fits.className = 'aw-segmented';
  fits.setAttribute('role', 'radiogroup');
  fits.setAttribute('aria-label', fitLabel.textContent);
  const names = {
    fill: t('cover-fit-fill', 'Fill', 'Remplir'),
    contain: t('cover-fit-contain', 'Whole', 'Entière'),
    stretch: t('cover-fit-stretch', 'Stretch', 'Étendre'),
  };
  const buttons = coverFit.FITS.map((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.textContent = names[value];
    button.onclick = () => onFit(value);
    fits.append(button);
    return { value, button };
  });
  const hint = document.createElement('div');
  hint.className = 'aw-prompt-hint';
  hint.textContent = t('cover-dblclick-hint', 'Double-click a cover to use it at once.', 'Double-clic sur une jaquette pour l’utiliser aussitôt.');
  pane.append(label, card, fitLabel, fits, hint);

  const paint = (url, nextFit) => {
    art.style.backgroundImage = url ? cssUrl(url) : '';
    art.style.setProperty('--cover-url', url ? cssUrl(url) : 'none');
    art.classList.toggle('is-contain', nextFit === 'contain');
    art.classList.toggle('is-stretch', nextFit === 'stretch');
    for (const { value, button } of buttons) button.setAttribute('aria-checked', String(value === nextFit));
  };
  paint('', fit);
  return { pane, paint };
}

const GALLERY_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const ROW_TOLERANCE_PX = 4;

function galleryTiles(gallery) {
  return [...gallery.querySelectorAll('.aw-cover-picker-tile:not(.is-pending)')];
}

// The whole gallery is one Tab stop (the selected tile, else the first); arrows move inside it.
function syncTabStop(gallery, preferred) {
  const tiles = galleryTiles(gallery);
  const stop = preferred && preferred.isConnected ? preferred : tiles[0];
  for (const tile of tiles) tile.tabIndex = tile === stop ? 0 : -1;
}

// The nearest tile in the next or previous row, by horizontal centre: sections have their own grids.
function tileInRow(tiles, from, down) {
  const origin = from.getBoundingClientRect();
  const ahead = tiles
    .map((tile) => ({ tile, rect: tile.getBoundingClientRect() }))
    .filter(({ rect }) => (down ? rect.top > origin.top + ROW_TOLERANCE_PX : rect.top < origin.top - ROW_TOLERANCE_PX));
  if (!ahead.length) return null;
  const tops = ahead.map(({ rect }) => rect.top);
  const rowTop = down ? Math.min(...tops) : Math.max(...tops);
  const centre = origin.left + origin.width / 2;
  const distance = ({ rect }) => Math.abs(rect.left + rect.width / 2 - centre);
  return ahead.filter(({ rect }) => Math.abs(rect.top - rowTop) < ROW_TOLERANCE_PX).reduce((best, item) => (distance(item) < distance(best) ? item : best)).tile;
}

function bindGalleryKeys(gallery) {
  gallery.addEventListener('keydown', (e) => {
    const from = e.target.closest && e.target.closest('.aw-cover-picker-tile');
    if (!from || !GALLERY_KEYS.has(e.key)) return;
    const tiles = galleryTiles(gallery);
    const index = tiles.indexOf(from);
    let next = null;
    if (e.key === 'ArrowLeft') next = tiles[index - 1];
    else if (e.key === 'ArrowRight') next = tiles[index + 1];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') next = tileInRow(tiles, from, e.key === 'ArrowDown');
    else next = e.key === 'Home' ? tiles[0] : tiles[tiles.length - 1];
    e.preventDefault();
    if (!next) return;
    syncTabStop(gallery, next);
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  });
}

// A soft fade at the bottom says the gallery goes on; it lifts once the end is in view.
function markMoreBelow(gallery) {
  gallery.classList.toggle('has-more', gallery.scrollTop + gallery.clientHeight < gallery.scrollHeight - 4);
}

// One section per source, in a fixed order whatever answers first; empty ones stay hidden.
function coverGroups(gallery) {
  const groups = new Map();
  const groupLabels = [
    ['library', t('cover-group-library', 'In your library', 'Dans ta bibliothèque')],
    ['Steam', 'Steam'],
    ['SteamGridDB', 'SteamGridDB'],
    ['SteamDB', 'SteamDB'],
  ];
  for (const [key, text] of groupLabels) {
    const section = document.createElement('section');
    section.className = 'aw-cover-group';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.className = 'aw-cover-group-title';
    heading.textContent = text;
    const grid = document.createElement('div');
    grid.className = 'aw-cover-picker-grid';
    section.append(heading, grid);
    gallery.append(section);
    groups.set(key, { section, grid });
  }
  return groups;
}

// Show alternate Steam, SteamGridDB and SteamDB covers for a game, beside a true-size preview.
function openCoverPicker(game, appid, coverCacheAppid) {
  const portraitView = !!(app.config && app.config.achievement && app.config.achievement.thumbnailPortrait);
  const pickerOrientation = portraitView ? 'portrait' : 'landscape';
  const img = (game && game.img) || {};
  const defaultUrl = portraitView ? img.portrait || img.header || img.landscape : img.header || img.landscape || img.portrait;
  const overrideUrl = coverOverrideFor(appid, pickerOrientation);
  const currentUrl = overrideUrl || defaultUrl;
  const initialFit = coverFitFor(appid, pickerOrientation);
  const size = libraryCoverSize(appid, portraitView);
  let fit = initialFit;
  let selected = null;

  const overlay = document.createElement('div');
  overlay.className = 'aw-prompt-overlay aw-cover-picker-overlay';
  const box = document.createElement('div');
  box.className = 'aw-prompt has-band aw-cover-picker';
  box.style.setProperty('--cover-ratio', `${size.width} / ${size.height}`);
  if (!portraitView) box.classList.add('is-landscape');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const title = t('chooseAnotherCoverTitle', 'Choose another cover', 'Choisir une autre jaquette');
  box.setAttribute('aria-label', title);
  const band = gameDialogBand({ glyph: 'fa-images', title, subtitle: game && game.name, game, appid });

  const gallery = document.createElement('div');
  gallery.className = 'aw-cover-picker-gallery';
  const status = document.createElement('div');
  status.className = 'aw-cover-picker-status';
  status.setAttribute('aria-live', 'polite');
  const placeholders = document.createElement('div');
  placeholders.className = 'aw-cover-picker-grid aw-cover-picker-pending';
  for (let i = 0; i < 3; i += 1) {
    const ghost = document.createElement('div');
    ghost.className = 'aw-cover-picker-tile is-pending';
    if (!portraitView) ghost.classList.add('aw-landscape');
    placeholders.append(ghost);
  }
  const statusMessage = document.createElement('span');
  statusMessage.textContent = t('coverPickerLoading', 'Loading covers…', 'Chargement des jaquettes…');
  const retrySourcesButton = document.createElement('button');
  retrySourcesButton.type = 'button';
  retrySourcesButton.className = 'aw-prompt-button secondary aw-cover-picker-retry';
  retrySourcesButton.textContent = t('retry-artwork', 'Retry', 'Réessayer');
  retrySourcesButton.hidden = true;
  status.append(statusMessage, retrySourcesButton);

  const groups = coverGroups(gallery);
  // Under the library's own covers: the message is about what else exists, not about those.
  const afterLibrary = () => groups.get('library').section.after(status, placeholders);
  afterLibrary();

  const previewPane = coverPreviewPane(game, appid, size, fit, (value) => {
    fit = value;
    previewPane.paint(selected && selected.preview, fit);
    refreshUse();
  });
  const body = document.createElement('div');
  body.className = 'aw-cover-picker-body';
  body.append(gallery, previewPane.pane);

  const actions = document.createElement('div');
  actions.className = 'aw-prompt-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'aw-prompt-button secondary';
  cancelBtn.textContent = t('cancel', 'Cancel', 'Annuler');
  const useBtn = document.createElement('button');
  useBtn.className = 'aw-prompt-button primary';
  useBtn.textContent = t('cover-use', 'Use this one', 'Utiliser celle-ci');
  actions.append(cancelBtn, useBtn);
  box.append(band, body, actions);
  overlay.append(box);

  const isUnchanged = () => !selected || (selected.url === currentUrl && fit === initialFit);
  function refreshUse() {
    useBtn.disabled = isUnchanged();
  }

  const opener = document.activeElement;
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('is-closing');
    setTimeout(() => overlay.remove(), 140);
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  };
  cancelBtn.onclick = done;
  overlay.onmousedown = (ev) => {
    if (ev.target === overlay) done();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') done();
  };
  document.addEventListener('keydown', onKey);

  const apply = async () => {
    if (closed || !selected) return;
    const { url } = selected;
    done();
    try {
      coverFit.set(String(appid), pickerOrientation, fit);
      reloadCoverFits();
      if (url !== currentUrl) {
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
      }
      applyCoverFit($(`#game-header-${appid}`), String(appid), pickerOrientation);
    } catch (err) {
      debug.warn(`[cover] picker apply failed => ${err}`);
    }
  };
  useBtn.onclick = apply;

  const select = (entry) => {
    if (selected) selected.tile.setAttribute('aria-pressed', 'false');
    selected = entry;
    entry.tile.setAttribute('aria-pressed', 'true');
    previewPane.paint(entry.preview, fit);
    refreshUse();
    syncTabStop(gallery, entry.tile);
  };
  bindGalleryKeys(gallery);
  gallery.addEventListener('scroll', () => markMoreBelow(gallery), { passive: true });

  // Show the gallery even when loading its options fails.
  document.body.append(overlay);
  refreshUse();
  cancelBtn.focus();

  const seenUrls = new Set();
  let providerTileCount = 0;
  const resolvePreview = (url) => resolvePickerPreview(url, coverCacheAppid);
  const addTile = (url, source, previewUrl = url, group = source) => {
    const key = String(url || '').trim();
    if (!key || seenUrls.has(key)) return;
    seenUrls.add(key);
    const tile = document.createElement('div');
    tile.className = 'aw-cover-picker-tile';
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-pressed', 'false');
    tile.tabIndex = -1;
    if (!portraitView) tile.classList.add('aw-landscape');
    const shown = path.isAbsolute(String(previewUrl || '')) ? pathToFileURL(previewUrl).href : previewUrl;
    tile.style.backgroundImage = cssUrl(shown);
    tile.title = url;
    const tag = document.createElement('span');
    tag.className = 'aw-cover-picker-source';
    tag.textContent = source;
    // The section already names the provider; only Current and Default need a word on the tile.
    if (group === 'library') tile.append(tag);
    const entry = { url, preview: shown, tile };
    tile.onclick = () => select(entry);
    tile.ondblclick = () => {
      select(entry);
      apply();
    };
    tile.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        select(entry);
        apply();
      } else if (e.key === ' ') {
        e.preventDefault();
        select(entry);
      }
    };
    const target = groups.get(groups.has(group) ? group : 'library');
    // Twenty tiles all called "SteamGridDB" read as one: number them within their section.
    tile.setAttribute('aria-label', group === 'library' ? source : `${source} ${target.grid.children.length + 1}`);
    target.grid.append(tile);
    target.section.hidden = false;
    if (url === currentUrl && !selected) select(entry);
    else syncTabStop(gallery, selected && selected.tile);
    markMoreBelow(gallery);
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
    if (preview) addTile(url, source, preview, 'library');
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

  const steamCoverId = steamAppidOf(game);

  let pendingSources = 0;
  let failedSources = 0;
  let sourceAttempt = 0;
  const refreshStatus = () => {
    placeholders.hidden = !(pendingSources > 0 && providerTileCount === 0);
    if (providerTileCount > 0) {
      status.remove();
      return;
    }
    if (!status.isConnected) afterLibrary();
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
        // SteamDB only has portrait capsules, so a landscape tile never asks it. It also launches a
        // browser scrape - skip it once the fast providers proved the network unavailable.
        if (!portraitView) {
          sourceSettled(attempt, false);
          return null;
        }
        if (!steamCoverId || fastNetworkUnavailable) {
          sourceSettled(attempt, true);
          return null;
        }
        let steamdbFailed = false;
        return ipcRenderer
          .invoke('get-cover-options-steamdb', { orientation: pickerOrientation, steamAppid: steamCoverId })
          .then(async (urls) => {
            const candidates = sharpestCapsules(Array.isArray(urls) ? urls : []);
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

// Icon counterpart of the cover picker, kept simpler: the band's own icon is the preview, so there is
// no side pane and no fit to choose. Sources append in order (current, game folder, executable, Steam,
// SteamGridDB, SteamDB), so the local ones are there before the network answers.
function openIconPicker(game, appid, iconCacheAppid, exePath) {
  const overlay = document.createElement('div');
  overlay.className = 'aw-prompt-overlay aw-cover-picker-overlay';
  const box = document.createElement('div');
  box.className = 'aw-prompt has-band aw-cover-picker aw-icon-picker';
  box.style.setProperty('--cover-ratio', '1 / 1');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const title = t('chooseAnotherIconTitle', 'Choose another icon', "Choisir une autre icône");
  box.setAttribute('aria-label', title);
  const band = gameDialogBand({ glyph: 'fa-icons', title, subtitle: game && game.name, game, appid });
  const bandIcon = band.querySelector('.aw-band-icon');

  const gallery = document.createElement('div');
  gallery.className = 'aw-cover-picker-gallery';
  const groups = coverGroups(gallery);
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
  const afterLibrary = () => groups.get('library').section.after(status);
  afterLibrary();

  const actions = document.createElement('div');
  actions.className = 'aw-prompt-actions';
  // The manual route also lives inside the gallery: no need to close and right-click again if
  // nothing here is usable.
  const browseBtn = document.createElement('button');
  browseBtn.className = 'aw-prompt-button secondary aw-icon-picker-browse';
  browseBtn.textContent = t('choose-local-image', 'Choose local image…', 'Choisir une image locale…');
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'aw-prompt-button secondary';
  cancelBtn.textContent = t('cancel', 'Cancel', 'Annuler');
  const useBtn = document.createElement('button');
  useBtn.className = 'aw-prompt-button primary';
  useBtn.textContent = t('cover-use', 'Use this one', 'Utiliser celle-ci');
  actions.append(browseBtn, cancelBtn, useBtn);
  box.append(band, gallery, actions);
  overlay.append(box);

  let selected = null;
  const refreshUse = () => {
    useBtn.disabled = !selected || selected.isCurrent;
  };
  const opener = document.activeElement;
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('is-closing');
    setTimeout(() => overlay.remove(), 140);
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') done();
  };
  cancelBtn.onclick = done;
  overlay.onmousedown = (ev) => {
    if (ev.target === overlay) done();
  };
  document.addEventListener('keydown', onKey);
  const apply = () => {
    if (closed || !selected) return;
    const { onPick, isCurrent } = selected;
    done();
    if (!isCurrent) onPick();
  };
  useBtn.onclick = apply;
  browseBtn.onclick = () => {
    if (chooseLocalGameIcon(game, appid)) done();
  };

  // The band's icon shows the pick, at the size it will have beside the title.
  const select = (entry) => {
    if (selected) selected.tile.setAttribute('aria-pressed', 'false');
    selected = entry;
    entry.tile.setAttribute('aria-pressed', 'true');
    bandIcon.dataset.picked = '1';
    bandIcon.style.setProperty('--band-icon', cssUrl(entry.preview));
    bandIcon.classList.add('has-icon');
    refreshUse();
    syncTabStop(gallery, entry.tile);
  };
  bindGalleryKeys(gallery);
  gallery.addEventListener('scroll', () => markMoreBelow(gallery), { passive: true });
  document.body.append(overlay);
  refreshUse();
  cancelBtn.focus();

  const seenUrls = new Set();
  let providerTileCount = 0;
  const addTile = (key, source, previewUrl, onPick, group = 'library', isCurrent = false) => {
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key);
    const tile = document.createElement('div');
    tile.className = 'aw-cover-picker-tile aw-square';
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-pressed', 'false');
    tile.tabIndex = -1;
    const preview = imageDisplayUrl(previewUrl);
    tile.style.backgroundImage = cssUrl(preview);
    tile.title = key;
    if (group === 'library') {
      const tag = document.createElement('span');
      tag.className = 'aw-cover-picker-source';
      tag.textContent = source;
      tile.append(tag);
    }
    const entry = { tile, preview, onPick, isCurrent };
    tile.onclick = () => select(entry);
    tile.ondblclick = () => {
      select(entry);
      apply();
    };
    tile.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        select(entry);
        apply();
      } else if (e.key === ' ') {
        e.preventDefault();
        select(entry);
      }
    };
    const target = groups.get(group);
    tile.setAttribute('aria-label', group === 'library' ? source : `${source} ${target.grid.children.length + 1}`);
    target.grid.append(tile);
    target.section.hidden = false;
    if (isCurrent && !selected) select(entry);
    else syncTabStop(gallery, selected && selected.tile);
    markMoreBelow(gallery);
    return true;
  };
  const addProviderTile = async (url, source, previewUrl = url, group = 'library', isCurrent = false) => {
    try {
      const key = String(url || '').trim();
      if (!key) return false;
      if (seenUrls.has(key)) return true;
      const preview = await resolvePickerPreview(previewUrl, iconCacheAppid);
      if (!preview) return false;
      // What's stored isn't always what was listed: a remote URL is kept as the source, but a
      // schema token is meaningless outside fetch-icon, so its resolved file is stored instead.
      const applyValue = /^https?:/i.test(key) ? key : preview;
      if (addTile(key, source, preview, () => applyGameIconSelection(game, appid, applyValue), group, isCurrent)) providerTileCount += 1;
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
    if (!status.isConnected) afterLibrary();
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

  // The icon this game would have with no pick at all, offered as the first tile. Applying it
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
    if (addTile(resolved, label, preview, () => resetGameIcon(game, appid), 'library', !overridden)) providerTileCount += 1;
  };

  const startSourceLoad = async () => {
    const run = ++attempt;
    refreshStatus(true, false);

    // Local sources cost a readdir and always answer, so paint them before the network is asked
    // anything: the gallery stays usable with no connection at all.
    const currentUrl = gameIconOverrideFor(appid) || '';
    if (currentUrl) await addProviderTile(currentUrl, t('currentCover', 'Current', 'Actuelle'), currentUrl, 'library', true);
    await addDefaultTile(run);
    if (run !== attempt) return;
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
        await addProviderTile(url, 'Steam', url, 'Steam');
      }
      for (const asset of Array.isArray(opts.grids) ? opts.grids : []) {
        if (run !== attempt) return;
        await addProviderTile(asset && asset.url, 'SteamGridDB', (asset && asset.thumb) || (asset && asset.url), 'SteamGridDB');
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
        await addProviderTile(url, 'SteamDB', url, 'SteamDB');
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
