'use strict';

// ShadPS4 (PS4 emulator) trophy reader: schema + unlock state live in per-game TROP*.XML files (no
// binary save to decode, unlike RPCS3). Layout: <root>/game_data/<CUSA#####>/TrophyFiles/...; both
// game_data and user/game_data are enumerated and de-duplicated by CUSA id.

const path = require('path');
const util = require('util');
// The XML parser is 37 files and only a trophy file needs it, so it loads when one is read.
let xml2jsModule = null;
const xml2js = () => (xml2jsModule ||= require('xml2js'));
const { lazyRequire } = require('../util/lazyRequire.js');
const glob = lazyRequire('fast-glob');
const ffs = require('../util/fsAsync');


// Best-effort language → TROP_NN.XML suffix (ShadPS4/Sony index). english has no suffix (TROP.XML).
const LANG_FILE = {
  japanese: '00', english: '01', french: '02', spanish: '03', german: '04', italian: '05',
  dutch: '06', portuguese: '07', russian: '08', koreana: '09', tchinese: '10', schinese: '11',
  polish: '16', brazilian: '17', turkish: '19', latam: '20',
};

const toUnixSeconds = (raw) => {
  let n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e12) n = Math.floor(n / 1000000); // microseconds
  else if (n > 1e11) n = Math.floor(n / 1000); // milliseconds
  return n;
};

const ttype = (t) => {
  const c = String(t || '').trim().toUpperCase();
  if (['P', 'G', 'S', 'B'].includes(c)) return c;
  if (c.startsWith('PLAT')) return 'P';
  if (c.startsWith('GOLD')) return 'G';
  if (c.startsWith('SILV')) return 'S';
  if (c.startsWith('BRON')) return 'B';
  return c || 'B';
};

/*
  The folder names that are part of shadPS4's own trophy tree. Standing on one of them means the
  watched folder is INSIDE that tree, so walking up from it lands on the tree's root. Standing on
  anything else (`log`, `savedata`, `shader`, a game folder that merely sits beside an emulator)
  means it is not, and walking up from there would answer with somebody else's trophies.
*/
const SHADPS4_TREE_SEGMENT = /^(game_data|user|TrophyFiles|CUSA\d{5}|trophy\d*|Xml|Icons|home|NPWR\d{5}_\d{2})$/i;
// The user id folder of home/<id>/trophy is a bare number, so it counts only under home.
const isInsideTree = (dir) => SHADPS4_TREE_SEGMENT.test(path.basename(dir)) || (/^\d+$/.test(path.basename(dir)) && /^home$/i.test(path.basename(path.dirname(dir))));

