'use strict';

/*
  The renderer that draws a theme's picture for the gallery (skipped with no Chromium browser). The
  gallery keeps a rendered picture under the checksum of its package, so the same file must always
  produce the same bytes. The other half is what the render is allowed to do: scripting is off, DNS
  resolves to nothing, and every request outside the package's own unpacked folder is refused.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { findBrowsers } = require('../helpers/chromium');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const { renderThemePreview, VIEWPORT, SCALE } = require(path.join(root, 'tools', 'gallery', 'render-theme-preview.js'));
const { exportTheme } = require(path.join(appDir, 'util', 'themePackage.js'));
const { defaultCustomTheme } = require(path.join(appDir, 'util', 'themeLayers.js'));
const { imageInfo } = require(path.join(appDir, 'util', 'imageSize.js'));
const appVersion = require(path.join(appDir, 'package.json')).version;

const COMMITTED = path.join(root, 'docs', 'gallery', 'themes', 'community', 'slate-mint.awtheme');

function png(width, height) {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-render-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the same theme always renders the same picture', { concurrency: 1, timeout: 300000 }, async (t) => {
  if (!findBrowsers().length) {
    t.skip('no Chromium-family browser installed');
    return;
  }
  const dir = scratch(t);
  const first = path.join(dir, 'first.jpg');
  const second = path.join(dir, 'second.jpg');

  const a = await renderThemePreview({ source: COMMITTED, output: first });
  const b = await renderThemePreview({ source: COMMITTED, output: second });

  assert.deepEqual(fs.readFileSync(first), fs.readFileSync(second), 'two renders of one file differ');
  assert.equal(a.width, VIEWPORT.width * SCALE);
  assert.equal(a.height, VIEWPORT.height * SCALE);
  assert.deepEqual({ width: a.width, height: a.height }, { width: b.width, height: b.height });

  const image = imageInfo(fs.readFileSync(first));
  assert.equal(image.type, 'jpeg', 'the gallery serves a photograph, not a transparent PNG');
  assert.equal(image.width, VIEWPORT.width * SCALE);
  assert.equal(image.height, VIEWPORT.height * SCALE);
});

test('a theme with an image renders that image, and one without still renders', { concurrency: 1, timeout: 300000 }, async (t) => {
  if (!findBrowsers().length) {
    t.skip('no Chromium-family browser installed');
    return;
  }
  const dir = scratch(t);

  // A real one-colour PNG, so the render has something unmistakable to show.
  const image = path.join(dir, 'wall.png');
  fs.writeFileSync(
    image,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP8z8DAxIAEmJAZAB0EAQGnLnrCAAAAAElFTkSuQmCC', 'base64')
  );

  const withImage = defaultCustomTheme();
  withImage.bg.image = image;
  withImage.bg.fit = 'cover';
  const packedWithImage = path.join(dir, 'with-image.awtheme');
  assert.equal(exportTheme({ theme: withImage, name: 'With Image', destination: packedWithImage, appVersion }).ok, true);

  const plain = path.join(dir, 'plain.awtheme');
  assert.equal(exportTheme({ theme: defaultCustomTheme(), name: 'Plain', destination: plain, appVersion }).ok, true);

  const rendered = await renderThemePreview({ source: packedWithImage, output: path.join(dir, 'with-image.jpg') });
  const bare = await renderThemePreview({ source: plain, output: path.join(dir, 'plain.jpg') });

  assert.ok(rendered.bytes > 0 && bare.bytes > 0);
  assert.notDeepEqual(
    fs.readFileSync(path.join(dir, 'with-image.jpg')),
    fs.readFileSync(path.join(dir, 'plain.jpg')),
    'the bundled image made no difference to the picture'
  );
});

/*
  A package never carries the blur/veil copies an effect is drawn from - they are derived from the
  image and effect settings, both of which travel - so the renderer has to make them like the app
  does. It did not at first, and the gallery photographed a sharp wallpaper for a heavily blurred theme.
*/
test('an effect is really applied, not left for the app to do later', { concurrency: 1, timeout: 300000 }, async (t) => {
  if (!findBrowsers().length) {
    t.skip('no Chromium-family browser installed');
    return;
  }
  const dir = scratch(t);

  // A picture with hard edges, so a blur over it changes the bytes unmistakably.
  const sharp = require(path.join(appDir, 'node_modules', 'sharp'));
  const size = 256;
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    const on = Math.floor((i % size) / 8) % 2 === 0;
    pixels[i * 3] = on ? 250 : 10;
    pixels[i * 3 + 1] = on ? 60 : 90;
    pixels[i * 3 + 2] = on ? 140 : 240;
  }
  const image = path.join(dir, 'stripes.png');
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toFile(image);

  const pack = (name, effect) => {
    const theme = defaultCustomTheme();
    theme.bg.image = image;
    theme.bg.fit = 'cover';
    if (effect) theme.bg.effect = { enabled: true, type: 'blur', color: '#000000', opacity: 40, blur: 34, blurImage: '', ...effect };
    const file = path.join(dir, `${name}.awtheme`);
    assert.equal(exportTheme({ theme, name, destination: file, appVersion }).ok, true);
    return file;
  };

  const sharpPack = pack('sharp-theme', null);
  const blurredPack = pack('blurred-theme', {});

  await renderThemePreview({ source: sharpPack, output: path.join(dir, 'sharp.jpg') });
  await renderThemePreview({ source: blurredPack, output: path.join(dir, 'blurred.jpg') });

  const asSharp = fs.readFileSync(path.join(dir, 'sharp.jpg'));
  const asBlurred = fs.readFileSync(path.join(dir, 'blurred.jpg'));
  assert.ok(!asSharp.equals(asBlurred), 'the blur effect made no difference to the picture');
  // A blurred wallpaper has far less high-frequency detail, so it compresses much smaller.
  assert.ok(asBlurred.length < asSharp.length * 0.9, `the blurred render is ${asBlurred.length} bytes against ${asSharp.length}, which is not a blur`);
});

test('a package the app would refuse is refused here too, without starting a browser', { concurrency: 1, timeout: 60000 }, async (t) => {
  const dir = scratch(t);
  const broken = path.join(dir, 'broken.awtheme');
  fs.writeFileSync(broken, 'not a zip at all');

  await assert.rejects(() => renderThemePreview({ source: broken, output: path.join(dir, 'out.jpg') }), /refused/);
  assert.equal(fs.existsSync(path.join(dir, 'out.jpg')), false);

  await assert.rejects(() => renderThemePreview({ source: path.join(dir, 'absent.awtheme'), output: path.join(dir, 'out.jpg') }), /does not exist/);
});

test('the renderer is given no way out to the network', () => {
  const source = fs.readFileSync(path.join(root, 'tools', 'gallery', 'render-theme-preview.js'), 'utf8');
  assert.match(source, /--host-resolver-rules=MAP \* ~NOTFOUND/, 'DNS must resolve to nothing');
  assert.match(source, /setJavaScriptEnabled\(false\)/, 'scripting must be off in the page');
  assert.match(source, /setRequestInterception\(true\)/);
  assert.match(source, /url\.startsWith\(allowedPrefix\)/, 'only files under the unpacked folder may load');
  assert.match(source, /request\.abort\(\)/);
  assert.match(source, /--js-flags=--max-old-space-size=/, 'a render needs a memory ceiling');
  assert.match(source, /PAGE_TIMEOUT_MS/, 'and a deadline');
});
