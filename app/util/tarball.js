'use strict';

const fs = require('fs');
const path = require('path');
const { sevenZipBin } = require('./unpacked.js');

// Linux release builds ship as .tar.bz2, which 7za opens one layer at a time: the compressed file
// holds a single .tar, and that .tar holds the tree. Any other archive is returned as it is.
async function unwrapTarball(file, workDir) {
  if (!/\.tar\.(bz2|gz|xz)$/i.test(file)) return file;
  const Seven = require('node-7z');
  await new Promise((resolve, reject) => {
    const stream = Seven.extractFull(file, workDir, { $bin: sevenZipBin() });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const tar = fs.readdirSync(workDir).find((name) => name.toLowerCase().endsWith('.tar'));
  if (!tar) throw new Error(`${path.basename(file)} holds no tar archive`);
  return path.join(workDir, tar);
}

module.exports = { unwrapTarball };
