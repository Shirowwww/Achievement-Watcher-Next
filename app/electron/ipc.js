'use strict';

const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const { iconResultToFileUrl } = require('../util/iconUrl.js');
const settingsJS = require(path.join(__dirname, '../settings.js'));
settingsJS.setUserDataPath(app.getPath('userData'));
/*
  Every module below is reached from a handler, never while this file loads, and each pulls a large
  tree: the Steam parser alone drags in the whole achievement parser. Requiring them here put that
  tree on the startup path of the main process - a second copy of what the renderer loads for itself,
  in a session that may never scan anything. They load when a handler first needs them.
*/
const { lazyRequire } = require('../util/lazyRequire.js');
const steamJS = lazyRequire(path.join(__dirname, '../parser/steam.js'));

function getStartupLoginItemOptions(openAtLogin) {
  const args = [];
  if (process.defaultApp) args.push(app.getAppPath());
  args.push('--hidden');
  return {
    openAtLogin: openAtLogin === true,
    path: process.execPath,
    args,
  };
}

function getStartupLoginItemQueryOptions() {
  const options = getStartupLoginItemOptions(true);
  return {
    path: options.path,
    args: options.args,
  };
}

function setStartWithWindows(enabled) {
  app.setLoginItemSettings(getStartupLoginItemOptions(enabled));
  return true;
}

function getStartWithWindows() {
  const state = app.getLoginItemSettings(getStartupLoginItemQueryOptions());
  return state.openAtLogin === true;
}

ipcMain.handle('startup:get-start-with-windows', async () => {
  return getStartWithWindows();
});

ipcMain.handle('startup:set-start-with-windows', async (_event, enabled) => {
  return setStartWithWindows(enabled === true);
});

// Adding the exclusion needs administrator rights; Windows shows its own prompt, and declining it
// is reported as an answer, not an error.
const defender = lazyRequire(path.join(__dirname, '../util/defender.js'));

ipcMain.handle('defender:is-active', async () => {
  try {
    return await defender.isActive();
  } catch {
    return false;
  }
});

ipcMain.handle('defender:add-exclusion', async (_event, folder) => {
  try {
    return await defender.addExclusion(folder);
  } catch (err) {
    return { ok: false, reason: 'failed', error: err && err.message ? err.message : String(err) };
  }
});

// node-unrar-js is WASM+Embind and uses `new Function`, which the renderer's strict CSP forbids,
// so extraction happens here in the main process instead.
const crackFixJS = lazyRequire(path.join(__dirname, '../parser/crackFix.js'));
ipcMain.handle('crackfix-extract-rar', async (_event, { archivePath, destDir } = {}) => {
  try {
    await crackFixJS.extractRarToDir(archivePath, destDir);
    return { ok: true };
  } catch (err) {
    return { error: (err && (err.message || String(err))) || 'unknown error' };
  }
});

// Same CSP problem, same fix, for the Steam API Check Bypass proxy DLLs.
const apiCheckBypassJS = lazyRequire(path.join(__dirname, '../parser/apiCheckBypass.js'));
ipcMain.handle('apicheckbypass-extract-rar', async (_event, { rarPath, destDir } = {}) => {
  try {
    const wrote = await apiCheckBypassJS.extractDllsFromRarDirect(rarPath, destDir);
    return { ok: true, wrote };
  } catch (err) {
    return { error: (err && (err.message || String(err))) || 'unknown error' };
  }
});

ipcMain.handle('get-app-name', () => {
  return app.getName();
});
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.on('get-app-name-sync', (event) => {
  event.returnValue = app.getName();
});

ipcMain.on('get-user-data-path-sync', (event) => {
  const t = app.getPath('userData');
  event.returnValue = t;
});

ipcMain.on('get-steam-user-list', async (event) => {
  await steamJS.getSteamUsersList()
    .then((p) => (event.returnValue = p))
    .catch((err) => (event.returnValue = null));
});

ipcMain.on('fetch-icon', async (event, url, appid) => {
  try {
    event.returnValue = iconResultToFileUrl(await steamJS.fetchIcon(url, appid));
  } catch {
    event.returnValue = null;
  }
});
ipcMain.handle('fetch-icon', async (event, url, appid) => {
  try {
    return iconResultToFileUrl(await steamJS.fetchIcon(url, appid));
  } catch {
    return null;
  }
});

async function doCloseNotificationWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(false);
  win.setAlwaysOnTop(false);
  if (win.isVisible()) {
    win.hide();
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!win.isDestroyed()) win.close();
}

ipcMain.on('close-notification-window', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  // win.awFrozenUntil is set in createNotificationWindow: if a preset's hold window hasn't elapsed
  // yet, defer the close instead of cutting the notification short.
  const remaining = (win.awFrozenUntil || 0) - Date.now();
  if (remaining > 0) {
    win.awFrozenUntil = 0;
    setTimeout(() => doCloseNotificationWindow(win), remaining);
    return;
  }
  doCloseNotificationWindow(win);
});

module.exports.window = () => {
  ipcMain.handle('win-close', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.close();
  });

  ipcMain.handle('win-minimize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.minimize();
  });

  ipcMain.handle('win-maximize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle('win-isMinimizable', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win.minimizable;
  });

  ipcMain.handle('win-isMaximizable', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win.maximizable;
  });

  ipcMain.handle('win-isFrameless', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win.isFrameless;
  });

  ipcMain.on('win-isDev', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    event.returnValue = win.isDev;
  });
};

module.exports.setStartWithWindows = setStartWithWindows;
