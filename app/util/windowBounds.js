'use strict';

function finite(value) {
  return Number.isFinite(value);
}

// Electron's bounds are device-independent pixels. Keep a newly created window fully on the
// matching display: Windows can otherwise restore a DPI-scaled frameless window with its caption
// controls beyond the physical work area.
function clampWindowBoundsToWorkArea(bounds, workArea) {
  if (![bounds?.x, bounds?.y, bounds?.width, bounds?.height, workArea?.x, workArea?.y, workArea?.width, workArea?.height].every(finite)) {
    return bounds;
  }

  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.y), maxY),
  };
}

// The same, shrinking first when the saved size no longer fits: a position saved on another display
// or at another scale can lie wholly off every screen, where Windows still reports the window shown.
function fitWindowBoundsToWorkArea(bounds, workArea) {
  if (![bounds?.width, bounds?.height, workArea?.width, workArea?.height].every(finite)) return clampWindowBoundsToWorkArea(bounds, workArea);
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return clampWindowBoundsToWorkArea({ ...bounds, width, height }, workArea);
}

module.exports = { clampWindowBoundsToWorkArea, fitWindowBoundsToWorkArea };
