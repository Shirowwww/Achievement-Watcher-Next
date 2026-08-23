'use strict';

// Sandbox-safe: requires only electron. Unlike overlayPreload.js, pulling in app modules here
// (e.g. ./parser/achievements) fails to load and takes the whole bridge down.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Receive the achievement payload pushed by the main process after the preset loads.
  onNotification: (callback) => ipcRenderer.on('show-notification', (event, data) => callback(data)),
  // Presets call this to dismiss themselves once their out-animation finishes (handled in ipc.js).
  closeNotificationWindow: () => ipcRenderer.send('close-notification-window'),
  // Optional hook some presets call when their first frame is painted (used later for screenshots).
  notificationRenderReady: () => ipcRenderer.send('notification-render-ready'),
});
