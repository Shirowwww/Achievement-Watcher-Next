'use strict';

/*
  The files that give a recompiled port away in a game library, for Smart Find's one walk of it:
  names only, nothing is opened here. Each names how far up the port's own folder sits; the port's
  reader then decides (userDir.js ownLayoutGames). A program counts only when a reader knows it.
*/

const path = require('path');
const x360Ports = require(path.join(__dirname, 'x360Ports.js'));
const recompPortTable = require(path.join(__dirname, 'recompPortTable.js'));
const { pathKey } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

// [glob, the same file as a test on its path relative to the library, folders up to the port]
const FILES = [
  ['**/run.py', /(^|\/)run\.py$/i, 0], // PS4 ports on the run.py runner
  ['**/trophy.key', /(^|\/)trophy\.key$/i, 0], // native PS4 ports
  ['**/rcps4-probe.exe', /(^|\/)rcps4-probe\.exe$/i, 0], // ReCasted, Windows
  ['**/rcps4-gpu', /(^|\/)rcps4-gpu$/i, 0], // ReCasted, Linux
  ['**/out/boot-linked.bin', /(^|\/)out\/boot-linked\.bin$/i, 1],
  ['**/tools/probe_*.py', /(^|\/)tools\/probe_[^/]+\.py$/i, 1], // BilalReloaded's runtime
  ['**/launcher/*.{py,pyw,png,ico}', /(^|\/)launcher\/[^/]+\.(?:pyw?|png|ico)$/i, 1],
  ['**/user/trophies/*/trophies.tsv', /(^|\/)user\/trophies\/[^/]+\/trophies\.tsv$/i, 3],
  ['**/installer/launch.txt', /(^|\/)installer\/launch\.txt$/i, 1], // PS3Recomp
  ['**/ps3recomp.toml', /(^|\/)ps3recomp\.toml$/i, 0],
];
// Programs: Windows, AppImage and bare Linux binaries, kept only when a port table names them.
const PROGRAM_GLOBS = ['**/*.{exe,appimage,x86_64,arm64}', '**/!(*.*)'];

const GLOBS = [...FILES.map(([glob]) => glob), ...PROGRAM_GLOBS];

function isPortProgram(name) {
  return x360Ports.isPortExe(name) || x360Ports.isNativePortExe(name) || recompPortTable.some((port) => port.exe.test(name));
}

// The folder a matched file points at, relative to the library ('' for the library itself), or null.
function portFolderOf(relative) {
  const parts = String(relative).split('/');
  const rule = FILES.find(([, test]) => test.test(relative));
  const up = rule ? rule[2] : isPortProgram(parts[parts.length - 1]) ? 0 : -1;
  if (up < 0 || parts.length - 1 - up < 0) return null;
  return parts.slice(0, parts.length - 1 - up).join('/');
}

// Every port folder the matched files of one library point at, each once, as absolute paths.
function portFolders(root, relatives) {
  const folders = new Set();
  for (const relative of relatives) {
    const folder = portFolderOf(relative);
    if (folder) folders.add(path.resolve(root, folder));
  }
  return [...folders];
}

// Folders inside a port that point at it from one level down: out/boot-linked.bin, tools/probe_*.py...
const PORT_SUBFOLDERS = new Set(['out', 'tools', 'launcher', 'installer']);

// Whether one listing of a folder's top looks like a port's, for its reader to confirm.
function looksLikePort(entries) {
  return (entries || []).some((entry) => {
    if (entry.isDirectory()) return PORT_SUBFOLDERS.has(entry.name.toLowerCase());
    return entry.isFile() && portFolderOf(`port/${entry.name}`) === 'port';
  });
}

/*
  The game folders straight under each game library whose top looks like a port's: one listing each,
  through the scan's `readdir` (Dirent[] or null). A folder `isWatched` already says is read is left out.
*/
function libraryPorts(roots, readdir, isWatched = () => false) {
  const found = [];
  for (const root of roots) {
    for (const entry of readdir(root) || []) {
      const dir = path.join(root, entry.name);
      if (entry.isDirectory() && !isWatched(dir) && looksLikePort(readdir(dir))) found.push(dir);
    }
  }
  return found;
}

// Whether `dir` is one of `roots` or inside one, compared the way the platform compares paths.
function isUnder(dir, roots) {
  const key = pathKey(dir);
  return roots.some((root) => key === pathKey(root) || key.startsWith(pathKey(root) + path.sep));
}

module.exports = { GLOBS, portFolderOf, portFolders, libraryPorts, isUnder };
