'use strict';

/*
  Achievements of a real Xbox 360 profile, copied off a modded console (RGH/JTAG, Aurora's FTP).
  The profile is one STFS file named after its id, in Content\0000000000000000\<id>\FFFE07D1\00010000\
  on the console; it holds one GPD per title played, the same XDBF files Xenia keeps loose, so each
  is read by xenia.js. The file is only ever read: nothing writes back to a console profile.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const stfs = require('./stfs.js');
const xenia = require('./xenia.js');

const TYPE = 'x360profile';
const SOURCE = 'Xbox 360 Profile';
const PROFILE_NAME = /^[0-9a-f]{16}$/i;
const TITLE_GPD = /^([0-9a-f]{8})\.gpd$/i;
const DASHBOARD_TITLE_ID = 'fffe07d1';
// A profile is a few MB; anything far bigger named like one is a game package, not a profile.
const MAX_PROFILE_BYTES = 64 * 1024 * 1024;

/*
  Where a profile may sit under a folder in the folder list, from the console's Hdd1 or Content
  folder down to a folder holding just the file. `ID` is any 16-digit hex name.
*/
const LAYOUTS = [
  ['ID'],
  ['00010000', 'ID'],
  ['FFFE07D1', '00010000', 'ID'],
  ['ID', 'FFFE07D1', '00010000', 'ID'],
  ['0000000000000000', 'ID', 'FFFE07D1', '00010000', 'ID'],
  ['Content', '0000000000000000', 'ID', 'FFFE07D1', '00010000', 'ID'],
];

function entries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function matches(step, name) {
  return step === 'ID' ? PROFILE_NAME.test(name) : name.toLowerCase() === step.toLowerCase();
}

function walk(dir, steps, out) {
  const [step, ...rest] = steps;
  for (const entry of entries(dir)) {
    if (!matches(step, entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (rest.length) {
      if (entry.isDirectory()) walk(full, rest, out);
    } else if (entry.isFile()) {
      out.add(full);
    }
  }
}

function isProfilePackage(file) {
  let fd;
  try {
    if (fs.statSync(file).size > MAX_PROFILE_BYTES) return false;
    fd = fs.openSync(file, 'r');
    const magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    return magic.toString('latin1') === 'CON ';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * The profile files under a folder of the folder list.
 * @param {string} dir
 * @returns {string[]}
 */
function findProfiles(dir) {
  const found = new Set();
  for (const steps of LAYOUTS) walk(dir, steps, found);
  return [...found].filter(isProfilePackage);
}

/*
  One package unpacked per file content: a scan asks for every title of the same profile in turn.
  Keyed on the bytes, not the date: an FTP client may keep the console's date (often a clock never
  set) on a copy of the same size.
*/
let cached = { key: '', titles: new Map() };

/**
 * The title GPDs of a profile, keyed by upper-case title id; empty when the file is not readable.
 * @param {string} file
 * @returns {Map<string, Buffer>}
 */
function readTitles(file) {
  const buf = fs.readFileSync(file);
  const key = `${file}|${crypto.createHash('sha1').update(buf).digest('hex')}`;
  if (cached.key === key) return cached.titles;
  const pkg = stfs.openPackage(buf);
  const titles = new Map();
  for (const entry of pkg ? pkg.files : []) {
    const match = TITLE_GPD.exec(entry.path);
    if (!match || match[1].toLowerCase() === DASHBOARD_TITLE_ID) continue;
    const raw = entry.read();
    if (raw) titles.set(match[1].toUpperCase(), raw);
  }
  cached = { key, titles };
  return titles;
}

/**
 * Each title of a profile that has achievements, as the library and the Watchdog read it.
 * @param {string} file
 * @returns {Array<{ titleId: string, title: string, list: object[], imagesById: Map<string, Buffer> }>}
 */
function readProfile(file) {
  const out = [];
  for (const [titleId, raw] of readTitles(file)) {
    const { title, list, imagesById } = xenia.readGpd(raw, `${titleId}.gpd`);
    // Apps and the avatar editor keep a GPD too, with no achievement in it.
    if (list.length) out.push({ titleId, title, list, imagesById });
  }
  return out;
}

// With several profiles a title is listed once, from the profile written last, as Xenia does.
function scan(dir) {
  const newest = new Map();
  for (const file of findProfiles(dir)) {
    let mtime = 0;
    let titles = [];
    try {
      mtime = fs.statSync(file).mtimeMs;
      titles = readProfile(file);
    } catch {
      continue;
    }
    for (const { titleId } of titles) {
      const known = newest.get(titleId);
      if (!known || mtime > known.mtime) newest.set(titleId, { file, mtime });
    }
  }
  return [...newest].map(([titleId, { file }]) => ({ appid: titleId, source: SOURCE, data: { type: TYPE, path: file, titleId } }));
}

function gpdOf(data) {
  const raw = readTitles(data.path).get(String(data.titleId).toUpperCase());
  if (!raw) throw new Error(`title ${data.titleId} is no longer in the profile`);
  return raw;
}

// The second argument (a language, from achievements.js) is ignored: a GPD carries one language.
async function getGameData(data, _lang, { fetchImpl } = {}) {
  return xenia.gameDataFromGpd(gpdOf(data), String(data.titleId).toUpperCase(), { fetchImpl });
}

async function getAchievements(data) {
  return xenia.unlocksOf(xenia.readGpd(gpdOf(data), `${data.titleId}.gpd`).list);
}

module.exports = { TYPE, SOURCE, scan, findProfiles, readProfile, getGameData, getAchievements };
