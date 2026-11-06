'use strict';

// Where the Watchdog finds notification sounds, so Windows toasts play the same file (and honor the
// same volume) as the in-game overlay. Which sound plays is the app's rule (util/notificationSounds.js).

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const sounds = require(sharedAppModulePath('util/notificationSounds.js'));

function bundledSoundsDir() {
  if (process.env.AW_SOUNDS_DIR) {
    try {
      if (fs.statSync(process.env.AW_SOUNDS_DIR).isDirectory()) return process.env.AW_SOUNDS_DIR;
    } catch {
      /* fall through to the layout probes */
    }
  }
  // Dev checkout: watchdog/../app/sounds. Packaged: the watchdog sits inside app/, so
  // watchdog/../sounds is the app's sounds folder.
  for (const candidate of [path.join(__dirname, '../../app/sounds'), path.join(__dirname, '../sounds')]) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      /* try the next layout */
    }
  }
  return '';
}

function userSoundsDir() {
  return path.join(userDataDir(), 'sounds');
}

// A user-imported file shadows a bundled one of the same name, as in the app.
function resolveSoundFile(name) {
  if (!name) return '';
  for (const candidate of [name, sounds.renamedSound(name)]) {
    if (!candidate) continue;
    for (const dir of [userSoundsDir(), bundledSoundsDir()]) {
      try {
        const file = path.join(dir, candidate);
        if (fs.existsSync(file)) return file;
      } catch {
        /* try the next location */
      }
    }
  }
  return '';
}

const soundDirs = () => [bundledSoundsDir(), userSoundsDir()];
const pickRandomSound = () => sounds.pickRandomSound(soundDirs());

// The main sound, or a random one when Settings asks for it (test buttons, the OBS source).
function mainSound(overlay) {
  const ov = overlay || {};
  return sounds.chooseSound({ random: ov.randomSound === true, mainSound: ov.notificationSound }, { resolve: resolveSoundFile, pickRandom: pickRandomSound });
}

module.exports = {
  bundledSoundsDir,
  mainSound,
  NO_SOUND: sounds.NO_SOUND,
  tierSound: sounds.tierSound,
  emulatorSound: sounds.emulatorSound,
  chooseSound: (choice) => sounds.chooseSound(choice, { resolve: resolveSoundFile, pickRandom: pickRandomSound }),
};
