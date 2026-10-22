'use strict';

/*
  A PS4 port's trophy list and art: the trophy sets of its original dump (or a decrypted export of
  them, or the list the port writes itself), their NP ids, and the game data the library shows.
  Synchronous file reads, dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));

const SET_FILE = /^trophy(\d{2})(\.trp)?$/i;

let debug = { log() {}, warn() {}, error() {} };
const setLogger = (logger) => {
  debug = logger;
};

function isRegularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function readDirectory(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readText(file, max) {
  const buffer = formats.readBounded(file, max);
  return buffer ? buffer.toString('utf8').replace(/^﻿/, '') : '';
}

// trophy set slot -> { trp, exports }: the dump's trophy<NN>.trp, and decrypted exports of it.
function trophySets(dumpDir, installRoot) {
  const sets = new Map();
  const add = (slot, key, value) => {
    const set = sets.get(slot) || { trp: '', exports: [] };
    if (key === 'trp' && !set.trp) set.trp = value;
    if (key === 'exports') set.exports.push(value);
    sets.set(slot, set);
  };
  for (const folder of [dumpDir && path.join(dumpDir, 'sce_sys', 'trophy'), installRoot && path.join(installRoot, 'TrophyFiles')]) {
    if (!folder) continue;
    for (const entry of readDirectory(folder)) {
      const match = SET_FILE.exec(entry.name);
      if (!match) continue;
      const file = path.join(folder, entry.name);
      if (match[2] && entry.isFile()) add(Number(match[1]), 'trp', file);
      else if (!match[2] && entry.isDirectory()) add(Number(match[1]), 'exports', file);
    }
  }
  return sets;
}

function dumpIdentity(dumpDir) {
  const sfo = dumpDir ? formats.readSfo(formats.readBounded(path.join(dumpDir, 'sce_sys', 'param.sfo'), formats.MAX_SMALL_BYTES)) : {};
  const bindings = dumpDir ? formats.readNpbind(formats.readBounded(path.join(dumpDir, 'sce_sys', 'npbind.dat'), formats.MAX_SMALL_BYTES)) : new Map();
  return { title: sfo.TITLE || '', titleId: /^CUSA\d{5}$/.test(sfo.TITLE_ID || '') ? sfo.TITLE_ID : '', bindings };
}

function readTrophyList(file) {
  return formats.parseTrophyTsv(readText(file, formats.MAX_SMALL_BYTES));
}

function containerOf(files, info, key) {
  const container = files ? formats.readContainer(files, info.npcommid, key) : null;
  return container && container.documents.size > 0 ? container : null;
}

function trophyKey(installRoot) {
  return formats.readKeyFile(path.join(installRoot, 'trophy.key')) || formats.RETAIL_TROPHY_KEY;
}

function readTrpFile(file) {
  return formats.readTrp(formats.readBounded(file, formats.MAX_TRP_BYTES));
}

// A set's NP id found by search, kept per file while it is unchanged: the search is not free.
const recoveredIds = new Map();
function recoveredNpcommid(file, key, files = null) {
  let stamp = '';
  try {
    const stat = fs.statSync(file);
    stamp = `${file}|${stat.size}|${stat.mtimeMs}|${key}`;
  } catch {
    return '';
  }
  if (!recoveredIds.has(stamp)) recoveredIds.set(stamp, formats.findNpcommid(files || readTrpFile(file), key));
  return recoveredIds.get(stamp);
}

// A trophy set's list title, kept per file while it is unchanged: telling games apart decrypts it.
const setTitles = new Map();
function setTitle(root, set, npcommid) {
  const file = set.trp || set.exports[0] || '';
  let stamp = '';
  try {
    const stat = fs.statSync(file);
    stamp = `${file}|${stat.size}|${stat.mtimeMs}|${npcommid}`;
  } catch {
    return '';
  }
  if (!setTitles.has(stamp)) {
    const exported = set.exports.length > 0 ? containerOf(formats.readExportFolder(set.exports[0]), { npcommid }, '') : null;
    const key = trophyKey(root);
    const container = exported || (set.trp ? containerOf(readTrpFile(set.trp), { npcommid: npcommid || recoveredNpcommid(set.trp, key) }, key) : null);
    const document = container && (container.documents.get('') || container.documents.values().next().value);
    setTitles.set(stamp, document ? String(document.title || '') : '');
  }
  return setTitles.get(stamp);
}

// The trophy list of a record's set: the port's own trophies.tsv, a decrypted export, else the dump's .trp.
function loadTrophySet(info) {
  if (info.trophyList) {
    const list = readTrophyList(String(info.trophyList));
    if (!list) return null;
    const documents = new Map([['', list]]);
    if (list.language) documents.set(list.language, list);
    return { documents, icons: new Map(), icon0: null };
  }
  const set = trophySets(info.dumpDir, info.installRoot).get(Number(info.slot));
  if (!set) return null;
  const key = trophyKey(String(info.installRoot || ''));
  const trp = () => readTrpFile(set.trp);
  for (const dir of set.exports) {
    const exported = containerOf(formats.readExportFolder(dir), info, '');
    if (!exported) continue;
    const packed = exported.icons.size === 0 && set.trp ? trp() : null;
    if (packed) return { ...exported, icons: formats.readContainer(packed, '', '').icons };
    return exported;
  }
  if (!set.trp) return null;
  const files = trp();
  return containerOf(files, { ...info, npcommid: info.npcommid || recoveredNpcommid(set.trp, key, files) }, key);
}

function toFileUrl(file) {
  return 'file:///' + file.replace(/\\/g, '/');
}

function writeIcon(file, image) {
  if (!image || image.length === 0) return '';
  try {
    if (!isRegularFile(file) || fs.statSync(file).size !== image.length) fs.writeFileSync(file, image);
    return toFileUrl(file);
  } catch (err) {
    debug.warn(`[ps4recomp] could not write icon '${file}': ${err}`);
    return '';
  }
}

// The dump's own key art and icon, the trophy set's icon when the dump has none.
function gameArt(info, container, iconDir) {
  const dumpDir = String(info.dumpDir || '');
  const art = (name) => (dumpDir && isRegularFile(path.join(dumpDir, 'sce_sys', name)) ? toFileUrl(path.join(dumpDir, 'sce_sys', name)) : '');
  const background = art('pic1.png') || art('pic0.png');
  const icon = art('icon0.png') || writeIcon(path.join(iconDir, 'icon0.png'), container.icon0);
  // The square icon only stands in for a header until SteamGridDB's landscape art replaces it.
  return { header: background || icon, headerStandIn: !background, background, overlay: !!background, icon };
}

function textsById(document) {
  return new Map((document ? document.trophies : []).map((trophy) => [trophy.id, trophy]));
}

function trophyEntry(trophy, local, english, icon) {
  const own = local.get(trophy.id) || {};
  const reference = english.get(trophy.id) || {};
  return {
    name: trophy.id,
    displayName: own.name || reference.name || trophy.name || trophy.id,
    description: own.detail || reference.detail || trophy.detail || '',
    rarityName: reference.name || undefined,
    rarityDescription: reference.detail || undefined,
    hidden: trophy.hidden ? 1 : 0,
    type: trophy.grade,
    icon,
    icongray: icon,
  };
}

function cleanTitle(text) {
  return String(text || '').replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
}

// The library's game data of a record; `iconDirFor(appid)` is where its trophy icons are written.
async function getGameData(data, lang, iconDirFor) {
  const info = data && typeof data === 'object' ? data : {};
  const container = loadTrophySet(info);
  if (!container) throw new Error(`PS4 Recomp: no readable trophy list for ${info.appid} (set ${info.slot}) under '${info.dumpDir}'`);
  const documents = container.documents;
  const base = documents.get('') || documents.get('english') || documents.values().next().value;
  const local = documents.get(String(lang || '').toLowerCase()) || base;
  // A list written in another language has no English text for the rarity lookups.
  const english = documents.get('english') || (base.language && base.language !== 'english' ? null : base);
  const iconDir = iconDirFor(info.appid);
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    /* the trophies still list, just without their art */
  }
  const img = gameArt(info, container, iconDir);
  const localTexts = textsById(local);
  const englishTexts = textsById(english);
  const list = base.trophies.map((trophy) => {
    const icon = writeIcon(path.join(iconDir, `${trophy.id}.png`), container.icons.get(trophy.id)) || img.icon;
    return trophyEntry(trophy, localTexts, englishTexts, icon);
  });
  return {
    name: cleanTitle(local.title) || cleanTitle(base.title) || info.title || info.npcommid || String(info.appid || ''),
    appid: String(info.appid || ''),
    system: 'playstation',
    npCommId: info.npcommid || undefined,
    img,
    rarityTitles: [...new Set([cleanTitle(english && english.title), info.title].filter(Boolean))],
    achievement: { total: list.length, list },
  };
}

module.exports = { setLogger, trophySets, dumpIdentity, readTrophyList, trophyKey, recoveredNpcommid, setTitle, getGameData };
