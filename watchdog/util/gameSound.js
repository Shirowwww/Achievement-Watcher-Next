'use strict';

/*
  Read-only view of the sound a game's own panel picked (<userData>/cfg/gamePreset.json, written by
  app/util/gamePreset.js). The overlay popup already honours it in the app; the Watchdog needs it for
  the Windows notification, which would otherwise ring with the global sound for a game set to
  "no sound". Cached ~2s like progressMute.js, so a change in the app applies without a restart.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');

const SOUND_NONE = '__none__';
const SOUND_RANDOM = '__random__';
const CACHE_MS = 2000;
const SOUND_FILE_RE = /\.(?:wav|mp3|ogg|flac|m4a|aac)$/i;
const UNSAFE_NAME_RE = /[\\/:*?"<>|]/;

let cache = { at: 0, sounds: new Map() };

function file() {
  return path.join(userDataDir(), 'cfg', 'gamePreset.json');
}

// Same acceptance rule as gamePreset.normalizeSettings: a bare file name or one of the two keywords.
function safeSound(value) {
  const sound = String(value == null ? '' : value).trim();
  if (sound === SOUND_NONE || sound === SOUND_RANDOM) return sound;
  return SOUND_FILE_RE.test(sound) && !UNSAFE_NAME_RE.test(sound) ? sound : '';
}

function load() {
  const sounds = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [appid, settings] of Object.entries(parsed)) {
        const sound = settings && typeof settings === 'object' ? safeSound(settings.sound) : '';
        if (sound) sounds.set(String(appid), sound);
      }
    }
  } catch {
    // No file, or an unreadable one: every game uses the global sound.
  }
  return sounds;
}

// '' when the game has no sound of its own, else a file name, SOUND_NONE or SOUND_RANDOM.
function soundFor(appid) {
  if (appid == null || appid === '') return '';
  const now = Date.now();
  if (now - cache.at > CACHE_MS) cache = { at: now, sounds: load() };
  return cache.sounds.get(String(appid)) || '';
}

function _reset() {
  cache = { at: 0, sounds: new Map() };
}

module.exports = { SOUND_NONE, SOUND_RANDOM, file, soundFor, _reset };
