'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require(path.join(__dirname, 'replaceFile.js'));
const { pathKey } = require(path.join(__dirname, 'winHosts.js'));

/*
  cfg/saveRedirects.json: the save folders a GBE/Goldberg install redirects itself to
  (local_save_path, local_save.txt), keyed by its steam_settings folder. The library scan writes it
  and the Watchdog watches every folder in it, since it never reads steam_settings itself.
*/

function redirectsFile(userDataRoot) {
  return path.join(userDataRoot, 'cfg', 'saveRedirects.json');
}

// A missing, locked or corrupt file reads as empty, except that `strict` throws on a file that
// exists but cannot be read, so update() never overwrites redirects a scoped scan did not see.
function read(file, { strict = false } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (strict && err.code !== 'ENOENT') throw err;
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// The folders to watch, absolute and once each.
function roots(file) {
  const seen = new Set();
  const result = [];
  for (const dir of Object.values(read(file))) {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) continue;
    const key = pathKey(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(dir);
  }
  return result;
}

/*
  Merges what one scan saw (steam_settings -> save root, '' for no redirect) into the file. A scoped
  scan sees only some games, so the others are kept until their steam_settings folder is gone.
  Writes only on a change and returns whether it wrote.
*/
function update(file, seen) {
  const current = read(file, { strict: true });
  const next = {};
  for (const [settings, root] of Object.entries(current)) {
    if (typeof root === 'string' && root && fs.existsSync(settings)) next[settings] = root;
  }
  for (const [settings, root] of seen) {
    if (root) next[settings] = root;
    else delete next[settings];
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return false;
  writeFileAtomicSync(file, JSON.stringify(next, null, 2));
  return true;
}

module.exports = { redirectsFile, roots, update };
