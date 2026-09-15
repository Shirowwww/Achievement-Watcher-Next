'use strict';

/*
  Tell AW Next's own seeded runtime save apart from one the emulator actually wrote.

  goldberg.seedRuntimeSave() creates <GSE Saves>/<appid>/achievements.json with every achievement
  locked, so a freshly fixed game shows its full list before it has ever run. The side effect was a
  diagnosis that read like proof: "Runtime save found (gbe): 0/46 unlocked" states that the emulator
  is writing, when the only thing that ever wrote that file was AW Next itself. A packaged Unreal
  build whose dll is never loaded reports exactly the same line as a healthy setup, which is how a
  game that records nothing reached 3.10.5 still looking fine on screen.

  A marker beside the seeded file records what was written. While the file still matches it byte for
  byte, nothing else has touched it; the first time the emulator stores anything, the size and the
  checksum move and the save is real. The marker lives in the save folder rather than in userData so
  it survives a portable install, a userData migration and a second AW on the same machine - each a
  case where a central record would go stale and quietly start lying again.
*/

const fs = require('fs');
const path = require('path');
const { crc32 } = require('./crc32.js');

const MARKER_NAME = '.aw-seed.json';

function markerFile(saveFile) {
  if (!saveFile) return '';
  return path.join(path.dirname(saveFile), MARKER_NAME);
}

// Size plus checksum, not mtime: a repack's own tooling and several restore paths preserve
// timestamps, and an unlock written in the same filesystem tick as the seed would be invisible.
function fingerprint(file) {
  try {
    const buffer = fs.readFileSync(file);
    return { size: buffer.length, crc32: (crc32(buffer) >>> 0).toString(16) };
  } catch {
    return null;
  }
}

// Remember that AW Next wrote this save. Best-effort: a marker that cannot be written only costs
// the extra detail in a later report, never the seed itself.
function record(saveFile, extra = {}) {
  const marker = markerFile(saveFile);
  if (!marker) return false;
  const print = fingerprint(saveFile);
  if (!print) return false;
  try {
    fs.writeFileSync(marker, JSON.stringify({ file: path.basename(saveFile), ...print, ...extra, seededAt: Date.now() }, null, 2));
    return true;
  } catch {
    return false;
  }
}

function read(saveFile) {
  const marker = markerFile(saveFile);
  if (!marker) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/*
  Is this file still exactly the placeholder AW Next seeded? No marker means no (the emulator's own
  save, or one from a build that predates the marker), and so does any difference in size or
  checksum - which is precisely the moment the emulator first wrote to it.
*/
function isUntouchedSeed(saveFile) {
  const marker = read(saveFile);
  if (!marker) return false;
  const print = fingerprint(saveFile);
  if (!print) return false;
  return Number(marker.size) === print.size && String(marker.crc32) === print.crc32;
}

function clear(saveFile) {
  const marker = markerFile(saveFile);
  if (!marker) return false;
  try {
    fs.rmSync(marker, { force: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = { MARKER_NAME, markerFile, fingerprint, record, read, isUntouchedSeed, clear };
