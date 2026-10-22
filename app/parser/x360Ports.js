'use strict';

/*
  Recompiled Xbox 360 games known by their executable, with the title it plays and where the port
  keeps its unlock list (`layout`, resolved by layoutTarget), so an installed game is listed before
  its first unlock writes that list and the Watchdog can wait where it will appear. `native`,
  `appImages` and `linux.saves` describe the Linux builds.
*/

const fs = require('fs');
const path = require('path');
const { allowedFromConfig } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const UNLEASHED_FLATPAK = 'io.github.hedge_dev.unleashedrecomp';
const MARATHON_FLATPAK = 'io.github.sonicnext_dev.marathonrecomp';
const LOST_ODYSSEY_FLATPAK = 'io.github.freefrank.LostOdysseyRecomp';
const MARATHON_FILE = 'SonicNextAchievementData.bin';

// Unleashed reads $HOME/.config (or $HOME/.UnleashedRecomp without one), never XDG_CONFIG_HOME.
const unleashedLinux = (x) => [path.join(x.home, '.config', 'UnleashedRecomp', 'save', 'ACH-DATA'), path.join(x.home, '.UnleashedRecomp', 'save', 'ACH-DATA')];
const marathonLinux = (x) => [
  path.join(x.config, 'MarathonRecomp', 'save', MARATHON_FILE),
  path.join(x.home, '.MarathonRecomp', 'save', MARATHON_FILE),
  path.join(x.flatpak(MARATHON_FLATPAK, 'config'), 'MarathonRecomp', 'save', MARATHON_FILE),
];
// An AppImage or a read-only install keeps it in XDG data, the Flatpak in its own ~/.var/app folder.
const lostOdysseyLinux = (x) => [path.join(x.data, 'lost-odyssey-recomp', 'profile', 'achievements.ini'), path.join(x.flatpak(LOST_ODYSSEY_FLATPAK, 'data'), 'profile', 'achievements.ini')];

