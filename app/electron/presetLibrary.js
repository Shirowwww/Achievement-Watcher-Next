'use strict';

/*
  Everything the Settings page can do with a portable package: exporting and importing an .awpreset,
  importing a .san theme, the .awtheme export/preview/import/save flows, and the images and sounds a
  preset or a theme brings with it. Every one of them is an ipcMain handler and nothing else in the
  main process calls into this file, which is what makes it a leaf worth keeping out of init.js.

  It reaches back into init.js only through the context register() is given: the config and the
  overlay window change while the app runs, so those arrive as getters rather than as values read
  once at startup.
*/

const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { lazyRequire } = require('../util/lazyRequire.js');
const manifest = require('../package.json');
const notificationSounds = require('../util/notificationSounds.js');
const userThemes = require('../util/userThemes.js');
const themeLayers = require('../util/themeLayers.js');
const themeImages = require('../util/themeImages.js');
const themeBlur = require('../util/themeBlur.js');
const themePackage = lazyRequire(path.join(__dirname, '../util/themePackage.js'));
const presetPackage = lazyRequire(path.join(__dirname, '../util/presetPackage.js'));
const presetSchema = require('../util/presetSchema.js');
const sanImport = lazyRequire(path.join(__dirname, '../util/sanImport.js'));
const customPreset = require('../util/customPreset.js');
const { customPresetNumbers, sanitizePresetName, PRESET_OPTIONS_FILE } = customPreset;

let userData = '';
let debug = null;
let t = null;
let getConfig = () => null;
let getOverlayWindow = () => null;
let isOverlayVisible = () => false;
let currentThemePayload = () => ({});
let usersPresetsDir = () => '';
let bundledPresetRoots = () => [];
let userSoundsDir = () => '';
let userPresetImagesDir = () => '';
let findPresetFolder = () => null;
let invalidateNotificationPresetFolders = () => {};
let resolveSquareGameLogo = async () => null;
let writeCustomPreset = () => '';
let PREVIEW_PRESET_NAME = '__aw-preview__';

/*
  Called once from init.js, before any window exists. The handlers below are registered when this
  file is required and read the bindings above through their closure, so they always see the values
  init.js holds now rather than a copy taken at startup - which is what lets the config and the
  overlay window keep changing under them.
*/
function register(context) {
  ({
    userData,
    debug,
    t,
    getConfig,
    getOverlayWindow,
    isOverlayVisible,
    currentThemePayload,
    usersPresetsDir,
    bundledPresetRoots,
    userSoundsDir,
    userPresetImagesDir,
    findPresetFolder,
    invalidateNotificationPresetFolders,
    resolveSquareGameLogo,
    writeCustomPreset,
    PREVIEW_PRESET_NAME,
  } = context);
}

