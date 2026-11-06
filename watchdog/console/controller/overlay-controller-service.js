// Recreate and enable the controller manager when its settings change.

const { createControllerInputManager } = require("./controller-input-manager");

function createDisabledStatus() {
  return {
    enabled: false,
    running: false,
    available: false,
    dllName: null,
    backendError: null,
    controlModeActive: false,
    controlModeUserIndex: null,
  };
}

function bindingRequiresSystemButtons(binding) {
  return Array.isArray(binding) && binding.includes("GUIDE");
}

// Every callback is required: the Watchdog, the one caller, passes them all.
function createOverlayControllerService({
  logger,
  isSupportEnabled,
  getPreferredBackend,
  isDebugLoggingEnabled,
  getOverlayToggleBinding,
  getOverlayControlModeBinding,
  getOverlayUiModeBinding,
  canEnterOverlayControlMode,
  isOverlayPresented,
  onAction,
  onPadState,
}) {

  let manager = null;
  let managerBackendPreference = "auto";
  let managerRequiresSystemButtons = false;
  let managerDebugLoggingEnabled = false;

  function getBindingsRequireSystemButtons(prefs = null) {
    return [
      getOverlayToggleBinding(prefs),
      getOverlayControlModeBinding(prefs),
      getOverlayUiModeBinding(prefs),
    ].some(bindingRequiresSystemButtons);
  }

  function ensureManager(prefs = null) {
    const preferredBackend = getPreferredBackend(prefs);
    const requiresSystemButtons = getBindingsRequireSystemButtons(prefs);
    const debugLoggingEnabled = isDebugLoggingEnabled(prefs);
    if (
      manager &&
      managerBackendPreference === preferredBackend &&
      managerRequiresSystemButtons === requiresSystemButtons &&
      managerDebugLoggingEnabled === debugLoggingEnabled
    ) {
      return manager;
    }
    shutdown("binding-or-backend-preference-changed");
    managerBackendPreference = preferredBackend;
    managerRequiresSystemButtons = requiresSystemButtons;
    managerDebugLoggingEnabled = debugLoggingEnabled;
    manager = createControllerInputManager({
      logger,
      canEnterOverlayControlMode,
      isOverlayPresented,
      onAction,
      onPadState,
      debugLoggingEnabled,
      getPreferredBackend: () => preferredBackend,
      getOverlayToggleBinding: () => getOverlayToggleBinding(),
      getOverlayControlModeBinding: () => getOverlayControlModeBinding(),
      getOverlayUiModeBinding: () => getOverlayUiModeBinding(),
    });
    return manager;
  }

  function sync(reason, prefs = null) {
    const enabled = isSupportEnabled(prefs);
    if (!enabled && !manager) {
      return createDisabledStatus();
    }
    const currentManager = ensureManager(prefs);
    const status = currentManager.setEnabled(enabled, reason || "preferences");
    if (enabled && !status.available) {
      logger.warn?.("controller:preference-sync:unavailable", {
        reason: String(reason || "preferences"),
        preferredBackend: getPreferredBackend(prefs),
        backendError: status.backendError || null,
      });
    }
    return status;
  }

  function notifyOverlayPresentationChanged(
    presented,
    reason = "overlay-presented-changed",
  ) {
    manager?.notifyOverlayPresentationChanged?.(presented, reason);
  }

  function shutdown(reason = "manual") {
    if (!manager) return;
    try {
      manager.shutdown(reason);
    } catch {}
    manager = null;
    managerBackendPreference = "auto";
    managerRequiresSystemButtons = false;
    managerDebugLoggingEnabled = false;
  }

  return {
    sync,
    shutdown,
    notifyOverlayPresentationChanged,
  };
}

module.exports = {
  createOverlayControllerService,
};
