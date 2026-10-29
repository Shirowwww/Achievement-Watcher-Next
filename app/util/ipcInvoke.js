'use strict';

/*
  Invokes a main-process handler from code that doesn't know which process it's running in. The
  parsers under app/parser are required from the renderer, the main process, the background
  monitor and the scan host - only the renderer has `ipcRenderer`, so calling it directly threw a
  bare "Cannot read properties of undefined (reading 'invoke')" once per game in parser.log for the
  SteamDB fallbacks. Those call sites are optional enrichment, so returning null when no channel
  exists is the honest behaviour, not throwing or logging the same error for every game.

  The scan host (parser/scanWorker.js) has no ipcRenderer either, but the renderer that started it
  answers for it: setRelay() hands this module that route, so the parsers reach the same handlers
  from there without knowing where they run.
*/

let relay = null;

function getIpcRenderer() {
  try {
    const { ipcRenderer } = require('electron');
    return ipcRenderer && typeof ipcRenderer.invoke === 'function' ? ipcRenderer : null;
  } catch {
    return null;
  }
}

// `route` is { invoke(channel, ...args) -> Promise, send(channel, ...args) }, or null to drop it.
function setRelay(route) {
  relay = route && typeof route.invoke === 'function' && typeof route.send === 'function' ? route : null;
}

function transport() {
  return getIpcRenderer() || relay;
}

// True wherever main-process handlers can actually be reached.
function ipcAvailable() {
  return Boolean(transport());
}

/*
  Always returns a promise; resolves to null when the channel is unreachable or the handler
  rejected. None of the artwork or metadata fallbacks need to tell "no answer" from "answered with
  nothing"; a caller that does uses ipcCall.
*/
async function ipcInvoke(channel, ...args) {
  const route = transport();
  if (!route) return null;
  try {
    return await route.invoke(channel, ...args);
  } catch {
    return null;
  }
}

// Like ipcInvoke, but an unreachable channel or a rejected handler throws, so a caller can retry
// the lookup later instead of recording an empty answer as the truth.
async function ipcCall(channel, ...args) {
  const route = transport();
  if (!route) throw new Error(`IPC channel ${channel} is unreachable from this process`);
  return route.invoke(channel, ...args);
}

// Fire and forget. False when nothing could carry the message.
function ipcSend(channel, ...args) {
  const route = transport();
  if (!route) return false;
  try {
    route.send(channel, ...args);
    return true;
  } catch {
    return false;
  }
}

module.exports = { ipcInvoke, ipcCall, ipcSend, ipcAvailable, setRelay };
