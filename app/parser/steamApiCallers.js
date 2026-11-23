'use strict';

/*
  Does the game name its own Steam interface versions? From SDK 1.37 (2016) on, the game asks for
  each interface by version (SteamAPI_SteamUserStats_v012, SteamInternal_FindOrCreateUserInterface),
  so GBE serves it without steam_interfaces.txt. Older games call bare accessors (SteamUserStats)
  and need that list. The names live in the game's own binaries: its exe, GameAssembly.dll (IL2CPP)
  or a Unity Managed dll (Steamworks.NET). A steam_api dll is skipped: a crack's exports carry them too.
*/

const fs = require('fs');
const path = require('path');

const MARKER = /SteamAPI_Steam[A-Za-z]+_v\d{3}|SteamInternal_FindOrCreateUserInterface|SteamInternal_ContextInit/;
const CHUNK = 4 * 1024 * 1024;
const OVERLAP = 64;
const MAX_DEPTH = 4;
const MAX_FILES = 400;

function isCandidate(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith('steam_api')) return false;
  return lower.endsWith('.exe') || lower === 'gameassembly.dll' || /steamworks|assembly-csharp|facepunch/.test(lower);
}

function containsMarker(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(CHUNK + OVERLAP);
    let carry = 0;
    for (;;) {
      const read = fs.readSync(fd, buf, carry, CHUNK, null);
      if (read <= 0) return false;
      if (MARKER.test(buf.toString('latin1', 0, carry + read))) return true;
      buf.copy(buf, 0, carry + read - OVERLAP, carry + read);
      carry = OVERLAP;
    }
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function candidateFiles(root) {
  const files = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0 && files.length < MAX_FILES) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < MAX_DEPTH && !entry.name.startsWith('.')) queue.push({ dir: full, depth: depth + 1 });
      else if (entry.isFile() && isCandidate(entry.name)) files.push(full);
    }
  }
  return files;
}

function namesItsInterfaces(gameDir) {
  if (!gameDir) return false;
  return candidateFiles(gameDir).some(containsMarker);
}

module.exports = { namesItsInterfaces };
