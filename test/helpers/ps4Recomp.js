'use strict';

/*
  Synthetic PS4 Recomp installs: a port folder (run.py, its launcher, launcher settings) and the
  original game dump it points at, whose sce_sys/trophy/trophy<NN>.trp, npbind.dat and param.sfo are
  built here in the console's own layouts. The trophy key is a test key, never the retail one.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TEST_KEY = '00112233445566778899aabbccddeeff';
const NPCOMMID = 'NPWR07999_00';
const TITLE_ID = 'CUSA00900';

const TROPHIES = [
  { id: '000', ttype: 'P', hidden: 'no', en: ['Bloodborne', 'All trophies obtained'], fr: ['Bloodborne', 'Tous les trophées obtenus'] },
  { id: '001', ttype: 'B', hidden: 'no', en: ['Hunter', 'Defeat a beast'], fr: ['Chasseur', 'Vaincre une bête'] },
  { id: '002', ttype: 'G', hidden: 'yes', en: ['Yharnam Sunrise', 'See the dawn'], fr: ['Aube sur Yharnam', "Voir l'aube"] },
];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function chunk(type, data) {
  const tag = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  tag.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(Buffer.concat([tag, data])) >>> 0, 8 + data.length);
  return out;
}

// A real, decodable RGBA PNG of the given size.
function png(width = 2, height = 2) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height, 0x7f);
  for (let y = 0; y < height; y++) raw[y * (width * 4 + 1)] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trophyXml({ title = 'Bloodborne', npcommid = NPCOMMID, language = 'en', trophies = TROPHIES } = {}) {
  const rows = trophies.map((t) => {
    const [name, detail] = t[language] || t.en;
    return ` <trophy id="${t.id}" hidden="${t.hidden}" ttype="${t.ttype}" pid="-1">\n  <name>${escapeXml(name)}</name>\n  <detail>${escapeXml(detail)}</detail>\n </trophy>`;
  });
  return `<!--Sce-Np-Trophy-Signature: 00-->\n<trophyconf version="1.1" platform="ps4">\n <npcommid>${npcommid}</npcommid>\n <title-name>${escapeXml(title)}</title-name>\n${rows.join('\n')}\n</trophyconf>\n`;
}

// TROP.ESFM: a random IV, then the XML under a key derived from the padded NP communication id.
function encryptEsfm(xml, npcommid = NPCOMMID, keyHex = TEST_KEY) {
  const identity = Buffer.alloc(16);
  identity.write(npcommid, 'ascii');
  const keygen = crypto.createCipheriv('aes-128-cbc', Buffer.from(keyHex, 'hex'), Buffer.alloc(16));
  keygen.setAutoPadding(false);
  const derived = Buffer.concat([keygen.update(identity), keygen.final()]);
  const plain = Buffer.from(xml, 'utf8');
  const padded = Buffer.concat([plain, Buffer.alloc((16 - (plain.length % 16)) % 16)]);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', derived, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([iv, cipher.update(padded), cipher.final()]);
}

// Trophy00.trp: a 0x60 header, a table of 0x40-byte entries, then the bodies aligned on 16 bytes.
function buildTrp(files) {
  const entries = Object.entries(files).map(([name, body]) => [name, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')]);
  let offset = 0x60 + entries.length * 0x40;
  const placed = entries.map(([name, body]) => {
    offset = Math.ceil(offset / 16) * 16;
    const at = offset;
    offset += body.length;
    return { name, body, at };
  });
  const out = Buffer.alloc(Math.ceil(offset / 16) * 16);
  out.writeUInt32BE(0xdca24d00, 0);
  out.writeUInt32BE(3, 4);
  out.writeBigUInt64BE(BigInt(out.length), 8);
  out.writeUInt32BE(entries.length, 16);
  out.writeUInt32BE(0x40, 20);
  placed.forEach(({ name, body, at }, index) => {
    const entry = 0x60 + index * 0x40;
    out.write(name, entry, 32, 'ascii');
    out.writeBigUInt64BE(BigInt(at), entry + 32);
    out.writeBigUInt64BE(BigInt(body.length), entry + 40);
    body.copy(out, at);
  });
  return out;
}

function block(type, value) {
  const out = Buffer.alloc(4 + value.length);
  out.writeUInt16BE(type, 0);
  out.writeUInt16BE(value.length, 2);
  value.copy(out, 4);
  return out;
}

// npbind.dat: a 0x80 header, then one entry per trophy set of four typed blocks.
function buildNpbind(bindings) {
  const entries = bindings.map(({ npcommid, label }) => {
    const id = Buffer.alloc(13);
    id.write(npcommid, 'ascii');
    const service = Buffer.alloc(4);
    service.writeUInt32BE(label, 0);
    return Buffer.concat([block(0x10, id), block(0x11, service), block(0x12, Buffer.alloc(160)), block(0x13, Buffer.alloc(16)), Buffer.alloc(8)]);
  });
  const entrySize = entries.length ? entries[0].length : 0;
  const header = Buffer.alloc(0x80);
  header.writeUInt32BE(0xd294a018, 0);
  header.writeUInt32BE(1, 4);
  header.writeBigUInt64BE(BigInt(0x80 + entrySize * entries.length + 20), 8);
  header.writeBigUInt64BE(BigInt(entrySize), 0x10);
  header.writeBigUInt64BE(BigInt(entries.length), 0x18);
  return Buffer.concat([header, ...entries, Buffer.alloc(20)]);
}

// param.sfo with UTF-8 string values only.
function buildSfo(values) {
  const pairs = Object.entries(values);
  const keys = Buffer.concat(pairs.map(([key]) => Buffer.from(`${key}\0`, 'utf8')));
  const keyTable = 20 + pairs.length * 16;
  const dataTable = keyTable + Math.ceil(keys.length / 4) * 4;
  const datas = pairs.map(([, value]) => Buffer.from(`${value}\0`, 'utf8'));
  const out = Buffer.alloc(dataTable + datas.reduce((sum, data) => sum + Math.ceil(data.length / 4) * 4, 0));
  out.writeUInt32LE(0x46535000, 0);
  out.writeUInt32LE(0x101, 4);
  out.writeUInt32LE(keyTable, 8);
  out.writeUInt32LE(dataTable, 12);
  out.writeUInt32LE(pairs.length, 16);
  keys.copy(out, keyTable);
  let keyAt = 0;
  let dataAt = 0;
  pairs.forEach(([key], index) => {
    const at = 20 + index * 16;
    out.writeUInt16LE(keyAt, at);
    out.writeUInt16LE(0x0204, at + 2);
    out.writeUInt32LE(datas[index].length, at + 4);
    out.writeUInt32LE(Math.ceil(datas[index].length / 4) * 4, at + 8);
    out.writeUInt32LE(dataAt, at + 12);
    datas[index].copy(out, dataTable + dataAt);
    keyAt += Buffer.byteLength(key) + 1;
    dataAt += Math.ceil(datas[index].length / 4) * 4;
  });
  return out;
}

function trophyFiles({ title, npcommid, encrypted = true, keyHex = TEST_KEY, icons = true } = {}) {
  const english = trophyXml({ title, npcommid });
  const files = {};
  if (encrypted) {
    files['TROP.ESFM'] = encryptEsfm(english, npcommid, keyHex);
    files['TROP_02.ESFM'] = encryptEsfm(trophyXml({ title, npcommid, language: 'fr' }), npcommid, keyHex);
  } else {
    files['TROP.SFM'] = english;
    files['TROP_02.SFM'] = trophyXml({ title, npcommid, language: 'fr' });
  }
  if (icons) {
    files['ICON0.PNG'] = png(4, 4);
    for (const trophy of TROPHIES) files[`TROP${trophy.id}.PNG`] = png();
  }
  return files;
}

/*
  An original PS4 dump: sce_sys/param.sfo, npbind.dat binding each set to its NP id, and one
  trophy<NN>.trp per set. `sets` is [{ slot, npcommid, title }].
*/
function makeGameDump(dir, { titleId = TITLE_ID, title = 'Bloodborne', sets = [{ slot: 0, npcommid: NPCOMMID, title }], ...options } = {}) {
  write(path.join(dir, 'sce_sys', 'param.sfo'), buildSfo({ TITLE: title, TITLE_ID: titleId }));
  write(path.join(dir, 'sce_sys', 'npbind.dat'), buildNpbind(sets.map((set) => ({ npcommid: set.npcommid, label: set.slot }))));
  for (const set of sets) {
    const name = `trophy${String(set.slot).padStart(2, '0')}.trp`;
    write(path.join(dir, 'sce_sys', 'trophy', name), buildTrp(trophyFiles({ ...options, title: set.title, npcommid: set.npcommid })));
  }
  write(path.join(dir, 'sce_sys', 'icon0.png'), png(8, 8));
  return dir;
}

