'use strict';

/*
  Where an RPCS3 installation actually keeps its trophies.

  The reader used to assume <emulator>/dev_hdd0/home/<user>/trophy, which is only RPCS3's DEFAULT.
  Two supported settings move it, and both are ordinary for anyone who keeps the emulator on one
  drive and its virtual PS3 disk on another:

    - the configuration root is <emulator>/portable when that folder exists (RPCS3's portable mode),
      or whatever RPCS3_CONFIG_DIR names;
    - vfs.yml remaps "/dev_hdd0/" to any absolute path, or to a $(EmulatorDir)-relative one, and
      $(EmulatorDir) itself can be redefined in the same file.

  Reading the two files RPCS3 reads is a small, stable contract, and it replaces guessing entirely:
  the same precedence the emulator applies is applied here.
*/

const fs = require('fs');
const path = require('path');

const DEV_HDD0_KEY = '/dev_hdd0/';
const EMULATOR_DIR_KEY = '$(EmulatorDir)';

function normalize(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  let resolved;
  try {
    resolved = path.resolve(raw);
  } catch {
    return raw;
  }
  const root = path.parse(resolved).root;
  return resolved === root ? resolved : resolved.replace(/[\\/]+$/, '');
}

function isDirectory(dir) {
  try {
    return !!dir && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// Strip a YAML comment, but only when the '#' starts a token - a '#' inside a path is part of it.
function stripComment(line) {
  const text = String(line == null ? '' : line);
  const match = /(^|\s)#/.exec(text);
  return match ? text.slice(0, match.index + match[1].length) : text;
}

function unquote(value) {
  const text = String(value == null ? '' : value).trim();
  if (text.length >= 2 && ((text[0] === '"' && text.endsWith('"')) || (text[0] === "'" && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

/*
  The configuration root RPCS3 would use for an emulator folder: an explicit RPCS3_CONFIG_DIR wins,
  then the portable-mode subfolder, then the emulator folder itself.
*/
function resolveConfigRoot(emulatorRoot, { env = process.env } = {}) {
  const configured = String((env && env.RPCS3_CONFIG_DIR) || '').trim();
  if (configured) return normalize(configured);
  const root = normalize(emulatorRoot);
  if (!root) return '';
  const portable = path.join(root, 'portable');
  return isDirectory(portable) ? portable : root;
}

// Both places RPCS3 has kept vfs.yml, most recent first.
function vfsFiles(configRoot) {
  const root = normalize(configRoot);
  if (!root) return [];
  return [path.join(root, 'config', 'vfs.yml'), path.join(root, 'vfs.yml')];
}

/*
  The unindented top-level key/value pairs of a vfs.yml. Indented lines belong to the Devices
  section, which maps discs rather than the internal drives, and are skipped on purpose.
*/
function parseVfsMap(text) {
  const map = new Map();
  for (const rawLine of String(text == null ? '' : text).split(/\r?\n/)) {
    if (!rawLine || /^\s/.test(rawLine)) continue;
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = unquote(line.slice(0, separator));
    // A "!!str" tag can precede the value in files RPCS3 wrote itself.
    const value = unquote(line.slice(separator + 1).trim().replace(/^!!str\s+/, ''));
    if (key) map.set(key, value);
  }
  return map;
}

// One vfs.yml value expanded against its emulator directory, exactly as RPCS3 expands it.
function expandMapping(value, emulatorDir) {
  let expanded = String(value == null ? '' : value).trim();
  if (!expanded) return '';
  if (expanded.toLowerCase().startsWith(EMULATOR_DIR_KEY.toLowerCase())) {
    const remainder = expanded.slice(EMULATOR_DIR_KEY.length).replace(/^[\\/]+/, '');
    expanded = remainder ? path.join(emulatorDir || '', remainder) : emulatorDir || '';
  } else if (!path.isAbsolute(expanded) && emulatorDir) {
    expanded = path.join(emulatorDir, expanded);
  }
  return normalize(expanded);
}

/*
  The dev_hdd0 root a vfs.yml declares, or '' when no file declares one. Returned separately from
  resolveDevHdd0Root() so a caller can tell "relocated" from "left at the default".
*/
function readVfsDevHdd0Root(configRoot, { readFileSync = fs.readFileSync } = {}) {
  for (const file of vfsFiles(configRoot)) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const map = parseVfsMap(text);
    const devHdd0 = map.get(DEV_HDD0_KEY);
    // The first vfs.yml found is authoritative even when it carries no mapping: falling through to
    // the next file would read a configuration RPCS3 itself is not using.
    if (!devHdd0 || !devHdd0.trim()) return '';
    const emulatorDirOverride = map.get(EMULATOR_DIR_KEY);
    const emulatorDir = emulatorDirOverride && emulatorDirOverride.trim() ? normalize(emulatorDirOverride) : normalize(configRoot);
    return expandMapping(devHdd0, emulatorDir);
  }
  return '';
}

function resolveDevHdd0Root(emulatorRoot, options = {}) {
  const configRoot = resolveConfigRoot(emulatorRoot, options);
  if (!configRoot) return '';
  return readVfsDevHdd0Root(configRoot, options) || path.join(configRoot, 'dev_hdd0');
}

function trophyRootsUnder(devHdd0) {
  if (!devHdd0) return [];
  const home = path.join(devHdd0, 'home');
  let entries;
  try {
    entries = fs.readdirSync(home, { withFileTypes: true });
  } catch {
    return [];
  }
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const trophy = path.join(home, entry.name, 'trophy');
    if (isDirectory(trophy)) roots.push({ user: entry.name, path: trophy });
  }
  return roots;
}

/*
  Every <dev_hdd0>/home/<user>/trophy folder that exists, for one watched folder. Users are the
  numeric profile folders RPCS3 creates; anything else in home/ is not a profile.

  Two anchors, because a relocated virtual disk is a folder the user can reasonably add on its own:
  the dev_hdd0 the configuration resolves to, and the watched folder itself when it already looks
  like a dev_hdd0 (it holds home/). Neither is a guess - both are checked against a real profile.
*/
function trophyRoots(emulatorRoot, options = {}) {
  const roots = [];
  const seen = new Set();
  for (const devHdd0 of [resolveDevHdd0Root(emulatorRoot, options), normalize(emulatorRoot)]) {
    for (const root of trophyRootsUnder(devHdd0)) {
      const key = root.path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push(root);
    }
  }
  return roots;
}

module.exports = {
  expandMapping,
  parseVfsMap,
  readVfsDevHdd0Root,
  resolveConfigRoot,
  resolveDevHdd0Root,
  trophyRoots,
  vfsFiles,
};
