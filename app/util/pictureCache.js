'use strict';

/*
  Pictures of presets kept on disk, so the gallery shows them at once instead of rendering each one
  offscreen again in every session. A picture is keyed by the preset's name, the signature of its
  files and the sample it was drawn with: a changed preset or sample is a miss and is drawn again.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// About two hundred kilobytes each: a few hundred presets at most, many more than ship.
const DEFAULT_MAX = 300;
const KEY = /^[0-9a-f]{40}$/;

function createPictureCache({ dir, max = DEFAULT_MAX }) {
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

  return { keyOf, get, set };
}

module.exports = { createPictureCache };
