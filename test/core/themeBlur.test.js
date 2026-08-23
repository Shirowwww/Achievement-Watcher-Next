'use strict';

/*
  The blur and veil copies an image layer is drawn from.

  Three places have to produce exactly the same copies or a theme looks different in each: the
  Custom theme editor, an .awtheme being imported, and the picture the gallery renders. The name a
  copy is written under is what makes that true and what makes an existing copy reusable, so it is
  the thing worth pinning.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { prepareThemeBlurImages, derivedName, sigmaFor, VEIL_SIGMA } = require(path.join(appRoot, 'util', 'themeBlur.js'));
const { defaultCustomTheme } = require(path.join(appRoot, 'util', 'themeLayers.js'));

/*
  A real picture, made by the same library that blurs it. Hard-coding one as base64 is how this
  test first failed: a fixture that does not decode makes every blur look broken.
*/
const sharp = require(path.join(appRoot, 'node_modules', 'sharp'));

// Noisy on purpose: a flat colour blurs to itself, so it would prove nothing.
function picture() {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    const on = (Math.floor(i / size) + (i % size)) % 2 === 0;
    pixels[i * 3] = on ? 250 : 12;
    pixels[i * 3 + 1] = on ? 40 : 90;
    pixels[i * 3 + 2] = on ? 120 : 240;
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-blur-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withEffect(image, effect) {
  const theme = defaultCustomTheme();
  theme.bg.image = image;
  theme.bg.effect = { enabled: true, type: 'veil', color: '#000000', opacity: 40, blur: 8, blurImage: '', ...effect };
  return theme;
}

test('a blur follows the slider and a veil is a fixed light frost', () => {
  assert.equal(sigmaFor({ type: 'veil', blur: 40 }), VEIL_SIGMA, 'a veil never follows the blur slider');
  assert.equal(sigmaFor({ type: 'blur', blur: 40 }), 8);
  assert.equal(sigmaFor({ type: 'blur', blur: 0 }), 0.3, 'a blur has a floor, so the copy is never the source');
  assert.equal(sigmaFor({ type: 'blur', blur: 1000 }), 12, 'and a ceiling, so one theme cannot cost minutes');
});

test('a copy is named after the layer, the source and the effect', () => {
  const blur = derivedName('bg', 'C:/pictures/holiday photo.jpg', { type: 'blur', blur: 22 });
  const veil = derivedName('bg', 'C:/pictures/holiday photo.jpg', { type: 'veil', blur: 22 });

  assert.notEqual(blur, veil, 'a blur copy and a veil copy of one image must not overwrite each other');
  assert.ok(blur.startsWith('bg-'), 'the layer is in the name, so two layers sharing an image do not collide');
  assert.ok(blur.endsWith('.png'));
  // The source name is reduced to something safe: it becomes a file name in a managed folder.
  assert.ok(!blur.includes('/') && !blur.includes(' '), `"${blur}" is not a safe file name`);
  assert.equal(derivedName('bg', 'C:/other/holiday photo.jpg', { type: 'blur', blur: 22 }), blur, 'only the base name matters');
  // The intensity is in the name, so changing the slider makes a new copy rather than reusing one.
  assert.notEqual(derivedName('bg', 'a.png', { type: 'blur', blur: 8 }), derivedName('bg', 'a.png', { type: 'blur', blur: 9 }));
});

test('an effect gets a real copy, and the same theme twice reuses it', async (t) => {
  const dir = workspace(t);
  const image = path.join(dir, 'wall.png');
  const source = await picture();
  fs.writeFileSync(image, source);
  const into = path.join(dir, 'derived');

  const theme = withEffect(image, { type: 'blur', blur: 20 });
  await prepareThemeBlurImages(theme, into);

  const made = theme.bg.effect.blurImage;
  assert.ok(made, 'no copy was made');
  assert.ok(fs.existsSync(made), 'the copy is not on disk');
  assert.ok(made.startsWith(into), 'the copy landed outside the folder it was given');
  assert.notDeepEqual(fs.readFileSync(made), source, 'the copy is the source, unblurred');

  // The name already says the copy is correct, so a second pass must not redo the work.
  const stamp = fs.statSync(made).mtimeMs;
  const again = withEffect(image, { type: 'blur', blur: 20 });
  await prepareThemeBlurImages(again, into);
  assert.equal(again.bg.effect.blurImage, made);
  assert.equal(fs.statSync(made).mtimeMs, stamp, 'the copy was made a second time for nothing');

  // A different intensity is a different copy, not an overwrite.
  const stronger = withEffect(image, { type: 'blur', blur: 30 });
  await prepareThemeBlurImages(stronger, into);
  assert.notEqual(stronger.bg.effect.blurImage, made);
  assert.ok(fs.existsSync(made), 'the first copy was overwritten');
});

test('a layer with no effect, no image or a missing image is left with nothing to draw from', async (t) => {
  const dir = workspace(t);
  const into = path.join(dir, 'derived');

  const off = defaultCustomTheme();
  off.bg.image = path.join(dir, 'wall.png');
  fs.writeFileSync(off.bg.image, await picture());
  off.bg.effect.enabled = false;
  off.bg.effect.blurImage = 'C:/stale/copy.png';
  await prepareThemeBlurImages(off, into);
  assert.equal(off.bg.effect.blurImage, 'C:/stale/copy.png', 'a layer with the effect off is left alone');

  // A path that is not there clears the field rather than leaving a copy nothing can read: the
  // layer then draws from its source image, which is the right thing to fall back to.
  const gone = withEffect(path.join(dir, 'absent.png'), { type: 'blur', blur: 10 });
  gone.bg.effect.blurImage = 'C:/stale/copy.png';
  await prepareThemeBlurImages(gone, into);
  assert.equal(gone.bg.effect.blurImage, '');

  const noImage = withEffect('', { type: 'blur', blur: 10 });
  await prepareThemeBlurImages(noImage, into);
  assert.equal(noImage.bg.effect.blurImage, '');
});

test('a source that cannot be decoded costs the copy, never the theme', async (t) => {
  const dir = workspace(t);
  const image = path.join(dir, 'not-really.png');
  fs.writeFileSync(image, 'this is not an image at all');
  const lines = [];

  const theme = withEffect(image, { type: 'blur', blur: 10 });
  await prepareThemeBlurImages(theme, path.join(dir, 'derived'), { log: (line) => lines.push(line) });

  assert.equal(theme.bg.effect.blurImage, '', 'a broken source left a path nothing can read');
  assert.equal(lines.length, 1, 'the failure was not reported');
  assert.match(lines[0], /blur failed for bg/);
});

test('every image layer with an effect gets its own copy', async (t) => {
  const dir = workspace(t);
  const image = path.join(dir, 'shared.png');
  fs.writeFileSync(image, await picture());
  const into = path.join(dir, 'derived');

  const theme = defaultCustomTheme();
  for (const id of ['bg', 'header', 'card']) {
    theme[id].image = image;
    theme[id].effect = { enabled: true, type: 'veil', color: '#000000', opacity: 40, blur: 8, blurImage: '' };
  }
  await prepareThemeBlurImages(theme, into);

  const copies = ['bg', 'header', 'card'].map((id) => theme[id].effect.blurImage);
  assert.equal(new Set(copies).size, 3, 'two layers sharing one image ended up sharing one copy');
  for (const copy of copies) assert.ok(fs.existsSync(copy));
  // A layer that asked for nothing is untouched.
  assert.equal(theme.panel.effect.blurImage, '');
});
