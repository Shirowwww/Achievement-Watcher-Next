'use strict';

/*
  Builders for MadnessPatch (Alice: Madness Returns) test fixtures. The real inputs are a plain
  Binaries\Win32 folder next to a real Alice: Madness Returns copy, so the suite only needs the
  pieces the parser actually reads: the executable, ini and proxy dll as placeholder files, and the
  Achievements\txt + Achievements\img resources with real text content.
*/

const fs = require('node:fs');
const path = require('node:path');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TOTAL = 45;

function sampleRows(total = TOTAL) {
  const rows = [];
  for (let index = 0; index < total; index += 1) rows.push(`Achievement ${index}|Description ${index}`);
  return rows;
}

/*
  A complete install under `<parent>\<name>\Binaries\Win32`: the executable, ini, proxy dll and both
  resource folders. `total` controls how many images are written, so an incomplete resource set can
  be simulated by passing fewer than TOTAL.
*/
function makeInstall(parent, name = 'Alice Madness Returns', { ini = 'AchievementSupport = 1\n', rows = sampleRows(), total = TOTAL, resources = true } = {}) {
  const dir = path.join(parent, name, 'Binaries', 'Win32');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'AliceMadnessReturns.exe'), 'MZ');
  fs.writeFileSync(path.join(dir, 'MadnessPatch.ini'), ini);
  fs.writeFileSync(path.join(dir, 'dinput8.dll'), 'MZ');
  if (resources) {
    const textDir = path.join(dir, 'Achievements', 'txt');
    const imagesDir = path.join(dir, 'Achievements', 'img');
    fs.mkdirSync(textDir, { recursive: true });
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(textDir, 'en.txt'), rows.join('\n'));
    for (let index = 0; index < total; index += 1) fs.writeFileSync(path.join(imagesDir, `${index}.png`), PNG);
  }
  return dir;
}

// One save profile's Achievements.txt, under a CheckPoint root of the caller's choosing.
function makeProfile(checkpointRoot, profile, flag) {
  const dir = path.join(checkpointRoot, profile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Achievements.txt'), `UnlockFlag = ${flag.toString()}\n`);
  return dir;
}

module.exports = { PNG, TOTAL, sampleRows, makeInstall, makeProfile };
