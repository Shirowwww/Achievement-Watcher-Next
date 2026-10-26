'use strict';

/*
  Which panel the Escape key closes. Pure, so the policy is one testable function rather than
  conditions inside a key handler. A panel is closed the way its Cancel button does it; anything
  that has its own Escape (a prompt, the onboarding, a hotkey being recorded) keeps the key.
*/

function panelToClose({ gameConfigOpen, settingsOpen, onboardingOpen, promptOpen, recordingHotkey, themePreviewOpen } = {}) {
  if (onboardingOpen || promptOpen || recordingHotkey) return null;
  // An imported theme's preview is a dialog over Settings: Escape declines it, as its Cancel does.
  if (themePreviewOpen) return 'theme-preview';
  // The game configuration opens over Settings, so it is the one that closes first.
  if (gameConfigOpen) return 'game-config';
  if (settingsOpen) return 'settings';
  return null;
}

module.exports = { panelToClose };
