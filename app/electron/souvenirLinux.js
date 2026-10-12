'use strict';

const fs = require('fs');
const path = require('path');
const { createScreenshotTaker } = require('./screenCapture.js');
const { createClipRecorder } = require('./clipRecorder.js');

/*
  Linux souvenirs on the app side: the Watchdog asks for a screenshot or drives the software clip
  recorder over its IPC channel, because only this Electron process can reach the screen. Settings
  reads status() to say whether gpu-screen-recorder is installed and what the software recorder cost.
*/

const COST_FILE = 'clip-software-cost.json';
const GSR = 'gpu-screen-recorder';
const GSR_FLATPAK = 'com.dec05eba.gpu_screen_recorder';

function onPath(name, env) {
  return String(env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => {
      try {
        fs.accessSync(path.join(dir, name), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}

// Where gpu-screen-recorder was found: 'path', 'flatpak', or null.
function findGsr({ env = process.env, flatpakApps = ['/var/lib/flatpak/app', path.join(env.HOME || '', '.local/share/flatpak/app')] } = {}) {
  if (onPath(GSR, env)) return 'path';
  return flatpakApps.some((dir) => fs.existsSync(path.join(dir, GSR_FLATPAK))) ? 'flatpak' : null;
}

function createSouvenirService({ electron, userData, log }) {
  const { app, BrowserWindow, session, desktopCapturer, screen } = electron;
  const costFile = path.join(userData, COST_FILE);
  const recorder = createClipRecorder({
    BrowserWindow,
    session,
    desktopCapturer,
    screen,
    preload: path.join(__dirname, '..', 'clipRecorderPreload.js'),
    page: path.join(__dirname, '..', 'view', 'clipRecorder.html'),
    log,
    onCost: (cost) => fs.promises.writeFile(costFile, JSON.stringify(cost)).catch((err) => log(`[clip] cost not saved: ${err.message}`)),
  });
  const takeScreenshot = createScreenshotTaker({ desktopCapturer, screen, log, grabFrame: () => recorder.grabFrame() });

  function handle(msg) {
    if (msg.souvenirCapture) {
      takeScreenshot(msg.souvenirCapture);
      return;
    }
    const { action, settings, file } = msg.clipRecorder || {};
    if (action === 'start' && settings) recorder.start(settings, app);
    else if (action === 'stop') recorder.stop();
    else if (action === 'trigger') recorder.trigger(String(file || ''));
  }

  function status() {
    let softwareCost = null;
    try {
      softwareCost = JSON.parse(fs.readFileSync(costFile, 'utf8'));
    } catch {}
    return { gsr: findGsr(), softwareCost };
  }

  return { handle, status, stop: () => recorder.stop() };
}

module.exports = { createSouvenirService, findGsr };
