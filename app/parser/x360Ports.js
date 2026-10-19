'use strict';

/*
  Recompiled Xbox 360 games known by their executable, with the title it plays and where the port
  keeps its unlock list (`layout`, resolved by layoutTarget), so an installed game is listed before
  its first unlock writes that list and the Watchdog can wait where it will appear.
*/

const fs = require('fs');
const path = require('path');
const { allowedFromConfig } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const PORTS = Object.freeze([
  { name: 'Unleashed Recompiled', titleIds: ['53450812'], exes: ['unleashedrecomp.exe'], layout: 'unleashed', xexFolders: ['patched'] },
  { name: "Dante's Inferno", titleIds: ['454108CF'], exes: ['dantes_inferno.exe', 'dantes_inferno_native.exe', 'dantesinferno.exe'], layout: 'documents', app: 'dantes_inferno' },
  { name: 'LEGO Dimensions', titleIds: ['5752084B'], exes: ['legodimensions.exe'], layout: 'documents' },
  { name: 'Midnight Club: Los Angeles', titleIds: ['545407F8'], exes: ['midnightclubla.exe', 'mcla.exe', 'larecomp.exe'], layout: 'documents', xexFolders: ['MCLA_Game_Files'] },
  { name: 'Spider-Man: Edge of Time', titleIds: ['415608B2'], exes: ['spidermaneot.exe'], layout: 'tsv', app: 'spider_man_edge_of_time' },
  { name: 'Blue Dragon (re:Blue)', titleIds: ['4D5307DF'], exes: ['reblue.exe'], layout: 'profiles' },
  { name: 'Castlevania: Symphony of the Night', titleIds: ['58410847', '5841089D'], exes: ['nocturnerecomp.exe'], layout: 'documents' },
  { name: 'Silent Hill: Downpour', titleIds: ['4B4E0823'], exes: ['downpour.exe'], layout: 'user', userFolder: 'user' },
  { name: 'Deadly Premonition', titleIds: ['4D5607D1'], exes: ['deadlyprem.exe'], layout: 'user', userFolder: 'userdata' },
  { name: 'Deadly Premonition', titleIds: ['494F07D4'], exes: ['deadlyprem_usa.exe'], layout: 'user', userFolder: 'userdata' },
  // The himdo port always saves beside itself, whatever a launcher passes.
  { name: 'Fable II', titleIds: ['4D5307F1'], exes: ['fable_2.exe'], layout: 'user', userFolder: 'saves', fixed: true },
  { name: 'Naughty Bear (ReStuff)', titleIds: ['464F07D8'], exes: ['restuff.exe'], layout: 'documents' },
  { name: 'Condemned 2: Bloodshot', titleIds: ['534507EF'], exes: ['condemned2recomp.exe'], layout: 'user', userFolder: 'UserData' },
  { name: 'Project Gotham Racing 4', titleIds: ['4D5307F9'], exes: ['pgr4_recomp.exe', 'pgr4_recompiled.exe'], layout: 'documents' },
  { name: 'Crackdown 2', titleIds: ['4D5308BC'], exes: ['crackdown2.exe'], layout: 'documents' },
  { name: 'Banjo-Kazooie: Nuts & Bolts (reNut)', titleIds: ['4D5307ED'], exes: ['renut.exe'], layout: 'renut' },
  // Skate3Recomp 2.0.2 acknowledges unlocks without ever writing them anywhere.
  { name: 'Skate 3', titleIds: ['454108E6'], exes: ['skate3.exe'], layout: 'none' },
]);

const HOLLOW = Object.freeze({ name: 'Gears of War 2 (Hollow)', titleId: '4D53082D' });
const HOLLOW_NAME_RE = /gears[ _-]*of[ _-]*war[ _-]*2/i;
const HOLLOW_EXES = [['Binaries', 'GearGame.exe'], ['Binaries', 'Win32', 'GearGame.exe'], ['GearGame', 'Binaries', 'GearGame.exe']];
const XEX_FOLDERS = ['', 'game', 'assets', 'content', 'base'];
const MAX_CONFIG_BYTES = 128 * 1024;

