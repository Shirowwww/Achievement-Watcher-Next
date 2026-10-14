'use strict';

// The update window's bridge. Sandbox-safe: it requires only electron, and the page receives
// nothing but a view object to render and one way to report a click.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('awUpdate', {
  onView: (callback) => ipcRenderer.on('update-window-view', (event, view) => callback(view)),
  act: (id) => ipcRenderer.send('update-window-action', String(id)),
  ready: () => ipcRenderer.send('update-window-ready'),
});