const PORTS = Object.freeze([
  { name: 'Unleashed Recompiled', titleIds: ['53450812'], exes: ['unleashedrecomp.exe'], native: ['unleashedrecomp'], layout: 'unleashed', xexFolders: ['patched'], linux: { saves: unleashedLinux, flatpak: UNLEASHED_FLATPAK } },
  { name: "Dante's Inferno", titleIds: ['454108CF'], exes: ['dantes_inferno.exe', 'dantes_inferno_native.exe', 'dantesinferno.exe'], layout: 'documents', app: 'dantes_inferno' },
  { name: 'LEGO Dimensions', titleIds: ['5752084B'], exes: ['legodimensions.exe'], layout: 'documents' },
  { name: 'Midnight Club: Los Angeles', titleIds: ['545407F8'], exes: ['midnightclubla.exe', 'mcla.exe', 'larecomp.exe'], layout: 'documents', xexFolders: ['MCLA_Game_Files'] },
  { name: 'Spider-Man: Edge of Time', titleIds: ['415608B2'], exes: ['spidermaneot.exe'], layout: 'tsv', app: 'spider_man_edge_of_time' },
  // EdgeOfTimeRecomp: ReXGlue's toml under profiles\<name> of its install root.
  { name: 'Spider-Man: Edge of Time', titleIds: ['415608B2'], exes: ['edgeoftimerecomp.exe', 'reeot.exe'], native: ['reeot'], appImages: ['edgeoftimerecomp'], layout: 'reeot', xexFolders: ['game'] },
  { name: 'Blue Dragon (re:Blue)', titleIds: ['4D5307DF'], exes: ['reblue.exe'], layout: 'profiles' },
  { name: 'Castlevania: Symphony of the Night', titleIds: ['58410847', '5841089D'], exes: ['nocturnerecomp.exe'], native: ['nocturnerecomp'], layout: 'documents' },
  { name: 'Silent Hill: Downpour', titleIds: ['4B4E0823'], exes: ['downpour.exe'], layout: 'user', userFolder: 'user' },
  { name: 'Deadly Premonition', titleIds: ['4D5607D1'], exes: ['deadlyprem.exe'], layout: 'user', userFolder: 'userdata' },
  { name: 'Deadly Premonition', titleIds: ['494F07D4'], exes: ['deadlyprem_usa.exe'], layout: 'user', userFolder: 'userdata' },
  // The himdo port always saves beside itself, whatever a launcher passes.
  { name: 'Fable II', titleIds: ['4D5307F1'], exes: ['fable_2.exe'], layout: 'user', userFolder: 'saves', fixed: true },
  { name: 'Naughty Bear (ReStuff)', titleIds: ['464F07D8'], exes: ['restuff.exe'], layout: 'documents' },
  { name: 'Condemned 2: Bloodshot', titleIds: ['534507EF'], exes: ['condemned2recomp.exe'], layout: 'user', userFolder: 'UserData' },
  { name: 'Project Gotham Racing 4', titleIds: ['4D5307F9'], exes: ['pgr4_recomp.exe', 'pgr4_recompiled.exe'], layout: 'documents' },
  { name: 'Crackdown 2', titleIds: ['4D5308BC'], exes: ['crackdown2.exe'], layout: 'documents' },
  { name: 'Crackdown', titleIds: ['4D5307DC'], exes: ['crackdown.exe'], native: ['crackdown'], appImages: ['crackdownrecompiled'], layout: 'user', userFolder: 'user_data' },
  { name: 'Banjo-Kazooie: Nuts & Bolts (reNut)', titleIds: ['4D5307ED'], exes: ['renut.exe'], layout: 'renut' },
  // Skate3Recomp 2.0.2 acknowledges unlocks without ever writing them anywhere.
  { name: 'Skate 3', titleIds: ['454108E6'], exes: ['skate3.exe'], layout: 'none' },
  // Its importer may leave the game data anywhere: game-path.txt names it, else game/disc1 and friends.
  { name: 'Lost Odyssey', titleIds: ['4D5307FA'], exes: ['lostodysseyrecomp.exe'], native: ['lostodysseyrecomp'], appImages: ['lostodysseyrecomp'], layout: 'earned-ini', xexFolders: ['game/disc1', 'game', 'disc1'], pointer: 'game-path.txt', linux: { saves: lostOdysseyLinux, flatpak: LOST_ODYSSEY_FLATPAK } },
  { name: 'Super Street Fighter II Turbo HD Remix', titleIds: ['584108A4'], exes: ['ssf2t_hd_remix.exe'], layout: 'user', userFolder: 'user_data' },
  // Its first release (0.1.0) saved in ReXGlue's default folder; later ones move that into user_data.
  { name: 'Geometry Wars: Retro Evolved 2', titleIds: ['584108FF'], exes: ['geometry_wars_retro_evolved_2.exe'], native: ['geometry_wars_retro_evolved_2'], appImages: ['geometrywarsretroevolved2recompiled'], layout: 'user', userFolder: 'user_data', legacy: 'geometry_wars_retro_evolved_2' },
  // The runtime refuses id 0, so the port keeps achievement 0 under 0x10000.
  { name: 'Hard Corps: Uprising', titleIds: ['58410A18'], exes: ['hard_corps_uprising.exe'], layout: 'user', userFolder: 'user_data', idAliases: { 65536: 0 } },
  { name: 'Ridge Racer 6', titleIds: ['4E4D07D3'], exes: ['rr6_recomp.exe'], layout: 'documents', app: 'rr6_recomp' },
  { name: "Peter Jackson's King Kong", titleIds: ['555307D3'], exes: ['king_kong.exe'], layout: 'documents', app: 'king_kong' },
  { name: 'WET', titleIds: ['425307DB'], exes: ['wetrecomp.exe'], layout: 'documents', app: 'wetrecomp' },
  // The port forces <game>\UserData whatever a launcher passes.
  { name: 'WWE SmackDown vs. Raw 2011', titleIds: ['5451085D'], exes: ['svr2011.exe'], layout: 'user', userFolder: 'UserData', fixed: true },
  // The first profile is the user folder itself, the others live in its profiles/<id>.
  { name: 'Perfect Dark Zero', titleIds: ['4D5307D3'], exes: ['perfectdarkzerorecomp.exe'], layout: 'documents', app: 'perfectdarkzerorecomp', profiles: true },
  // Sonic '06 shares Unleashed's ACH-DATA format with 23 records.
  { name: 'Marathon Recompiled (Sonic the Hedgehog)', titleIds: ['534507D6'], exes: ['marathonrecomp.exe'], native: ['marathonrecomp'], layout: 'unleashed', appFolder: 'MarathonRecomp', achFile: MARATHON_FILE, records: 23, linux: { saves: marathonLinux, flatpak: MARATHON_FLATPAK } },
  // OpenPortroid's build (European disc with Title Update 2) ships a launcher whose extra profiles
  // are save folders of their own; nikolaygorb's build of the same disc has none.
  { name: 'Army of Two', titleIds: ['4541084C'], exes: ['armyoftworecomp.exe'], companions: ['armyoftwolauncher.exe', 'ao2_lobby_server.exe'], layout: 'documents', app: 'armyoftworecomp_tu2', xexFolders: ['assets'], profileFolders: ['armyoftworecomp_profiles'] },
  { name: 'Army of Two', titleIds: ['4541084C'], exes: ['armyoftworecomp.exe'], native: ['armyoftworecomp'], layout: 'documents', app: 'armyoftworecomp', xexFolders: ['assets'] },
  { name: 'Army of Two', titleIds: ['454107F8', '4541084C'], exes: ['armyof2.exe'], layout: 'documents', app: 'armyof2', xexFolders: ['ArmyOfTwoExtracted'] },
  // gow2_save_dir in gow2.toml moves the saves; gow2_game_path.txt names the game data.
  { name: 'Gears of War 2', titleIds: ['4D53082D'], exes: ['gow2.exe'], layout: 'localappdata', app: 'GearsOfWar2PC/user', saveSetting: ['gow2.toml', 'gow2_save_dir'], pointer: 'gow2_game_path.txt' },
  // OpenJam: each game root (the base game, every mods\<mod>) names its save folder in saves.path.
  { name: 'NBA JAM: On Fire Edition', titleIds: ['584111EC'], exes: ['nbajam_ofe.exe'], layout: 'saves-path', app: 'nbajam_ofe' },
  { name: 'Kameo: Elements of Power', titleIds: ['4D5307D2'], exes: ['kameorepowered.exe'], native: ['kameorepowered'], layout: 'documents' },
  { name: 'Ace Combat 6: Fires of Liberation', titleIds: ['4E4D07D1'], exes: ['ac6recomp.exe'], layout: 'documents' },
  { name: 'Call of Duty 3', titleIds: ['415607E1'], exes: ['cod3_pc.exe'], layout: 'documents' },
  { name: 'Superman Returns', titleIds: ['454107ED'], exes: ['superman_returns.exe'], layout: 'documents' },
  { name: 'Peggle', titleIds: ['58410889'], exes: ['peggle.exe'], layout: 'documents', xexFolders: ['extracted'] },
  { name: 'Vigilante 8 Arcade', titleIds: ['584108A8'], exes: ['vig8.exe'], layout: 'documents' },
  { name: 'Dragon Ball Z: Burst Limit', titleIds: ['424107DC'], exes: ['burstlimit.exe'], layout: 'documents', xexFolders: ['game_data_root'] },
  { name: 'Forza Motorsport 4', titleIds: ['4D530910'], exes: ['fm4.exe'], layout: 'documents' },
  { name: 'Forza Horizon', titleIds: ['4D5309C9'], exes: ['forza.exe'], layout: 'documents' },
  // The release ships portable.txt, which keeps the saves beside the program.
  { name: '2014 FIFA World Cup Brazil', titleIds: ['454109D4'], exes: ['fifawc14.exe'], layout: 'documents', app: '2014 FIFA World Cup Brazil', portable: ['portable.txt', 'saves'] },
  // The game sits in game\, its saves one folder up.
  { name: 'WWE All Stars', titleIds: ['545107FD'], exes: ['wweallstars.exe'], layout: 'user', userFolder: '../userdata' },
  // CaiusCodes releases: the game runs from resources\runtime, and the launcher of the same name in the release root points at the same resources\userdata.
  { name: 'GoldenEye 007 (XBLA)', titleIds: ['584108A9'], exes: ['goldeneye 007.exe'], layout: 'user', release: true },
  { name: 'Aegis Wing', titleIds: ['5841083C'], exes: ['aegis wing.exe'], layout: 'user', release: true },
  { name: 'Fuse', titleIds: ['4541096E'], exes: ['fuserecomp.exe'], layout: 'documents' },
  { name: 'SEGA Superstars Tennis ReMatch', titleIds: ['534507F5'], exes: ['sst_rematch.exe'], layout: 'documents' },
  { name: 'Outpost Kaloki X', titleIds: ['584107DB'], exes: ['outpost_kaloki_x.exe'], native: ['outpost_kaloki_x'], appImages: ['outpostkalokix'], layout: 'documents', app: 'outpost_kaloki_x' },
  { name: "South Park: Tenorman's Revenge", titleIds: ['58410B80'], exes: ['south_park_tr.exe'], layout: 'documents' },
  { name: "South Park: Let's Go Tower Defense Play!", titleIds: ['58410931'], exes: ['south_park_td.exe'], layout: 'documents' },
  { name: '3 on 3 NHL Arcade', titleIds: ['58410975'], exes: ['nhl3on3.exe'], layout: 'documents' },
  // Supermedo's build; wetrecomp.exe above is the other port of the same game.
  { name: 'WET', titleIds: ['425307DB'], exes: ['wet.exe'], layout: 'documents' },
  { name: 'Tenchu Z', titleIds: ['465307D7'], exes: ['tenchuz.exe'], layout: 'documents' },
  // Everything lives in %LOCALAPPDATA%\ncaafootball14; each mod plays its own mods\<mod>\userdata.
  { name: 'NCAA Football 14', titleIds: ['454109B6'], exes: ['ncaafootball14.exe'], layout: 'localappdata', app: 'ncaafootball14', mods: 'mods' },
  { name: 'Naruto: The Broken Bond', titleIds: ['55530825'], exes: ['naruto the broken bond pc.exe'], layout: 'user', userFolder: 'hdd' },
  // Beside the program, or in Documents when that folder is not writable.
  { name: 'The Bigs 2', titleIds: ['54540830'], exes: ['thebigs2.exe'], layout: 'user', userFolder: 'saves', legacy: 'thebigs2' },
  // Release 0.2.0 ships portable.txt; the first one (0.1.1) saved in Documents.
  { name: 'Skate 2', titleIds: ['4541087F'], exes: ['skate2.exe'], layout: 'documents', portable: ['portable.txt', 'userdata'] },
  { name: 'Dragon Ball Z: Budokai HD (Budokai 3)', titleIds: ['4E4D0856'], exes: ['dbz3.exe'], layout: 'user', userFolder: 'user_data/dbz3', legacy: 'dbz3' },
  { name: 'WWE SmackDown vs. Raw 2007', titleIds: ['545107E0'], exes: ['svr2007.exe', 'svr2007_vulkan.exe'], layout: 'user', userFolder: 'userdata' },
  { name: 'WWE SmackDown vs. Raw 2008', titleIds: ['5451080B'], exes: ['svr2008.exe', 'svr2008_vulkan.exe'], layout: 'user', userFolder: 'userdata' },
  { name: 'WWE SmackDown vs. Raw 2009', titleIds: ['54510826'], exes: ['svr2009.exe', 'svr2009_vulkan.exe'], layout: 'user', userFolder: 'userdata' },
  // Beside the program, or in %LOCALAPPDATA%\bardown when that folder is not writable.
  { name: 'NHL 14', titleIds: ['454109BE'], exes: ['bardown.exe'], layout: 'user', userFolder: 'userdata', localFallback: 'bardown/userdata' },
  { name: 'Forza Motorsport 3', titleIds: ['4D53084D'], exes: ['forza3.exe'], layout: 'user', userFolder: 'userdata' },
  // CrownParkComputing's launchers pass --user_data_root=user-data, which declaredUserRoot reads when it can.
  { name: 'Burnout Revenge', titleIds: ['454107DC'], exes: ['burnoutrevenge.exe'], layout: 'user', userFolder: 'user-data' },
  { name: 'Banjo-Tooie', titleIds: ['58410955'], exes: ['banjotooie.exe'], layout: 'user', userFolder: 'user-data' },
  // The program sits in <package>\build, its saves in <package>\runtime-data\user.
  { name: 'Plants vs. Zombies (Console Edition)', titleIds: ['584109FF'], exes: ['pvz-console-edition.exe'], layout: 'user', userFolder: '../runtime-data/user' },
  { name: 'Forza Horizon (Pinyon Shift)', titleIds: ['4D5309C9'], exes: ['pinyon_shift.exe'], native: ['pinyon_shift'], layout: 'pinyon' },
  // Estacado's own layout: Saved Games, or runtime_data beside the program.
  { name: 'The Darkness (Estacado)', titleIds: ['545407EE'], exes: ['thedarkness.exe'], layout: 'estacado' },
  { name: 'The Darkness', titleIds: ['545407EE'], exes: ['thedarknessrecomp.exe'], layout: 'documents' },
  // A Linux-only port.
  { name: 'Guitar Hero II (reGH2)', titleIds: ['415607E7'], exes: [], native: ['gh2'], layout: 'documents', app: 'gh2' },
]);