const PORT_EXES = new Set(PORTS.flatMap((port) => port.exes));
const isPortExe = (name) => PORT_EXES.has(String(name).toLowerCase());

// A port executable is a real program, not any file wearing its name.
function isProgram(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(2);
    return fs.readSync(fd, head, 0, 2, 0) === 2 && head.toString('latin1') === 'MZ';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function entriesOf(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// `name` inside `dir` as the disk spells it: Linux folders are case-sensitive.
function childPath(dir, name, wantDirectory) {
  const lower = name.toLowerCase();
  const hit = entriesOf(dir).find((entry) => entry.name.toLowerCase() === lower && (wantDirectory ? entry.isDirectory() : entry.isFile()));
  return hit ? path.join(dir, hit.name) : '';
}

function findXex(install, ports, readTitleId) {
  const folders = [...new Set([...ports.flatMap((port) => port.xexFolders || []), ...XEX_FOLDERS])];
  for (const folder of folders) {
    const dir = folder ? childPath(install, folder, true) : install;
    const file = dir && childPath(dir, 'default.xex', false);
    const titleId = file ? readTitleId(file) : '';
    if (titleId) return { file, titleId };
  }
  return null;
}

/*
  The port an install is, from its executables and, when it has one, its default.xex: { port, exe,
  titleId, xex }, { skip } when the two disagree or the region cannot be told, or null.
*/
function choosePort(install, exeNames, readTitleId) {
  const byLower = new Map(exeNames.map((name) => [name.toLowerCase(), name]));
  const candidates = PORTS.filter((port) => port.exes.some((exe) => byLower.has(exe)));
  if (!candidates.length) return null;
  const xex = findXex(install, candidates, readTitleId);
  const chosen = xex ? candidates.filter((port) => port.titleIds.includes(xex.titleId)) : candidates;
  if (!chosen.length) return { skip: `its default.xex is title ${xex.titleId}, which none of its executables plays` };
  const titleIds = new Set(xex ? [xex.titleId] : chosen.flatMap((port) => port.titleIds));
  if (titleIds.size > 1) return { skip: 'its region needs the game data (default.xex) to be told' };
  const port = chosen[0];
  const exe = byLower.get(port.exes.find((name) => byLower.has(name)));
  return { port, exe: path.join(install, exe), titleId: [...titleIds][0], xex: xex ? xex.file : '' };
}

// renut.cfg as the reNut wizard writes it: plain key=value lines with absolute paths, both required.
function readRenutConfig(file, toLocal) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return null;
    const roots = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      // Split by index: a lazy regex over the value rescans a long line quadratically.
      const eq = line.indexOf('=');
      const key = eq > 0 ? line.slice(0, eq).trim() : '';
      if (key !== 'game_data_root' && key !== 'user_data_root') continue;
      const value = line.slice(eq + 1).trim().replace(/^"/, '').replace(/"$/, '').trim();
      if (value.includes('"')) continue;
      const local = toLocal(value);
      if (!local || !path.isAbsolute(local) || !allowedFromConfig(local, file)) return null;
      roots[key] = path.normalize(local);
    }
    return roots.game_data_root && roots.user_data_root ? roots : null;
  } catch {
    return null;
  }
}

const stem = (file) => path.basename(file).replace(/\.exe$/i, '');

// The folder the port saves under ({ root, pendingRoot }), or { skip }.
function userRootFor(port, choice, install, ctx) {
  const beside = { root: path.join(install, port.userFolder || ''), pendingRoot: install };
  if (port.fixed) return beside;
  const declared = ctx.declaredUserRoot(install, [path.basename(choice.exe)]);
  if (declared && declared.root) return { root: declared.root, pendingRoot: path.dirname(declared.root) };
  if (declared) ctx.log(`${port.name}: a launcher beside it ${declared.computed ? 'works out its save folder at run time' : 'names several save folders'}; the default one is watched`);
  if (port.layout === 'user') return beside;
  const documents = ctx.documentsFor(install);
  if (!documents) return { skip: 'no Documents folder is known for it' };
  return { root: path.join(documents, port.app || stem(choice.exe)), pendingRoot: documents };
}

