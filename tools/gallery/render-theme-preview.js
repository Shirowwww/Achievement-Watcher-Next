'use strict';

/*
  Renders the picture a theme submission needs, from the theme itself.

  A theme is data, so there is nothing to photograph until something is drawn with it. This draws
  the fixed sample interface app/util/themeMock.js builds - our markup, our sample text, the
  theme's own generated stylesheet and its own images - and photographs it once.

    node tools/gallery/render-theme-preview.js <.awtheme or theme folder> [output.jpg]

  Everything a submission contributes is a colour, a number or a picture. The document has no
  script, scripting is switched off in the page anyway, DNS is mapped to nothing, and every request
  the page makes that is not a file inside its own unpacked folder is refused. The browser is
  whichever Chrome or Edge is installed; nothing is downloaded.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const appNodeModules = path.join(root, 'app', 'node_modules');

const { readThemePackage, resolveInstalled, ASSETS_DIR, THEME_DERIVED_DIR } = require(path.join(root, 'app', 'util', 'themePackage.js'));
const { buildThemeMock, DESIGN } = require(path.join(root, 'app', 'util', 'themeMock.js'));
const { prepareThemeBlurImages } = require(path.join(root, 'app', 'util', 'themeBlur.js'));
const { findBrowser } = require(path.join(__dirname, 'render-preview.js'));
const appVersion = require(path.join(root, 'app', 'package.json')).version;

// The frame the gallery card is designed around, and the size the sample is laid out for. Fixed and
// shared with the in-app preview, so every theme is judged at the same size, two renders of one
// file are the same picture, and what Settings shows is what a card promises.
const VIEWPORT = DESIGN;
const SCALE = 1.5;
// A theme picture is a photograph of a window, often over a wallpaper: PNG would be several
// megabytes of it, and there is no transparency to keep.
const FORMAT = { type: 'jpeg', quality: 82 };
const LAUNCH_TIMEOUT_MS = 30000;
const PAGE_TIMEOUT_MS = 20000;
// The mock has no script and no animation, so this is only there to let the layout settle.
const SETTLE_MS = 250;

function die(message) {
  console.error(message);
  process.exit(1);
}

/*
  Unpack a package into a temporary folder: the assets it carries, then the document that points at
  them. `readThemePackage` is the reader the app imports with, so this refuses exactly what an
  import would refuse, and it has already checked that every asset really is an image.
*/
async function unpack(file) {
  const read = readThemePackage(file, { appVersion });
  if (!read.ok) throw new Error(`The theme was refused: ${read.error}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-render-'));
  fs.mkdirSync(path.join(dir, ASSETS_DIR), { recursive: true });
  for (const asset of read.assets) fs.writeFileSync(path.join(dir, ASSETS_DIR, asset.name), asset.data);

  /*
    The blur and veil copies the app would make on import, made here too. A package never carries
    them - they are derived from the image and the effect settings, both of which travel - so
    skipping this would photograph a sharp wallpaper for a theme that installs blurred.
  */
  const theme = await prepareThemeBlurImages(resolveInstalled(read.theme, dir), path.join(dir, THEME_DERIVED_DIR));

  const document = path.join(dir, 'mock.html');
  fs.writeFileSync(document, buildThemeMock(theme), 'utf8');
  return { dir, document, manifest: read.manifest };
}

/*
  One photograph. The gallery server calls this for every submission, which is why it returns
  instead of exiting: a theme it refuses is one rejected upload, not the end of the process.
*/
async function renderThemePreview(options) {
  const source = path.resolve(options.source);
  if (!fs.existsSync(source)) throw new Error(`${source} does not exist`);

  const packed = fs.statSync(source).isFile();
  const unpacked = packed ? await unpack(source) : { dir: source, document: path.join(source, 'mock.html') };

  try {
    if (!fs.existsSync(unpacked.document)) throw new Error(`${unpacked.document} is missing`);

    const executablePath = options.browser || findBrowser();
    if (!executablePath) throw new Error('No Chrome or Edge was found. Set AW_BROWSER to the browser executable.');

    const puppeteer = require(path.join(appNodeModules, 'puppeteer-core'));
    const output = path.resolve(options.output);
    // Every URL the page is allowed to load lives under here, so the check is one prefix compare.
    const allowedPrefix = pathToFileURL(unpacked.dir.endsWith(path.sep) ? unpacked.dir : `${unpacked.dir}${path.sep}`).href;

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      timeout: LAUNCH_TIMEOUT_MS,
      protocolTimeout: PAGE_TIMEOUT_MS * 2,
      args: [
        '--force-color-profile=srgb',
        '--hide-scrollbars',
        '--disable-gpu',
        // Nothing on this page is meant to reach the network. Resolving every name to nothing
        // means a request that somehow got past the filter below still cannot leave the machine.
        '--host-resolver-rules=MAP * ~NOTFOUND',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        // A ceiling on what one render may allocate, so a hostile picture cannot take the service
        // down with it.
        '--js-flags=--max-old-space-size=192',
      ].concat(options.args || []),
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
      // The document carries no script and is not supposed to run one. Turning scripting off in
      // the page is the belt to the policy's braces, and it also makes the render deterministic.
      await page.setJavaScriptEnabled(false);

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url.startsWith(allowedPrefix)) return void request.continue();
        request.abort().catch(() => {});
      });

      await page.setViewport({ width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: SCALE });
      await page.goto(pathToFileURL(unpacked.document).href, { waitUntil: 'load' });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

      fs.mkdirSync(path.dirname(output), { recursive: true });
      await page.screenshot({ path: output, ...FORMAT });
    } finally {
      await browser.close().catch(() => {});
    }

    return {
      path: output,
      width: VIEWPORT.width * SCALE,
      height: VIEWPORT.height * SCALE,
      bytes: fs.statSync(output).size,
      manifest: unpacked.manifest || null,
    };
  } finally {
    if (packed) fs.rmSync(unpacked.dir, { recursive: true, force: true });
  }
}

async function main() {
  const target = process.argv[2];
  if (!target) die('Usage: node tools/gallery/render-theme-preview.js <.awtheme or theme folder> [output.jpg]');

  const output = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(process.cwd(), 'theme-preview.jpg');
  const result = await renderThemePreview({ source: target, output });
  console.log(`${path.relative(process.cwd(), result.path)}: ${result.width}x${result.height}, ${Math.round(result.bytes / 1024)} KB`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
}

module.exports = { renderThemePreview, VIEWPORT, SCALE, FORMAT };