const HOLLOW = Object.freeze({ name: 'Gears of War 2 (Hollow)', titleId: '4D53082D' });
const HOLLOW_NAME_RE = /gears[ _-]*of[ _-]*war[ _-]*2/i;
const HOLLOW_EXES = [['Binaries', 'GearGame.exe'], ['Binaries', 'Win32', 'GearGame.exe'], ['GearGame', 'Binaries', 'GearGame.exe']];
const XEX_FOLDERS = ['', 'game', 'assets', 'content', 'base'];
const MAX_CONFIG_BYTES = 128 * 1024;
const MAX_POINTER_BYTES = 4096;
const MAX_MOD_ROOTS = 64;
const REEOT_INSTALL_KEY = 'Software/reeot/Install';

const PORT_EXES = new Set(PORTS.flatMap((port) => port.exes));
const NATIVE_EXES = new Set(PORTS.flatMap((port) => port.native || []));
const isPortExe = (name) => PORT_EXES.has(String(name).toLowerCase());
const isAppImageOf = (prefixes, lower) => lower.endsWith('.appimage') && prefixes.some((prefix) => lower.startsWith(prefix));
const APPIMAGE_PREFIXES = PORTS.flatMap((port) => port.appImages || []);
// A Linux build: its bare binary, or its AppImage whatever version its file name carries.
const isNativePortExe = (name) => {
  const lower = String(name).toLowerCase();
  return NATIVE_EXES.has(lower) || isAppImageOf(APPIMAGE_PREFIXES, lower);
};

