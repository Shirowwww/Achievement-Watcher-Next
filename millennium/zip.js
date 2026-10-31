'use strict';

// Packs the built plugin as dist/aw-next-millennium.zip: one aw-next/ folder to extract into
// <Steam>\millennium\plugins\. `npm run zip` builds first; the release attaches the result.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const FOLDER = 'aw-next';
const FILES = ['plugin.json', 'README.md', 'backend/main.lua', '.millennium/Dist/index.js'];
const OUT = path.join(__dirname, 'dist', 'aw-next-millennium.zip');

const zip = new AdmZip();
for (const file of FILES) {
  const source = path.join(__dirname, file);
  if (!fs.existsSync(source)) throw new Error(`${file} is missing: run npm run build first`);
  zip.addFile(`${FOLDER}/${file}`, fs.readFileSync(source));
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
zip.writeZip(OUT);
console.log(`wrote ${path.relative(__dirname, OUT)}`);
