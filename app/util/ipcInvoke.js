'use strict';

/*
  Invokes a main-process handler from code that doesn't know which process it's running in. The
  parsers under app/parser are required from the renderer, the main process and the background
  monitor - only the renderer has `ipcRenderer`, so calling it directly threw a bare "Cannot read
  properties of undefined (reading 'invoke')" once per game in parser.log for the SteamDB
  fallbacks. Those call sites are optional enrichment, so returning null outside the renderer is
  the honest behaviour, not throwing or logging the same error for every game.
*/

function getIpcRenderer() {
  try {
    const { ipcRenderer } = require('electron');
    return ipcRenderer && typeof ipcRenderer.invoke === 'function' ? ipcRenderer : null;
  } catch {
    return null;
  }
}

// True only in a renderer, where main-process handlers can actually be reached.
function ipcAvailable() {
  return Boolean(getIpcRenderer());
}

/*
  Always returns a promise; resolves to null when the channel is unreachable or the handler
  rejected. Callers that must tell "no answer" from "answered with nothing" should use ipcRenderer
  directly - none of the artwork or metadata fallbacks need that distinction.
*/
async function ipcInvoke(channel, ...args) {
  const ipcRenderer = getIpcRenderer();
  if (!ipcRenderer) return null;
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch {
    return null;
  }
}

module.exports = { ipcInvoke, ipcAvailable };