// How `lower` runs the port: 'windows', 'native', 'appimage', or '' when it is not one of its programs.
function exeKind(port, lower) {
  if (port.exes.includes(lower)) return 'windows';
  if ((port.native || []).includes(lower)) return 'native';
  return isAppImageOf(port.appImages || [], lower) ? 'appimage' : '';
}

function hasMagic(file, magic) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(magic.length);
    return fs.readSync(fd, head, 0, magic.length, 0) === magic.length && head.equals(magic);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// A port executable is a real program, not any file wearing its name.
const isProgram = (file) => hasMagic(file, Buffer.from('MZ', 'latin1'));
const isNativeProgram = (file) => hasMagic(file, Buffer.from([0x7f, 0x45, 0x4c, 0x46]));

const readAll = (dir) => fs.readdirSync(dir, { withFileTypes: true });

// A folder's entries through `read`, the scan's memoised reader when the caller has one; [] when unreadable.
function entriesOf(dir, read = readAll) {
  try {
    return read(dir) || [];
  } catch {
    return [];
  }
}

const subfolders = (dir, read) => (dir ? entriesOf(dir, read).filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name)) : []);

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// `name` inside `dir` as the disk spells it: Linux folders are case-sensitive.
function childPath(dir, name, wantDirectory, read) {
  const lower = name.toLowerCase();
  const hit = entriesOf(dir, read).find((entry) => entry.name.toLowerCase() === lower && (wantDirectory ? entry.isDirectory() : entry.isFile()));
  return hit ? path.join(dir, hit.name) : '';
}

