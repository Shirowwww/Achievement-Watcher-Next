'use strict';

/*
  PS3 ports installed by RecompLauncher (elripalda/RecompLauncher; Vajra, Redgrave961/Vajra, first).
  The port folder holds recomplauncher.json, whose inputs[].check.ids name the PS3 discs it takes;
  the port writes everything to {data}, <port>/recompdata under the launcher (RECOMPLAUNCHER_DATA),
  the port's own folder when run on its own. The game path it was given stays in a <data>/*.ini as
  game=<PS3_GAME folder or decrypted .iso>. Its runtime (Redgrave961/ps3recomp, PS3_GAMEDATA_ROOT =
  <data>/user) opens <data>/user/dev_hdd0/game/<title>/TROPDIR first, then the disc's, and saves
  <data>/user/trophies/<NPWRnnnnn_NN>.json. Only data is read: nothing is run.
*/

const path = require('path');
const fs = require('fs');
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));
const iso = require(path.join(__dirname, '..', 'util', 'iso9660.js'));

const MANIFEST = 'recomplauncher.json';
const DATA_DIR = 'recompdata';
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_INI_BYTES = 64 * 1024;
const MAX_INI_FILES = 16;
const MAX_SETS = 16;
// PS3 discs (BLES, BCUS, BLJM...) and PSN titles (NPEB, NPUA...); a PSP title (NPUH, ULUS) is not one.
const PS3_TITLE_ID = /^(?:B[CL][AEHJKU][A-Z]|NP[AEHJKU][AB])\d{5}$/;
const SET_ID = /^NPWR\d{5}_\d{2}$/;
const DISC_GAME = 'PS3_GAME';
// Where a ps3recomp runtime keeps <set>.json under {data}: Vajra's PS3_GAMEDATA_ROOT, else the runtime's default.
const GAMEDATA_ROOTS = ['user', 'gamedata'];

function isRegularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isRealDirectory(dir) {
  try {
    const stat = fs.lstatSync(dir);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

const textOf = (buffer) => (buffer ? buffer.toString('utf8').replace(/^﻿/, '') : '');

// { name, titleIds, programs } of a manifest that takes a PS3 disc, else null.
function manifestOf(root) {
  let parsed;
  try {
    parsed = JSON.parse(textOf(formats.readBounded(path.join(root, MANIFEST), MAX_MANIFEST_BYTES)));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.inputs)) return null;
  const ids = parsed.inputs.flatMap((input) => (input && input.check && Array.isArray(input.check.ids) ? input.check.ids : []));
  const titleIds = new Set(ids.filter((id) => typeof id === 'string' && PS3_TITLE_ID.test(id)));
  if (titleIds.size === 0) return null;
  const program = parsed.start && parsed.start.program;
  const programs = (Array.isArray(program) ? program : [program]).filter((name) => typeof name === 'string' && name && path.basename(name) === name);
  return { name: typeof parsed.name === 'string' ? parsed.name : '', titleIds, programs };
}

const isPort = (root) => manifestOf(root) !== null;
const dataDirOf = (root) => (isRealDirectory(path.join(root, DATA_DIR)) ? path.join(root, DATA_DIR) : root);

// The game= paths of the port's own .ini files in {data}, as the port would open them.
function gamePaths(data, ctx) {
  const found = new Map();
  const files = ctx
    .readDirectory(data)
    .filter((entry) => entry.isFile() && /\.ini$/i.test(entry.name))
    .slice(0, MAX_INI_FILES);
  for (const entry of files) {
    for (const line of textOf(formats.readBounded(path.join(data, entry.name), MAX_INI_BYTES)).split(/\r?\n/)) {
      const match = /^\s*game\s*=\s*(.+?)\s*$/.exec(line);
      if (match) found.set(match[1], ctx.localPath(data, match[1]));
    }
  }
  return [...found.values()];
}

const isGameRoot = (dir) => isRegularFile(path.join(dir, 'PARAM.SFO')) && isRealDirectory(path.join(dir, 'TROPDIR'));

/*
  The disc at a game path: a decrypted .iso, a PS3_GAME folder or the folder holding it. Each
  answers its PARAM.SFO, its TROPDIR set names, and where one set's TROPHY.TRP is.
*/
function discAt(gamePath, ctx) {
  if (/\.iso$/i.test(gamePath) && isRegularFile(gamePath)) {
    return {
      gameRoot: '',
      sfo: () => iso.readFile(gamePath, `${DISC_GAME}/PARAM.SFO`, formats.MAX_SMALL_BYTES),
      sets: () => (iso.listDirectory(gamePath, `${DISC_GAME}/TROPDIR`) || []).filter((entry) => entry.isDirectory).map((entry) => entry.name),
      trophy: (set) => ({ trophyFile: gamePath, trophyEntry: `${DISC_GAME}/TROPDIR/${set}/TROPHY.TRP` }),
    };
  }
  const gameRoot = [gamePath, path.join(gamePath, DISC_GAME)].find(isGameRoot);
  if (!gameRoot) return null;
  return {
    gameRoot,
    sfo: () => formats.readBounded(path.join(gameRoot, 'PARAM.SFO'), formats.MAX_SMALL_BYTES),
    sets: () => ctx.readDirectory(path.join(gameRoot, 'TROPDIR')).filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    trophy: (set) => (isRegularFile(path.join(gameRoot, 'TROPDIR', set, 'TROPHY.TRP')) ? { trophyFile: path.join(gameRoot, 'TROPDIR', set, 'TROPHY.TRP'), trophyEntry: '' } : null),
  };
}

function trophiesDirOf(data) {
  const root = GAMEDATA_ROOTS.find((sub) => isRealDirectory(path.join(data, sub, 'trophies'))) || GAMEDATA_ROOTS[0];
  return path.join(data, root, 'trophies');
}

// One game per trophy set of the one disc the port was given and accepts; [] when it is not a launcher port.
function games(root, ctx) {
  const manifest = manifestOf(root);
  if (!manifest) return [];
  const data = dataDirOf(root);
  const discs = gamePaths(data, ctx).map((gamePath) => discAt(gamePath, ctx)).filter(Boolean);
  const accepted = discs
    .map((disc) => ({ disc, sfo: formats.readSfo(disc.sfo()) || {} }))
    .filter(({ sfo }) => manifest.titleIds.has(sfo.TITLE_ID));
  if (accepted.length !== 1) {
    ctx.debug.log(`[ps3recomp] '${root}': RecompLauncher port without one accepted disc (${discs.length} game path(s) found)`);
    return [];
  }
  const [{ disc, sfo }] = accepted;
  const titleId = sfo.TITLE_ID;
  const update = path.join(data, 'user', 'dev_hdd0', 'game', titleId, 'TROPDIR');
  const trophies = trophiesDirOf(data);
  const exe = manifest.programs.map((name) => path.join(root, name)).find(isRegularFile) || '';
  return disc
    .sets()
    .filter((set) => SET_ID.test(set))
    .slice(0, MAX_SETS)
    .map((set) => {
      const patched = path.join(update, set, 'TROPHY.TRP');
      const list = isRegularFile(patched) ? { trophyFile: patched, trophyEntry: '' } : disc.trophy(set);
      return list && { set, list };
    })
    .filter(Boolean)
    .map(({ set, list }) => ({
      appid: `ps3recomp-${set}`,
      installRoot: root,
      gameRoot: disc.gameRoot,
      titleId,
      title: sfo.TITLE || manifest.name || titleId,
      npcommid: set,
      ...list,
      exe,
      trophiesDir: trophies,
      progressFile: path.join(trophies, `${set}.json`),
    }));
}

module.exports = { games, isPort, MANIFEST };
