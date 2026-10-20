'use strict';

/*
  Presets are arbitrary HTML, so the transparent room around each card is measured by rendering the
  preset offscreen (see util/notificationInsets.js): once per preset version and position, in the
  background after its first popup, stored in <userData>/cfg/presetInsets.json. A preset whose card
  follows its text (Indiana, PS5 Steam, Slim) is also rendered with each popup's own text first.
*/

const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { paintedInsets, mergeInsets } = require('../util/notificationInsets.js');

// Bumped when the measurement itself changes, so every stored profile is taken again.
const MEASURE_VERSION = 5;
// Every bundled preset settles by 2.7s and none starts leaving before 4.7s.
const PROFILE_STEP_MS = 300;
const PROFILE_END_MS = 3300;
// A card counts as following its text when one side moves by more than this between the samples.
const VARIABLE_PX = 2;
// Out of the way of the popup that asked for the measurement, which is still entering.
const MEASURE_DELAY_MS = 8000;
const LOAD_TIMEOUT_MS = 8000;
// Every bundled preset has settled by then (see PROFILE_END_MS).
const SNAPSHOT_FALLBACK_MS = 2800;
const SIDES = ['left', 'top', 'right', 'bottom'];

// A short and a long text: the smaller room of the two never pushes a card off the screen.
function samplePayloads(imageUrl, position) {
  const base = { iconPath: imageUrl, gameIconPath: imageUrl, imagePath: imageUrl, headerPath: imageUrl, notificationType: 'achievement', position, scale: 1, fallback: {} };
  return [
    { ...base, displayName: 'Unlocked', description: '', gameName: 'Game', rarityPercent: 40 },
    {
      ...base,
      displayName: 'A considerably longer achievement title than most games use',
      description: 'A long description that wraps over more than one line in most presets, as some games write them.',
      gameName: 'A game with a fairly long name',
      rarityPercent: 3,
    },
  ];
}

function filesSignature(dirs) {
  const parts = [String(MEASURE_VERSION)];
  for (const dir of dirs.filter(Boolean)) {
    let names = [];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      parts.push(`${dir}:missing`);
      continue;
    }
    for (const name of names) {
      try {
        const stat = fs.statSync(path.join(dir, name));
        parts.push(`${name}:${stat.size}:${Math.round(stat.mtimeMs)}`);
      } catch {}
    }
  }
  return parts.join('|');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameRoom = (a, b) => Boolean(a && b) && SIDES.every((side) => Math.abs(a[side] - b[side]) <= 1);

// The card once it stopped moving, and when it did: the first sample from which all later ones match.
function settled(samples) {
  const painted = samples.filter((sample) => sample.room);
  if (!painted.length) return null;
  const last = painted[painted.length - 1];
  let settleMs = last.at;
  for (let i = painted.length - 1; i >= 0 && sameRoom(painted[i].room, last.room); i--) settleMs = painted[i].at;
  return { room: last.room, settleMs };
}

/**
 * @param {{ cacheFile: string, preloadPath: string, imagePath: string,
 *   dimensions: (folder: string) => { width: number, height: number },
 *   prepare: (win: BrowserWindow, layer: object|null) => void, log: (line: string) => void }} options
 */
