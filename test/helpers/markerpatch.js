'use strict';

/*
  Builders for MarkerPatch (Dead Space 2) test fixtures. The real inputs are a plain install folder
  next to a real Dead Space 2 copy, so the suite only needs the pieces the parser actually reads: the
  executable and ini as placeholder files, and the achievements\txt + achievements\img resources with
  real text content.
*/

const fs = require('node:fs');
const path = require('node:path');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TOTAL = 51;

function sampleRows(total = TOTAL) {
  const rows = [];
  for (let index = 0; index < total; index += 1) rows.push(`Achievement ${index}|Description ${index}`);
  return rows;
}

/*
  A complete install: deadspace2.exe, MarkerPatch.ini and both resource folders. `total` controls how
  many images are written, so an incomplete resource set can be simulated by passing fewer than TOTAL.
*/
function makeInstall(parent, name = 'Dead Space 2', { ini = 'AchievementSupport = 1\n', rows = sampleRows(), total = TOTAL, resources = true } = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deadspace2.exe'), 'MZ');
  fs.writeFileSync(path.join(dir, 'MarkerPatch.ini'), ini);
  if (resources) {
    const textDir = path.join(dir, 'achievements', 'txt');
    const imagesDir = path.join(dir, 'achievements', 'img');
    fs.mkdirSync(textDir, { recursive: true });
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(textDir, 'en.txt'), rows.join('\n'));
    for (let index = 0; index < total; index += 1) fs.writeFileSync(path.join(imagesDir, `${index}.png`), PNG);
  }
  return dir;
}

function settingsText(low, high) {
  return `Controls.AcL.X = ${low}\nControls.AcL.Y = ${high}\n`;
}

module.exports = { PNG, TOTAL, sampleRows, makeInstall, settingsText };