module.exports = { register };
/*
  `request` is either `{ name }` - export the preset of that name from disk - or `{ name, options }`,
  which exports the design currently in the builder, saved or not. The second form is what keeps a
  package matching what the user is looking at instead of some other preset that happened to be
  selected elsewhere.
*/
ipcMain.handle('export-preset', async (event, request) => {
  try {
    const asked = typeof request === 'string' ? { name: request } : request || {};
    const safe = sanitizePresetName(asked.name);
    if (!safe || safe === PREVIEW_PRESET_NAME) return { ok: false, error: 'invalid-name' };
    const draft = asked.options && typeof asked.options === 'object' ? customPresetNumbers(asked.options) : null;
    // The builder's scratch folder is a real preset folder, so a draft exports through exactly the
    // same path as a saved one; the package is named `safe`, never the reserved scratch name.
    const presetDir = draft ? writeCustomPreset(PREVIEW_PRESET_NAME, draft) : findPresetFolder(safe);
    if (!presetDir) return { ok: false, error: 'preset-not-found' };

    const res = await dialog.showSaveDialog({
      title: t('export-preset-title', 'Export preset', 'Exporter le preset'),
      defaultPath: safe + presetPackage.PRESET_PACKAGE_EXTENSION,
      filters: [{ name: t('preset-package', 'AW preset package', 'Paquet de preset AW'), extensions: ['awpreset'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    // The builder options, when the preset came from the builder; a hand-authored preset exports
    // without them and simply stays uneditable on the other side, exactly as it is here.
    let options = draft;
    if (!options) {
      try {
        options = JSON.parse(fs.readFileSync(path.join(presetDir, PRESET_OPTIONS_FILE), 'utf8'));
      } catch {}
    }

    /*
      Metadata from the manifest of a preset that was itself imported, so passing one on keeps its
      description and credit. Credit is opt-in and only ever comes from the preset's own files:
      nothing about the machine or the Windows account is stamped into a package the user shares.
    */
    let meta = {};
    try {
      const previous = JSON.parse(fs.readFileSync(path.join(presetDir, presetPackage.PRESET_PACKAGE_FILE), 'utf8'));
      meta = { author: previous.author, description: previous.description, version: previous.version, tags: previous.tags };
    } catch {}
    if (!meta.author && options && typeof options.author === 'string') meta.author = options.author;

    /*
      The sound the preset asks for, falling back to the one currently selected so a preset with no
      opinion still records what it was designed against. It travels with the package only when the
      user imported it: a bundled sound is already on every install, so naming it in the manifest is
      enough and avoids redistributing it.
    */
    const soundName = String((options && options.sound) || (getConfig()?.overlay?.notificationSound) || '');
    const userSound = soundName ? path.join(userSoundsDir(), soundName) : '';
    const sound = soundName ? { name: soundName, file: fs.existsSync(userSound) ? userSound : '' } : null;

    const out = presetPackage.exportPreset({
      presetDir,
      name: safe,
      destination: res.filePath,
      options,
      meta,
      sound,
      appVersion: app.getVersion(),
    });
    debug.log(`[preset-package] export ${safe}: ` + (out.ok ? out.file : out.error));
    return out;
  } catch (err) {
    debug.log('[preset-package] export failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  Import a package. Called twice for a name clash: the first call reports `duplicate` and changes
  nothing, then the renderer asks the user and calls back with the same `file` plus a policy.
*/
ipcMain.handle('import-preset', async (event, opts = {}) => {
  try {
    let file = typeof opts.file === 'string' ? opts.file : '';
    if (!file) {
      const res = await dialog.showOpenDialog({
        title: t('import-preset-title', 'Import preset', 'Importer un preset'),
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{ name: t('preset-package', 'AW preset package', 'Paquet de preset AW'), extensions: ['awpreset'] }],
      });
      if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
      file = res.filePaths[0];
    }

    const out = presetPackage.installPackage({
      file,
      presetsDir: usersPresetsDir(),
      soundsDir: userSoundsDir(),
      appVersion: app.getVersion(),
      duplicate: ['rename', 'replace'].includes(opts.duplicate) ? opts.duplicate : 'fail',
      reservedNames: [PREVIEW_PRESET_NAME],
      // A preset installed here wins over a bundled one of the same name, so importing "Shirow"
      // must ask rather than quietly hide the bundled Shirow behind a copy.
      takenNames: bundledPresetRoots().flatMap((root) => {
        try {
          return fs.readdirSync(root).filter((name) => fs.existsSync(path.join(root, name, 'index.html')));
        } catch {
          return [];
        }
      }),
    });
    if (out.ok) invalidateNotificationPresetFolders();
    debug.log('[preset-package] import ' + path.basename(file) + ': ' + (out.ok ? out.name : out.error));
    return { ...out, file };
  } catch (err) {
    debug.log('[preset-package] import failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  Importing a Steam Achievement Notifier theme: a one-way conversion into an ordinary generated
  preset (format/mapping/safety rules in util/sanImport.js). This side only drives the dialog and
  names the folders; nothing about SAN is consulted again once the preset exists.
*/
ipcMain.handle('import-san-theme', async (event, opts = {}) => {
  try {
    let file = typeof opts.file === 'string' ? opts.file : '';
    if (!file) {
      const res = await dialog.showOpenDialog({
        title: t('import-san-title', 'Import a Steam Achievement Notifier theme', 'Importer un theme Steam Achievement Notifier'),
        properties: ['openFile', 'dontAddToRecent'],
        // A .san file, the plain zip it is, or the usertheme.json inside a theme SAN already imported.
        filters: [{ name: t('san-theme', 'Steam Achievement Notifier theme', 'Theme Steam Achievement Notifier'), extensions: ['san', 'zip', 'json'] }],
      });
      if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
      file = res.filePaths[0];
    }

    const out = sanImport.installSanTheme({
      file,
      presetsDir: usersPresetsDir(),
      soundsDir: userSoundsDir(),
      imagesDir: userPresetImagesDir(),
      appVersion: app.getVersion(),
      duplicate: ['rename', 'replace'].includes(opts.duplicate) ? opts.duplicate : 'fail',
      reservedNames: [PREVIEW_PRESET_NAME],
      takenNames: bundledPresetRoots().flatMap((root) => {
        try {
          return fs.readdirSync(root).filter((name) => fs.existsSync(path.join(root, name, 'index.html')));
        } catch {
          return [];
        }
      }),
    });
    if (out.ok) invalidateNotificationPresetFolders();
    /*
      The whole report, not just the outcome. A user asking why their theme looks different has one
      dialog they may have clicked past; this is the only place the detail survives.
    */
    if (out.ok) {
      const list = (entries, label) => (entries || []).map((entry) => `${entry[label] || '?'}=${entry.code}`).join(', ') || 'none';
      debug.log(
        `[san-import] ${path.basename(file)} -> ${out.name} (SAN ${out.report.sanVersion || '?'}, preset ${out.report.sanPreset || '?'}); ` +
          `mapped ${(out.report.mapped || []).length}; skipped ${list(out.report.skipped, 'key')}; assets ${list(out.report.assets, 'name')}`
      );
    } else {
      debug.log('[san-import] ' + path.basename(file) + ': ' + out.error);
    }
    return { ...out, file };
  } catch (err) {
    debug.log('[san-import] failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

// List available notification sound files for the overlay sound dropdown (bundled + user-imported).
/*
  Artwork for a notification test that is not tied to a game.

  A test used to show the generic achievement badge and the app's own icon, which is the one thing a
  preview must not do: the whole point of testing a preset is to judge how it frames real artwork,
  and a flat placeholder hides exactly the problems (contrast over a bright cover, a cropped icon)
  that the test exists to reveal. So it borrows a game from the library the user already has.

  Returns {} when nothing is cached yet - the caller keeps its placeholder in that case.
*/
ipcMain.handle('notification-sample-art', async () => {
  try {
    const coversDir = path.join(userData, 'covers');
    const covers = new Map();
    try {
      for (const file of fs.readdirSync(coversDir)) {
        if (!/\.(?:png|jpe?g|webp)$/i.test(file)) continue;
        // Covers are stored as `<appid>.<ext>` or, once a pick has been re-downloaded,
        // `<appid>-<digest>.<ext>`. Keying on the whole basename made every digest-suffixed file
        // invisible to this lookup, so a library full of covers could still answer "no artwork".
        const appid = file.replace(/\.[^.]+$/, '').replace(/-[a-f0-9]+$/i, '');
        if (!covers.has(appid)) covers.set(appid, path.join(coversDir, file));
      }
    } catch {}
    if (covers.size === 0) return {};

    /*
      Prefer a game the index can name. A preview that shows one game's cover while the line above it
      reads "Sample Game" is worse than either on its own, so the name and the artwork have to come
      from the same entry - and only the index has both.
    */
    let named = [];
    try {
      const index = JSON.parse(fs.readFileSync(path.join(userData, 'cfg', 'gameIndex.json'), 'utf8'));
      named = Object.values(index).filter((game) => game && game.appid && game.name && covers.has(String(game.appid)));
    } catch {}

    const keys = [...covers.keys()];
    const pick = named.length
      ? named[Math.floor(Math.random() * named.length)]
      : { appid: keys[Math.floor(Math.random() * keys.length)], name: '' };
    const appid = String(pick.appid);
    const cover = covers.get(appid);
    // The wide header reads better as a preset background. The thumbnail goes through the shared
    // square-logo resolver rather than handing the raw 2:3 cover over: this sample feeds BOTH the
    // overlay preview and the Windows-notification test, so resolving it here is what keeps either
    // of them from framing artwork no real notification would show.
    const header = path.join(userData, 'steam_cache', 'icon', appid, 'header.jpg');
    const image = fs.existsSync(header) ? header : cover;
    const icon = (await resolveSquareGameLogo(appid, pick.name || '', [cover, image]).catch(() => '')) || cover;
    return { appid, name: pick.name || '', icon, image };
  } catch {
    return {};
  }
});

/*
  The pictures the designer can offer as a preset background. Absolute paths come back too: the
  preview renders inside a srcdoc frame, where nothing resolves relative to a preset folder, so the
  renderer inlines the file it picked as a data URI.
*/
ipcMain.handle('list-preset-images', async () => {
  try {
    return fs
      .readdirSync(userPresetImagesDir())
      .filter((name) => presetSchema.ASSET_RE.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, file: path.join(userPresetImagesDir(), name) }));
  } catch {
    return [];
  }
});

// Copy a user-picked image into that folder and hand back the name the preset will use. Same
// no-clobber rule as import-sound: a different file of the same name lands beside it.
ipcMain.handle('import-preset-image', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: t('choose-preset-image', 'Choose a background image', 'Choisir une image de fond'),
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
    const src = res.filePaths[0];
    const dir = userPresetImagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(src);
    const stem = path.basename(src, ext);
    let base = stem + ext;
    if (!presetSchema.ASSET_RE.test(base)) return null;
    let dest = path.join(dir, base);
    let i = 1;
    while (fs.existsSync(dest)) {
      try {
        if (fs.readFileSync(dest).equals(fs.readFileSync(src))) return base;
      } catch {}
      base = `${stem} (${i++})${ext}`;
      if (!presetSchema.ASSET_RE.test(base)) return null;
      dest = path.join(dir, base);
    }
    fs.copyFileSync(src, dest);
    return base;
  } catch (err) {
    debug.log('[preset-image] ' + (err.message || err));
    return null;
  }
});

ipcMain.handle('list-sounds', async () => {
  const set = new Set();
  for (const { name } of notificationSounds.listSoundFiles([path.join(__dirname, '../sounds'), userSoundsDir()])) set.add(name);
  return [...set].sort((a, b) => a.localeCompare(b));
});

// User themes: *.css from <userData>\themes (Settings > General > Theme).
ipcMain.handle('list-user-themes', async () =>
  userThemes.listUserThemes(userData).map((t) => ({ name: t.name, file: t.file, css: userThemes.readThemeFile(t.file) }))
);

// Resolve the active theme into CSS for the main window and the overlay.
ipcMain.handle('get-theme-payload', (event, name) => currentThemePayload(name));

// Persist the Custom theme (per-layer colors + optional images) and return the
// fresh payload so the renderer can re-apply it live.
// `intoDir` is where the generated copies are written; an imported theme keeps its own, inside its
// own folder, so deleting the theme takes them with it and an export never sees them. The work is
// in util/themeBlur.js because the gallery renderer has to produce exactly the same copies.
function prepareThemeBlurImages(theme, intoDir) {
  return themeBlur.prepareThemeBlurImages(theme, intoDir || themeLayers.themeImagesDir(userData), { log: (line) => debug.log(line) });
}

/*
  `request` is either the bare layer model (what older callers sent) or `{ theme, name }`. The name
  is what the picker shows and what an export is called, so it travels with the model rather than
  through a channel of its own; leaving it out keeps whatever name is already on disk.
*/
ipcMain.handle('save-custom-theme', async (event, request) => {
  const asked = request && typeof request === 'object' && request.theme ? request : { theme: request };
  const clean = themeLayers.saveCustomTheme(userData, asked.theme, asked.name);
  await prepareThemeBlurImages(clean);
  themeLayers.saveCustomTheme(userData, clean); // persist generated blur paths, keeping the name
  return { ...themeLayers.themePayload(userData, 'custom', clean, ''), customName: themeLayers.loadCustomThemeName(userData) };
});

// What the Custom theme is called, so the editor's name field opens on it.
ipcMain.handle('get-custom-theme-name', async () => themeLayers.loadCustomThemeName(userData));

/*
  The stylesheet for a theme that is being edited but not saved.

  Every theme is editable now, so the editor needs to show a draft over a built-in or over somebody
  else's theme without writing anything - this builds exactly what `save-custom-theme` would return
  and stores nothing. The blur and veil copies ARE generated, because they are derived from the
  image and the effect settings rather than from the theme: without them a layer set to blur would
  preview a sharp picture and the draft would lie about what saving it would look like. They land in
  the shared image folder, keyed by content, so a draft that is abandoned leaves a file the next
  theme using that picture reuses rather than a file nothing can account for.
*/
ipcMain.handle('preview-theme-model', async (event, theme) => {
  const clean = themeLayers.sanitizeCustomTheme(theme);
  const prepared = await prepareThemeBlurImages(clean);
  return themeLayers.themePayload(userData, 'custom', prepared, '');
});

// Pick a background image for one Custom-theme layer: copy the file into
// <userData>/theme-images (stable location, survives source-file moves) and
// return the stored absolute path. Returns null when the user cancels.
ipcMain.handle('pick-theme-image', async (event, layer) => {
  try {
    const allowed = themeLayers.IMAGE_LAYER_IDS.includes(layer) ? layer : null;
    if (!allowed) return { ok: false, error: 'invalid-layer' };
    const res = await dialog.showOpenDialog({
      title: t('choose-theme-image', 'Choose a background image', 'Choisir une image de fond'),
      properties: ['openFile', 'dontAddToRecent'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] },
      ],
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
    const src = res.filePaths[0];
    const dir = themeLayers.themeImagesDir(userData);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(src).toLowerCase() || '.png';
    const stem = path.basename(src, ext).replace(/[^a-z0-9-_]/gi, '_').slice(0, 48) || 'image';
    // Adopt any stored copy with identical bytes, no matter which layer imported it first. The old
    // check only compared against the name THIS layer would use, so one wallpaper applied to several
    // layers was stored once per layer.
    const shared = themeImages.findByContent(dir, src);
    if (shared) {
      debug.log(`[theme-image] ${layer} <- ${shared} (reused)`);
      return { ok: true, layer, file: shared };
    }
    let dest = path.join(dir, `${layer}-${stem}${ext}`);
    let i = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(dir, `${layer}-${stem} (${i++})${ext}`);
    }
    fs.copyFileSync(src, dest);
    debug.log(`[theme-image] ${layer} <- ${dest}`);
    return { ok: true, layer, file: dest };
  } catch (err) {
    debug.log(`[theme-image] failed: ${err.message || err}`);
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  Portable application themes (.awtheme): export, preview, import, delete. The format lives in
  util/themePackage.js; this side only resolves what "the current theme" means, drives the file
  dialogs and generates the blur copies an imported theme needs on this machine.
*/

// Names an import may not take because the dropdown already offers them: every built-in, plus
// whatever CSS themes are in <userData>\themes.
function takenThemeNames() {
  const names = Object.keys(themeLayers.BUILTIN_COLORS);
  try {
    for (const theme of userThemes.listUserThemes(userData)) names.push(theme.name);
  } catch {}
  return names;
}

// The layer model behind a stored theme value, or null when that value has no model - which is
// only ever a `user:` stylesheet, the one kind of theme this format deliberately cannot carry.
function themeModelFor(value) {
  const name = String(value || 'default');
  if (name === 'custom') {
    // The name the user gave it, so an export is called what the picker calls it rather than the
    // word "Custom" every custom theme would otherwise share.
    return { theme: themeLayers.loadCustomTheme(userData), base: 'custom', name: themeLayers.loadCustomThemeName(userData), meta: {} };
  }
  const pack = userThemes.parsePackValue(name);
  if (pack) {
    const installed = themePackage.readInstalledTheme(userData, pack);
    if (!installed) return null;
    const manifest = installed.manifest || {};
    return {
      theme: installed.theme,
      base: manifest.base || '',
      name: installed.name,
      // Credit survives a round trip, so passing on a theme somebody shared keeps their name on it.
      meta: { author: manifest.author, description: manifest.description, version: manifest.version, tags: manifest.tags },
    };
  }
  if (userThemes.parseValue(name)) return null;
  if (!Object.prototype.hasOwnProperty.call(themeLayers.BUILTIN_COLORS, name)) return null;
  return { theme: themePackage.themeFromBuiltin(name), base: name, meta: {} };
}

/*
  Export the theme a value names, under a name the caller gives. A built-in exports its palette, the
  Custom theme exports what the editor holds, and an imported theme re-exports as it stands.

  Nothing about this machine travels: util/themePackage.js copies each layer image in under a name
  built from the layer, and the manifest carries only what the user typed plus the app version.
*/
ipcMain.handle('export-theme', async (event, request) => {
  try {
    const asked = typeof request === 'string' ? { value: request } : request || {};
    const value = String(asked.value || (getConfig()?.general?.theme) || 'default');
    const model = themeModelFor(value);
    if (!model) {
      return { ok: false, error: userThemes.parseValue(value) ? 'css-theme-not-exportable' : 'theme-not-found' };
    }

    /*
      The theme's own name comes first, and the caller's fallback second: the Custom theme is called
      what the user typed into the editor, an imported one keeps the name it travelled under, and a
      built-in is named after its row in the picker. A custom theme with no name is not exported at
      all - the file would be called "Custom", which is every custom theme anyone has ever made.
    */
    const suggested = themePackage.sanitizeThemeName(model.name || asked.name || value.replace(/^pack:/i, ''));
    if (!suggested) return { ok: false, error: value === 'custom' ? 'theme-name-required' : 'invalid-name' };
    /*
      A theme may not travel under a name the picker already means something else by. It matters
      most for a built-in exported as itself: the file would install as "Nord" on somebody else's
      machine and shadow the Nord they already have. Renaming it is also the moment it stops being
      the built-in and becomes the exporter's own theme, which is what the manifest then says.
    */
    if (!userThemes.parsePackValue(value) && takenThemeNames().some((name) => name.toLowerCase() === suggested.toLowerCase())) {
      return { ok: false, error: 'reserved-name', name: suggested };
    }
    const res = await dialog.showSaveDialog({
      title: t('export-theme-title', 'Export theme', 'Exporter le theme'),
      defaultPath: suggested + themePackage.THEME_PACKAGE_EXTENSION,
      filters: [{ name: t('theme-package', 'AW theme package', 'Paquet de theme AW'), extensions: ['awtheme'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    const meta = { ...model.meta };
    for (const field of ['author', 'description', 'version']) {
      if (typeof asked[field] === 'string' && asked[field].trim()) meta[field] = asked[field];
    }
    if (Array.isArray(asked.tags) && asked.tags.length) meta.tags = asked.tags;

    const out = themePackage.exportTheme({
      theme: model.theme,
      name: suggested,
      destination: res.filePath,
      meta,
      base: model.base,
      appVersion: app.getVersion(),
    });
    debug.log(`[theme-package] export ${suggested}: ` + (out.ok ? out.file : out.error));
    return out;
  } catch (err) {
    debug.log('[theme-package] export failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  What a package would install, without installing it.

  The assets are unpacked into a throwaway folder so the preview can paint the real images, and
  that folder is the only thing an unapproved package ever writes: nothing reaches theme storage
  until the user says apply. One preview exists at a time, and the previous one is removed when the
  next starts, so a user clicking through several files cannot leave a pile behind.
*/
let themePreview = null;

function discardThemePreview() {
  if (!themePreview) return;
  try {
    fs.rmSync(themePreview.dir, { recursive: true, force: true });
  } catch {}
  themePreview = null;
}

ipcMain.handle('preview-theme', async (event, opts = {}) => {
  try {
    let file = typeof opts.file === 'string' ? opts.file : '';
    if (!file) {
      const res = await dialog.showOpenDialog({
        title: t('import-theme-title', 'Import theme', 'Importer un theme'),
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{ name: t('theme-package', 'AW theme package', 'Paquet de theme AW'), extensions: ['awtheme'] }],
      });
      if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
      file = res.filePaths[0];
    }

    const read = themePackage.readThemePackage(file, { appVersion: app.getVersion() });
    if (!read.ok) {
      debug.log('[theme-package] preview ' + path.basename(file) + ': ' + read.error);
      return { ...read, file };
    }

    discardThemePreview();
    const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'aw-theme-preview-'));
    const assets = path.join(dir, themePackage.ASSETS_DIR);
    fs.mkdirSync(assets, { recursive: true });
    for (const asset of read.assets) fs.writeFileSync(path.join(assets, asset.name), asset.data);
    themePreview = { dir, file };

    /*
      The blur and veil copies, in the throwaway folder. Without them a layer with an effect would
      preview from its source image and the frame would show a sharp wallpaper for a theme the app
      is about to blur heavily - which is the one thing a preview must not do.
    */
    const previewTheme = await prepareThemeBlurImages(
      themePackage.resolveInstalled(read.theme, dir),
      path.join(dir, themePackage.THEME_DERIVED_DIR)
    );

    return {
      ok: true,
      file,
      manifest: read.manifest,
      theme: previewTheme,
      bytes: read.bytes,
      installed: themePackage.listInstalledThemes(userData).some((t2) => t2.name.toLowerCase() === read.manifest.name.toLowerCase()),
    };
  } catch (err) {
    debug.log('[theme-package] preview failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('discard-theme-preview', async () => {
  discardThemePreview();
  return { ok: true };
});

/*
  Install a package. Called twice for a name clash: the first call reports `duplicate` and changes
  nothing, then the renderer asks the user and calls back with the same `file` plus a policy - the
  same two-step an .awpreset import uses.
*/
ipcMain.handle('import-theme', async (event, opts = {}) => {
  try {
    let file = typeof opts.file === 'string' ? opts.file : '';
    if (!file) {
      const res = await dialog.showOpenDialog({
        title: t('import-theme-title', 'Import theme', 'Importer un theme'),
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{ name: t('theme-package', 'AW theme package', 'Paquet de theme AW'), extensions: ['awtheme'] }],
      });
      if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
      file = res.filePaths[0];
    }

    const out = themePackage.installThemePackage({
      file,
      userDataPath: userData,
      appVersion: app.getVersion(),
      duplicate: ['rename', 'replace'].includes(opts.duplicate) ? opts.duplicate : 'fail',
      takenNames: takenThemeNames(),
    });
    if (!out.ok) {
      debug.log('[theme-package] import ' + path.basename(file) + ': ' + out.error);
      return { ...out, file };
    }

    /*
      The blur and veil copies a layer effect needs are generated here, once, from the image that
      travelled - never shipped, since they depend on nothing else. They live inside the theme's own
      folder, so removing the theme removes them too.
    */
    const dir = path.join(themePackage.themePackDir(userData), out.name);
    const theme = await prepareThemeBlurImages(out.theme, path.join(dir, themePackage.THEME_DERIVED_DIR));
    const stored = themePackage.saveInstalledTheme(userData, out.name, theme) || theme;

    discardThemePreview();
    debug.log(`[theme-package] import ${path.basename(file)}: ${out.name} (${out.assets} asset(s))`);
    return { ...out, file, theme: stored, value: userThemes.packValue(out.name) };
  } catch (err) {
    debug.log('[theme-package] import failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

/*
  The layer model behind any theme the picker offers, so the editor can open on the one that is
  selected rather than only on the Custom slot. A `user:` stylesheet is the one kind with no model -
  it is CSS somebody wrote, not colours - and answers null, which is how the editor knows to stay shut.
*/
ipcMain.handle('get-theme-model', async (event, value) => {
  const model = themeModelFor(String(value || 'default'));
  if (!model) return null;
  return { theme: model.theme, name: model.name || '', base: model.base || '', meta: model.meta || {} };
});

/*
  Save what the editor is holding as a theme of the user's own.

  It lands in the same storage an imported .awtheme installs into, so a saved theme is listed,
  selected, exported and deleted by the code that already does those things. Called twice for a name
  that is taken: the first call reports `duplicate` and writes nothing, then the renderer asks and
  calls back with `overwrite` - the same two-step as an import, and the reason saving under a new
  name leaves the theme you started from untouched.
*/
ipcMain.handle('save-theme-as', async (event, request = {}) => {
  try {
    const out = themePackage.saveThemeAs({
      userDataPath: userData,
      name: request.name,
      theme: request.theme,
      base: request.base,
      meta: request.meta,
      overwrite: request.overwrite === true,
      appVersion: app.getVersion(),
      // A saved theme may not take a name the picker already means something else by.
      reservedNames: takenThemeNames(),
    });
    if (!out.ok) {
      debug.log(`[theme-package] save ${request.name}: ${out.error}`);
      return out;
    }

    // The blur and veil copies live inside the theme's own folder, so removing it removes them too.
    const dir = path.join(themePackage.themePackDir(userData), out.name);
    const theme = await prepareThemeBlurImages(out.theme, path.join(dir, themePackage.THEME_DERIVED_DIR));
    const stored = themePackage.saveInstalledTheme(userData, out.name, theme) || theme;

    debug.log(`[theme-package] save ${out.name}: ${out.replaced ? 'replaced' : 'created'} (${out.assets} asset(s))`);
    return { ...out, theme: stored, value: userThemes.packValue(out.name) };
  } catch (err) {
    debug.log('[theme-package] save failed: ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});

// Every imported theme, for the Theme dropdown and the manage list.
ipcMain.handle('list-installed-themes', async () =>
  themePackage.listInstalledThemes(userData).map((theme) => ({ ...theme, value: userThemes.packValue(theme.name) }))
);

// Remove one, with its assets and its generated copies. The caller is responsible for moving the
// selection off it first; a theme that is gone resolves to the built-in look, not to a blank window.
ipcMain.handle('delete-installed-theme', async (event, name) => {
  const out = themePackage.deleteInstalledTheme(userData, typeof name === 'string' ? name : (name && name.name) || '');
  debug.log('[theme-package] delete ' + String(name) + ': ' + (out.ok ? 'removed' : out.error));
  return out;
});

app.on('will-quit', discardThemePreview);

// The overlay window only exists while a game is running, and it is torn down and rebuilt behind
// this file's back, so it is asked for per send rather than held.
function liveOverlayWindow() {
  const win = getOverlayWindow();
  if (!isOverlayVisible() || !win || win.isDestroyed() || win.webContents.isDestroyed()) return null;
  return win;
}

// Forward a theme change (Settings > General, or the Custom theme editor) to an
// already-open in-game overlay so it recolors without reopening.
ipcMain.on('theme-changed', (event, name) => {
  const overlayWindow = liveOverlayWindow();
  if (!overlayWindow) return;
  try {
    overlayWindow.webContents.send('overlay-theme', currentThemePayload(name));
  } catch (err) {
    debug.log(`[overlay-theme] broadcast failed: ${err.message || err}`);
  }
});

/*
  The same, for a theme being edited but not saved. `theme-changed` names a theme the main process
  can look up; a draft exists only in the editor, so the renderer hands over the payload it was just
  given rather than a name nothing would resolve. Nothing here reads it back or stores it: it is one
  hop to the overlay so the window being designed and the popup over the game agree.
*/
ipcMain.on('theme-preview', (event, payload) => {
  const overlayWindow = liveOverlayWindow();
  if (!overlayWindow) return;
  if (!payload || typeof payload !== 'object' || typeof payload.overlayCss !== 'string') return;
  try {
    overlayWindow.webContents.send('overlay-theme', payload);
  } catch (err) {
    debug.log(`[overlay-theme] preview failed: ${err.message || err}`);
  }
});

// Import a custom notification sound: copy a user-picked audio file into <userData>/sounds and return
// its (possibly de-duplicated) filename so the renderer can select it. Returns null on cancel/failure.
ipcMain.handle('import-sound', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: t('choose-a-notification-sound', 'Choose a notification sound', 'Choisir un son de notification'),
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'] }],
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
    const src = res.filePaths[0];
    const dir = userSoundsDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(src);
    const stem = path.basename(src, ext);
    let base = stem + ext;
    let dest = path.join(dir, base);
    // Don't clobber a different existing file of the same name - suffix " (n)".
    let i = 1;
    while (fs.existsSync(dest)) {
      try {
        if (fs.realpathSync(dest) === fs.realpathSync(src)) return base; // same file already imported
      } catch {}
      base = `${stem} (${i++})${ext}`;
      dest = path.join(dir, base);
    }
    fs.copyFileSync(src, dest);
    return base;
  } catch (err) {
    debug.log('[import-sound] ' + (err.message || err));
    return null;
  }
});

// Only the sounds the user imported, so Settings can offer to delete the one it is on: a bundled
// sound comes back with the app, a user one is the only file a delete would really destroy.
ipcMain.handle('list-user-sounds', async () => {
  try {
    return fs
      .readdirSync(userSoundsDir())
      .filter((name) => notificationSounds.SOUND_EXT_RE.test(name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return []; // no sounds folder yet: nothing was ever imported
  }
});

// Delete one imported sound. The name is a bare filename inside <userData>/sounds and nothing else:
// a bundled sound, a path or a traversal must not resolve, or Settings becomes a file deleter.
ipcMain.handle('delete-sound', async (event, name) => {
  const base = typeof name === 'string' ? name : '';
  if (!base || base !== path.basename(base) || !notificationSounds.SOUND_EXT_RE.test(base)) return { ok: false };
  try {
    fs.unlinkSync(path.join(userSoundsDir(), base));
    debug.log('[delete-sound] removed ' + base);
    return { ok: true, name: base };
  } catch (err) {
    debug.log('[delete-sound] ' + (err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
});