const PORT_FILES = {
  bloodborne: { exe: 'Bloodborne.exe', marker: 'bloodborne' },
  uncharted: { exe: 'Uncharted.exe', marker: 'uncharted' },
  gow3: { exe: 'God of War III.exe', marker: 'gow3' },
  spartanport: { exe: 'SpartanPort.exe', marker: 'spartanport' },
  medievil: { exe: 'MediEvil.exe', marker: 'medievil' },
};

/*
  A port install: run.py, the launcher exe and the launcher's own icon. `script` replaces the
  runner's text; `key` writes trophy.key beside the launcher.
*/
function makePort(root, port, { script, key = TEST_KEY, withMarker = true, withExe = true } = {}) {
  const files = PORT_FILES[port];
  write(path.join(root, 'run.py'), script || `import os\nfrom pathlib import Path\nPORT = Path(__file__).resolve().parent\n`);
  if (files && withExe) write(path.join(root, files.exe), 'MZ');
  if (files && withMarker) write(path.join(root, 'launcher', `${files.marker}.png`), png());
  if (key) write(path.join(root, 'trophy.key'), `${key}\n`);
  return root;
}

/*
  BilalReloaded's Nathan Drake Collection port (0.5.0, #138): no run.py, the games are started by
  tools/probe_uncharted.py, and the user folder is analysis/uncharted-user. `dump` puts the
  Collection's trophy01-03.trp at the launcher's default game/CUSA02344/uroot.
*/
const COLLECTION_SETS = [1, 2, 3].map((slot) => ({ slot, npcommid: `NPWR0866${slot}_00`, title: `Uncharted ${slot}` }));

