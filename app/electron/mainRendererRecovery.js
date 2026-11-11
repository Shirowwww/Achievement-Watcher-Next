'use strict';

/*
  What to do when the main window's renderer dies. A frameless window whose page is gone draws
  nothing at all, so leaving it there is an invisible app. The first loss is reloaded; a second one
  soon after would only loop (the same page doing the same thing), so the window is closed and the
  user is told, with a way to export the logs that say why.
*/
const RELOAD_AGAIN_AFTER_MS = 2 * 60 * 1000;

/**
 * @param {{ reason?: string }} details  Electron's render-process-gone details
 * @param {number} lastReloadAt  when the last loss was answered by a reload (0 if never)
 * @param {number} now
 * @returns {'ignore' | 'reload' | 'close'}
 */
function decide(details, lastReloadAt, now) {
  // A clean exit is the window being closed or released on purpose.
  if (!details || details.reason === 'clean-exit') return 'ignore';
  if (lastReloadAt && now - lastReloadAt < RELOAD_AGAIN_AFTER_MS) return 'close';
  return 'reload';
}

module.exports = { decide, RELOAD_AGAIN_AFTER_MS };
