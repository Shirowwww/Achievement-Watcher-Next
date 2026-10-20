'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

/*
  The Watchdog's toast sounds on Windows play here, through Chromium like the popup's own sound: a
  Watchdog starting PowerShell to play a file is what antivirus engines block. Each sound gets a
  hidden window that never takes the focus and is destroyed when the sound ends.
*/

const PAGE = path.join(__dirname, '..', 'view', 'sound.html');
// A file that never ends, or a decoder that hangs, must not keep a renderer alive.
const MAX_SOUND_MS = 30000;
// Each sound is a renderer: a burst of unlocks plays the first few, not one window per unlock.
const MAX_PLAYING = 3;

function clampVolume(volume) {
  const n = Number(volume);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

// Bundled sounds live under app.asar.unpacked in packaged builds.
function soundUrl(file) {
  return pathToFileURL(String(file).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')).href;
}

// Resolves with 'ended' or the reason the sound did not play; it never rejects.
function playScript(url, volume) {
  return (
    `new Promise((resolve) => { const a = new Audio(${JSON.stringify(url)}); a.volume = ${volume};` +
    " a.onended = () => resolve('ended'); a.onerror = () => resolve('cannot decode the file');" +
    ' a.play().catch((e) => resolve(String(e && e.message))); })'
  );
}

function createSoundPlayer({ BrowserWindow, log = () => {}, page = PAGE, maxMs = MAX_SOUND_MS }) {
  let playing = 0;

  function play(request) {
    const file = request && typeof request.file === 'string' ? request.file : '';
    if (!path.isAbsolute(file)) return Promise.resolve('no file');
    if (playing >= MAX_PLAYING) {
      log(`[notify] toast sound skipped, ${playing} already playing: ${file}`);
      return Promise.resolve('busy');
    }
    const win = new BrowserWindow({
      show: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    playing += 1;
    let timer = null;
    const outcome = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timed out'), maxMs);
      win.webContents.once('did-finish-load', () => {
        win.webContents.executeJavaScript(playScript(soundUrl(file), clampVolume(request.volume))).then(resolve, (err) => resolve(err.message || String(err)));
      });
      win.loadFile(page).catch((err) => resolve(err.message || String(err)));
    });
    return outcome.then((result) => {
      playing -= 1;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.destroy();
      if (result !== 'ended') log(`[notify] toast sound not played (${result}): ${file}`);
      return result;
    });
  }

  return { play };
}

module.exports = { createSoundPlayer, soundUrl, clampVolume };
