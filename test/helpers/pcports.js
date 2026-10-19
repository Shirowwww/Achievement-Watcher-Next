'use strict';

/*
  A synthetic Link's Awakening DX HD install: the exe, 110 English achievement texts, a few other
  languages and the achievement pictures, plus its unlock file in the place the game would write it.
*/

const fs = require('fs');
const path = require('path');

const COUNT = 110;
// A 1x1 PNG, enough for the signature check and a byte-for-byte copy.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

function writeFile(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function languageText(prefix, count = COUNT) {
  const lines = [];
  for (let id = 0; id < count; id++) {
    lines.push(`achieveName${id} ${prefix} name ${id}`, `achieveDesc${id} ${prefix} description ${id}`);
  }
  return `${lines.join('\n')}\n`;
}

// options.executable, options.portable, options.languages: { 'achieve_fre.lng': text }, options.count.
function makeInstall(root, { executable = "Link's Awakening DX HD.exe", portable = false, languages = {}, count = COUNT, images = COUNT } = {}) {
  writeFile(path.join(root, executable), 'MZ');
  writeFile(path.join(root, 'Data', 'Languages', 'achieve_eng.lng'), languageText('English', count));
  for (const [name, text] of Object.entries(languages)) writeFile(path.join(root, 'Data', 'Languages', name), text);
  for (let id = 0; id < images; id++) writeFile(path.join(root, 'Data', 'Achievements', `achievement${id}.png`), PNG);
  if (portable) writeFile(path.join(root, 'portable.txt'), '');
  return root;
}

// earned: ids that read "true"; every other id reads "false", as the game writes all of them.
function unlockText(earned = [], count = COUNT) {
  const lines = [];
  for (let id = 0; id < count; id++) lines.push(`achievement${id} ${earned.includes(id) ? 'true' : 'false'}`);
  return `${lines.join('\n')}\n`;
}

function writeUnlocks(file, earned, count = COUNT) {
  writeFile(file, unlockText(earned, count));
}

module.exports = { COUNT, PNG, writeFile, languageText, makeInstall, unlockText, writeUnlocks };