const uniquePaths = (paths) => {
  const seen = new Set();
  return paths.filter((candidate) => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/*
  Folders that could be shadPS4's user folder, for one watched folder, most specific first.

  shadPS4 has moved its user data around (beside the binary, then under `user/`, then under
  %APPDATA%\shadPS4), and people add whichever level they happened to be looking at - the emulator
  folder, `user`, `game_data`, or the CUSA folder they were just reading a guide about. Climbing
  back out of the tree costs a handful of stats and removes the whole class of "I added the right
  folder and nothing appeared", while the segment allowlist above keeps the climb from turning any
  folder near an emulator into a trophy source. Path-only, so the ordering is testable without a disk.
*/
function userRootCandidates(dir) {
  const base = path.resolve(String(dir || ''));
  const levels = [base];
  let current = base;
  // Four is the depth of the deepest layout (game_data/CUSA/TrophyFiles/trophyNN plus Xml|Icons).
  for (let depth = 0; depth < 5; depth++) {
    if (!isInsideTree(current)) break;
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    levels.push(parent);
    current = parent;
  }
  return uniquePaths(levels.flatMap((level) => [level, path.join(level, 'user')]));
}

function gameDataRootCandidates(dir) {
  const base = path.resolve(String(dir || ''));
  // The folder itself, when the user added `.../user/game_data` directly.
  const self = path.basename(base).toLowerCase() === 'game_data' ? [base] : [];
  return uniquePaths([...self, ...userRootCandidates(dir).map((root) => path.join(root, 'game_data'))]);
}

async function gameDataRoots(dir) {
  const roots = [];
  for (const candidate of gameDataRootCandidates(dir)) {
    if (await ffs.exists(candidate)) roots.push(candidate);
  }
  return roots;
}

/*
  The config (config.json since 0.19, config.toml before) sits beside the binary in a portable
  install and under `user/` in an %APPDATA% one. Climbed the same way as the trophy tree, and for
  the same reason: from inside the tree the config is a couple of levels up, but a folder that is
  not part of the tree must not borrow the config of whatever happens to be above it.
*/
function configFileCandidates(dir) {
  return userRootCandidates(dir).flatMap((root) => [path.join(root, 'config.json'), path.join(root, 'config.toml')]);
}

function configArray(config, key) {
  const match = String(config || '').match(new RegExp(`^\\s*${key}\\s*=\\s*(\\[[^\\]]*\\])`, 'm'));
  if (!match) return [];
  try {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// The install folders and the home folder override, from whichever config the first level has.
async function readConfig(dir) {
  for (const file of configFileCandidates(dir)) {
    let text;
    try {
      text = await ffs.readFile(file, 'utf-8');
    } catch {
      continue;
    }
    if (path.extname(file) === '.toml') {
      return { installDirs: configArray(text, 'installDirs'), enabled: configArray(text, 'installDirsEnabled'), homeDir: '' };
    }
    try {
      const general = JSON.parse(text).General || {};
      const dirs = Array.isArray(general.install_dirs) ? general.install_dirs : [];
      return {
        installDirs: dirs.map((entry) => entry && entry.path),
        enabled: dirs.map((entry) => entry && entry.enabled),
        homeDir: typeof general.home_dir === 'string' ? general.home_dir : '',
      };
    } catch {
      /* a half-written config.json: try the next level */
    }
  }
  return { installDirs: [], enabled: [], homeDir: '' };
}

// Trophy data survives a game uninstall, so it is not proof that the PS4 game itself is still
// present. Resolve shadPS4's enabled install directories and require a real game layout
// (sce_sys/param.sfo + eboot.bin). The CUSA id is embedded as plain ASCII in PARAM.SFO, the NP
// trophy ids the 0.19 layout is keyed on in npbind.dat.
async function installedGames(dir, config) {
  const games = new Map();
  const { installDirs, enabled } = config || (await readConfig(dir));
  for (let i = 0; i < installDirs.length; i++) {
    if (enabled[i] === false || typeof installDirs[i] !== 'string' || !installDirs[i].trim()) continue;
    const installDir = path.resolve(installDirs[i]);
    let sfos = [];
    try {
      sfos = await glob('**/sce_sys/param.sfo', {
        cwd: installDir,
        onlyFiles: true,
        absolute: true,
        deep: 5,
      });
    } catch {
      continue;
    }

    for (const sfo of sfos) {
      const gameDir = path.normalize(path.dirname(path.dirname(sfo)));
      if (!(await ffs.exists(path.join(gameDir, 'eboot.bin')))) continue;
      try {
        const raw = await ffs.readFile(sfo);
        const match = raw.toString('latin1').match(/CUSA\d{5}/i);
        if (match) games.set(match[0].toUpperCase(), gameDir);
      } catch {}
      try {
        const npbind = await ffs.readFile(path.join(path.dirname(sfo), 'npbind.dat'));
        for (const id of npbind.toString('latin1').match(/NPWR\d{5}_\d{2}/gi) || []) games.set(id.toUpperCase(), gameDir);
      } catch {}
    }
  }
  return games;
}

/*
  shadPS4 0.19 and later: the schema in <user>/trophy/<NPWR…>/Xml and the unlocks in a copy of
  TROPCONF.XML at <home>/<user id>/trophy/<NPWR…>.xml, <home> being <user>/home unless the config
  moves it. With several users, the most recently written copy wins.
*/
async function npTrophySets(dir, homeOverride) {
  const sets = [];
  for (const userRoot of userRootCandidates(dir)) {
    const trophyRoot = path.join(userRoot, 'trophy');
    let ids;
    try {
      ids = await glob('NPWR*', { cwd: trophyRoot, onlyDirectories: true });
    } catch {
      continue;
    }
    const home = homeOverride && (await ffs.exists(homeOverride)) ? homeOverride : path.join(userRoot, 'home');
    for (const id of ids) {
      const trophyDir = path.join(trophyRoot, id);
      if ((await listXml(path.join(trophyDir, 'Xml'))).length === 0) continue;
      const copies = await glob(`*/trophy/${id}.xml`, { cwd: home, onlyFiles: true, absolute: true, stats: true });
      const newest = copies.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)[0];
      sets.push({ id, trophyDir, statePath: newest ? path.normalize(newest.path) : undefined });
    }
  }
  return sets;
}

// The NP id a pre-0.19 trophy set belongs to, so a game seen in both layouts is listed once.
async function npCommIdOf(trophyDir) {
  try {
    const conf = await ffs.readFile(path.join(trophyDir, 'Xml', 'TROPCONF.XML'), 'utf-8');
    return (conf.match(/<npcommid>\s*([^<\s]+)\s*<\/npcommid>/i) || [])[1];
  } catch {
    return undefined;
  }
}

module.exports.scan = async (dir) => {
  const data = [];
  const seen = new Set();

  try {
    const config = await readConfig(dir);
    const installed = await installedGames(dir, config);
    for (const set of await npTrophySets(dir, config.homeDir)) {
      if (seen.has(set.id)) continue;
      seen.add(set.id);
      const gameDir = installed.get(set.id.toUpperCase());
      data.push({
        appid: set.id,
        source: 'ShadPS4 Emulator',
        data: { type: 'shadps4', path: set.trophyDir, statePath: set.statePath, gameDir, trustedInstalled: !!gameDir },
      });
    }

    for (const gameData of await gameDataRoots(dir)) {
      let cusaDirs;
      try {
        cusaDirs = await glob('CUSA*', { cwd: gameData, onlyDirectories: true, absolute: false });
      } catch {
        continue;
      }

      for (const cusa of cusaDirs) {
        if (seen.has(cusa)) continue;
        try {
          const trophyFiles = path.join(gameData, cusa, 'TrophyFiles');
          const sets = await glob('trophy*', { cwd: trophyFiles, onlyDirectories: true, absolute: false });
          for (const set of sets) {
            const trophyDir = path.join(trophyFiles, set);
            const xmls = await glob('TROP*.{XML,xml}', { cwd: path.join(trophyDir, 'Xml'), onlyFiles: true });
            if (xmls.length === 0) continue;
            // Left behind by a shadPS4 that has since moved the game to the 0.19 layout.
            if (seen.has(await npCommIdOf(trophyDir))) break;
            const gameDir = installed.get(cusa.toUpperCase());
            data.push({
              appid: cusa,
              source: 'ShadPS4 Emulator',
              data: { type: 'shadps4', path: trophyDir, gameDir, trustedInstalled: !!gameDir },
            });
            seen.add(cusa);
            break; // one trophy set per game
          }
        } catch {}
      }
    }
  } catch {}

  return data;
};

module.exports._internal = { configArray, configFileCandidates, gameDataRootCandidates, userRootCandidates, installedGames, readConfig };

async function listXml(xmlDir) {
  const files = await glob('TROP*.{XML,xml}', { cwd: xmlDir, onlyFiles: true });
  // Stable order so a deterministic "base" language file is chosen.
  return files.sort();
}

async function readXml(filePath) {
  const file = await ffs.readFile(filePath, 'utf-8');
  return util.promisify(xml2js().parseString)(file, {
    explicitArray: false,
    explicitRoot: false,
    ignoreAttrs: false,
    emptyTag: null,
  });
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

module.exports.getGameData = async (dir, lang) => {
  const xmlDir = path.join(dir, 'Xml');
  const iconsDir = path.join(dir, 'Icons');
  const files = await listXml(xmlDir);
  if (files.length === 0) throw 'No TROP*.XML found';

  // Prefer the requested language file, then the default TROP.XML, then the first available.
  const suffix = LANG_FILE[String(lang || '').toLowerCase()];
  const wanted = suffix ? `trop_${suffix}.xml` : 'trop.xml';
  const baseFile =
    files.find((f) => f.toLowerCase() === wanted) ||
    files.find((f) => f.toLowerCase() === 'trop.xml') ||
    files[0];

  const schema = await readXml(path.join(xmlDir, baseFile));
  const trophies = asArray(schema.trophy);
  // .../game_data/<CUSA>/TrophyFiles/<set> before 0.19, .../trophy/<NPWR> since.
  const gameId = path.basename(path.dirname(dir)).toLowerCase() === 'trophyfiles' ? path.basename(path.dirname(path.dirname(dir))) : path.basename(dir);

  const list = trophies.map((trophy) => {
    const attr = trophy['$'] || {};
    const id = parseInt(attr.id, 10);
    const pad = String(Number.isFinite(id) ? id : attr.id).padStart(3, '0');
    const icon = 'file:///' + path.join(iconsDir, `TROP${pad}.PNG`).replace(/\\/g, '/');
    return {
      name: Number.isFinite(id) ? id : attr.id,
      hidden: String(attr.hidden).toLowerCase() === 'yes' ? 1 : 0,
      type: ttype(attr.ttype),
      displayName: trophy.name || '',
      description: trophy.detail || '',
      icon,
      icongray: icon,
    };
  });

  // Game header: ShadPS4 has no cover art on disk, so use the platinum/first trophy icon as a
  // non-broken placeholder. The advanced cover-management UI lets the user override it.
  const header = list.length > 0 ? list[0].icon : undefined;

  return {
    name: schema['title-name'] || gameId,
    appid: gameId,
    system: 'playstation',
    img: { header },
    achievement: {
      total: list.length,
      list,
    },
  };
};

/*
  Relock every trophy in a TROP*.XML as a text edit, not a re-serialize: ShadPS4 keeps definitions and
  unlock state in the same file, and re-serializing the parsed XML would rewrite the whole document,
  losing any attribute/entity this reader does not model. Only unlockstate/unlocked/timestamp change.
  Returns the new text and how many trophies were unlocked before.
*/
function clearTrophyXml(text) {
  const source = String(text == null ? '' : text);
  let cleared = 0;
  const updated = source.replace(/<trophy\b[^>]*>/gi, (tag) => {
    if (/unlockstate\s*=\s*"true"/i.test(tag) || /unlocked\s*=\s*"yes"/i.test(tag)) cleared += 1;
    return tag
      .replace(/(unlockstate\s*=\s*")[^"]*(")/gi, '$1false$2')
      .replace(/(unlocked\s*=\s*")[^"]*(")/gi, '$1no$2')
      .replace(/(timestamp\s*=\s*")[^"]*(")/gi, '$1$2');
  });
  return { text: updated, cleared };
}

module.exports.clearTrophyXml = clearTrophyXml;

module.exports.getAchievements = async (dir, statePath) => {
  // Before 0.19 the unlock state lives in the TROP*.XML files themselves (attributes unlockstate /
  // unlocked / timestamp): union across all language files so a flag written to only one counts.
  // Since 0.19 it lives only in the per-user copy, which may not exist until the game first boots.
  const xmlDir = path.join(dir, 'Xml');
  const files = statePath ? [statePath] : (await listXml(xmlDir)).map((file) => path.join(xmlDir, file));
  const byId = new Map();

  for (const file of files) {
    let schema;
    try {
      schema = await readXml(file);
    } catch {
      continue;
    }
    for (const trophy of asArray(schema.trophy)) {
      const attr = trophy['$'] || {};
      if (attr.id === undefined) continue;
      const id = parseInt(attr.id, 10);
      const key = Number.isFinite(id) ? id : attr.id;
      const unlocked =
        String(attr.unlockstate).toLowerCase() === 'true' || String(attr.unlocked).toLowerCase() === 'yes';
      const time = toUnixSeconds(attr.timestamp);
      const prev = byId.get(key);
      if (!prev || (unlocked && !prev.achieved)) {
        byId.set(key, { id: key, achieved: unlocked, earned_time: time || (prev ? prev.earned_time : 0) });
      }
    }
  }

  return [...byId.values()];
};