// A folder path such as 'game/disc1' as the disk spells it, or ''.
function nestedDirectory(root, relative, read) {
  let dir = root;
  for (const part of relative.split('/')) {
    dir = dir && childPath(dir, part, true, read);
  }
  return dir;
}

// A small settings file's text, '' when it is missing, linked or too large to be one.
function readSmallText(file, maxBytes) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return '';
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return '';
  }
}

const firstLine = (file) => readSmallText(file, MAX_POINTER_BYTES).split(/\r?\n/, 1)[0].trim();

// A TOML string value (`key = 'literal'` or `key = "basic"`), '' when the key is not set.
function readTomlString(file, key) {
  const text = readSmallText(file, MAX_CONFIG_BYTES);
  const match = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(?:'([^'\\r\\n]*)'|"((?:[^"\\\\\\r\\n]|\\\\.)*)")`, 'm').exec(text);
  if (!match) return '';
  return (match[1] !== undefined ? match[1] : match[2].replace(/\\(["\\])/g, '$1')).trim();
}

const isRooted = (value) => /^(?:[a-z]:|[\\/])/i.test(value);

// A path read from a port's own file: rooted ones through the host, relative ones as written.
function localPointerPath(value, toLocal) {
  if (!value || value.includes('\0')) return '';
  return isRooted(value) ? toLocal(value) : value.replace(/\\/g, '/');
}

// The default.xex a port's pointer file (game-path.txt) names, as a folder or as the file itself.
function pointedXexFiles(install, port, toLocal, read) {
  const pointer = port.pointer && childPath(install, port.pointer, false, read);
  const local = pointer ? localPointerPath(firstLine(pointer), toLocal) : '';
  if (!local || !allowedFromConfig(local, pointer)) return [];
  const target = path.resolve(install, local);
  if (path.basename(target).toLowerCase() === 'default.xex') return [target];
  return [path.join(target, 'default.xex'), path.join(target, 'disc1', 'default.xex')];
}

function xexCandidates(install, ports, toLocal, read) {
  const files = ports.flatMap((port) => pointedXexFiles(install, port, toLocal, read));
  const folders = [...new Set([...ports.flatMap((port) => port.xexFolders || []), ...XEX_FOLDERS])];
  for (const folder of folders) {
    const dir = folder ? nestedDirectory(install, folder, read) : install;
    const file = dir && childPath(dir, 'default.xex', false, read);
    if (file) files.push(file);
  }
  return files;
}

function findXex(install, ports, ctx) {
  for (const file of xexCandidates(install, ports, ctx.toLocal || ((value) => value), ctx.readDirectory)) {
    const titleId = ctx.readTitleId(file);
    if (titleId) return { file, titleId };
  }
  return null;
}

/*
  The port an install is, from its executables, the companions some builds ship beside them and,
  when it has one, its default.xex: { port, exe, kind, titleId, xex }, { skip } when the two
  disagree or the region cannot be told, or null.
*/
function choosePort(install, exeNames, ctx) {
  const lowered = exeNames.map((name) => [name.toLowerCase(), name]);
  const exeOf = (port) => lowered.find(([lower]) => exeKind(port, lower));
  const companionsHere = (port) => !port.companions || port.companions.some((name) => childPath(install, name, false, ctx.readDirectory));
  const candidates = PORTS.filter((port) => exeOf(port) && companionsHere(port));
  if (!candidates.length) return null;
  const xex = findXex(install, candidates, ctx);
  const chosen = xex ? candidates.filter((port) => port.titleIds.includes(xex.titleId)) : candidates;
  if (!chosen.length) return { skip: `its default.xex is title ${xex.titleId}, which none of its executables plays` };
  const titleIds = new Set(xex ? [xex.titleId] : chosen.flatMap((port) => port.titleIds));
  if (titleIds.size > 1) return { skip: 'its region needs the game data (default.xex) to be told' };
  const port = chosen[0];
  const [lower, name] = exeOf(port);
  return { port, exe: path.join(install, name), kind: exeKind(port, lower), titleId: [...titleIds][0], xex: xex ? xex.file : '' };
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

const stem = (file) => path.basename(file).replace(/\.(?:exe|appimage)$/i, '');

// ReXGlue's default parent folder: Documents, or XDG data for a Linux build.
function rexUserFolder(install, ctx) {
  if (ctx.native) return ctx.xdg ? ctx.xdg.data : '';
  return ctx.documentsFor(install) || '';
}

// A %VARIABLE% this host does not define makes the whole value unknown: null.
function expandVariables(text, envVar) {
  let missing = false;
  const expanded = text.replace(/%([^%]+)%/g, (whole, name) => {
    const value = envVar(name);
    if (!value) missing = true;
    return value || whole;
  });
  return missing ? null : expanded;
}

// The game runs from <release>/resources/runtime and its launcher, in the release root, shares its name.
function releaseUserFolder(install, read) {
  if (path.basename(install).toLowerCase() === 'runtime') return '../userdata';
  return childPath(install, 'resources', true, read) ? 'resources/userdata' : 'userdata';
}

// The save folder a port's settings file names (gow2_save_dir), relative to that file's folder.
function settingRoot(port, install, ctx) {
  const [fileName, key] = port.saveSetting;
  const file = childPath(install, fileName, false, ctx.readDirectory);
  const value = file ? readTomlString(file, key) : '';
  if (!value) return null;
  const expanded = expandVariables(value, ctx.envVar);
  if (expanded === null) {
    ctx.log(`${port.name}: ${key} names a variable unknown here; its default save folder is watched`);
    return null;
  }
  const local = localPointerPath(expanded, ctx.toLocal);
  if (!local || !allowedFromConfig(local, file)) return null;
  const root = path.resolve(install, local);
  return { root, pendingRoot: path.dirname(root) };
}

// The folder the port saves under ({ root, pendingRoot }), or { skip }.
function userRootFor(port, choice, install, ctx) {
  const userFolder = port.release ? releaseUserFolder(install, ctx.readDirectory) : port.userFolder;
  const beside = (folder) => {
    const root = path.resolve(install, folder || '');
    return { root, pendingRoot: path.dirname(root) };
  };
  if (port.fixed) return beside(userFolder);
  if (port.portable && childPath(install, port.portable[0], false, ctx.readDirectory)) return beside(port.portable[1]);
  const declared = ctx.declaredUserRoot(install, [path.basename(choice.exe)]);
  if (declared && declared.root) return { root: declared.root, pendingRoot: path.dirname(declared.root) };
  if (declared) ctx.log(`${port.name}: a launcher beside it ${declared.computed ? 'works out its save folder at run time' : 'names several save folders'}; the default one is watched`);
  if (port.layout === 'user') return beside(userFolder);
  const setting = port.saveSetting && settingRoot(port, install, ctx);
  if (setting) return setting;
  if (port.layout === 'localappdata') {
    const local = ctx.localAppDataFor(install);
    return local ? { root: path.join(local, ...port.app.split('/')), pendingRoot: local } : { skip: 'no LOCALAPPDATA folder is known for it' };
  }
  const base = rexUserFolder(install, ctx);
  if (!base) return { skip: `no ${ctx.native ? 'XDG data' : 'Documents'} folder is known for it` };
  return { root: path.join(base, port.app || stem(choice.exe)), pendingRoot: base };
}

/*
  The lists that exist among `extra` and one per profiles/<name> folder of `root` (`listIn` names
  a profile's list); `fallback` while none does, so the first profile's place is awaited.
*/
function profileTarget(format, root, { extra = [], listIn, fallback }, read) {
  const listed = subfolders(path.join(root, 'profiles'), read).map(listIn);
  const found = [...new Set([...extra, ...listed])].filter((file) => fs.existsSync(file));
  if (!found.length) found.push(fallback);
  return { format, file: found[0], profileFiles: found, pendingRoot: root };
}

// Every list a port may keep, all watched and merged; the first that exists names the entry.
function listsTarget(format, files, pendingRoot) {
  const unique = [...new Set(files)];
  return { format, file: unique.find((file) => fs.existsSync(file)) || unique[0], profileFiles: unique, pendingRoot };
}

const tomlIn = (titleId) => (dir) => path.join(dir, 'achievements', `${titleId}.toml`);

function profilesTarget(choice, install, ctx) {
  const listIn = tomlIn(choice.titleId);
  return profileTarget('toml', install, { listIn, fallback: listIn(path.join(install, 'profiles', 'default')) }, ctx.readDirectory);
}

// Beside the program when its folder is writable; an AppImage, a Flatpak or a read-only Linux install uses XDG.
function earnedIniTarget(choice, install, ctx) {
  const main = path.join(install, 'profile', 'achievements.ini');
  const linux = ctx.native && ctx.xdg ? choice.port.linux.saves(ctx.xdg) : [];
  const fallback = choice.kind === 'appimage' && linux.length ? linux[0] : main;
  return profileTarget('ini-earned', install, { extra: [main, ...linux], listIn: (profile) => path.join(profile, 'achievements.ini'), fallback }, ctx.readDirectory);
}

// Perfect Dark Zero's first profile is the user folder itself; the others sit in its profiles/<id>.
function documentsProfileTarget(where, titleId, read) {
  const listIn = tomlIn(titleId);
  const main = listIn(where.root);
  return { ...profileTarget('toml', where.root, { extra: [main], listIn, fallback: main }, read), pendingRoot: where.pendingRoot };
}

function unleashedTarget(choice, install, ctx) {
  const { port } = choice;
  const fileIn = (root) => path.join(root, 'save', port.achFile || 'ACH-DATA');
  if (fs.existsSync(path.join(install, 'portable.txt'))) return { format: 'unleashed', file: fileIn(install), records: port.records, pendingRoot: install };
  if (ctx.native) return ctx.xdg ? { ...listsTarget('unleashed', port.linux.saves(ctx.xdg), ctx.xdg.home), records: port.records } : { skip: 'no home folder is known for it' };
  const appData = ctx.appDataFor(install);
  if (!appData) return { skip: 'no APPDATA folder is known for it' };
  return { format: 'unleashed', file: fileIn(path.join(appData, port.appFolder || 'UnleashedRecomp')), records: port.records, pendingRoot: appData };
}

function renutTarget(choice, install, ctx) {
  const config = readRenutConfig(path.join(install, 'renut.cfg'), ctx.toLocal);
  // Until the wizard has run there is no save folder to name: pending, and quiet about it.
  if (!config) return { format: 'toml', pendingRoot: install };
  const root = config.user_data_root;
  return { format: 'toml', file: path.join(root, 'achievements', `${choice.titleId}.toml`), pendingRoot: path.dirname(root) };
}

// The save folder a game root's saves.path names, relative to that root; '' without one.
function markedSaveRoot(root, ctx) {
  const marker = childPath(root, 'saves.path', false, ctx.readDirectory);
  const local = marker ? localPointerPath(firstLine(marker), ctx.toLocal) : '';
  return local && allowedFromConfig(local, marker) ? path.resolve(root, local) : '';
}

// OpenJam: one list per game root, a root without saves.path keeping ReXGlue's default folder.
function savesPathTarget(choice, install, ctx) {
  const base = rexUserFolder(install, ctx);
  const fallback = base ? path.join(base, choice.port.app) : '';
  const roots = [install, ...subfolders(childPath(install, 'mods', true, ctx.readDirectory), ctx.readDirectory).slice(0, MAX_MOD_ROOTS)];
  const saveRoots = roots.map((root) => markedSaveRoot(root, ctx) || fallback).filter(Boolean);
  if (!saveRoots.length) return { skip: 'no Documents folder is known for it' };
  return listsTarget('toml', saveRoots.map(tomlIn(choice.titleId)), saveRoots[0] === fallback ? base : install);
}

// The install root EdgeOfTimeRecomp's installer recorded, as a local path, or ''.
function recordedReeotRoot(install, ctx) {
  const value = ctx.native
    ? ctx.xdg && readTomlString(path.join(ctx.xdg.config, 'reeot', 'install.toml'), 'install_root')
    : ctx.regValue('HKCU', REEOT_INSTALL_KEY, 'InstallRoot');
  const local = typeof value === 'string' && value ? ctx.toLocal(value) : '';
  return local && path.isAbsolute(local) && allowedFromConfig(local, install) ? path.normalize(local) : '';
}

// Its recorded install root, else beside the program; an AppImage defaults to XDG data.
function reeotTarget(choice, install, ctx) {
  const roots = [recordedReeotRoot(install, ctx), install];
  if (ctx.native && ctx.xdg) roots.push(path.join(ctx.xdg.data, 'EdgeOfTimeRecompiled'));
  const [home, ...others] = [...new Set(roots.filter((root) => root && isDirectory(root)))];
  const listIn = tomlIn(choice.titleId);
  const extra = others.flatMap((root) => subfolders(path.join(root, 'profiles'), ctx.readDirectory).map(listIn));
  return profileTarget('toml', home, { extra, listIn, fallback: listIn(path.join(home, 'profiles', 'default')) }, ctx.readDirectory);
}

const PINYON_STATE_VARIABLE = 'PINYON_SHIFT_STATE_ROOT';
const PINYON_PROFILE_RE = /^user-/i;

/*
  Where Pinyon Shift keeps its state: the folder its variable names, the launcher's .local/preview
  of the release source the program was built in (<source>/out/build/<preset>), else a folder
  beside the program. All are watched: a portable launcher ignores the variable.
*/
function pinyonStateRoots(install, ctx) {
  const named = ctx.envVar(PINYON_STATE_VARIABLE);
  const local = named ? ctx.toLocal(named) : '';
  const build = path.dirname(install);
  const built = path.basename(build).toLowerCase() === 'build' && path.basename(path.dirname(build)).toLowerCase() === 'out';
  const derived = built ? path.join(path.dirname(path.dirname(build)), '.local', 'preview') : path.join(install, 'pinyon_shift_state');
  return [...new Set([local && path.isAbsolute(local) ? path.normalize(local) : '', derived].filter(Boolean))];
}

// <state>/user, and the user-modded / user-<profile> folders a mod or a cheat plays in.
function pinyonTarget(choice, install, ctx) {
  const roots = pinyonStateRoots(install, ctx);
  const profiles = roots.flatMap((root) => subfolders(root, ctx.readDirectory).filter((dir) => PINYON_PROFILE_RE.test(path.basename(dir))));
  const folders = [...roots.map((root) => path.join(root, 'user')), ...profiles];
  return listsTarget('toml', folders.map(tomlIn(choice.titleId)), path.dirname(roots[0]));
}

/*
  Estacado keeps its lists in Saved Games\Estacado\content\achievements; portable.txt, a machine
  without a Saved Games folder and a 0.9.0 save not yet moved keep them in <game>\runtime_data.
  shortcut: Saved Games is taken as %USERPROFILE%\Saved Games, not the shell folder; revisit if it is redirected.
*/
function estacadoTarget(choice, install, ctx) {
  const listIn = (root) => path.join(root, 'content', 'achievements', `${choice.titleId}.toml`);
  const inGame = listIn(path.join(install, 'runtime_data'));
  const profile = ctx.envVar('USERPROFILE');
  if (!profile || childPath(install, 'portable.txt', false, ctx.readDirectory)) return { format: 'toml', file: inGame, pendingRoot: install };
  return listsTarget('toml', [listIn(path.join(profile, 'Saved Games', 'Estacado')), inGame], profile);
}

// Lists a port also keeps outside its main folder: an older version's, a fallback folder, its mods', its launcher's other profiles.
function extraLists(port, titleId, install, ctx, userRoot) {
  const listIn = tomlIn(titleId);
  const base = rexUserFolder(install, ctx);
  const local = ctx.native ? '' : ctx.localAppDataFor(install);
  const files = port.legacy && base ? [listIn(path.join(base, port.legacy))] : [];
  if (port.localFallback && local) files.push(listIn(path.join(local, ...port.localFallback.split('/'))));
  if (port.mods) files.push(...subfolders(path.join(userRoot, port.mods), ctx.readDirectory).slice(0, MAX_MOD_ROOTS).map((mod) => listIn(path.join(mod, 'userdata'))));
  const bases = [base, local].filter(Boolean);
  for (const folder of port.profileFolders || []) {
    for (const root of bases) files.push(...subfolders(path.join(root, folder), ctx.readDirectory).map(listIn));
  }
  return files;
}

const LAYOUTS = Object.freeze({
  profiles: profilesTarget,
  unleashed: unleashedTarget,
  renut: renutTarget,
  'earned-ini': earnedIniTarget,
  'saves-path': savesPathTarget,
  reeot: reeotTarget,
  pinyon: pinyonTarget,
  estacado: estacadoTarget,
});

function layoutTarget(choice, install, ctx) {
  const { port, titleId } = choice;
  if (LAYOUTS[port.layout]) return LAYOUTS[port.layout](choice, install, ctx);
  const where = userRootFor(port, choice, install, ctx);
  if (where.skip) return where;
  if (port.layout === 'tsv') return { format: 'tsv', dir: path.join(where.root, 'Achievements', titleId), pendingRoot: where.pendingRoot };
  if (port.profiles) return documentsProfileTarget(where, titleId, ctx.readDirectory);
  const main = tomlIn(titleId)(where.root);
  const extra = extraLists(port, titleId, install, ctx, where.root);
  return extra.length ? listsTarget('toml', [main, ...extra], where.pendingRoot) : { format: 'toml', file: main, pendingRoot: where.pendingRoot };
}

/*
  The unlock-list target of a port installed in `install`, shaped like the ones discovery finds on
  disk, with `pending` set while the list does not exist yet. { skip } says why it is not listed.
*/
function resolvePort(install, exeNames, ctx) {
  const choice = choosePort(install, exeNames, ctx);
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
    ...(choice.port.idAliases ? { idAliases: choice.port.idAliases } : {}),
  };
}

// The XDG folders a Linux build reads; `flatpak(id, kind)` is a Flatpak's own data or config.
function xdgFolders({ home, data, config }) {
  return {
    home,
    data: data || path.join(home, '.local', 'share'),
    config: config || path.join(home, '.config'),
    flatpak: (id, kind) => path.join(home, '.var', 'app', id, kind),
  };
}

/*
  The Linux builds that save outside any game folder, found by their save files without the user
  pointing at their install. An installed Flatpak not played yet waits for its file.
*/
function linuxSaveTargets(xdg) {
  const targets = [];
  for (const port of PORTS.filter((entry) => entry.linux)) {
    const saves = port.linux.saves(xdg);
    const sandbox = xdg.flatpak(port.linux.flatpak, '');
    const found = saves.find((file) => fs.existsSync(file));
    if (!found && !isDirectory(sandbox)) continue;
    const awaited = saves.find((file) => file.startsWith(sandbox)) || saves[0];
    const format = port.layout === 'earned-ini' ? 'ini-earned' : 'unleashed';
    const records = port.records ? { records: port.records } : {};
    targets.push({ format, file: found || awaited, profileFiles: saves, ...records, titleId: port.titleIds[0], port: port.name, folder: port.name, pendingRoot: xdg.home, pending: !found });
  }
  return targets;
}

// Hollow ships GearGame's own layout and executable rather than a recompiled one: its exe, or ''.
function isHollowInstall(dir, read) {
  if (!HOLLOW_NAME_RE.test(path.basename(dir)) || !childPath(dir, 'GearGame', true, read)) return '';
  return HOLLOW_EXES.map((parts) => path.join(dir, ...parts)).find(isProgram) || '';
}

function hollowTarget(install, gearGame, read) {
  const saveData = childPath(gearGame, 'SaveData', true, read) || path.join(gearGame, 'SaveData');
  const file = childPath(saveData, 'Achievements.json', false, read) || path.join(saveData, 'Achievements.json');
  // No title id on the target: the JSON shape is keyed by its folder, and must stay so once it exists.
  return { format: 'json', file, knownTitleId: HOLLOW.titleId, port: HOLLOW.name, pendingRoot: install, pending: !fs.existsSync(file) };
}

module.exports = {
  PORTS,
  isPortExe,
  isNativePortExe,
  isProgram,
  isNativeProgram,
  isHollowInstall,
  hollowTarget,
  resolvePort,
  childPath,
  isDirectory,
  xdgFolders,
  linuxSaveTargets,
};