function makeCollectionPort(root, { dump = true, key = TEST_KEY } = {}) {
  write(path.join(root, 'tools', 'probe_uncharted.py'), 'ROOT = Path(__file__).resolve().parent.parent\n');
  write(path.join(root, 'launcher', 'uncharted_launcher.pyw'), 'USER_DIR = ROOT / "analysis" / "uncharted-user"\n');
  write(path.join(root, 'Uncharted Launcher.exe'), 'MZ');
  write(path.join(root, 'analysis', 'uncharted-user', 'disabled-optimizations.txt'), '');
  if (key) write(path.join(root, 'trophy.key'), `${key}\n`);
  if (dump) makeGameDump(path.join(root, 'game', 'CUSA02344', 'uroot'), { titleId: 'CUSA02344', title: 'Uncharted Collection', sets: COLLECTION_SETS });
  return root;
}

function settingsFile(appData, folder, settings) {
  return write(path.join(appData, folder, 'settings.json'), JSON.stringify(settings));
}

/*
  The trophy list a port writes itself, as Crash Team Racing Nitro-Fueled does:
  <user>/trophies/<title id>/trophies.tsv (id, grade, hidden, name, detail) and unlocked.txt
  ("<id> <unix time>" lines, CRLF in the real file).
*/
const TSV_TITLE_ID = 'CUSA13795';
const TSV_TROPHIES = [
  ['0', 'P', '0', 'Woah!', 'Earn every other trophy.'],
  ['1', 'B', '0', 'Off to a Good Start', 'Win your first Adventure race.'],
  ['2', 'B', '0', 'Crazier than the Ripper', 'Beat Ripper Roo in Adventure.'],
  ['21', 'B', '1', 'Burning Rubber!', 'Perform 500 Drift Boosts in total.'],
  ['43', 'B', '0', 'Get off me!', 'Escape a TNT crate.'],
];

function makeTrophyList(userDir, { titleId = TSV_TITLE_ID, unlocked } = {}) {
  const titleDir = path.join(userDir, 'trophies', titleId);
  const rows = TSV_TROPHIES.map((row) => row.join('\t'));
  write(path.join(titleDir, 'trophies.tsv'), ['#source\tbuiltin', '#lang\t1', '#title\tCrash Team Racing Nitro-Fueled', ...rows, ''].join('\n'));
  if (unlocked !== undefined) write(path.join(titleDir, 'unlocked.txt'), unlocked);
  return titleDir;
}

module.exports = {
  TSV_TITLE_ID,
  makeTrophyList,
  TEST_KEY,
  NPCOMMID,
  TITLE_ID,
  TROPHIES,
  write,
  png,
  trophyXml,
  encryptEsfm,
  buildTrp,
  buildNpbind,
  buildSfo,
  trophyFiles,
  makeGameDump,
  makePort,
  COLLECTION_SETS,
  makeCollectionPort,
  settingsFile,
};
