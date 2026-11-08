'use strict';

const fs = require('fs');
const path = require('path');
const { isDirectory } = require('./fsProbe.js');

/*
  A Unity player loads its native plugins, steam_api among them, from <Game>_Data/Plugins/<arch>
  (Plugins itself on older players) before anything beside the exe. These are the folders that
  exist under `gameDir`, 64-bit first. Structural only: nothing is read beyond directory names.
*/
const PLUGIN_SUBDIRS = [['Plugins', 'x86_64'], ['Plugins', 'x86'], ['Plugins']];

function pluginDllDirs(gameDir) {
  if (!gameDir) return [];
  let entries;
  try {
    entries = fs.readdirSync(gameDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/_data$/i.test(entry.name)) continue;
    for (const parts of PLUGIN_SUBDIRS) {
      const dir = path.join(gameDir, entry.name, ...parts);
      if (isDirectory(dir)) out.push(dir);
    }
  }
  return out;
}

module.exports = { pluginDllDirs };
