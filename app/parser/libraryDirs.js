'use strict';

const path = require('path');
const fs = require('fs');
const saveRoots = require(path.join(__dirname, 'saveRoots.js'));
const launcherLibraries = require(path.join(__dirname, 'launcherLibraries.js'));
const listDrive = require(path.join(__dirname, '..', 'util', 'listDrive.js'));
// The same key the scan scope compares folders with, so a trailing separator or a drive-letter case
// difference never turns one folder into two entries here either.
const { directoryKey } = require(path.join(__dirname, 'scanScope.js'));

// Library roots (e.g. C:\Jeux, D:\Games, E:\SteamLibrary): folders that hold many game install
// dirs, used by achievements.js as scan roots for Goldberg/GBE/unconfigured install detection.
// Distinct from userDir.js, which stores per-game SAVE folders validated against known emulator
// marker files - a library root has no such marker, it's just a folder full of game subfolders.
let file;

function normalizeEntries(data, fallbackOrigin = 'manual') {
  const out = [];
  for (const raw of Array.isArray(data) ? data : []) {
    const entry = typeof raw === 'string' ? { path: raw, origin: fallbackOrigin, enabled: true } : { ...raw };
    entry.path = String(entry.path || '').trim();
    if (!entry.path) continue;
    if (!['manual', 'auto'].includes(entry.origin)) entry.origin = fallbackOrigin;
    if (typeof entry.enabled !== 'boolean') entry.enabled = true;
    if (out.some((item) => directoryKey(item.path) === directoryKey(entry.path))) continue;
    out.push(entry);
  }
  return out;
}

module.exports.setUserDataPath = async (p) => {
  file = path.join(p, 'cfg/librarydirs.db');
};

// Quarantine a corrupted config file (rename to <file>.corrupt-<timestamp>) so its raw bytes are
// preserved for manual recovery while a clean default is written in its place.
function quarantineCorruptConfig(f, err) {
  try {
    const backup = `${f}.corrupt-${Date.now()}`;
    fs.renameSync(f, backup);
    console.warn(`[libraryDirs] corrupt config ${f} (${err.message}); quarantined to ${backup}, reseeding defaults`);
  } catch (e) {
    try { fs.unlinkSync(f); } catch {}
    console.warn(`[libraryDirs] corrupt config ${f} (${err.message}); could not quarantine (${e.message}), overwriting`);
  }
}

module.exports.get = async () => {
  return (await module.exports.getEntries()).filter((entry) => entry.enabled).map((entry) => entry.path);
};

module.exports.getEntries = async () => {
  try {
    if (!fs.existsSync(file)) {
      // Smart Find owns automatic additions so every detected root is presented to the user first.
      await module.exports.save([]);
      return [];
    }
    const raw = fs.readFileSync(file, 'utf8');
    try {
      return normalizeEntries(JSON.parse(raw));
    } catch (parseErr) {
      // Genuine corruption (e.g. a write interrupted by a crash/power loss). A transient I/O lock
      // throws before JSON.parse and is handled by the outer catch - so we never quarantine a good
      // file just because antivirus/the indexer held it open for a moment.
      quarantineCorruptConfig(file, parseErr);
      try { await module.exports.save([]); } catch {}
      return [];
    }
  } catch (err) {
    // I/O error (file locked, permission issue, …) - degrade without destroying the file.
    console.warn(`[libraryDirs] could not read ${file}: ${err.message}`);
    return [];
  }
};

module.exports.find = async () => {
  return (await module.exports.findEntries()).map((entry) => entry.path);
};

/*
  Every automatically detected library root, from two independent routes so neither one's blind spot
  is the user's problem:

    - saveRoots.discoverLibraryRoots() recognises folders by NAME ("Games", "Jeux", "Repacks", ...)
      on every fixed drive, the user profile and the Desktop.
    - launcherLibraries reads the folders a LAUNCHER already recorded (Epic manifests, the GOG and
      Ubisoft registry indexes, the .GamingRoot pointer), which is how a library named after a
      storefront - "D:\Epic Games", "D:\XboxGames" - is found without scanning anything.

  The name route wins a tie, since its detector label is the more specific one for a folder the user
  named themselves. Nothing here is added silently: Smart Find presents every hit for approval.
*/
module.exports.findEntries = async () => {
  const entries = [];
  const seen = new Set();
  const add = (dir, detector) => {
    if (!dir) return;
    const key = directoryKey(dir);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({ path: dir, origin: 'auto', enabled: true, detector });
  };

  for (const dir of await saveRoots.discoverLibraryRoots()) add(dir, 'Known games folder');

  let drives = [];
  try {
    drives = await listDrive({ ignoreSystemDrive: false });
  } catch {
    drives = [];
  }
  try {
    for (const entry of launcherLibraries.discoverLauncherLibraryRoots({ drives })) add(entry.path, entry.detector);
  } catch (err) {
    // A launcher whose configuration cannot be read must not take the name-based route down with it.
    console.warn(`[libraryDirs] launcher-derived roots unavailable: ${err.message || err}`);
  }

  return entries;
};

module.exports.save = async (data) => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(normalizeEntries(data), null, 2), 'utf8');
  } catch (err) {
    throw err;
  }
};
