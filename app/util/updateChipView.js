'use strict';

/*
  The DOM half of the title-bar update chip: which attributes and text the chip carries for one
  updater state.

  Split out of app.js so it can be driven in a real browser engine (see
  test/browser/updateChip.browser.test.js). Everything the chip's appearance depends on is a CSS rule
  keyed on `data-phase` / `data-cancellable`, and neither those rules nor the width of the progress
  fill can be checked by reading source - the chip sits in a 30px bar next to the window controls,
  where "it renders" and "it fits" are different questions.

  Deliberately free of translation: the caller passes an already-resolved view, so every user-facing
  string stays in app.js where the locale linter can see it.
*/

function clampPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

/*
  Paint `chip` for `state` using `view` ({ icon, label, title }), or hide it when there is nothing to
  say. Returns whether the chip is visible, so a caller can skip work that only matters when it is.
*/
function applyUpdateChip(chip, state, view, cancelLabel) {
  if (!chip) return false;
  if (!state || !view) {
    chip.hidden = true;
    chip.removeAttribute('data-phase');
    chip.removeAttribute('data-cancellable');
    return false;
  }

  chip.hidden = false;
  chip.setAttribute('data-phase', String(state.phase || ''));
  chip.setAttribute('data-cancellable', String(!!state.cancellable));

  const icon = chip.querySelector('i');
  if (icon) {
    icon.className = `fas ${view.icon}`;
    icon.setAttribute('aria-hidden', 'true');
  }

  const text = chip.querySelector('.update-text');
  if (text) text.textContent = view.label;

  const fill = chip.querySelector('.update-fill');
  if (fill) fill.style.width = `${clampPercent(state.percent)}%`;

  chip.setAttribute('title', view.title || view.label);

  const cancel = chip.querySelector('#update-cancel');
  if (cancel && cancelLabel) {
    cancel.setAttribute('title', cancelLabel);
    cancel.setAttribute('aria-label', cancelLabel);
  }
  return true;
}

module.exports = { applyUpdateChip };
