'use strict';

/*
  With several displays the Watchdog names the one the game is on by its centre
  (`--gameDisplayAt=x,y`, physical pixels), and the popup goes there. These helpers are the pure part.
*/

function parsePoint(value) {
  const match = /^(-?\d+),(-?\d+)$/.exec(String(value || '').trim());
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

// A custom position keeps its place relative to the screen when the popup changes display.
function moveAnchor(anchor, from, to) {
  if (!anchor || !from || !to || !(from.width > 0) || !(from.height > 0)) return anchor;
  return {
    ...anchor,
    x: Math.round(to.x + ((anchor.x - from.x) / from.width) * to.width),
    y: Math.round(to.y + ((anchor.y - from.y) / from.height) * to.height),
  };
}

module.exports = { parsePoint, moveAnchor };
