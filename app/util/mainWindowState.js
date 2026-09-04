'use strict';

const { clampWindowBoundsToWorkArea } = require('./windowBounds.js');

// The main window is frameless and whatever shape the user dragged it into is their arrangement, so
// it is restored from <userData>/cfg/mainWindowState.json rather than from the manifest defaults on
// every launch. Nothing here touches Electron: init.js hands over the parsed JSON plus the work area
// of the display the geometry now matches, which keeps "does this still fit a screen that exists"
// a plain function instead of something only reproducible with a second monitor plugged in.

function toFiniteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function positiveInteger(value) {
  const number = toFiniteInteger(value);
  return number !== null && number > 0 ? number : 0;
}

// A half-written or hand-edited file must never be able to place the window somewhere unreachable,
// so anything that is not a complete, positive size is dropped back to "no saved geometry".
function normalizeMainWindowState(raw, { minWidth = 0, minHeight = 0 } = {}) {
  const state = { bounds: null, maximized: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
  state.maximized = raw.maximized === true;

  const source = raw.bounds && typeof raw.bounds === 'object' && !Array.isArray(raw.bounds) ? raw.bounds : null;
  if (!source) return state;

  const width = toFiniteInteger(source.width);
  const height = toFiniteInteger(source.height);
  if (width === null || height === null || width <= 0 || height <= 0) return state;

  // x and y are kept as a pair: restoring a width with only one axis would pin the window to a
  // corner of the primary display instead of letting Electron centre it.
  const x = toFiniteInteger(source.x);
  const y = toFiniteInteger(source.y);
  state.bounds = {
    ...(x === null || y === null ? {} : { x, y }),
    width: Math.max(width, positiveInteger(minWidth)),
    height: Math.max(height, positiveInteger(minHeight)),
  };
  return state;
}

// Saved geometry outlives the display it was recorded on: a laptop gets undocked, a monitor moves to
// the other side, a 4K panel is replaced by a 1080p one. Shrink to what the display can show, then
// clamp the position so the frameless caption controls stay clickable.
function resolveMainWindowState(defaults, raw, { workArea = null } = {}) {
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const minWidth = positiveInteger(base.minWidth);
  const minHeight = positiveInteger(base.minHeight);
  const state = normalizeMainWindowState(raw, { minWidth, minHeight });
  if (!state.bounds) return { bounds: null, maximized: state.maximized };

  const fits = workArea && Number.isFinite(workArea.width) && Number.isFinite(workArea.height);
  const bounds = { ...state.bounds };
  if (fits) {
    bounds.width = Math.max(minWidth, Math.min(bounds.width, workArea.width));
    bounds.height = Math.max(minHeight, Math.min(bounds.height, workArea.height));
  }

  return {
    bounds: fits ? clampWindowBoundsToWorkArea(bounds, workArea) : bounds,
    maximized: state.maximized,
  };
}

// Written back through the same shape it is read in, so a rejected value never round-trips into the
// file. Bounds must come from getNormalBounds(): getBounds() on a maximized window would save the
// maximized rectangle as the restore size and the window could never be un-maximized to its old shape.
function buildMainWindowState({ bounds = null, maximized = false } = {}) {
  const normalized = normalizeMainWindowState({ bounds, maximized: maximized === true });
  return { bounds: normalized.bounds, maximized: normalized.maximized };
}

/*
  A couple of pixels is noise, not an intention.

  On a scaled display setBounds() and getNormalBounds() do not round-trip: Electron converts to
  physical pixels and back, so restoring a 1002px window measures 1004px straight afterwards. Written
  back verbatim that becomes 1006 on the next launch and the window creeps a little wider every time
  it opens. Below the tolerance nothing is written, so the saved value stays the reference and the
  error cannot accumulate; a real resize clears it by a wide margin.
*/
const GEOMETRY_NOISE_PX = 4;

function mainWindowStateChanged(previous, next, tolerance = GEOMETRY_NOISE_PX) {
  if (!previous || !next) return previous !== next;
  if (previous.maximized !== next.maximized) return true;
  if (!previous.bounds || !next.bounds) return previous.bounds !== next.bounds;
  return ['x', 'y', 'width', 'height'].some((axis) => {
    const before = previous.bounds[axis];
    const after = next.bounds[axis];
    if (before === undefined || after === undefined) return before !== after;
    return Math.abs(Number(before) - Number(after)) > tolerance;
  });
}

module.exports = {
  normalizeMainWindowState,
  resolveMainWindowState,
  buildMainWindowState,
  mainWindowStateChanged,
};
