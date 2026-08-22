'use strict';

/*
  Renders the preview image a gallery submission needs, from the preset itself.

  A submission has to carry a picture of the popup, and taking one by hand means catching a popup
  that is on screen for six seconds. This renders it instead: the preset's own page is loaded in a
  browser already installed on the machine, given the same stand-in bridge the website uses, and
  photographed once the entry animation has settled. The result is the popup as the app draws it,
  on transparency, at twice its own size.

    node tools/gallery/render-preview.js <preset folder or .awpreset> [output.png] [--state rare]

  States: normal (default), rare, platinum, progress.

  The browser is whichever Chrome or Edge is installed; nothing is downloaded. A package is
  unpacked into a temporary folder, rendered, and the folder is removed afterwards. Rendering runs
  the preset's own script, so do this with a preset you wrote or one you have read.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const appNodeModules = path.join(root, 'app', 'node_modules');

// The popup is drawn centred in the viewport, so the frame is its own size plus room for the glow
// and the shadow to fall into.
const MARGIN = { x: 60, y: 50 };
const SCALE = 2;
const SETTLE_MS = 1400;

function die(message) {
  console.error(message);
  process.exit(1);
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function findBrowser() {
  if (process.env.AW_BROWSER && fs.existsSync(process.env.AW_BROWSER)) return process.env.AW_BROWSER;

  try {
    const { Launcher } = require(path.join(appNodeModules, 'chrome-launcher'));
    const installs = Launcher.getInstallations();
    if (installs && installs.length) return installs[0];
  } catch {
    /* fall through to the well known locations */
  }

  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  return candidates.find((file) => fs.existsSync(file)) || '';
}

// The preset page waits for the app's notification bridge. This is the same stand-in the website
// injects, reduced to what one still photograph needs.
function bridge(state) {
  return `
    (function () {
      var ICON = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#3f5da8"/>' +
        '<path fill="#fff" d="M20 14h24v5c0 1.6 1.3 2 2.6 1.6l3.4-1v6.6c0 4.4-3.6 8-8 8h-.6A12 12 0 0 1 34 40v5h5.5c1.4 0 2.5 1.1 2.5 2.5V50H22v-2.5c0-1.4 1.1-2.5 2.5-2.5H30v-5a12 12 0 0 1-7.4-5.8H22c-4.4 0-8-3.6-8-8v-6.6l3.4 1C18.7 21 20 20.6 20 19v-5Z"/></svg>');
      var ART = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 430"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#122a52"/><stop offset="0.55" stop-color="#3b2a6b"/><stop offset="1" stop-color="#7a3b6a"/></linearGradient></defs>' +
        '<rect width="920" height="430" fill="url(#s)"/><path d="M0 330 L180 232 L330 300 L520 190 L700 268 L920 168 L920 430 L0 430 Z" fill="#0b1120" opacity="0.72"/></svg>');
      var STATES = ${JSON.stringify({
        normal: { displayName: 'First Light', description: 'Reach the summit before dawn.', gameName: 'Achievement Watcher Next', rarityPercent: null },
        rare: { displayName: 'No Witnesses', description: 'Finish the heist without an alarm.', gameName: 'Achievement Watcher Next', rarityPercent: 1.4 },
        platinum: { displayName: 'Completionist', description: 'Every achievement unlocked.', gameName: 'Achievement Watcher Next', notificationType: 'platinum', isPlatinum: true, rarityPercent: null },
        progress: { displayName: 'Collector', description: 'Recover the scattered relics.', gameName: 'Achievement Watcher Next', notificationType: 'progress', progress: { current: 34, max: 50, percent: 68 } },
      })};
      var payload = STATES[${JSON.stringify(state)}] || STATES.normal;
      payload.iconPath = ICON;
      payload.imagePath = ART;
      payload.scale = 1;
      window.api = {
        onNotification: function (callback) { setTimeout(function () { callback(payload); }, 0); },
        notificationRenderReady: function () {},
        closeNotificationWindow: function () {},
      };
    })();
  `;
}

function presetSize(html) {
  const meta = /<meta\s+width="(\d+)"\s+height="(\d+)"/i.exec(html);
  return { width: Number((meta && meta[1]) || 474), height: Number((meta && meta[2]) || 136) };
}

// A package is read through the app's own reader before anything is written out, so this refuses
// exactly what an import would refuse.
function unpack(file) {
  const AdmZip = require(path.join(appNodeModules, 'adm-zip'));
  const { readPackage } = require(path.join(root, 'app', 'util', 'presetPackage.js'));
  const appVersion = require(path.join(root, 'app', 'package.json')).version;

  const read = readPackage(file, { appVersion });
  if (!read.ok) throw new Error(`The package was refused: ${read.error}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-preview-'));
  const zip = new AdmZip(file);
  for (const entry of zip.getEntries()) {
    const name = String(entry.entryName).replace(/\\/g, '/');
    if (entry.isDirectory || !name.startsWith('preset/')) continue;
    const out = path.join(dir, name.slice('preset/'.length));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, entry.getData());
  }
  return dir;
}

/*
  One photograph, from a package or from an unpacked preset folder. The gallery server calls this
  for every submission, which is why it returns instead of exiting: a package it refuses is one
  rejected upload, not the end of the process.
*/
async function renderPreview(options) {
  const source = path.resolve(options.source);
  if (!fs.existsSync(source)) throw new Error(`${source} does not exist`);

  const packed = fs.statSync(source).isFile();
  const presetDir = packed ? unpack(source) : source;

  try {
    const entry = path.join(presetDir, 'index.html');
    if (!fs.existsSync(entry)) throw new Error(`${entry} is missing`);

    const executablePath = options.browser || findBrowser();
    if (!executablePath) throw new Error('No Chrome or Edge was found. Set AW_BROWSER to the browser executable.');

    const puppeteer = require(path.join(appNodeModules, 'puppeteer-core'));
    const size = presetSize(fs.readFileSync(entry, 'utf8'));
    const viewport = { width: size.width + MARGIN.x * 2, height: size.height + MARGIN.y * 2 };
    const output = path.resolve(options.output);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      timeout: 30000,
      protocolTimeout: 60000,
      args: ['--force-color-profile=srgb', '--hide-scrollbars'].concat(options.args || []),
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: SCALE });
      await page.evaluateOnNewDocument(bridge(options.state || 'normal'));
      await page.goto(`file:///${entry.replace(/\\/g, '/')}`, { waitUntil: 'load' });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await page.screenshot({ path: output, omitBackground: true });
    } finally {
      await browser.close().catch(() => {});
    }

    return { path: output, width: viewport.width * SCALE, height: viewport.height * SCALE, bytes: fs.statSync(output).size };
  } finally {
    if (packed) fs.rmSync(presetDir, { recursive: true, force: true });
  }
}

async function main() {
  const target = process.argv[2];
  if (!target) die('Usage: node tools/gallery/render-preview.js <preset folder or .awpreset> [output.png] [--state rare]');

  const output = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(process.cwd(), 'preview.png');
  const result = await renderPreview({ source: target, output, state: argValue('state', 'normal') });

  console.log(`${path.relative(process.cwd(), result.path)}: ${result.width}x${result.height}, ${Math.round(result.bytes / 1024)} KB`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
}

module.exports = { renderPreview, findBrowser, presetSize, MARGIN, SCALE };
