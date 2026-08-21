'use strict';

/*
  Square game logos for notification cards.

  Every preset paints its thumbnail in a square slot, but the art a game ships is not square: a
  library grid is 2:3, a header 2:1, and Steam's clienticon is a 32x32 sprite that turns to mush the
  moment a preset scales it to 68px. Handing any of those over unchanged is what produced the cards
  this module exists to fix - a poster sliced through the middle of its own logo, and a blurry stamp
  beside a crisp title.

  Two steps, in order:
    1. Ask for a real square logo (SteamGridDB icons), which is what a game's own square art is.
    2. Failing that, cut one out of the best art on disk, at a resolution the slot can use.

  The cut is deliberately not a plain center crop for portraits: library grids put their key art in
  the upper half and their logo across the bottom, so a centered square lands on the seam between
  the two and keeps neither. Biasing the window upwards keeps the art whole.
*/

const fs = require('fs');
const path = require('path');
const { imageSize } = require('./imageSize.js');

// Big enough that a 68px slot at 200% display scaling is still sharp, small enough that the file
// stays a few tens of KB.
const SQUARE_SIDE = 256;
// Below this a source has nothing to give: upscaling a 32x32 clienticon to 256 only makes the
// blur bigger, so such a source is left for the preset to deal with.
const MIN_USABLE_SIDE = 96;
// Ratios within this band are already square as far as a thumbnail is concerned.
const SQUARE_RATIO_TOLERANCE = 0.1;

function isSquareRatio(width, height) {
  if (!width || !height) return false;
  return Math.abs(width / height - 1) <= SQUARE_RATIO_TOLERANCE;
}

/*
  The square window to cut out of a `width` x `height` image.

  Horizontally always centered. Vertically centered for landscape art (a header's subject sits in
  the middle) and raised for portrait art, where the bottom strip is the title treatment.
*/
function squareCrop(width, height) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  if (!w || !h) return null;
  const side = Math.min(w, h);
  const portrait = h > w;
  const verticalBias = portrait ? 0.35 : 0.5;
  return {
    x: Math.max(0, Math.round((w - side) / 2)),
    y: Math.max(0, Math.round((h - side) * verticalBias)),
    width: side,
    height: side,
  };
}

// Cached beside the art it was cut from, keyed by the source file so a game whose cover changes
// gets a new square instead of the previous one.
function squareIconFile(root, appid, sourcePath) {
  const stem = path.basename(String(sourcePath || 'art')).replace(/\.[^.]+$/, '');
  return path.join(String(root || ''), 'steam_cache', 'icon', String(appid || 'unknown'), `${stem}-logo.png`);
}

function loadNativeImage() {
  try {
    return require('electron').nativeImage;
  } catch {
    return null;
  }
}

/*
  Turn one local image into a cached square PNG.

  Returns the square's path, the source itself when it is already square and large enough, or null
  when there is nothing worth cutting (missing file, unreadable header, too small to matter).
*/
function makeSquareLogo(sourcePath, appid, options = {}) {
  const source = String(sourcePath || '');
  if (!source || /^https?:\/\//i.test(source) || !fs.existsSync(source)) return null;

  const size = imageSize(source);
  if (!size || !size.width || !size.height) return null;
  if (Math.min(size.width, size.height) < MIN_USABLE_SIDE) return null;
  // Already square: the preset can paint it as-is, and re-encoding would only lose a little.
  if (isSquareRatio(size.width, size.height)) return source;

  const target = options.outputFile || squareIconFile(options.userDataRoot || '', appid, source);
  if (fs.existsSync(target)) return target;

  const nativeImage = options.nativeImage || loadNativeImage();
  if (!nativeImage) return null;

  try {
    const image = nativeImage.createFromPath(source);
    if (image.isEmpty()) return null;
    const crop = squareCrop(size.width, size.height);
    if (!crop) return null;
    let square = image.crop(crop);
    if (crop.width > SQUARE_SIDE) square = square.resize({ width: SQUARE_SIDE, height: SQUARE_SIDE, quality: 'best' });
    const png = square.toPNG();
    if (!png || !png.length) return null;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png);
    return target;
  } catch {
    return null;
  }
}

// Under this a community icon is no better than the clienticon it would replace; past the ideal
// side it is bytes a 68px slot pays for and cannot show.
const COMMUNITY_ICON_MIN_SIDE = 128;
const COMMUNITY_ICON_IDEAL_SIDE = 512;

/*
  The best square icon in a SteamGridDB icon list: the largest one up to 512, else the smallest one
  above it. Only PNG and JPEG are taken - an .ico or an animated .webp is read by neither the image
  header reader above nor the preset that has to paint it.
*/
function pickSquareIcon(icons) {
  const square = (Array.isArray(icons) ? icons : [])
    .filter((icon) => icon && icon.url && /\.(?:png|jpe?g)(?:$|[?#])/i.test(String(icon.url)))
    .filter((icon) => Number(icon.width) > 0 && Number(icon.width) === Number(icon.height))
    .filter((icon) => Number(icon.width) >= COMMUNITY_ICON_MIN_SIDE);
  if (!square.length) return null;
  const usable = square.filter((icon) => Number(icon.width) <= COMMUNITY_ICON_IDEAL_SIDE);
  const best = usable.length
    ? usable.slice().sort((a, b) => Number(b.width) - Number(a.width))[0]
    : square.slice().sort((a, b) => Number(a.width) - Number(b.width))[0];
  return { url: String(best.url), width: Number(best.width), height: Number(best.height) };
}

module.exports = {
  SQUARE_SIDE,
  MIN_USABLE_SIDE,
  COMMUNITY_ICON_MIN_SIDE,
  COMMUNITY_ICON_IDEAL_SIDE,
  isSquareRatio,
  squareCrop,
  squareIconFile,
  makeSquareLogo,
  pickSquareIcon,
};
