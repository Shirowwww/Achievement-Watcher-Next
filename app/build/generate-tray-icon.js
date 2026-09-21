'use strict';

/*
  Rebuilds resources/icon/icon_tray.ico from icon_tray.png.

  Run it after replacing the PNG: node build/generate-tray-icon.js

  The source is white line art sitting on a cloud of grey smoke, with a feathered edge - fine at
  poster size, unusable at 16 points, where a soft edge and a mid grey are the same thing once
  Windows has averaged them. Nothing here redraws anything; the drawing is reduced to what survives:

    - the smoke is dropped, being the only thing in the file between black and white;
    - the edge is hardened, so a half-transparent pixel cannot be averaged into the background;
    - loose specks are dropped, keeping the shapes that carry the drawing;
    - the large enclosed gaps are filled, so the outlined cup becomes a solid shape - an outline
      needs three pixels to read (stroke, plus a gap either side) and 16 points does not have them -
      while the narrow ones stay open, because the handles are only handles as long as there is
      daylight through them.

  Every frame is stored PNG-encoded, because createTray() in electron/init.js only collects PNG
  entries - a frame written as a BMP is silently skipped and the tray falls back to the blurry
  whole-file bitmap.
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Below this the pixel is feathering, above it the pixel is drawn.
const EDGE_ALPHA = 96;
// Below this luminance the pixel belongs to the field, above it to the white line art.
const INK_LUMA = 150;
/*
  An enclosed gap this large, as a share of the frame, is a field to be inked; anything narrower is
  a detail of the drawing and stays open.

  Measured on the art rather than picked: the cup interior is 15.96% of the frame and the notch in
  the base 1.27%, while the two handle slots are 0.25% each. Filling everything turns the cup into a
  blob with no handles; filling nothing leaves an outline that has no room to exist at 16 points.
*/
const GAP_FLOOR = 0.005;
/*
  The largest frame the notification area can ask for: 16 points at 300%. Every frame up to here is
  the SAME 16pt icon at a different display scale, so they all get the framing that reads at 16pt.
  Above it the shell is drawing an icon somewhere else and has room for the whole drawing.
*/
const TRAY_UPTO = 48;
// The alpha ramp a downscale leaves behind, steepened back toward a hard edge.
const EDGE_MIDPOINT = 110;
const EDGE_CONTRAST = 2.6;
// In the trophy crop, a shape smaller than this share of the largest one is clipped scenery.
const SHAPE_FLOOR = 0.05;

// One frame per Windows display scale (100/125/150/175/200/225/250/300%), plus the shell sizes.
const SIZES = [16, 20, 24, 28, 32, 36, 40, 48, 64, 128, 256];

// How much of a square frame a master of this shape can fill, as a percentage of its longer side.
const fill = ({ width, height }) => Math.round((100 * Math.min(width, height)) / Math.max(width, height));

const source = path.join(__dirname, 'icon_tray.png');
const target = path.join(__dirname, '..', 'resources', 'icon', 'icon_tray.ico');

// The white line art as a bitmap, with the feathered edge and the shading already resolved away.
async function inkMask(input) {
  const { data, info } = await sharp(input).trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(info.width * info.height);
  for (let at = 0, pixel = 0; at < data.length; at += 4, pixel += 1) {
    const drawn = data[at + 3] >= EDGE_ALPHA;
    const luma = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
    ink[pixel] = drawn && luma >= INK_LUMA ? 1 : 0;
  }
  return { ink, width: info.width, height: info.height };
}

/*
  Flood every gap in the mask. A gap that touches no border is inside the drawing; if it is also
  broad enough to be a field rather than a detail it becomes ink. Everything else - the background,
  and the slots that make the handles handles - is left alone. Iterative, because a recursive fill
  over a million pixels overflows the stack.
*/
function fillEnclosedFields({ ink, width, height }) {
  const total = width * height;
  const floor = total * GAP_FLOOR;
  const seen = new Uint8Array(total);
  const filled = Uint8Array.from(ink);
  const stack = new Int32Array(total);

  for (let start = 0; start < total; start += 1) {
    if (ink[start] || seen[start]) continue;

    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;

    const gap = [];
    let touchesEdge = false;

    while (top > 0) {
      top -= 1;
      const pixel = stack[top];
      gap.push(pixel);

      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

      if (x > 0 && !ink[pixel - 1] && !seen[pixel - 1]) {
        seen[pixel - 1] = 1;
        stack[top] = pixel - 1;
        top += 1;
      }
      if (x < width - 1 && !ink[pixel + 1] && !seen[pixel + 1]) {
        seen[pixel + 1] = 1;
        stack[top] = pixel + 1;
        top += 1;
      }
      if (y > 0 && !ink[pixel - width] && !seen[pixel - width]) {
        seen[pixel - width] = 1;
        stack[top] = pixel - width;
        top += 1;
      }
      if (y < height - 1 && !ink[pixel + width] && !seen[pixel + width]) {
        seen[pixel + width] = 1;
        stack[top] = pixel + width;
        top += 1;
      }
    }

    if (!touchesEdge && gap.length >= floor) {
      for (const pixel of gap) filled[pixel] = 1;
    }
  }

  return { ink: filled, width, height };
}

