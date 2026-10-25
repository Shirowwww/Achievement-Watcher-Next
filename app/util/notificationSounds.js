'use strict';

// Shared sound-file helpers for notification audio: .wav/.mp3/.ogg now also accept .flac/.m4a/.aac,
// which Windows Media Foundation can play.

const fs = require('fs');
const path = require('path');

const SOUND_EXT_RE = /\.(?:wav|mp3|ogg|flac|m4a|aac)$/i;

/*
  Bundled sounds renamed in 3.9.3 for a consistent dropdown ("Playstation5" -> "PlayStation 5",
  "Xbox.v1" -> "Xbox Classic"). A settings file written before that still names the old file, so the
  old name has to keep resolving or every one of those users silently loses their sound.
*/
const RENAMED_SOUNDS = {
  'Playstation.wav': 'PlayStation.wav',
  'Playstation5.wav': 'PlayStation 5.wav',
  'Playstation5 Platinum.wav': 'PlayStation 5 Platinum.wav',
  'Xbox.v1.wav': 'Xbox Classic.wav',
  // "Steam" and "Steam Original" were the same sound twice; only Steam Original ships now.
  'Steam.wav': 'Steam Original.wav',
};

// Current name for a sound the user may have picked under an older name; '' when it was not renamed.
function renamedSound(name) {
  return RENAMED_SOUNDS[String(name || '')] || '';
}

// List sound files across the given directories. User-imported dirs listed AFTER bundled dirs shadow
// same-named bundled files (callers pass [bundledSoundsDir, userSoundsDir]).
function listSoundFiles(dirs) {
  const byName = new Map();
  for (const dir of [].concat(dirs || [])) {
    if (!dir) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!SOUND_EXT_RE.test(name)) continue;
      byName.set(name, path.join(dir, name));
    }
  }
  return [...byName.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([name, file]) => ({ name, file }));
}

// Pick a uniformly random sound file from the merged list; '' when none are available.
function pickRandomSound(dirs) {
  const list = listSoundFiles(dirs);
  if (list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)].file;
}

// The sound picked for a rare unlock, a 100% completion (#109) or a progress popup. '' means "same
// as unlocks", NO_SOUND means silent. Playtime popups never take one.
const NO_SOUND = '__none__';

function tierSound(overlay, { notificationType = '', rarityPercent = null } = {}) {
  const ov = overlay || {};
  const type = String(notificationType || '').toLowerCase();
  if (type === 'platinum') return String(ov.notificationSoundPlatinum || '');
  if (type === 'progress') return String(ov.notificationSoundProgress || '');
  if (type === 'playtime') return '';
  const rare = rarityPercent != null && rarityPercent !== '' && Number.isFinite(Number(rarityPercent));
  return rare ? String(ov.notificationSoundRare || '') : '';
}

// The sound picked for one emulator (notificationPreset.sourcePlatform), standing in for the main
// unlock sound. '' means "same as the main one", NO_SOUND means silent.
const EMULATOR_SOUND_KEYS = {
  xenia: 'notificationSoundXenia',
  rpcs3: 'notificationSoundRpcs3',
  shadps4: 'notificationSoundShadps4',
  kytyps5: 'notificationSoundKytyps5',
};

function emulatorSound(overlay, platform) {
  const key = EMULATOR_SOUND_KEYS[String(platform || '')];
  return key ? String((overlay || {})[key] || '') : '';
}

module.exports = {
  SOUND_EXT_RE,
  RENAMED_SOUNDS,
  NO_SOUND,
  EMULATOR_SOUND_KEYS,
  renamedSound,
  listSoundFiles,
  pickRandomSound,
  tierSound,
  emulatorSound,
};