function profileTarget(choice, install) {
  const profiles = path.join(install, 'profiles');
  const files = entriesOf(profiles)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(profiles, entry.name, 'achievements', `${choice.titleId}.toml`))
    .filter((file) => fs.existsSync(file));
  if (!files.length) files.push(path.join(profiles, 'default', 'achievements', `${choice.titleId}.toml`));
  return { format: 'toml', file: files[0], profileFiles: files, pendingRoot: install };
}

function unleashedTarget(install, ctx) {
  const portable = fs.existsSync(path.join(install, 'portable.txt'));
  const appData = portable ? '' : ctx.appDataFor(install);
  if (!portable && !appData) return { skip: 'no APPDATA folder is known for it' };
  const root = portable ? install : path.join(appData, 'UnleashedRecomp');
  return { format: 'unleashed', file: path.join(root, 'save', 'ACH-DATA'), pendingRoot: portable ? install : appData };
}

function renutTarget(choice, install, ctx) {
  const config = readRenutConfig(path.join(install, 'renut.cfg'), ctx.toLocal);
  // Until the wizard has run there is no save folder to name: pending, and quiet about it.
  if (!config) return { format: 'toml', pendingRoot: install };
  const root = config.user_data_root;
  return { format: 'toml', file: path.join(root, 'achievements', `${choice.titleId}.toml`), pendingRoot: path.dirname(root) };
}

function layoutTarget(choice, install, ctx) {
  const { port, titleId } = choice;
  if (port.layout === 'profiles') return profileTarget(choice, install);
  if (port.layout === 'unleashed') return unleashedTarget(install, ctx);
  if (port.layout === 'renut') return renutTarget(choice, install, ctx);
  const where = userRootFor(port, choice, install, ctx);
  if (where.skip) return where;
  if (port.layout === 'tsv') return { format: 'tsv', dir: path.join(where.root, 'Achievements', titleId), pendingRoot: where.pendingRoot };
  return { format: 'toml', file: path.join(where.root, 'achievements', `${titleId}.toml`), pendingRoot: where.pendingRoot };
}

/*
  The unlock-list target of a port installed in `install`, shaped like the ones discovery finds on
  disk, with `pending` set while the list does not exist yet. { skip } says why it is not listed.
*/
function resolvePort(install, exeNames, ctx) {
  const choice = choosePort(install, exeNames, ctx.readTitleId);
  if (!choice || choice.skip) return choice;
  if (choice.port.layout === 'none') return { skip: `${choice.port.name}: this port does not save its unlocks, so there is nothing to read or watch` };
  const target = layoutTarget(choice, install, ctx);
  if (target.skip) return { skip: `${choice.port.name}: ${target.skip}` };
  const list = target.file || target.dir;
  return {
    ...target,
    titleId: choice.titleId,
    gameDir: install,
    exe: choice.exe,
    xex: choice.xex,
    port: choice.port.name,
    pending: !list || !fs.existsSync(list),
  };
}

// Hollow ships GearGame's own layout and executable rather than a recompiled one: its exe, or ''.
function isHollowInstall(dir) {
  if (!HOLLOW_NAME_RE.test(path.basename(dir)) || !childPath(dir, 'GearGame', true)) return '';
  return HOLLOW_EXES.map((parts) => path.join(dir, ...parts)).find(isProgram) || '';
}

function hollowTarget(install, gearGame) {
  const saveData = childPath(gearGame, 'SaveData', true) || path.join(gearGame, 'SaveData');
  const file = childPath(saveData, 'Achievements.json', false) || path.join(saveData, 'Achievements.json');
  // No title id on the target: the JSON shape is keyed by its folder, and must stay so once it exists.
  return { format: 'json', file, knownTitleId: HOLLOW.titleId, port: HOLLOW.name, pendingRoot: install, pending: !fs.existsSync(file) };
}

module.exports = { PORTS, isPortExe, isProgram, isHollowInstall, hollowTarget, resolvePort, childPath };