/*
  What the smoke leaves behind: a scatter of small bright flecks that pass the ink threshold. They
  are their own connected shapes and a fraction of the size of anything in the drawing, so dropping
  everything far smaller than the largest shape clears them. The three stars are well above the
  floor and survive.
*/
function keepLargestShapes({ ink, width, height }) {
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  const shapes = [];

  for (let start = 0; start < total; start += 1) {
    if (!ink[start] || seen[start]) continue;
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    const cells = [];
    while (top > 0) {
      top -= 1;
      const pixel = stack[top];
      cells.push(pixel);
      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbours = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1];
      for (const next of neighbours) {
        if (next >= 0 && ink[next] && !seen[next]) {
          seen[next] = 1;
          stack[top] = next;
          top += 1;
        }
      }
    }
    shapes.push(cells);
  }

  const largest = shapes.reduce((best, cells) => Math.max(best, cells.length), 0);
  const kept = new Uint8Array(total);
  for (const cells of shapes) {
    if (cells.length < largest * SHAPE_FLOOR) continue;
    for (const pixel of cells) kept[pixel] = 1;
  }
  return { ink: kept, width, height };
}

/*
  The biggest shape on its own - here the cup, without the stars sitting above it.

  A square frame is filled by whichever side of the drawing is longer, so a tall drawing pays for
  its height in width it never uses: cup and stars together measure 805x1047 and fill 77% of the
  box, while the cup alone is 805x779 and fills 97%. At 16 points that difference is the whole
  icon, and it is spent on three stars that are three specks at that size anyway.
*/
function largestShapeOnly({ ink, width, height }) {
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  let best = [];

  for (let start = 0; start < total; start += 1) {
    if (!ink[start] || seen[start]) continue;
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    const cells = [];
    while (top > 0) {
      top -= 1;
      const pixel = stack[top];
      cells.push(pixel);
      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbours = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1];
      for (const next of neighbours) {
        if (next >= 0 && ink[next] && !seen[next]) {
          seen[next] = 1;
          stack[top] = next;
          top += 1;
        }
      }
    }
    if (cells.length > best.length) best = cells;
  }

  const kept = new Uint8Array(total);
  for (const pixel of best) kept[pixel] = 1;
  return { ink: kept, width, height };
}

/*
  Plain white on transparent, which is what every other icon in the notification area is. A dark
  outline was tried here to carry the shape on a light taskbar; at tray sizes it reads as a grey
  halo around the glyph and makes the icon look soft next to its neighbours, which costs more than
  the light-theme case it buys.
*/
function maskToPng({ ink, width, height }) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = 255;
    rgba[pixel * 4 + 1] = 255;
    rgba[pixel * 4 + 2] = 255;
    rgba[pixel * 4 + 3] = ink[pixel] ? 255 : 0;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/*
  A downscale turns every edge into a long ramp of half-transparent pixels, and at 16px the ramp is
  most of the shape - which is what makes the icon read as soft grey next to the hard-edged icons
  Windows ships. Steepening the alpha curve afterwards keeps enough antialiasing to avoid stair
  steps while putting the bulk of each edge back at fully on or fully off.
*/
async function crispResize(master, size) {
  const { data, info } = await sharp(master)
    .resize(size, size, { fit: 'contain', kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  for (let at = 0; at < pixels.length; at += 4) {
    const steepened = (pixels[at + 3] - EDGE_MIDPOINT) * EDGE_CONTRAST + 128;
    pixels[at + 3] = Math.max(0, Math.min(255, Math.round(steepened)));
  }

  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function packIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(frames.length * 16);
  let offset = header.length + directory.length;

  frames.forEach(({ size, data }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.data)]);
}

async function main() {
  /*
    Trimmed twice on purpose. The first trim only removes the fully transparent border, which the
    smoke does not reach; once the smoke is gone the drawing is smaller than what was trimmed, so
    the mask is trimmed again to the ink itself. Without the second pass the trophy keeps a wide
    margin of nothing and comes out small in its own frame.
  */
  const drawing = fillEnclosedFields(keepLargestShapes(await inkMask(fs.readFileSync(source))));
  const whole = await sharp(await maskToPng(drawing)).trim({ threshold: 1 }).png().toBuffer();
  const cupOnly = await sharp(await maskToPng(largestShapeOnly(drawing))).trim({ threshold: 1 }).png().toBuffer();

  const frames = [];
  for (const size of SIZES) {
    frames.push({ size, data: await crispResize(size <= TRAY_UPTO ? cupOnly : whole, size) });
  }

  fs.writeFileSync(target, packIco(frames));
  const big = await sharp(whole).metadata();
  const small = await sharp(cupOnly).metadata();
  console.log(
    `${path.relative(path.join(__dirname, '..'), target)} - ${frames.length} frames, ` +
      `<=${TRAY_UPTO}px from ${small.width}x${small.height} (${fill(small)}% of the box), ` +
      `above from ${big.width}x${big.height} (${fill(big)}%), ${fs.statSync(target).size} bytes`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
