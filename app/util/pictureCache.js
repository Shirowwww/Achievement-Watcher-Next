'use strict';

/*
  Pictures of presets kept on disk, so the gallery shows them at once instead of rendering each one
  offscreen again in every session. A picture is keyed by the preset's name, the signature of its
  files and the sample it was drawn with: a changed preset or sample is a miss and is drawn again.
  The bundled presets also ship one picture each (tools/presets/build-pictures.js), shown while
  the user's own is drawn.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// About two hundred kilobytes each: a few hundred presets at most, many more than ship.
const DEFAULT_MAX = 300;
const KEY = /^[0-9a-f]{40}$/;
const SHIPPED_DIR = path.join(__dirname, '..', 'resources', 'presetPictures');
const SHIPPED_FILE = /^[a-z0-9-]+\.png$/;

function readManifest(shippedDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(shippedDir, 'manifest.json'), 'utf8'));
    return parsed && parsed.pictures && typeof parsed.pictures === 'object' ? parsed.pictures : {};
  } catch {
    return {};
  }
}

function createPictureCache({ dir, max = DEFAULT_MAX, shippedDir = SHIPPED_DIR }) {
  const fileOf = (key) => (KEY.test(String(key)) ? path.join(dir, `${key}.json`) : null);

  function keyOf(name, signature, payload) {
    return crypto.createHash('sha1').update(JSON.stringify([String(name), String(signature), payload || {}])).digest('hex');
  }

  function get(key) {
    const file = fileOf(key);
    if (!file) return null;
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Only a picture this cache wrote: an image as an inline PNG, nothing that points elsewhere.
      if (!value || typeof value !== 'object' || !String(value.image).startsWith('data:image/png;base64,')) return null;
      const now = new Date();
      fs.utimesSync(file, now, now);
      return value;
    } catch {
      return null;
    }
  }

  // The oldest pictures go first, by last use.
  function prune() {
    let names;
    try {
      names = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
    } catch {
      return;
    }
    if (names.length <= max) return;
    const dated = names
      .map((name) => {
        try {
          return { name, at: fs.statSync(path.join(dir, name)).mtimeMs };
        } catch {
          return { name, at: 0 };
        }
      })
      .sort((a, b) => b.at - a.at);
    for (const { name } of dated.slice(max)) fs.rmSync(path.join(dir, name), { force: true });
  }

  function set(key, value) {
    const file = fileOf(key);
    if (!file || !value || !value.image) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value), 'utf8');
    prune();
  }

  let manifest = null;
  // The picture shipped for a bundled preset (its folder relative to the app), while its files are
  // still the ones it was drawn from; null otherwise.
  function shipped(name, signature) {
    if (!manifest) manifest = readManifest(shippedDir);
    const entry = Object.prototype.hasOwnProperty.call(manifest, name) ? manifest[name] : null;
    if (!entry || entry.signature !== signature || !SHIPPED_FILE.test(String(entry.file))) return null;
    try {
      const image = `data:image/png;base64,${fs.readFileSync(path.join(shippedDir, entry.file)).toString('base64')}`;
      return { image, card: entry.card || null, width: entry.width, height: entry.height };
    } catch {
      return null;
    }
  }

  return { keyOf, get, set, shipped };
}

module.exports = { createPictureCache, SHIPPED_DIR };
