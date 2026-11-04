'use strict';

/*
  Draws the picture of every bundled preset that ships with the app, so the preset gallery has one
  to show at once while the user's own (their language, their covers) is drawn:

    app/presets/{Default,Users} Presets/*   -> app/resources/presetPictures/<slug>.png + manifest.json

  Each picture is the gallery's plain unlock in English with no cover art, rendered offscreen by the
  app's own code (presetInsets.render) in Electron. The manifest records each preset's content
  signature: a picture whose preset changed since is never shown. `--check` proves every bundled
  preset has a current picture, without Electron, so a test can run it.

    node tools/presets/build-pictures.js
    node tools/presets/build-pictures.js --check
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const { contentSignature } = require(path.join(appDir, 'util', 'presetSignature.js'));
const { SHIPPED_DIR } = require(path.join(appDir, 'util', 'pictureCache.js'));
const PRESET_ROOTS = ['Default Presets', 'Users Presets'].map((name) => path.join(appDir, 'presets', name));
const MANIFEST = path.join(SHIPPED_DIR, 'manifest.json');
// The size every preset page states in its <meta width height>, as the app reads it.
const META_SIZE = /<meta\s+width\s*=\s*"(\d+)"\s+height\s*=\s*"(\d+)"\s*\/?>/i;
const DEFAULT_SIZE = { width: 400, height: 200 };

const slugify = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
// The name the app looks a shipped picture up by: the folder's path from app/.
const nameOf = (folder) => path.relative(appDir, folder).split(path.sep).join('/');

function bundledPresets() {
  const presets = [];
  for (const dir of PRESET_ROOTS) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const folder = path.join(dir, entry.name);
      if (entry.isDirectory() && fs.existsSync(path.join(folder, 'index.html'))) presets.push({ folder, name: nameOf(folder), file: `${slugify(entry.name)}.png` });
    }
  }
  const files = presets.map((preset) => preset.file);
  const clash = files.find((file, index) => files.indexOf(file) !== index);
  if (clash) throw new Error(`two bundled presets would both be ${clash}`);
  return presets.sort((a, b) => a.name.localeCompare(b.name));
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).pictures || {};
  } catch {
    return {};
  }
}

// What is missing, stale or left over; empty when the shipped pictures match the presets.
function check() {
  const pictures = readManifest();
  const problems = [];
  const presets = bundledPresets();
  for (const preset of presets) {
    const entry = pictures[preset.name];
    if (!entry) problems.push(`${preset.name}: no picture`);
    else if (entry.signature !== contentSignature([preset.folder])) problems.push(`${preset.name}: drawn from older files`);
    else if (!fs.existsSync(path.join(SHIPPED_DIR, entry.file))) problems.push(`${preset.name}: ${entry.file} is missing`);
  }
  const names = new Set(presets.map((preset) => preset.name));
  for (const name of Object.keys(pictures)) if (!names.has(name)) problems.push(`${name}: no such bundled preset`);
  const files = new Set(Object.values(pictures).map((entry) => entry.file));
  if (fs.existsSync(SHIPPED_DIR)) {
    for (const file of fs.readdirSync(SHIPPED_DIR)) if (file.endsWith('.png') && !files.has(file)) problems.push(`${file}: in no entry`);
  }
  return problems;
}

// The gallery's plain unlock in English, as notificationPagePayload() hands it to a preset page.
function galleryPayload() {
  const english = JSON.parse(fs.readFileSync(path.join(appDir, 'locale', 'lang', 'english.json'), 'utf8')).dialogs || {};
  const rarityTiers = require(path.join(appDir, 'util', 'rarityTiers.js'));
  return {
    displayName: english['test-toast-name'] || 'Achievement Unlocked',
    description: english['preset-sample-detail'] || 'Sample achievement description',
    gameName: english['preset-sample-game'] || 'Sample Game',
    hidden: false,
    bare: false,
    rarityTier: '',
    rarityMode: rarityTiers.gradingFrom(undefined).mode,
    rarityGrade: '',
    notificationType: 'achievement',
    isPlatinum: false,
    realPlatinum: false,
    iconPath: path.join(appDir, 'resources', 'img', 'achievement.svg'),
    gameIconPath: '',
    imagePath: '',
    headerPath: '',
    progress: null,
    scale: 1,
  };
}

async function render() {
  const { app } = require('electron');
  const { insertSegoeFallback } = require(path.join(appDir, 'util', 'segoeFallback.js'));
  const { createPresetInsets } = require(path.join(appDir, 'electron', 'presetInsets.js'));
  // The same pictures whatever the screen the script runs on.
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  // Each picture closes its window; Electron would quit after the first one.
  app.on('window-all-closed', () => {});
  await app.whenReady();
  const scratch = fs.mkdtempSync(path.join(app.getPath('temp'), 'aw-preset-pictures-'));
  const insets = createPresetInsets({
    cacheFile: path.join(scratch, 'presetInsets.json'),
    preloadPath: path.join(appDir, 'notificationPreload.js'),
    imagePath: path.join(appDir, 'resources', 'img', 'avatar.png'),
    dimensions: (folder) => {
      const match = META_SIZE.exec(fs.readFileSync(path.join(folder, 'index.html'), 'utf8'));
      return match ? { width: Number(match[1]), height: Number(match[2]) } : DEFAULT_SIZE;
    },
    prepare: (win) => {
      win.webContents.once('dom-ready', () => insertSegoeFallback(win.webContents));
      return Promise.resolve();
    },
    log: (line) => process.stderr.write(`${line}\n`),
  });
  const payload = galleryPayload();
  const pictures = {};
  const drawn = [];
  let total = 0;
  // Every picture is drawn before the shipped folder is touched: a preset that fails leaves the old set whole.
  for (const preset of bundledPresets()) {
    const shot = await insets.render(preset.folder, null, payload);
    if (!shot || !String(shot.image).startsWith('data:image/png;base64,')) throw new Error(`${preset.name}: nothing was drawn`);
    const png = Buffer.from(shot.image.slice('data:image/png;base64,'.length), 'base64');
    drawn.push({ file: preset.file, png });
    total += png.length;
    pictures[preset.name] = { signature: contentSignature([preset.folder]), file: preset.file, width: shot.width, height: shot.height, card: shot.card };
    process.stdout.write(`${preset.name}: ${Math.round(png.length / 1024)} KB\n`);
  }
  fs.rmSync(SHIPPED_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHIPPED_DIR, { recursive: true });
  for (const { file, png } of drawn) fs.writeFileSync(path.join(SHIPPED_DIR, file), png);
  const note = 'Generated by tools/presets/build-pictures.js. Run it again after changing a bundled preset.';
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ note, pictures }, null, 2)}\n`);
  fs.rmSync(scratch, { recursive: true, force: true });
  process.stdout.write(`${Object.keys(pictures).length} pictures, ${Math.round(total / 1024)} KB\n`);
}

function main() {
  if (process.argv.includes('--check')) {
    const problems = check();
    if (problems.length) {
      process.stderr.write(`Shipped preset pictures are out of date. Run: node tools/presets/build-pictures.js\n  ${problems.join('\n  ')}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (process.versions.electron) {
    render()
      .catch((err) => {
        process.stderr.write(`${err.stack || err}\n`);
        process.exitCode = 1;
      })
      .finally(() => require('electron').app.quit());
    return;
  }
  // Under plain Node: run this same file in the app's Electron, which alone can draw a page.
  const electron = require(path.join(appDir, 'node_modules', 'electron'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(electron, [__filename], { stdio: 'inherit', env });
  process.exitCode = result.status === null ? 1 : result.status;
}

// Electron runs this file as its app entry, where require.main is not this module.
if (require.main === module || process.versions.electron) main();

module.exports = { check, bundledPresets };
