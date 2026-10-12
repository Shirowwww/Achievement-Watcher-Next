'use strict';

// The software clip recorder's window (app/electron/clipRecorder.js) talks to the main process
// through these calls only.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipRecorder', {
  onStart: (callback) => ipcRenderer.once('clip-recorder:start', (_event, plan) => callback(plan)),
  onFrameRequest: (callback) => ipcRenderer.on('clip-recorder:frame', (_event, id) => callback(id)),
  frame: (id, png) => ipcRenderer.send('clip-recorder:frame-data', id, png),
  started: (detail) => ipcRenderer.send('clip-recorder:started', String(detail)),
  chunk: (bytes) => ipcRenderer.send('clip-recorder:chunk', bytes),
  error: (message) => ipcRenderer.send('clip-recorder:error', String(message)),
});
