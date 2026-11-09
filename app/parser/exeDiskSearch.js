'use strict';

/*
  Finds executables by NAME across the drives, for games whose folder nothing else knows. The walk
  opens no file (reading files through a crack folder once had Defender delete loaders), follows no
  link, and says `truncated` when it runs out of budget, so nothing it saw is then taken as sure.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const listDrive = require(path.join(__dirname, '..', 'util', 'listDrive.js'));
const { COPY_DIRS, ENGINE_DATA_DIRS } = require(path.join(__dirname, 'exeDetect.js'));

const MAX_DIRECTORIES = 200000;
const TIME_LIMIT_MS = 60000;
const PARALLEL_LISTINGS = 8;

// Deep enough for C:\Program Files (x86)\Steam\steamapps\common\<Game>\<Project>\Binaries\Win64.
const MAX_DEPTH = 8;

// Folders that never hold a game a user installed, or that a walk must not enter.
const SKIPPED_DIRS =
  /^(?:Windows|AppData|ProgramData|WindowsApps|\$.*|System Volume Information|Recovery|Config\.Msi|PerfLogs|Microsoft|Microsoft SDKs|Windows Kits|Common Files|Reference Assemblies|dotnet|node_modules|__pycache__|site-packages|\.git|\.cache|\.npm|\.nuget|\.vscode|\.cargo|\.rustup|steam_settings|shadercache|_?CommonRedist|_?Redist)$/i;

// Every fixed drive on Windows; on Linux the home folder (Wine prefixes live there) and the disks
// mounted outside the system's own folders.
async function defaultRoots() {
  if (process.platform === 'win32') return (await listDrive({ ignoreSystemDrive: false })).map((drive) => `${drive}\\`);
  return [os.homedir(), ...(await listDrive({ ignoreSystemDrive: true }))];
}

async function findByName(names, { roots, maxDirectories = MAX_DIRECTORIES, timeLimitMs = TIME_LIMIT_MS } = {}) {
  const wanted = new Set((names || []).map((name) => String(name).toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return { found: [], truncated: false };
  const queue = [...(roots || (await defaultRoots()))];
  const depths = queue.map(() => 0);
  const deadline = Date.now() + timeLimitMs;
  const found = [];
  const list = (dir) => fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  // Breadth first, a few listings at a time: a cut keeps the shallow folders where games usually sit.
  for (let next = 0, batch = []; next < queue.length; next += batch.length) {
    if (next >= maxDirectories || Date.now() >= deadline) return { found, truncated: true };
    batch = queue.slice(next, next + PARALLEL_LISTINGS);
    // A drive that never answers (asleep, offline) ends the search at the deadline instead of holding it.
    const listings = await beforeDeadline(Promise.all(batch.map(list)), deadline);
    if (!listings) return { found, truncated: true };
    listings.forEach((entries, offset) => {
      const dir = batch[offset];
      const depth = depths[next + offset];
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (depth >= MAX_DEPTH || SKIPPED_DIRS.test(entry.name) || COPY_DIRS.test(entry.name) || ENGINE_DATA_DIRS.test(entry.name)) continue;
          queue.push(path.join(dir, entry.name));
          depths.push(depth + 1);
        } else if (entry.isFile() && wanted.has(entry.name.toLowerCase())) {
          found.push({ name: entry.name, full: path.join(dir, entry.name) });
        }
      }
    });
  }
  return { found, truncated: false };
}

// The promise's value, or null once the deadline passes first.
function beforeDeadline(promise, deadline) {
  let timer;
  const expiry = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

/*
  Games with no folder, looked for by the exe names their store declares (generic ones left out).
  `confirm(game, exePath)` answers the game folder (or a promise of it) when exeDetect is sure of
  that exe there; the files are confirmed one at a time, so the caller can yield between them. A game
  gets an exe only when exactly one file is confirmed for it and for no other game; a cut search
  assigns nothing. Answers { assigned: [{ game, exe, gameDir }], truncated }.
*/
async function findForFolderlessGames(games, { hintsFor, confirm, search = findByName, isGeneric = () => false } = {}) {
  const wanted = new Map();
  for (const game of games) {
    for (const name of hintsFor(game)) {
      if (isGeneric(name)) continue;
      const key = name.toLowerCase();
      if (!wanted.has(key)) wanted.set(key, []);
      if (!wanted.get(key).includes(game)) wanted.get(key).push(game);
    }
  }
  if (wanted.size === 0) return { assigned: [], truncated: false };
  const { found, truncated } = await search([...wanted.keys()]);
  if (truncated) return { assigned: [], truncated };
  const matches = new Map();
  const claims = new Map();
  for (const file of found) {
    for (const game of wanted.get(file.name.toLowerCase()) || []) {
      const gameDir = await confirm(game, file.full);
      if (!gameDir) continue;
      if (!matches.has(game)) matches.set(game, []);
      matches.get(game).push({ game, exe: file.full, gameDir });
      const key = file.full.toLowerCase();
      claims.set(key, (claims.get(key) || 0) + 1);
    }
  }
  const assigned = [...matches.values()]
    .filter((list) => list.length === 1 && claims.get(list[0].exe.toLowerCase()) === 1)
    .map((list) => list[0]);
  return { assigned, truncated };
}

module.exports = { findByName, findForFolderlessGames };