function createPresetInsets({ cacheFile, preloadPath, imagePath, dimensions, prepare, log }) {
  let cache = null;
  // Measured or tried this session: a preset that fails is not measured again until the next start.
  const attempted = new Set();
  let queue = Promise.resolve();
  const imageUrl = 'file:///' + String(imagePath).replace(/\\/g, '/');

  function readCache() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      cache = {};
    }
    return cache;
  }

  function writeCache() {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');
    } catch (err) {
      log(`[overlay-notif] preset insets not saved: ${err.message || err}`);
    }
  }

  // Some presets read `position` and move their card inside the window: one profile per position.
  const keyOf = (folder, layer, position) => `${folder}|${(layer && layer.dir) || ''}|${position || ''}`;

  // Renders `payload` offscreen and returns read(image, ratio) for a capture taken at each of `times`.
  async function renderOffscreen(folder, layer, payload, times, read) {
    const { width, height } = dimensions(folder);
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: { offscreen: true, preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    try {
      win.webContents.setAudioMuted(true);
      prepare(win, layer);
      const loaded = new Promise((resolve, reject) => {
        win.webContents.once('did-finish-load', resolve);
        win.webContents.once('did-fail-load', (event, code, description) => reject(new Error(description || String(code))));
      });
      // A failed load is reported by did-fail-load or by the timeout below.
      win.loadFile(path.join(folder, 'index.html')).catch(() => {});
      await Promise.race([loaded, wait(LOAD_TIMEOUT_MS).then(() => Promise.reject(new Error('load timeout')))]);
      win.webContents.setZoomFactor(1);
      win.webContents.send('show-notification', payload);
      const sentAt = Date.now();
      const samples = [];
      for (const at of times) {
        await wait(Math.max(0, at - (Date.now() - sentAt)));
        if (win.isDestroyed()) break;
        // The first offscreen frame of a cold process may not be ready (UnknownVizError): nothing then.
        const image = await win.webContents.capturePage().catch(() => null);
        const size = image && !image.isEmpty() ? image.getSize() : null;
        // Offscreen captures follow the display scale.
        samples.push({ at, value: size ? read(image, size.width / width || 1) : null });
      }
      return samples;
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  // The painted room (CSS pixels, or null) at each of `times`.
  async function renderSamples(folder, layer, payload, times) {
    const samples = await renderOffscreen(folder, layer, payload, times, (image, ratio) => {
      const { width, height } = image.getSize();
      const room = paintedInsets(image.toBitmap(), width, height);
      return room ? Object.fromEntries(SIDES.map((side) => [side, Math.floor(room[side] / ratio)])) : null;
    });
    return samples.map(({ at, value }) => ({ at, room: value }));
  }

  async function takeProfile(folder, layer, position) {
    const times = [];
    for (let at = PROFILE_STEP_MS; at <= PROFILE_END_MS; at += PROFILE_STEP_MS) times.push(at);
    const results = [];
    for (const payload of samplePayloads(imageUrl, position)) {
      const samples = await renderSamples(folder, layer, payload, times).catch((err) => {
        log(`[overlay-notif] preset insets sample failed for ${path.basename(folder)}: ${err.message || err}`);
        return [];
      });
      results.push(settled(samples));
    }
    if (!results.every(Boolean)) return;
    const rooms = results.map((result) => result.room);
    const profile = {
      insets: mergeInsets(rooms),
      variable: SIDES.some((side) => Math.abs(rooms[0][side] - rooms[1][side]) > VARIABLE_PX),
      settleMs: Math.max(...results.map((result) => result.settleMs)),
    };
    readCache()[keyOf(folder, layer, position)] = { signature: filesSignature([folder, layer && layer.dir]), profile };
    writeCache();
    const { left, top, right, bottom } = profile.insets;
    log(`[overlay-notif] preset insets ${path.basename(folder)}${layer ? ' +layer' : ''} ${position}: ${left}/${top}/${right}/${bottom}${profile.variable ? ' (follows its text)' : ''}`);
  }

  return {
    // The stored profile ({ insets, variable, settleMs }) for this preset and position, or null.
    get(folder, layer, position) {
      const entry = readCache()[keyOf(folder, layer, position)];
      return entry && entry.signature === filesSignature([folder, layer && layer.dir]) ? entry.profile : null;
    },
    // Queues one profile per preset and position; they run one after another, never in parallel.
    measureLater(folder, layer, position) {
      const key = keyOf(folder, layer, position);
      if (!folder || attempted.has(key)) return;
      attempted.add(key);
      queue = queue
        .then(() => wait(MEASURE_DELAY_MS))
        .then(() => takeProfile(folder, layer, position))
        .catch((err) => log(`[overlay-notif] preset insets failed for ${path.basename(folder)}: ${err.message || err}`));
    },
    // The room for one popup's own text, for a preset whose card follows it: about half a second for
    // the presets that do. Falls back to the profile's room, which never pushes a card off the screen.
    async measureText(folder, layer, payload, profile) {
      const times = [profile.settleMs + 150, profile.settleMs + 350];
      const samples = await renderSamples(folder, layer, payload, times).catch((err) => {
        log(`[overlay-notif] preset insets for this popup failed: ${err.message || err}`);
        return [];
      });
      return mergeInsets(samples.map((sample) => sample.room)) || profile.insets;
    },
    /*
      A picture of the preset once it has settled (PNG data URL, or null), for a preset the designer
      cannot rebuild from its controls (an imported SAN theme). Waits as long as the stored profile
      says the card takes to settle, else as long as the slowest bundled preset.
    */
    async snapshot(folder, layer, payload) {
      const profile = this.get(folder, layer, payload.position || 'center-bottom');
      const at = profile ? profile.settleMs + 150 : SNAPSHOT_FALLBACK_MS;
      const samples = await renderOffscreen(folder, layer, payload, [at], (image) => image.toDataURL()).catch((err) => {
        log(`[overlay-notif] preset snapshot failed for ${path.basename(folder)}: ${err.message || err}`);
        return [];
      });
      const sample = samples[0];
      return sample && sample.value ? { image: sample.value, ...dimensions(folder) } : null;
    },
  };
}

module.exports = { createPresetInsets };
