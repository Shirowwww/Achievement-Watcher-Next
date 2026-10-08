'use strict';

/*
  Keeps keyboard focus inside the panel that is open. Settings and the game configuration sit over
  the library, which stays in the DOM, so Tab used to walk straight into controls hidden under the
  scrim. Given where focus just landed, this says where it should go instead (null: leave it).
*/

const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

function canTakeFocus(element) {
  return !element.disabled && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

// `exempt` names layers that legitimately sit above the panel (prompts, the title bar).
function focusTrapTarget({ panel, landed, exempt, preferred }) {
  if (!panel || !landed || panel.contains(landed)) return null;
  if (exempt && landed.closest && landed.closest(exempt)) return null;
  const favourite = preferred ? panel.querySelector(preferred) : null;
  if (favourite && canTakeFocus(favourite)) return favourite;
  return Array.from(panel.querySelectorAll(FOCUSABLE)).find(canTakeFocus) || null;
}

module.exports = { focusTrapTarget };
