'use strict';

/*
  Library multi-selection (#192): Ctrl+click toggles a tile, Shift+click selects every tile from
  the last clicked one, in the order the library shows them. Pure set logic; app.js paints it.
*/

// The new selection after a modified click on `id`, given the visible tiles in order.
function select(current, id, { toggle = false, range = false, anchor = null, order = [] } = {}) {
  const key = String(id);
  const next = new Set([...(current || [])].map(String));
  if (range && anchor != null) {
    const ids = order.map(String);
    const from = ids.indexOf(String(anchor));
    const to = ids.indexOf(key);
    if (from !== -1 && to !== -1) {
      const [start, end] = from < to ? [from, to] : [to, from];
      for (const each of ids.slice(start, end + 1)) next.add(each);
      return next;
    }
  }
  if (toggle || range) {
    if (next.has(key)) next.delete(key);
    else next.add(key);
  }
  return next;
}

// Only the ids still shown: a tile hidden by a filter since it was picked is not acted on.
function visibleSelection(current, order) {
  const shown = new Set(order.map(String));
  return [...(current || [])].map(String).filter((id) => shown.has(id));
}

// A click with Ctrl, Cmd or Shift held picks tiles; the controls inside a tile let it through.
function isSelectionClick(event) {
  return !!event && !!(event.ctrlKey || event.metaKey || event.shiftKey);
}

module.exports = { select, visibleSelection, isSelectionClick };
