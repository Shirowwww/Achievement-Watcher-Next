'use strict';

/*
  The notification preset designer, Settings > Notification presets: its controls, the preview
  (card, Compare and Screen), the full-screen editor and its timeline, and imported SAN presets
  edited live. presetCanvasEditor.js, sanLookPanel.js and sanLivePreview.js draw their parts;
  this wires them to the panel. ui/settings.js calls createPresetDesigner() once, at page load.
*/

const remote = require('@electron/remote');
const { ipcRenderer } = require('electron');
const path = require('path');
// The names this code had in ui/settings.js, which shares one global scope with app.js.
const settingsFs = require('fs');

const appPath = remote.app.getAppPath();
const settingsRarityTiers = require('../util/rarityTiers.js');
const notificationInsets = require('../util/notificationInsets.js');

// What it needs from the settings page: its jQuery, the app state and logger, and a few helpers.
function createPresetDesigner({
  $,
  app,
  debug,
  t,
  ensureFrame,
  registerLocaleRefresh,
  resolveSoundFile,
  overlayTestData,
  previewSoundAtVolume,
  updatePresetTabVisibility,
}) {
  // The preview is the REAL preset (same markup, engine and stylesheet the notification window
  // loads) rendered in an iframe, so it cannot drift from what an unlock actually looks like.
  const presetSchema = require(path.join(appPath, 'util/presetSchema.js'));
  const presetGenerator = require(path.join(appPath, 'util/customPreset.js'));
  const presetTemplates = require(path.join(appPath, 'util/presetTemplates.js'));
  const presetPanel = require(path.join(appPath, 'util/presetPanel.js'));
  const presetLayerTool = require(path.join(appPath, 'util/presetLayer.js'));

  // Value formatting for the readout beside each slider. Purely cosmetic: the stored value is
  // always what the schema says.
  function presetReadout(property, value) {
    // Both kinds of percentage: a 0-1 factor shown as 20-100%, and a slider that is already one.
    if (property.percent) return Math.round(value * 100) + '%';
    if (property.scale === 100) return Math.round(value) + '%';
    if (property.key === 'duration') return (value / 1000).toFixed(value % 1000 ? 1 : 0) + 's';
    // No minimum: the card takes the height of what it holds.
    if (property.key === 'minHeight' && !value) return $('#pd-word-auto').text() || 'auto';
    return String(value) + (property.unit === 'deg' ? '°' : property.unit || '');
  }

  // The one place that reads the designer's controls; the preview, Create and Export all work
  // from this, so none of them can show a different design.
  function readPresetOptions() {
    const options = {};
    for (const property of presetSchema.PRESET_PROPERTIES) {
      const control = $('#pd-' + property.key);
      if (!control.length) continue;
      const raw = control.val();
      if (property.type === 'number') {
        const number = parseFloat(raw);
        options[property.key] = property.percent ? number / 100 : number;
      } else {
        options[property.key] = raw;
      }
    }
    return presetSchema.normalizeOptions(options);
  }

  // Put a full set of options into the controls. Anything missing falls back to its default, so
  // this also serves as "reset".
  function writePresetOptions(options) {
    const values = presetSchema.normalizeOptions(options);
    for (const property of presetSchema.PRESET_PROPERTIES) {
      const control = $('#pd-' + property.key);
      if (!control.length) continue;
      const value = values[property.key];
      if (property.type === 'canvas') control.val(JSON.stringify(value));
      else control.val(property.type === 'number' && property.percent ? Math.round(value * 100) : String(value));
    }
    refreshPresetControls();
  }

  // Readouts, and the fields that only apply in one mode (the second gradient colour, artwork
  // dimming): shown doing something or not shown at all.
  function refreshPresetControls() {
    const values = readPresetOptions();
    for (const property of presetSchema.PRESET_PROPERTIES) {
      if (property.type === 'number') $('#pd-val-' + property.key).text(presetReadout(property, values[property.key]));
    }
    $('#options-notify-designer .pd-field[data-shown-for]').each(function () {
      const [key, allowed] = String($(this).attr('data-shown-for')).split(':');
      $(this).prop('hidden', !String(allowed).split(',').includes(String(values[key])));
    });
    showStateFields();
    return values;
  }

  // The colours of a rare unlock, of 100% or of a progress bar, shown while the preview shows that
  // state (Compare shows them all); a group left with none of its fields goes too. A class, not
  // `hidden`: the layer sections own that attribute.
  function showStateFields() {
    const all = previewView === 'compare';
    $('#options-notify-designer .pd-field[data-states]').each(function () {
      const states = String($(this).attr('data-states')).split(',');
      $(this).toggleClass('is-other-state', !all && !states.includes(previewState));
    });
    $('#options-notify-designer .pd-group').each(function () {
      const fields = $(this).find('.pd-field');
      $(this).toggleClass('is-other-state', fields.length > 0 && fields.not('.is-other-state').length === 0);
    });
  }

  // Sample payloads matching createNotificationWindow(); artwork/icon are inlined as data URIs
  // since the preview frame is a srcdoc document where file:// images aren't reliably loadable.
  let previewState = 'normal';
  // One sample rarity per tier, inside that tier's band for the saved grading: the popup and the
  // main process grade it again, so a fixed rate showed gold for every tier in trophy mode.
  function rarePreviewRate(state) {
    const grading = settingsRarityTiers.gradingFrom(app.config && app.config.achievement);
    return settingsRarityTiers.sampleRate(state, grading.mode, grading.thresholds);
  }
  let previewView = 'card';
  // Created once the designer's helpers exist (below); the preview code checks for it.
  let canvasEditor = null;
  const CANVAS_FULL_ZOOM = 2.5;
  // The +/- and Ctrl+wheel magnification, see zoomStage().
  let stageZoom = 1;
  // Held while something is dragged: a refit then would move the card out from under the pointer.
  let heldFit = null;
  // Full screen edits with room around the card; the normal view shows the popup as it ships.
  const editingLayout = () => Boolean(canvasEditor && canvasEditor.isFull());
  // The editor's timeline plays or holds the card: the full-screen preview takes its entrances.
  let previewMotion = false;
  function fileAsDataUri(file, mime) {
    try {
      return `data:${mime};base64,${settingsFs.readFileSync(file).toString('base64')}`;
    } catch (e) {
      return '';
    }
  }
  let previewIcon = '';
  // Preview artwork is one of the user's own game headers (what a notification is actually seen
  // over); an empty library falls back to a painted scene rather than the app logo.
  let previewArt = null;
  let previewArtFile = '';
  // Width/height read straight from the PNG or JPEG header bytes, cheaper than an image library.
  function imageDimensions(file) {
    try {
      const buffer = settingsFs.readFileSync(file);
      if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
      }
      if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        // Walk the segment chain to the frame header, which is the only one carrying the size.
        for (let at = 2; at + 9 < buffer.length; ) {
          if (buffer[at] !== 0xff) return null;
          const marker = buffer[at + 1];
          const length = buffer.readUInt16BE(at + 2);
          const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
          if (isFrame) return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
          at += 2 + length;
        }
      }
    } catch (e) {
      debug.log(e);
    }
    return null;
  }

  // The covers a sample card can show, landscape ones first.
  function artworkPool() {
    const userData = ipcRenderer.sendSync('get-user-data-path-sync');
    const candidates = [];
    // covers/ only exists once a custom cover was picked; its absence is not worth a stack trace.
    const covers = path.join(userData, 'covers');
    const names = settingsFs.existsSync(covers) ? settingsFs.readdirSync(covers) : [];
    for (const name of names) {
      if (/\.(png|jpe?g|webp)$/i.test(name)) candidates.push(path.join(covers, name));
    }
    // Landscape first: a header fills the card, where a portrait cover is cropped to a sliver of
    // itself. Read from the file header rather than pulling in an image library for one number.
    const landscape = candidates.filter((file) => {
      const size = imageDimensions(file);
      return size && size.width > size.height;
    });
    return landscape.length ? landscape : candidates;
  }

  // The gallery's pictures are kept between sessions, so they always show the same cover: a random
  // one would make every launch a miss and draw them all again.
  let galleryArt = null;
  function galleryArtFile() {
    if (galleryArt !== null) return galleryArt;
    try {
      galleryArt = artworkPool().sort()[0] || '';
    } catch (e) {
      debug.log(e);
      galleryArt = '';
    }
    return galleryArt;
  }

  function previewArtwork() {
    if (previewArt !== null) return previewArt;
    previewArt = '';
    try {
      const pool = artworkPool();
      if (pool.length) {
        const file = pool[Math.floor(Math.random() * pool.length)];
        previewArt = fileAsDataUri(file, /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
        previewArtFile = file;
      }
    } catch (e) {
      debug.log(e);
    }
    return previewArt;
  }
  // The artwork backdrop stands for the game a notification is seen over: a Steam library hero,
  // which has no logo to fight the card's text, when one is cached; else the payload's header.
  let previewHero = null;
  function previewBackdrop() {
    if (previewHero === null) {
      previewHero = '';
      try {
        const icons = path.join(ipcRenderer.sendSync('get-user-data-path-sync'), 'steam_cache', 'icon');
        const heroes = (settingsFs.existsSync(icons) ? settingsFs.readdirSync(icons) : [])
          .map((dir) => path.join(icons, dir, 'library_hero.jpg'))
          .filter((file) => settingsFs.existsSync(file));
        if (heroes.length) previewHero = fileAsDataUri(heroes[Math.floor(Math.random() * heroes.length)], 'image/jpeg');
      } catch (e) {
        debug.log(e);
      }
    }
    return previewHero || previewArtwork();
  }
  // An offscreen snapshot loads the preset from its own folder, where a file path works for every
  // preset; some shipped ones put file:/// in front of whatever they get, a data URI included.
  function snapshotPayload(payload) {
    const files = new Map([
      [previewIcon, path.join(appPath, 'resources/img/achievement.svg')],
      [previewArt, previewArtFile],
    ]);
    const out = { ...payload };
    for (const key of ['iconPath', 'imagePath', 'gameIconPath']) if (out[key] && files.get(out[key])) out[key] = files.get(out[key]);
    return out;
  }

  function previewPayload(state = previewState) {
    if (!previewIcon) previewIcon = fileAsDataUri(path.join(appPath, 'resources/img/achievement.svg'), 'image/svg+xml');
    const artwork = previewArtwork();
    const base = {
      iconPath: previewIcon,
      imagePath: artwork,
      gameIconPath: artwork,
      // Presets that print the game name get a sample too, or the row they asked for would preview
      // empty and look broken.
      gameName: t('preset-sample-game', 'Sample Game', 'Jeu d’exemple'),
      scale: 1,
    };
    const percent = rarePreviewRate(state);
    if (percent) {
      return Object.assign(base, {
        displayName: t('test-rare-name', 'Rare Achievement', 'Succès rare'),
        description: t('test-rare-desc', 'Rare · {percent}% of players', 'Rare · {percent} % des joueurs', { percent }),
        notificationType: 'achievement',
        rarityPercent: percent,
        rarityTier: state,
        // Shown as a hidden one too, so the padlock option has somewhere to be seen.
        hidden: true,
      });
    }
    if (state === 'completion') {
      return Object.assign(base, {
        displayName: t('test-platinum-name', 'Platinum!', 'Trophée Platine'),
        description: t('test-platinum-desc', '100% completed', '100 % complété'),
        notificationType: 'platinum',
        isPlatinum: true,
      });
    }
    if (state === 'progress') {
      return Object.assign(base, {
        displayName: t('test-progress-name', 'Progress', 'Progression'),
        description: t('test-progress-desc', '3 / 10', '3 / 10'),
        notificationType: 'progress',
        progress: { current: 3, max: 10, percent: 30 },
      });
    }
    return Object.assign(base, {
      displayName: t('test-toast-name', 'Achievement Unlocked', 'Succès débloqué'),
      description: t('preset-sample-detail', 'Sample achievement description', 'Exemple de description de succès'),
      notificationType: 'achievement',
    });
  }

  // Preset background pictures live in <userData>/presets/images; the srcdoc preview needs data
  // URIs, so `presetAssetUrl` resolves and caches them (the stylesheet rebuilds on every slider move).
  let presetImages = [];
  let presetFonts = [];
  const presetImageUris = new Map();

  // One menu per kind of file the designer can attach: the first entry is "none", and a name the
  // folder no longer holds stays listed so that re-saving does not silently drop it.
  function fillAssetMenu(sel, files, keep) {
    if (!sel.length) return;
    sel.empty();
    sel.append($('<option>').attr('value', '').text(sel.attr('data-lang-none') || ''));
    const names = files.map((entry) => entry.name);
    if (keep && !names.includes(keep)) names.push(keep);
    names.sort((a, b) => a.localeCompare(b));
    names.forEach((name) => sel.append($('<option>').attr('value', name).text(name)));
    sel.val(names.includes(keep) ? keep : '');
  }

  // The background and the logo draw from one folder of pictures; a logo has a smaller size limit,
  // so the logo menu leaves out what the generator would refuse to copy.
  function refreshPresetImages(selected, selectedLogo) {
    return ipcRenderer
      .invoke('list-preset-images')
      .then((images) => {
        presetImages = images || [];
        const bg = $('#pd-bgImage');
        const logo = $('#pd-logoImage');
        fillAssetMenu(bg, presetImages, selected != null ? selected : bg.val() || '');
        fillAssetMenu(
          logo,
          presetImages.filter((image) => image.size <= presetSchema.MAX_LOGO_BYTES),
          selectedLogo != null ? selectedLogo : logo.val() || ''
        );
        // The list arrives after the controls were written; repaint the preview now in case its
        // pictures had not yet reached the menus when the design was applied.
        if (bg.val() || logo.val()) updatePreviewStyles(readPresetOptions());
      })
      .catch((err) => debug.log(err));
  }

  function refreshPresetFonts(selected) {
    return ipcRenderer
      .invoke('list-preset-fonts')
      .then((fonts) => {
        presetFonts = fonts || [];
        const sel = $('#pd-fontFile');
        fillAssetMenu(sel, presetFonts, selected != null ? selected : sel.val() || '');
        if (sel.val()) updatePreviewStyles(readPresetOptions());
      })
      .catch((err) => debug.log(err));
  }

  // Pictures and fonts both reach the srcdoc preview as data URIs. An empty answer is not cached,
  // since it only means the folder listing had not arrived yet.
  function presetAssetUrl(name) {
    if (!name) return '';
    if (presetImageUris.has(name)) return presetImageUris.get(name);
    const font = presetFonts.find((entry) => entry.name === name);
    const image = presetImages.find((entry) => entry.name === name);
    const source = font || image;
    const uri = source ? fileAsDataUri(source.file, font ? presetSchema.fontMime(name) : presetSchema.imageMime(name)) : '';
    if (uri) presetImageUris.set(name, uri);
    return uri;
  }

  // While editing, a word with nothing to say in the state on show is named as its Insert button is.
  const tokenNames = () => Object.fromEntries(presetSchema.CANVAS_TOKENS.map((token) => [token, $(`#pd-cv-text [data-cv="token.${token}"]`).text()]));

  // The generated stylesheet as the PREVIEW needs it. The only difference from what is written to
  // disk is how a preset's own picture is addressed; every other value is identical.
  const previewCss = (values, editing = editingLayout()) =>
    presetGenerator.buildCustomPresetCss(values, { assetUrl: presetAssetUrl, editing, entrances: !editing || previewMotion, tokenNames: tokenNames() });

  /*
    Customising a bundled preset. `layerMode` holds the base (its own stylesheet, with relative
    urls pointed at its folder, and its window size) while a layer is being edited; the preview then
    wears that stylesheet followed by the layer's, exactly the order the popup uses.
  */
  let layerMode = null;
  const layerSections = new Set();

  const layerStylesheet = (values, editing = editingLayout(), entrances = !editing || previewMotion) =>
    layerMode.css +
    '\n' +
    presetLayerTool.buildLayerCss(
      { base: layerMode.base, sections: [...layerSections], options: values },
      { assetUrl: presetAssetUrl, markPseudo: layerMode.markPseudo, textVar: layerMode.textVar, editing, entrances, tokenNames: tokenNames() }
    );

  const stylesheetFor = (values, editing = editingLayout()) => (layerMode ? layerStylesheet(values, editing) : previewCss(values, editing));
  /*
    A preset the controls cannot rebuild (an imported SAN theme or .awpreset) is shown as a picture
    the main process renders offscreen, or the stage would keep showing the previous draft. Cleared
    as soon as a control is touched, since that starts a design of the user's own.
  */
  let presetSnapshot = null;
  async function showPresetSnapshot(name) {
    presetSnapshot = null;
    const payload = { ...snapshotPayload(previewPayload()), bare: true };
    const shot = await ipcRenderer.invoke('preset-snapshot', { preset: name, payload }).catch((err) => {
      debug.log(err);
      return null;
    });
    if (!shot || String($('#pd-load').val() || '') !== name) return;
    presetSnapshot = { name, ...shot };
    renderPreviewDocument(readPresetOptions());
    if (previewView === 'compare') renderComparePreviews(readPresetOptions());
  }
  function snapshotDocument({ image, width, height }) {
    return `<!doctype html><html><body style="margin:0;background:transparent"><img alt="" src="${image}" style="display:block;width:${width}px;height:${height}px"></body></html>`;
  }

  /*
    An imported SAN theme runs live: its own page (sanEngine.previewPage) in the preview frame,
    drawn by its own engine with the designer's sample unlock. The card is held where it has come
    in, plays through on Play, and is redrawn in place when a setting changes. `sanLive` holds the
    page, the window it is drawn in, the theme it draws and the payload of each state.
  */
  const sanLivePreview = require(path.join(appPath, 'ui/sanLivePreview.js'));
  const sanEngineCore = require(path.join(appPath, 'util/sanEngine/engine.js'));
  const sanEngineFiles = require(path.join(appPath, 'util/sanEngine/index.js'));
  const sanThemeSchema = require(path.join(appPath, 'util/sanTheme.js'));
  const SAN_LIVE_STATES = ['normal', 'bronze', 'silver', 'gold', 'completion', 'progress'];
  let sanLive = null;
  let sanLivePages = 0;
  // The payload each drawn card was given, for the words of the items drawn over it.
  const sanDrawnPayload = new WeakMap();

  // Worded and graded by the main process, as a popup's payload is.
  async function sanLivePayloads() {
    const position = String($('#option_overlayPosition').val() || 'center-bottom');
    const payloads = await Promise.all(
      SAN_LIVE_STATES.map((state) => ipcRenderer.invoke('preset-page-payload', { ...snapshotPayload(previewPayload(state)), bare: true, position }))
    );
    return Object.fromEntries(SAN_LIVE_STATES.map((state, index) => [state, payloads[index]]));
  }

  // Opens a SAN preset's live page. False when it cannot be shown, and a picture should stand in.
  async function showSanLive(name) {
    let page = null;
    let payloads = null;
    try {
      [page, payloads] = await Promise.all([ipcRenderer.invoke('san-preset-page', name), sanLivePayloads()]);
    } catch (err) {
      debug.log(err);
    }
    if (String($('#pd-load').val() || '') !== name) return true;
    if (!page || !payloads) {
      sanLive = null;
      return false;
    }
    presetSnapshot = null;
    sanLive = { name, html: page.html, width: page.width, height: page.height, theme: page.theme, payloads, key: String(++sanLivePages) };
    renderPreviewDocument(readPresetOptions());
    if (previewView === 'compare') renderComparePreviews(readPresetOptions());
    return true;
  }

  async function refreshSanLivePayloads() {
    const live = sanLive;
    if (!live) return;
    const payloads = await sanLivePayloads().catch((err) => {
      debug.log(err);
      return null;
    });
    if (!payloads || sanLive !== live) return;
    live.payloads = payloads;
    replayPreview();
  }

  // Draws one state in a frame, first loading the live page into it when it holds another one.
  function showSanLiveIn(frame, state = previewState, { hold = true } = {}) {
    if (!sanLive || !frame) return;
    frame.awSanWanted = { state, hold };
    let ready = false;
    try {
      ready = frame.dataset.sanPage === sanLive.key && frame.contentDocument.readyState === 'complete' && typeof frame.contentWindow.awPreviewShow === 'function';
    } catch {
      ready = false;
    }
    if (ready) return void drawSanLive(frame, state, { hold });
    if (frame.dataset.sanPage === sanLive.key) return;
    frame.dataset.sanPage = sanLive.key;
    frame.onload = () => {
      const wanted = frame.awSanWanted || { state: previewState, hold: true };
      void drawSanLive(frame, wanted.state, { hold: wanted.hold });
    };
    frame.srcdoc = sanLive.html;
  }

  function drawSanLive(frame, state, { hold = true } = {}) {
    const live = sanLive;
    if (!live) return Promise.resolve(false);
    if (frame.id === 'pd-frame') markPlaying(!hold);
    const payload = live.payloads[state] || live.payloads.normal;
    return sanLivePreview.draw(frame, {
      theme: live.theme,
      payload,
      hold,
      // Back to holding the card once it has played out.
      onEnded: () => {
        if (sanLive === live) showSanLiveIn(frame, frame.id === 'pd-frame' ? previewState : state);
      },
      onDrawn: (doc) => dressSanCard(frame, doc, payload, { playing: !hold }),
    });
  }

  // The designer's own items over a drawn SAN card: the classes they are shown by, their
  // stylesheet, and their markup once the preset's own items are in the canvas field.
  function dressSanCard(frame, doc, payload, { playing = false } = {}) {
    const card = doc.getElementById('outerwrapper');
    if (!card) return;
    sanDrawnPayload.set(doc, payload);
    card.classList.add('ach', ...sanStateClasses(payload));
    if (playing) card.classList.add('active');
    const style = doc.getElementById(sanEngineFiles.PREVIEW_STYLE_ID);
    if (style) style.textContent = sanItemsStyle(doc, readPresetOptions(), { playing });
    syncCanvasMarkup(doc);
    if (frame.id === 'pd-frame' && canvasEditor) canvasEditor.refresh();
  }

  // The state's scale zooms the whole page; the items take it back, as host.js does in the popup.
  function sanItemsStyle(doc, values, { playing = false } = {}) {
    const css = presetGenerator.canvasCss(values.canvas, { assetUrl: presetAssetUrl, editing: !playing, entrances: playing, tokenNames: tokenNames() });
    const zoom = parseFloat(doc.body && doc.body.style.zoom) || 1;
    return zoom === 1 ? css : `${css}\n.ach > .${presetGenerator.CANVAS_CLASS} { zoom: ${1 / zoom}; }`;
  }

  // A setting shown before it is saved: the page draws the theme it is handed each time.
  let sanRedrawTimer = null;
  function previewSanLook(type, changes) {
    if (!sanLive || !sanLive.theme.types[type]) return;
    const clean = sanThemeSchema.cleanCustomisation(changes).customisation;
    const types = sanLive.theme.types;
    const perTier = sanEngineFiles.drawsPerTier(sanLive.theme);
    sanLive.theme = { ...sanLive.theme, types: { ...types, [type]: { ...types[type], ...clean } } };
    Object.assign(sanLive, sanEngineFiles.windowSize(sanLive.theme));
    // Another base card needs its own markup and stylesheet: the page is rebuilt once it is saved.
    if (Object.prototype.hasOwnProperty.call(changes, 'preset')) return;
    if (perTier !== sanEngineFiles.drawsPerTier(sanLive.theme)) renderSanLook();
    if (sanRedrawTimer) return;
    sanRedrawTimer = setTimeout(() => {
      sanRedrawTimer = null;
      layoutPreview();
      replayPreview();
    }, 40);
  }

  /*
    An imported SAN card takes items on top: its picture (taken without them), and over it an empty
    box where the card is, which the layout editor measures and draws the items in, as host.js
    draws them in the popup. The box carries the state classes the items are shown by.
  */
  const sanItemsMode = () => $('#options-notify-designer').hasClass('is-san') && Boolean(sanLive || (presetSnapshot && presetSnapshot.card));
  const sanItemsCss = (values) => presetGenerator.canvasCss(values.canvas, { assetUrl: presetAssetUrl, editing: true, entrances: false, tokenNames: tokenNames() });
  function sanStateClasses(payload) {
    if (payload.isPlatinum) return ['state-platinum'];
    return ['bronze', 'silver', 'gold'].includes(payload.rarityTier) ? ['state-rare', `tier-${payload.rarityTier}`] : [];
  }
  function sanItemsDocument({ image, width, height, card }, values) {
    const classes = ['ach', ...sanStateClasses(previewPayload())].join(' ');
    // The card's own family, which items "in the card's font" inherit; the picture has no fonts loaded.
    const font = String(card.font || '')
      .replace(/"/g, "'")
      .replace(/[^\w\s,'-]/g, '');
    const box = `left:${card.x}px;top:${card.y}px;width:${card.width}px;height:${card.height}px;font-family:${font ? `${font}, ` : ''}sans-serif`;
    return (
      `<!doctype html><html><head><style id="aw-preview-css">${sanItemsCss(values)}</style></head>` +
      `<body style="margin:0;background:transparent;position:relative"><img alt="" src="${image}" style="display:block;width:${width}px;height:${height}px">` +
      `<div class="${classes}" style="position:absolute;${box}"></div></body></html>`
    );
  }
  // The words of the card's own payload, since a SAN card has no text slots the items could copy.
  function fillSanTokens(doc) {
    const payload = sanDrawnPayload.get(doc) || previewPayload();
    const percent = Number(payload.rarityPercent);
    const words = {
      game: payload.gameName || '',
      title: payload.displayName || '',
      detail: payload.description || '',
      rarity: Number.isFinite(percent) && payload.rarityPercent != null ? `${Math.round(percent * 10) / 10}%` : '',
    };
    for (const span of doc.querySelectorAll('.ach > .aw-canvas [data-tok]')) {
      if (Object.prototype.hasOwnProperty.call(words, span.dataset.tok)) span.textContent = words[span.dataset.tok];
    }
  }

  // Every preset as a picture of its card, opened from the preset row of the Notifications tab and
  // from the designer's own menu. A plain unlock, so the pictures compare like for like.
  const presetGallery = require(path.join(appPath, 'ui/presetGallery.js')).createPresetGallery({
    label: (key) => $(`#pd-gallery-text [data-pg="${key}"]`).text() || key,
    snapshot: (name, state) => {
      const payload = snapshotPayload(previewPayload(state));
      const art = galleryArtFile();
      if (payload.imagePath) payload.imagePath = art;
      if (payload.gameIconPath) payload.gameIconPath = art;
      return ipcRenderer.invoke('preset-snapshot', { preset: name, payload, cached: true });
    },
    // Every state the designer's preview has, named as it names them.
    states: () =>
      ['normal', 'bronze', 'silver', 'gold', 'completion', 'progress'].map((key) => ({ key, label: $(`#pd-state button[data-state="${key}"]`).text().trim() || key })),
  });
  // Opening Settings draws the pictures not kept yet, one at a time, before the gallery is opened.
  // Asked for, not read from the menu: on the first opening the menu is still being filled.
  $('title-bar').one('open-settings', async () => {
    const names = await ipcRenderer.invoke('list-presets').catch(() => []);
    presetGallery.warm(Array.isArray(names) ? names : []);
  });
  const galleryTitle = (key) => $(`#pd-gallery-text [data-pg="${key}"]`).text();
  // Every menu that picks a preset opens the gallery instead of a list of names. The user's own
  // come first, as in the designer.
  const mineThenBundled = (names) => {
    const mine = new Set(generatedPresets.map((preset) => preset.name));
    return [
      { title: galleryTitle('mine'), names: names.filter((name) => mine.has(name)) },
      { title: galleryTitle('bundled'), names: names.filter((name) => !mine.has(name)) },
    ];
  };
  [
    '#option_overlayPreset',
    '#option_overlayPresetXenia',
    '#option_overlayPresetRpcs3',
    '#option_overlayPresetShadps4',
    '#option_overlayPresetKytyps5',
    '#game-notification-preset',
    '#onboard-notification-preset',
  ].forEach((selector) => presetGallery.attach(document.querySelector(selector), { groups: mineThenBundled }));
  // Every preset the designer can open: the user's own to edit, the bundled ones to customize, and
  // those that can only be used as they are, shown but not picked. Picking one goes through the
  // menu that would have opened it, so both ways behave alike. Opened from one of the two menus,
  // its empty choice ("New preset", "None") is offered too.
  let layerBaseNames = [];
  let fixedPresetNames = [];
  function openDesignerGallery(opener, from = null) {
    const mine = generatedPresets.map((preset) => preset.name);
    const empty = from ? [...from.options].find((option) => !option.value) : null;
    presetGallery.show({
      groups: [
        { title: galleryTitle('mine'), names: mine },
        { title: galleryTitle('bundled'), names: layerBaseNames.filter((name) => !mine.includes(name)) },
        { title: galleryTitle('fixed'), names: fixedPresetNames, note: fixedPresetsText(fixedPresetNames), disabled: true },
      ],
      choices: empty && empty.textContent ? [{ name: '', label: empty.textContent }] : [],
      current: from ? from.value : String($('#pd-load').val() || (layerMode ? layerMode.base : '')),
      onPick: (name) => {
        let target = $(from);
        if (name) target = mine.includes(name) ? $('#pd-load') : $('#pd-layer-base');
        if (String(target.val() || '') !== name) target.val(name).trigger('change');
      },
      opener,
    });
  }
  $('#pd-browse, #pd-open-preset').on('click', function () {
    openDesignerGallery(this);
  });
  ['#pd-load', '#pd-layer-base'].forEach((selector) =>
    presetGallery.attach(document.querySelector(selector), { showOwn: (select) => openDesignerGallery(select, select) })
  );

  const previewBox = (values, editing = editingLayout()) =>
    sanLive
      ? { width: sanLive.width, height: sanLive.height }
      : presetSnapshot
        ? { width: presetSnapshot.width, height: presetSnapshot.height }
        : layerMode
        ? { width: layerMode.width, height: layerMode.height }
        : presetGenerator.presetBoxSize(values, { editing });

  // The bundled card as the preview lays it out, which the popup needs to fit items reaching past it.
  function layerCardSize() {
    try {
      const card = document.getElementById('pd-frame').contentDocument.querySelector('.ach');
      return card && card.offsetWidth ? { width: card.offsetWidth, height: card.offsetHeight } : null;
    } catch {
      return null;
    }
  }

  // The logo is one extra element inside the card; the preview document is built without it.
  function syncLayerLogo(doc) {
    try {
      const card = doc && doc.querySelector('.ach');
      if (!card) return;
      const existing = card.querySelector('.' + presetLayerTool.LAYER_LOGO_CLASS);
      const wanted = layerMode && presetLayerTool.layerHasLogo({ base: layerMode.base, sections: [...layerSections], options: readPresetOptions() });
      if (wanted && !existing) {
        const logo = doc.createElement('div');
        logo.className = presetLayerTool.LAYER_LOGO_CLASS;
        card.insertBefore(logo, card.firstChild);
      } else if (!wanted && existing) {
        existing.remove();
      }
    } catch (e) {
      debug.log(e);
    }
  }

  // The added items are markup inside the card, so a stylesheet swap alone cannot add or remove
  // one. Over a bundled preset they exist only while the layout section is ticked.
  function syncCanvasMarkup(doc) {
    try {
      const card = doc && doc.querySelector('.ach');
      if (!card) return;
      // A SAN card waits for its own items: until they are in the field it holds the draft's.
      const sanPending = sanLive && !(sanItems && sanItems.name === sanLive.name);
      const wanted = sanPending || (layerMode && !layerSections.has('canvas')) ? '' : presetGenerator.canvasMarkup(readPresetOptions().canvas);
      const existing = card.querySelector(':scope > .' + presetGenerator.CANVAS_CLASS);
      if (canvasMarkupOf(existing) === wanted) return;
      if (existing) existing.remove();
      if (!wanted) return;
      card.insertAdjacentHTML('afterbegin', wanted);
      if (presetSnapshot || sanLive) fillSanTokens(doc);
      else fillCanvasTokens(doc, card.querySelector(':scope > .' + presetGenerator.CANVAS_CLASS));
    } catch (e) {
      debug.log(e);
    }
  }

  // The markup as generated: the engine has since written the popup's words into the token spans.
  function canvasMarkupOf(node) {
    if (!node) return '';
    const bare = node.cloneNode(true);
    for (const span of bare.querySelectorAll('[data-tok]')) span.textContent = '';
    return bare.outerHTML;
  }

  // New markup between two payloads gets the words the engine already put on the card ({tier} is CSS).
  const TOKEN_SOURCES = { game: '.game', title: '.title', detail: '.detail', rarity: '.rarity' };
  function fillCanvasTokens(doc, layer) {
    // Today's engine fills them itself, with the popup's own words; a bundled preset's has no tokens.
    if (doc.defaultView.awWords) return void doc.defaultView.awWords();
    for (const span of layer.querySelectorAll('[data-tok]')) {
      const source = TOKEN_SOURCES[span.dataset.tok] && doc.querySelector(TOKEN_SOURCES[span.dataset.tok]);
      if (source) span.textContent = source.textContent;
    }
  }

  const previewFrame = () => ensureFrame(document.getElementById('pd-frame-wrap'), { id: 'pd-frame', title: t('pd-preview-title', 'Notification preview', 'Aperçu de la notification') });

  // While Play or the timeline runs, the layout editor's frames stand aside: borders over a card on
  // the move. Unseen, they still pick what is under the pointer.
  function markPlaying(on) {
    const stage = document.getElementById('pd-stage');
    if (stage) stage.classList.toggle('is-playing', on);
  }

  // Only needed when the frame must be re-created (play-through, first render); editing a
  // property swaps the stylesheet inside the existing document instead, to keep slider drags cheap.
  function renderPreviewDocument(values, { hold = true } = {}) {
    const frame = previewFrame();
    if (!frame) return;
    markPlaying(!hold || previewMotion);
    if (sanLive) {
      showSanLiveIn(frame, previewState, { hold });
      layoutPreview(values);
      return;
    }
    if (presetSnapshot) {
      frame.onload = null;
      if (sanItemsMode()) {
        frame.srcdoc = sanItemsDocument(presetSnapshot, values);
        frame.onload = () => {
          syncCanvasMarkup(frame.contentDocument);
          if (canvasEditor) canvasEditor.refresh();
        };
      } else frame.srcdoc = snapshotDocument(presetSnapshot);
      layoutPreview(values);
      return;
    }
    // A play-through shows the items' entrances even in the layout editor, which leaves them out.
    const editing = editingLayout();
    const entrances = !hold || !editing || previewMotion;
    frame.srcdoc = presetGenerator.buildPresetPreviewHtml(values, {
      hold,
      assetUrl: presetAssetUrl,
      css: layerMode ? layerStylesheet(values, editing, entrances) : undefined,
      editing,
      entrances,
    });
    frame.onload = () => {
      try {
        syncLayerLogo(frame.contentDocument);
        syncCanvasMarkup(frame.contentDocument);
        frame.contentWindow.awPreviewApply(previewPayload());
      } catch (e) {
        debug.log(e);
      }
      if (canvasEditor) canvasEditor.refresh();
    };
    layoutPreview(values);
  }

  // Swap only the generated stylesheet in the live document. No reload, no animation restart.
  function updatePreviewStyles(values) {
    const frame = previewFrame();
    let styleEl = null;
    try {
      styleEl = frame && frame.contentDocument && frame.contentDocument.getElementById('aw-preview-css');
    } catch (e) {
      styleEl = null;
    }
    if (!styleEl) {
      renderPreviewDocument(values);
      return;
    }
    styleEl.textContent = sanLive ? sanItemsStyle(frame.contentDocument, values) : presetSnapshot ? sanItemsCss(values) : stylesheetFor(values);
    syncLayerLogo(frame.contentDocument);
    syncCanvasMarkup(frame.contentDocument);
    // A line's own words may have changed; what a see-through shape cuts may have moved. A bundled
    // preset's own engine has neither.
    if (frame.contentWindow.awWords) frame.contentWindow.awWords();
    if (frame.contentWindow.awCutHoles) frame.contentWindow.awCutHoles();
    if (previewView === 'compare') renderComparePreviews(values);
    layoutPreview(values);
  }

  // Re-feed the sample payload so the state classes and the entry animation are applied again.
  function replayPreview() {
    if (sanLive) {
      if (previewView === 'compare') renderComparePreviews(readPresetOptions());
      else showSanLiveIn(previewFrame());
      return;
    }
    if (presetSnapshot) return void showPresetSnapshot(presetSnapshot.name);
    const frame = previewFrame();
    try {
      if (frame && frame.contentWindow && frame.contentWindow.awPreviewApply) {
        frame.contentWindow.awPreviewApply(previewPayload());
        return;
      }
    } catch (e) {
      debug.log(e);
    }
    renderPreviewDocument(readPresetOptions());
  }

  // The stage has no width until the tab is laid out, so a popup scaled to a zero-width stage
  // would render as nothing; fall back to a sensible width until the layout observer re-runs.
  function measuredStageWidth() {
    // Clear a width Screen view may have narrowed, or each pass would measure the previous
    // layout's shrunk width and shrink it further.
    const node = document.querySelector('#options-notify-designer .pd-stage');
    if (node) node.style.width = '';
    const measured = $('#options-notify-designer .pd-stage').width();
    return measured > 80 ? measured - 28 : 360;
  }

  // The stage has a height ceiling too; read it from the stylesheet, not the box, since the box
  // is about to be resized to what this decides.
  const STAGE_PADDING = 12; // .pd-stage padding, both sides

  function stageCeiling(padding = STAGE_PADDING) {
    const node = document.querySelector('#options-notify-designer .pd-stage');
    if (!node) return 170;
    // Full screen gives the stage its grid cell: the ceiling is that cell, once a height left by
    // the tab layout is cleared, less a padding read rather than assumed (it keeps the timeline's room).
    if (editingLayout()) {
      node.style.height = '';
      const style = getComputedStyle(node);
      return Math.max(60, node.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0));
    }
    const cap = parseFloat(getComputedStyle(node).maxHeight);
    return Number.isFinite(cap) && cap > 60 ? cap - padding * 2 : 170;
  }

  // Fits the stage to what the popup needs at the zoom that fits, not a flat share of the panel.
  function fitStageTo(contentHeight, padding = STAGE_PADDING) {
    const node = document.querySelector('#options-notify-designer .pd-stage');
    if (!node) return;
    if (editingLayout()) return void (node.style.height = '');
    const style = getComputedStyle(node);
    const floor = parseFloat(style.minHeight) || 96;
    const cap = parseFloat(style.maxHeight) || 300;
    const wanted = Math.ceil(contentHeight) + padding * 2;
    node.style.height = Math.round(Math.max(floor, Math.min(cap, wanted))) + 'px';
  }

  function layoutPreview(values) {
    const frame = previewFrame();
    const wrap = document.getElementById('pd-frame-wrap');
    const screen = document.getElementById('pd-screen');
    if (!frame || !wrap || !screen) return;
    const box = previewBox(values || readPresetOptions());
    frame.width = box.width;
    frame.height = box.height;
    frame.style.width = box.width + 'px';
    frame.style.height = box.height + 'px';

    const stageWidth = measuredStageWidth();
    let zoom;
    if (previewView === 'compare') {
      // The compare rows own the stage; the single card is hidden by the stylesheet.
      screen.classList.remove('is-screen');
      screen.style.width = '';
      screen.style.aspectRatio = '';
      $('#pd-placement').prop('hidden', true);
      $('#pd-zoom').prop('hidden', true);
      $('#pd-size-note').text(`${box.width}×${box.height}`);
      if (canvasEditor) canvasEditor.refresh();
      return;
    }
    if (previewView === 'screen') {
      screen.classList.add('is-screen');
      // This screen, in the popup's own pixels: Windows scales both alike, so the card keeps its
      // size on it whatever the resolution. Full screen gives it the whole stage; the normal view
      // draws it at its own proportions, fitting the shorter side so no anchor is clipped.
      const display = { width: window.screen.width || 1920, height: window.screen.height || 1080 };
      let displayWidth;
      if (editingLayout()) {
        screen.style.width = '';
        screen.style.aspectRatio = '';
        displayWidth = screen.clientWidth || stageWidth;
      } else {
        const ratio = display.width / display.height;
        displayWidth = Math.max(120, Math.min(stageWidth, Math.floor(stageCeiling(0) * ratio)));
        screen.style.width = displayWidth + 'px';
        screen.style.aspectRatio = `${display.width} / ${display.height}`;
        const stageNode = document.querySelector('#options-notify-designer .pd-stage');
        if (stageNode) stageNode.style.width = displayWidth + 'px';
        fitStageTo(displayWidth / ratio, 0);
      }
      const userScale = parseFloat($('#option_overlayScale').val()) || 1;
      zoom = (displayWidth / display.width) * userScale;
    } else {
      screen.classList.remove('is-screen');
      screen.style.width = '';
      screen.style.aspectRatio = '';
      // Never larger than life, and never taller than the stage will let it be. The full-screen
      // layout editor is the exception: precise handles need the card bigger than it ships.
      const zoomCap = editingLayout() ? CANVAS_FULL_ZOOM : 1;
      const dragging = canvasEditor && canvasEditor.isDragging();
      const fit = dragging && heldFit ? heldFit : Math.min(zoomCap, stageWidth / box.width, stageCeiling() / box.height);
      heldFit = fit;
      // The stage keeps the height of the fitted card; a closer look scrolls inside it.
      fitStageTo(box.height * fit);
      zoom = fit * stageZoom;
    }
    $('#pd-zoom').prop('hidden', previewView !== 'card' || !editingLayout());
    // The layout is edited on the single card, so the way in is offered there only.
    $('#pd-cv-full').prop('hidden', previewView !== 'card' || (Boolean(presetSnapshot) && !$('#options-notify-designer').hasClass('is-san')));
    $('#pd-zoom-fit').text(`${Math.round(zoom * 100)}%`);
    $('#pd-stage').toggleClass('is-zoomed', previewView === 'card' && stageZoom > 1);
    frame.style.transform = `scale(${zoom})`;
    wrap.style.width = Math.round(box.width * zoom) + 'px';
    wrap.style.height = Math.round(box.height * zoom) + 'px';
    // Where the popup lands and how big it is only change the picture in the Screen view; the card
    // view draws it alone at whatever zoom fits the stage.
    $('#pd-placement').prop('hidden', previewView !== 'screen');
    if (previewView === 'screen') placePreviewInScreen(wrap, screen, zoom);
    else {
      wrap.style.left = '';
      wrap.style.top = '';
    }
    // Shows the popup's real size; the card view has its own zoom readout beside it. The Screen view
    // speaks the Scale picked beside it (the size on screen at that scale), not the mock screen's
    // shrink factor. A custom position is drawn at bottom-centre with a label, never guessed.
    const custom = previewView === 'screen' && String($('#option_overlayPosition').val()) === 'custom';
    const customLabel = custom ? ` · ${$("#option_overlayPosition option[value='custom']").text()}` : '';
    const shownScale = parseFloat($('#option_overlayScale').val()) || 1;
    const size =
      previewView === 'screen'
        ? `${Math.round(box.width * shownScale)}×${Math.round(box.height * shownScale)} · ${Math.round(shownScale * 100)}%`
        : `${box.width}×${box.height}`;
    $('#pd-size-note').text(`${size}${customLabel}`);
    if (canvasEditor) canvasEditor.refresh();
  }

  /*
    The user's magnification on top of the fit, card view only. Buttons step through round values;
    Ctrl+wheel moves freely and keeps the point under the pointer where it was.
  */
  const STAGE_ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
  const STAGE_ZOOM_WHEEL = 1.15;
  function zoomStage(next, anchor) {
    const stage = document.getElementById('pd-stage');
    const before = stageZoom;
    stageZoom = Math.min(STAGE_ZOOM_STEPS.at(-1), Math.max(STAGE_ZOOM_STEPS[0], next));
    if (Math.abs(stageZoom - 1) < 0.04) stageZoom = 1;
    if (!stage || stageZoom === before) return;
    const rect = stage.getBoundingClientRect();
    const px = anchor ? anchor.clientX - rect.left : stage.clientWidth / 2;
    const py = anchor ? anchor.clientY - rect.top : stage.clientHeight / 2;
    const scroll = { x: stage.scrollLeft, y: stage.scrollTop };
    layoutPreview();
    const ratio = stageZoom / before;
    stage.scrollLeft = (scroll.x + px) * ratio - px;
    stage.scrollTop = (scroll.y + py) * ratio - py;
  }
  $('#pd-zoom-in').on('click', () => zoomStage(STAGE_ZOOM_STEPS.find((step) => step > stageZoom + 0.01) || stageZoom));
  $('#pd-zoom-out').on('click', () => zoomStage(STAGE_ZOOM_STEPS.findLast((step) => step < stageZoom - 0.01) || stageZoom));
  $('#pd-zoom-fit').on('click', () => zoomStage(1));
  document.getElementById('pd-stage').addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey || previewView !== 'card') return;
      event.preventDefault();
      zoomStage(stageZoom * (event.deltaY < 0 ? STAGE_ZOOM_WHEEL : 1 / STAGE_ZOOM_WHEEL), event);
    },
    { passive: false }
  );

  // Mirror of util/notificationBounds.placeNotification for the mock screen. Its 2px edge margin is
  // below one preview pixel at these scales, so the anchors are exact without repeating it.
  // As the real popup lands: its window hangs past the anchored edge by the card's transparent
  // room, so the card itself touches the edge (notificationInsets.edgeShift, as init.js does).
  function placePreviewInScreen(wrap, screen, zoom) {
    const position = String($('#option_overlayPosition').val() || 'center-bottom');
    const free = { x: Math.max(0, screen.clientWidth - wrap.offsetWidth), y: Math.max(0, screen.clientHeight - wrap.offsetHeight) };
    const horizontal = position.includes('left') ? 0 : position.includes('right') ? free.x : free.x / 2;
    const vertical = position.includes('top') ? 0 : position.includes('middle') ? free.y / 2 : free.y;
    const { dx, dy } = notificationInsets.edgeShift(position, previewCardRoom(), zoom);
    wrap.style.left = Math.round(horizontal + dx) + 'px';
    wrap.style.top = Math.round(vertical + dy) + 'px';
  }

  // The room between the preview page's edges and its card, in the page's pixels. A card still
  // coming in is taken where it rests: centred, as the preview pages draw it.
  function previewCardRoom() {
    try {
      const doc = previewFrame().contentDocument;
      const card = doc && doc.querySelector('.ach');
      if (!card || !card.offsetWidth) return null;
      const page = doc.documentElement;
      if (card.getAnimations().some((animation) => animation.playState === 'running')) {
        const x = (page.clientWidth - card.offsetWidth) / 2;
        const y = (page.clientHeight - card.offsetHeight) / 2;
        return { left: x, right: x, top: y, bottom: y };
      }
      const box = card.getBoundingClientRect();
      return { left: box.left, top: box.top, right: page.clientWidth - box.right, bottom: page.clientHeight - box.bottom };
    } catch {
      return null;
    }
  }

  // Repaints on the next frame rather than every input event: a dragged slider fires continuously.
  let previewPending = null;
  function schedulePreview() {
    if (previewPending) return;
    previewPending = setTimeout(() => {
      previewPending = null;
      updatePreviewStyles(refreshPresetControls());
      // Changing a mode can bring a control back (the icon radius returns with the rounded shape),
      // and a control that reappears while the panel is filtered has to be filtered too.
      if (String($('#pd-search').val() || '')) filterDesigner($('#pd-search').val());
    }, 40);
  }

  // A label forwards a click anywhere on its row to its control, which for a colour means a picker
  // opening from empty space beside the swatch. Only the swatch itself opens it.
  document.getElementById('options-notify-designer').addEventListener(
    'click',
    (event) => {
      const row = event.target.closest('label');
      if (row && event.target.tagName !== 'INPUT' && row.querySelector('input[type="color"]')) event.preventDefault();
    },
    true
  );

  $('#options-notify-designer').on('input change', 'input, select', function (event) {
    if (this.id === 'pd-load' || this.id === 'pd-name' || this.id === 'pd-search') return;
    // The SAN panels save into the imported preset itself; it is not a draft of the user's own.
    if ($(this).closest('#pd-san, #pd-san-look').length) return;
    // Over a SAN card only the items change, each committed edit saved into the preset.
    if ($('#options-notify-designer').hasClass('is-san')) {
      if (this.id === 'pd-canvas' && event.type === 'change') {
        updatePreviewStyles(readPresetOptions());
        saveSanCanvasSoon();
        recordPresetHistory();
      }
      return;
    }
    if (presetSnapshot || sanLive) {
      presetSnapshot = null;
      sanLive = null;
      renderPreviewDocument(readPresetOptions());
    }
    schedulePreview();
    recordPresetHistory();
  });
  // The main process copies the picture into the shared folder and hands back the name it ended
  // up under, which is what the preset stores.
  $('#btn-import-preset-image').click(async function (event) {
    event.preventDefault();
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      const name = await ipcRenderer.invoke('import-preset-image');
      if (name) {
        presetImageUris.delete(name);
        await refreshPresetImages(name);
        // Picking a picture without switching to the mode that draws it would do nothing visible.
        if ($('#pd-bgMode').val() !== 'image') $('#pd-bgMode').val('image');
        updatePreviewStyles(refreshPresetControls());
        replayPreview();
      }
    } catch (err) {
      debug.log(err);
    }
    self.css('pointer-events', 'initial');
  });

  // A font or a logo: the main process checks what the file really is before it keeps a copy, and
  // says why when it refuses.
  function refusalText(kind) {
    if (kind === 'font') {
      return t(
        'preset-font-refused',
        'That file is not a usable font. Use a TTF, OTF, WOFF or WOFF2 file of 4 MB at most.',
        'Ce fichier n’est pas une police utilisable. Utilise un fichier TTF, OTF, WOFF ou WOFF2 de 4 Mo au plus.'
      );
    }
    return t(
      'preset-logo-refused',
      'That file is not a usable logo. Use a PNG, JPEG, GIF, WebP or BMP picture of 2 MB at most.',
      'Ce fichier n’est pas un logo utilisable. Utilise une image PNG, JPEG, GIF, WebP ou BMP de 2 Mo au plus.'
    );
  }

  $('#btn-import-preset-font').click(async function (event) {
    event.preventDefault();
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      const res = await ipcRenderer.invoke('import-preset-font');
      if (res && res.ok) {
        await refreshPresetFonts(res.name);
        updatePreviewStyles(refreshPresetControls());
        replayPreview();
        setPresetStatus('');
      } else if (res && !res.canceled) {
        setPresetStatus(refusalText('font'), 'error');
      }
    } catch (err) {
      debug.log(err);
    }
    self.css('pointer-events', 'initial');
  });

  $('#btn-import-preset-logo').click(async function (event) {
    event.preventDefault();
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      const res = await ipcRenderer.invoke('import-preset-logo');
      if (res && res.ok) {
        await refreshPresetImages(null, res.name);
        updatePreviewStyles(refreshPresetControls());
        replayPreview();
        setPresetStatus('');
      } else if (res && !res.canceled) {
        setPresetStatus(refusalText('logo'), 'error');
      }
    } catch (err) {
      debug.log(err);
    }
    self.css('pointer-events', 'initial');
  });

  // The one property the card cannot show: play it when chosen, like the Notifications tab does.
  $('#pd-sound').on('change', function () {
    const chosen = String($(this).val() || '');
    if (chosen) previewSoundAtVolume(chosen);
  });

  // Filters by hiding, never moving a control (same rule as Settings search, for the same
  // positional-i18n reason); the filter logic itself lives in util/presetPanel.js.
  function filterDesigner(query) {
    const result = presetPanel.filterFields($, '#options-notify-designer', query);
    $('#pd-no-match').prop('hidden', !result.filtering || result.total > 0);
    return result.total;
  }

  $('#pd-search').on('input', function () {
    filterDesigner($(this).val());
  });
  // Escape clears the filter rather than leaving the panel half hidden with an empty-looking box.
  $('#pd-search').on('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (!String($(this).val() || '')) return;
    event.stopPropagation();
    $(this).val('');
    filterDesigner('');
  });

  // The undo stack itself is in util/presetPanel.js; here decides what counts as a state, when
  // one settles, and how one is restored.
  const presetHistory = presetPanel.createHistory(80);
  // Counts the user's edits, so a late async fill can tell whether anyone touched the design.
  let designEdits = 0;
  let historyTimer = null;
  let historyRestoring = false;
  // Over an imported SAN card two histories run: its items (this one) and its look (the theme
  // panel's own). Which one each step went to is kept, so undo takes them back in the order made.
  let sanSteps = [];
  let sanRedo = [];
  let sanLookHistory = () => null;
  function noteSanStep(kind) {
    sanSteps.push(kind);
    sanRedo = [];
  }

  function updateHistoryButtons() {
    const look = sanLookHistory();
    // Over a SAN card the order log knows both histories: a look change clears the items' redo too.
    const canUndo = look ? sanSteps.length > 0 || look.canUndo() : presetHistory.canUndo();
    const canRedo = look ? sanRedo.length > 0 : presetHistory.canRedo();
    $('#btn-preset-undo, #pd-cv-undo').prop('disabled', !canUndo);
    $('#btn-preset-redo, #pd-cv-redo').prop('disabled', !canRedo);
  }

  // Dragging a slider is one gesture, not one step per pixel, so a state settles before it counts.
  function recordPresetHistory() {
    designEdits += 1;
    if (historyRestoring) return;
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      historyTimer = null;
      if (!presetHistory.record(JSON.stringify(readPresetOptions()))) return;
      if (sanLookHistory()) noteSanStep('items');
      updateHistoryButtons();
    }, 400);
  }

  // Starting again from a saved preset, a template or a reset is a new history, not a step in the
  // old one: undoing across a load would silently mix two designs.
  function resetPresetHistory() {
    clearTimeout(historyTimer);
    historyTimer = null;
    sanSteps = [];
    sanRedo = [];
    presetHistory.reset(JSON.stringify(readPresetOptions()));
    markDesignClean();
    updateHistoryButtons();
  }

  // A step about to be taken by something other than a control: what is pending counts first.
  function settlePresetHistory() {
    if (historyTimer === null) return;
    clearTimeout(historyTimer);
    historyTimer = null;
    presetHistory.record(JSON.stringify(readPresetOptions()));
  }

  // The design as it was loaded, started or saved, to tell whether replacing it loses work.
  let cleanDesign = null;
  const designKey = () => JSON.stringify([readPresetOptions(), [...layerSections].sort()]);
  function markDesignClean() {
    cleanDesign = designKey();
  }

  // Asked before a load, a starting point or a surprise replaces changes nobody saved.
  function confirmReplaceDesign() {
    if (cleanDesign === null || designKey() === cleanDesign) return true;
    const question = t('pd-replace-title', 'Replace your changes?', 'Remplacer tes modifications ?');
    const answer = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'question',
      title: question,
      message: question,
      detail: t('pd-replace-detail', 'The design you are working on has changes that are not saved.', 'Le design en cours a des modifications qui ne sont pas enregistrées.'),
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('pd-replace', 'Replace', 'Remplacer')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return answer === 1;
  }

  function stepPresetHistory(back) {
    // A pending record would otherwise land on top of the step just taken.
    clearTimeout(historyTimer);
    historyTimer = null;
    const look = sanLookHistory();
    if (look) {
      // A look change still waiting to be saved is the latest step: it goes in first.
      look.flush();
      const from = back ? sanSteps : sanRedo;
      let kind = from.pop();
      // A look step the panel no longer holds (its history keeps the last 80) is passed over.
      while (kind === 'look' && !(back ? look.undo() : look.redo())) kind = from.pop();
      if (!kind) return void updateHistoryButtons();
      (back ? sanRedo : sanSteps).push(kind);
      if (kind === 'look') return void updateHistoryButtons();
    }
    const state = back ? presetHistory.undo() : presetHistory.redo();
    if (state == null) return;

    historyRestoring = true;
    try {
      const values = JSON.parse(state);
      writePresetOptions(values);
      refreshPresetSounds(values.sound || '');
      refreshPresetImages(values.bgImage || '', values.logoImage || '');
      refreshPresetFonts(values.fontFile || '');
      updatePreviewStyles(readPresetOptions());
      // Over a SAN card only its items moved: they are saved, and the card's picture still holds.
      if (sanItems) saveSanCanvasSoon();
      else replayPreview();
      filterDesigner($('#pd-search').val());
    } finally {
      historyRestoring = false;
    }
    updateHistoryButtons();
    if (canvasEditor) canvasEditor.refresh();
  }

  $('#btn-preset-undo, #pd-cv-undo').click(() => stepPresetHistory(true));
  $('#btn-preset-redo, #pd-cv-redo').click(() => stepPresetHistory(false));

  // Ctrl+Z/Y, but only while the designer tab is on screen and focus is not in a text field where
  // the browser's own undo is what the user means.
  $(document).on('keydown', function (event) {
    if (!event.ctrlKey || event.altKey) return;
    const key = String(event.key || '').toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    if (!$("#settings .content[data-view='presets']").is(':visible')) return;
    const focused = document.activeElement;
    if (focused && /^(?:input|textarea)$/i.test(focused.tagName) && !/^(?:range|color|checkbox|radio)$/i.test(focused.type || '')) return;
    event.preventDefault();
    stepPresetHistory(key === 'z' && !event.shiftKey);
  });

  // Which settings group draws each part of a designed card.
  const PART_GROUPS = {
    card: 'color',
    cardBefore: 'color',
    cardAfter: 'color',
    icon: 'icon',
    iconBefore: 'icon',
    iconAfter: 'icon',
    mark: 'icon',
    text: 'text',
    title: 'text',
    detail: 'text',
    meta: 'text',
    game: 'text',
    rarity: 'state',
    progress: 'layout',
  };

  // Opens a group, with its Advanced half where the interface shows it, and brings it into view.
  function revealDesignerGroup(name) {
    const group = name ? $(`#options-notify-designer .pd-controls .pd-group[data-group="${name}"]`) : $();
    if (!group.length || group.hasClass('pd-layer-skip')) return;
    group.addClass('is-open');
    const more = group.find('.pd-more');
    if (more.length && more.is(':visible') && !more.hasClass('is-on')) more.trigger('click');
    group[0].classList.remove('is-revealed');
    void group[0].offsetWidth;
    group[0].classList.add('is-revealed');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    group[0].scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    syncDesignerToggleAria();
  }

  // Collapsible groups, and the per-group Advanced disclosure.
  $('#options-notify-designer').on('click', '.pd-group-head', function () {
    $(this).closest('.pd-group').toggleClass('is-open');
  });
  $('#options-notify-designer').on('click', '.pd-more', function () {
    const advanced = $(this).closest('.pd-group-body').find('.pd-adv');
    advanced.prop('hidden', !advanced.prop('hidden'));
    $(this).toggleClass('is-on', !advanced.prop('hidden'));
  });
  // The toggles show their state by class only; mirror it for assistive technology after every
  // click, once the handlers above and the per-button ones below have run.
  function syncDesignerToggleAria() {
    $('#pd-view button, #pd-state button, #pd-backdrop button, #pd-anchors button').each(function () {
      this.setAttribute('aria-pressed', String(this.classList.contains('is-on')));
    });
    $('#options-notify-designer .pd-more').each(function () {
      this.setAttribute('aria-expanded', String(this.classList.contains('is-on')));
    });
    $('#options-notify-designer .pd-group-head').each(function () {
      this.setAttribute('aria-expanded', String($(this).closest('.pd-group').hasClass('is-open')));
    });
  }
  $('#options-notify-designer').on('click', 'button', syncDesignerToggleAria);
  syncDesignerToggleAria();

  $('#pd-view button').on('click', function () {
    previewView = String($(this).attr('data-view') || 'card');
    $('#pd-view button').removeClass('is-on');
    $(this).addClass('is-on');
    document.getElementById('pd-stage').setAttribute('data-view', previewView);
    showStateFields();
    if (previewView === 'compare') renderComparePreviews(readPresetOptions());
    layoutPreview();
    // The layers stay listed but cannot be picked outside the single card.
    const readonly = t('preset-view-readonly', 'This view only shows the card. Go back to Card to edit the layout.', 'Cette vue montre seulement la carte. Reviens sur Carte pour modifier la mise en page.');
    if (previewView !== 'card' && canvasEditor && canvasEditor.isFull()) setPresetStatus(readonly);
    else if ($('#pd-status').text() === readonly) setPresetStatus('');
  });

  // A picture added to the free layout goes through the logo import: same checks, same folder.
  // Its size is read from the decoded picture, which knows every format the import accepts.
  async function importCanvasImage() {
    const res = await ipcRenderer.invoke('import-preset-logo', 'picture');
    if (!res || res.canceled) return null;
    if (!res.ok) return { refused: true };
    await refreshPresetImages(null, null);
    const size = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ width: 1, height: 1 });
      image.src = presetAssetUrl(res.name);
    });
    return { name: res.name, ...size };
  }

  // A text's own font goes through the card's font import; the card keeps the font it had.
  async function importCanvasFont() {
    const res = await ipcRenderer.invoke('import-preset-font');
    if (!res || res.canceled) return null;
    if (!res.ok) {
      setPresetStatus(refusalText('font'), 'error');
      return null;
    }
    await refreshPresetFonts(null);
    return { name: res.name };
  }

  const loggedImport = (run) => () =>
    run().catch((err) => {
      debug.log(err);
      return null;
    });

  canvasEditor = require(path.join(appPath, 'ui/presetCanvasEditor.js')).createCanvasEditor({
    root: document.getElementById('options-notify-designer'),
    stage: document.getElementById('pd-stage'),
    input: document.getElementById('pd-canvas'),
    frame: () => document.getElementById('pd-frame'),
    enabled: () => previewView === 'card' && (!presetSnapshot || sanItemsMode()) && canvasEditor.isFull(),
    // Compare and Screen keep the layers listed; picking one comes back to the card to edit it.
    otherView: () => previewView !== 'card',
    showCard: () => $('#pd-view [data-view="card"]').trigger('click'),
    // A SAN card keeps its theme's size: no handles to stretch it.
    fixedCard: () => Boolean(presetSnapshot || sanLive),
    // A live SAN card's own elements, each opening its settings in the theme's panel.
    cardPartAt: (doc, x, y) => {
      const part = sanLive ? sanLivePreview.partAt(doc, x, y) : null;
      return part && { ...part, name: sanLook.partName(part.id) };
    },
    openCardPart: (id) => sanLook.reveal(id),
    // A part of a designed card opens its settings group, Advanced half included.
    partSelected: (key) => {
      if (!sanLive && !presetSnapshot) revealDesignerGroup(PART_GROUPS[key]);
    },
    // Moved by hand: the theme's own scale zooms its page, so a shift is counted in its pixels.
    cardPartMovable: (id) => Boolean(sanLive) && sanLook.movable(id),
    moveCardPart: (id, dx, dy, done) => {
      const body = previewFrame() && previewFrame().contentDocument && previewFrame().contentDocument.body;
      const zoom = (body && parseFloat(body.style.zoom)) || 1;
      sanLook.nudge(id, dx / zoom, dy / zoom, done);
    },
    active: () => $("#settings .content[data-view='presets']").is(':visible'),
    apply: () => updatePreviewStyles(readPresetOptions()),
    // Through the sliders themselves, so the readouts, undo and saving see the new size.
    resizeCard: (size, done) => {
      $('#pd-width').val(size.width);
      if (size.minHeight !== undefined) $('#pd-minHeight').val(size.minHeight);
      if (size.padY !== undefined) $('#pd-padY').val(size.padY);
      if (done) $('#pd-width').trigger('change');
      else updatePreviewStyles(refreshPresetControls());
    },
    assetUrl: presetAssetUrl,
    // The bundled preset's brand mark, which only a layer has: 'after', 'before' or ''.
    markPseudo: () => (layerMode && layerMode.markPseudo) || '',
    // Over a bundled preset, whose engine cannot cut through the card.
    isLayer: () => Boolean(layerMode),
    // A decoration can be recoloured only when its base draws it with the accent.
    decorUsesAccent: (key) => Boolean(layerMode) && presetLayerTool.decorUsesAccent(layerMode.css, key),
    importImage: loggedImport(importCanvasImage),
    importFont: loggedImport(importCanvasFont),
    status: (message, state) => setPresetStatus(message, state),
    lang: () => String(app.config?.achievement?.lang || 'english'),
    // The timeline: the stylesheet with the entrances in or out, and the popup from its start.
    motion: (on) => {
      previewMotion = on;
      markPlaying(on);
      updatePreviewStyles(readPresetOptions());
      if (on) warnReducedMotion();
    },
    restart: () => replayPreview(),
    // How long the card is on screen, for the timeline to run to the end of its exit.
    cardLife: () => Number(readPresetOptions().duration) || 0,
  });
  // Its summary and layer names are read from the locale, which may land after it was built.
  registerLocaleRefresh(() => canvasEditor.refresh());

  // Seeing all three states side by side answers "does it look DIFFERENT?", not just "what does
  // a rare unlock look like?".
  function comparePayload(state) {
    const kept = previewState;
    previewState = state;
    const payload = previewPayload();
    previewState = kept;
    return payload;
  }

  // Marks which of the compared rows the state switch points at, since Compare shows all of them.
  function markCurrentCompareRow() {
    $('#pd-compare .pd-compare-row').each(function () {
      $(this).toggleClass('is-current', String($(this).attr('data-state') || '') === previewState);
    });
  }

  function renderComparePreviews(values) {
    const rows = document.querySelectorAll('#pd-compare .pd-compare-row');
    if (!rows.length) return;
    markCurrentCompareRow();
    const box = previewBox(values, false);
    const stageWidth = measuredStageWidth();
    // Fits height as well as width (fitting width alone ran tall popups off the bottom); these
    // numbers must agree with .pd-compare in the stylesheet, the only other place the grid is described.
    const COLUMNS = 2;
    const COL_GAP = 14;
    const ROW_GAP = 10;
    const LABEL_ROOM = 18; // the state name now sits above its popup rather than beside it
    const count = rows.length;
    const gridRows = Math.ceil(count / COLUMNS);
    const cellWidth = (stageWidth - COL_GAP * (COLUMNS - 1)) / COLUMNS;
    const cellHeight = Math.max(24, (stageCeiling() - ROW_GAP * (gridRows - 1)) / gridRows - LABEL_ROOM);
    const zoom = Math.min(1, cellWidth / box.width, cellHeight / box.height);
    fitStageTo((Math.ceil(box.height * zoom) + LABEL_ROOM) * gridRows + ROW_GAP * (gridRows - 1));
    const snapshotName = presetSnapshot ? presetSnapshot.name : '';
    const document_ = snapshotName || sanLive ? '' : presetGenerator.buildPresetPreviewHtml(values, { assetUrl: presetAssetUrl, css: layerMode ? layerStylesheet(values, false) : undefined });
    const snapshotFrames = [];
    for (const row of rows) {
      const wrap = row.querySelector('.pd-compare-frame');
      const frame = ensureFrame(wrap, { title: String(row.getAttribute('data-state') || 'normal') });
      if (!frame) continue;
      frame.width = box.width;
      frame.height = box.height;
      frame.style.width = box.width + 'px';
      frame.style.height = box.height + 'px';
      frame.style.transform = `scale(${zoom})`;
      wrap.style.width = Math.round(box.width * zoom) + 'px';
      wrap.style.height = Math.round(box.height * zoom) + 'px';
      if (sanLive) {
        showSanLiveIn(frame, String(row.getAttribute('data-state') || 'normal'));
        continue;
      }
      const payload = comparePayload(String(row.getAttribute('data-state') || 'normal'));
      if (snapshotName) {
        snapshotFrames.push({ frame, payload });
        continue;
      }
      // Already loaded: feed it again rather than reloading, so editing stays as cheap as one card.
      try {
        if (frame.contentWindow && frame.contentWindow.awPreviewApply) {
          const style = frame.contentDocument.getElementById('aw-preview-css');
          if (style) style.textContent = stylesheetFor(values, false);
          syncLayerLogo(frame.contentDocument);
          frame.contentWindow.awPreviewApply(payload);
          continue;
        }
      } catch (e) {
        debug.log(e);
      }
      frame.onload = () => {
        try {
          syncLayerLogo(frame.contentDocument);
          frame.contentWindow.awPreviewApply(payload);
        } catch (e) {
          debug.log(e);
        }
      };
      frame.srcdoc = document_;
    }
    if (snapshotName) void showCompareSnapshots(snapshotName, snapshotFrames);
  }

  // An imported preset has no controls to restyle a frame with, so each state is a picture of its
  // own (a SAN theme can draw every tier differently), a few at a time: each one takes seconds.
  const COMPARE_SNAPSHOTS_AT_ONCE = 3;
  let compareSnapshotRun = 0;
  async function showCompareSnapshots(name, frames) {
    const run = ++compareSnapshotRun;
    const show = async ({ frame, payload }) => {
      const shot = await ipcRenderer.invoke('preset-snapshot', { preset: name, payload: snapshotPayload(payload) }).catch((err) => {
        debug.log(err);
        return null;
      });
      if (!shot || run !== compareSnapshotRun || !presetSnapshot || presetSnapshot.name !== name) return;
      frame.onload = null;
      frame.srcdoc = snapshotDocument(shot);
    };
    for (let i = 0; i < frames.length && run === compareSnapshotRun; i += COMPARE_SNAPSHOTS_AT_ONCE) {
      await Promise.all(frames.slice(i, i + COMPARE_SNAPSHOTS_AT_ONCE).map(show));
    }
  }

  // A notification is seen over a game, not the app's own panel colour, and a design that reads
  // well on dark can vanish on a bright scene, so the backdrop is a preview control.
  $('#pd-backdrop button').on('click', function () {
    $('#pd-backdrop button').removeClass('is-on');
    $(this).addClass('is-on');
    const backdrop = String($(this).attr('data-backdrop') || 'checker');
    const stage = document.getElementById('pd-stage');
    stage.setAttribute('data-backdrop', backdrop);
    // With an empty library the stylesheet's painted scene stands in for the artwork.
    const artwork = backdrop === 'artwork' ? previewBackdrop() : '';
    stage.style.backgroundImage = artwork ? `url("${artwork}")` : '';
  });

  $('#pd-state button').on('click', function () {
    previewState = String($(this).attr('data-state') || 'normal');
    $('#pd-state button').removeClass('is-on');
    $(this).addClass('is-on');
    // Every state but normal has its colours in a group that starts collapsed, so asking for one opens it.
    if (previewState !== 'normal') {
      $("#options-notify-designer .pd-group[data-group='state']").addClass('is-open');
    }
    showStateFields();
    // In Compare every state is on screen at once, so asking for one marks it rather than
    // swapping to it - the switch keeps meaning something in a view that shows them all.
    if (previewView === 'compare') markCurrentCompareRow();
    replayPreview();
    // A SAN theme's panel edits the look of the tier on show.
    if (sanLive) renderSanLook();
  });

  // Play the whole thing once - entry, hold and exit at the preset's own timings - then go back to
  // holding the card on screen so the controls stay usable.
  let previewPlayTimer = null;
  $('#pd-play').on('click', function () {
    const values = readPresetOptions();
    clearTimeout(previewPlayTimer);
    // A SAN card plays at its own pace and says when it is done; Compare plays every row.
    if (sanLive) {
      if (previewView !== 'compare') return void showSanLiveIn(previewFrame(), previewState, { hold: false });
      for (const row of document.querySelectorAll('#pd-compare .pd-compare-row')) {
        const frame = row.querySelector('iframe');
        if (frame) showSanLiveIn(frame, String(row.getAttribute('data-state') || 'normal'), { hold: false });
      }
      return;
    }
    // A preset drawn by code of its own is a picture here: that code runs only in a popup window of
    // its own, so Play shows the real one, in the state on screen, as Preview does.
    const loaded = String($('#pd-load').val() || '');
    if (loaded && !isEditablePreset(loaded) && !layerMode) {
      $('#btn-preview-preset').trigger('click');
      setPresetStatus(t('preset-play-popup', 'This preset draws its card with code of its own, so it plays in a real popup, on screen.', 'Ce preset dessine sa carte avec son propre code : il se joue dans un vrai popup, à l’écran.'));
      return;
    }
    renderPreviewDocument(values, { hold: false });
    // Re-read the controls when it ends rather than restoring the design as it was at Play, since
    // an edit made during playback should not appear to vanish.
    previewPlayTimer = setTimeout(() => renderPreviewDocument(readPresetOptions()), values.duration + 400);
    warnReducedMotion();
  });

  // The animations sit behind prefers-reduced-motion, so Play would otherwise seem broken.
  function warnReducedMotion() {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setPresetStatus(
      t(
        'preset-play-reduced',
        'Windows is set to show fewer animations, so the preview stays still. Turn "Animation effects" back on in Windows settings to see them.',
        'Windows est réglé pour afficher moins d’animations : l’aperçu reste immobile. Réactive « Effets d’animation » dans les paramètres de Windows pour les voir.'
      )
    );
  }

  // Mirrors the Notifications tab's position setting rather than adding a second one: a preset
  // does not own where notifications appear.
  function refreshPresetAnchors() {
    const scale = String($('#option_overlayScale').val() || '1');
    if ($('#pd-scale').val() !== scale) $('#pd-scale').val(scale);
    const position = String($('#option_overlayPosition').val() || 'center-bottom');
    $('#pd-anchors button').each(function () {
      const pos = String($(this).attr('data-pos'));
      $(this).toggleClass('is-on', pos === position).attr('aria-pressed', String(pos === position));
      // The grid is nine unlabelled cells, so each one borrows the wording the position setting
      // already has in this language rather than adding nine strings to translate.
      $(this).attr('title', $(`#option_overlayPosition option[value='${pos}']`).text());
    });
    if (previewView === 'screen') layoutPreview();
  }
  $('#pd-anchors button').on('click', function () {
    $('#option_overlayPosition').val(String($(this).attr('data-pos'))).change();
    refreshPresetAnchors();
  });
  // Mirrors the Notification tab's scale setting here since it is only judgeable next to the
  // design; changing it from either place changes the one setting.
  $('#pd-scale').on('change', function () {
    $('#option_overlayScale').val(String($(this).val())).change();
    layoutPreview();
  });
  $('#option_overlayPosition, #option_overlayScale').on('change', refreshPresetAnchors);
  // A SAN card slides in from the side of the screen it lands on.
  $('#option_overlayPosition').on('change', () => void refreshSanLivePayloads());

  // Green means a preset was actually written/renamed/deleted/exported; a message that only
  // describes the controls' current state stays 'info' so it doesn't read as "saved".
  function setPresetStatus(message, state) {
    $('#pd-status')
      .text(message || '')
      .removeClass('is-ok is-error')
      .addClass(state === 'ok' ? 'is-ok' : state === 'error' ? 'is-error' : '');
  }

  // The preset's own sound list: the same files the Notifications tab offers, plus a first entry
  // meaning "whatever the app is set to", which is what a preset with no opinion stores.
  function refreshPresetSounds(selected) {
    return ipcRenderer
      .invoke('list-sounds')
      .then((sounds) => {
        const sel = $('#pd-sound');
        const keep = selected != null ? selected : sel.val() || '';
        sel.empty();
        sel.append($('<option>').attr('value', '').text(sel.attr('data-lang-app') || ''));
        (sounds || []).forEach((name) => sel.append($('<option>').attr('value', name).text(name.replace(/\.[^.]+$/, ''))));
        sel.val((sounds || []).includes(keep) ? keep : '');
      })
      .catch((err) => debug.log(err));
  }

  // `{ name, editable }`: an imported preset is listed too (export/delete) but not editable, since
  // regenerating its files from the controls would destroy artwork they cannot reproduce.
  let generatedPresets = [];
  const managedPresetNames = () => generatedPresets.map((preset) => preset.name);
  const isEditablePreset = (name) =>
    generatedPresets.some((preset) => preset.editable && preset.name.toLowerCase() === String(name || '').toLowerCase());

  // Creating a preset that already exists replaces it, so the button says so: "Create" for a new
  // name, "Update" once the typed name matches a preset the designer generated.
  function updateCreateButtonMode() {
    const name = ($('#pd-name').val() || '').trim();
    const known = Boolean(name) && isEditablePreset(name);
    const label = known ? $('#pd-lbl-create').attr('data-update') : $('#pd-lbl-create').attr('data-create');
    if (label) $('#pd-lbl-create').text(label);
    $('#btn-create-preset').find('i').attr('class', known ? 'fas fa-save' : 'fas fa-plus');
  }

  async function refreshGeneratedPresetList(selected) {
    try {
      generatedPresets = (await ipcRenderer.invoke('list-custom-presets')) || [];
    } catch (err) {
      debug.log(err);
      generatedPresets = [];
    }
    const sel = $('#pd-load');
    sel.empty();
    sel.append($('<option>').attr('value', '').text(sel.attr('data-new') || ''));
    generatedPresets.forEach((preset) => sel.append($('<option>').attr('value', preset.name).text(preset.name)));
    sel.val(managedPresetNames().includes(selected) ? selected : '');
    sel.data('shown', String(sel.val() || ''));
    updateCreateButtonMode();
    updateDeleteButtonVisibility();
  }

  // Deleting and renaming only ever apply to a preset the app installed, so the buttons appear once
  // one is actually loaded - never next to a bundled preset or a half-typed new name.
  function updateDeleteButtonVisibility() {
    const loaded = String($('#pd-load').val() || '');
    const managed = Boolean(loaded) && managedPresetNames().includes(loaded);
    $('#btn-delete-preset').toggle(managed);
    // Opened as the base of a new layer, the Name field holds that layer's name, not a new one for it.
    $('#btn-rename-preset').toggle(managed && !(layerMode && layerMode.base === loaded));
  }

  // Rebuilds the main preset menu AND the per-type overrides, or a freshly imported preset stays
  // unpickable for rare/platinum/emulator notifications.
  const DEFAULT_PRESET_NAME = 'AW Next';
  const OVERLAY_PRESET_TYPE_IDS = [
    '#option_overlayPresetXenia',
    '#option_overlayPresetRpcs3',
    '#option_overlayPresetShadps4',
    '#option_overlayPresetKytyps5',
  ];
  async function refreshOverlayPresetMenu(preferred) {
    const presets = (await ipcRenderer.invoke('list-presets')) || [];
    const names = presets.length ? presets : [DEFAULT_PRESET_NAME, 'Default'];
    const sel = $('#option_overlayPreset');
    const previous = sel.val();
    sel.empty();
    names.forEach((n) => sel.append($('<option>').attr('value', n).text(n)));
    const wanted = [preferred, previous, DEFAULT_PRESET_NAME].find((n) => n && names.includes(n)) || names[0];
    sel.val(wanted).change();
    for (const id of OVERLAY_PRESET_TYPE_IDS) {
      const typeSel = $(id);
      const kept = typeSel.val();
      typeSel.empty();
      typeSel.append($('<option>').attr('value', '').text(typeSel.attr('data-lang-same') || ''));
      names.forEach((n) => typeSel.append($('<option>').attr('value', n).text(n)));
      const next = names.includes(kept) ? kept : '';
      typeSel.val(next);
      // Only when an override pointed at a preset that no longer exists, so the reset is persisted
      // without every refresh triggering a save of settings nobody touched.
      if (next !== kept) typeSel.change();
    }
    return names;
  }

  // Renames the loaded preset and moves every setting that pointed at the old name, or a stale
  // pointer would silently fall back to the default preset next time it fired.
  $('#btn-rename-preset').click(async function () {
    const from = String($('#pd-load').val() || '');
    const to = ($('#pd-name').val() || '').trim();
    if (!from) return;
    if (!to || to === from) {
      setPresetStatus(
        to
          ? t('preset-rename-same', 'Type a new name in the Name field first, then press Rename.', 'Tape d’abord un nouveau nom dans le champ Nom, puis appuie sur Renommer.')
          : $('#pd-status').attr('data-err') || '',
        'error'
      );
      $('#pd-name').trigger('focus');
      return;
    }

    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      const res = await ipcRenderer.invoke('rename-custom-preset', { from, to });
      if (res && res.ok) {
        // Which menus were on the old name, read before the lists are rebuilt under them.
        const followed = [];
        const wasMain = String($('#option_overlayPreset').val() || '') === from;
        for (const id of OVERLAY_PRESET_TYPE_IDS) {
          if (String($(id).val() || '') === from) followed.push(id);
        }
        await refreshOverlayPresetMenu(wasMain ? res.name : undefined);
        for (const id of followed) $(id).val(res.name).change();
        await refreshGeneratedPresetList(res.name);
        $('#pd-name').val(res.name);
        updateCreateButtonMode();
        presetGallery.forget(res.name);
        setPresetStatus(`${$('#pd-status').attr('data-renamed') || ''} ${res.name}`.trim(), 'ok');
      } else {
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
      }
    } catch (err) {
      debug.log(err);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  $('#btn-delete-preset').click(async function () {
    const name = String($('#pd-load').val() || '');
    if (!name) return;
    const self = $(this);
    const confirmed = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      type: 'warning',
      buttons: [t('delete', 'Delete', 'Supprimer'), t('cancel', 'Cancel', 'Annuler')],
      defaultId: 1,
      cancelId: 1,
      title: t('delete-preset-title', 'Delete preset', 'Supprimer le preset'),
      message: t('delete-preset-message', 'Delete the preset "{name}"?', 'Supprimer le preset « {name} » ?', { name }),
      detail: t('delete-preset-detail', 'The preset files are removed from disk. This cannot be undone.', 'Les fichiers du preset seront supprimés du disque. Cette action est irréversible.'),
      noLink: true,
    });
    if (confirmed !== 0) return;
    self.css('pointer-events', 'none');
    try {
      const res = await ipcRenderer.invoke('delete-custom-preset', name);
      if (res && res.ok) {
        // The deleted preset may have been the selected one; rebuild both lists and fall back.
        await refreshOverlayPresetMenu();
        $('#pd-name').val('');
        await refreshGeneratedPresetList('');
        presetGallery.forget(name);
        setPresetStatus(`${$('#pd-status').attr('data-deleted') || ''} ${name}`.trim(), 'ok');
      } else {
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
      }
    } catch (err) {
      debug.log(err);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });
  $('#pd-name').on('input', updateCreateButtonMode);

  // Back to the designer's own defaults, without touching what is saved on disk: a draft that has
  // gone wrong is otherwise only recoverable by reloading a saved preset.
  $('#btn-reset-preset').click(function () {
    applyDesignToControls({});
    setPresetStatus($('#pd-status').attr('data-reset') || '', 'info');
  });

  /*
    Customising a bundled preset: the designer keeps its controls, but only the sections that can be
    layered over somebody else's design are shown, each behind a switch. Fields are marked and
    hidden by class (never moved), and everything is put back when the mode ends.
  */
  const pdRoot = $('#options-notify-designer');
  const layerBackground = () => $('#pd-bgMode option[value="artwork"], #pd-bgMode option[value="image"]');
  const layerRevealedBlocks = [];

  function rgbToHex(text) {
    const value = String(text || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + value.slice(1).split('').map((c) => c + c).join('').toLowerCase();
    const match = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?/i.exec(value);
    if (!match || (match[4] !== undefined && Number(match[4]) < 0.3)) return '';
    return '#' + [match[1], match[2], match[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  }

  // Start the controls from what the bundled preset actually looks like, so ticking a section does
  // not begin by replacing its colours with the designer's defaults.
  function seedLayerControlsFromBase(frame) {
    try {
      const card = frame.contentDocument.querySelector('.ach');
      const style = frame.contentWindow.getComputedStyle(card);
      const gradientStop = /rgba?\([^)]*\)/i.exec(style.backgroundImage);
      const seeds = {
        accent: rgbToHex(style.getPropertyValue('--accent')),
        text: rgbToHex(style.color),
        bg: rgbToHex(style.backgroundColor) || rgbToHex(gradientStop && gradientStop[0]),
        borderColor: parseFloat(style.borderTopWidth) > 0 ? rgbToHex(style.borderTopColor) : '',
      };
      for (const [key, hex] of Object.entries(seeds)) if (hex) $('#pd-' + key).val(hex);
      refreshPresetControls();
    } catch (e) {
      debug.log(e);
    }
  }

  function refreshLayerToggles() {
    pdRoot.find('.pd-field[data-layer-section]').each(function () {
      $(this).toggleClass('is-inherited', !layerSections.has($(this).attr('data-layer-section')));
    });
    pdRoot.find('.pd-layer-toggle input').each(function () {
      this.checked = layerSections.has($(this).attr('data-section'));
    });
  }

  function enterLayerMode(base, sections) {
    exitLayerMode(false);
    layerMode = {
      base: base.name,
      width: base.width,
      height: base.height,
      css: presetLayerTool.absolutizeCssUrls(base.css, require('url').pathToFileURL(base.folder).href),
      markPseudo: presetLayerTool.brandMarkPseudo(base.css),
      textVar: presetLayerTool.titleInkVar(base.css),
    };
    layerSections.clear();
    for (const name of sections || []) if (presetLayerTool.LAYER_SECTION_NAMES.includes(name)) layerSections.add(name);
    pdRoot.addClass('is-layered');
    for (const [key, section] of Object.entries(presetLayerTool.LAYER_FIELD_SECTION)) {
      pdRoot.find('.pd-field[data-key="' + key + '"]').attr('data-layer-section', section);
    }
    // One switch in front of the first field of each section, in the order the fields appear. It
    // carries that field's name, so the field's own copy of it is only kept for screen readers.
    for (const section of presetLayerTool.LAYER_SECTION_NAMES) {
      const first = pdRoot.find('.pd-controls .pd-field[data-layer-section="' + section + '"]').first();
      if (!first.length) continue;
      const labelNode = first.find('[data-lang]').first();
      const toggle = $('<label class="pd-layer-toggle"><input type="checkbox"><span></span></label>');
      toggle.find('input').attr('data-section', section);
      toggle.find('span').text(labelNode.text());
      first.before(toggle).addClass('pd-layer-named');
    }
    // The brand icon has no field of its own: its checkbox sits just above the logo's, and only
    // on a base whose mark can be hidden (Steam Modern's is baked into its picture).
    if (presetLayerTool.hasBrandMark(base.css)) {
      const brandToggle = $('<label class="pd-layer-toggle"><input type="checkbox"><span></span></label>');
      brandToggle.find('input').attr('data-section', 'brand');
      brandToggle.find('span').text($('#pd-layer-brand-label').text());
      pdRoot.find('.pd-layer-toggle input[data-section="logo"]').closest('label').before(brandToggle);
    } else {
      layerSections.delete('brand');
    }
    // The Advanced halves of a group fold away fields the layer needs, so they open and stay open.
    pdRoot.find('.pd-controls .pd-adv').each(function () {
      if (!this.hidden || !$(this).find('.pd-field[data-layer-section]').length) return;
      this.hidden = false;
      layerRevealedBlocks.push(this);
    });
    // A group with nothing to layer is not shown; the ones that have something are opened.
    pdRoot.find('.pd-controls .pd-group').each(function () {
      const group = $(this);
      if (!group.find('.pd-field[data-layer-section]').length) {
        group.addClass('pd-layer-skip');
      } else if (!group.hasClass('is-open')) {
        group.addClass('is-open pd-layer-opened');
      }
    });
    layerBackground().prop('disabled', true);
    if (['artwork', 'image'].includes(String($('#pd-bgMode').val()))) $('#pd-bgMode').val('solid');
    $('#btn-export-preset').prop('disabled', true);
    $('#pd-layer-base').val(base.name);
    $('#pd-layer-note')
      .text(
        t(
          'preset-layer-note',
          'Customizing {preset}. Tick a section to change it; whatever you leave unticked stays as the preset ships. Your changes sit on top of it: the preset itself is not copied or modified.',
          'Personnalisation de {preset}. Coche une section pour la modifier ; ce que tu laisses décoché reste comme dans le preset. Tes changements se posent par-dessus : le preset lui-même n’est ni copié ni modifié.',
          { preset: base.name }
        )
      )
      .prop('hidden', false);
    // "Start from" steps aside while a preset is customized; said, so it does not look lost.
    $('#pd-layer-away')
      .text(
        t(
          'preset-layer-start-hidden',
          '"{start}" is hidden while you customize a preset. Choose "{none}" to get it back.',
          '« {start} » est masqué pendant la personnalisation d’un preset. Choisis « {none} » pour le retrouver.',
          { start: $('.pd-start-title').first().text().trim(), none: $('#pd-layer-base option[value=""]').text().trim() }
        )
      )
      .prop('hidden', false);
    refreshLayerToggles();
  }

  function exitLayerMode(clearPicker = true) {
    if (!layerMode) return;
    layerMode = null;
    layerSections.clear();
    pdRoot.removeClass('is-layered').find('.pd-layer-toggle').remove();
    pdRoot.find('.pd-layer-named').removeClass('pd-layer-named');
    $('#pd-layer-away').prop('hidden', true).text('');
    pdRoot.find('.pd-field[data-layer-section]').removeAttr('data-layer-section').removeClass('is-inherited');
    while (layerRevealedBlocks.length) layerRevealedBlocks.pop().hidden = true;
    pdRoot.find('.pd-controls .pd-group').removeClass('pd-layer-skip').filter('.pd-layer-opened').removeClass('is-open pd-layer-opened');
    layerBackground().prop('disabled', false);
    $('#btn-export-preset').prop('disabled', false);
    $('#pd-layer-note').prop('hidden', true).text('');
    if (clearPicker) $('#pd-layer-base').val('');
  }

  async function openLayerBase(name, sections) {
    const base = await ipcRenderer.invoke('read-layer-base', name);
    if (!base) return false;
    enterLayerMode(base, sections);
    return true;
  }

  // A new layer over a base, under a name of its own, its controls seeded from what the base draws.
  async function beginLayer(name) {
    if (!(await openLayerBase(name, []))) return false;
    const named = `${name} custom`.slice(0, 48);
    $('#pd-name').val(named);
    // The name was typed for the user: said, so it does not read as the preset being renamed.
    const saved = t(
      'preset-layer-named',
      'It will be saved as a new preset, "{name}"; change the Name to call it something else.',
      'Il sera enregistré comme un nouveau preset, « {name} » ; change le Nom pour l’appeler autrement.',
      { name: named }
    );
    $('#pd-layer-note').text((_, text) => `${text} ${saved}`);
    $('#options-notify-designer .pd-template').removeClass('is-on');
    writePresetOptions({});
    refreshPresetImages('', '');
    refreshPresetFonts('');
    resetPresetHistory();
    const frame = previewFrame();
    renderPreviewDocument(readPresetOptions());
    if (frame) frame.addEventListener('load', () => seedLayerControlsFromBase(frame), { once: true });
    updateCreateButtonMode();
    updateDeleteButtonVisibility();
    return true;
  }

  function fillLayerBases(names, keep) {
    const sel = $('#pd-layer-base');
    sel.empty().append($('<option>').attr('value', '').text(sel.attr('data-lang-none') || ''));
    names.forEach((name) => sel.append($('<option>').attr('value', name).text(name)));
    sel.val(names.includes(keep) ? keep : '');
  }

  function refreshLayerBases() {
    return Promise.all([ipcRenderer.invoke('list-layer-bases'), ipcRenderer.invoke('list-fixed-presets')])
      .then(([names, fixed]) => {
        layerBaseNames = names || [];
        fixedPresetNames = fixed || [];
        fillLayerBases(layerBaseNames, layerMode ? layerMode.base : '');
        showFixedPresets(fixedPresetNames);
      })
      .catch((err) => debug.log(err));
  }

  const fixedPresetsText = (names) =>
    t(
      'preset-layer-fixed',
      '{presets} draw their card with their own code, so they cannot be customized here. You can still use them as they are.',
      '{presets} dessinent leur carte avec leur propre code : on ne peut pas les personnaliser ici. Tu peux toujours les utiliser tels quels.',
      { presets: names.join(', ') }
    );

  // Without this the missing presets look like a bug rather than a limit. Shown while the menu
  // they are missing from is in use (app.css), not at all times.
  function showFixedPresets(names) {
    $('#pd-layer-fixed')
      .prop('hidden', !names.length)
      .text(names.length ? fixedPresetsText(names) : '');
  }

  $('#pd-layer-base').on('change', async function () {
    const name = String($(this).val() || '');
    if (name && !confirmReplaceDesign()) {
      $(this).val(layerMode ? layerMode.base : '');
      return;
    }
    if (!name) {
      exitLayerMode();
      writePresetOptions({});
      updatePreviewStyles(readPresetOptions());
      renderPreviewDocument(readPresetOptions());
      return;
    }
    try {
      $('#pd-load').val('');
      if (!(await beginLayer(name))) {
        setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
        $(this).val('');
        return;
      }
      setPresetStatus('');
    } catch (err) {
      debug.log(err);
      setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
    }
  });

  pdRoot.on('change', '.pd-layer-toggle input', function () {
    const section = $(this).attr('data-section');
    if (this.checked) layerSections.add(section);
    else layerSections.delete(section);
    refreshLayerToggles();
    schedulePreview();
  });

  // Touching a dimmed field is a decision to use it.
  pdRoot.on('input change', '.pd-field[data-layer-section]', function () {
    const section = $(this).attr('data-layer-section');
    if (!layerMode || layerSections.has(section)) return;
    layerSections.add(section);
    refreshLayerToggles();
  });

  // A template is an ordinary set of options; the name field is left alone, since a starting
  // point is a look, not a preset, and overwriting a typed name would lose the user's work.
  function applyDesignToControls(options, { undoable = false } = {}) {
    if (undoable) settlePresetHistory();
    writePresetOptions(options);
    const values = presetSchema.normalizeOptions(options);
    const listed = Promise.all([
      refreshPresetSounds(values.sound || ''),
      refreshPresetImages(values.bgImage || '', values.logoImage || ''),
      refreshPresetFonts(values.fontFile || ''),
    ]);
    updatePreviewStyles(readPresetOptions());
    replayPreview();
    // A load or a reset starts a design rather than continuing one: undoing across it would step
    // back into a different preset's values. A starting point or a surprise over the same kind of
    // design is one step, which Ctrl+Z takes back.
    if (undoable) {
      presetHistory.record(JSON.stringify(readPresetOptions()));
      updateHistoryButtons();
    } else {
      resetPresetHistory();
    }
    // A starting point is not work to lose: what was just applied is the clean state.
    markDesignClean();
    settleAppliedDesign(listed);
    filterDesigner($('#pd-search').val());
  }

  // The sound, picture and font menus fill in after the controls are written, so the design reads
  // differently once they arrive. Nothing the user did: unless they changed something meanwhile,
  // the arrived state replaces the one taken at apply time, or the next template asked to "replace
  // your changes" on a design nobody touched.
  function settleAppliedDesign(listed) {
    const edits = designEdits;
    listed.then(() => {
      if (edits !== designEdits) return;
      presetHistory.amend(JSON.stringify(readPresetOptions()));
      markDesignClean();
    });
  }

  // The app theme's colours as #rrggbb, the only form a colour input takes. Read through an element
  // so whatever a theme writes (a var, color-mix) arrives resolved.
  function themeColors() {
    const probe = document.createElement('span');
    (document.getElementById('settings') || document.body).appendChild(probe);
    const read = (cssColor) => {
      probe.style.color = cssColor;
      const computed = getComputedStyle(probe).color;
      // color-mix() values come back as color(srgb 0-1 channels); rgb() ones in 0-255. Alpha is dropped.
      const scale = computed.startsWith('color(') ? 255 : 1;
      const [r, g, b] = (computed.match(/\d+(\.\d+)?/g) || []).map((v) => Number(v) * scale);
      return [r, g, b].every(Number.isFinite) ? '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : null;
    };
    const colors = { bg: read('var(--set-surface)'), text: read('var(--text)'), accent: read('var(--accent)'), borderColor: read('var(--set-control-border)') };
    probe.remove();
    return Object.fromEntries(Object.entries(colors).filter(([, value]) => value));
  }
  const templateDesign = (template) => (template.followTheme ? { ...template.options, ...themeColors() } : template.options);

  function buildTemplateChips() {
    const list = $('#pd-templates');
    if (!list.length) return;
    list.empty();
    for (const template of presetTemplates.PRESET_TEMPLATES) {
      // A swatch showing the template's own colours, so the row reads as designs rather than words.
      const values = presetSchema.normalizeOptions(templateDesign(template));
      const swatch = $('<span class="pd-template-swatch">').css({
        background: values.bgMode === 'gradient' ? `linear-gradient(135deg, ${values.bg}, ${values.bg2})` : values.bg,
        'border-color': values.accent,
      });
      list.append(
        $('<button type="button" class="pd-template">')
          .attr('data-template', template.name)
          .append(swatch)
          .append($('<span>').text(template.name))
      );
    }
  }

  $('#options-notify-designer').on('click', '.pd-template', function () {
    const name = String($(this).attr('data-template') || '');
    const template = presetTemplates.PRESET_TEMPLATES.find((entry) => entry.name === name);
    if (!template || !confirmReplaceDesign()) return;
    const options = presetSchema.normalizeOptions(templateDesign(template));
    $('#options-notify-designer .pd-template').removeClass('is-on');
    $(this).addClass('is-on');
    // Undo can only step back within one kind of design, not out of a bundled preset's layer.
    const undoable = !layerMode;
    exitLayerMode();
    applyDesignToControls(options, { undoable });
    setPresetStatus(`${$('#pd-status').attr('data-template') || ''} ${name}`.trim(), 'info');
  });

  // "Start from" folds away once a design is under way. Remembered on this PC only: a per-viewer
  // convenience, so a storage that refuses it just leaves the block open.
  const START_FOLDED_KEY = 'aw.presetDesigner.startFolded';
  function setStartFolded(folded) {
    $('#pd-templates-row').toggleClass('is-folded', folded);
    $('#pd-start-toggle').attr('aria-expanded', String(!folded));
    $('#pd-start-body').prop('inert', folded);
  }
  try {
    setStartFolded(localStorage.getItem(START_FOLDED_KEY) === '1');
  } catch (err) {
    debug.log(`preset designer: fold state unreadable (${err})`);
  }
  $('#pd-start-toggle').on('click', function () {
    const folded = !$('#pd-templates-row').hasClass('is-folded');
    setStartFolded(folded);
    try {
      localStorage.setItem(START_FOLDED_KEY, folded ? '1' : '0');
    } catch (err) {
      debug.log(`preset designer: fold state not kept (${err})`);
    }
  });

  // A design nobody would have thought to try. Constrained rather than uniform-random: one hue
  // drives the accent and the background is built around it, so the result is a design, not noise.
  $('#btn-random-preset').click(function () {
    if (!confirmReplaceDesign()) return;
    $('#options-notify-designer .pd-template').removeClass('is-on');
    const undoable = !layerMode;
    exitLayerMode();
    applyDesignToControls(presetTemplates.randomPresetOptions(), { undoable });
    setPresetStatus($('#pd-status').attr('data-randomized') || '', 'info');
  });

  // Riffs on a preset without overwriting it: keeps the design, frees the name, and clears the
  // picker so the next Create adds a preset instead of replacing the one it was based on.
  $('#btn-duplicate-preset').click(function () {
    const source = ($('#pd-name').val() || '').trim() || String($('#pd-load').val() || '');
    if (!source) {
      setPresetStatus($('#pd-status').attr('data-err') || '', 'error');
      return;
    }
    let candidate = `${source} (2)`;
    for (let index = 2; index < 100 && managedPresetNames().some((name) => name.toLowerCase() === candidate.toLowerCase()); index += 1) {
      candidate = `${source} (${index + 1})`;
    }
    $('#pd-load').val('');
    $('#pd-name').val(candidate.slice(0, 48));
    updateCreateButtonMode();
    updateDeleteButtonVisibility();
    setPresetStatus(`${$('#pd-status').attr('data-duplicated') || ''} ${$('#pd-name').val()}`.trim(), 'info');
  });

  // Puts a managed preset into the designer's controls. Returns 'editable', 'layer', 'imported' or
  // 'failed'. Shared by the picker and by Import, since a programmatic selection fires no change event.
  async function loadPresetIntoBuilder(name) {
    const opts = await ipcRenderer.invoke('read-custom-preset', name);
    if (!opts) return 'failed';
    // A gallery preset on the shared card is customised as a bundled one is, saved under a new name.
    if (opts.editable === false && opts.base) {
      presetSnapshot = null;
      sanLive = null;
      sanSettings = null;
      setImportedMode('');
      return (await beginLayer(name)) ? 'layer' : 'failed';
    }
    // An imported preset with no builder options behind it cannot be reproduced from the controls,
    // so leave them alone: Create then makes a new preset instead of overwriting unrebuildable artwork.
    if (opts.editable === false) {
      exitLayerMode();
      $('#pd-name').val('');
      updateCreateButtonMode();
      updateDeleteButtonVisibility();
      // A SAN theme runs live; any other imported page is shown as a picture of it.
      if (!(await showSanLive(name))) await showPresetSnapshot(name);
      await refreshSanPanel(name);
      setImportedMode(name);
      return 'imported';
    }
    presetSnapshot = null;
    sanLive = null;
    sanSettings = null;
    setImportedMode('');
    if (opts.layered) {
      if (!(await openLayerBase(opts.base, opts.sections))) return 'failed';
    } else {
      exitLayerMode();
    }
    $('#pd-name').val(opts.name || name);
    $('#options-notify-designer .pd-template').removeClass('is-on');
    applyDesignToControls(opts);
    refreshLayerToggles();
    updateCreateButtonMode();
    updateDeleteButtonVisibility();
    return 'editable';
  }

  $('#pd-load').on('change', async function () {
    const name = String($(this).val() || '');
    // Kept on a refusal: the picker goes back to what is still being edited.
    if (name && !confirmReplaceDesign()) {
      $(this).val($(this).data('shown') || '');
      return;
    }
    $(this).data('shown', name);
    updateDeleteButtonVisibility();
    if (!name) {
      setPresetStatus('');
      sanSettings = null;
      setImportedMode('');
      if (presetSnapshot || sanLive) {
        presetSnapshot = null;
        sanLive = null;
        renderPreviewDocument(readPresetOptions());
      }
      return;
    }
    try {
      const outcome = await loadPresetIntoBuilder(name);
      if (outcome === 'failed') setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
      else if (outcome === 'imported') setPresetStatus((sanSettings ? $('#pd-san-loaded').text() : $('#pd-status').attr('data-imported-only')) || '', 'info');
      else setPresetStatus(`${$('#pd-status').attr('data-loaded') || ''} ${name}`.trim(), 'info');
    } catch (err) {
      debug.log(err);
      setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
    }
  });

  // Renders the design as a real overlay popup without saving it first: only a real popup shows
  // it over whatever is on screen, at the configured position, scale and sound.
  $('#btn-preview-preset').click(async function () {
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      // Preview whatever the picker holds. An imported preset has no control values behind it, so
      // it must preview by name rather than by building a scratch preset from the (unrelated) controls.
      const loaded = String($('#pd-load').val() || '');
      const rarePercent = rarePreviewRate(previewState);
      const kind = previewState === 'completion' ? 'platinum' : previewState === 'normal' ? 'toast' : rarePercent ? 'rare' : previewState;
      if (loaded && !isEditablePreset(loaded) && !layerMode) {
        setPresetStatus('');
        ipcRenderer.send('spawn-overlay-notification', overlayTestData(kind, loaded, loaded, undefined, rarePercent));
        self.css('pointer-events', 'initial');
        return;
      }
      const options = readPresetOptions();
      const res = layerMode
        ? await ipcRenderer.invoke('preview-layered-preset', { base: layerMode.base, sections: [...layerSections], options, card: layerCardSize() })
        : await ipcRenderer.invoke('preview-custom-preset', options);
      if (res && res.ok) {
        setPresetStatus('');
        // Only name the design when the user actually named it, or the picker's "New preset…"
        // placeholder leaks into the preview text.
        const label = ($('#pd-name').val() || '').trim();
        const data = overlayTestData(kind, res.name, label, undefined, rarePercent);
        // A preset that names its own sound is what a real unlock would play, so the preview does
        // too - otherwise the one thing the designer cannot show inline stays untested.
        if (options.sound) data.soundPath = resolveSoundFile(options.sound);
        ipcRenderer.send('spawn-overlay-notification', data);
      } else {
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
      }
    } catch (e) {
      debug.log(e);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + e).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  // The full-screen editor covers the designer's own buttons: its Save is the same action.
  $('#pd-cv-save').on('click', () => $('#btn-create-preset').trigger('click'));

  $('#btn-create-preset').click(async function () {
    const self = $(this);
    const status = $('#pd-status');
    const name = ($('#pd-name').val() || '').trim();
    if (!name) {
      setPresetStatus(status.attr('data-err') || '', 'error');
      return;
    }
    self.css('pointer-events', 'none');
    try {
      const res = layerMode
        ? await ipcRenderer.invoke('create-layered-preset', { name, base: layerMode.base, sections: [...layerSections], options: readPresetOptions(), card: layerCardSize() })
        : await ipcRenderer.invoke('create-custom-preset', Object.assign({ name }, readPresetOptions()));
      if (res && res.ok) {
        presetGallery.forget(res.name);
        markDesignClean();
        // Refresh the preset dropdown and select the new preset (autosave persists the choice).
        await refreshOverlayPresetMenu(res.name);
        await refreshGeneratedPresetList(res.name);
        const done = res.replaced ? status.attr('data-updated') : status.attr('data-ok');
        setPresetStatus(`${done || ''} ${res.name}`.trim(), 'ok');
      } else if (res && res.error === 'name-taken') {
        setPresetStatus(t('import-preset-duplicate-message', 'A preset named "{name}" is already installed.', 'Un preset nommé « {name} » est déjà installé.', { name }), 'error');
      } else {
        setPresetStatus(((status.attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
      }
    } catch (e) {
      debug.log(e);
      setPresetStatus(((status.attr('data-fail') || '') + ': ' + e).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  // Import validates the package in the main process and only then touches preset storage.
  function importErrorText(res) {
    const error = String((res && res.error) || '');
    if (error === 'app-too-old') {
      return t(
        'import-preset-app-too-old',
        'This preset needs AW Next {version} or newer.',
        'Ce preset nécessite AW Next {version} ou plus récent.',
        { version: (res && res.requires) || '' }
      );
    }
    if (error === 'format-too-new') {
      return t(
        'import-preset-format-too-new',
        'This preset package was made by a newer version of AW Next.',
        'Ce paquet de preset a été créé par une version plus récente d’AW Next.'
      );
    }
    const invalid = t('import-preset-invalid', 'This file is not a valid preset package.', 'Ce fichier n’est pas un paquet de preset valide.');
    return error ? `${invalid} (${error})` : invalid;
  }

  // Exports what the preview is showing, under the Name field; an imported preset exports from
  // disk instead, since its look lives in files the controls cannot describe.
  $('#btn-export-preset').click(async function () {
    const loaded = String($('#pd-load').val() || '');
    // An imported preset is exported as it stands; anything the designer can read is exported from
    // the controls, so an unsaved draft packages what is on screen.
    const request =
      loaded && !isEditablePreset(loaded)
        ? { name: loaded }
        : { name: ($('#pd-name').val() || '').trim() || loaded, options: readPresetOptions() };
    if (!request.name) {
      setPresetStatus($('#pd-status').attr('data-err') || '', 'error');
      return;
    }
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      const res = await ipcRenderer.invoke('export-preset', request);
      if (res && res.ok) setPresetStatus(`${$('#pd-status').attr('data-exported') || ''} ${res.name}`.trim(), 'ok');
      else if (!res || !res.canceled) setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
    } catch (err) {
      debug.log(err);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  // A timer ends the Import menu's closing animation: a hidden window never fires transitionend.
  const IMPORT_MENU_CLOSE_MS = 120;
  let importMenuTimer = null;
  function setImportMenu(open) {
    const box = $('#pd-import');
    if (box.hasClass('is-open') === open) return;
    clearTimeout(importMenuTimer);
    box.toggleClass('is-open', open).toggleClass('is-closing', !open);
    $('#btn-import-menu').attr('aria-expanded', String(open));
    if (open) $('#pd-import-list .pd-import-item').first().trigger('focus');
    else importMenuTimer = setTimeout(() => box.removeClass('is-closing'), IMPORT_MENU_CLOSE_MS);
  }
  $('#btn-import-menu').on('click', () => setImportMenu(!$('#pd-import').hasClass('is-open')));
  $('#pd-import-list').on('click', '.pd-import-item', () => setImportMenu(false));
  $('#pd-import').on('keydown', function (e) {
    if (!$(this).hasClass('is-open')) return;
    const items = $('#pd-import-list .pd-import-item').toArray();
    const at = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setImportMenu(false);
      $('#btn-import-menu').trigger('focus');
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
      items[next].focus();
    }
  });
  $(document).on('mousedown.pdImport', (e) => {
    if (!$(e.target).closest('#pd-import').length) setImportMenu(false);
  });

  $('#btn-import-preset').click(async function () {
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      let res = await ipcRenderer.invoke('import-preset', {});
      // A name clash changes nothing until the user picks: replace the preset, or keep both.
      if (res && !res.ok && res.error === 'duplicate') {
        const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'question',
          buttons: [
            t('keep-both-presets', 'Keep both', 'Garder les deux'),
            t('replace-preset', 'Replace', 'Remplacer'),
            t('cancel', 'Cancel', 'Annuler'),
          ],
          defaultId: 0,
          cancelId: 2,
          title: t('import-preset-duplicate-title', 'Preset already exists', 'Ce preset existe déjà'),
          message: t('import-preset-duplicate-message', 'A preset named "{name}" is already installed.', 'Un preset nommé « {name} » est déjà installé.', {
            name: res.name || '',
          }),
          detail: t(
            'import-preset-duplicate-detail',
            'Keep both installs the imported preset under a new name. Replace overwrites the installed one.',
            'Garder les deux installe le preset importé sous un nouveau nom. Remplacer écrase celui déjà installé.'
          ),
          noLink: true,
        });
        if (choice === 2) {
          setPresetStatus('');
          self.css('pointer-events', 'initial');
          return;
        }
        res = await ipcRenderer.invoke('import-preset', { file: res.file, duplicate: choice === 1 ? 'replace' : 'rename' });
      }

      if (res && res.ok) {
        // A replacing import keeps the name, so the gallery would show the old one's picture.
        presetGallery.forget(res.name);
        await refreshOverlayPresetMenu(res.name);
        await refreshGeneratedPresetList(res.name);
        // Selecting it in code fires no change event, so load it into the controls explicitly or
        // the designer keeps showing whatever draft was there before the import.
        await loadPresetIntoBuilder(res.name);
        setPresetStatus(`${$('#pd-status').attr('data-imported') || ''} ${res.name}`.trim(), 'ok');
      } else if (!res || !res.canceled) {
        setPresetStatus(importErrorText(res), 'error');
      }
    } catch (err) {
      debug.log(err);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  // The theme is kept whole and drawn by SAN's own card layouts, so the report is only about what
  // could not come along: files the theme names but does not carry, and keys this version ignores.
  function sanReportDetail(report) {
    if (!report) return '';
    const lines = [t('import-san-carried', '{count} settings carried over.', '{count} réglages repris.', { count: report.kept || 0 })];
    const cards = (report.layouts || []).join(', ');
    if (cards) {
      lines.push(
        t(
          'import-san-drawn',
          'Drawn with SAN’s own "{cards}" layout, so it looks and moves as it did in SAN.',
          'Dessiné avec la disposition « {cards} » de SAN : il a le même aspect et le même mouvement que dans SAN.',
          { cards }
        )
      );
    }
    const sounds = (report.assets || []).filter((entry) => entry.kind === 'sound' && entry.code === 'installed').length;
    if (sounds) lines.push(t('import-san-sounds', '{count} sound(s) added to your sounds.', '{count} son(s) ajouté(s) à tes sons.', { count: sounds }));

    const missing = [
      ...(report.missing || []).map((entry) => entry.name || '?'),
      ...(report.assets || []).filter((entry) => entry.code === 'asset-missing').map((entry) => entry.name || '?'),
    ];
    const refused = (report.assets || []).filter((entry) => entry.code === 'asset-rejected').map((entry) => entry.name);
    const skipped = [];
    if (missing.length) skipped.push('  ' + t('import-san-asset-missing', 'Missing from the theme file: {names}', 'Absent du fichier de thème : {names}', { names: missing.join(', ') }));
    if (refused.length) {
      skipped.push('  ' + t('import-san-asset-rejected', 'Refused as an unsupported file: {names}', 'Refusé car le fichier n’est pas pris en charge : {names}', { names: refused.join(', ') }));
    }
    if ((report.unknown || []).length) {
      skipped.push('  ' + t('import-san-kept-unknown', 'Kept, but not drawn by this version: {keys}', 'Gardé, mais pas dessiné par cette version : {keys}', { keys: report.unknown.join(', ') }));
    }
    if (skipped.length) {
      lines.push('');
      lines.push(t('import-san-skipped', 'Not carried over:', 'Non repris :'));
      lines.push(...skipped);
    }
    lines.push('');
    lines.push(
      t(
        'import-san-ready',
        'Pick it in the preset list. It exports as an .awpreset like any other preset, with its sounds.',
        'Choisis-le dans la liste des presets. Il s’exporte en .awpreset comme les autres, avec ses sons.'
      )
    );
    return lines.join('\n');
  }

  /*
    What AW Next adds over an imported SAN theme: the tier its trophy pictures are drawn in, and per
    tier another imported theme that draws it instead. `sanSettings` is null for any other preset.
  */
  let sanSettings = null;
  async function refreshSanPanel(name) {
    const settings = await ipcRenderer.invoke('san-preset-settings', name).catch((err) => {
      debug.log(err);
      return null;
    });
    if (String($('#pd-load').val() || '') !== name) return;
    sanSettings = settings ? { name, ...settings } : null;
  }

  const sanPanelShown = () => Boolean(sanSettings);

  /*
    An imported preset is used as it is: the starting points, the bundled bases and Create would
    build some other design, so they step aside. A SAN theme keeps the editor, for its own settings.
  */
  function setImportedMode(name) {
    const san = Boolean(name) && sanPanelShown();
    flushSanCanvas();
    sanLook.flush();
    if (sanItems && sanItems.name !== name) leaveSanItems();
    $('#options-notify-designer').toggleClass('is-imported', Boolean(name)).toggleClass('is-san', san);
    if (name) $('#pd-name').val(name);
    $('#pd-cv-full').prop('hidden', previewView !== 'card' || (Boolean(presetSnapshot) && !san));
    if (san) void enterSanItems(name);
    else {
      sanLookData = null;
      sanLook.render(null, null);
    }
  }

  /*
    The items over a SAN card are edited in the designer's own canvas field, so the layout editor,
    undo and redo work as for any design. The draft's own items are put back when the SAN preset
    is left. `sanItems` is the preset being edited and the draft's items.
  */
  let sanItems = null;
  let sanCanvasTimer = null;
  async function enterSanItems(name) {
    const look = await refreshSanLook(name);
    if (!look || String($('#pd-load').val() || '') !== name) return;
    if (!sanItems) sanItems = { name, draft: $('#pd-canvas').val() };
    sanItems.name = name;
    $('#pd-canvas').val(JSON.stringify(look.canvas));
    resetPresetHistory();
    renderPreviewDocument(readPresetOptions());
  }
  function leaveSanItems() {
    $('#pd-canvas').val(sanItems.draft);
    sanItems = null;
  }
  function saveSanCanvasSoon() {
    clearTimeout(sanCanvasTimer);
    sanCanvasTimer = setTimeout(flushSanCanvas, 400);
  }
  function flushSanCanvas() {
    if (sanCanvasTimer === null) return;
    clearTimeout(sanCanvasTimer);
    sanCanvasTimer = null;
    if (sanItems) void saveSanCanvas(sanItems.name, readPresetOptions().canvas);
  }
  async function saveSanCanvas(name, canvas) {
    const res = await ipcRenderer.invoke('san-preset-canvas-save', { name, canvas }).catch((err) => {
      debug.log(err);
      return null;
    });
    if (!res || !res.ok) {
      setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
      return;
    }
    presetGallery.forget(name);
    // Saved as it went: leaving it is not losing work.
    if (sanItems && sanItems.name === name) markDesignClean();
  }

  // `reload` rebuilds the live page, for a change that brings files of its own (another theme's look).
  async function saveSanSetting(change, { reload = true } = {}) {
    const name = sanSettings ? sanSettings.name : '';
    if (!name) return;
    $('#pd-san-look').addClass('is-busy');
    try {
      const res = await ipcRenderer.invoke('san-preset-save', { name, ...change });
      if (res && res.ok) {
        presetGallery.forget(name);
        setPresetStatus(`${$('#pd-san-saved').text()} ${name}`.trim(), 'ok');
      } else setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
    } catch (err) {
      debug.log(err);
      setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
    } finally {
      $('#pd-san-look').removeClass('is-busy');
    }
    if (String($('#pd-load').val() || '') !== name) return;
    await refreshSanPanel(name);
    if (reload && !(await showSanLive(name))) await showPresetSnapshot(name);
    renderSanLook();
  }

  // Shown at once, saved in the background: the trophy picture changes nothing but the drawing.
  function setSanTierPictures(tier) {
    if (sanLive) {
      sanLive.theme = { ...sanLive.theme, tierPictures: tier };
      replayPreview();
    }
    if (sanSettings) sanSettings = { ...sanSettings, tierPictures: tier };
    renderSanLook();
    return saveSanSetting({ tierPictures: tier }, { reload: !sanLive });
  }

  /*
    The theme's own settings (colours, sizes, glow...) for the tier the preview shows, drawn live
    as they change and saved into the preset a moment later. `sanLookData` is what the main process
    answered: each of the theme's looks and its values.
  */
  let sanLookData = null;
  const sanLook = require(path.join(appPath, 'ui/sanLookPanel.js')).createSanLookPanel({
    root: document.getElementById('pd-san-look'),
    label: (key) => $(`#pd-san-look-text [data-sl="${key}"]`).text() || key,
    onPreview: previewSanLook,
    onChange: (type, changes) => saveSanLook({ type, changes }),
    onRestore: () => saveSanLook({ restore: true }),
    onDrawnBy: (state, source) => saveSanSetting({ states: { [state]: source } }),
    onTierPictures: setSanTierPictures,
    onHistory: (kind) => {
      if (sanItems && kind === 'record') noteSanStep('look');
      else if (sanItems && kind === 'change') sanRedo = [];
      // The look's history started again (a restore, another theme): its steps leave the order log.
      else if (kind === 'reset') {
        sanSteps = sanSteps.filter((step) => step !== 'look');
        sanRedo = sanRedo.filter((step) => step !== 'look');
      }
      updateHistoryButtons();
    },
  });
  sanLookHistory = () => (sanItems ? sanLook : null);

  const stateLabel = (state) => $(`#pd-state button[data-state="${state}"]`).text().trim() || state;

  // Which of the theme's looks draws the tier on show, and what else it draws, as host.js decides.
  function sanLookView() {
    const theme = sanLive ? sanLive.theme : { types: {} };
    const payloads = sanLive ? sanLive.payloads : {};
    const pick = (state) => sanEngineCore.customisationFor(theme, sanEngineCore.unlockOf(payloads[state] || {}));
    // '' when another theme draws that tier; a missing look falls back to the theme's ordinary one.
    const ownType = (picked) => (theme.states && theme.states[picked.state] ? '' : theme.types[picked.type] ? picked.type : 'main');
    const shown = pick(previewState);
    const type = ownType(shown);
    // Trophy mode grades every unlock, so no popup is drawn as a plain one there.
    const trophyMode = Boolean(payloads.bronze && payloads.bronze.rarityMode === settingsRarityTiers.MODE_TROPHY);
    const others = SAN_LIVE_STATES.filter((state) => state !== previewState && !(trophyMode && state === 'normal'));
    return {
      state: shown.state,
      stateLabel: stateLabel(previewState),
      type: type || 'main',
      from: type ? '' : String((theme.stateFrom && theme.stateFrom[shown.state]) || ''),
      shared: type ? others.filter((state) => ownType(pick(state)) === type).map(stateLabel) : [],
      sources: (sanSettings && sanSettings.sources) || [],
      tierPictures: theme.tierPictures || (sanSettings && sanSettings.tierPictures) || 'auto',
      perTier: sanLive ? sanEngineFiles.drawsPerTier(theme) : true,
    };
  }

  function renderSanLook() {
    sanLook.render(sanLookData, sanLookData ? sanLookView() : null);
  }

  async function refreshSanLook(name) {
    const look = await ipcRenderer.invoke('san-preset-look', name).catch((err) => {
      debug.log(err);
      return null;
    });
    if (String($('#pd-load').val() || '') !== name) return null;
    sanLookData = look;
    renderSanLook();
    return look;
  }

  // A restore or another base card needs the page rebuilt; anything else is already on screen.
  async function saveSanLook(change) {
    const name = sanSettings ? sanSettings.name : '';
    if (!name) return;
    const res = await ipcRenderer.invoke('san-preset-look-save', { name, ...change }).catch((err) => {
      debug.log(err);
      return null;
    });
    if (!res || !res.ok) {
      setPresetStatus($('#pd-status').attr('data-fail') || '', 'error');
      return;
    }
    presetGallery.forget(name);
    if (String($('#pd-load').val() || '') !== name) return;
    const rebuilt = change.restore === true || Object.prototype.hasOwnProperty.call(change.changes || {}, 'preset');
    if (change.restore) await refreshSanLook(name);
    else if (sanLookData && !sanLookData.edited) {
      sanLookData = { ...sanLookData, edited: true };
      renderSanLook();
    }
    if (rebuilt && !(await showSanLive(name))) await showPresetSnapshot(name);
  }

  // A SAN preset has no designer options behind it, so it is selected for use instead of opened.
  async function showImportedSanPreset(name) {
    presetGallery.forget(name);
    await refreshOverlayPresetMenu(name);
    await refreshGeneratedPresetList(name);
    await loadPresetIntoBuilder(name);
    setPresetStatus(`${$('#pd-status').attr('data-imported') || ''} ${name}`.trim(), 'ok');
  }

  $('#btn-import-san').click(async function () {
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      let res = await ipcRenderer.invoke('import-san-theme', {});
      // Same two-step as an .awpreset import: a name clash changes nothing until the user picks.
      if (res && !res.ok && res.error === 'duplicate') {
        const choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'question',
          buttons: [
            t('keep-both-presets', 'Keep both', 'Garder les deux'),
            t('replace-preset', 'Replace', 'Remplacer'),
            t('cancel', 'Cancel', 'Annuler'),
          ],
          defaultId: 0,
          cancelId: 2,
          title: t('import-preset-duplicate-title', 'Preset already exists', 'Ce preset existe déjà'),
          message: t('import-preset-duplicate-message', 'A preset named "{name}" is already installed.', 'Un preset nommé « {name} » est déjà installé.', {
            name: res.name || '',
          }),
          detail: t(
            'import-preset-duplicate-detail',
            'Keep both installs the imported preset under a new name. Replace overwrites the installed one.',
            'Garder les deux installe le preset importé sous un nouveau nom. Remplacer écrase celui déjà installé.'
          ),
          noLink: true,
        });
        if (choice === 2) {
          setPresetStatus('');
          self.css('pointer-events', 'initial');
          return;
        }
        res = await ipcRenderer.invoke('import-san-theme', { file: res.file, duplicate: choice === 1 ? 'replace' : 'rename' });
      }

      if (res && res.ok) {
        await showImportedSanPreset(res.name);
        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'info',
          title: t('import-san-report-title', 'Theme imported', 'Thème importé'),
          message: res.name,
          detail: sanReportDetail(res.report),
          noLink: true,
        });
      } else if (!res || !res.canceled) {
        const error = String((res && res.error) || '');
        const invalid = t('import-san-invalid', 'This file is not a Steam Achievement Notifier theme.', 'Ce fichier n’est pas un thème Steam Achievement Notifier.');
        setPresetStatus(error ? `${invalid} (${error})` : invalid, 'error');
      }
    } catch (err) {
      debug.log(err);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  // SAN's own settings on this PC: no file to pick, and a second run refreshes the same presets.
  $('#btn-import-san-setup').click(async function () {
    const self = $(this);
    self.css('pointer-events', 'none');
    try {
      const res = await ipcRenderer.invoke('import-san-setup');
      const installed = (res && res.installed) || [];
      if (installed.length) {
        await showImportedSanPreset(installed[0].name);
        const lines = [
          t(
            'import-san-setup-active',
            'Your SAN themes in use (regular, semi-rare, rare and 100%) are in "{name}", which switches between them as SAN does.',
            'Tes thèmes SAN en service (normal, semi-rare, rare et 100 %) sont dans « {name} », qui passe de l’un à l’autre comme SAN.',
            { name: installed[0].name }
          ),
        ];
        if (installed.length > 1) {
          lines.push(
            t('import-san-setup-saved', 'Your other saved themes became presets too: {names}', 'Tes autres thèmes enregistrés sont aussi devenus des presets : {names}', {
              names: installed.slice(1).map((one) => one.name).join(', '),
            })
          );
        }
        if (res.failed && res.failed.length) {
          lines.push(t('import-san-setup-failed', 'Not imported: {names}', 'Non importés : {names}', { names: res.failed.map((one) => `${one.name || '?'} (${one.error})`).join(', ') }));
        }
        lines.push('', sanReportDetail(installed[0].report));
        remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
          type: 'info',
          title: t('import-san-report-title', 'Theme imported', 'Thème importé'),
          message: installed[0].name,
          detail: lines.join('\n'),
          noLink: true,
        });
      } else if (res && res.error === 'san-not-found') {
        setPresetStatus(t('import-san-not-found', 'Steam Achievement Notifier was not found on this PC.', 'Steam Achievement Notifier est introuvable sur ce PC.'), 'error');
      } else {
        setPresetStatus((($('#pd-status').attr('data-fail') || '') + (res && res.error ? ': ' + res.error : '')).trim(), 'error');
      }
    } catch (err) {
      debug.log(err);
      setPresetStatus((($('#pd-status').attr('data-fail') || '') + ': ' + err).trim(), 'error');
    }
    self.css('pointer-events', 'initial');
  });

  buildTemplateChips();
  refreshGeneratedPresetList().catch((err) => debug.log(err));
  refreshPresetSounds('');
  refreshPresetImages('');
  refreshPresetFonts('');
  refreshLayerBases();
  refreshPresetControls();
  renderPreviewDocument(readPresetOptions());
  refreshPresetAnchors();
  updatePresetTabVisibility();
  // Re-measure whenever the stage's width actually changes, since it is only measurable once the
  // tab is laid out; guarded on width change, or laying out would observe itself forever.
  let lastStageWidth = 0;
  const stageNode = document.querySelector('#options-notify-designer .pd-stage');
  if (stageNode && typeof ResizeObserver === 'function') {
    new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      if (width === lastStageWidth) return;
      lastStageWidth = width;
      layoutPreview();
    }).observe(stageNode);
  }
  // The locale loader can run after this file wired the picker up (and again on a language
  // change), so re-render the runtime-worded controls whenever it publishes new labels.
  $(document).on('locale-labels-changed', function () {
    refreshGeneratedPresetList(String($('#pd-load').val() || '')).catch((err) => debug.log(err));
    refreshPresetSounds();
    refreshPresetImages();
    refreshPresetFonts();
    refreshLayerBases();
  });
}

module.exports = { createPresetDesigner };
