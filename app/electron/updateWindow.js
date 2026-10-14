'use strict';

/*
  The update window: one small frameless window in the app's style that replaces the native message
  box. It offers the update with its release notes, follows the download, and shows the hand-over to
  the installer, whose own card (native/setup-ui) takes over once the app quits.

  This module only owns the window. What it shows comes from util/updateWindowView.js and every
  click goes back to electron/init.js through onAction, which owns the updater.
*/

const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

const WIDTH = 520;
const HEIGHT = 470;

function createUpdateWindow({ onAction, icon }) {
  let win = null;
  let view = null;

  const alive = () => Boolean(win && !win.isDestroyed());
  const fromWindow = (event) => alive() && event.sender === win.webContents;

  function send() {
    if (alive() && view) win.webContents.send('update-window-view', view);
  }

  function create() {
    win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      useContentSize: true,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#142236',
      title: 'Achievement Watcher Next',
      icon,
      webPreferences: {
        preload: path.join(__dirname, '../updatePreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.setMenu(null);
    // The page navigates nowhere and opens nothing; links go through onAction to the system browser.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => {
      if (!alive()) return;
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      win = null;
      onAction('closed');
    });
    win.loadFile(path.join(__dirname, '../view/update.html'));
  }

  ipcMain.on('update-window-ready', (event) => {
    if (fromWindow(event)) send();
  });
  ipcMain.on('update-window-action', (event, id) => {
    if (fromWindow(event)) onAction(String(id));
  });

  function close() {
    if (alive()) win.close();
  }

  return {
    /** Shows the window with this view, creating it if needed; a null view closes it. */
    show(next) {
      view = next;
      if (!view) return close();
      if (!alive()) return create();
      send();
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
    /** Refreshes an open window; never opens one. */
    update(next) {
      view = next;
      if (!view) return close();
      send();
    },
    close,
    isOpen: alive,
  };
}

module.exports = { createUpdateWindow };
