'use strict';

/*
  Split out of app.js so it can be driven in a real browser engine (test/browser/updateChip.browser.test.js).
  Deliberately free of translation: the caller passes an already-resolved view, so locale strings stay
  in app.js where the linter can see them.
*/

function clampPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

// Returns whether the chip is visible, so callers can skip work that only matters then.
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
