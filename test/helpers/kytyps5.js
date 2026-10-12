'use strict';

/*
  Synthetic KytyPS5 installs: the emulator folder with its _Trophies unlock files and Kyty.ini, and
  a PS5 game folder whose sce_sys/trophy2/trophy00.ucp is built here in the emulator's own layout.
*/

const fs = require('fs');
const path = require('path');

const TITLE_ID = 'PPSA01325';
const RTC_TICK_UNIX_EPOCH = 62135596800000000n;
// A 1x1 transparent PNG, enough to prove an icon was carried out of the package.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

const TROPHIES = [
  { id: 0, grade: 'P', hidden: false, en: ['Playroom Master', 'Earn every trophy'], fr: ['Maître de la salle', 'Obtenir tous les trophées'] },
  { id: 1, grade: 'B', hidden: false, en: ['First Steps', 'Finish the tutorial'], fr: ['Premiers pas', 'Terminer le tutoriel'] },
  { id: 2, grade: 'G', hidden: true, en: ['Secret Room', 'Find the hidden room'], fr: ['Salle secrète', 'Trouver la salle cachée'] },
];

function tropmeta(title, language) {
  return JSON.stringify({
    metadata: {
      titleMetadata: { name: title },
      trophyMetadata: TROPHIES.map((t) => ({ id: String(t.id), name: t[language][0], detail: t[language][1] })),
    },
  });
}

// The container KytyPS5 reads: header, a table of 0x40-byte entries, then the file bodies.
function buildUcp(files) {
  const entries = Object.entries(files).map(([name, body]) => [name, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')]);
  const toc = 0x40;
  const dataStart = toc + 0x20 + entries.length * 0x40;
  const size = dataStart + entries.reduce((sum, [, body]) => sum + body.length, 0);
  const out = Buffer.alloc(size);
  out.writeUInt32BE(0xb228c60a, 0);
  out.writeUInt32BE(1, 4);
  out.writeBigUInt64BE(BigInt(size), 8);
  out.writeUInt32BE(entries.length, 0x10);
  out.writeUInt32BE(toc, 0x14);
  let offset = dataStart;
  entries.forEach(([name, body], index) => {
    const entry = toc + 0x20 + index * 0x40;
    out.write(name, entry, 0x20, 'latin1');
    out.writeBigUInt64BE(BigInt(offset), entry + 0x20);
    out.writeBigUInt64BE(BigInt(body.length), entry + 0x28);
    body.copy(out, offset);
    offset += body.length;
  });
  return out;
}

function samplePackage() {
  return buildUcp({
    'tropconf.json': JSON.stringify({
      defaultLanguage: 'en-US',
      trophies: TROPHIES.map((t) => ({ id: t.id, grade: t.grade, hidden: t.hidden })),
    }),
    'tropmeta_en-US.json': tropmeta("ASTRO's PLAYROOM", 'en'),
    'tropmeta_fr-FR.json': tropmeta("ASTRO's PLAYROOM", 'fr'),
    'trop0000.png': PNG,
    'trop0001.png': PNG,
  });
}

function unixToTick(seconds) {
  return (BigInt(seconds) * 1000000n + RTC_TICK_UNIX_EPOCH).toString();
}

function writeFile(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function makeGame(gamesRoot, { titleId = TITLE_ID, folder = 'Astro', withPackage = true } = {}) {
  const gameDir = path.join(gamesRoot, folder);
  writeFile(path.join(gameDir, 'eboot.bin'), 'ELF');
  writeFile(
    path.join(gameDir, 'sce_sys', 'param.json'),
    JSON.stringify({ titleId, localizedParameters: { defaultLanguage: 'en-US', 'en-US': { titleName: "ASTRO's PLAYROOM" }, 'fr-FR': { titleName: 'ASTRO PLAYROOM FR' } } })
  );
  writeFile(path.join(gameDir, 'sce_sys', 'icon0.png'), PNG);
  if (withPackage) writeFile(path.join(gameDir, 'sce_sys', 'trophy2', 'trophy00.ucp'), samplePackage());
  return gameDir;
}

// unlocks: { [userId]: { [id]: unixSeconds|0 } }
function writeUnlocks(emulatorDir, titleId, unlocks, label = 0) {
  for (const [userId, byId] of Object.entries(unlocks)) {
    const unlockedAt = {};
    for (const [id, seconds] of Object.entries(byId)) if (seconds) unlockedAt[id] = unixToTick(seconds);
    // The emulator writes each tick as a bare 64-bit number, which JSON.stringify cannot produce.
    const times = Object.entries(unlockedAt).map(([id, tick]) => `"${id}":${tick}`).join(',');
    writeFile(
      path.join(emulatorDir, '_Trophies', titleId, `trophies_${userId}_${label}.json`),
      `{"unlockedAt":{${times}},"unlockedTrophies":${JSON.stringify(Object.keys(byId).map(Number))}}`
    );
  }
}

function makeEmulator(root, { gameDirs = [], unlocks = { 1000: { 1: 1700000000 } }, titleId = TITLE_ID } = {}) {
  const emulatorDir = path.join(root, 'KytyPS5');
  writeFile(path.join(emulatorDir, 'kyty_emulator.exe'), 'MZ');
  const list = gameDirs.map((dir) => dir.replace(/\\/g, '/')).join(', ');
  writeFile(path.join(emulatorDir, 'Kyty.ini'), `[GameConfigurations]\nsize=0\n\n[Launcher]\ngame_dirs=${list}\ngrid_view=false\n`);
  if (unlocks) writeUnlocks(emulatorDir, titleId, unlocks);
  return emulatorDir;
}

module.exports = { TITLE_ID, TROPHIES, PNG, buildUcp, samplePackage, unixToTick, makeGame, makeEmulator, writeUnlocks };
