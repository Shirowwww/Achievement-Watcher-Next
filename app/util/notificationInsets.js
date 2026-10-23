'use strict';

/*
  A preset's window is its <meta> box, but most presets paint their card well inside it, so placing
  the window flush left the card off the edge. These helpers turn a render of the preset into that
  transparent room, and the room into the move that puts the card on the anchored edge.
*/

// Half-opaque: the card body, not the soft shadow or glow around it, is what must touch the edge.
const CARD_ALPHA = 128;
// A preset drawn only in translucent pixels still has a box; anything fainter than this is a halo.
const FAINT_ALPHA = 8;

function boxAt(bitmap, width, height, threshold) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[(y * width + x) * 4 + 3] < threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left, top, right: width - 1 - right, bottom: height - 1 - bottom };
}

// Transparent room on each side of a BGRA capture, in its own pixels; null when nothing is painted.
function paintedInsets(bitmap, width, height) {
  return boxAt(bitmap, width, height, CARD_ALPHA) || boxAt(bitmap, width, height, FAINT_ALPHA);
}

// Smallest room per side: moving by it can never push any of the measured states off the screen.
function mergeInsets(list) {
  const boxes = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!boxes.length) return null;
  const side = (key) => Math.max(0, Math.min(...boxes.map((box) => Number(box[key]) || 0)));
  return { left: side('left'), top: side('top'), right: side('right'), bottom: side('bottom') };
}

/*
  Window move, in screen pixels, that brings the painted card onto the edge(s) `position` names, or
  `gap` pixels inside them (an imported SAN theme sits off the edge, as in SAN).
*/
function edgeShift(position, insets, zoom = 1, gap = 0) {
  const shift = { dx: 0, dy: 0 };
  if ((!insets && !gap) || position === 'custom') return shift;
  const room = insets || {};
  const factor = Number(zoom) > 0 ? Number(zoom) : 1;
  const scaled = (value) => Math.floor((Number(value) || 0) * factor);
  const inset = Math.max(0, Math.round(Number(gap) || 0));
  const name = String(position || 'center-bottom');
  if (name.endsWith('-left')) shift.dx = inset - scaled(room.left);
  if (name.endsWith('-right')) shift.dx = scaled(room.right) - inset;
  if (name.startsWith('top-') || name === 'center-top') shift.dy = inset - scaled(room.top);
  if (name.startsWith('bottom-') || name === 'center-bottom') shift.dy = scaled(room.bottom) - inset;
  return shift;
}

/*
  Nearest coordinate that falls on a whole physical pixel. At 125% a window placed at x=1349 lands on
  pixel 1686.25, and Windows answers by widening it, which pushes a right-anchored card past the edge.
*/
function snapToDevicePixel(value, scaleFactor = 1) {
  const factor = Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  for (let step = 1; step <= 8; step++) {
    const physical = step * factor;
    if (Math.abs(physical - Math.round(physical)) < 1e-6) return Math.round(value / step) * step;
  }
  return Math.round(value);
}

module.exports = {
  paintedInsets,
  mergeInsets,
  edgeShift,
  snapToDevicePixel,
};
